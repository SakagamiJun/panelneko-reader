package contracts

import (
	"context"
	"io"
)

type MangaProvider interface {
	ID() string
	SearchManga(ctx context.Context, query string, page int, limit int) (OnlineSearchResult, error)
	GetMangaChapters(ctx context.Context, mangaID string) ([]OnlineMangaChapter, error)
	GetChapterPages(ctx context.Context, mangaID string, chapterID string) ([]string, error)
	GetMangaGroups(ctx context.Context, mangaID string) ([]string, error)
	DownloadImage(ctx context.Context, rawURL string, pageIndex int, writer io.Writer) error
	ComicWebURL(mangaID string) string
}
