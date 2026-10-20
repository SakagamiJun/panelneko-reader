package main

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
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

func TestResolveThumbnailQuality(t *testing.T) {
	off := false
	on := true

	if got := resolveThumbnailQuality(contracts.AppSettings{ThumbnailQuality: contracts.ThumbnailQualityHigh}); got != contracts.ThumbnailQualityHigh {
		t.Errorf("got %v, want high", got)
	}

	if got := resolveThumbnailQuality(contracts.AppSettings{EnableThumbnailCache: &off}); got != contracts.ThumbnailQualityOff {
		t.Errorf("got %v, want off", got)
	}

	if got := resolveThumbnailQuality(contracts.AppSettings{EnableThumbnailCache: &on}); got != contracts.ThumbnailQualityMedium {
		t.Errorf("got %v, want medium", got)
	}

	if got := resolveThumbnailQuality(contracts.AppSettings{}); got != contracts.ThumbnailQualityMedium {
		t.Errorf("got %v, want medium", got)
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

type mockUpdaterProvider struct {
	release *updater.Release
	err     error
}

func (m *mockUpdaterProvider) Name() string { return "mock" }
func (m *mockUpdaterProvider) Check(_ context.Context, _ updater.CheckRequest) (*updater.Release, error) {
	return m.release, m.err
}
func (m *mockUpdaterProvider) Download(_ context.Context, _ *updater.Release, _ io.Writer, _ func(int64, int64)) error {
	return nil
}

func TestAppCheckForUpdates(t *testing.T) {
	// Case 1: Update available, not Homebrew
	app := NewApp()
	app.isHomebrewFn = func() bool { return false }
	app.updaterProvider = &mockUpdaterProvider{
		release: &updater.Release{
			Version: "1.0.0",
			Notes:   "Test release notes",
			Metadata: map[string]any{
				"github.release.htmlURL": "https://github.com/SakagamiJun/panelneko-reader/releases/tag/v1.0.0",
			},
		},
	}

	res, err := app.CheckForUpdates()
	if err != nil {
		t.Fatalf("CheckForUpdates failed: %v", err)
	}
	if !res.HasUpdate {
		t.Error("expected HasUpdate to be true")
	}
	if res.LatestVersion != "1.0.0" {
		t.Errorf("expected LatestVersion 1.0.0, got %q", res.LatestVersion)
	}
	if res.IsHomebrew {
		t.Error("expected IsHomebrew to be false")
	}
	if res.ReleaseURL != "https://github.com/SakagamiJun/panelneko-reader/releases/tag/v1.0.0" {
		t.Errorf("unexpected ReleaseURL: %q", res.ReleaseURL)
	}

	// Case 2: Update available, Homebrew managed
	app.isHomebrewFn = func() bool { return true }
	resHomebrew, err := app.CheckForUpdates()
	if err != nil {
		t.Fatalf("CheckForUpdates failed: %v", err)
	}
	if !resHomebrew.IsHomebrew {
		t.Error("expected IsHomebrew to be true")
	}
	if !resHomebrew.HasUpdate {
		t.Error("expected HasUpdate to be true")
	}

	// Case 3: Up to date (provider returns nil, nil)
	app.updaterProvider = &mockUpdaterProvider{release: nil, err: nil}
	resUpToDate, err := app.CheckForUpdates()
	if err != nil {
		t.Fatalf("CheckForUpdates failed: %v", err)
	}
	if resUpToDate.HasUpdate {
		t.Error("expected HasUpdate to be false")
	}

	// Case 4: Provider error
	app.updaterProvider = &mockUpdaterProvider{err: fmt.Errorf("network failure")}
	_, err = app.CheckForUpdates()
	if err == nil {
		t.Error("expected error from CheckForUpdates when provider fails")
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

func TestAppDuplicateMergeMode(t *testing.T) {
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
	initSettings.DuplicateMergeMode = contracts.DuplicateMergeModeSeparate
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

	// 1. Separate mode: both items exist independently
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

	// 2. Switch to Merge Mode
	current := app.settings.Get()
	current.DuplicateMergeMode = contracts.DuplicateMergeModeMerge
	_, err = app.UpdateSettings(current)
	if err != nil {
		t.Fatalf("update settings to merge mode: %v", err)
	}

	itemsMerged, err := app.ListLibraryManga()
	if err != nil {
		t.Fatalf("ListLibraryManga (merge): %v", err)
	}

	var mergedColl *contracts.LibraryManga
	var mergedNaruto *contracts.LibraryManga
	var mergedChildren []contracts.LibraryManga

	for i := range itemsMerged {
		it := itemsMerged[i]
		if it.ParentPath == "" && it.IsCollection && it.RelativePath == "Action" {
			mergedColl = &it
		}
		if it.ParentPath == "" && !it.IsCollection && it.RelativePath == "Naruto" {
			mergedNaruto = &it
		}
		if it.ParentPath == "Action" {
			mergedChildren = append(mergedChildren, it)
		}
	}

	if mergedColl == nil {
		t.Fatal("merged collection Action not found")
	}
	if mergedColl.SourceID != "src-local" {
		t.Fatalf("expected merged collection source to be local, got %s", mergedColl.SourceID)
	}
	if mergedColl.MangaCount != 2 {
		t.Fatalf("expected merged collection to contain 2 children, got %d", mergedColl.MangaCount)
	}
	if len(mergedChildren) != 2 {
		t.Fatalf("expected 2 child mangas under Action, got %d", len(mergedChildren))
	}

	if mergedNaruto == nil {
		t.Fatal("merged Naruto not found")
	}
	if mergedNaruto.SourceID != "src-local" {
		t.Fatalf("expected merged Naruto source to be local, got %s", mergedNaruto.SourceID)
	}
	if mergedNaruto.ChapterCount != 2 {
		t.Fatalf("expected merged Naruto chapter count to be 2, got %d", mergedNaruto.ChapterCount)
	}

	// 3. Test GetReaderManifest in merge mode
	manifest, err := app.GetReaderManifest(mergedNaruto.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest (merged): %v", err)
	}
	if len(manifest.Chapters) != 2 {
		t.Fatalf("expected 2 merged chapters in reader manifest, got %d", len(manifest.Chapters))
	}
	if manifest.Chapters[0].Title != "Vol 01" || manifest.Chapters[1].Title != "Vol 02" {
		t.Fatalf("unexpected chapter order: %s, %s", manifest.Chapters[0].Title, manifest.Chapters[1].Title)
	}
	if manifest.TotalPages != 2 {
		t.Fatalf("expected 2 total pages, got %d", manifest.TotalPages)
	}

	// 4. Test Remote Source Disconnection Fallback
	// Simulate DirB (network source) being disconnected or inaccessible
	_ = os.RemoveAll(dirB)

	// In separate mode, request remote manga ID with fallback to local source
	current.DuplicateMergeMode = contracts.DuplicateMergeModeSeparate
	_, _ = app.UpdateSettings(current)

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

	if err := app.ServiceShutdown(); err != nil {
		t.Fatalf("ServiceShutdown failed: %v", err)
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

	// Login with root / dev activates dev mode without network call
	res, err := app.LoginCopyManga("root", "dev")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Success || !res.IsDevMode {
		t.Fatalf("expected dev mode activated, got %+v", res)
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
