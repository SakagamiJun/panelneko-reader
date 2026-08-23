package store

import (
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
)

func TestReaderProgressRoundTrip(t *testing.T) {
	sqliteStore, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	progress := contracts.ReaderProgress{
		MangaID:   "manga-1",
		ChapterID: "chapter-7",
		Page:      42,
		UpdatedAt: "2026-04-21T00:00:00Z",
	}

	if err := sqliteStore.SaveReaderProgress(progress); err != nil {
		t.Fatalf("save reader progress: %v", err)
	}

	saved, found, err := sqliteStore.GetReaderProgress(progress.MangaID)
	if err != nil {
		t.Fatalf("get reader progress: %v", err)
	}
	if !found {
		t.Fatal("expected reader progress to be found")
	}
	if saved != progress {
		t.Fatalf("unexpected reader progress: %#v", saved)
	}
}

func TestLibraryMangaCollectionRoundTrip(t *testing.T) {
	sqliteStore, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	mangas := []contracts.LibraryManga{
		{
			ID:            "coll-1",
			Title:         "Author Collection",
			SourceURL:     "",
			RelativePath:  "Author Collection",
			ParentPath:    "",
			IsCollection:  true,
			MangaCount:    2,
			CoverImageURL: "/library-files/cover1.jpg",
			ChapterCount:  5,
			PageCount:     100,
			LastUpdated:   "2026-04-21T00:00:00Z",
		},
		{
			ID:            "manga-1",
			Title:         "Manga 1",
			SourceURL:     "",
			RelativePath:  "Author Collection/Manga 1",
			ParentPath:    "Author Collection",
			IsCollection:  false,
			MangaCount:    0,
			CoverImageURL: "/library-files/cover1.jpg",
			ChapterCount:  3,
			PageCount:     60,
			LastUpdated:   "2026-04-21T00:00:00Z",
		},
	}

	modTimes := map[string]int64{
		"coll-1":  1000,
		"manga-1": 2000,
	}

	if err := sqliteStore.SaveLibraryManga(mangas, modTimes); err != nil {
		t.Fatalf("save library manga: %v", err)
	}

	records, err := sqliteStore.ListLibraryManga()
	if err != nil {
		t.Fatalf("list library manga: %v", err)
	}

	if len(records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(records))
	}

	for _, r := range records {
		if r.ID == "coll-1" {
			if !r.IsCollection || r.MangaCount != 2 || r.ParentPath != "" {
				t.Fatalf("unexpected collection record: %+v", r)
			}
		} else if r.ID == "manga-1" {
			if r.IsCollection || r.ParentPath != "Author Collection" {
				t.Fatalf("unexpected manga record: %+v", r)
			}
		}
	}
}
