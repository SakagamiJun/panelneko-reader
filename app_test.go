package main

import (
	"archive/zip"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
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

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		v1   string
		v2   string
		want int
	}{
		{"0.1.0", "0.9.0", -1},
		{"0.9.0", "0.1.0", 1},
		{"0.1.0", "0.1.0", 0},
		{"v0.1.0", "0.9.0", -1},
		{"v1.0.0", "v0.9.0", 1},
		{"0.1.0", "0.1.1", -1},
		{"0.1", "0.1.0", 0},
		{"0.2", "0.1.5", 1},
		{"v1.0.0-rc1", "v1.0.0", 0},
	}

	for _, tc := range tests {
		got := compareVersions(tc.v1, tc.v2)
		if got != tc.want {
			t.Errorf("compareVersions(%q, %q) = %d; want %d", tc.v1, tc.v2, got, tc.want)
		}
	}
}

func TestAppOpenURLValidation(t *testing.T) {
	app := &App{}
	if err := app.OpenURL("javascript:alert(1)"); err == nil {
		t.Fatal("expected error for non-http url")
	}
	if err := app.OpenURL("file:///etc/passwd"); err == nil {
		t.Fatal("expected error for file url")
	}
	if err := app.OpenURL("https://github.com/SakagamiJun/panelneko-reader"); err != nil {
		t.Fatalf("unexpected error for https url: %v", err)
	}
}

func TestAppThumbnailCacheManagement(t *testing.T) {
	libraryRoot := t.TempDir()
	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	// Initially cache size should be 0
	size, err := app.GetThumbnailCacheSize()
	if err != nil {
		t.Fatalf("GetThumbnailCacheSize failed: %v", err)
	}
	if size != 0 {
		t.Errorf("expected initial cache size 0, got %d", size)
	}

	// Write a mock cache file into cache directory
	cacheDir := filepath.Join(app.store.DataDir(), "cache", "thumbnails")
	_ = os.MkdirAll(cacheDir, 0o755)
	dummyData := []byte("dummy-thumbnail-content")
	_ = os.WriteFile(filepath.Join(cacheDir, "test.jpg"), dummyData, 0o644)

	size, err = app.GetThumbnailCacheSize()
	if err != nil {
		t.Fatalf("GetThumbnailCacheSize failed: %v", err)
	}
	if size != int64(len(dummyData)) {
		t.Errorf("expected cache size %d, got %d", len(dummyData), size)
	}

	// Clear thumbnail cache
	if err := app.ClearThumbnailCache(); err != nil {
		t.Fatalf("ClearThumbnailCache failed: %v", err)
	}

	size, err = app.GetThumbnailCacheSize()
	if err != nil {
		t.Fatalf("GetThumbnailCacheSize failed: %v", err)
	}
	if size != 0 {
		t.Errorf("expected cache size 0 after clear, got %d", size)
	}
}

func TestAppExportedMethodsWailsCompliance(t *testing.T) {
	appType := reflect.TypeOf(&App{})
	errType := reflect.TypeOf((*error)(nil)).Elem()

	prohibitedExported := map[string]bool{
		"AssetHandler": true,
		"Bootstrap":    true,
		"EnsureReady":  true,
		"Emit":         true,
		"Startup":      true,
	}

	for i := 0; i < appType.NumMethod(); i++ {
		method := appType.Method(i)

		if prohibitedExported[method.Name] {
			t.Errorf("internal method %s is exported; must remain unexported to protect Wails bindings", method.Name)
		}

		// Skip unexported methods (PkgPath is non-empty for unexported methods)
		if method.PkgPath != "" {
			continue
		}

		// 1. Wails requires at most 2 return values
		if method.Type.NumOut() > 2 {
			t.Errorf("exported method %s has %d return values; Wails allows at most 2", method.Name, method.Type.NumOut())
		}

		// 2. If 2 return values, the 2nd MUST be error
		if method.Type.NumOut() == 2 {
			secondOut := method.Type.Out(1)
			if !secondOut.Implements(errType) {
				t.Errorf("exported method %s 2nd return value is %s, but must implement error", method.Name, secondOut.String())
			}
		}

		// 3. Inspect return types for disallowed un-serializable types
		for outIdx := 0; outIdx < method.Type.NumOut(); outIdx++ {
			outType := method.Type.Out(outIdx)
			if outType.Kind() == reflect.Chan || outType.Kind() == reflect.Func {
				t.Errorf("exported method %s returns unsupported Wails type: %s", method.Name, outType.String())
			}
			if outType.String() == "http.Handler" || outType.String() == "net/http.Handler" {
				t.Errorf("exported method %s returns http.Handler which breaks Wails bindings", method.Name)
			}
		}

		// 4. Inspect parameter types for disallowed types
		for inIdx := 1; inIdx < method.Type.NumIn(); inIdx++ {
			inType := method.Type.In(inIdx)
			if inType.Kind() == reflect.Chan || inType.Kind() == reflect.Func {
				t.Errorf("exported method %s takes unsupported parameter type: %s", method.Name, inType.String())
			}
			if inType.String() == "http.ResponseWriter" || inType.String() == "*http.Request" {
				t.Errorf("exported method %s takes http request/response parameter which breaks Wails bindings", method.Name)
			}
		}
	}
}

