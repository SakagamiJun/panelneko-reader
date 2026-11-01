package downloader

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

var sanitizeFilenameRe = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1F]`)

func SanitizeFilename(name string) string {
	clean := sanitizeFilenameRe.ReplaceAllString(name, "_")
	clean = strings.TrimSpace(clean)
	if clean == "" {
		return "Untitled"
	}
	return clean
}

type runningTask struct {
	taskID     string
	cancel     context.CancelFunc
	downloaded atomic.Int32
	totalPages atomic.Int32
	terminal   atomic.Bool
}

type Manager struct {
	store                *store.SQLiteStore
	settings             *settings.Service
	providers            map[string]contracts.MangaProvider
	chapterSem           chan struct{}
	running              map[string]*runningTask
	mu                   sync.RWMutex
	notifyMu             sync.Mutex
	emitter              func(eventName string, payload any)
	onActiveTasksChanged func(activeCount int)
	totalBytesSec        atomic.Uint64
	speedFormatted       atomic.Pointer[string]
	bytesPerSec          atomic.Uint64
	stopTicker           chan struct{}
}

func NewManager(
	storeValue *store.SQLiteStore,
	settingsService *settings.Service,
	providers ...contracts.MangaProvider,
) *Manager {
	st := settingsService.Get()
	maxChapter := st.Downloader.MaxConcurrentDownloads
	if maxChapter <= 0 {
		maxChapter = 3
	}

	mgr := &Manager{
		store:      storeValue,
		settings:   settingsService,
		providers:  make(map[string]contracts.MangaProvider),
		chapterSem: make(chan struct{}, maxChapter),
		running:    make(map[string]*runningTask),
		stopTicker: make(chan struct{}),
	}
	for _, p := range providers {
		if p != nil {
			mgr.providers[p.ID()] = p
		}
	}
	emptyStr := ""
	mgr.speedFormatted.Store(&emptyStr)
	go mgr.speedMonitorLoop()

	return mgr
}

func (m *Manager) RegisterProvider(p contracts.MangaProvider) {
	if p == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.providers[p.ID()] = p
}

func (m *Manager) GetProvider(id string) (contracts.MangaProvider, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.providers[id]
	return p, ok
}

func (m *Manager) Close() {
	m.mu.Lock()
	m.onActiveTasksChanged = nil
	m.mu.Unlock()

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

			type taskSnap struct {
				id         string
				downloaded int
				totalPages int
			}
			var snapshots []taskSnap

			m.mu.RLock()
			activeCount := len(m.running)
			if activeCount > 0 {
				snapshots = make([]taskSnap, 0, activeCount)
				for _, rt := range m.running {
					if !rt.terminal.Load() {
						snapshots = append(snapshots, taskSnap{
							id:         rt.taskID,
							downloaded: int(rt.downloaded.Load()),
							totalPages: int(rt.totalPages.Load()),
						})
					}
				}
			}
			m.mu.RUnlock()

			if activeCount > 0 {
				var speedStr string
				if secBytes > 0 {
					mb := float64(secBytes) / (1024.0 * 1024.0)
					speedStr = fmt.Sprintf("%.2f MB/s", mb)
				} else {
					speedStr = "0.00 MB/s"
				}
				m.speedFormatted.Store(&speedStr)

				for _, s := range snapshots {
					if s.totalPages > 0 {
						_ = m.store.UpdateDownloadTaskProgress(s.id, s.downloaded, s.totalPages, speedStr)
					}
				}
				m.emit(contracts.EventDownloadTasksUpdated, nil)
				m.emitProgress()
			} else {
				empty := ""
				m.speedFormatted.Store(&empty)
			}
		}
	}
}

func (m *Manager) flushTaskFinalState(taskID string, downloaded int, totalPages int, status contracts.DownloadTaskStatus, errorMsg string) {
	m.mu.RLock()
	if rt, ok := m.running[taskID]; ok {
		rt.terminal.Store(true)
	}
	m.mu.RUnlock()

	if status == contracts.DownloadStatusCompleted {
		if totalPages > 0 {
			downloaded = totalPages
		}
	}
	if totalPages > 0 {
		_ = m.store.UpdateDownloadTaskProgress(taskID, downloaded, totalPages, "")
	}
	_ = m.store.UpdateDownloadTaskStatus(taskID, status, errorMsg)
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()
}

func (m *Manager) SetEmitter(fn func(eventName string, payload any)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emitter = fn
}

func (m *Manager) SetOnActiveTasksChanged(fn func(activeCount int)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onActiveTasksChanged = fn
}

func (m *Manager) notifyActiveTasks() {
	m.notifyMu.Lock()
	defer m.notifyMu.Unlock()

	m.mu.RLock()
	fn := m.onActiveTasksChanged
	count := len(m.running)
	m.mu.RUnlock()

	if fn != nil {
		fn(count)
	}
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

		chNum := in.ChapterNumber
		if chNum <= 0 {
			if semanticNum := ExtractChapterNumber(in.ChapterTitle, -1); semanticNum >= 0 {
				chNum = semanticNum
			}
		}

		task := contracts.DownloadTask{
			ID:              taskID,
			Source:          in.Source,
			MangaID:         in.MangaID,
			MangaTitle:      in.MangaTitle,
			MangaCoverURL:   in.MangaCoverURL,
			ChapterID:       in.ChapterID,
			ChapterTitle:    in.ChapterTitle,
			ChapterNumber:   chNum,
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
	rt := &runningTask{
		taskID: task.ID,
		cancel: cancel,
	}
	rt.downloaded.Store(int32(task.DownloadedPages))
	rt.totalPages.Store(int32(task.TotalPages))
	m.running[task.ID] = rt
	m.mu.Unlock()
	m.notifyActiveTasks()

	defer func() {
		m.mu.Lock()
		_, wasRunning := m.running[task.ID]
		delete(m.running, task.ID)
		m.mu.Unlock()
		m.emit(contracts.EventDownloadTasksUpdated, nil)
		m.emitProgress()
		if wasRunning {
			m.notifyActiveTasks()
		}
	}()

	select {
	case m.chapterSem <- struct{}{}:
		defer func() { <-m.chapterSem }()
	case <-ctx.Done():
		m.flushTaskFinalState(task.ID, int(rt.downloaded.Load()), int(rt.totalPages.Load()), contracts.DownloadStatusPaused, "")
		return
	}

	if ctx.Err() != nil {
		m.flushTaskFinalState(task.ID, int(rt.downloaded.Load()), int(rt.totalPages.Load()), contracts.DownloadStatusPaused, "")
		return
	}

	_ = m.store.UpdateDownloadTaskStatus(task.ID, contracts.DownloadStatusDownloading, "")
	m.emit(contracts.EventDownloadTasksUpdated, nil)
	m.emitProgress()

	err := m.executeDownload(ctx, rt, task)
	if err != nil {
		if ctx.Err() != nil {
			m.flushTaskFinalState(task.ID, int(rt.downloaded.Load()), int(rt.totalPages.Load()), contracts.DownloadStatusPaused, "")
		} else {
			latest, found, _ := m.store.GetDownloadTask(task.ID)
			if found && latest.Status == contracts.DownloadStatusWaitingSource {
				// Keep waiting_source status
			} else {
				m.flushTaskFinalState(task.ID, int(rt.downloaded.Load()), int(rt.totalPages.Load()), contracts.DownloadStatusFailed, err.Error())
			}
		}
	} else {
		m.flushTaskFinalState(task.ID, int(rt.downloaded.Load()), int(rt.totalPages.Load()), contracts.DownloadStatusCompleted, "")
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

func (m *Manager) executeDownload(ctx context.Context, rt *runningTask, task contracts.DownloadTask) error {
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

	provider, ok := m.GetProvider(task.Source)
	if !ok {
		return fmt.Errorf("unknown downloader source: %s", task.Source)
	}

	if task.ChapterID == "" && task.MangaID != "" {
		if chs, chErr := provider.GetMangaChapters(ctx, task.MangaID); chErr == nil {
			for _, ch := range chs {
				if ch.Number == task.ChapterNumber || (task.ChapterTitle != "" && ch.Title == task.ChapterTitle) {
					task.ChapterID = ch.ID
					_ = m.store.UpdateDownloadTaskChapterID(task.ID, ch.ID)
					break
				}
			}
		}
	}

	pageURLs, err := provider.GetChapterPages(ctx, task.MangaID, task.ChapterID)
	if err != nil {
		return fmt.Errorf("fetch chapter pages: %w", err)
	}

	totalPages := len(pageURLs)
	if totalPages == 0 {
		return fmt.Errorf("no pages found for chapter")
	}

	rt.totalPages.Store(int32(totalPages))
	_ = m.store.UpdateDownloadTaskProgress(task.ID, int(rt.downloaded.Load()), totalPages, "")
	m.emitProgress()

	// Build ComicInfo.xml metadata
	notesBytes, _ := json.Marshal(contracts.ComicInfoNotes{
		Source:    task.Source,
		MangaID:   task.MangaID,
		ChapterID: task.ChapterID,
	})
	notesStr := string(notesBytes)

	webURL := provider.ComicWebURL(task.MangaID)

	xmlMetadata, _ := BuildComicInfoXML(ComicInfoOptions{
		Series:          task.MangaTitle,
		Title:           task.ChapterTitle,
		Number:          task.ChapterNumber,
		PageCount:       totalPages,
		ScanInformation: task.ChapterGroup,
		Web:             webURL,
		Notes:           notesStr,
	})

	fetchImage := func(pCtx context.Context, pageIndex int, writer io.Writer) error {
		if err := pCtx.Err(); err != nil {
			return err
		}

		rawURL := pageURLs[pageIndex]
		countWriter := &countingWriter{w: writer, manager: m}

		dlErr := provider.DownloadImage(pCtx, rawURL, pageIndex, countWriter)
		if dlErr != nil {
			return dlErr
		}

		rt.downloaded.Add(1)
		return nil
	}

	if format == "folder" {
		if err := os.MkdirAll(finalFilePath, 0o755); err != nil {
			return fmt.Errorf("create chapter dir: %w", err)
		}
		if len(xmlMetadata) > 0 {
			_ = os.WriteFile(filepath.Join(finalFilePath, "ComicInfo.xml"), xmlMetadata, 0o644)
		}
		for i := 0; i < totalPages; i++ {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			// Resume already downloaded valid pages in folder mode
			if _, exists := findExistingPageFile(finalFilePath, i+1); exists {
				rt.downloaded.Add(1)
				continue
			}

			ext := DetectExtensionFromURL(pageURLs[i])
			if ext == "" {
				ext = ".webp"
			}
			imgFile := filepath.Join(finalFilePath, FormatPageFilename(i+1, ext))

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
		pageNamer := func(pageIndex int) string {
			var u string
			if pageIndex >= 0 && pageIndex < len(pageURLs) {
				u = pageURLs[pageIndex]
			}
			ext := DetectExtensionFromURL(u)
			if ext == "" {
				ext = ".webp"
			}
			return FormatPageFilename(pageIndex+1, ext)
		}
		if err := StreamSaveCBZ(finalFilePath, xmlMetadata, totalPages, fetchImage, pageNamer); err != nil {
			return err
		}
	}

	return nil
}

func findExistingPageFile(chapterDir string, pageNum int) (string, bool) {
	prefix := fmt.Sprintf("%03d", pageNum)
	for _, ext := range []string{".webp", ".jpg", ".png", ".jpeg", ".gif", ".avif"} {
		cand := filepath.Join(chapterDir, prefix+ext)
		if fi, err := os.Stat(cand); err == nil && fi.Size() > 0 {
			return cand, true
		}
	}
	return "", false
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

func (m *Manager) PauseTask(taskID string) error {
	m.mu.Lock()
	wasRunning := false
	var rt *runningTask
	if r, ok := m.running[taskID]; ok {
		if r.terminal.Load() {
			m.mu.Unlock()
			return nil
		}
		rt = r
		r.cancel()
		delete(m.running, taskID)
		wasRunning = true
	}
	m.mu.Unlock()

	if wasRunning {
		m.notifyActiveTasks()
		m.flushTaskFinalState(taskID, int(rt.downloaded.Load()), int(rt.totalPages.Load()), contracts.DownloadStatusPaused, "")
	} else {
		_ = m.store.UpdateDownloadTaskStatus(taskID, contracts.DownloadStatusPaused, "")
		m.emit(contracts.EventDownloadTasksUpdated, nil)
		m.emitProgress()
	}

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

	m.mu.RLock()
	runningSnaps := make(map[string]struct{ dl, tot int }, len(m.running))
	for id, rt := range m.running {
		if !rt.terminal.Load() {
			runningSnaps[id] = struct{ dl, tot int }{
				dl:  int(rt.downloaded.Load()),
				tot: int(rt.totalPages.Load()),
			}
		}
	}
	m.mu.RUnlock()

	activeCount := 0
	downloadedPages := 0
	totalPages := 0

	for _, t := range tasks {
		if t.Status == contracts.DownloadStatusDownloading || t.Status == contracts.DownloadStatusPending {
			activeCount++
			dl := t.DownloadedPages
			tot := t.TotalPages
			if snap, ok := runningSnaps[t.ID]; ok {
				if snap.dl > dl {
					dl = snap.dl
				}
				if snap.tot > tot {
					tot = snap.tot
				}
			}
			downloadedPages += dl
			totalPages += tot
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
