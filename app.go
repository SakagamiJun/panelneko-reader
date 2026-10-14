package main

import (
	"context"
	"embed"
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
	"github.com/sakagamijun/panelneko-reader/internal/downloader"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/copymanga"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/klz9"
	"github.com/sakagamijun/panelneko-reader/internal/library"
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
	bootErr         error
	store           *store.SQLiteStore
	settings        *settings.Service
	copyManga       *copymanga.Client
	klz9            *klz9.Client
	downloads       *downloader.Manager
	scanMu          sync.Mutex
	scanOnce        sync.Once
	updater         *updater.Updater
	updaterProvider updater.Provider
	isHomebrewFn    func() bool
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
	copyClient := copymanga.NewClient(st.Downloader.CopyMangaAPIDomain, st.Downloader.CopyMangaToken, 15)
	copyClient.SetCDNSettings(st.Downloader.CopyMangaCDNMode, st.Downloader.CopyMangaCustomCDNs)
	klzClient := klz9.NewClient(storeValue, st.Downloader.RawMangaBaseURL, 20)
	downloadMgr := downloader.NewManager(storeValue, settingsService, copyClient, klzClient)
	downloadMgr.SetEmitter(a.emit)
	downloadMgr.SetOnDownloadFinished(func(outputPath string) {
		go func() {
			_, _ = a.performSourcesScan()
		}()
	})

	a.copyManga = copyClient
	a.klz9 = klzClient
	a.downloads = downloadMgr

	if st.Downloader.AutoCheckComicUpdates {
		go func() {
			time.Sleep(8 * time.Second)
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

	updated, err := a.settings.Update(input)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	if a.copyManga != nil {
		a.copyManga.SetAPIDomain(updated.Downloader.CopyMangaAPIDomain)
		a.copyManga.SetToken(updated.Downloader.CopyMangaToken)
		a.copyManga.SetCDNSettings(updated.Downloader.CopyMangaCDNMode, updated.Downloader.CopyMangaCustomCDNs)
	}
	if a.klz9 != nil {
		a.klz9.SetBaseURL(updated.Downloader.RawMangaBaseURL)
	}

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
	if currentSettings.DuplicateMergeMode == contracts.DuplicateMergeModeMerge {
		items = library.MergeLibraryManga(items, currentSettings.LibrarySources, pins)
	}

	items = library.ApplyPinsAndSort(items, pins, currentSettings.DuplicateMergeMode)

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

	return library.GetReaderManifestWithSources(a.getActiveSources(), mangaID, a.settings.Get().DuplicateMergeMode)
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
				sourcesMap[src.ID] = src.Path
			}
			if src.ID == "default" || defaultRoot == "" {
				defaultRoot = src.Path
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

	switch source {
	case copymanga.SiteName:
		if a.copyManga == nil {
			return contracts.OnlineSearchResult{}, fmt.Errorf("copymanga client not initialized")
		}
		return a.copyManga.SearchManga(ctx, query, page, limit)
	case klz9.SiteName:
		if a.klz9 == nil {
			return contracts.OnlineSearchResult{}, fmt.Errorf("klz9 client not initialized")
		}
		return a.klz9.SearchManga(ctx, query, page, limit)
	default:
		return contracts.OnlineSearchResult{}, fmt.Errorf("unknown source: %s", source)
	}
}

func (a *App) GetOnlineMangaChapters(source string, mangaID string) ([]contracts.OnlineMangaChapter, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	switch source {
	case copymanga.SiteName:
		if a.copyManga == nil {
			return nil, fmt.Errorf("copymanga client not initialized")
		}
		return a.copyManga.GetMangaChapters(ctx, mangaID)
	case klz9.SiteName:
		if a.klz9 == nil {
			return nil, fmt.Errorf("klz9 client not initialized")
		}
		return a.klz9.GetMangaChapters(ctx, mangaID)
	default:
		return nil, fmt.Errorf("unknown source: %s", source)
	}
}

func (a *App) CreateDownloadTasks(inputs []contracts.CreateDownloadTaskInput) ([]contracts.DownloadTask, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}
	if a.downloads == nil {
		return nil, fmt.Errorf("download manager not initialized")
	}
	return a.downloads.CreateTasks(inputs)
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

	onlineChapters, err := a.GetOnlineMangaChapters(link.OnlineSource, link.OnlineComicID)
	if err != nil {
		return 0, fmt.Errorf("get online chapters: %w", err)
	}

	manifest, err := library.GetReaderManifestWithSources(a.getActiveSources(), mangaID, a.settings.Get().DuplicateMergeMode)
	if err != nil {
		return 0, fmt.Errorf("get local manifest: %w", err)
	}

	localNumbers := make(map[float64]bool)
	var maxLocalNumber float64 = -1
	for _, ch := range manifest.Chapters {
		localNumbers[ch.Number] = true
		if ch.Number > maxLocalNumber {
			maxLocalNumber = ch.Number
		}
	}

	// Filter tasks already queued
	existingTasks, _ := a.downloads.GetTasks()
	existingTaskChapters := make(map[string]bool)
	for _, t := range existingTasks {
		if t.Source == link.OnlineSource && t.MangaID == link.OnlineComicID {
			existingTaskChapters[t.ChapterID] = true
		}
	}

	var inputs []contracts.CreateDownloadTaskInput
	var lastChapterTitle string

	for _, ch := range onlineChapters {
		if existingTaskChapters[ch.ID] {
			continue
		}

		shouldDownload := false
		if link.FollowPolicy == "fill_gaps" {
			if !localNumbers[ch.Number] {
				shouldDownload = true
			}
		} else { // latest_only default
			if ch.Number > maxLocalNumber {
				shouldDownload = true
			}
		}

		if shouldDownload {
			inputs = append(inputs, contracts.CreateDownloadTaskInput{
				Source:         link.OnlineSource,
				MangaID:        link.OnlineComicID,
				MangaTitle:     link.OnlineTitle,
				ChapterID:      ch.ID,
				ChapterTitle:   ch.Title,
				ChapterNumber:  ch.Number,
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

func (a *App) CheckAllFollowedUpdates() (int, error) {
	if err := a.ensureReady(); err != nil {
		return 0, err
	}
	links, err := a.store.GetAutoFollowMangaLinks()
	if err != nil {
		return 0, err
	}

	totalQueued := 0
	for _, link := range links {
		n, err := a.CheckMangaUpdates(link.MangaID)
		if err == nil {
			totalQueued += n
		}
		time.Sleep(1500 * time.Millisecond)
	}

	return totalQueued, nil
}
