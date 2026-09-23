package library

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
)

func TestResolveLibraryAssetPathRejectsTraversal(t *testing.T) {
	root := t.TempDir()

	if _, err := ResolveLibraryAssetPath(root, "/library-files/../secret.jpg"); err == nil {
		t.Fatal("expected traversal path to be rejected")
	}
}

func TestIsLibraryAssetRequest(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{path: "/library-files/a.jpg", want: true},
		{path: "/library-archive/a/b", want: true},
		{path: "/assets/index.js", want: false},
	}

	for _, test := range tests {
		if got := IsLibraryAssetRequest(test.path); got != test.want {
			t.Fatalf("unexpected asset routing match for %q: got %v want %v", test.path, got, test.want)
		}
	}
}

func TestListLibraryMangaAndReaderManifestSupportsDirectoryAndArchiveChapters(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Sample Manga")
	chapterDir := filepath.Join(mangaDir, "001 - Chapter 1")
	archivePath := filepath.Join(mangaDir, "002 - Chapter 2.cbz")

	if err := os.MkdirAll(chapterDir, 0o755); err != nil {
		t.Fatalf("mkdir chapter dir: %v", err)
	}

	writeFile(t, filepath.Join(chapterDir, "001.jpg"), "one")
	writeFile(t, filepath.Join(chapterDir, "002.jpg"), "two")
	writeFile(t, filepath.Join(chapterDir, "ComicInfo.xml"), `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo>
  <Series>Sample Manga</Series>
  <Title>Chapter 1</Title>
  <Number>1</Number>
</ComicInfo>`)

	writeZipArchive(t, archivePath, map[string]string{
		"images/001.jpg": "three",
		"images/002.jpg": "four",
		"ComicInfo.xml": `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo>
  <Series>Sample Manga</Series>
  <Title>Chapter 2</Title>
  <Number>2</Number>
</ComicInfo>`,
	})

	library, _, err := ScanLibraryManga(root, nil, nil)
	if err != nil {
		t.Fatalf("ListLibraryManga returned error: %v", err)
	}

	if len(library) != 1 {
		t.Fatalf("unexpected library size: %d", len(library))
	}

	item := library[0]
	if item.PageCount != 4 {
		t.Fatalf("unexpected page count: %d", item.PageCount)
	}
	if item.ChapterCount != 2 {
		t.Fatalf("unexpected chapter count: %d", item.ChapterCount)
	}
	if !strings.HasPrefix(item.CoverImageURL, LibraryThumbnailPrefix) && !strings.HasPrefix(item.CoverImageURL, LibraryAssetPrefix) {
		t.Fatalf("expected thumbnail or filesystem cover image url, got %q", item.CoverImageURL)
	}
	if !strings.HasPrefix(StripThumbnailURL(item.CoverImageURL), LibraryAssetPrefix) {
		t.Fatalf("expected stripped cover image url to have asset prefix, got %q", item.CoverImageURL)
	}

	manifest, err := GetReaderManifest(root, item.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	if manifest.TotalPages != 4 {
		t.Fatalf("unexpected total pages: %d", manifest.TotalPages)
	}
	if len(manifest.Chapters) != 2 {
		t.Fatalf("unexpected chapter count in manifest: %d", len(manifest.Chapters))
	}
	if manifest.CoverImageURL != manifest.Chapters[0].Pages[0].SourceURL {
		t.Fatalf("unexpected cover image url: %q", manifest.CoverImageURL)
	}

	if !sameResolvedPath(manifest.Chapters[0].LocalPath, chapterDir) {
		t.Fatalf("unexpected directory local path: %q", manifest.Chapters[0].LocalPath)
	}
	if !sameResolvedPath(manifest.Chapters[1].LocalPath, archivePath) {
		t.Fatalf("unexpected archive local path: %q", manifest.Chapters[1].LocalPath)
	}
	if !strings.HasPrefix(manifest.Chapters[1].Pages[0].SourceURL, LibraryArchiveAssetPrefix) {
		t.Fatalf("expected archive page url, got %q", manifest.Chapters[1].Pages[0].SourceURL)
	}
}

func TestGetReaderManifestArchiveFallbackUsesNaturalOrder(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Natural Manga")
	archivePath := filepath.Join(mangaDir, "003 - Natural.cbz")

	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga dir: %v", err)
	}

	writeZipArchive(t, archivePath, map[string]string{
		"10.jpg": "ten",
		"2.jpg":  "two",
		"3.jpg":  "three",
	})

	manifest, err := GetReaderManifest(root, encodeMangaID("Natural Manga"))
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	chapter := manifest.Chapters[0]
	if chapter.ID != "003 - Natural" {
		t.Fatalf("unexpected chapter id: %q", chapter.ID)
	}
	if chapter.Title != "003 - Natural" {
		t.Fatalf("unexpected chapter title: %q", chapter.Title)
	}
	if chapter.Number != 3 {
		t.Fatalf("unexpected chapter number: %f", chapter.Number)
	}

	got := []string{
		chapter.Pages[0].FileName,
		chapter.Pages[1].FileName,
		chapter.Pages[2].FileName,
	}
	want := []string{"2.jpg", "3.jpg", "10.jpg"}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("unexpected page order: got %v want %v", got, want)
		}
	}
}

