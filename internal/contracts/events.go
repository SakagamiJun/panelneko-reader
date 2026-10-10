package contracts

type ThemeResolvedPayload struct {
	Mode     string `json:"mode"`
	Resolved string `json:"resolved"`
}

type LocaleResolvedPayload struct {
	Mode   string `json:"mode"`
	Locale string `json:"locale"`
}

const (
	EventSettingsUpdated      = "settings:updated"
	EventThemeResolved        = "theme:resolved"
	EventLocaleResolved       = "locale:resolved"
	EventLibraryUpdated       = "library:updated"
	EventFilesDropped         = "files:dropped"
	EventFilesOpened          = "files:opened"
	EventDownloadProgress     = "download:progress"
	EventDownloadTasksUpdated = "download:tasks_updated"
)
