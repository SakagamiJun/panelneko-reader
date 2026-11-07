package main

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/downloader"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/copymanga"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/klz9"
	"github.com/sakagamijun/panelneko-reader/internal/library"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
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

	requestURL, err := library.ArchiveAssetURLForSource(libraryRoot, "default", archivePath, "001.png")
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

func TestMatchPanelNekoAsset(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "panelneko-reader-macos-arm64.zip"},
		{Name: "panelneko-reader-macos-amd64.zip"},
		{Name: "panelneko-reader-windows-amd64.zip"},
		{Name: "panelneko-reader-linux-amd64.zip"},
		{Name: "checksums.txt"},
	}

	tests := []struct {
		name     string
		req      updater.CheckRequest
		expected int
	}{
		{
			name:     "macOS arm64",
			req:      updater.CheckRequest{Platform: "darwin", Arch: "arm64"},
			expected: 0,
		},
		{
			name:     "macOS amd64",
			req:      updater.CheckRequest{Platform: "darwin", Arch: "amd64"},
			expected: 1,
		},
		{
			name:     "Windows amd64",
			req:      updater.CheckRequest{Platform: "windows", Arch: "amd64"},
			expected: 2,
		},
		{
			name:     "Linux amd64",
			req:      updater.CheckRequest{Platform: "linux", Arch: "amd64"},
			expected: 3,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := matchPanelNekoAsset(tc.req, assets)
			if got != tc.expected {
				t.Errorf("matchPanelNekoAsset(%+v) = %d; want %d", tc.req, got, tc.expected)
			}
		})
	}
}

func TestIsHomebrewExecutable(t *testing.T) {
	// 1. Direct path tests
	if !isHomebrewExecutable("/opt/homebrew/bin/panelneko-reader", "") {
		t.Error("expected /opt/homebrew/bin/panelneko-reader to be detected as Homebrew")
	}
	if !isHomebrewExecutable("/usr/local/Cellar/panelneko/0.11.0/bin/panelneko-reader", "") {
		t.Error("expected Cellar path to be detected as Homebrew")
	}
	if !isHomebrewExecutable("/opt/homebrew/Caskroom/panelneko/0.11.0/panelneko-reader.app/Contents/MacOS/panelneko-reader", "") {
		t.Error("expected Caskroom path to be detected as Homebrew")
	}
	if isHomebrewExecutable("/Users/developer/git/PanelNeko/build/bin/panelneko-reader", "") {
		t.Error("expected dev binary NOT to be detected as Homebrew")
	}

	// 2. Caskroom symlink test
	tempPrefix := t.TempDir()
	caskDir := filepath.Join(tempPrefix, "Caskroom", "panelneko", "0.11.0")
	if err := os.MkdirAll(caskDir, 0o755); err != nil {
		t.Fatalf("mkdir caskDir: %v", err)
	}

	appDir := filepath.Join(tempPrefix, "Applications", "panelneko-reader.app")
	macOSDir := filepath.Join(appDir, "Contents", "MacOS")
	if err := os.MkdirAll(macOSDir, 0o755); err != nil {
		t.Fatalf("mkdir macOSDir: %v", err)
	}
	execInApp := filepath.Join(macOSDir, "panelneko-reader")

	symlinkPath := filepath.Join(caskDir, "panelneko-reader.app")
	if err := os.Symlink(appDir, symlinkPath); err != nil {
		t.Fatalf("symlink appDir: %v", err)
	}

	if !isHomebrewExecutable(execInApp, tempPrefix) {
		t.Errorf("expected exec inside linked .app to be detected as Homebrew")
	}

	unlinkedApp := filepath.Join(tempPrefix, "Applications", "other.app", "Contents", "MacOS", "other")
	if isHomebrewExecutable(unlinkedApp, tempPrefix) {
		t.Errorf("expected unlinked app NOT to be detected as Homebrew")
	}
}

