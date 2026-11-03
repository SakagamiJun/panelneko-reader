package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/crypto"
	"github.com/sakagamijun/panelneko-reader/internal/downloader"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/copymanga"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/klz9"
	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/sakagamijun/panelneko-reader/internal/logger"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

//go:embed build/config.yml
var wailsConfig embed.FS

var buildCommit string

func parseConfigInfo(data []byte) (version string, commit string) {
	inInfo := false
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "info:" {
			inInfo = true
			continue
		}
		if inInfo {
			if !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") && trimmed != "" {
				inInfo = false
				continue
			}
			if strings.HasPrefix(trimmed, "version:") {
				val := strings.TrimSpace(strings.TrimPrefix(trimmed, "version:"))
				version = strings.Trim(val, `"'`)
			}
			if strings.HasPrefix(trimmed, "commit:") {
				val := strings.TrimSpace(strings.TrimPrefix(trimmed, "commit:"))
				commit = strings.Trim(val, `"'`)
			}
		}
	}
	return version, commit
}

func (a *App) GetAppVersion() contracts.AppVersionInfo {
	version := "0.1.0"
	commit := buildCommit

	data, err := wailsConfig.ReadFile("build/config.yml")
	if err == nil {
		cfgVer, cfgCommit := parseConfigInfo(data)
		if cfgVer != "" {
			version = cfgVer
		}
		if commit == "" && cfgCommit != "" {
			commit = cfgCommit
		}
	}

	if commit == "" {
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, setting := range info.Settings {
				if setting.Key == "vcs.revision" {
					commit = setting.Value
					break
				}
			}
		}
	}

	commit = strings.TrimSpace(commit)
	if len(commit) > 7 {
		commit = commit[:7]
	}
	if commit == "" {
		commit = "dev"
	}

	return contracts.AppVersionInfo{
		Version: version,
		Commit:  commit,
	}
}

func resolveThumbnailQuality(st contracts.AppSettings) contracts.ThumbnailQuality {
	quality := st.ThumbnailQuality
	if quality == "" {
		if st.EnableThumbnailCache != nil && !*st.EnableThumbnailCache {
			return contracts.ThumbnailQualityOff
		}
		return contracts.ThumbnailQualityMedium
	}
	return quality
}

func matchPanelNekoAsset(req updater.CheckRequest, assets []github.ReleaseAsset) int {
	plat := strings.ToLower(req.Platform)
	arch := strings.ToLower(req.Arch)

	for i, a := range assets {
		name := strings.ToLower(a.Name)
		if strings.HasSuffix(name, ".sig") || strings.HasSuffix(name, ".asc") || strings.HasSuffix(name, ".sha256") || strings.HasSuffix(name, ".md") {
			continue
		}

		platMatch := false
		switch plat {
		case "darwin":
			platMatch = strings.Contains(name, "macos") || strings.Contains(name, "darwin") || strings.Contains(name, "mac") || strings.Contains(name, "osx")
		case "windows":
			platMatch = strings.Contains(name, "windows") || strings.Contains(name, "win")
		case "linux":
			platMatch = strings.Contains(name, "linux")
		default:
			platMatch = strings.Contains(name, plat)
		}
		if !platMatch {
			continue
		}

		archMatch := false
		switch arch {
		case "arm64":
			archMatch = strings.Contains(name, "arm64") || strings.Contains(name, "aarch64")
		case "amd64":
			archMatch = strings.Contains(name, "amd64") || strings.Contains(name, "x86_64") || strings.Contains(name, "x64")
		default:
			archMatch = strings.Contains(name, arch)
		}
		if !archMatch {
			continue
		}

		return i
	}

	for i, a := range assets {
		name := strings.ToLower(a.Name)
		if strings.HasSuffix(name, ".sig") || strings.HasSuffix(name, ".asc") || strings.HasSuffix(name, ".sha256") || strings.HasSuffix(name, ".md") {
			continue
		}
		return i
	}

	return -1
}

func isHomebrewInstallation() bool {
	return isHomebrewExecutable("", "")
}

func isHomebrewExecutable(execPath string, customPrefix string) bool {
	if execPath == "" {
		var err error
		execPath, err = os.Executable()
		if err != nil {
			return false
		}
	}
	execPath = filepath.Clean(execPath)
	lowerExec := strings.ToLower(execPath)

	if strings.Contains(lowerExec, "/cellar/") ||
		strings.Contains(lowerExec, "/caskroom/") ||
		strings.Contains(lowerExec, "/opt/homebrew/") {
		return true
	}

	if runtime.GOOS == "darwin" {
		prefixes := []string{
			customPrefix,
			os.Getenv("HOMEBREW_PREFIX"),
			"/opt/homebrew",
			"/usr/local",
		}

		bundleDir := findAppBundleDir(execPath)

		for _, p := range prefixes {
			if p == "" {
				continue
			}
			caskDir := filepath.Join(p, "Caskroom", "panelneko")
			entries, err := os.ReadDir(caskDir)
			if err != nil {
				continue
			}

			for _, entry := range entries {
				if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
					continue
				}
				versionDir := filepath.Join(caskDir, entry.Name())
				subEntries, err := os.ReadDir(versionDir)
				if err != nil {
					continue
				}
				for _, sub := range subEntries {
					linkPath := filepath.Join(versionDir, sub.Name())
					target, err := os.Readlink(linkPath)
					if err == nil {
						cleanTarget := filepath.Clean(target)
						if bundleDir != "" && cleanTarget == bundleDir {
							return true
						}
						if strings.HasPrefix(execPath, cleanTarget) {
							return true
						}
					}
				}
			}
		}
	}

	return false
}

func findAppBundleDir(path string) string {
	cur := filepath.Clean(path)
	for {
		if strings.HasSuffix(cur, ".app") {
			return cur
		}
		parent := filepath.Dir(cur)
		if parent == cur || parent == "." || parent == "/" {
			break
		}
		cur = parent
	}
	return ""
}

func (a *App) CheckForUpdates() (contracts.UpdateCheckResult, error) {
	currentInfo := a.GetAppVersion()
	currentVer := strings.TrimPrefix(strings.TrimSpace(currentInfo.Version), "v")
	if currentVer == "" {
		currentVer = "0.1.0"
	}

	isHomebrew := false
	if a.isHomebrewFn != nil {
		isHomebrew = a.isHomebrewFn()
	} else {
		isHomebrew = isHomebrewInstallation()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var rel *updater.Release
	var err error

	if a.updater != nil && a.updater.State() != updater.StateUnconfigured {
		rel, err = a.updater.Check(ctx)
	} else if app := application.Get(); app != nil && app.Updater != nil && app.Updater.State() != updater.StateUnconfigured {
		rel, err = app.Updater.Check(ctx)
	} else {
		provider := a.updaterProvider
		if provider == nil {
			provider, err = github.New(github.Config{
				Repository:   "SakagamiJun/panelneko-reader",
				AssetMatcher: matchPanelNekoAsset,
			})
			if err != nil {
				return contracts.UpdateCheckResult{}, fmt.Errorf("init github provider: %w", err)
			}
		}
		rel, err = provider.Check(ctx, updater.CheckRequest{
			CurrentVersion: currentVer,
			Platform:       runtime.GOOS,
			Arch:           runtime.GOARCH,
		})
	}

	if err != nil {
		return contracts.UpdateCheckResult{}, fmt.Errorf("check update: %w", err)
	}

	if rel == nil {
		return contracts.UpdateCheckResult{
			HasUpdate:      false,
			CurrentVersion: currentVer,
			LatestVersion:  currentVer,
			IsHomebrew:     isHomebrew,
		}, nil
	}

	releaseURL := ""
	if url, ok := rel.Metadata["github.release.htmlURL"].(string); ok {
		releaseURL = url
	}
	if releaseURL == "" {
		releaseURL = fmt.Sprintf("https://github.com/SakagamiJun/panelneko-reader/releases/tag/v%s", rel.Version)
	}

	publishedAt := ""
	if !rel.PublishedAt.IsZero() {
		publishedAt = rel.PublishedAt.Format(time.RFC3339)
	}

	return contracts.UpdateCheckResult{
		HasUpdate:      true,
		CurrentVersion: currentVer,
		LatestVersion:  rel.Version,
		ReleaseURL:     releaseURL,
		ReleaseNotes:   rel.Notes,
		PublishedAt:    publishedAt,
		IsHomebrew:     isHomebrew,
	}, nil
}

type App struct {
	bootErr            error
	store              *store.SQLiteStore
	settings           *settings.Service
	copyManga          *copymanga.Client
	klz9               *klz9.Client
	downloads          *downloader.Manager
	scanMu             sync.Mutex
	scanOnce           sync.Once
	downloadScanMu     sync.Mutex
	downloadScanStop   chan struct{}
	downloadScanActive bool
	updater            *updater.Updater
	updaterProvider    updater.Provider
	isHomebrewFn       func() bool
	isDevMode          bool
	devModeLock        sync.RWMutex
	updateCheckMu      sync.Mutex
	updateCheckStatus  contracts.FollowedUpdateCheckProgress
}

func NewApp() *App {
	return &App{}
}

func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.bootErr = a.bootstrap()
	if a.bootErr == nil {
		go func() {
			a.scanOnce.Do(func() {
				_, _ = a.performSourcesScan()
			})
		}()
	}
	return nil
}