func TestGetReaderManifestSortsChaptersByInferredNumericTokens(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Long Manga")

	chapterNames := []string{
		"1 第1话",
		"10 第10话",
		"100 第100话",
		"101 第101话",
		"2 第2话",
		"第11话",
	}
	for _, chapterName := range chapterNames {
		writeFile(t, filepath.Join(mangaDir, chapterName, "001.jpg"), chapterName)
	}

	manifest, err := GetReaderManifest(root, encodeMangaID("Long Manga"))
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	got := make([]string, 0, len(manifest.Chapters))
	gotNumbers := make([]float64, 0, len(manifest.Chapters))
	for _, chapter := range manifest.Chapters {
		got = append(got, chapter.Title)
		gotNumbers = append(gotNumbers, chapter.Number)
	}

	want := []string{"1 第1话", "2 第2话", "10 第10话", "第11话", "100 第100话", "101 第101话"}
	wantNumbers := []float64{1, 2, 10, 11, 100, 101}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("unexpected chapter order: got %v want %v", got, want)
		}
		if gotNumbers[index] != wantNumbers[index] {
			t.Fatalf("unexpected chapter numbers: got %v want %v", gotNumbers, wantNumbers)
		}
	}
}

func TestGetReaderManifestArchiveIgnoresUnsupportedAndMetadataEntries(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Filtered Manga")
	archivePath := filepath.Join(mangaDir, "004 - Filter.cbz")

	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga dir: %v", err)
	}

	writeZipArchive(t, archivePath, map[string]string{
		"__MACOSX/._001.jpg": "hidden",
		".DS_Store":          "metadata",
		"notes.txt":          "note",
		"nested/.hidden.jpg": "skip",
		"nested/001.jpg":     "one",
		"002.png":            "two",
	})

	manifest, err := GetReaderManifest(root, encodeMangaID("Filtered Manga"))
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	pages := manifest.Chapters[0].Pages
	if len(pages) != 2 {
		t.Fatalf("unexpected page count: %d", len(pages))
	}
	got := []string{pages[0].FileName, pages[1].FileName}
	want := []string{"002.png", "nested/001.jpg"}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("unexpected kept entries: got %v want %v", got, want)
		}
	}
}

