package main

import (
	"archive/zip"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

func TestAssetHandlerStreamsArchiveAssets(t *testing.T) {
	libraryRoot := t.TempDir()
	mangaDir := filepath.Join(libraryRoot, "Reader Manga")
	archivePath := filepath.Join(mangaDir, "001 - Chapter.cbz")

	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga dir: %v", err)
	}
	writeZipArchiveForAppTest(t, archivePath, map[string]string{
		"001.png": "png-bytes",
	})

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	requestURL, err := library.ArchiveAssetURL(libraryRoot, archivePath, "001.png")
	if err != nil {
		t.Fatalf("build archive asset url: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, requestURL, nil)
	recorder := httptest.NewRecorder()
	app.assetHandler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("unexpected cache-control: %q", got)
	}
	etag := recorder.Header().Get("ETag")
	if etag == "" {
		t.Fatal("expected ETag header")
	}
	if got := recorder.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("unexpected content type: %q", got)
	}
	if got := recorder.Header().Get("Content-Length"); got != "9" {
		t.Fatalf("unexpected content length: %q", got)
	}
	if got := recorder.Body.String(); got != "png-bytes" {
		t.Fatalf("unexpected body: %q", got)
	}

	// Test 304 Not Modified with If-None-Match
	req304 := httptest.NewRequest(http.MethodGet, requestURL, nil)
	req304.Header.Set("If-None-Match", etag)
	rec304 := httptest.NewRecorder()
	app.assetHandler().ServeHTTP(rec304, req304)
	if rec304.Code != http.StatusNotModified {
		t.Fatalf("expected 304, got %d", rec304.Code)
	}
}

func TestAssetHandlerArchiveNotFoundScenarios(t *testing.T) {
	libraryRoot := t.TempDir()
	mangaDir := filepath.Join(libraryRoot, "Reader Manga")
	archivePath := filepath.Join(mangaDir, "001 - Chapter.cbz")

	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga dir: %v", err)
	}
	writeZipArchiveForAppTest(t, archivePath, map[string]string{
		"001.jpg": "one",
	})

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	tests := []struct {
		name       string
		requestURL string
		wantStatus int
	}{
		{
			name:       "missing archive",
			requestURL: library.LibraryArchiveAssetPrefix + encodePathTokenForAppTest("Reader Manga/missing.cbz") + "/" + encodePathTokenForAppTest("001.jpg"),
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "missing entry",
			requestURL: library.LibraryArchiveAssetPrefix + encodePathTokenForAppTest("Reader Manga/001 - Chapter.cbz") + "/" + encodePathTokenForAppTest("missing.jpg"),
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "invalid decode",
			requestURL: library.LibraryArchiveAssetPrefix + "bad!/bad!",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "escaping entry path",
			requestURL: library.LibraryArchiveAssetPrefix + encodePathTokenForAppTest("Reader Manga/001 - Chapter.cbz") + "/" + encodePathTokenForAppTest("../001.jpg"),
			wantStatus: http.StatusForbidden,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.requestURL, nil)
			recorder := httptest.NewRecorder()
			app.assetHandler().ServeHTTP(recorder, request)

			if recorder.Code != test.wantStatus {
				t.Fatalf("unexpected status: got %d want %d", recorder.Code, test.wantStatus)
			}
		})
	}
}