func TestMultiSourceLibraryManagement(t *testing.T) {
	tempRoot := t.TempDir()
	app, cleanup := newAssetTestApp(t, tempRoot)
	defer cleanup()

	dir1 := filepath.Join(tempRoot, "Dir1")
	dir2 := filepath.Join(tempRoot, "Dir2")
	_ = os.MkdirAll(dir1, 0o755)
	_ = os.MkdirAll(dir2, 0o755)

	// 1. Add Library Source
	updated, err := app.AddLibrarySource(contracts.LibrarySource{
		ID:   "src-1",
		Name: "Custom Source 1",
		Path: dir1,
	})
	if err != nil {
		t.Fatalf("AddLibrarySource failed: %v", err)
	}

	found := false
	for _, s := range updated.LibrarySources {
		if s.ID == "src-1" && s.Name == "Custom Source 1" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected src-1 in updated settings: %+v", updated.LibrarySources)
	}

	// 2. Reject duplicate path
	if _, err := app.AddLibrarySource(contracts.LibrarySource{Path: dir1}); err == nil {
		t.Fatal("expected error adding duplicate path, got nil")
	}

	// 3. Reject empty path
	if _, err := app.AddLibrarySource(contracts.LibrarySource{Path: ""}); err == nil {
		t.Fatal("expected error adding empty path, got nil")
	}

	// 4. Update Library Source
	updated, err = app.UpdateLibrarySource(contracts.LibrarySource{
		ID:       "src-1",
		Name:     "Renamed Source 1",
		Enabled:  true,
		ReadOnly: true,
	})
	if err != nil {
		t.Fatalf("UpdateLibrarySource failed: %v", err)
	}
	for _, s := range updated.LibrarySources {
		if s.ID == "src-1" {
			if s.Name != "Renamed Source 1" || !s.ReadOnly {
				t.Fatalf("unexpected updated source: %+v", s)
			}
		}
	}

	// 5. Relocate Library Source
	updated, err = app.RelocateLibrarySource("src-1", dir2)
	if err != nil {
		t.Fatalf("RelocateLibrarySource failed: %v", err)
	}
	for _, s := range updated.LibrarySources {
		if s.ID == "src-1" {
			if s.Path != dir2 {
				t.Fatalf("expected relocated path %s, got %s", dir2, s.Path)
			}
		}
	}

	// 6. Rescan Source
	if err := app.RescanSource("src-1"); err != nil {
		t.Fatalf("RescanSource failed: %v", err)
	}

	// 7. Remove Library Source
	updated, err = app.RemoveLibrarySource("src-1")
	if err != nil {
		t.Fatalf("RemoveLibrarySource failed: %v", err)
	}
	for _, s := range updated.LibrarySources {
		if s.ID == "src-1" {
			t.Fatalf("expected src-1 to be removed from settings: %+v", updated.LibrarySources)
		}
	}
}