func TestAppExportedMethodsWailsCompliance(t *testing.T) {
	appType := reflect.TypeOf(&App{})
	errType := reflect.TypeOf((*error)(nil)).Elem()

	prohibitedExported := map[string]bool{
		"AssetHandler":    true,
		"Bootstrap":       true,
		"EnsureReady":     true,
		"Emit":            true,
		"Startup":         true,
		"OpenURL":         true,
		"SelectDirectory": true,
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
	dir3 := filepath.Join(tempRoot, "Dir3")
	_ = os.MkdirAll(dir3, 0o755)

	// Attempting to relocate src-1 to the default library path should fail
	defaultPath := app.settings.Get().LibrarySources[0].Path
	if _, err := app.RelocateLibrarySource("src-1", defaultPath); err == nil {
		t.Fatal("expected error relocating to existing library path, got nil")
	}

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

	// 5b. Add another source with same name "Renamed Source 1", verify auto-disambiguation
	updated, err = app.AddLibrarySource(contracts.LibrarySource{
		ID:   "src-2",
		Name: "Renamed Source 1",
		Path: dir3,
	})
	if err != nil {
		t.Fatalf("AddLibrarySource with duplicate name failed: %v", err)
	}
	var src2Name string
	for _, s := range updated.LibrarySources {
		if s.ID == "src-2" {
			src2Name = s.Name
		}
	}
	if src2Name == "Renamed Source 1" {
		t.Fatalf("expected duplicate source name to be disambiguated, got %q", src2Name)
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

	// Before rescanning, normal ListLibraryManga reads from SQLite cache without re-probing disk
	itemsCached, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("ListLibraryManga cached read failed: %v", err)
	}
	var cachedB *contracts.LibraryManga
	for i := range itemsCached {
		if itemsCached[i].Title == "Manga B" {
			cachedB = &itemsCached[i]
		}
	}
	if cachedB == nil || !cachedB.IsAvailable {
		t.Fatalf("expected cached Manga B to remain available before explicit scan, got %+v", cachedB)
	}

	// Manual rescan confirms offline status: source B should fail/offline, manga remains with IsAvailable=false!
	itemsOffline, err := app.ScanLibrary()
	if err != nil {
		t.Fatalf("ScanLibrary during offline failed: %v", err)
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

	// Rescan after restore: Manga B should become available again!
	itemsOnline, err := app.ScanLibrary()
	if err != nil {
		t.Fatalf("ScanLibrary after restore failed: %v", err)
	}
	for _, it := range itemsOnline {
		if it.Title == "Manga B" && !it.IsAvailable {
			t.Fatalf("expected Manga B to be available again after restore, got %+v", it)
		}
	}
}

func TestAppSourcesSeparateDisplay(t *testing.T) {
	dataDir := t.TempDir()
	appDataDir := filepath.Join(dataDir, "panelneko-reader")
	sqliteStore, err := store.Open(appDataDir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer sqliteStore.Close()

	settingsService, err := settings.NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	dirA := filepath.Join(t.TempDir(), "DirA")
	dirB := filepath.Join(t.TempDir(), "DirB")

	// DirA (Local): Naruto (Vol 01), Collection Action (Bleach)
	_ = os.MkdirAll(filepath.Join(dirA, "Naruto", "Vol 01"), 0o755)
	_ = os.WriteFile(filepath.Join(dirA, "Naruto", "Vol 01", "001.jpg"), []byte("naruto-page1"), 0o644)
	_ = os.MkdirAll(filepath.Join(dirA, "Action", "Bleach", "Vol 01"), 0o755)
	_ = os.WriteFile(filepath.Join(dirA, "Action", ".collection"), []byte(""), 0o644)
	_ = os.WriteFile(filepath.Join(dirA, "Action", "Bleach", "Vol 01", "001.jpg"), []byte("bleach-page1"), 0o644)

	// DirB (Network): Naruto (Vol 02), Collection Action (One Piece)
	_ = os.MkdirAll(filepath.Join(dirB, "Naruto", "Vol 02"), 0o755)
	_ = os.WriteFile(filepath.Join(dirB, "Naruto", "Vol 02", "001.jpg"), []byte("naruto-page2"), 0o644)
	_ = os.MkdirAll(filepath.Join(dirB, "Action", "One Piece", "Vol 01"), 0o755)
	_ = os.WriteFile(filepath.Join(dirB, "Action", ".collection"), []byte(""), 0o644)
	_ = os.WriteFile(filepath.Join(dirB, "Action", "One Piece", "Vol 01", "001.jpg"), []byte("op-page1"), 0o644)

	initSettings := settingsService.Get()
	initSettings.LibrarySources = []contracts.LibrarySource{
		{
			ID:      "src-local",
			Name:    "Local Manga",
			Type:    contracts.SourceTypeLocal,
			Path:    dirA,
			Enabled: true,
			Status:  contracts.SourceStatusOnline,
		},
		{
			ID:      "src-network",
			Name:    "Network Manga",
			Type:    contracts.SourceTypeNetwork,
			Path:    dirB,
			Enabled: true,
			Status:  contracts.SourceStatusOnline,
		},
	}
	_, err = settingsService.Update(initSettings)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}

	app := &App{
		store:    sqliteStore,
		settings: settingsService,
	}

	// 1. Separate display: both same-named items exist independently
	itemsSep, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("ListLibraryManga (separate): %v", err)
	}

	var sepColls, sepNaruto int
	for _, it := range itemsSep {
		if it.ParentPath == "" && it.IsCollection && it.RelativePath == "Action" {
			sepColls++
		}
		if it.ParentPath == "" && !it.IsCollection && it.RelativePath == "Naruto" {
			sepNaruto++
		}
	}
	if sepColls != 2 {
		t.Fatalf("expected 2 Action collections in separate mode, got %d", sepColls)
	}
	if sepNaruto != 2 {
		t.Fatalf("expected 2 Naruto mangas in separate mode, got %d", sepNaruto)
	}

	// 2. Test GetReaderManifest for specific item
	localNarutoID := library.EncodeMangaIDWithSource("src-local", "Naruto")
	manifestLocal, err := app.GetReaderManifest(localNarutoID)
	if err != nil {
		t.Fatalf("GetReaderManifest (local): %v", err)
	}
	if len(manifestLocal.Chapters) != 1 || manifestLocal.Chapters[0].Title != "Vol 01" {
		t.Fatalf("expected 1 chapter 'Vol 01' for local Naruto, got %v", manifestLocal.Chapters)
	}

	// 3. Test Remote Source Disconnection Fallback
	// Simulate DirB (network source) being disconnected or inaccessible
	_ = os.RemoveAll(dirB)

	remoteNarutoID := library.EncodeMangaIDWithSource("src-network", "Naruto")
	manifestFallback, err := app.GetReaderManifest(remoteNarutoID)
	if err != nil {
		t.Fatalf("expected fallback to local source for disconnected remote Naruto, got error: %v", err)
	}
	if len(manifestFallback.Chapters) != 1 || manifestFallback.Chapters[0].Title != "Vol 01" {
		t.Fatalf("expected local chapter Vol 01 to be loaded via fallback, got %v", manifestFallback.Chapters)
	}
}

func TestAppServiceShutdown(t *testing.T) {
	app, cleanup := newAssetTestApp(t, t.TempDir())
	defer cleanup()

	started := make(chan struct{})
	finished := make(chan struct{})
	app.goBackground(func(ctx context.Context) {
		close(started)
		<-ctx.Done()
		close(finished)
	})
	<-started

	if err := app.ServiceShutdown(); err != nil {
		t.Fatalf("ServiceShutdown failed: %v", err)
	}

	select {
	case <-finished:
	default:
		t.Fatal("expected background task to be cancelled and awaited during shutdown")
	}

	// Verify that tasks scheduled after shutdown are rejected
	postShutdownRan := false
	app.goBackground(func(ctx context.Context) {
		postShutdownRan = true
	})
	if postShutdownRan {
		t.Fatal("expected background task scheduled after shutdown to be rejected")
	}

	// Calling shutdown on nil store should also be safe
	appNil := &App{}
	if err := appNil.ServiceShutdown(); err != nil {
		t.Fatalf("ServiceShutdown on nil store failed: %v", err)
	}
}

func TestMangaOnlineLinkingAndDownloaderRPC(t *testing.T) {
	app, cleanup := newAssetTestApp(t, t.TempDir())
	defer cleanup()

	mangaID := "test-manga-1"
	link := contracts.MangaOnlineLink{
		MangaID:       mangaID,
		OnlineSource:  "copymanga",
		OnlineComicID: "onepiece",
		OnlineTitle:   "海贼王",
		AutoFollow:    true,
		FollowPolicy:  "latest_only",
	}

	if err := app.LinkMangaOnline(link); err != nil {
		t.Fatalf("LinkMangaOnline failed: %v", err)
	}

	fetched, err := app.GetMangaOnlineLink(mangaID)
	if err != nil {
		t.Fatalf("GetMangaOnlineLink failed: %v", err)
	}
	if fetched.OnlineComicID != "onepiece" || fetched.OnlineTitle != "海贼王" || !fetched.AutoFollow {
		t.Fatalf("unexpected fetched link: %+v", fetched)
	}

	// Test GetAllMangaOnlineLinks
	allLinks, err := app.GetAllMangaOnlineLinks()
	if err != nil {
		t.Fatalf("GetAllMangaOnlineLinks failed: %v", err)
	}
	if len(allLinks) != 1 {
		t.Fatalf("expected 1 link in allLinks, got %d", len(allLinks))
	}

	// Test ToggleMangaAutoFollow
	newStatus, err := app.ToggleMangaAutoFollow(mangaID)
	if err != nil {
		t.Fatalf("ToggleMangaAutoFollow failed: %v", err)
	}
	if newStatus {
		t.Fatalf("expected autoFollow to be toggled to false, got true")
	}

	// Test OpenLogDirectory
	if err := app.OpenLogDirectory(); err != nil {
		t.Fatalf("OpenLogDirectory failed: %v", err)
	}

	// Test Unlink
	if err := app.UnlinkMangaOnline(mangaID); err != nil {
		t.Fatalf("UnlinkMangaOnline failed: %v", err)
	}

	fetchedAfter, err := app.GetMangaOnlineLink(mangaID)
	if err != nil {
		t.Fatalf("GetMangaOnlineLink after unlink failed: %v", err)
	}
	if fetchedAfter.OnlineComicID != "" {
		t.Fatalf("expected empty link after unlink, got %+v", fetchedAfter)
	}
}

func TestCheckMangaUpdatesGroupAware(t *testing.T) {
	// Mock CopyManga API Server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/api/v3/comic2/onepiece") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"results": map[string]any{
					"comic": map[string]any{
						"name":      "海贼王",
						"path_word": "onepiece",
					},
					"groups": map[string]any{
						"default": map[string]any{
							"name":      "话",
							"path_word": "default",
						},
						"tankobon": map[string]any{
							"name":      "卷",
							"path_word": "tankobon",
						},
					},
				},
			})
			return
		}
		if strings.Contains(r.URL.Path, "/group/default/chapters") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"results": map[string]any{
					"total": 2,
					"list": []map[string]any{
						{"uuid": "ch-1", "name": "第1话", "index": 1.0},
						{"uuid": "ch-2", "name": "第2话", "index": 2.0},
					},
				},
			})
			return
		}
		if strings.Contains(r.URL.Path, "/group/tankobon/chapters") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"results": map[string]any{
					"total": 1,
					"list": []map[string]any{
						{"uuid": "vol-1", "name": "第1卷", "index": 1.0},
					},
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	libraryRoot := t.TempDir()
	mangaDir := filepath.Join(libraryRoot, "海贼王")
	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir mangaDir: %v", err)
	}
	// Create local chapter 1 with title containing group "话"
	ch1Path := filepath.Join(mangaDir, "001 - 第1话.cbz")
	writeZipArchiveForAppTest(t, ch1Path, map[string]string{
		"001.png": "bytes",
	})

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	// Initial Scan
	mangas, err := app.ScanLibrary()
	if err != nil || len(mangas) == 0 {
		t.Fatalf("scan library failed: %v", err)
	}

	targetMangaID := mangas[0].ID

	// Setup CopyManga client pointed at test server
	serverHost := strings.TrimPrefix(server.URL, "http://")
	app.copyManga = copymanga.NewClient(serverHost, "", 5)
	app.klz9 = klz9.NewClient(app.store, "https://klz9.com", 5)
	app.downloads = downloader.NewManager(app.store, app.settings, app.copyManga, app.klz9)
	defer app.downloads.Close()

	// Link manga with online onepiece
	link := contracts.MangaOnlineLink{
		MangaID:       targetMangaID,
		OnlineSource:  copymanga.SiteName,
		OnlineComicID: "onepiece",
		OnlineTitle:   "海贼王",
		AutoFollow:    true,
		FollowPolicy:  "latest_only",
	}
	if err := app.LinkMangaOnline(link); err != nil {
		t.Fatalf("LinkMangaOnline failed: %v", err)
	}

	// Check updates - group "话" has local chapter 1. It should queue chapter 2 ("第2话") only, NOT volume 1 ("第1卷")!
	queued, err := app.CheckMangaUpdates(targetMangaID)
	if err != nil {
		t.Fatalf("CheckMangaUpdates failed: %v", err)
	}
	if queued != 1 {
		t.Fatalf("expected 1 queued chapter for group '话', got %d", queued)
	}

	tasks, err := app.GetDownloadTasks()
	if err != nil || len(tasks) != 1 {
		t.Fatalf("expected 1 task in queue, got %d", len(tasks))
	}
	if tasks[0].ChapterID != "ch-2" || tasks[0].ChapterTitle != "第2话" {
		t.Errorf("expected task for ch-2 第2话, got %+v", tasks[0])
	}

	// Test GetOnlineMangaGroups dynamically fetching real groups
	realGroups, err := app.GetOnlineMangaGroups(copymanga.SiteName, "onepiece")
	if err != nil {
		t.Fatalf("GetOnlineMangaGroups failed: %v", err)
	}
	if len(realGroups) != 2 || realGroups[0] != "话" || realGroups[1] != "卷" {
		t.Fatalf("expected realGroups ['话', '卷'], got %+v", realGroups)
	}

	// Test GetOnlineMangaChapters deduplication and local manga matching
	onlineChs, err := app.GetOnlineMangaChapters(copymanga.SiteName, "onepiece", "海贼王")
	if err != nil {
		t.Fatalf("GetOnlineMangaChapters failed: %v", err)
	}
	var ch1, ch2 *contracts.OnlineMangaChapter
	for i := range onlineChs {
		if onlineChs[i].ID == "ch-1" {
			ch1 = &onlineChs[i]
		}
		if onlineChs[i].ID == "ch-2" {
			ch2 = &onlineChs[i]
		}
	}
	if ch1 == nil || !ch1.IsDownloaded || ch1.MatchedLocalTitle != "海贼王" {
		t.Fatalf("expected ch-1 to be marked IsDownloaded=true with MatchedLocalTitle='海贼王', got %+v", ch1)
	}
	if ch2 == nil || ch2.IsDownloaded {
		t.Fatalf("expected ch-2 to be marked IsDownloaded=false, got %+v", ch2)
	}

	// Adversarial test: unknown provider returns clean errors / empty slices
	if _, err := app.SearchOnlineManga("unknown_provider", "keyword", 1, 10); err == nil {
		t.Fatalf("expected error searching online manga with unknown provider")
	}
	if _, err := app.GetOnlineMangaChapters("unknown_provider", "comic", ""); err == nil {
		t.Fatalf("expected error getting online manga chapters with unknown provider")
	}
	if unknownGroups, err := app.GetOnlineMangaGroups("unknown_provider", "comic"); err != nil || len(unknownGroups) != 0 {
		t.Fatalf("expected empty slice and nil error for unknown provider groups, got %v, err=%v", unknownGroups, err)
	}

	// Now test CheckAllFollowedUpdates: ch-2 is already queued, so no new tasks should be created
	allQueued, err := app.CheckAllFollowedUpdates()
	if err != nil {
		t.Fatalf("CheckAllFollowedUpdates failed: %v", err)
	}
	if allQueued != 0 {
		t.Fatalf("expected 0 new queued chapters since ch-2 was already queued, got %d", allQueued)
	}
}