func (a *App) ServiceShutdown() error {
	a.downloadScanMu.Lock()
	if a.downloadScanActive {
		a.downloadScanActive = false
		if a.downloadScanStop != nil {
			close(a.downloadScanStop)
			a.downloadScanStop = nil
		}
	}
	a.downloadScanMu.Unlock()

	if a.downloads != nil {
		a.downloads.Close()
	}
	if a.store != nil {
		return a.store.Close()
	}
	return nil
}

func (a *App) bootstrap() error {
	dataDir, err := os.UserConfigDir()
	if err != nil {
		return contracts.ContractError{
			Code:    contracts.ErrCodeBootstrapFailure,
			Message: fmt.Sprintf("locate user config dir: %v", err),
		}
	}

	appDataDir := filepath.Join(dataDir, "panelneko-reader")
	storeValue, err := store.Open(appDataDir)
	if err != nil {
		return contracts.ContractError{
			Code:    contracts.ErrCodeBootstrapFailure,
			Message: err.Error(),
		}
	}

	settingsService, err := settings.NewService(storeValue)
	if err != nil {
		return contracts.ContractError{
			Code:    contracts.ErrCodeBootstrapFailure,
			Message: err.Error(),
		}
	}

	a.store = storeValue
	a.settings = settingsService

	st := settingsService.Get()
	_ = logger.Get().Init(filepath.Join(appDataDir, "logs"), st.EnableFileLogging)
	ver := a.GetAppVersion()
	logger.Get().Info("PanelNeko Reader initialized. Version: %s (%s)", ver.Version, ver.Commit)

	copyClient := copymanga.NewClient(st.Downloader.CopyMangaAPIDomain, st.Downloader.CopyMangaToken, 15)
	copyClient.SetStore(storeValue)
	copyClient.SetCDNSettings(st.Downloader.CopyMangaCDNMode, st.Downloader.CopyMangaCustomCDNs)
	if st.Downloader.CopyMangaUsername != "" && st.Downloader.CopyMangaPasswordEncrypted != "" {
		copyClient.SetUserCredentials(st.Downloader.CopyMangaUsername, st.Downloader.CopyMangaPasswordEncrypted)
	}
	klzClient := klz9.NewClient(storeValue, st.Downloader.RawMangaBaseURL, 20)
	downloadMgr := downloader.NewManager(storeValue, settingsService, copyClient, klzClient)
	downloadMgr.SetEmitter(a.emit)
	downloadMgr.SetOnActiveTasksChanged(a.onDownloadActiveCountChanged)

	a.copyManga = copyClient
	a.klz9 = klzClient
	a.downloads = downloadMgr

	if previousTasks, err := storeValue.GetDownloadTasks(); err == nil && len(previousTasks) > 0 {
		a.autoLinkFromTasks(previousTasks)
	}

	if st.Downloader.AutoCheckComicUpdates {
		go func() {
			time.Sleep(2 * time.Second)
			logger.Get().Info("Startup auto check for followed comics update initiated")
			_, _ = a.CheckAllFollowedUpdates()
		}()
	}

	cacheDir := filepath.Join(appDataDir, "cache", "thumbnails")
	_ = os.MkdirAll(cacheDir, 0o755)

	a.emit(contracts.EventSettingsUpdated, settingsService.Get())

	return nil
}

func (a *App) GetSettings() (contracts.AppSettings, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.AppSettings{}, err
	}

	return a.settings.Get(), nil
}

func (a *App) UpdateSettings(input contracts.AppSettings) (contracts.AppSettings, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.AppSettings{}, err
	}

	// Credentials are owned by the login/logout flows. Settings saves may carry a
	// stale copy of these fields from the frontend, so never let them overwrite
	// the current values.
	current := a.settings.Get()
	input.Downloader.CopyMangaUsername = current.Downloader.CopyMangaUsername
	input.Downloader.CopyMangaPasswordEncrypted = current.Downloader.CopyMangaPasswordEncrypted
	input.Downloader.CopyMangaToken = current.Downloader.CopyMangaToken

	updated, err := a.settings.Update(input)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	if a.copyManga != nil {
		a.copyManga.SetAPIDomain(updated.Downloader.CopyMangaAPIDomain)
		a.copyManga.SetUserToken(updated.Downloader.CopyMangaToken)
		a.copyManga.SetUserCredentials(updated.Downloader.CopyMangaUsername, updated.Downloader.CopyMangaPasswordEncrypted)
		a.copyManga.SetCDNSettings(updated.Downloader.CopyMangaCDNMode, updated.Downloader.CopyMangaCustomCDNs)
	}
	if a.klz9 != nil {
		a.klz9.SetBaseURL(updated.Downloader.RawMangaBaseURL)
	}

	_ = logger.Get().SetEnabled(updated.EnableFileLogging)

	a.emit(contracts.EventSettingsUpdated, updated)

	return updated, nil
}

func (a *App) getActiveSources() []contracts.LibrarySource {
	currentSettings := a.settings.Get()
	sources := currentSettings.LibrarySources
	if len(sources) == 0 && currentSettings.LibraryRoot != "" {
		sources = []contracts.LibrarySource{
			{
				ID:      "default",
				Name:    filepath.Base(currentSettings.LibraryRoot),
				Type:    contracts.SourceTypeLocal,
				Path:    currentSettings.LibraryRoot,
				Enabled: true,
				Status:  contracts.SourceStatusOnline,
			},
		}
	}
	return sources
}

func (a *App) ListLibraryManga() ([]contracts.LibraryManga, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}

	a.scanOnce.Do(func() {
		_, _ = a.performSourcesScan()
	})

	return a.getCachedLibraryManga()
}

func (a *App) ScanLibrary() ([]contracts.LibraryManga, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}

	return a.performSourcesScan()
}

func (a *App) performSourcesScan() ([]contracts.LibraryManga, error) {
	a.scanMu.Lock()
	defer a.scanMu.Unlock()

	return a.performSourcesScanLocked()
}

func (a *App) onDownloadActiveCountChanged(activeCount int) {
	a.downloadScanMu.Lock()
	defer a.downloadScanMu.Unlock()

	if activeCount > 0 {
		if !a.downloadScanActive {
			a.downloadScanActive = true
			stopCh := make(chan struct{})
			a.downloadScanStop = stopCh
			go a.runDownloadScanLoop(stopCh)
		}
	} else {
		if a.downloadScanActive {
			a.downloadScanActive = false
			if a.downloadScanStop != nil {
				close(a.downloadScanStop)
				a.downloadScanStop = nil
			}
			go a.triggerScanWithTryLock(true)
		}
	}
}

func (a *App) runDownloadScanLoop(stopCh <-chan struct{}) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			a.triggerScanWithTryLock(false)
		}
	}
}

func (a *App) triggerScanWithTryLock(isFinalSweep bool) {
	if !a.scanMu.TryLock() {
		if !isFinalSweep {
			return
		}
		a.scanMu.Lock()
	}
	defer a.scanMu.Unlock()

	_, _ = a.performSourcesScanLocked()
}

func (a *App) performSourcesScanLocked() ([]contracts.LibraryManga, error) {
	sources := a.getActiveSources()

	prevItemsBySource := make(map[string]map[string]contracts.LibraryManga)
	prevModTimesBySource := make(map[string]map[string]int64)

	for _, src := range sources {
		records, err := a.store.ListLibraryMangaBySource(src.ID)
		if err != nil {
			return nil, err
		}
		itemsMap := make(map[string]contracts.LibraryManga)
		modTimesMap := make(map[string]int64)
		for _, r := range records {
			modTimesMap[r.RelativePath] = r.ModTime
			itemsMap[r.RelativePath] = r.LibraryManga
		}
		prevItemsBySource[src.ID] = itemsMap
		prevModTimesBySource[src.ID] = modTimesMap
	}

	results := library.ScanAllSources(sources, prevItemsBySource, prevModTimesBySource)

	var sourcesUpdated bool
	currentSettings := a.settings.Get()
	sourceMap := make(map[string]contracts.LibrarySource)
	for _, s := range currentSettings.LibrarySources {
		sourceMap[s.ID] = s
	}

	for _, res := range results {
		s, exists := sourceMap[res.Source.ID]
		if exists {
			if s.Status != res.Source.Status || s.ErrorMessage != res.Source.ErrorMessage || s.MangaCount != len(res.Items) {
				s.Status = res.Source.Status
				s.ErrorMessage = res.Source.ErrorMessage
				if res.Err == nil && res.Source.Enabled {
					s.MangaCount = len(res.Items)
					s.LastScanned = time.Now().UTC().Format(time.RFC3339)
				}
				sourceMap[res.Source.ID] = s
				sourcesUpdated = true
			}
		}

		if !res.Source.Enabled {
			if err := a.store.SetSourceAvailability(res.Source.ID, false); err != nil {
				return nil, err
			}
		} else if res.Err != nil {
			if err := a.store.SetSourceAvailability(res.Source.ID, false); err != nil {
				return nil, err
			}
		} else {
			if a.downloads != nil {
				a.downloads.ResumeWaitingTasks(res.Source.ID)
			}
			if err := a.store.SaveLibraryMangaForSource(res.Source.ID, res.Items, res.NewModTimes); err != nil {
				return nil, err
			}
		}
	}

	if sourcesUpdated {
		var updatedList []contracts.LibrarySource
		for _, orig := range currentSettings.LibrarySources {
			if updated, ok := sourceMap[orig.ID]; ok {
				updatedList = append(updatedList, updated)
			} else {
				updatedList = append(updatedList, orig)
			}
		}
		currentSettings.LibrarySources = updatedList
		if updated, err := a.settings.Update(currentSettings); err == nil {
			a.emit(contracts.EventSettingsUpdated, updated)
		}
	}

	a.emit(contracts.EventLibraryUpdated, nil)
	return a.getCachedLibraryManga()
}

