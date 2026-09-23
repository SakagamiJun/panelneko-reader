package contracts

type LocaleMode string

const (
	LocaleModeSystem LocaleMode = "system"
	LocaleModeManual LocaleMode = "manual"
)

type ThemeMode string

const (
	ThemeModeSystem ThemeMode = "system"
	ThemeModeLight  ThemeMode = "light"
	ThemeModeDark   ThemeMode = "dark"
)

type ReaderDirection string

const (
	ReaderDirectionRTL ReaderDirection = "rtl"
	ReaderDirectionLTR ReaderDirection = "ltr"
)

type ReaderSpreadMode string

const (
	ReaderSpreadModeAuto   ReaderSpreadMode = "auto"
	ReaderSpreadModeSingle ReaderSpreadMode = "single"
	ReaderSpreadModeDouble ReaderSpreadMode = "double"
)

type ReaderFitMode string

const (
	ReaderFitModeContain  ReaderFitMode = "contain"
	ReaderFitModeWidth    ReaderFitMode = "width"
	ReaderFitModeHeight   ReaderFitMode = "height"
	ReaderFitModeOriginal ReaderFitMode = "original"
)

type ReaderFilter string

const (
	ReaderFilterNone         ReaderFilter = "none"
	ReaderFilterInvert       ReaderFilter = "invert"
	ReaderFilterSepia        ReaderFilter = "sepia"
	ReaderFilterHighContrast ReaderFilter = "high-contrast"
)

type ReaderSideClickMode string

const (
	ReaderSideClickModeRightNext ReaderSideClickMode = "right_next"
	ReaderSideClickModeFollow    ReaderSideClickMode = "follow"
	ReaderSideClickModeLeftNext  ReaderSideClickMode = "left_next"
)

type AppSettings struct {
	LibraryRoot               string              `json:"libraryRoot"`
	LocaleMode                LocaleMode          `json:"localeMode"`
	Locale                    string              `json:"locale"`
	ThemeMode                 ThemeMode           `json:"themeMode"`
	ReaderScrollCachePages    int                 `json:"readerScrollCachePages"`
	AutoRestoreReaderProgress bool                `json:"autoRestoreReaderProgress"`
	ReaderDirection           ReaderDirection     `json:"readerDirection"`
	ReaderSpreadMode          ReaderSpreadMode    `json:"readerSpreadMode"`
	ReaderCoverSolo           bool                `json:"readerCoverSolo"`
	ReaderFitMode             ReaderFitMode       `json:"readerFitMode"`
	ReaderFilter              ReaderFilter        `json:"readerFilter"`
	ReaderSideClickMode       ReaderSideClickMode `json:"readerSideClickMode"`
	ReaderClickCenterZoom     bool                `json:"readerClickCenterZoom"`
	ReaderDoubleClickZoom     bool                `json:"readerDoubleClickZoom"`
	Shortcuts                 map[string]string   `json:"shortcuts"`
	AutoCheckUpdates          *bool               `json:"autoCheckUpdates,omitempty"`
	EnableThumbnailCache      *bool               `json:"enableThumbnailCache,omitempty"`
}

type LibraryManga struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	SourceURL     string `json:"sourceURL"`
	RelativePath  string `json:"relativePath"`
	ParentPath    string `json:"parentPath,omitempty"`
	IsCollection  bool   `json:"isCollection,omitempty"`
	MangaCount    int    `json:"mangaCount,omitempty"`
	CoverImageURL string `json:"coverImageURL"`
	ChapterCount  int    `json:"chapterCount"`
	PageCount     int    `json:"pageCount"`
	LastUpdated   string `json:"lastUpdated"`
	IsPinned      bool   `json:"isPinned,omitempty"`
	PinnedAt      string `json:"pinnedAt,omitempty"`
}

type ReaderManifest struct {
	MangaID       string          `json:"mangaID"`
	Title         string          `json:"title"`
	CoverImageURL string          `json:"coverImageURL"`
	TotalPages    int             `json:"totalPages"`
	Chapters      []ReaderChapter `json:"chapters"`
}

type ReaderChapter struct {
	ID          string       `json:"id"`
	Title       string       `json:"title"`
	Number      float64      `json:"number"`
	StartPage   int          `json:"startPage"`
	PageCount   int          `json:"pageCount"`
	Pages       []ReaderPage `json:"pages"`
	LocalPath   string       `json:"localPath"`
	CompletedAt string       `json:"completedAt"`
}

type ReaderPage struct {
	ID           string `json:"id"`
	ChapterID    string `json:"chapterID"`
	ChapterTitle string `json:"chapterTitle"`
	PageIndex    int    `json:"pageIndex"`
	FileName     string `json:"fileName"`
	SourceURL    string `json:"sourceURL"`
}

type ReaderProgress struct {
	MangaID   string `json:"mangaID"`
	ChapterID string `json:"chapterID"`
	Page      int    `json:"page"`
	UpdatedAt string `json:"updatedAt"`
}

type AppVersionInfo struct {
	Version string `json:"version"`
	Commit  string `json:"commit,omitempty"`
}

type UpdateCheckResult struct {
	HasUpdate      bool   `json:"hasUpdate"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	ReleaseURL     string `json:"releaseURL"`
	ReleaseNotes   string `json:"releaseNotes,omitempty"`
	PublishedAt    string `json:"publishedAt,omitempty"`
}