func TestListLibraryMangaPinAndCollectionCover(t *testing.T) {
	libraryRoot := t.TempDir()

	// 1. Standalone Manga A
	mangaADir := filepath.Join(libraryRoot, "Manga A", "Chapter 1")
	if err := os.MkdirAll(mangaADir, 0o755); err != nil {
		t.Fatalf("mkdir manga A: %v", err)
	}
	_ = os.WriteFile(filepath.Join(mangaADir, "001.jpg"), []byte("a"), 0o644)

	// 2. Standalone Manga B
	mangaBDir := filepath.Join(libraryRoot, "Manga B", "Chapter 1")
	if err := os.MkdirAll(mangaBDir, 0o755); err != nil {
		t.Fatalf("mkdir manga B: %v", err)
	}
	_ = os.WriteFile(filepath.Join(mangaBDir, "001.jpg"), []byte("b"), 0o644)

	// 3. Collection C with marker and two child mangas
	collDir := filepath.Join(libraryRoot, "Coll C")
	if err := os.MkdirAll(collDir, 0o755); err != nil {
		t.Fatalf("mkdir coll C: %v", err)
	}
	_ = os.WriteFile(filepath.Join(collDir, ".collection"), []byte(""), 0o644)

	child1Dir := filepath.Join(collDir, "Child 1", "Chapter 1")
	if err := os.MkdirAll(child1Dir, 0o755); err != nil {
		t.Fatalf("mkdir child 1: %v", err)
	}
	_ = os.WriteFile(filepath.Join(child1Dir, "001.jpg"), []byte("c1"), 0o644)

	child2Dir := filepath.Join(collDir, "Child 2", "Chapter 1")
	if err := os.MkdirAll(child2Dir, 0o755); err != nil {
		t.Fatalf("mkdir child 2: %v", err)
	}
	_ = os.WriteFile(filepath.Join(child2Dir, "002.jpg"), []byte("c2"), 0o644)

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	items, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("initial list library: %v", err)
	}

	itemMap := make(map[string]contracts.LibraryManga)
	for _, it := range items {
		itemMap[it.RelativePath] = it
	}

	coll := itemMap["Coll C"]
	child1 := itemMap["Coll C/Child 1"]
	child2 := itemMap["Coll C/Child 2"]
	mangaA := itemMap["Manga A"]

	defaultCollCover := coll.CoverImageURL
	if defaultCollCover == "" || defaultCollCover != child1.CoverImageURL {
		t.Fatalf("expected default coll cover to be child 1 cover (%q), got %q", child1.CoverImageURL, defaultCollCover)
	}

	// Pin Manga A
	pinned, err := app.TogglePin(mangaA.ID)
	if err != nil || !pinned {
		t.Fatalf("toggle pin manga A: %v, %v", pinned, err)
	}

	items, err = app.ListLibraryManga()
	if err != nil {
		t.Fatalf("list after pin manga A: %v", err)
	}
	// Manga A must be first in root
	if items[0].ID != mangaA.ID || !items[0].IsPinned {
		t.Fatalf("expected manga A to be first and pinned, got %+v", items[0])
	}

	// Pin Child 2 in Collection C
	pinned, err = app.TogglePin(child2.ID)
	if err != nil || !pinned {
		t.Fatalf("toggle pin child 2: %v, %v", pinned, err)
	}

	items, err = app.ListLibraryManga()
	if err != nil {
		t.Fatalf("list after pin child 2: %v", err)
	}

	var updatedColl *contracts.LibraryManga
	var collChildren []contracts.LibraryManga
	for _, it := range items {
		if it.RelativePath == "Coll C" {
			c := it
			updatedColl = &c
		} else if it.ParentPath == "Coll C" {
			collChildren = append(collChildren, it)
		}
	}

	if updatedColl == nil {
		t.Fatal("collection C not found")
	}
	// Requirement 2: Collection C cover must now be Child 2's cover!
	if updatedColl.CoverImageURL != child2.CoverImageURL {
		t.Fatalf("expected collection cover to be child 2 cover (%q), got %q", child2.CoverImageURL, updatedColl.CoverImageURL)
	}

	// Inside collection, child 2 should be first
	if len(collChildren) != 2 || collChildren[0].ID != child2.ID {
		t.Fatalf("expected child 2 to be first in collection, got %+v", collChildren)
	}

	// Unpin Child 2
	pinned, err = app.TogglePin(child2.ID)
	if err != nil || pinned {
		t.Fatalf("toggle unpin child 2: %v, %v", pinned, err)
	}

	items, err = app.ListLibraryManga()
	if err != nil {
		t.Fatalf("list after unpin child 2: %v", err)
	}

	for _, it := range items {
		if it.RelativePath == "Coll C" {
			if it.CoverImageURL != defaultCollCover {
				t.Fatalf("expected collection cover to revert to default (%q), got %q", defaultCollCover, it.CoverImageURL)
			}
		}
	}
}