func (a *App) getCachedLibraryManga() ([]contracts.LibraryManga, error) {
	records, err := a.store.ListLibraryManga()
	if err != nil {
		return nil, err
	}

	items := make([]contracts.LibraryManga, 0, len(records))
	for _, r := range records {
		items = append(items, r.LibraryManga)
	}

	pins, err := a.store.GetPinnedMap()
	if err != nil {
		return nil, err
	}

	currentSettings := a.settings.Get()
	items = library.ApplyPinsAndSort(items, pins)

	quality := resolveThumbnailQuality(currentSettings)

	for i := range items {
		if quality == contracts.ThumbnailQualityOff {
			items[i].CoverImageURL = library.StripThumbnailURL(items[i].CoverImageURL)
		} else {
			items[i].CoverImageURL = library.BuildThumbnailURLWithQuality(items[i].CoverImageURL, quality)
		}
	}

	return items, nil
}

func (a *App) TogglePin(mangaID string) (bool, error) {
	if err := a.ensureReady(); err != nil {
		return false, err
	}

	pinned, err := a.store.TogglePin(mangaID)
	if err != nil {
		return false, err
	}

	a.emit(contracts.EventLibraryUpdated, nil)

	return pinned, nil
}

func (a *App) ToggleCollection(mangaID string) (bool, error) {
	if err := a.ensureReady(); err != nil {
		return false, err
	}

	isCollection, err := library.ToggleCollectionMarkerWithSources(a.getActiveSources(), mangaID)
	if err != nil {
		return false, err
	}

	a.emit(contracts.EventLibraryUpdated, nil)

	return isCollection, nil
}

func (a *App) OpenDirectory(mangaID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}

	dirPath, err := library.ResolveDirectoryPathWithSources(a.getActiveSources(), mangaID)
	if err != nil {
		return err
	}

	if wailsApp := application.Get(); wailsApp != nil && wailsApp.Env != nil {
		return wailsApp.Env.OpenFileManager(dirPath, false)
	}

	return library.FileOpener(dirPath)
}

func (a *App) GetReaderManifest(mangaID string) (contracts.ReaderManifest, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.ReaderManifest{}, err
	}

	return library.GetReaderManifestWithSources(a.getActiveSources(), mangaID)
}

func (a *App) GetReaderProgress(mangaID string) (contracts.ReaderProgress, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.ReaderProgress{}, err
	}

	progress, found, err := a.store.GetReaderProgress(mangaID)
	if err != nil {
		return contracts.ReaderProgress{}, err
	}
	if !found {
		return contracts.ReaderProgress{MangaID: mangaID}, nil
	}

	return progress, nil
}

func (a *App) UpdateReaderProgress(input contracts.ReaderProgress) (contracts.ReaderProgress, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.ReaderProgress{}, err
	}

	if input.Page < 1 {
		input.Page = 1
	}
	input.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	if err := a.store.SaveReaderProgress(input); err != nil {
		return contracts.ReaderProgress{}, err
	}

	return input, nil
}

func (a *App) GetThumbnailCacheSize() (int64, error) {
	if err := a.ensureReady(); err != nil {
		return 0, err
	}
	cacheDir := filepath.Join(a.store.DataDir(), "cache", "thumbnails")
	return library.GetThumbnailCacheSize(cacheDir)
}

func (a *App) ClearThumbnailCache() error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	cacheDir := filepath.Join(a.store.DataDir(), "cache", "thumbnails")
	return library.ClearThumbnailCache(cacheDir)
}

func (a *App) AddLibrarySource(source contracts.LibrarySource) (contracts.AppSettings, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.AppSettings{}, err
	}

	cleanPath := strings.TrimSpace(source.Path)
	if cleanPath == "" {
		return contracts.AppSettings{}, fmt.Errorf("source path cannot be empty")
	}

	current := a.settings.Get()
	for _, s := range current.LibrarySources {
		if filepath.Clean(s.Path) == filepath.Clean(cleanPath) {
			return contracts.AppSettings{}, fmt.Errorf("library source with path %q already exists", cleanPath)
		}
	}

	sourceID := strings.TrimSpace(source.ID)
	if sourceID == "" {
		sourceID = fmt.Sprintf("src-%d", time.Now().UnixNano())
	}

	name := strings.TrimSpace(source.Name)
	if name == "" {
		name = filepath.Base(cleanPath)
	}

	srcType := source.Type
	if srcType == "" {
		srcType = contracts.SourceTypeLocal
	}

	newSource := contracts.LibrarySource{
		ID:       sourceID,
		Name:     name,
		Type:     srcType,
		Path:     cleanPath,
		Enabled:  true,
		ReadOnly: source.ReadOnly,
		Status:   contracts.SourceStatusOnline,
	}

	current.LibrarySources = append(current.LibrarySources, newSource)
	updated, err := a.settings.Update(current)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	a.emit(contracts.EventSettingsUpdated, updated)
	a.emit(contracts.EventLibraryUpdated, nil)

	return updated, nil
}

func (a *App) AddDroppedSources(paths []string) (contracts.DroppedSourcesResult, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.DroppedSourcesResult{}, err
	}

	result := contracts.DroppedSourcesResult{
		AddedPaths: make([]string, 0),
	}
	if len(paths) == 0 {
		return result, nil
	}

	current := a.settings.Get()
	existingPathMap := make(map[string]bool)
	for _, s := range current.LibrarySources {
		existingPathMap[filepath.Clean(s.Path)] = true
	}

	var addedSources []contracts.LibrarySource
	for _, p := range paths {
		cleanPath := filepath.Clean(strings.TrimSpace(p))
		if cleanPath == "" || cleanPath == "." {
			continue
		}

		info, err := os.Stat(cleanPath)
		if err != nil {
			continue
		}

		if !info.IsDir() {
			result.IgnoredFiles++
			continue
		}

		if existingPathMap[cleanPath] {
			result.ExistingCount++
			continue
		}

		existingPathMap[cleanPath] = true
		sourceID := fmt.Sprintf("src-%d-%d", time.Now().UnixNano(), len(addedSources)+1)
		name := filepath.Base(cleanPath)
		if name == "" || name == "." || name == "/" {
			name = cleanPath
		}

		newSource := contracts.LibrarySource{
			ID:      sourceID,
			Name:    name,
			Type:    contracts.SourceTypeLocal,
			Path:    cleanPath,
			Enabled: true,
			Status:  contracts.SourceStatusOnline,
		}
		addedSources = append(addedSources, newSource)
		result.AddedPaths = append(result.AddedPaths, cleanPath)
		result.AddedCount++
	}

	if len(addedSources) > 0 {
		current.LibrarySources = append(current.LibrarySources, addedSources...)
		updated, err := a.settings.Update(current)
		if err != nil {
			return result, err
		}
		a.emit(contracts.EventSettingsUpdated, updated)
		go func() {
			_, _ = a.performSourcesScan()
		}()
	}

	return result, nil
}

func (a *App) RemoveLibrarySource(sourceID string) (contracts.AppSettings, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.AppSettings{}, err
	}

	sourceID = strings.TrimSpace(sourceID)
	if sourceID == "" {
		return contracts.AppSettings{}, fmt.Errorf("source id cannot be empty")
	}

	current := a.settings.Get()
	found := false
	var filtered []contracts.LibrarySource
	for _, s := range current.LibrarySources {
		if s.ID == sourceID {
			found = true
			continue
		}
		filtered = append(filtered, s)
	}

	if !found {
		return contracts.AppSettings{}, fmt.Errorf("source with id %q not found", sourceID)
	}

	if err := a.store.DeleteSourceLibraryManga(sourceID); err != nil {
		return contracts.AppSettings{}, fmt.Errorf("delete source manga: %w", err)
	}

	current.LibrarySources = filtered
	updated, err := a.settings.Update(current)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	a.emit(contracts.EventSettingsUpdated, updated)
	a.emit(contracts.EventLibraryUpdated, nil)

	return updated, nil
}

