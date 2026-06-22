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

type AppSettings struct {
	LibraryRoot               string     `json:"libraryRoot"`
	LocaleMode                LocaleMode `json:"localeMode"`
	Locale                    string     `json:"locale"`
	ThemeMode                 ThemeMode  `json:"themeMode"`
	ReaderScrollCachePages    int        `json:"readerScrollCachePages"`
	AutoRestoreReaderProgress bool       `json:"autoRestoreReaderProgress"`
}

type LibraryManga struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	SourceURL     string `json:"sourceURL"`
	RelativePath  string `json:"relativePath"`
	CoverImageURL string `json:"coverImageURL"`
	ChapterCount  int    `json:"chapterCount"`
	PageCount     int    `json:"pageCount"`
	LastUpdated   string `json:"lastUpdated"`
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
