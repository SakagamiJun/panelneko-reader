package library

import (
	"archive/zip"
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func createTestImageFile(t *testing.T, dir, filename string, width, height int, isPNG bool) string {
	t.Helper()
	filePath := filepath.Join(dir, filename)
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for x := 0; x < width; x++ {
		for y := 0; y < height; y++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 100, A: 255})
		}
	}

	f, err := os.Create(filePath)
	if err != nil {
		t.Fatalf("create test image: %v", err)
	}
	defer f.Close()

	if isPNG {
		err = png.Encode(f, img)
	} else {
		err = jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	}
	if err != nil {
		t.Fatalf("encode test image: %v", err)
	}
	return filePath
}

func createTestZipArchive(t *testing.T, dir, zipName, imageEntryName string, width, height int) string {
	t.Helper()
	zipPath := filepath.Join(dir, zipName)
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	w, err := zw.Create(imageEntryName)
	if err != nil {
		t.Fatalf("create zip entry: %v", err)
	}

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for x := 0; x < width; x++ {
		for y := 0; y < height; y++ {
			img.Set(x, y, color.RGBA{R: 200, G: uint8(y % 256), B: uint8(x % 256), A: 255})
		}
	}
	if err := jpeg.Encode(w, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode zip image: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	if err := os.WriteFile(zipPath, buf.Bytes(), 0o644); err != nil {
		t.Fatalf("write zip file: %v", err)
	}
	return zipPath
}

func TestThumbnailURLHelpers(t *testing.T) {
	if got := BuildThumbnailURL(""); got != "" {
		t.Errorf("expected empty string, got %s", got)
	}

	raw := "/library-files/comic/01.jpg"
	wrapped := BuildThumbnailURL(raw)
	expected := "/library-thumbnail/library-files/comic/01.jpg"
	if wrapped != expected {
		t.Errorf("expected %s, got %s", expected, wrapped)
	}

	// Idempotent
	if BuildThumbnailURL(wrapped) != expected {
		t.Errorf("BuildThumbnailURL should be idempotent")
	}

	stripped := StripThumbnailURL(wrapped)
	if stripped != raw {
		t.Errorf("expected %s, got %s", raw, stripped)
	}

	// Strip non-thumbnail URL should be no-op
	if StripThumbnailURL(raw) != raw {
		t.Errorf("StripThumbnailURL on non-thumbnail should return original")
	}
}

func TestServeThumbnailDirectory(t *testing.T) {
	libraryRoot := t.TempDir()
	cacheDir := filepath.Join(t.TempDir(), "cache")

	comicDir := filepath.Join(libraryRoot, "TestManga")
	if err := os.MkdirAll(comicDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	createTestImageFile(t, comicDir, "001.jpg", 1200, 1800, false)

	reqPath := "/library-thumbnail/library-files/TestManga/001.jpg"
	req := httptest.NewRequest(http.MethodGet, reqPath, nil)
	rec := httptest.NewRecorder()

	err := ServeThumbnail(libraryRoot, cacheDir, reqPath, rec, req, true)
	if err != nil {
		t.Fatalf("ServeThumbnail failed: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("expected Content-Type image/jpeg, got %s", ct)
	}
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Error("expected ETag header")
	}

	// Verify thumbnail was created and downscaled
	entries, err := os.ReadDir(cacheDir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("expected 1 cached thumbnail file, got %d", len(entries))
	}

	cachedImgData, err := os.ReadFile(filepath.Join(cacheDir, entries[0].Name()))
	if err != nil {
		t.Fatalf("read cached thumbnail: %v", err)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(cachedImgData))
	if err != nil {
		t.Fatalf("decode cached thumbnail config: %v", err)
	}
	if cfg.Width != DefaultThumbnailWidth {
		t.Errorf("expected thumbnail width %d, got %d", DefaultThumbnailWidth, cfg.Width)
	}
	if cfg.Height != 600 {
		t.Errorf("expected thumbnail height 600, got %d", cfg.Height)
	}

	// Test 304 Not Modified
	req304 := httptest.NewRequest(http.MethodGet, reqPath, nil)
	req304.Header.Set("If-None-Match", etag)
	rec304 := httptest.NewRecorder()
	err = ServeThumbnail(libraryRoot, cacheDir, reqPath, rec304, req304, true)
	if err != nil {
		t.Fatalf("ServeThumbnail 304 test failed: %v", err)
	}
	if rec304.Code != http.StatusNotModified {
		t.Errorf("expected 304 Not Modified, got %d", rec304.Code)
	}

	// Test cache size & clearing
	size, err := GetThumbnailCacheSize(cacheDir)
	if err != nil {
		t.Fatalf("GetThumbnailCacheSize failed: %v", err)
	}
	if size <= 0 {
		t.Errorf("expected cache size > 0, got %d", size)
	}

	if err := ClearThumbnailCache(cacheDir); err != nil {
		t.Fatalf("ClearThumbnailCache failed: %v", err)
	}
	newSize, _ := GetThumbnailCacheSize(cacheDir)
	if newSize != 0 {
		t.Errorf("expected cache size 0 after clear, got %d", newSize)
	}
}

func TestServeThumbnailArchive(t *testing.T) {
	libraryRoot := t.TempDir()
	cacheDir := filepath.Join(t.TempDir(), "cache")

	createTestZipArchive(t, libraryRoot, "comic.cbz", "cover.jpg", 1000, 1500)

	assetURL, err := ArchiveAssetURL(libraryRoot, filepath.Join(libraryRoot, "comic.cbz"), "cover.jpg")
	if err != nil {
		t.Fatalf("ArchiveAssetURL: %v", err)
	}

	reqPath := BuildThumbnailURL(assetURL)
	req := httptest.NewRequest(http.MethodGet, reqPath, nil)
	rec := httptest.NewRecorder()

	err = ServeThumbnail(libraryRoot, cacheDir, reqPath, rec, req, true)
	if err != nil {
		t.Fatalf("ServeThumbnail archive failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
}

func TestServeThumbnailDisabledFallback(t *testing.T) {
	libraryRoot := t.TempDir()
	cacheDir := filepath.Join(t.TempDir(), "cache")

	comicDir := filepath.Join(libraryRoot, "TestManga")
	_ = os.MkdirAll(comicDir, 0o755)
	createTestImageFile(t, comicDir, "001.jpg", 800, 1200, false)

	reqPath := "/library-thumbnail/library-files/TestManga/001.jpg"
	req := httptest.NewRequest(http.MethodGet, reqPath, nil)
	rec := httptest.NewRecorder()

	// enabled = false
	err := ServeThumbnail(libraryRoot, cacheDir, reqPath, rec, req, false)
	if err != nil {
		t.Fatalf("ServeThumbnail fallback failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	// Verify no thumbnails created in cacheDir
	entries, _ := os.ReadDir(cacheDir)
	if len(entries) > 0 {
		t.Errorf("expected 0 cached thumbnails when disabled, got %d", len(entries))
	}
}

func TestServeThumbnailConcurrentSingleFlight(t *testing.T) {
	libraryRoot := t.TempDir()
	cacheDir := filepath.Join(t.TempDir(), "cache")

	comicDir := filepath.Join(libraryRoot, "TestManga")
	_ = os.MkdirAll(comicDir, 0o755)
	createTestImageFile(t, comicDir, "001.jpg", 1000, 1400, false)

	reqPath := "/library-thumbnail/library-files/TestManga/001.jpg"

	const concurrency = 10
	var wg sync.WaitGroup
	errs := make([]error, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		idx := i
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, reqPath, nil)
			rec := httptest.NewRecorder()
			errs[idx] = ServeThumbnail(libraryRoot, cacheDir, reqPath, rec, req, true)
			if rec.Code != http.StatusOK && rec.Code != http.StatusNotModified {
				errs[idx] = fmt.Errorf("unexpected status code: %d", rec.Code)
			}
		}()
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Errorf("concurrent worker %d failed: %v", i, err)
		}
	}
}