func TestOpenArchiveAssetValidatesRequests(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Asset Manga")
	archivePath := filepath.Join(mangaDir, "001 - Asset.cbz")

	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga dir: %v", err)
	}

	writeZipArchive(t, archivePath, map[string]string{
		"001.jpg":   "one",
		"notes.txt": "note",
	})

	tests := []struct {
		name         string
		requestURL   string
		wantNotFound bool
	}{
		{
			name:       "invalid base64",
			requestURL: LibraryArchiveAssetPrefix + "bad!/bad!",
		},
		{
			name:       "path traversal archive",
			requestURL: LibraryArchiveAssetPrefix + encodePathToken("../escape.cbz") + "/" + encodePathToken("001.jpg"),
		},
		{
			name:         "missing entry",
			requestURL:   LibraryArchiveAssetPrefix + encodePathToken("Asset Manga/001 - Asset.cbz") + "/" + encodePathToken("missing.jpg"),
			wantNotFound: true,
		},
		{
			name:       "unsupported entry extension",
			requestURL: LibraryArchiveAssetPrefix + encodePathToken("Asset Manga/001 - Asset.cbz") + "/" + encodePathToken("notes.txt"),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reader, _, _, err := OpenArchiveAsset(root, test.requestURL)
			if reader != nil {
				reader.Close()
			}
			if err == nil {
				t.Fatal("expected request to fail")
			}
			if got := os.IsNotExist(err); got != test.wantNotFound {
				t.Fatalf("unexpected not-found flag: got %v want %v (err=%v)", got, test.wantNotFound, err)
			}
		})
	}
}

func TestListLibraryMangaNestedChapterDirectories(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Nested Manga")
	chapterDir := filepath.Join(mangaDir, "默认", "1")

	if err := os.MkdirAll(chapterDir, 0o755); err != nil {
		t.Fatalf("mkdir nested chapter dir: %v", err)
	}

	writeFile(t, filepath.Join(chapterDir, "001.jpg"), "one")
	writeFile(t, filepath.Join(chapterDir, "002.jpg"), "two")

	library, _, err := ScanLibraryManga(root, nil, nil)
	if err != nil {
		t.Fatalf("ListLibraryManga returned error: %v", err)
	}

	if len(library) != 1 {
		t.Fatalf("unexpected library size: %d", len(library))
	}

	item := library[0]
	if item.Title != "Nested Manga" {
		t.Fatalf("unexpected title: %q", item.Title)
	}
	if item.PageCount != 2 {
		t.Fatalf("unexpected page count: %d", item.PageCount)
	}
	if item.ChapterCount != 1 {
		t.Fatalf("unexpected chapter count: %d", item.ChapterCount)
	}

	manifest, err := GetReaderManifest(root, item.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	if manifest.TotalPages != 2 {
		t.Fatalf("unexpected total pages: %d", manifest.TotalPages)
	}
	if len(manifest.Chapters) != 1 {
		t.Fatalf("unexpected chapter count in manifest: %d", len(manifest.Chapters))
	}
	if manifest.Chapters[0].Title != "1" {
		t.Fatalf("unexpected chapter title: %q", manifest.Chapters[0].Title)
	}
	if manifest.Chapters[0].Number != 1 {
		t.Fatalf("unexpected chapter number: %f", manifest.Chapters[0].Number)
	}
}

func TestListLibraryMangaNestedChaptersHaveUniqueIDs(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Multi Volume Manga")

	// Two grouping folders, each containing a chapter named "001"
	chapter1Dir := filepath.Join(mangaDir, "Vol 1", "001")
	chapter2Dir := filepath.Join(mangaDir, "Vol 2", "001")

	if err := os.MkdirAll(chapter1Dir, 0o755); err != nil {
		t.Fatalf("mkdir chapter1 dir: %v", err)
	}
	if err := os.MkdirAll(chapter2Dir, 0o755); err != nil {
		t.Fatalf("mkdir chapter2 dir: %v", err)
	}

	writeFile(t, filepath.Join(chapter1Dir, "001.jpg"), "page1")
	writeFile(t, filepath.Join(chapter2Dir, "001.jpg"), "page2")

	library, _, err := ScanLibraryManga(root, nil, nil)
	if err != nil {
		t.Fatalf("ListLibraryManga returned error: %v", err)
	}

	if len(library) != 1 {
		t.Fatalf("unexpected library size: %d", len(library))
	}

	manifest, err := GetReaderManifest(root, library[0].ID)
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	if len(manifest.Chapters) != 2 {
		t.Fatalf("unexpected chapter count: %d", len(manifest.Chapters))
	}

	// Both chapters have the same directory name but must have unique IDs
	if manifest.Chapters[0].ID == manifest.Chapters[1].ID {
		t.Fatalf("chapters must have unique IDs, got duplicate: %q", manifest.Chapters[0].ID)
	}

	// Both should resolve the title and number from the inner directory name
	for _, ch := range manifest.Chapters {
		if ch.Title != "001" {
			t.Fatalf("unexpected chapter title: %q", ch.Title)
		}
		if ch.Number != 1 {
			t.Fatalf("unexpected chapter number: %f", ch.Number)
		}
	}
}

func TestListLibraryMangaNestedChaptersUniqueIDsWithSidecarsWithoutChapterID(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Sidecar Manga")

	chapter1Dir := filepath.Join(mangaDir, "Vol 1", "001")
	chapter2Dir := filepath.Join(mangaDir, "Vol 2", "001")

	for _, dir := range []string{chapter1Dir, chapter2Dir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
	}

	writeFile(t, filepath.Join(chapter1Dir, "001.jpg"), "page1")
	writeFile(t, filepath.Join(chapter2Dir, "001.jpg"), "page2")

	// Write ComicInfo that do NOT set chapterID
	for _, dir := range []string{chapter1Dir, chapter2Dir} {
		writeFile(t, filepath.Join(dir, "ComicInfo.xml"), `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo>
  <Series>Sidecar Manga</Series>
  <Title>001</Title>
  <Number>1</Number>
</ComicInfo>`)
	}

	library, _, err := ScanLibraryManga(root, nil, nil)
	if err != nil {
		t.Fatalf("ListLibraryManga returned error: %v", err)
	}

	manifest, err := GetReaderManifest(root, library[0].ID)
	if err != nil {
		t.Fatalf("GetReaderManifest returned error: %v", err)
	}

	if len(manifest.Chapters) != 2 {
		t.Fatalf("unexpected chapter count: %d", len(manifest.Chapters))
	}

	if manifest.Chapters[0].ID == manifest.Chapters[1].ID {
		t.Fatalf("chapters must have unique IDs even with sidecars lacking chapterID, got duplicate: %q", manifest.Chapters[0].ID)
	}
}

func writeFile(t *testing.T, filePath string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		t.Fatalf("mkdir parent dir: %v", err)
	}
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		t.Fatalf("write file %s: %v", filePath, err)
	}
}

