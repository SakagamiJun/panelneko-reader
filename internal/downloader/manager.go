package downloader

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/copymanga"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/klz9"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

var sanitizeFilenameRe = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1F]`)

var bufferPool = sync.Pool{
	New: func() any {
		b := make([]byte, 64*1024)
		return &b
	},
}

var pageBufferPool = sync.Pool{
	New: func() any {
		b := make([]byte, 0, 256*1024)
		return bytes.NewBuffer(b)
	},
}

func SanitizeFilename(name string) string {
	clean := sanitizeFilenameRe.ReplaceAllString(name, "_")
	clean = strings.TrimSpace(clean)
	if clean == "" {
		return "Untitled"
	}
	return clean
}

type runningTask struct {
	cancel context.CancelFunc
}

type Manager struct {
	store              *store.SQLiteStore
	settings           *settings.Service
	copyManga          *copymanga.Client
	klz9               *klz9.Client
	chapterSem         chan struct{}
	imgSem             chan struct{}
	running            map[string]*runningTask
	mu                 sync.RWMutex
	emitter            func(eventName string, payload any)
	onDownloadFinished func(outputPath string)
	totalBytesSec      atomic.Uint64
	speedFormatted     atomic.Pointer[string]
	bytesPerSec        atomic.Uint64
	stopTicker         chan struct{}
}

func NewManager(
	storeValue *store.SQLiteStore,
	settingsService *settings.Service,
	copyClient *copymanga.Client,
	klz9Client *klz9.Client,
) *Manager {
	st := settingsService.Get()
	maxChapter := st.Downloader.MaxConcurrentDownloads
	if maxChapter <= 0 {
		maxChapter = 3
	}
	maxImg := st.Downloader.MaxImageConcurrency
	if maxImg <= 0 {
		maxImg = 10
	}

	mgr := &Manager{
		store:      storeValue,
		settings:   settingsService,
		copyManga:  copyClient,
		klz9:       klz9Client,
		chapterSem: make(chan struct{}, maxChapter),
		imgSem:     make(chan struct{}, maxImg),
		running:    make(map[string]*runningTask),
		stopTicker: make(chan struct{}),
	}
	emptyStr := ""
	mgr.speedFormatted.Store(&emptyStr)
	go mgr.speedMonitorLoop()

	return mgr
}

func (m *Manager) Close() {
	select {
	case <-m.stopTicker:
	default:
		close(m.stopTicker)
	}
}

func (m *Manager) speedMonitorLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopTicker:
			return
		case <-ticker.C:
			secBytes := m.totalBytesSec.Swap(0)
			m.bytesPerSec.Store(secBytes)

			m.mu.RLock()
			activeCount := len(m.running)
			m.mu.RUnlock()

			if activeCount > 0 && secBytes > 0 {
				mb := float64(secBytes) / (1024.0 * 1024.0)
				str := fmt.Sprintf("%.2f MB/s", mb)
				m.speedFormatted.Store(&str)
				m.emitProgress()
			} else if activeCount > 0 {
				str := "0.00 MB/s"
				m.speedFormatted.Store(&str)
				m.emitProgress()
			} else {
				empty := ""
				m.speedFormatted.Store(&empty)
			}
		}
	}
}

func (m *Manager) SetEmitter(fn func(eventName string, payload any)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emitter = fn
}

func (m *Manager) SetOnDownloadFinished(fn func(outputPath string)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onDownloadFinished = fn
}

func (m *Manager) emit(event string, payload any) {
	m.mu.RLock()
	fn := m.emitter
	m.mu.RUnlock()
	if fn != nil {
		fn(event, payload)
	}
}

func (m *Manager) GetTasks() ([]contracts.DownloadTask, error) {
	return m.store.GetDownloadTasks()
}

func (m *Manager) CreateTasks(inputs []contracts.CreateDownloadTaskInput) ([]contracts.DownloadTask, error) {
	existing, err := m.store.GetDownloadTasks()
	if err != nil {
		return nil, err
	}
	existMap := make(map[string]contracts.DownloadTask)
	for _, t := range existing {
		existMap[t.ChapterID] = t
	}

	now := time.Now().UTC().Format(time.RFC3339)
	var created []contracts.DownloadTask

	for _, in := range inputs {
		taskID := fmt.Sprintf("%s-%s", in.Source, in.ChapterID)
		if old, ok := existMap[in.ChapterID]; ok {
			if old.Status == contracts.DownloadStatusDownloading || old.Status == contracts.DownloadStatusPending {
				continue
			}
		}

		targetSrcID := in.TargetSourceID
		if strings.TrimSpace(targetSrcID) == "" {
			targetSrcID = m.settings.Get().Downloader.TargetSourceID
		}

		task := contracts.DownloadTask{
			ID:              taskID,
			Source:          in.Source,
			MangaID:         in.MangaID,
			MangaTitle:      in.MangaTitle,
			MangaCoverURL:   in.MangaCoverURL,
			ChapterID:       in.ChapterID,
			ChapterTitle:    in.ChapterTitle,
			ChapterNumber:   in.ChapterNumber,
			ChapterGroup:    in.ChapterGroup,
			TargetSourceID:  targetSrcID,
			Status:          contracts.DownloadStatusPending,
			TotalPages:      0,
			DownloadedPages: 0,
			CreatedAt:       now,
			UpdatedAt:       now,
		}

		if err := m.store.SaveDownloadTask(task); err != nil {
			return nil, err
		}
		created = append(created, task)
		go m.startWorker(task)
	}

	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
	return created, nil
}

func (m *Manager) startWorker(task contracts.DownloadTask) {
	m.mu.Lock()
	if _, isRunning := m.running[task.ID]; isRunning {
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.running[task.ID] = &runningTask{cancel: cancel}
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.running, task.ID)
		m.mu.Unlock()
		m.emit(contracts.EventDownloadTasksUpdated, nil)
		m.emitProgress()
	}()

	select {
	case m.chapterSem <- struct{}{}:
		defer func() { <-m.chapterSem }()
	case <-ctx.Done():
		return
	}

	if ctx.Err() != nil {
		return
	}

	_ = m.store.UpdateDownloadTaskStatus(task.ID, contracts.DownloadStatusDownloading, "")
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()

	err := m.executeDownload(ctx, task)
	if err != nil {
		if ctx.Err() != nil {
			_ = m.store.UpdateDownloadTaskStatus(task.ID, contracts.DownloadStatusPaused, "")
		} else {
			latest, found, _ := m.store.GetDownloadTask(task.ID)
			if found && latest.Status == contracts.DownloadStatusWaitingSource {
				// Keep waiting_source status
			} else {
				_ = m.store.UpdateDownloadTaskStatus(task.ID, contracts.DownloadStatusFailed, err.Error())
			}
		}
	} else {
		_ = m.store.UpdateDownloadTaskStatus(task.ID, contracts.DownloadStatusCompleted, "")
		interval := m.settings.Get().Downloader.ChapterIntervalSec
		if interval > 0 && ctx.Err() == nil {
			select {
			case <-time.After(time.Duration(interval) * time.Second):
			case <-ctx.Done():
			}
		}
	}
}

func (m *Manager) resolveTargetDirectory(task contracts.DownloadTask) (string, error) {
	st := m.settings.Get()
	targetSrcID := task.TargetSourceID
	if strings.TrimSpace(targetSrcID) == "" {
		targetSrcID = st.Downloader.TargetSourceID
	}

	var targetSource contracts.LibrarySource
	found := false
	for _, src := range st.LibrarySources {
		if src.ID == targetSrcID {
			targetSource = src
			found = true
			break
		}
	}
	if !found && len(st.LibrarySources) > 0 {
		targetSource = st.LibrarySources[0]
		found = true
	}

	if !found {
		base := st.Downloader.DownloadDir
		if base == "" {
			base = filepath.Join(st.LibraryRoot, "Downloads")
		}
		return base, nil
	}

	// Health check target library source accessibility (handles offline NAS or unmounted drive)
	fi, err := os.Stat(targetSource.Path)
	if err != nil || !fi.IsDir() {
		return "", fmt.Errorf("target library source '%s' (%s) is offline or unreachable: %w", targetSource.Name, targetSource.Path, err)
	}

	if st.Downloader.DownloadSubPath != "" {
		return filepath.Join(targetSource.Path, st.Downloader.DownloadSubPath), nil
	}
	return targetSource.Path, nil
}

func (m *Manager) executeDownload(ctx context.Context, task contracts.DownloadTask) error {
	st := m.settings.Get()
	downloadBaseDir, err := m.resolveTargetDirectory(task)
	if err != nil {
		_ = m.store.UpdateDownloadTaskStatus(task.ID, contracts.DownloadStatusWaitingSource, err.Error())
		m.emit(contracts.EventDownloadTasksUpdated, nil)
		m.emitProgress()
		return err
	}

	safeManga := SanitizeFilename(task.MangaTitle)
	safeChapter := SanitizeFilename(task.ChapterTitle)
	safeGroup := SanitizeFilename(task.ChapterGroup)
	if strings.EqualFold(safeGroup, "default") {
		safeGroup = ""
	}

	var chapterDir string
	if safeGroup != "" {
		chapterDir = filepath.Join(downloadBaseDir, safeManga, safeGroup)
	} else {
		chapterDir = filepath.Join(downloadBaseDir, safeManga)
	}

	var finalFilePath string
	format := st.Downloader.DownloadFormat
	if format == "folder" {
		finalFilePath = filepath.Join(chapterDir, FormatChapterFilename(task.ChapterNumber, safeChapter, ""))
	} else {
		finalFilePath = filepath.Join(chapterDir, FormatChapterFilename(task.ChapterNumber, safeChapter, ".cbz"))
	}

	var pageURLs []string

	if task.Source == copymanga.SiteName {
		pageURLs, err = m.copyManga.GetChapterImageURLs(ctx, task.MangaID, task.ChapterID)
	} else if task.Source == klz9.SiteName {
		pageURLs, err = m.klz9.GetChapterPages(ctx, task.ChapterID)
	} else {
		return fmt.Errorf("unknown downloader source: %s", task.Source)
	}

	if err != nil {
		return fmt.Errorf("fetch chapter pages: %w", err)
	}

	totalPages := len(pageURLs)
	if totalPages == 0 {
		return fmt.Errorf("no pages found for chapter")
	}

	_ = m.store.UpdateDownloadTaskProgress(task.ID, 0, totalPages, "")
	m.emitProgress()

	// Download images stream directly into CBZ
	var xmlMetadata []byte
	if task.Source == copymanga.SiteName {
		xmlMetadata, _ = m.copyManga.BuildComicInfoXML(task.MangaTitle, task.ChapterTitle, "", "", task.ChapterNumber, totalPages)
	}

	downloadedCount := atomic.Int32{}
	startTime := time.Now()
	var totalBytes atomic.Uint64

	fetchImage := func(pCtx context.Context, pageIndex int, writer io.Writer) error {
		select {
		case m.imgSem <- struct{}{}:
			defer func() { <-m.imgSem }()
		case <-pCtx.Done():
			return pCtx.Err()
		}

		rawURL := pageURLs[pageIndex]
		var dlErr error
		countWriter := &countingWriter{w: writer, written: &totalBytes, manager: m}

		if task.Source == copymanga.SiteName {
			stripedURL := m.copyManga.GetStripedCDNURL(rawURL, pageIndex)
			dlErr = m.copyManga.DownloadImageStream(pCtx, stripedURL, countWriter)
		} else {
			// KLZ9 direct image download
			dlErr = downloadDirectImage(pCtx, rawURL, countWriter)
		}

		if dlErr != nil {
			return dlErr
		}

		curr := int(downloadedCount.Add(1))
		var speedStr string
		if p := m.speedFormatted.Load(); p != nil && *p != "" {
			speedStr = *p
		} else {
			elapsed := time.Since(startTime).Seconds()
			if elapsed > 0 {
				speedMB := (float64(totalBytes.Load()) / 1024.0 / 1024.0) / elapsed
				speedStr = fmt.Sprintf("%.2f MB/s", speedMB)
			}
		}

		_ = m.store.UpdateDownloadTaskProgress(task.ID, curr, totalPages, speedStr)
		m.emitProgress()
		return nil
	}

	if format == "folder" {
		if err := os.MkdirAll(finalFilePath, 0o755); err != nil {
			return fmt.Errorf("create chapter dir: %w", err)
		}
		for i := 0; i < totalPages; i++ {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			imgFile := filepath.Join(finalFilePath, fmt.Sprintf("%03d.webp", i+1))
			// Resume already downloaded valid pages in folder mode
			if fi, err := os.Stat(imgFile); err == nil && fi.Size() > 0 {
				curr := int(downloadedCount.Add(1))
				_ = m.store.UpdateDownloadTaskProgress(task.ID, curr, totalPages, "")
				m.emitProgress()
				continue
			}

			f, fErr := os.Create(imgFile)
			if fErr != nil {
				return fErr
			}
			dlErr := fetchImage(ctx, i, f)
			_ = f.Close()
			if dlErr != nil {
				_ = os.Remove(imgFile)
				return dlErr
			}
		}
	} else {
		if err := copymanga.StreamSaveCBZ(finalFilePath, xmlMetadata, totalPages, fetchImage); err != nil {
			return err
		}
	}

	m.mu.RLock()
	hook := m.onDownloadFinished
	m.mu.RUnlock()
	if hook != nil {
		hook(finalFilePath)
	}

	return nil
}

type countingWriter struct {
	w       io.Writer
	written *atomic.Uint64
	manager *Manager
}

func (c *countingWriter) Write(p []byte) (n int, err error) {
	n, err = c.w.Write(p)
	if n > 0 {
		if c.written != nil {
			c.written.Add(uint64(n))
		}
		if c.manager != nil {
			c.manager.totalBytesSec.Add(uint64(n))
		}
	}
	return n, err
}

var directImageBackoffs = []time.Duration{15 * time.Second, 30 * time.Second}

func downloadDirectImage(ctx context.Context, imgURL string, w io.Writer) error {
	maxAttempts := len(directImageBackoffs) + 1
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			backoff := directImageBackoffs[attempt-1]
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, imgURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 PanelNeko/1.0")
		req.Header.Set("Referer", "https://klz9.com/")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode == http.StatusNotFound {
			_ = resp.Body.Close()
			return fmt.Errorf("direct image not found (404): %s", imgURL)
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			lastErr = fmt.Errorf("direct image status %d", resp.StatusCode)
			continue
		}

		pageBuf := pageBufferPool.Get().(*bytes.Buffer)
		pageBuf.Reset()

		buf := bufferPool.Get().(*[]byte)
		_, err = io.CopyBuffer(pageBuf, resp.Body, *buf)
		bufferPool.Put(buf)
		_ = resp.Body.Close()

		if err != nil {
			pageBufferPool.Put(pageBuf)
			lastErr = err
			continue
		}

		_, err = pageBuf.WriteTo(w)
		pageBufferPool.Put(pageBuf)
		if err != nil {
			return err
		}

		return nil
	}
	return fmt.Errorf("direct image failed after %d attempts: %w", maxAttempts, lastErr)
}

func (m *Manager) PauseTask(taskID string) error {
	m.mu.Lock()
	if rt, ok := m.running[taskID]; ok {
		rt.cancel()
		delete(m.running, taskID)
	}
	m.mu.Unlock()

	_ = m.store.UpdateDownloadTaskStatus(taskID, contracts.DownloadStatusPaused, "")
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
	return nil
}

func (m *Manager) ResumeTask(taskID string) error {
	t, found, err := m.store.GetDownloadTask(taskID)
	if err != nil || !found {
		return fmt.Errorf("task not found: %s", taskID)
	}

	_ = m.store.UpdateDownloadTaskStatus(taskID, contracts.DownloadStatusPending, "")
	go m.startWorker(t)
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
	return nil
}

func (m *Manager) CancelTask(taskID string) error {
	_ = m.PauseTask(taskID)
	err := m.store.DeleteDownloadTask(taskID)
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
	return err
}

func (m *Manager) ClearCompletedTasks() error {
	err := m.store.ClearCompletedDownloadTasks()
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
	return err
}

func (m *Manager) ResumeWaitingTasks(sourceID string) {
	tasks, err := m.store.GetDownloadTasks()
	if err != nil {
		return
	}
	resumedAny := false
	for _, t := range tasks {
		if t.Status == contracts.DownloadStatusWaitingSource {
			if sourceID == "" || t.TargetSourceID == sourceID || t.TargetSourceID == "" {
				dir, err := m.resolveTargetDirectory(t)
				if err == nil && dir != "" {
					_ = m.store.UpdateDownloadTaskStatus(t.ID, contracts.DownloadStatusPending, "")
					t.Status = contracts.DownloadStatusPending
					go m.startWorker(t)
					resumedAny = true
				}
			}
		}
	}
	if resumedAny {
		m.emit(contracts.EventDownloadTasksUpdated, nil)
		m.emitProgress()
	}
}

func (m *Manager) RetryTask(taskID string) error {
	t, found, err := m.store.GetDownloadTask(taskID)
	if err != nil || !found {
		return fmt.Errorf("task not found: %s", taskID)
	}

	_ = m.store.UpdateDownloadTaskStatus(taskID, contracts.DownloadStatusPending, "")
	t.Status = contracts.DownloadStatusPending
	go m.startWorker(t)
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
	return nil
}

func (m *Manager) GetProgress() contracts.DownloadProgress {
	tasks, err := m.store.GetDownloadTasks()
	if err != nil {
		return contracts.DownloadProgress{}
	}

	activeCount := 0
	downloadedPages := 0
	totalPages := 0

	for _, t := range tasks {
		if t.Status == contracts.DownloadStatusDownloading || t.Status == contracts.DownloadStatusPending {
			activeCount++
			downloadedPages += t.DownloadedPages
			totalPages += t.TotalPages
		}
	}

	speedStr := ""
	if p := m.speedFormatted.Load(); p != nil {
		speedStr = *p
	}

	return contracts.DownloadProgress{
		ActiveTasks:     activeCount,
		TotalTasks:      len(tasks),
		DownloadedPages: downloadedPages,
		TotalPages:      totalPages,
		SpeedFormatted:  speedStr,
		BytesPerSec:     float64(m.bytesPerSec.Load()),
	}
}

func (m *Manager) emitProgress() {
	p := m.GetProgress()
	m.emit(contracts.EventDownloadProgress, p)
}
