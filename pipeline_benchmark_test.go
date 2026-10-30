package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

func BenchmarkReaderPipeline(b *testing.B) {
	tempDir := b.TempDir()
	libraryRoot := filepath.Join(tempDir, "library")
	if err := os.MkdirAll(libraryRoot, 0o755); err != nil {
		b.Fatalf("mkdir library root: %v", err)
	}

	// 1. Create realistic mock CBZ archive with 10 compressed pages (128 KB each)
	archivePath := filepath.Join(libraryRoot, "benchmark_comic.cbz")
	archFile, err := os.Create(archivePath)
	if err != nil {
		b.Fatalf("create archive file: %v", err)
	}
	zw := zip.NewWriter(archFile)
	payload := bytes.Repeat([]byte("PANELNEKO_READER_PIPELINE_BENCHMARK_PAYLOAD_CHUNK_DATA_"), 2048) // ~114 KB
	for i := 1; i <= 10; i++ {
		name := fmt.Sprintf("%03d.jpg", i)
		ew, err := zw.Create(name)
		if err != nil {
			b.Fatalf("create zip entry %s: %v", name, err)
		}
		if _, err := ew.Write(payload); err != nil {
			b.Fatalf("write zip entry: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		b.Fatalf("close zip writer: %v", err)
	}
	_ = archFile.Close()

	// 2. Initialize Store & Settings
	storeDir := filepath.Join(tempDir, "store")
	sqliteStore, err := store.Open(storeDir)
	if err != nil {
		b.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	settingsService, err := settings.NewService(sqliteStore)
	if err != nil {
		b.Fatalf("new settings service: %v", err)
	}
	if _, err := settingsService.Update(contracts.AppSettings{LibraryRoot: libraryRoot}); err != nil {
		b.Fatalf("update settings: %v", err)
	}

	app := &App{
		store:    sqliteStore,
		settings: settingsService,
	}
	handler := app.assetHandler()

	encodedArchive := base64.RawURLEncoding.EncodeToString([]byte("benchmark_comic.cbz"))
	pageURLs := make([]string, 10)
	for i := 1; i <= 10; i++ {
		encodedEntry := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("%03d.jpg", i)))
		pageURLs[i-1] = library.LibraryArchiveAssetPrefix + encodedArchive + "/" + encodedEntry
	}

	// Prime initial manga record
	mangas := []contracts.LibraryManga{
		{
			ID:           "bench-manga-1",
			Title:        "Benchmark Comic",
			SourceURL:    "/benchmark_comic.cbz",
			ChapterCount: 1,
			PageCount:    10,
		},
	}
	_ = sqliteStore.SaveLibraryManga(mangas, map[string]int64{"bench-manga-1": 12345})

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		idx := 0
		rec := httptest.NewRecorder()
		for pb.Next() {
			pageIndex := idx % 10
			targetURL := pageURLs[pageIndex]

			// A. Decompression + Stream copying through assetHandler
			req := httptest.NewRequest(http.MethodGet, targetURL, nil)
			rec.Body.Reset()
			handler.ServeHTTP(rec, req)

			// B. SQLite Transaction: write and read reader progress
			mangaID := "bench-manga-1"
			chapterID := "ch-" + strconv.Itoa(idx%5)
			_ = sqliteStore.SaveReaderProgress(contracts.ReaderProgress{
				MangaID:   mangaID,
				ChapterID: chapterID,
				Page:      pageIndex,
				UpdatedAt: "2026-11-02T05:00:00Z",
			})
			_, _, _ = sqliteStore.GetReaderProgress(mangaID)

			idx++
		}
	})
}