func TestLoginCopyMangaDeveloperModeAndAccounts(t *testing.T) {
	app := &App{}

	// Initially dev mode is false
	if app.GetIsDevMode() {
		t.Fatal("expected dev mode to be false initially")
	}

	// Developer mode can be set directly via SetDevMode
	if err := app.SetDevMode(true); err != nil {
		t.Fatalf("SetDevMode(true) failed: %v", err)
	}
	if !app.GetIsDevMode() {
		t.Fatal("expected GetIsDevMode to return true")
	}

	// Verify DevInfo
	info, err := app.GetDevInfo()
	if err != nil {
		t.Fatalf("GetDevInfo failed: %v", err)
	}
	if !info.IsDevMode || info.KeySource == "" || info.KeyFingerprint == "" {
		t.Errorf("unexpected DevInfo: %+v", info)
	}

	// Verify Account operations with a store
	tempDir := t.TempDir()
	sqliteStore, err := store.Open(tempDir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer sqliteStore.Close()
	app.store = sqliteStore

	settingsService, err := settings.NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}
	app.settings = settingsService
	app.copyManga = copymanga.NewClient("127.0.0.1", "", 5)

	// Add manual account
	err = app.AddCopyMangaAccount("dev_acc1", "plain_password", "token_dev1")
	if err != nil {
		t.Fatalf("AddCopyMangaAccount failed: %v", err)
	}

	accounts, err := app.GetCopyMangaAccounts()
	if err != nil || len(accounts) != 1 || accounts[0].Username != "dev_acc1" {
		t.Fatalf("expected dev_acc1, got %+v", accounts)
	}

	// Delete account
	err = app.DeleteCopyMangaAccount("dev_acc1")
	if err != nil {
		t.Fatalf("DeleteCopyMangaAccount failed: %v", err)
	}

	accountsAfter, err := app.GetCopyMangaAccounts()
	if err != nil || len(accountsAfter) != 0 {
		t.Fatalf("expected 0 accounts after deletion, got %+v", accountsAfter)
	}
}

