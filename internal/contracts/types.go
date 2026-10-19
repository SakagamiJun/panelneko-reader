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

type ThumbnailQuality string

const (
	ThumbnailQualityOff    ThumbnailQuality = "off"
	ThumbnailQualityLow    ThumbnailQuality = "low"
	ThumbnailQualityMedium ThumbnailQuality = "medium"
	ThumbnailQualityHigh   ThumbnailQuality = "high"
)

type SourceType string

const (
	SourceTypeLocal   SourceType = "local"
	SourceTypeSMB     SourceType = "smb"
	SourceTypeWebDAV  SourceType = "webdav"
	SourceTypeNetwork SourceType = "network"
)

type SourceStatus string

const (
	SourceStatusOnline   SourceStatus = "online"
	SourceStatusScanning SourceStatus = "scanning"
	SourceStatusOffline  SourceStatus = "offline"
	SourceStatusDisabled SourceStatus = "disabled"
)

type DuplicateMergeMode string

const (
	DuplicateMergeModeSeparate DuplicateMergeMode = "separate"
	DuplicateMergeModeMerge    DuplicateMergeMode = "merge"
)

type LibrarySource struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Type         SourceType   `json:"type"`
	Path         string       `json:"path"`
	Enabled      bool         `json:"enabled"`
	ReadOnly     bool         `json:"readOnly,omitempty"`
	Status       SourceStatus `json:"status,omitempty"`
	ErrorMessage string       `json:"errorMessage,omitempty"`
	MangaCount   int          `json:"mangaCount,omitempty"`
	LastScanned  string       `json:"lastScanned,omitempty"`
}

type AppSettings struct {
	LibraryRoot               string              `json:"libraryRoot"`
	LibrarySources            []LibrarySource     `json:"librarySources,omitempty"`
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
	ThumbnailQuality          ThumbnailQuality    `json:"thumbnailQuality,omitempty"`
	DuplicateMergeMode        DuplicateMergeMode  `json:"duplicateMergeMode,omitempty"`
	EnableFileLogging         bool                `json:"enableFileLogging"`
	Downloader                DownloaderSettings  `json:"downloader"`
}

type DownloaderSettings struct {
	EnableCopyManga            bool     `json:"enableCopyManga"`
	CopyMangaAPIDomain         string   `json:"copyMangaApiDomain,omitempty"`
	CopyMangaUsername          string   `json:"copyMangaUsername,omitempty"`
	CopyMangaPasswordEncrypted string   `json:"copyMangaPasswordEncrypted,omitempty"`
	CopyMangaToken             string   `json:"copyMangaToken,omitempty"`
	CopyMangaCDNMode           string   `json:"copyMangaCdnMode,omitempty"` // "official" | "striped"
	CopyMangaCustomCDNs        []string `json:"copyMangaCustomCdns,omitempty"`
	EnableRawManga             bool     `json:"enableRawManga"`
	RawMangaBaseURL            string   `json:"rawMangaBaseUrl,omitempty"`
	TargetSourceID             string   `json:"targetSourceId,omitempty"`
	DownloadSubPath            string   `json:"downloadSubPath,omitempty"`
	DownloadDir                string   `json:"downloadDir,omitempty"`
	DownloadFormat             string   `json:"downloadFormat,omitempty"` // "cbz" or "folder"
	MaxConcurrentDownloads     int      `json:"maxConcurrentDownloads,omitempty"`
	MaxImageConcurrency        int      `json:"maxImageConcurrency,omitempty"`
	ChapterIntervalSec         int      `json:"chapterIntervalSec,omitempty"`
	AutoCheckComicUpdates      bool     `json:"autoCheckComicUpdates,omitempty"`
	AutoFollowPolicy           string   `json:"autoFollowPolicy,omitempty"` // "latest_only" | "fill_gaps"
}

type OnlineMangaItem struct {
	ID            string `json:"id"`
	Source        string `json:"source"` // "copymanga" | "klz9"
	Title         string `json:"title"`
	Author        string `json:"author"`
	CoverURL      string `json:"coverURL"`
	Status        string `json:"status"` // "ongoing" | "completed" | ""
	Description   string `json:"description,omitempty"`
	UpdateTime    string `json:"updateTime,omitempty"`
	TotalChapters int    `json:"totalChapters,omitempty"`
}

type OnlineMangaChapter struct {
	ID            string  `json:"id"`
	MangaID       string  `json:"mangaID"`
	Source        string  `json:"source"`
	Title         string  `json:"title"`
	Number        float64 `json:"number"`
	Group         string  `json:"group,omitempty"`
	GroupPathWord string  `json:"groupPathWord,omitempty"`
	ReleaseDate   string  `json:"releaseDate,omitempty"`
}