func TestScanLibraryMangaWithCollectionMarker(t *testing.T) {
	root := t.TempDir()

	// 1. Regular Manga at root
	regDir := filepath.Join(root, "Regular Manga")
	writeFile(t, filepath.Join(regDir, "Vol 1", "001.jpg"), "reg1")
	writeFile(t, filepath.Join(regDir, "Vol 2", "001.jpg"), "reg2")

	// 2. Collection with .collection marker
	collDir := filepath.Join(root, "Author Collection")
	writeFile(t, filepath.Join(collDir, ".collection"), "")

	// 2a. Multi-chapter manga inside collection
	manga1Dir := filepath.Join(collDir, "Manga One")
	writeFile(t, filepath.Join(manga1Dir, "Vol 1", "001.jpg"), "m1v1")
	writeFile(t, filepath.Join(manga1Dir, "Vol 2", "001.jpg"), "m1v2")

	// 2b. Standalone CBZ manga inside collection
	writeZipArchive(t, filepath.Join(collDir, "Manga Two.cbz"), map[string]string{
		"001.png": "m2p1",
		"002.png": "m2p2",
	})

	// 2c. One-shot direct images manga inside collection
	manga3Dir := filepath.Join(collDir, "Manga Three")
	writeFile(t, filepath.Join(manga3Dir, "001.jpg"), "m3p1")
	writeFile(t, filepath.Join(manga3Dir, "002.jpg"), "m3p2")
	writeFile(t, filepath.Join(manga3Dir, "003.jpg"), "m3p3")

	items, _, err := ScanLibraryManga(root, nil, nil)
	if err != nil {
		t.Fatalf("ScanLibraryManga error: %v", err)
	}

	// Expect 5 items: 1 Regular + 1 Collection + 3 mangas in Collection
	if len(items) != 5 {
		t.Fatalf("expected 5 items, got %d", len(items))
	}

	itemMap := make(map[string]contracts.LibraryManga)
	for _, item := range items {
		itemMap[item.RelativePath] = item
	}

	// Verify Regular Manga
	regItem, ok := itemMap["Regular Manga"]
	if !ok || regItem.IsCollection || regItem.ParentPath != "" || regItem.ChapterCount != 2 || regItem.PageCount != 2 {
		t.Fatalf("unexpected regular manga item: %+v", regItem)
	}

	// Verify Collection Item
	collItem, ok := itemMap["Author Collection"]
	if !ok || !collItem.IsCollection || collItem.MangaCount != 3 || collItem.ParentPath != "" {
		t.Fatalf("unexpected collection item: %+v", collItem)
	}

	// Verify Manga One
	m1, ok := itemMap["Author Collection/Manga One"]
	if !ok || m1.IsCollection || m1.ParentPath != "Author Collection" || m1.Title != "Manga One" || m1.ChapterCount != 2 {
		t.Fatalf("unexpected manga 1 item: %+v", m1)
	}

	// Verify Manga Two (archive)
	m2, ok := itemMap["Author Collection/Manga Two.cbz"]
	if !ok || m2.IsCollection || m2.ParentPath != "Author Collection" || m2.Title != "Manga Two" || m2.PageCount != 2 {
		t.Fatalf("unexpected manga 2 item: %+v", m2)
	}

	// Verify Manga Three (one-shot direct images)
	m3, ok := itemMap["Author Collection/Manga Three"]
	if !ok || m3.IsCollection || m3.ParentPath != "Author Collection" || m3.Title != "Manga Three" || m3.PageCount != 3 || m3.ChapterCount != 1 {
		t.Fatalf("unexpected manga 3 item: %+v", m3)
	}

	// Verify GetReaderManifest for Manga One
	manifest1, err := GetReaderManifest(root, m1.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest(m1) error: %v", err)
	}
	if len(manifest1.Chapters) != 2 || manifest1.Title != "Manga One" {
		t.Fatalf("unexpected manifest1: %+v", manifest1)
	}

	// Verify GetReaderManifest for Manga Two (archive)
	manifest2, err := GetReaderManifest(root, m2.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest(m2) error: %v", err)
	}
	if len(manifest2.Chapters) != 1 || manifest2.TotalPages != 2 || manifest2.Title != "Manga Two" {
		t.Fatalf("unexpected manifest2: %+v", manifest2)
	}

	// Verify GetReaderManifest for Manga Three (one-shot)
	manifest3, err := GetReaderManifest(root, m3.ID)
	if err != nil {
		t.Fatalf("GetReaderManifest(m3) error: %v", err)
	}
	if len(manifest3.Chapters) != 1 || manifest3.TotalPages != 3 || manifest3.Title != "Manga Three" {
		t.Fatalf("unexpected manifest3: %+v", manifest3)
	}
}