func (a *App) UpdateLibrarySource(source contracts.LibrarySource) (contracts.AppSettings, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.AppSettings{}, err
	}

	sourceID := strings.TrimSpace(source.ID)
	if sourceID == "" {
		return contracts.AppSettings{}, fmt.Errorf("source id cannot be empty")
	}

	current := a.settings.Get()
	found := false
	for i, s := range current.LibrarySources {
		if s.ID == sourceID {
			found = true
			if strings.TrimSpace(source.Name) != "" {
				current.LibrarySources[i].Name = strings.TrimSpace(source.Name)
			}
			current.LibrarySources[i].Enabled = source.Enabled
			current.LibrarySources[i].ReadOnly = source.ReadOnly
			if source.Type != "" {
				current.LibrarySources[i].Type = source.Type
			}
			if !source.Enabled {
				_ = a.store.SetSourceAvailability(sourceID, false)
			}
			break
		}
	}

	if !found {
		return contracts.AppSettings{}, fmt.Errorf("source with id %q not found", sourceID)
	}

	updated, err := a.settings.Update(current)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	a.emit(contracts.EventSettingsUpdated, updated)
	a.emit(contracts.EventLibraryUpdated, nil)

	return updated, nil
}

func (a *App) RelocateLibrarySource(sourceID string, newPath string) (contracts.AppSettings, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.AppSettings{}, err
	}

	sourceID = strings.TrimSpace(sourceID)
	cleanPath := strings.TrimSpace(newPath)
	if sourceID == "" || cleanPath == "" {
		return contracts.AppSettings{}, fmt.Errorf("source id and new path cannot be empty")
	}

	current := a.settings.Get()
	for _, s := range current.LibrarySources {
		if s.ID != sourceID && filepath.Clean(s.Path) == filepath.Clean(cleanPath) {
			return contracts.AppSettings{}, fmt.Errorf("library source with path %q already exists", cleanPath)
		}
	}

	found := false
	for i, s := range current.LibrarySources {
		if s.ID == sourceID {
			found = true
			current.LibrarySources[i].Path = cleanPath
			current.LibrarySources[i].Status = contracts.SourceStatusOnline
			current.LibrarySources[i].ErrorMessage = ""
			break
		}
	}

	if !found {
		return contracts.AppSettings{}, fmt.Errorf("source with id %q not found", sourceID)
	}

	updated, err := a.settings.Update(current)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	_ = a.RescanSource(sourceID)

	a.emit(contracts.EventSettingsUpdated, updated)
	a.emit(contracts.EventLibraryUpdated, nil)

	return updated, nil
}

func (a *App) RescanSource(sourceID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}

	sourceID = strings.TrimSpace(sourceID)
	sources := a.getActiveSources()
	var targetSource *contracts.LibrarySource
	for _, s := range sources {
		if s.ID == sourceID {
			targetSource = &s
			break
		}
	}

	if targetSource == nil {
		return fmt.Errorf("source with id %q not found", sourceID)
	}

	records, err := a.store.ListLibraryMangaBySource(sourceID)
	if err != nil {
		return err
	}

	prevModTimes := make(map[string]int64)
	prevItems := make(map[string]contracts.LibraryManga)
	for _, r := range records {
		prevModTimes[r.RelativePath] = r.ModTime
		prevItems[r.RelativePath] = r.LibraryManga
	}

	items, newModTimes, err := library.ScanSource(*targetSource, prevItems, prevModTimes)
	if err != nil {
		_ = a.store.SetSourceAvailability(sourceID, false)
		targetSource.Status = contracts.SourceStatusOffline
		targetSource.ErrorMessage = err.Error()
	} else {
		targetSource.Status = contracts.SourceStatusOnline
		targetSource.ErrorMessage = ""
		targetSource.MangaCount = len(items)
		targetSource.LastScanned = time.Now().UTC().Format(time.RFC3339)
		if err := a.store.SaveLibraryMangaForSource(sourceID, items, newModTimes); err != nil {
			return err
		}
	}

	current := a.settings.Get()
	for i, s := range current.LibrarySources {
		if s.ID == sourceID {
			current.LibrarySources[i] = *targetSource
			break
		}
	}
	updated, _ := a.settings.Update(current)

	a.emit(contracts.EventSettingsUpdated, updated)
	a.emit(contracts.EventLibraryUpdated, nil)
	return nil
}

func (a *App) assetHandler() http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !library.IsLibraryAssetRequest(request.URL.Path) {
			http.NotFound(writer, request)
			return
		}

		if err := a.ensureReady(); err != nil {
			http.Error(writer, err.Error(), http.StatusServiceUnavailable)
			return
		}

		sources := a.getActiveSources()
		sourcesMap := make(map[string]string, len(sources))
		var defaultRoot string
		for _, src := range sources {
			if src.Enabled {
				rootPath := src.Path
				if fi, err := os.Stat(rootPath); err == nil && !fi.IsDir() && library.IsSupportedArchivePath(rootPath) {
					rootPath = filepath.Dir(rootPath)
				}
				sourcesMap[src.ID] = rootPath
				if src.ID == "default" || defaultRoot == "" {
					defaultRoot = rootPath
				}
			}
		}
		if defaultRoot == "" {
			defaultRoot = a.settings.Get().LibraryRoot
		}

		if strings.HasPrefix(request.URL.Path, library.LibraryThumbnailPrefix) {
			quality := resolveThumbnailQuality(a.settings.Get())
			cacheDir := filepath.Join(a.store.DataDir(), "cache", "thumbnails")
			if err := library.ServeMultiSourceThumbnailWithQuality(sourcesMap, defaultRoot, cacheDir, request.URL.Path, writer, request, quality); err != nil {
				if os.IsNotExist(err) {
					http.NotFound(writer, request)
					return
				}
				http.Error(writer, err.Error(), http.StatusForbidden)
			}
			return
		}

		if strings.HasPrefix(request.URL.Path, library.LibraryArchiveAssetPrefix) {
			reader, contentType, contentLength, err := library.OpenMultiSourceArchiveAsset(sourcesMap, defaultRoot, request.URL.Path)
			if err != nil {
				if os.IsNotExist(err) {
					http.NotFound(writer, request)
					return
				}
				http.Error(writer, err.Error(), http.StatusForbidden)
				return
			}
			defer reader.Close()

			writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			if contentType != "" {
				writer.Header().Set("Content-Type", contentType)
			}
			if contentLength >= 0 {
				writer.Header().Set("Content-Length", fmt.Sprintf("%d", contentLength))
				etag := fmt.Sprintf(`"%x-%x"`, len(request.URL.Path), contentLength)
				writer.Header().Set("ETag", etag)
				if match := request.Header.Get("If-None-Match"); match != "" && match == etag {
					writer.WriteHeader(http.StatusNotModified)
					return
				}
			}

			_, _ = library.CopyStream(writer, reader)
			return
		}

		targetPath, err := library.ResolveMultiSourceAssetPath(sourcesMap, defaultRoot, request.URL.Path)
		if err != nil {
			if os.IsNotExist(err) {
				http.NotFound(writer, request)
				return
			}
			http.Error(writer, err.Error(), http.StatusForbidden)
			return
		}

		writer.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFile(writer, request, targetPath)
	})
}

func (a *App) emit(event string, payload any) {
	if wailsApp := application.Get(); wailsApp != nil {
		wailsApp.Event.Emit(event, payload)
	}
}

func (a *App) ensureReady() error {
	if a.bootErr != nil {
		return a.bootErr
	}

	if a.store == nil || a.settings == nil {
		return contracts.ContractError{
			Code:    contracts.ErrCodeBootstrapFailure,
			Message: "application services are not initialized",
		}
	}

	return nil
}

