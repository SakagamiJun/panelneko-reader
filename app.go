package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed wails.json
var wailsConfig embed.FS

type wailsProjectConfig struct {
	Info struct {
		Version string `json:"version"`
		Commit  string `json:"commit"`
	} `json:"info"`
}

var buildCommit string

func (a *App) GetAppVersion() contracts.AppVersionInfo {
	version := "0.1.0"
	commit := buildCommit

	data, err := wailsConfig.ReadFile("wails.json")
	if err == nil {
		var cfg wailsProjectConfig
		if json.Unmarshal(data, &cfg) == nil {
			if cfg.Info.Version != "" {
				version = cfg.Info.Version
			}
			if commit == "" && cfg.Info.Commit != "" {
				commit = cfg.Info.Commit
			}
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

	return contracts.AppVersionInfo{
		Version: version,
		Commit:  commit,
	}
}

type githubReleaseResponse struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	HTMLURL     string `json:"html_url"`
	Body        string `json:"body"`
	PublishedAt string `json:"published_at"`
	Draft       bool   `json:"draft"`
	Prerelease  bool   `json:"prerelease"`
}

func compareVersions(v1, v2 string) int {
	clean1 := strings.TrimPrefix(strings.TrimSpace(v1), "v")
	clean2 := strings.TrimPrefix(strings.TrimSpace(v2), "v")

	parts1 := strings.Split(clean1, ".")
	parts2 := strings.Split(clean2, ".")

	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}

	for i := 0; i < maxLen; i++ {
		var n1, n2 int
		if i < len(parts1) {
			sub := strings.SplitN(parts1[i], "-", 2)[0]
			n1, _ = strconv.Atoi(sub)
		}
		if i < len(parts2) {
			sub := strings.SplitN(parts2[i], "-", 2)[0]
			n2, _ = strconv.Atoi(sub)
		}
		if n1 < n2 {
			return -1
		}
		if n1 > n2 {
			return 1
		}
	}
	return 0
}

func (a *App) CheckForUpdates() (contracts.UpdateCheckResult, error) {
	currentInfo := a.GetAppVersion()
	currentVer := currentInfo.Version

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/repos/SakagamiJun/panelneko-reader/releases/latest", nil)
	if err != nil {
		return contracts.UpdateCheckResult{}, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("User-Agent", "PanelNeko-Reader/"+currentVer)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return contracts.UpdateCheckResult{}, fmt.Errorf("check update: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return contracts.UpdateCheckResult{}, fmt.Errorf("github api returned status %d", resp.StatusCode)
	}

	var rel githubReleaseResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&rel); err != nil {
		return contracts.UpdateCheckResult{}, fmt.Errorf("decode release: %w", err)
	}

	latestVer := strings.TrimPrefix(rel.TagName, "v")
	hasUpdate := compareVersions(currentVer, latestVer) < 0

	return contracts.UpdateCheckResult{
		HasUpdate:      hasUpdate,
		CurrentVersion: currentVer,
		LatestVersion:  latestVer,
		ReleaseURL:     rel.HTMLURL,
		ReleaseNotes:   rel.Body,
		PublishedAt:    rel.PublishedAt,
	}, nil
}

func (a *App) OpenURL(targetURL string) error {
	if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
		return fmt.Errorf("invalid url scheme: %s", targetURL)
	}
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, targetURL)
	}
	return nil
}

type App struct {
	ctx      context.Context
	bootErr  error
	store    *store.SQLiteStore
	settings *settings.Service
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.bootErr = a.bootstrap()
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

	a.emit(contracts.EventSettingsUpdated, updated)

	return updated, nil
}

func (a *App) SelectDirectory() (string, error) {
	if err := a.ensureReady(); err != nil {
		return "", err
	}

	selected, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Manga Library Directory",
	})
	if err != nil {
		return "", err
	}

	return selected, nil
}

func (a *App) ListLibraryManga() ([]contracts.LibraryManga, error) {
	if err := a.ensureReady(); err != nil {
		return nil, err
	}

	records, err := a.store.ListLibraryManga()
	if err != nil {
		return nil, err
	}

	prevModTimes := make(map[string]int64)
	prevItems := make(map[string]contracts.LibraryManga)
	for _, r := range records {
		prevModTimes[r.RelativePath] = r.ModTime
		prevItems[r.RelativePath] = r.LibraryManga
	}

	items, newModTimes, err := library.ScanLibraryManga(a.settings.Get().LibraryRoot, prevItems, prevModTimes)
	if err != nil {
		return nil, err
	}

	if err := a.store.SaveLibraryManga(items, newModTimes); err != nil {
		return nil, err
	}

	pins, err := a.store.GetPinnedMap()
	if err != nil {
		return nil, err
	}

	items = library.ApplyPinsAndSort(items, pins)

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

	isCollection, err := library.ToggleCollectionMarker(a.settings.Get().LibraryRoot, mangaID)
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

	dirPath, err := library.ResolveDirectoryPath(a.settings.Get().LibraryRoot, mangaID)
	if err != nil {
		return err
	}

	return library.FileOpener(dirPath)
}

func (a *App) GetReaderManifest(mangaID string) (contracts.ReaderManifest, error) {
	if err := a.ensureReady(); err != nil {
		return contracts.ReaderManifest{}, err
	}

	return library.GetReaderManifest(a.settings.Get().LibraryRoot, mangaID)
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

		libraryRoot := a.settings.Get().LibraryRoot
		if strings.HasPrefix(request.URL.Path, library.LibraryArchiveAssetPrefix) {
			reader, contentType, contentLength, err := library.OpenArchiveAsset(libraryRoot, request.URL.Path)
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

			_, _ = io.Copy(writer, reader)
			return
		}

		targetPath, err := library.ResolveLibraryAssetPath(libraryRoot, request.URL.Path)
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
	if a.ctx == nil {
		return
	}

	runtime.EventsEmit(a.ctx, event, payload)
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