func TestApplyPinsAndSort(t *testing.T) {
	items := []contracts.LibraryManga{
		{
			ID:            "manga-a",
			Title:         "Manga A",
			RelativePath:  "Manga A",
			ParentPath:    "",
			IsCollection:  false,
			CoverImageURL: "/covers/a.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
		},
		{
			ID:            "manga-b",
			Title:         "Manga B",
			RelativePath:  "Manga B",
			ParentPath:    "",
			IsCollection:  false,
			CoverImageURL: "/covers/b.jpg",
			LastUpdated:   "2026-08-02T00:00:00Z",
		},
		{
			ID:            "coll-c",
			Title:         "Collection C",
			RelativePath:  "Collection C",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/c1.jpg",
			LastUpdated:   "2026-08-03T00:00:00Z",
		},
		{
			ID:            "coll-c-1",
			Title:         "C Manga 1",
			RelativePath:  "Collection C/C Manga 1",
			ParentPath:    "Collection C",
			IsCollection:  false,
			CoverImageURL: "/covers/c1.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
		},
		{
			ID:            "coll-c-2",
			Title:         "C Manga 2",
			RelativePath:  "Collection C/C Manga 2",
			ParentPath:    "Collection C",
			IsCollection:  false,
			CoverImageURL: "/covers/c2.jpg",
			LastUpdated:   "2026-08-02T00:00:00Z",
		},
	}

	// 1. Without pins: root items sorted by LastUpdated DESC
	sorted := ApplyPinsAndSort(items, nil)
	if sorted[0].ID != "coll-c" || sorted[1].ID != "manga-b" || sorted[2].ID != "manga-a" {
		t.Fatalf("unexpected unpinned root order: %s, %s, %s", sorted[0].ID, sorted[1].ID, sorted[2].ID)
	}
	// Collection C's cover is still c1.jpg
	if sorted[0].CoverImageURL != "/covers/c1.jpg" {
		t.Fatalf("unexpected coll cover: %s", sorted[0].CoverImageURL)
	}

	// 2. Pin Manga A at root: Manga A should be first at root
	pins := map[string]string{
		"manga-a": "2026-08-23T10:00:00Z",
	}
	sorted = ApplyPinsAndSort(items, pins)
	if sorted[0].ID != "manga-a" {
		t.Fatalf("expected manga-a to be pinned first, got %s", sorted[0].ID)
	}
	if !sorted[0].IsPinned || sorted[0].PinnedAt != "2026-08-23T10:00:00Z" {
		t.Fatalf("expected manga-a to have pin fields set: %+v", sorted[0])
	}

	// 3. Pin Manga C 2 inside Collection C:
	// - Collection C's cover must become /covers/c2.jpg
	// - Inside Collection C, C Manga 2 must be sorted before C Manga 1
	pins = map[string]string{
		"coll-c-2": "2026-08-23T11:00:00Z",
	}
	sorted = ApplyPinsAndSort(items, pins)
	var foundColl *contracts.LibraryManga
	var cChildren []contracts.LibraryManga
	for _, it := range sorted {
		if it.ID == "coll-c" {
			c := it
			foundColl = &c
		} else if it.ParentPath == "Collection C" {
			cChildren = append(cChildren, it)
		}
	}
	if foundColl == nil {
		t.Fatal("coll-c not found")
	}
	if foundColl.CoverImageURL != "/covers/c2.jpg" {
		t.Fatalf("expected coll-c cover to be /covers/c2.jpg, got %s", foundColl.CoverImageURL)
	}
	if len(cChildren) != 2 || cChildren[0].ID != "coll-c-2" || cChildren[1].ID != "coll-c-1" {
		t.Fatalf("expected coll-c-2 to be sorted first in collection, got %+v", cChildren)
	}
}