func (a *App) SearchOnlineManga(source string, query string, page int, limit int) (contracts.OnlineSearchResult, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.OnlineSearchResult{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if a.downloads == nil {
		return contracts.OnlineSearchResult{}, fmt.Errorf("downloader not initialized")
	}
	provider, ok := a.downloads.GetProvider(source)
	if !ok {
		return contracts.OnlineSearchResult{}, fmt.Errorf("unknown source: %s", source)
	}
	return provider.SearchManga(ctx, query, page, limit)
}

func (a *App) GetOnlineMangaChapters(source string, mangaID string, mangaTitle string) ([]contracts.OnlineMangaChapter, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if a.downloads == nil {
		return nil, fmt.Errorf("downloader not initialized")
	}
	provider, ok := a.downloads.GetProvider(source)
	if !ok {
		return nil, fmt.Errorf("unknown source: %s", source)
	}
	chapters, err := provider.GetMangaChapters(ctx, mangaID)
	if err != nil {
		return nil, err
	}

	var matchedLocalMangaID string
	var matchedLocalTitle string

	if a.store != nil {
		// Stage 1: Exact match by online link
		if allLinks, err := a.store.GetAllMangaOnlineLinks(); err == nil {
			for _, l := range allLinks {
				if l.OnlineSource == source && l.OnlineComicID == mangaID {
					matchedLocalMangaID = l.MangaID
					if l.OnlineTitle != "" {
						matchedLocalTitle = l.OnlineTitle
					}
					break
				}
			}
		}

		// Stage 2: Match by local manga title or folder name
		if matchedLocalMangaID == "" {
			if existingMangas, err := a.store.ListLibraryManga(); err == nil && len(existingMangas) > 0 {
				safeManga := downloader.SanitizeFilename(mangaTitle)
				for _, m := range existingMangas {
					if (mangaTitle != "" && strings.EqualFold(m.Title, mangaTitle)) ||
						(safeManga != "" && strings.EqualFold(m.RelativePath, safeManga)) ||
						strings.EqualFold(m.RelativePath, mangaID) {
						matchedLocalMangaID = m.ID
						matchedLocalTitle = m.Title
						break
					}
				}
			}
		}
	}

	// Stage 3: Decorate chapters with local presence if matched
	if matchedLocalMangaID != "" {
		if manifest, err := library.GetReaderManifestWithSources(a.getActiveSources(), matchedLocalMangaID); err == nil && len(manifest.Chapters) > 0 {
			if matchedLocalTitle == "" {
				matchedLocalTitle = manifest.Title
			}
			allLocalNumbers := make(map[float64]bool)
			localDownloadedChapterIDs := make(map[string]bool)
			type localChapterInfo struct {
				title     string
				localPath string
				number    float64
			}
			var localList []localChapterInfo

			for _, ch := range manifest.Chapters {
				allLocalNumbers[ch.Number] = true
				if strings.HasPrefix(ch.Notes, "{") {
					var notes contracts.ComicInfoNotes
					if err := json.Unmarshal([]byte(ch.Notes), &notes); err == nil && notes.ChapterID != "" {
						localDownloadedChapterIDs[notes.ChapterID] = true
					}
				}
				localList = append(localList, localChapterInfo{
					title:     ch.Title,
					localPath: ch.LocalPath,
					number:    ch.Number,
				})
			}

			for i := range chapters {
				ch := &chapters[i]
				ch.MatchedLocalTitle = matchedLocalTitle
				if localDownloadedChapterIDs[ch.ID] {
					ch.IsDownloaded = true
					continue
				}
				effNum := ch.Number
				if effNum <= 0 {
					if parsed := downloader.ExtractChapterNumber(ch.Title, -1); parsed >= 0 {
						effNum = parsed
					}
				}
				if allLocalNumbers[ch.Number] || (effNum > 0 && allLocalNumbers[effNum]) {
					ch.IsDownloaded = true
					continue
				}
				for _, loc := range localList {
					if downloader.MatchChapterTitle(ch.Title, loc.title, loc.localPath) {
						ch.IsDownloaded = true
						break
					}
				}
			}
		}
	}

	return chapters, nil
}

func (a *App) GetOnlineMangaGroups(source string, mangaID string) ([]string, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if a.downloads == nil {
		return []string{}, nil
	}
	provider, ok := a.downloads.GetProvider(source)
	if !ok {
		return []string{}, nil
	}
	return provider.GetMangaGroups(ctx, mangaID)
}

func (a *App) CreateDownloadTasks(inputs []contracts.CreateDownloadTaskInput) ([]contracts.DownloadTask, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	if a.downloads == nil {
		return nil, fmt.Errorf("download manager not initialized")
	}
	tasks, err := a.downloads.CreateTasks(inputs)
	if err != nil {
		return nil, err
	}

	a.autoLinkDownloadTasks(inputs)

	return tasks, nil
}

func (a *App) PauseDownloadTask(taskID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	if a.downloads == nil {
		return fmt.Errorf("download manager not initialized")
	}
	return a.downloads.PauseTask(taskID)
}

func (a *App) ResumeDownloadTask(taskID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	if a.downloads == nil {
		return fmt.Errorf("download manager not initialized")
	}
	return a.downloads.ResumeTask(taskID)
}

func (a *App) CancelDownloadTask(taskID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	if a.downloads == nil {
		return fmt.Errorf("download manager not initialized")
	}
	return a.downloads.CancelTask(taskID)
}

func (a *App) GetDownloadTasks() ([]contracts.DownloadTask, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	if a.downloads == nil {
		return nil, fmt.Errorf("download manager not initialized")
	}
	return a.downloads.GetTasks()
}

func (a *App) ClearCompletedDownloadTasks() error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	if a.downloads == nil {
		return fmt.Errorf("download manager not initialized")
	}
	return a.downloads.ClearCompletedTasks()
}

func (a *App) GetDownloadProgress() contracts.DownloadProgress {
	if a.downloads == nil {
		return contracts.DownloadProgress{}
	}
	return a.downloads.GetProgress()
}

func (a *App) RetryDownloadTask(taskID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	if a.downloads == nil {
		return fmt.Errorf("download manager not initialized")
	}
	return a.downloads.RetryTask(taskID)
}

func (a *App) MatchLocalManga(mangaID string, provider string) ([]contracts.OnlineMangaItem, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	manga, found, err := a.store.GetLibraryManga(mangaID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("local manga not found: %s", mangaID)
	}

	searchKeyword := manga.Title
	cleaned := downloader.CleanMangaTitle(manga.Title)
	if cleaned != "" {
		searchKeyword = cleaned
	}

	res, err := a.SearchOnlineManga(provider, searchKeyword, 1, 20)
	if err != nil {
		return nil, err
	}

	items := res.Items
	sort.Slice(items, func(i, j int) bool {
		simI := downloader.LevenshteinSimilarity(searchKeyword, items[i].Title)
		simJ := downloader.LevenshteinSimilarity(searchKeyword, items[j].Title)
		return simI > simJ
	})

	return items, nil
}

func (a *App) PreviewMangaLink(input contracts.MangaLinkPreviewInput) (contracts.MangaLinkPreviewItem, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.MangaLinkPreviewItem{
			MangaID:      input.MangaID,
			ErrorMessage: err.Error(),
		}, err
	}
	return a.previewMangaLinkInternal(input), nil
}

func (a *App) PreviewBatchMangaLinks(inputs []contracts.MangaLinkPreviewInput) ([]contracts.MangaLinkPreviewItem, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}

	results := make([]contracts.MangaLinkPreviewItem, len(inputs))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 3)

	for idx, in := range inputs {
		wg.Add(1)
		go func(i int, input contracts.MangaLinkPreviewInput) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i] = a.previewMangaLinkInternal(input)
		}(idx, in)
	}

	wg.Wait()
	return results, nil
}

func (a *App) previewMangaLinkInternal(input contracts.MangaLinkPreviewInput) contracts.MangaLinkPreviewItem {
	item := contracts.MangaLinkPreviewItem{
		MangaID:            input.MangaID,
		LocalLatestNumber:  -1,
		OnlineLatestNumber: -1,
		DiffType:           "in_sync",
		RecommendedPolicy:  "latest_only",
	}

	localManga, found, err := a.store.GetLibraryManga(input.MangaID)
	if err != nil || !found {
		item.ErrorMessage = "local manga not found"
		return item
	}
	item.MangaTitle = localManga.Title

	onlineChapters, err := a.GetOnlineMangaChapters(input.OnlineSource, input.OnlineComicID, localManga.Title)
	if err != nil {
		item.ErrorMessage = fmt.Sprintf("fetch online chapters: %v", err)
		return item
	}

	manifest, err := library.GetReaderManifestWithSources(a.getActiveSources(), input.MangaID)
	if err != nil {
		item.ErrorMessage = fmt.Sprintf("scan local chapters: %v", err)
		return item
	}

	allLocalNumbers := make(map[float64]bool)
	var localMaxNum float64 = -1
	var localMaxTitle string
	type localInfo struct {
		title     string
		localPath string
		number    float64
	}
	var localList []localInfo

	for _, ch := range manifest.Chapters {
		allLocalNumbers[ch.Number] = true
		if ch.Number > localMaxNum {
			localMaxNum = ch.Number
			localMaxTitle = ch.Title
		}
		localList = append(localList, localInfo{
			title:     ch.Title,
			localPath: ch.LocalPath,
			number:    ch.Number,
		})
	}
	item.LocalLatestTitle = localMaxTitle
	item.LocalLatestNumber = localMaxNum

	var targetOnlineChapters []contracts.OnlineMangaChapter
	for _, ch := range onlineChapters {
		grp := strings.TrimSpace(ch.Group)
		targetGroup := strings.TrimSpace(input.TargetGroup)
		if targetGroup != "" && !strings.EqualFold(targetGroup, "all") {
			matched := false
			if strings.EqualFold(targetGroup, "default") || targetGroup == "话" {
				matched = strings.EqualFold(grp, "default") || grp == "话" || grp == ""
			} else if strings.EqualFold(targetGroup, "tankobon") || targetGroup == "单行本" || targetGroup == "卷" {
				matched = strings.EqualFold(grp, "tankobon") || grp == "单行本" || grp == "卷"
			} else {
				matched = strings.EqualFold(grp, targetGroup)
			}
			if !matched {
				continue
			}
		}
		targetOnlineChapters = append(targetOnlineChapters, ch)
	}

	if len(targetOnlineChapters) == 0 {
		targetOnlineChapters = onlineChapters
	}

	var onlineMaxNum float64 = -1
	var onlineMaxTitle string
	var missingChapters []string
	var missingNewChapters []string
	var missingGapChapters []string

	for _, ch := range targetOnlineChapters {
		effNum := ch.Number
		if effNum <= 0 {
			if parsed := downloader.ExtractChapterNumber(ch.Title, -1); parsed >= 0 {
				effNum = parsed
			}
		}
		if effNum > onlineMaxNum {
			onlineMaxNum = effNum
			onlineMaxTitle = ch.Title
		}

		alreadyPresent := false
		if allLocalNumbers[ch.Number] || (effNum > 0 && allLocalNumbers[effNum]) {
			alreadyPresent = true
		} else {
			for _, loc := range localList {
				if downloader.MatchChapterTitle(ch.Title, loc.title, loc.localPath) {
					alreadyPresent = true
					break
				}
			}
		}

		if !alreadyPresent {
			missingChapters = append(missingChapters, ch.Title)
			if localMaxNum >= 0 && effNum <= localMaxNum {
				missingGapChapters = append(missingGapChapters, ch.Title)
			} else {
				missingNewChapters = append(missingNewChapters, ch.Title)
			}
		}
	}

	item.OnlineLatestTitle = onlineMaxTitle
	item.OnlineLatestNumber = onlineMaxNum
	item.LatestOnlyCount = len(missingNewChapters)
	item.GapCount = len(missingGapChapters)

	policy := strings.TrimSpace(input.FollowPolicy)
	if policy == "" {
		st := a.settings.Get()
		if st.Downloader.AutoFollowPolicy != "" {
			policy = st.Downloader.AutoFollowPolicy
		} else {
			policy = "latest_only"
		}
	}
	item.RecommendedPolicy = policy

	if policy == "fill_gaps" {
		item.PendingChapters = missingChapters
		if len(missingChapters) > 0 {
			item.DiffType = "online_ahead"
			item.DiffCount = len(missingChapters)
		} else {
			if localMaxNum > onlineMaxNum && onlineMaxNum >= 0 {
				item.DiffType = "local_ahead"
				item.DiffCount = int(localMaxNum - onlineMaxNum)
				if item.DiffCount <= 0 {
					item.DiffCount = 1
				}
			} else {
				item.DiffType = "in_sync"
				item.DiffCount = 0
			}
		}
	} else {
		// "latest_only" default: only count new chapters ahead of local max
		item.PendingChapters = missingNewChapters
		if len(missingNewChapters) > 0 {
			item.DiffType = "online_ahead"
			item.DiffCount = len(missingNewChapters)
		} else {
			if localMaxNum > onlineMaxNum && onlineMaxNum >= 0 {
				item.DiffType = "local_ahead"
				item.DiffCount = int(localMaxNum - onlineMaxNum)
				if item.DiffCount <= 0 {
					item.DiffCount = 1
				}
			} else {
				item.DiffType = "in_sync"
				item.DiffCount = 0
			}
		}
	}

	return item
}

