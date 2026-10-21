package main

import (
	"embed"
	"log"
	"net/http"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[contracts.AppSettings](contracts.EventSettingsUpdated)
	application.RegisterEvent[application.Void](contracts.EventLibraryUpdated)
	application.RegisterEvent[contracts.ThemeResolvedPayload](contracts.EventThemeResolved)
	application.RegisterEvent[contracts.LocaleResolvedPayload](contracts.EventLocaleResolved)
	application.RegisterEvent[[]string](contracts.EventFilesDropped)
	application.RegisterEvent[[]string](contracts.EventFilesOpened)
	application.RegisterEvent[contracts.DownloadProgress](contracts.EventDownloadProgress)
	application.RegisterEvent[application.Void](contracts.EventDownloadTasksUpdated)
	application.RegisterEvent[contracts.FollowedUpdateCheckProgress](contracts.EventFollowedUpdateCheckProgress)
}

func main() {
	appService := NewApp()
	assetHandler := appService.assetHandler()

	app := application.New(application.Options{
		Name:        "PanelNeko Reader",
		Description: "A modern, high-performance manga and comic reader.",
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.panelneko.reader",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				if win, ok := application.Get().Window.GetByName("main"); ok {
					win.Focus()
				}
				if len(data.Args) > 1 {
					application.Get().Event.Emit(contracts.EventFilesOpened, data.Args[1:])
				}
			},
		},
		FileAssociations: []string{".cbz", ".cbr", ".zip", ".rar"},
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
					if library.IsLibraryAssetRequest(request.URL.Path) {
						assetHandler.ServeHTTP(writer, request)
						return
					}

					next.ServeHTTP(writer, request)
				})
			},
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	ghProvider, err := github.New(github.Config{
		Repository:   "SakagamiJun/panelneko-reader",
		AssetMatcher: matchPanelNekoAsset,
	})
	if err == nil {
		_ = app.Updater.Init(updater.Config{
			CurrentVersion: appService.GetAppVersion().Version,
			Providers:      []updater.Provider{ghProvider},
		})
	}

	app.Event.OnApplicationEvent(events.Common.ApplicationOpenedWithFile, func(event *application.ApplicationEvent) {
		opened := event.Context().OpenedFiles()
		if len(opened) == 0 && event.Context().Filename() != "" {
			opened = []string{event.Context().Filename()}
		}
		if len(opened) > 0 {
			application.Get().Event.Emit(contracts.EventFilesOpened, opened)
		}
	})

	app.Menu.SetApplicationMenu(application.DefaultApplicationMenu())

	initBg := application.NewRGB(243, 247, 252)
	if app.Env != nil && app.Env.IsDarkMode() {
		initBg = application.NewRGB(13, 15, 18)
	}

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "PanelNeko Reader",
		Width:            1440,
		Height:           960,
		MinWidth:         1180,
		MinHeight:        760,
		BackgroundColour: initBg,
		EnableFileDrop:   true,
		Mac: application.MacWindow{
			TitleBar:                     application.MacTitleBarHiddenInset,
			DisableEscapeExitsFullscreen: true,
		},
		URL: "/",
	})

	app.Event.On(contracts.EventThemeResolved, func(event *application.CustomEvent) {
		payload, ok := event.Data.(contracts.ThemeResolvedPayload)
		if !ok {
			return
		}
		if w, ok := application.Get().Window.GetByName("main"); ok {
			if payload.Resolved == "dark" {
				w.SetBackgroundColour(application.NewRGB(13, 15, 18))
			} else {
				w.SetBackgroundColour(application.NewRGB(243, 247, 252))
			}
		}
	})

	win.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		if len(files) > 0 {
			application.Get().Event.Emit(contracts.EventFilesDropped, files)
		}
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
