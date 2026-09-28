package main

import (
	"embed"
	"log"
	"net/http"

	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	appService := NewApp()
	assetHandler := appService.assetHandler()

	app := application.New(application.Options{
		Name:        "PanelNeko Reader",
		Description: "A modern, high-performance manga and comic reader.",
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

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "PanelNeko Reader",
		Width:            1440,
		Height:           960,
		MinWidth:         1180,
		MinHeight:        760,
		BackgroundColour: application.NewRGB(243, 247, 252),
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHidden,
		},
		URL: "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