func (a *App) LinkMangaOnline(input contracts.MangaOnlineLink) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	if strings.TrimSpace(input.MangaID) == "" || strings.TrimSpace(input.OnlineComicID) == "" {
		return fmt.Errorf("mangaID and onlineComicID are required")
	}
	if input.FollowPolicy == "" {
		input.FollowPolicy = "latest_only"
	}
	return a.store.SaveMangaOnlineLink(input)
}

func (a *App) GetMangaOnlineLink(mangaID string) (contracts.MangaOnlineLink, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.MangaOnlineLink{}, err
	}
	link, _, err := a.store.GetMangaOnlineLink(mangaID)
	return link, err
}

func (a *App) UnlinkMangaOnline(mangaID string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	return a.store.DeleteMangaOnlineLink(mangaID)
}

func (a *App) autoLinkDownloadTasks(inputs []contracts.CreateDownloadTaskInput) {
	if len(inputs) == 0 || a.store == nil {
		return
	}

	type mangaGroup struct {
		source        string
		comicID       string
		title         string
		targetSrcID   string
		targetGroup   string
		maxChapterNum float64
		maxChapterTit string
	}

	grouped := make(map[string]*mangaGroup)
	for _, in := range inputs {
		src := strings.TrimSpace(in.Source)
		mID := strings.TrimSpace(in.MangaID)
		if src == "" || mID == "" {
			continue
		}
		key := fmt.Sprintf("%s::%s", src, mID)
		g, ok := grouped[key]
		if !ok {
			title := strings.TrimSpace(in.MangaTitle)
			if title == "" {
				title = mID
			}
			g = &mangaGroup{
				source:        src,
				comicID:       mID,
				title:         title,
				targetSrcID:   in.TargetSourceID,
				maxChapterNum: -1,
			}
			grouped[key] = g
		}

		chNum := in.ChapterNumber
		if chNum <= 0 {
			if semanticNum := downloader.ExtractChapterNumber(in.ChapterTitle, -1); semanticNum >= 0 {
				chNum = semanticNum
			}
		}

		if chNum > g.maxChapterNum {
			g.maxChapterNum = chNum
			g.maxChapterTit = in.ChapterTitle
		}
		grp := strings.TrimSpace(in.ChapterGroup)
		if g.targetGroup == "" && grp != "" && !strings.EqualFold(grp, "default") {
			g.targetGroup = grp
		}
		if g.targetSrcID == "" && in.TargetSourceID != "" {
			g.targetSrcID = in.TargetSourceID
		}
	}

	var st contracts.AppSettings
	if a.settings != nil {
		st = a.settings.Get()
	}
	existingMangas, _ := a.store.ListLibraryManga()

	for _, g := range grouped {
		targetSrcID := g.targetSrcID
		if strings.TrimSpace(targetSrcID) == "" {
			targetSrcID = st.Downloader.TargetSourceID
		}
		if targetSrcID == "" && len(st.LibrarySources) > 0 {
			for _, src := range st.LibrarySources {
				if src.Enabled {
					targetSrcID = src.ID
					break
				}
			}
			if targetSrcID == "" {
				targetSrcID = st.LibrarySources[0].ID
			}
		}
		if targetSrcID == "" {
			targetSrcID = "default"
		}

		safeManga := downloader.SanitizeFilename(g.title)
		localMangaID := library.EncodeMangaIDWithSource(targetSrcID, safeManga)

		for _, m := range existingMangas {
			if (m.SourceID == targetSrcID || targetSrcID == "default") &&
				(strings.EqualFold(m.Title, g.title) || strings.EqualFold(m.RelativePath, safeManga)) {
				localMangaID = m.ID
				break
			}
		}

		existingLink, found, err := a.store.GetMangaOnlineLink(localMangaID)
		if err == nil && found {
			updated := false
			if existingLink.OnlineSource == "" || existingLink.OnlineComicID == "" {
				existingLink.OnlineSource = g.source
				existingLink.OnlineComicID = g.comicID
				existingLink.OnlineTitle = g.title
				updated = true
			}
			if g.maxChapterNum > existingLink.BaselineChapterNumber {
				existingLink.BaselineChapterNumber = g.maxChapterNum
				existingLink.BaselineChapterTitle = g.maxChapterTit
				updated = true
			}
			if existingLink.TargetGroup == "" && g.targetGroup != "" {
				existingLink.TargetGroup = g.targetGroup
				updated = true
			}
			if updated {
				_ = a.store.SaveMangaOnlineLink(existingLink)
			}
		} else {
			newLink := contracts.MangaOnlineLink{
				MangaID:               localMangaID,
				OnlineSource:          g.source,
				OnlineComicID:         g.comicID,
				OnlineTitle:           g.title,
				TargetGroup:           g.targetGroup,
				BaselineChapterNumber: g.maxChapterNum,
				BaselineChapterTitle:  g.maxChapterTit,
				AutoFollow:            true,
				FollowPolicy:          "latest_only",
			}
			if err := a.store.SaveMangaOnlineLink(newLink); err != nil {
				logger.Get().Warn("Failed to auto-link downloaded manga %s: %v", localMangaID, err)
			} else {
				logger.Get().Info("Auto-linked downloaded manga %s (%s) to %s/%s", localMangaID, g.title, g.source, g.comicID)
			}
		}
	}
}

func (a *App) autoLinkFromTasks(tasks []contracts.DownloadTask) {
	if len(tasks) == 0 {
		return
	}
	inputs := make([]contracts.CreateDownloadTaskInput, len(tasks))
	for i, t := range tasks {
		inputs[i] = contracts.CreateDownloadTaskInput{
			Source:         t.Source,
			MangaID:        t.MangaID,
			MangaTitle:     t.MangaTitle,
			ChapterID:      t.ChapterID,
			ChapterTitle:   t.ChapterTitle,
			ChapterNumber:  t.ChapterNumber,
			ChapterGroup:   t.ChapterGroup,
			TargetSourceID: t.TargetSourceID,
		}
	}
	a.autoLinkDownloadTasks(inputs)
}