type OnlineSearchResult struct {
	Items      []OnlineMangaItem `json:"items"`
	TotalItems int               `json:"totalItems"`
	Page       int               `json:"page"`
	TotalPages int               `json:"totalPages"`
}

type DownloadTaskStatus string

const (
	DownloadStatusPending       DownloadTaskStatus = "pending"
	DownloadStatusDownloading   DownloadTaskStatus = "downloading"
	DownloadStatusPaused        DownloadTaskStatus = "paused"
	DownloadStatusWaitingSource DownloadTaskStatus = "waiting_source"
	DownloadStatusCompleted     DownloadTaskStatus = "completed"
	DownloadStatusFailed        DownloadTaskStatus = "failed"
)

type DownloadTask struct {
	ID              string             `json:"id"`
	Source          string             `json:"source"`
	MangaID         string             `json:"mangaID"`
	MangaTitle      string             `json:"mangaTitle"`
	MangaCoverURL   string             `json:"mangaCoverURL,omitempty"`
	ChapterID       string             `json:"chapterID"`
	ChapterTitle    string             `json:"chapterTitle"`
	ChapterNumber   float64            `json:"chapterNumber"`
	ChapterGroup    string             `json:"chapterGroup,omitempty"`
	TargetSourceID  string             `json:"targetSourceID,omitempty"`
	Status          DownloadTaskStatus `json:"status"`
	TotalPages      int                `json:"totalPages"`
	DownloadedPages int                `json:"downloadedPages"`
	Speed           string             `json:"speed,omitempty"`
	ErrorMessage    string             `json:"errorMessage,omitempty"`
	CreatedAt       string             `json:"createdAt"`
	UpdatedAt       string             `json:"updatedAt"`
}

type DownloadProgress struct {
	ActiveTasks     int     `json:"activeTasks"`
	TotalTasks      int     `json:"totalTasks"`
	DownloadedPages int     `json:"downloadedPages"`
	TotalPages      int     `json:"totalPages"`
	SpeedFormatted  string  `json:"speedFormatted"`
	BytesPerSec     float64 `json:"bytesPerSec"`
}

type CreateDownloadTaskInput struct {
	Source         string  `json:"source"`
	MangaID        string  `json:"mangaID"`
	MangaTitle     string  `json:"mangaTitle"`
	MangaCoverURL  string  `json:"mangaCoverURL,omitempty"`
	ChapterID      string  `json:"chapterID"`
	ChapterTitle   string  `json:"chapterTitle"`
	ChapterNumber  float64 `json:"chapterNumber"`
	ChapterGroup   string  `json:"chapterGroup,omitempty"`
	TargetSourceID string  `json:"targetSourceID,omitempty"`
}

type MangaOnlineLink struct {
	MangaID             string `json:"mangaId"`
	OnlineSource        string `json:"onlineSource"`
	OnlineComicID       string `json:"onlineComicId"`
	OnlineTitle         string `json:"onlineTitle"`
	AutoFollow          bool   `json:"autoFollow"`
	FollowPolicy        string `json:"followPolicy"` // "latest_only" | "fill_gaps"
	LastCheckedAt       string `json:"lastCheckedAt"`
	LastNotifiedChapter string `json:"lastNotifiedChapter,omitempty"`
	TargetGroup         string `json:"targetGroup,omitempty"`
}

type CopyMangaAccount struct {
	Username      string `json:"username"`
	Password      string `json:"password"`
	Token         string `json:"token"`
	LimitedAt     int64  `json:"limitedAt"`
	LastCheckedAt int64  `json:"lastCheckedAt"`
}

type CopyMangaLoginResult struct {
	Success   bool   `json:"success"`
	Username  string `json:"username,omitempty"`
	Token     string `json:"token,omitempty"`
	IsDevMode bool   `json:"isDevMode"`
	Message   string `json:"message,omitempty"`
}

type DevInfo struct {
	IsDevMode      bool   `json:"isDevMode"`
	KeySource      string `json:"keySource"`
	KeyFingerprint string `json:"keyFingerprint"`
	MachineID      string `json:"machineId,omitempty"`
	AccountCount   int    `json:"accountCount"`
}

type SiteProfile struct {
	Site             string            `json:"site"`
	BundleURL        string            `json:"bundleURL"`
	BundleHash       string            `json:"bundleHash"`
	APIBase          string            `json:"apiBase"`
	SignatureSecret  string            `json:"signatureSecret"`
	SignatureMode    string            `json:"signatureMode"`
	ImageHostRewrite map[string]string `json:"imageHostRewrite"`
	IgnorePageURLs   []string          `json:"ignorePageURLs"`
	ExtractedAt      string            `json:"extractedAt"`
}

type LibraryManga struct {
	ID            string `json:"id"`
	SourceID      string `json:"sourceID,omitempty"`
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
	IsAvailable   bool   `json:"isAvailable"`
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
	IsHomebrew     bool   `json:"isHomebrew"`
}