func TestMultiSourceScanningAndOfflineFallback(t *testing.T) {
	tempRoot := t.TempDir()
	app, cleanup := newAssetTestApp(t, tempRoot)
	defer cleanup()

	dirA := filepath.Join(tempRoot, "SourceA")
	dirB := filepath.Join(tempRoot, "SourceB")
	_ = os.MkdirAll(filepath.Join(dirA, "Manga A", "Ch 1"), 0o755)
	_ = os.WriteFile(filepath.Join(dirA, "Manga A", "Ch 1", "001.jpg"), []byte("page-a"), 0o644)
	_ = os.MkdirAll(filepath.Join(dirB, "Manga B", "Ch 1"), 0o755)
	_ = os.WriteFile(filepath.Join(dirB, "Manga B", "Ch 1", "001.jpg"), []byte("page-b"), 0o644)

	// Configure both sources
	_, err := app.UpdateSettings(contracts.AppSettings{
		LibrarySources: []contracts.LibrarySource{
			{
				ID:      "src-a",
				Name:    "Source A",
				Path:    dirA,
				Enabled: true,
			},
			{
				ID:      "src-b",
				Name:    "Source B",
				Path:    dirB,
				Enabled: true,
			},
		},
	})
	if err != nil {
		t.Fatalf("UpdateSettings failed: %v", err)
	}

	// First scan: both are online
	items, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("ListLibraryManga failed: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 manga items, got %d", len(items))
	}
	for _, it := range items {
		if !it.IsAvailable {
			t.Fatalf("expected item %s to be available", it.Title)
		}
	}

	// Find manga B and test ReaderManifest & OpenDirectory
	var mangaB contracts.LibraryManga
	for _, it := range items {
		if it.Title == "Manga B" {
			mangaB = it
		}
	}
	if mangaB.ID == "" {
		t.Fatal("manga B not found")
	}

	manifest, err := app.GetReaderManifest(mangaB.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest for Manga B failed: %v", err)
	}
	if manifest.Title != "Manga B" || len(manifest.Chapters) == 0 {
		t.Fatalf("unexpected manifest for Manga B: %+v", manifest)
	}

	// Test multi-source asset routing
	pageURL := manifest.Chapters[0].Pages[0].SourceURL
	req := httptest.NewRequest(http.MethodGet, pageURL, nil)
	rec := httptest.NewRecorder()
	app.assetHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != "page-b" {
		t.Fatalf("asset handler unexpected result: code=%d body=%q", rec.Code, rec.Body.String())
	}

	// Now simulate offline: remove directory B from disk
	_ = os.RemoveAll(dirB)

	// Second scan: source B should fail/offline, but its manga remains in library with IsAvailable=false!
	itemsOffline, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("ListLibraryManga during offline failed: %v", err)
	}
	if len(itemsOffline) != 2 {
		t.Fatalf("expected both manga items to remain in library, got %d", len(itemsOffline))
	}

	var foundA, foundB *contracts.LibraryManga
	for i := range itemsOffline {
		if itemsOffline[i].Title == "Manga A" {
			foundA = &itemsOffline[i]
		} else if itemsOffline[i].Title == "Manga B" {
			foundB = &itemsOffline[i]
		}
	}

	if foundA == nil || !foundA.IsAvailable {
		t.Fatalf("expected Manga A to be available, got %+v", foundA)
	}
	if foundB == nil || foundB.IsAvailable {
		t.Fatalf("expected Manga B to be offline (IsAvailable=false), got %+v", foundB)
	}

	// Verify settings source status updated
	settingsAfter := app.settings.Get()
	for _, s := range settingsAfter.LibrarySources {
		if s.ID == "src-b" && s.Status != contracts.SourceStatusOffline {
			t.Fatalf("expected src-b status to be offline, got %s", s.Status)
		}
	}

	// Now restore directory B
	_ = os.MkdirAll(filepath.Join(dirB, "Manga B", "Ch 1"), 0o755)
	_ = os.WriteFile(filepath.Join(dirB, "Manga B", "Ch 1", "001.jpg"), []byte("page-b"), 0o644)

	// Third scan: Manga B should become available again!
	itemsOnline, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("ListLibraryManga after restore failed: %v", err)
	}
	for _, it := range itemsOnline {
		if it.Title == "Manga B" && !it.IsAvailable {
			t.Fatalf("expected Manga B to be available again after restore, got %+v", it)
		}
	}
}