func (a *App) CheckMangaUpdates(mangaID string) (int, error) {
	if err := a.ensureReady(); err != nil {
		return 0, err
	}
	link, found, err := a.store.GetMangaOnlineLink(mangaID)
	if err != nil || !found {
		return 0, err
	}

	localManga, found, err := a.store.GetLibraryManga(mangaID)
	if err != nil || !found {
		return 0, fmt.Errorf("local manga not found: %s", mangaID)
	}

	onlineChapters, err := a.GetOnlineMangaChapters(link.OnlineSource, link.OnlineComicID, link.OnlineTitle)
	if err != nil {
		return 0, fmt.Errorf("get online chapters: %w", err)
	}

	manifest, err := library.GetReaderManifestWithSources(a.getActiveSources(), mangaID)
	if err != nil {
		return 0, fmt.Errorf("get local manifest: %w", err)
	}

	// Filter tasks already queued and collect downloaded groups
	existingTasks, _ := a.downloads.GetTasks()
	existingTaskChapters := make(map[string]bool)
	downloadedGroups := make(map[string]bool)
	for _, t := range existingTasks {
		if t.Source == link.OnlineSource && t.MangaID == link.OnlineComicID {
			existingTaskChapters[t.ChapterID] = true
			grp := strings.TrimSpace(t.ChapterGroup)
			if t.Status == contracts.DownloadStatusCompleted && grp != "" {
				downloadedGroups[grp] = true
			}
		}
	}

	groupLocalNumbers := make(map[string]map[float64]bool)
	groupMaxNumber := make(map[string]float64)
	allLocalNumbers := make(map[float64]bool)
	var globalMaxLocalNumber float64 = -1
	localDownloadedChapterIDs := make(map[string]bool)

	// Collect known groups from online chapters
	knownGroups := make(map[string]bool)
	for _, ch := range onlineChapters {
		g := strings.TrimSpace(ch.Group)
		if g != "" {
			knownGroups[g] = true
		}
	}

	type localChapterInfo struct {
		title     string
		localPath string
		number    float64
		group     string
	}
	var localChapters []localChapterInfo

	for _, ch := range manifest.Chapters {
		allLocalNumbers[ch.Number] = true
		if ch.Number > globalMaxLocalNumber {
			globalMaxLocalNumber = ch.Number
		}

		if strings.HasPrefix(ch.Notes, "{") {
			var notes contracts.ComicInfoNotes
			if err := json.Unmarshal([]byte(ch.Notes), &notes); err == nil && notes.ChapterID != "" {
				localDownloadedChapterIDs[notes.ChapterID] = true
			}
		}

		var matchedGroup string
		if ch.Group != "" {
			if knownGroups[ch.Group] {
				matchedGroup = ch.Group
			} else {
				for g := range knownGroups {
					if strings.EqualFold(ch.Group, g) {
						matchedGroup = g
						break
					}
				}
			}
		}
		if matchedGroup == "" {
			for g := range knownGroups {
				if strings.Contains(ch.LocalPath, g) || strings.Contains(ch.Title, g) {
					matchedGroup = g
					break
				}
			}
		}
		if matchedGroup != "" {
			downloadedGroups[matchedGroup] = true
			if groupLocalNumbers[matchedGroup] == nil {
				groupLocalNumbers[matchedGroup] = make(map[float64]bool)
			}
			groupLocalNumbers[matchedGroup][ch.Number] = true
			if ch.Number > groupMaxNumber[matchedGroup] {
				groupMaxNumber[matchedGroup] = ch.Number
			}
		}

		localChapters = append(localChapters, localChapterInfo{
			title:     ch.Title,
			localPath: ch.LocalPath,
			number:    ch.Number,
			group:     matchedGroup,
		})
	}

	var inputs []contracts.CreateDownloadTaskInput
	var lastChapterTitle string

	for _, ch := range onlineChapters {
		if existingTaskChapters[ch.ID] || localDownloadedChapterIDs[ch.ID] {
			continue
		}

		grp := strings.TrimSpace(ch.Group)
		targetGroup := strings.TrimSpace(link.TargetGroup)
		if targetGroup != "" && !strings.EqualFold(targetGroup, "all") {
			// If user explicitly configured TargetGroup, strictly match it!
			matched := false
			if strings.EqualFold(targetGroup, "default") || targetGroup == "话" {
				matched = strings.EqualFold(grp, "default") || grp == "话" || grp == ""
			} else if strings.EqualFold(targetGroup, "tankobon") || targetGroup == "单行本" || targetGroup == "卷" {
				matched = strings.EqualFold(grp, "tankobon") || grp == "单行本" || grp == "卷"
			} else {
				matched = strings.EqualFold(grp, targetGroup)
			}
			if !matched {
				continue
			}
		} else if len(downloadedGroups) > 0 && grp != "" && !downloadedGroups[grp] {
			// If user previously downloaded specific groups, only auto-follow new chapters in those groups
			continue
		}

		locNums := groupLocalNumbers[grp]
		maxNum, hasGroupMax := groupMaxNumber[grp]
		if !hasGroupMax {
			locNums = allLocalNumbers
			maxNum = globalMaxLocalNumber
		}
		if link.BaselineChapterNumber > maxNum {
			maxNum = link.BaselineChapterNumber
		}

		effectiveChapterNumber := ch.Number
		if effectiveChapterNumber <= 0 {
			if semanticNum := downloader.ExtractChapterNumber(ch.Title, -1); semanticNum >= 0 {
				effectiveChapterNumber = semanticNum
			}
		}

		alreadyDownloaded := false
		if locNums != nil && (locNums[ch.Number] || locNums[effectiveChapterNumber]) {
			alreadyDownloaded = true
		} else {
			for _, locCh := range localChapters {
				if grp != "" && locCh.group != "" && !strings.EqualFold(locCh.group, grp) {
					continue
				}
				if downloader.MatchChapterTitle(ch.Title, locCh.title, locCh.localPath) {
					alreadyDownloaded = true
					break
				}
			}
		}

		shouldDownload := false
		if !alreadyDownloaded {
			if link.FollowPolicy == "fill_gaps" {
				shouldDownload = true
			} else { // latest_only default
				if ch.Number > maxNum && effectiveChapterNumber > maxNum {
					shouldDownload = true
				}
			}
		}

		if shouldDownload {
			inputs = append(inputs, contracts.CreateDownloadTaskInput{
				Source:         link.OnlineSource,
				MangaID:        link.OnlineComicID,
				MangaTitle:     link.OnlineTitle,
				ChapterID:      ch.ID,
				ChapterTitle:   ch.Title,
				ChapterNumber:  effectiveChapterNumber,
				ChapterGroup:   ch.Group,
				TargetSourceID: localManga.SourceID,
			})
			lastChapterTitle = ch.Title
		}
	}

	if len(inputs) > 0 {
		if _, err := a.downloads.CreateTasks(inputs); err != nil {
			return 0, err
		}
	}

	link.LastCheckedAt = time.Now().UTC().Format(time.RFC3339)
	if lastChapterTitle != "" {
		link.LastNotifiedChapter = lastChapterTitle
	}
	_ = a.store.SaveMangaOnlineLink(link)

	return len(inputs), nil
}

func (a *App) GetFollowedUpdateCheckStatus() contracts.FollowedUpdateCheckProgress {
	a.updateCheckMu.Lock()
	defer a.updateCheckMu.Unlock()
	return a.updateCheckStatus
}

func (a *App) CheckAllFollowedUpdates() (int, error) {
	if err := a.ensureReady(); err != nil {
		return 0, err
	}

	a.updateCheckMu.Lock()
	if a.updateCheckStatus.Checking {
		queued := a.updateCheckStatus.Queued
		a.updateCheckMu.Unlock()
		logger.Get().Info("Followed updates check already in progress, returning current state")
		return queued, nil
	}

	links, err := a.store.GetAutoFollowMangaLinks()
	if err != nil {
		a.updateCheckMu.Unlock()
		return 0, err
	}

	total := len(links)
	a.updateCheckStatus = contracts.FollowedUpdateCheckProgress{
		Checking: true,
		Current:  0,
		Total:    total,
		Queued:   0,
	}
	progressCopy := a.updateCheckStatus
	a.updateCheckMu.Unlock()

	a.emit(contracts.EventFollowedUpdateCheckProgress, progressCopy)

	if total == 0 {
		a.updateCheckMu.Lock()
		a.updateCheckStatus = contracts.FollowedUpdateCheckProgress{
			Checking: false,
			Current:  0,
			Total:    0,
			Queued:   0,
		}
		progressCopy = a.updateCheckStatus
		a.updateCheckMu.Unlock()

		a.emit(contracts.EventFollowedUpdateCheckProgress, progressCopy)
		logger.Get().Info("Followed comics update check complete, no followed manga found")
		return 0, nil
	}

	totalQueued := 0
	for i, link := range links {
		n, err := a.CheckMangaUpdates(link.MangaID)
		if err != nil {
			logger.Get().Warn("Failed to check updates for followed manga %s (%s): %v", link.MangaID, link.OnlineTitle, err)
		} else {
			totalQueued += n
		}

		a.updateCheckMu.Lock()
		a.updateCheckStatus.Current = i + 1
		a.updateCheckStatus.Queued = totalQueued
		progressCopy = a.updateCheckStatus
		a.updateCheckMu.Unlock()

		a.emit(contracts.EventFollowedUpdateCheckProgress, progressCopy)

		if i < total-1 {
			time.Sleep(1000 * time.Millisecond)
		}
	}

	a.updateCheckMu.Lock()
	a.updateCheckStatus.Checking = false
	progressCopy = a.updateCheckStatus
	a.updateCheckMu.Unlock()

	a.emit(contracts.EventFollowedUpdateCheckProgress, progressCopy)
	logger.Get().Info("Followed comics update check complete, queued %d new chapters", totalQueued)
	return totalQueued, nil
}