func writeZipArchive(t *testing.T, archivePath string, files map[string]string) {
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

func sameResolvedPath(left string, right string) bool {
	resolvedLeft, err := filepath.EvalSymlinks(left)
	if err != nil {
		resolvedLeft = left
	}
	resolvedRight, err := filepath.EvalSymlinks(right)
	if err != nil {
		resolvedRight = right
	}
	return resolvedLeft == resolvedRight
}

func TestResolveDirectoryPath(t *testing.T) {
	root := t.TempDir()
	mangaDir := filepath.Join(root, "Standalone Manga")
	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir manga: %v", err)
	}

	collDir := filepath.Join(root, "Collection Folder")
	childDir := filepath.Join(collDir, "Child Manga")
	if err := os.MkdirAll(childDir, 0o755); err != nil {
		t.Fatalf("mkdir child: %v", err)
	}
	archiveChild := filepath.Join(collDir, "Archive.cbz")
	writeZipArchive(t, archiveChild, map[string]string{"001.jpg": "data"})

	// 1. Standalone manga directory
	mangaID := encodeMangaID("Standalone Manga")
	resolved, err := ResolveDirectoryPath(root, mangaID)
	if err != nil {
		t.Fatalf("resolve standalone manga: %v", err)
	}
	if !sameResolvedPath(resolved, mangaDir) {
		t.Fatalf("expected %q, got %q", mangaDir, resolved)
	}

	// 2. Collection directory
	collID := encodeMangaID("Collection Folder")
	resolved, err = ResolveDirectoryPath(root, collID)
	if err != nil {
		t.Fatalf("resolve collection: %v", err)
	}
	if !sameResolvedPath(resolved, collDir) {
		t.Fatalf("expected %q, got %q", collDir, resolved)
	}

	// 3. Child manga directory inside collection
	childID := encodeMangaID("Collection Folder/Child Manga")
	resolved, err = ResolveDirectoryPath(root, childID)
	if err != nil {
		t.Fatalf("resolve child manga: %v", err)
	}
	if !sameResolvedPath(resolved, childDir) {
		t.Fatalf("expected %q, got %q", childDir, resolved)
	}

	// 4. Archive file inside collection -> resolves to parent directory
	archiveID := encodeMangaID("Collection Folder/Archive.cbz")
	resolved, err = ResolveDirectoryPath(root, archiveID)
	if err != nil {
		t.Fatalf("resolve archive child: %v", err)
	}
	if !sameResolvedPath(resolved, collDir) {
		t.Fatalf("expected %q, got %q", collDir, resolved)
	}

	// 5. Invalid path traversal should error
	badID := encodeMangaID("../outside")
	if _, err := ResolveDirectoryPath(root, badID); err == nil {
		t.Fatal("expected traversal path to fail")
	}
}

