//go:build server

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func initApplicationMenu(app *application.App) {
	// Headless server mode does not provide application menu
}