func (a *App) OpenLogDirectory() error {
	logDir := logger.Get().LogDir()
	if logDir == "" {
		if a.store != nil {
			logDir = filepath.Join(a.store.DataDir(), "logs")
		}
	}
	if logDir == "" {
		return fmt.Errorf("log directory not initialized")
	}
	_ = os.MkdirAll(logDir, 0o755)

	if wailsApp := application.Get(); wailsApp != nil && wailsApp.Env != nil {
		return wailsApp.Env.OpenFileManager(logDir, false)
	}
	return library.FileOpener(logDir)
}

func (a *App) ToggleMangaAutoFollow(mangaID string) (bool, error) {
	if err := a.ensureReady(); err != nil {
		return false, err
	}
	link, found, err := a.store.GetMangaOnlineLink(mangaID)
	if err != nil {
		return false, err
	}
	if !found {
		return false, fmt.Errorf("manga not linked to any online source")
	}

	link.AutoFollow = !link.AutoFollow
	if err := a.store.SaveMangaOnlineLink(link); err != nil {
		return false, err
	}
	logger.Get().Info("Toggled auto follow for manga %s (%s): %v", mangaID, link.OnlineTitle, link.AutoFollow)
	return link.AutoFollow, nil
}

func (a *App) GetAllMangaOnlineLinks() ([]contracts.MangaOnlineLink, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	return a.store.GetAllMangaOnlineLinks()
}

func (a *App) LoginCopyManga(username string, password string) (contracts.CopyMangaLoginResult, error) {
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)

	if username == "" || password == "" {
		return contracts.CopyMangaLoginResult{Success: false}, fmt.Errorf("username and password cannot be empty")
	}

	if err := a.ensureReady(); err != nil {
		return contracts.CopyMangaLoginResult{Success: false}, err
	}
	if a.copyManga == nil {
		return contracts.CopyMangaLoginResult{Success: false}, fmt.Errorf("copymanga client not initialized")
	}

	token, err := a.copyManga.LoginUser(context.Background(), username, password)
	if err != nil {
		return contracts.CopyMangaLoginResult{Success: false}, fmt.Errorf("login failed: %w", err)
	}

	machineID := crypto.GetMachineID()
	encPwd, err := crypto.EncryptPassword(password, machineID, username)
	if err != nil {
		return contracts.CopyMangaLoginResult{Success: false}, fmt.Errorf("encrypt password: %w", err)
	}

	st := a.settings.Get()
	st.Downloader.CopyMangaUsername = username
	st.Downloader.CopyMangaPasswordEncrypted = encPwd
	st.Downloader.CopyMangaToken = token
	updated, err := a.settings.Update(st)
	if err != nil {
		return contracts.CopyMangaLoginResult{Success: false}, fmt.Errorf("persist credentials: %w", err)
	}

	a.copyManga.SetUserToken(token)
	a.copyManga.SetUserCredentials(username, encPwd)
	a.emit(contracts.EventSettingsUpdated, updated)

	return contracts.CopyMangaLoginResult{
		Success:   true,
		Username:  username,
		Token:     token,
		IsDevMode: a.GetIsDevMode(),
		Message:   "login_success",
	}, nil
}

func (a *App) LogoutCopyManga() error {
	if err := a.ensureReady(); err != nil {
		return err
	}

	st := a.settings.Get()
	st.Downloader.CopyMangaUsername = ""
	st.Downloader.CopyMangaPasswordEncrypted = ""
	st.Downloader.CopyMangaToken = ""
	updated, err := a.settings.Update(st)
	if err != nil {
		return fmt.Errorf("clear credentials: %w", err)
	}
	if a.copyManga != nil {
		a.copyManga.SetUserToken("")
		a.copyManga.SetUserCredentials("", "")
	}
	a.emit(contracts.EventSettingsUpdated, updated)
	return nil
}

func (a *App) GetIsDevMode() bool {
	a.devModeLock.RLock()
	defer a.devModeLock.RUnlock()
	return a.isDevMode
}

func (a *App) SetDevMode(enabled bool) error {
	a.devModeLock.Lock()
	a.isDevMode = enabled
	a.devModeLock.Unlock()
	logger.Get().Info("Developer mode updated to %v", enabled)
	return nil
}

func (a *App) GetDevInfo() (contracts.DevInfo, error) {
	a.devModeLock.RLock()
	isDev := a.isDevMode
	a.devModeLock.RUnlock()

	machineID := crypto.GetMachineID()
	keySource, keyFingerprint := crypto.GetKeyFingerprint(machineID, "root")
	accountCount := 0
	if a.store != nil {
		accounts, _ := a.store.GetCopyMangaAccounts()
		accountCount = len(accounts)
	}

	return contracts.DevInfo{
		IsDevMode:      isDev,
		KeySource:      keySource,
		KeyFingerprint: keyFingerprint,
		MachineID:      machineID,
		AccountCount:   accountCount,
	}, nil
}

func (a *App) GetCopyMangaAccounts() ([]contracts.CopyMangaAccount, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	accounts, err := a.store.GetCopyMangaAccounts()
	if err != nil {
		return nil, err
	}
	machineID := crypto.GetMachineID()
	for i := range accounts {
		if accounts[i].Platform == "" {
			accounts[i].Platform = "copymanga"
		}
		if accounts[i].Password != "" {
			if plain, decErr := crypto.DecryptPassword(accounts[i].Password, machineID, accounts[i].Username); decErr == nil && plain != "" {
				accounts[i].Password = plain
			}
		}
	}
	return accounts, nil
}

func (a *App) AddCopyMangaAccount(username string, password string, token string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	username = strings.TrimSpace(username)
	password = strings.TrimSpace(password)
	token = strings.TrimSpace(token)

	if username == "" {
		return fmt.Errorf("username cannot be empty")
	}

	if token == "" && password != "" {
		if a.copyManga == nil {
			return fmt.Errorf("copymanga client not initialized")
		}
		tok, err := a.copyManga.LoginUser(context.Background(), username, password)
		if err != nil {
			return fmt.Errorf("login account: %w", err)
		}
		token = tok
	}

	machineID := crypto.GetMachineID()
	encPwd, err := crypto.EncryptPassword(password, machineID, username)
	if err != nil {
		return fmt.Errorf("encrypt password: %w", err)
	}

	acc := contracts.CopyMangaAccount{
		Username:      username,
		Password:      encPwd,
		Token:         token,
		LimitedAt:     0,
		LastCheckedAt: time.Now().Unix(),
	}

	return a.store.SaveCopyMangaAccount(acc)
}

func (a *App) DeleteCopyMangaAccount(username string) error {
	if err := a.ensureReady(); err != nil {
		return err
	}
	return a.store.DeleteCopyMangaAccount(strings.TrimSpace(username))
}

func (a *App) ImportCopyMangaAccounts(inputs []contracts.CopyMangaAccountInput) (contracts.CopyMangaAccountImportResult, error) {
	result := contracts.CopyMangaAccountImportResult{
		Total: len(inputs),
	}
	if err := a.ensureReady(); err != nil {
		return result, err
	}
	if a.store == nil {
		return result, fmt.Errorf("store not initialized")
	}

	existingAccounts, err := a.store.GetCopyMangaAccounts()
	if err != nil {
		return result, err
	}
	existingMap := make(map[string]contracts.CopyMangaAccount, len(existingAccounts))
	for _, acc := range existingAccounts {
		existingMap[acc.Username] = acc
	}

	machineID := crypto.GetMachineID()
	now := time.Now().Unix()

	for _, item := range inputs {
		username := strings.TrimSpace(item.Username)
		password := strings.TrimSpace(item.Password)
		token := strings.TrimSpace(item.Token)

		if username == "" {
			result.Skipped++
			continue
		}

		encPwd, err := crypto.EncryptPassword(password, machineID, username)
		if err != nil {
			result.Skipped++
			continue
		}
		acc := contracts.CopyMangaAccount{
			Username:      username,
			Password:      encPwd,
			Token:         token,
			LimitedAt:     0,
			LastCheckedAt: now,
		}

		if old, exists := existingMap[username]; exists {
			if password == "" {
				acc.Password = old.Password
			}
			if token == "" {
				acc.Token = old.Token
			}
			acc.LimitedAt = old.LimitedAt
			if err := a.store.SaveCopyMangaAccount(acc); err != nil {
				result.Skipped++
				continue
			}
			existingMap[username] = acc
			result.Updated++
		} else {
			if err := a.store.SaveCopyMangaAccount(acc); err != nil {
				result.Skipped++
				continue
			}
			existingMap[username] = acc
			result.Imported++
		}
	}

	return result, nil
}