func TestApp_FollowedUpdateCheckStatusAndConcurrency(t *testing.T) {
	tempDir := t.TempDir()
	sqliteStore, err := store.Open(tempDir)
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	settingsService, err := settings.NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	app := &App{
		store:    sqliteStore,
		settings: settingsService,
	}

	// 1. Initial status should be idle
	status := app.GetFollowedUpdateCheckStatus()
	if status.Checking || status.Total != 0 || status.Current != 0 {
		t.Fatalf("expected idle status, got %+v", status)
	}

	// 2. Running CheckAllFollowedUpdates with 0 links completes with 0
	queued, err := app.CheckAllFollowedUpdates()
	if err != nil {
		t.Fatalf("CheckAllFollowedUpdates with 0 links failed: %v", err)
	}
	if queued != 0 {
		t.Fatalf("expected 0 queued, got %d", queued)
	}
	status = app.GetFollowedUpdateCheckStatus()
	if status.Checking {
		t.Fatalf("expected status not checking after complete, got %+v", status)
	}
}

func TestImportCopyMangaAccountsAdversarial(t *testing.T) {
	tempDir := t.TempDir()
	sqliteStore, err := store.Open(tempDir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer sqliteStore.Close()

	settingsService, err := settings.NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	app := &App{
		store:    sqliteStore,
		settings: settingsService,
	}

	// 1. Boundary: Empty input slice
	emptyRes, err := app.ImportCopyMangaAccounts([]contracts.CopyMangaAccountInput{})
	if err != nil {
		t.Fatalf("empty slice failed: %v", err)
	}
	if emptyRes.Total != 0 || emptyRes.Imported != 0 || emptyRes.Updated != 0 || emptyRes.Skipped != 0 {
		t.Fatalf("expected all zeros for empty input, got %+v", emptyRes)
	}

	// 2. Adversarial inputs: Whitespace usernames, deformed entries, valid entries
	mixedRes, err := app.ImportCopyMangaAccounts([]contracts.CopyMangaAccountInput{
		{Username: "   ", Password: "pwd", Token: "tok"},
		{Username: "", Password: "pwd", Token: "tok"},
		{Username: "user_a", Password: "initial_pwd", Token: "tok_a"},
		{Username: "user_b", Password: "initial_pwd_b", Token: ""},
	})
	if err != nil {
		t.Fatalf("mixed import failed: %v", err)
	}
	if mixedRes.Total != 4 || mixedRes.Imported != 2 || mixedRes.Skipped != 2 || mixedRes.Updated != 0 {
		t.Fatalf("expected total=4, imported=2, skipped=2, updated=0, got %+v", mixedRes)
	}

	// 3. Upsert update test: user_a with new token and empty password (should keep old password)
	updateRes, err := app.ImportCopyMangaAccounts([]contracts.CopyMangaAccountInput{
		{Username: "user_a", Password: "", Token: "new_tok_a"},
		{Username: "user_c", Password: "pwd_c", Token: "tok_c"},
	})
	if err != nil {
		t.Fatalf("update import failed: %v", err)
	}
	if updateRes.Total != 2 || updateRes.Imported != 1 || updateRes.Updated != 1 || updateRes.Skipped != 0 {
		t.Fatalf("expected total=2, imported=1, updated=1, skipped=0, got %+v", updateRes)
	}

	// Check that user_a still has decrypted password
	accounts, err := app.GetCopyMangaAccounts()
	if err != nil {
		t.Fatalf("GetCopyMangaAccounts failed: %v", err)
	}
	var foundUserA *contracts.CopyMangaAccount
	for i := range accounts {
		if accounts[i].Username == "user_a" {
			foundUserA = &accounts[i]
			break
		}
	}
	if foundUserA == nil {
		t.Fatal("user_a not found in accounts")
	}
	if foundUserA.Password != "initial_pwd" {
		t.Fatalf("expected user_a to retain initial_pwd, got %q", foundUserA.Password)
	}
	if foundUserA.Token != "new_tok_a" {
		t.Fatalf("expected user_a to update to new_tok_a, got %q", foundUserA.Token)
	}
}

func TestCreateDownloadTasksAutoLink(t *testing.T) {
	app, cleanup := newAssetTestApp(t, t.TempDir())
	defer cleanup()

	app.klz9 = klz9.NewClient(app.store, "https://klz9.com", 5)
	app.downloads = downloader.NewManager(app.store, app.settings, app.copyManga, app.klz9)
	defer app.downloads.Close()

	inputs := []contracts.CreateDownloadTaskInput{
		{
			Source:         klz9.SiteName,
			MangaID:        "sore-wa-furitsumoru-yuki-no-youna",
			MangaTitle:     "SORE WA, FURITSUMORU YUKI NO YOUNA",
			ChapterID:      "436091",
			ChapterTitle:   "Chapter 5.1",
			ChapterNumber:  5.1,
			ChapterGroup:   "default",
			TargetSourceID: "default",
		},
		{
			Source:         klz9.SiteName,
			MangaID:        "sore-wa-furitsumoru-yuki-no-youna",
			MangaTitle:     "SORE WA, FURITSUMORU YUKI NO YOUNA",
			ChapterID:      "436090",
			ChapterTitle:   "Chapter 4.2",
			ChapterNumber:  4.2,
			ChapterGroup:   "default",
			TargetSourceID: "default",
		},
	}

	created, err := app.CreateDownloadTasks(inputs)
	if err != nil {
		t.Fatalf("CreateDownloadTasks failed: %v", err)
	}
	if len(created) != 2 {
		t.Fatalf("expected 2 tasks created, got %d", len(created))
	}

	// Verify online link was automatically created
	expectedMangaID := library.EncodeMangaIDWithSource("default", "SORE WA, FURITSUMORU YUKI NO YOUNA")
	link, found, err := app.store.GetMangaOnlineLink(expectedMangaID)
	if err != nil {
		t.Fatalf("GetMangaOnlineLink failed: %v", err)
	}
	if !found {
		t.Fatalf("expected manga link to be auto-created for %s", expectedMangaID)
	}
	if link.OnlineSource != klz9.SiteName || link.OnlineComicID != "sore-wa-furitsumoru-yuki-no-youna" {
		t.Errorf("unexpected online source/id: %s / %s", link.OnlineSource, link.OnlineComicID)
	}
	if !link.AutoFollow {
		t.Errorf("expected AutoFollow to be true by default")
	}
	if link.FollowPolicy != "latest_only" {
		t.Errorf("expected follow policy latest_only, got %s", link.FollowPolicy)
	}
	if link.BaselineChapterNumber != 5.1 {
		t.Errorf("expected baseline chapter number 5.1, got %v", link.BaselineChapterNumber)
	}

	// Downloading higher chapter updates baseline
	higherInputs := []contracts.CreateDownloadTaskInput{
		{
			Source:         klz9.SiteName,
			MangaID:        "sore-wa-furitsumoru-yuki-no-youna",
			MangaTitle:     "SORE WA, FURITSUMORU YUKI NO YOUNA",
			ChapterID:      "436092",
			ChapterTitle:   "Chapter 6.0",
			ChapterNumber:  6.0,
			ChapterGroup:   "default",
			TargetSourceID: "default",
		},
	}
	if _, err := app.CreateDownloadTasks(higherInputs); err != nil {
		t.Fatalf("CreateDownloadTasks higher failed: %v", err)
	}

	linkUpdated, found, err := app.store.GetMangaOnlineLink(expectedMangaID)
	if err != nil || !found {
		t.Fatalf("GetMangaOnlineLink after update failed: %v", err)
	}
	if linkUpdated.BaselineChapterNumber != 6.0 {
		t.Errorf("expected updated baseline chapter number 6.0, got %v", linkUpdated.BaselineChapterNumber)
	}
}

func TestAddDroppedSources(t *testing.T) {
	tempRoot := t.TempDir()
	app, cleanup := newAssetTestApp(t, tempRoot)
	defer cleanup()

	dir1 := filepath.Join(tempRoot, "MangaFolder1")
	dir2 := filepath.Join(tempRoot, "MangaFolder2")
	_ = os.MkdirAll(dir1, 0o755)
	_ = os.MkdirAll(dir2, 0o755)

	filePath := filepath.Join(tempRoot, "sample.cbz")
	_ = os.WriteFile(filePath, []byte("fake-cbz"), 0o644)
	nonExistent := filepath.Join(tempRoot, "does_not_exist")

	// 1. Drop mixed inputs: 2 valid folders, 1 archive file, 1 non-existent path
	res, err := app.AddDroppedSources([]string{dir1, filePath, nonExistent, dir2})
	if err != nil {
		t.Fatalf("AddDroppedSources failed: %v", err)
	}

	if res.AddedCount != 3 {
		t.Errorf("expected 3 added sources, got %d", res.AddedCount)
	}
	if res.IgnoredFiles != 0 {
		t.Errorf("expected 0 ignored files, got %d", res.IgnoredFiles)
	}
	if res.ExistingCount != 0 {
		t.Errorf("expected 0 existing count, got %d", res.ExistingCount)
	}
	foundArchive := false
	for _, addedPath := range res.AddedPaths {
		if addedPath == filePath {
			foundArchive = true
			break
		}
	}
	if !foundArchive {
		t.Errorf("expected archive path %s to be added, got %v", filePath, res.AddedPaths)
	}

	// 2. Drop again with dir1 (already exists)
	res2, err := app.AddDroppedSources([]string{dir1, filePath})
	if err != nil {
		t.Fatalf("AddDroppedSources second call failed: %v", err)
	}
	if res2.AddedCount != 0 {
		t.Errorf("expected 0 added sources on duplicate, got %d", res2.AddedCount)
	}
	if res2.ExistingCount != 2 {
		t.Errorf("expected 2 existing count, got %d", res2.ExistingCount)
	}
	if res2.IgnoredFiles != 0 {
		t.Errorf("expected 0 ignored files, got %d", res2.IgnoredFiles)
	}

	// 3. Drop empty array
	res3, err := app.AddDroppedSources([]string{})
	if err != nil {
		t.Fatalf("AddDroppedSources empty failed: %v", err)
	}
	if res3.AddedCount != 0 || res3.IgnoredFiles != 0 || res3.ExistingCount != 0 {
		t.Errorf("expected zero counts for empty paths, got %+v", res3)
	}
}

func TestPreviewAndCheckUseChapterIDAndEffectiveNumber(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/api/v3/comic2/comic-slug") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"results": map[string]any{
					"comic": map[string]any{
						"name":      "Test Manga",
						"path_word": "comic-slug",
					},
					"groups": map[string]any{
						"default": map[string]any{
							"name":      "话",
							"path_word": "default",
						},
					},
				},
			})
			return
		}
		if strings.Contains(r.URL.Path, "/group/default/chapters") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 200,
				"results": map[string]any{
					"total": 2,
					"list": []map[string]any{
						{"uuid": "ch-special", "name": "特别篇", "index": 0.5},
						{"uuid": "ch-3", "name": "第3话", "index": 0.0},
					},
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	libraryRoot := t.TempDir()
	mangaDir := filepath.Join(libraryRoot, "Test Manga")
	chapterPath := filepath.Join(mangaDir, "000 - 序章.cbz")
	writeZipArchiveForAppTest(t, chapterPath, map[string]string{
		"001.png": "page",
		"ComicInfo.xml": `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Title>序章</Title>
  <Number>0</Number>
  <Notes>{"source":"copymanga","mangaId":"comic-slug","chapterId":"ch-special"}</Notes>
</ComicInfo>`,
	})

	app, cleanup := newAssetTestApp(t, libraryRoot)
	defer cleanup()

	mangas, err := app.ScanLibrary()
	if err != nil || len(mangas) == 0 {
		t.Fatalf("scan library failed: %v", err)
	}
	targetMangaID := mangas[0].ID

	serverHost := strings.TrimPrefix(server.URL, "http://")
	app.copyManga = copymanga.NewClient(serverHost, "", 5)
	app.klz9 = klz9.NewClient(app.store, "https://klz9.com", 5)
	app.downloads = downloader.NewManager(app.store, app.settings, app.copyManga, app.klz9)
	defer app.downloads.Close()

	if err := app.LinkMangaOnline(contracts.MangaOnlineLink{
		MangaID:       targetMangaID,
		OnlineSource:  copymanga.SiteName,
		OnlineComicID: "comic-slug",
		OnlineTitle:   "Test Manga",
		AutoFollow:    true,
		FollowPolicy:  "latest_only",
	}); err != nil {
		t.Fatalf("link manga: %v", err)
	}

	preview, err := app.PreviewMangaLink(contracts.MangaLinkPreviewInput{
		MangaID:       targetMangaID,
		OnlineSource:  copymanga.SiteName,
		OnlineComicID: "comic-slug",
		FollowPolicy:  "latest_only",
	})
	if err != nil {
		t.Fatalf("preview manga link: %v", err)
	}
	if preview.LatestOnlyCount != 1 || len(preview.PendingChapters) != 1 || preview.PendingChapters[0] != "第3话" {
		t.Fatalf("expected only 第3话 to be pending, got count=%d pending=%v", preview.LatestOnlyCount, preview.PendingChapters)
	}

	queued, err := app.CheckMangaUpdates(targetMangaID)
	if err != nil {
		t.Fatalf("check manga updates: %v", err)
	}
	if queued != 1 {
		t.Fatalf("expected 1 queued chapter, got %d", queued)
	}

	tasks, err := app.GetDownloadTasks()
	if err != nil {
		t.Fatalf("get download tasks: %v", err)
	}
	if len(tasks) != 1 || tasks[0].ChapterID != "ch-3" {
		t.Fatalf("expected only ch-3 to be queued, got %+v", tasks)
	}
}
