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
	"sort"
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
	} `json:"info"`
}

func (a *App) GetAppVersion() string {
	data, err := wailsConfig.ReadFile("wails.json")
	if err != nil {
		return "0.0.0"
	}
	var cfg wailsProjectConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return "0.0.0"
	}
	return cfg.Info.Version
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

	sort.SliceStable(items, func(i, j int) bool {
		return items[i].LastUpdated > items[j].LastUpdated
	})

	return items, nil
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

func (a *App) AssetHandler() http.Handler {
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

			if contentType != "" {
				writer.Header().Set("Content-Type", contentType)
			}
			if contentLength >= 0 {
				writer.Header().Set("Content-Length", fmt.Sprintf("%d", contentLength))
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