func TestToggleCollectionMarker(t *testing.T) {
	root := t.TempDir()

	// 1. Regular directory manga
	mangaDir := filepath.Join(root, "Series A")
	writeFile(t, filepath.Join(mangaDir, "Vol 1", "001.jpg"), "test")

	mangaID := encodeMangaID("Series A")

	// Initially not a collection
	if hasCollectionMarker(mangaDir) {
		t.Fatal("expected not to be a collection initially")
	}

	// Toggle to collection
	isColl, err := ToggleCollectionMarker(root, mangaID)
	if err != nil {
		t.Fatalf("toggle to collection failed: %v", err)
	}
	if !isColl {
		t.Fatal("expected isColl to be true")
	}
	if !hasCollectionMarker(mangaDir) {
		t.Fatal("expected .collection marker to exist")
	}

	// Toggle back to regular
	isColl, err = ToggleCollectionMarker(root, mangaID)
	if err != nil {
		t.Fatalf("toggle back to regular failed: %v", err)
	}
	if isColl {
		t.Fatal("expected isColl to be false")
	}
	if hasCollectionMarker(mangaDir) {
		t.Fatal("expected .collection marker to be removed")
	}

	// Test with legacy marker collection.txt
	writeFile(t, filepath.Join(mangaDir, "collection.txt"), "some text")
	if !hasCollectionMarker(mangaDir) {
		t.Fatal("expected collection.txt to be recognized as marker")
	}
	isColl, err = ToggleCollectionMarker(root, mangaID)
	if err != nil {
		t.Fatalf("toggle with legacy marker failed: %v", err)
	}
	if isColl {
		t.Fatal("expected isColl to be false after toggling off legacy marker")
	}
	if hasCollectionMarker(mangaDir) {
		t.Fatal("expected legacy marker to be removed")
	}

	// Archive file cannot be toggled to collection
	archivePath := filepath.Join(root, "Archive.cbz")
	writeZipArchive(t, archivePath, map[string]string{"001.jpg": "img"})
	archiveID := encodeMangaID("Archive.cbz")
	if _, err := ToggleCollectionMarker(root, archiveID); err == nil {
		t.Fatal("expected archive file to fail toggle")
	}

	// Nested item cannot be toggled to collection
	nestedID := encodeMangaID("Series A/Nested")
	if _, err := ToggleCollectionMarker(root, nestedID); err == nil {
		t.Fatal("expected nested path to fail toggle")
	}
}