func TestAppOpenDirectory(t *testing.T) {
	libraryRoot := t.TempDir()
	mangaDir := filepath.Join(libraryRoot, "Manga A")
	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga A: %v", err)
	}

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	var openedPath string
	origOpener := library.FileOpener
	library.FileOpener = func(path string) error {
		openedPath = path
		return nil
	}
	defer func() {
		library.FileOpener = origOpener
	}()

	mangaID := encodePathTokenForAppTest("Manga A")
	if err := app.OpenDirectory(mangaID); err != nil {
		t.Fatalf("open directory: %v", err)
	}

	resolvedMangaDir, err := filepath.EvalSymlinks(mangaDir)
	if err != nil {
		resolvedMangaDir = mangaDir
	}
	resolvedOpened, err := filepath.EvalSymlinks(openedPath)
	if err != nil {
		resolvedOpened = openedPath
	}
	if resolvedOpened != resolvedMangaDir {
		t.Fatalf("expected opened path %q, got %q", resolvedMangaDir, resolvedOpened)
	}
}

func TestAppToggleCollection(t *testing.T) {
	libraryRoot := t.TempDir()
	mangaDir := filepath.Join(libraryRoot, "Series B")
	if err := os.MkdirAll(filepath.Join(mangaDir, "Ch 1"), 0o755); err != nil {
		t.Fatalf("mkdir manga B: %v", err)
	}
	if err := os.WriteFile(filepath.Join(mangaDir, "Ch 1", "001.jpg"), []byte("test"), 0o644); err != nil {
		t.Fatalf("write page: %v", err)
	}

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	mangaID := encodePathTokenForAppTest("Series B")

	// 1. Toggle to collection
	isColl, err := app.ToggleCollection(mangaID)
	if err != nil {
		t.Fatalf("toggle collection error: %v", err)
	}
	if !isColl {
		t.Fatal("expected isCollection to be true")
	}

	// 2. Toggle back to regular
	isColl, err = app.ToggleCollection(mangaID)
	if err != nil {
		t.Fatalf("toggle collection error: %v", err)
	}
	if isColl {
		t.Fatal("expected isCollection to be false")
	}
}

func newAssetTestApp(t *testing.T, libraryRoot string) (*App, func()) {
	t.Helper()

	storeValue, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	settingsService, err := settings.NewService(storeValue)
	if err != nil {
		t.Fatalf("create settings service: %v", err)
	}
	if _, err := settingsService.Update(contracts.AppSettings{LibraryRoot: libraryRoot}); err != nil {
		t.Fatalf("update settings: %v", err)
	}

	return &App{
		store:    storeValue,
		settings: settingsService,
	}, func() {
		_ = storeValue.Close()
	}
}

func encodePathTokenForAppTest(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func writeZipArchiveForAppTest(t *testing.T, archivePath string, files map[string]string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(archivePath), 0o755); err != nil {
		t.Fatalf("mkdir archive dir: %v", err)
	}

	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("create archive: %v", err)
	}
	defer file.Close()

	archiveWriter := zip.NewWriter(file)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		writer, err := archiveWriter.Create(name)
		if err != nil {
			t.Fatalf("create archive entry %s: %v", name, err)
		}
		if _, err := io.WriteString(writer, files[name]); err != nil {
			t.Fatalf("write archive entry %s: %v", name, err)
		}
	}
	if err := archiveWriter.Close(); err != nil {
		t.Fatalf("close archive writer: %v", err)
	}
}

func TestAppGetAppVersion(t *testing.T) {
	app := &App{}
	info := app.GetAppVersion()
	if info.Version == "" {
		t.Fatal("expected non-empty version")
	}
	if info.Commit == "" {
		t.Fatal("expected non-empty commit hash")
	}
}
