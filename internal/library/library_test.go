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

func TestApplyPinsAndSortMultiSourceIsolation(t *testing.T) {
	// Source 1 has collection "Action" with child "Action 1"
	// Source 2 has collection "Action" with child "Action 2"
	items := []contracts.LibraryManga{
		{
			ID:            "src1:coll-action",
			SourceID:      "source-1",
			Title:         "Action",
			RelativePath:  "Action",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/src1-action1.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
		},
		{
			ID:            "src1:child-action-1",
			SourceID:      "source-1",
			Title:         "Action Manga 1",
			RelativePath:  "Action/Action Manga 1",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/src1-pinned.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
		},
		{
			ID:            "src2:coll-action",
			SourceID:      "source-2",
			Title:         "Action",
			RelativePath:  "Action",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/src2-action2.jpg",
			LastUpdated:   "2026-08-02T00:00:00Z",
		},
		{
			ID:            "src2:child-action-2",
			SourceID:      "source-2",
			Title:         "Action Manga 2",
			RelativePath:  "Action/Action Manga 2",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/src2-action2.jpg",
			LastUpdated:   "2026-08-02T00:00:00Z",
		},
	}

	// Pin child in source 1
	pins := map[string]string{
		"src1:child-action-1": "2026-08-23T11:00:00Z",
	}

	sorted := ApplyPinsAndSort(items, pins)

	// Verify both collections exist
	var coll1, coll2 *contracts.LibraryManga
	for _, it := range sorted {
		if it.ID == "src1:coll-action" {
			c := it
			coll1 = &c
		} else if it.ID == "src2:coll-action" {
			c := it
			coll2 = &c
		}
	}

	if coll1 == nil || coll2 == nil {
		t.Fatalf("expected both collections to be present, got coll1=%v, coll2=%v", coll1, coll2)
	}

	// Source 1's collection should have its pinned child cover
	if coll1.CoverImageURL != "/covers/src1-pinned.jpg" {
		t.Fatalf("coll1 cover unexpected: %s", coll1.CoverImageURL)
	}

	// Source 2's collection should retain its own src2-action2 cover, NOT src1
	if coll2.CoverImageURL != "/covers/src2-action2.jpg" {
		t.Fatalf("coll2 cover should not be overwritten by coll1 pinned child, got %s", coll2.CoverImageURL)
	}

	// In sortedResult, all root items are placed first (coll2 is newer than coll1),
	// followed by children grouped by collection (coll2's child first, coll1's child second).
	expectedIDs := []string{
		"src2:coll-action",
		"src1:coll-action",
		"src2:child-action-2",
		"src1:child-action-1",
	}
	if len(sorted) != len(expectedIDs) {
		t.Fatalf("expected %d items, got %d", len(expectedIDs), len(sorted))
	}
	for i, id := range expectedIDs {
		if sorted[i].ID != id {
			t.Fatalf("expected sorted[%d].ID == %s, got %s", i, id, sorted[i].ID)
		}
	}
}

func TestApplyPinsAndSortDuplicateMergeMode(t *testing.T) {
	sources := []contracts.LibrarySource{
		{ID: "src-local", Type: contracts.SourceTypeLocal, Enabled: true},
		{ID: "src-remote", Type: contracts.SourceTypeNetwork, Enabled: true},
	}

	items := []contracts.LibraryManga{
		{
			ID:            "src-local:Action",
			SourceID:      "src-local",
			Title:         "Action",
			RelativePath:  "Action",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/local-action.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
		},
		{
			ID:            "src-local:Action/Local1",
			SourceID:      "src-local",
			Title:         "Local Manga 1",
			RelativePath:  "Action/Local1",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/local-1.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
		},
		{
			ID:            "src-remote:Action",
			SourceID:      "src-remote",
			Title:         "Action",
			RelativePath:  "Action",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/remote-action.jpg",
			LastUpdated:   "2026-08-02T00:00:00Z",
		},
		{
			ID:            "src-remote:Action/Remote2",
			SourceID:      "src-remote",
			Title:         "Remote Manga 2",
			RelativePath:  "Action/Remote2",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/remote-2-pinned.jpg",
			LastUpdated:   "2026-08-02T00:00:00Z",
		},
	}

	// Pin the remote child manga
	pins := map[string]string{
		"src-remote:Action/Remote2": "2026-08-23T11:00:00Z",
	}

	// 1. Merge library items across sources
	merged := MergeLibraryManga(items, sources, pins)

	// 2. Apply pins and sort in Merge mode
	sorted := ApplyPinsAndSort(merged, pins, contracts.DuplicateMergeModeMerge)

	// Expect merged collection to be first, followed by children of Action (pinned remote first, then local)
	if len(sorted) != 3 {
		t.Fatalf("expected 3 items (1 merged collection + 2 children), got %d", len(sorted))
	}

	coll := sorted[0]
	if coll.ID != "src-local:Action" || !coll.IsCollection {
		t.Fatalf("expected merged collection as first item, got ID=%s, isColl=%v", coll.ID, coll.IsCollection)
	}

	// Pinned remote child cover should propagate to merged collection cover
	if coll.CoverImageURL != "/covers/remote-2-pinned.jpg" {
		t.Fatalf("expected collection cover to be updated to pinned remote child cover, got %s", coll.CoverImageURL)
	}

	// Children order: Remote Manga 2 (pinned) then Local Manga 1
	if sorted[1].ID != "src-remote:Action/Remote2" {
		t.Fatalf("expected pinned remote child as sorted[1], got %s", sorted[1].ID)
	}
	if sorted[2].ID != "src-local:Action/Local1" {
		t.Fatalf("expected local child as sorted[2], got %s", sorted[2].ID)
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

func TestMangaIDEncodingWithSource(t *testing.T) {
	// 1. Default source backward compatibility
	legacyEncoded := encodeMangaID("Sample Manga")
	srcID, relPath, err := DecodeMangaIDWithSource(legacyEncoded)
	if err != nil {
		t.Fatalf("decode legacy id: %v", err)
	}
	if srcID != "default" || relPath != "Sample Manga" {
		t.Fatalf("unexpected legacy decode: srcID=%s, relPath=%s", srcID, relPath)
	}

	// 2. Custom source encoding & decoding
	customEncoded := EncodeMangaIDWithSource("nas_01", "Action/Manga 1")
	srcID2, relPath2, err := DecodeMangaIDWithSource(customEncoded)
	if err != nil {
		t.Fatalf("decode custom id: %v", err)
	}
	if srcID2 != "nas_01" || relPath2 != filepath.FromSlash("Action/Manga 1") {
		t.Fatalf("unexpected custom decode: srcID=%s, relPath=%s", srcID2, relPath2)
	}
}

func TestMultiSourceLibraryScanningAndResolution(t *testing.T) {
	rootA := t.TempDir()
	rootB := t.TempDir()
	missingRoot := filepath.Join(t.TempDir(), "non_existent_dir")

	// Setup source A with 1 manga
	mangaA := filepath.Join(rootA, "Manga A")
	if err := os.MkdirAll(mangaA, 0o755); err != nil {
		t.Fatalf("mkdir mangaA: %v", err)
	}
	writeFile(t, filepath.Join(mangaA, "001.jpg"), "test-page-a")

	// Setup source B with 1 archive manga
	archiveB := filepath.Join(rootB, "Manga B.cbz")
	writeZipArchive(t, archiveB, map[string]string{
		"001.jpg": "test-page-b",
	})

	sources := []contracts.LibrarySource{
		{
			ID:      "src-a",
			Name:    "Source A",
			Type:    contracts.SourceTypeLocal,
			Path:    rootA,
			Enabled: true,
		},
		{
			ID:      "src-b",
			Name:    "Source B (Archive)",
			Type:    contracts.SourceTypeLocal,
			Path:    rootB,
			Enabled: true,
		},
		{
			ID:      "src-missing",
			Name:    "Offline Source",
			Type:    contracts.SourceTypeNetwork,
			Path:    missingRoot,
			Enabled: true,
		},
		{
			ID:      "src-disabled",
			Name:    "Disabled Source",
			Type:    contracts.SourceTypeLocal,
			Path:    rootA,
			Enabled: false,
		},
	}

	results := ScanAllSources(sources, nil, nil)
	if len(results) != 4 {
		t.Fatalf("expected 4 results, got %d", len(results))
	}

	// Source A should be online with 1 item
	if results[0].Source.Status != contracts.SourceStatusOnline || len(results[0].Items) != 1 {
		t.Fatalf("unexpected source A result: status=%s, items=%d", results[0].Source.Status, len(results[0].Items))
	}
	if results[0].Items[0].SourceID != "src-a" || !results[0].Items[0].IsAvailable {
		t.Fatalf("unexpected item metadata: %+v", results[0].Items[0])
	}

	// Source B should be online with 1 item
	if results[1].Source.Status != contracts.SourceStatusOnline || len(results[1].Items) != 1 {
		t.Fatalf("unexpected source B result: status=%s, items=%d", results[1].Source.Status, len(results[1].Items))
	}
	if results[1].Items[0].SourceID != "src-b" || !results[1].Items[0].IsAvailable {
		t.Fatalf("unexpected item B metadata: %+v", results[1].Items[0])
	}

	// Missing Source should be offline with error
	if results[2].Source.Status != contracts.SourceStatusOffline || results[2].Err == nil {
		t.Fatalf("expected source 2 to be offline with error: status=%s, err=%v", results[2].Source.Status, results[2].Err)
	}

	// Disabled Source should be disabled
	if results[3].Source.Status != contracts.SourceStatusDisabled {
		t.Fatalf("expected source 3 to be disabled: status=%s", results[3].Source.Status)
	}

	// Test GetReaderManifestWithSources across multiple sources
	manifestA, err := GetReaderManifestWithSources(sources, results[0].Items[0].ID)
	if err != nil {
		t.Fatalf("get manifest A: %v", err)
	}
	if manifestA.Title != "Manga A" || manifestA.TotalPages != 1 {
		t.Fatalf("unexpected manifest A: %+v", manifestA)
	}
	if !strings.Contains(manifestA.Chapters[0].Pages[0].SourceURL, "_src/src-a/") {
		t.Fatalf("expected SourceURL to contain _src/src-a/, got %q", manifestA.Chapters[0].Pages[0].SourceURL)
	}

	manifestB, err := GetReaderManifestWithSources(sources, results[1].Items[0].ID)
	if err != nil {
		t.Fatalf("get manifest B: %v", err)
	}
	if manifestB.Title != "Manga B" || manifestB.TotalPages != 1 {
		t.Fatalf("unexpected manifest B: %+v", manifestB)
	}
	if !strings.Contains(manifestB.Chapters[0].Pages[0].SourceURL, "_src/src-b/") {
		t.Fatalf("expected SourceURL to contain _src/src-b/, got %q", manifestB.Chapters[0].Pages[0].SourceURL)
	}

	// Test Asset resolution across sources
	sourcesMap := map[string]string{
		"src-a": rootA,
		"src-b": rootB,
	}

	assetPathA, err := ResolveMultiSourceAssetPath(sourcesMap, rootA, manifestA.Chapters[0].Pages[0].SourceURL)
	if err != nil {
		t.Fatalf("resolve asset path A: %v", err)
	}
	expectedPathA, err := filepath.EvalSymlinks(filepath.Join(mangaA, "001.jpg"))
	if err != nil {
		t.Fatalf("eval symlinks A: %v", err)
	}
	if assetPathA != expectedPathA {
		t.Fatalf("unexpected asset path A: got %s, want %s", assetPathA, expectedPathA)
	}

	readerB, contentTypeB, sizeB, err := OpenMultiSourceArchiveAsset(sourcesMap, rootA, manifestB.Chapters[0].Pages[0].SourceURL)
	if err != nil {
		t.Fatalf("open archive asset B: %v", err)
	}
	defer readerB.Close()
	if contentTypeB != "image/jpeg" || sizeB <= 0 {
		t.Fatalf("unexpected archive asset B attributes: type=%s, size=%d", contentTypeB, sizeB)
	}
}

func TestMergeLibraryManga(t *testing.T) {
	sources := []contracts.LibrarySource{
		{
			ID:      "src-local",
			Name:    "Local Disk",
			Type:    contracts.SourceTypeLocal,
			Path:    "/Volumes/Local/Manga",
			Enabled: true,
		},
		{
			ID:      "src-remote",
			Name:    "NAS Storage",
			Type:    contracts.SourceTypeNetwork,
			Path:    "/Volumes/NAS/Manga",
			Enabled: true,
		},
	}

	items := []contracts.LibraryManga{
		// Collection in local
		{
			ID:            "local:Action",
			SourceID:      "src-local",
			Title:         "Action",
			RelativePath:  "Action",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/local-action.jpg",
			LastUpdated:   "2026-08-01T00:00:00Z",
			IsAvailable:   true,
		},
		// Child in local collection
		{
			ID:            "local:Action/Naruto",
			SourceID:      "src-local",
			Title:         "Naruto",
			RelativePath:  "Action/Naruto",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/local-naruto.jpg",
			ChapterCount:  10,
			PageCount:     100,
			LastUpdated:   "2026-08-01T00:00:00Z",
			IsAvailable:   true,
		},
		// Another child in local collection
		{
			ID:            "local:Action/One Piece",
			SourceID:      "src-local",
			Title:         "One Piece",
			RelativePath:  "Action/One Piece",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/op.jpg",
			ChapterCount:  20,
			PageCount:     200,
			LastUpdated:   "2026-08-01T00:00:00Z",
			IsAvailable:   true,
		},
		// Collection in remote (same RelativePath)
		{
			ID:            "remote:Action",
			SourceID:      "src-remote",
			Title:         "Action",
			RelativePath:  "Action",
			ParentPath:    "",
			IsCollection:  true,
			CoverImageURL: "/covers/remote-action.jpg",
			LastUpdated:   "2026-08-05T00:00:00Z",
			IsAvailable:   true,
		},
		// Duplicate child in remote collection
		{
			ID:            "remote:Action/Naruto",
			SourceID:      "src-remote",
			Title:         "Naruto",
			RelativePath:  "Action/Naruto",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/remote-naruto.jpg",
			ChapterCount:  15,
			PageCount:     150,
			LastUpdated:   "2026-08-05T00:00:00Z",
			IsAvailable:   true,
		},
		// Child unique to remote collection
		{
			ID:            "remote:Action/Bleach",
			SourceID:      "src-remote",
			Title:         "Bleach",
			RelativePath:  "Action/Bleach",
			ParentPath:    "Action",
			IsCollection:  false,
			CoverImageURL: "/covers/bleach.jpg",
			ChapterCount:  30,
			PageCount:     300,
			LastUpdated:   "2026-08-05T00:00:00Z",
			IsAvailable:   true,
		},
		// Root manga in local
		{
			ID:            "local:Dragon Ball",
			SourceID:      "src-local",
			Title:         "Dragon Ball",
			RelativePath:  "Dragon Ball",
			ParentPath:    "",
			IsCollection:  false,
			CoverImageURL: "/covers/local-db.jpg",
			ChapterCount:  42,
			PageCount:     420,
			LastUpdated:   "2026-08-01T00:00:00Z",
			IsAvailable:   true,
		},
		// Root manga in remote
		{
			ID:            "remote:Dragon Ball",
			SourceID:      "src-remote",
			Title:         "Dragon Ball",
			RelativePath:  "Dragon Ball",
			ParentPath:    "",
			IsCollection:  false,
			CoverImageURL: "/covers/remote-db.jpg",
			ChapterCount:  10,
			PageCount:     100,
			LastUpdated:   "2026-08-05T00:00:00Z",
			IsAvailable:   true,
		},
	}

	pins := map[string]string{
		"remote:Action/Naruto": "2026-08-20T10:00:00Z",
	}

	merged := MergeLibraryManga(items, sources, pins)

	var collAction *contracts.LibraryManga
	var rootDB *contracts.LibraryManga
	var childNaruto *contracts.LibraryManga
	var childOP *contracts.LibraryManga
	var childBleach *contracts.LibraryManga

	for _, it := range merged {
		switch it.ID {
		case "local:Action":
			c := it
			collAction = &c
		case "local:Dragon Ball":
			m := it
			rootDB = &m
		case "local:Action/Naruto":
			n := it
			childNaruto = &n
		case "local:Action/One Piece":
			o := it
			childOP = &o
		case "remote:Action/Bleach":
			b := it
			childBleach = &b
		}
	}

	// 1. Verify Merged Collection
	if collAction == nil {
		t.Fatal("merged collection Action not found")
	}
	if collAction.CoverImageURL != "/covers/local-action.jpg" {
		t.Fatalf("expected local collection cover, got %s", collAction.CoverImageURL)
	}
	if collAction.MangaCount != 3 {
		t.Fatalf("expected 3 distinct children in Action, got %d", collAction.MangaCount)
	}
	if collAction.ChapterCount != 75 { // (10+15) + 20 + 30 = 75
		t.Fatalf("expected 75 total chapters in Action, got %d", collAction.ChapterCount)
	}
	if collAction.PageCount != 750 { // (100+150) + 200 + 300 = 750
		t.Fatalf("expected 750 total pages in Action, got %d", collAction.PageCount)
	}

	// 2. Verify Merged Child Naruto
	if childNaruto == nil {
		t.Fatal("merged child Naruto not found")
	}
	if childNaruto.CoverImageURL != "/covers/local-naruto.jpg" {
		t.Fatalf("expected local Naruto cover, got %s", childNaruto.CoverImageURL)
	}
	if childNaruto.ChapterCount != 25 {
		t.Fatalf("expected 25 chapters for Naruto, got %d", childNaruto.ChapterCount)
	}
	if childNaruto.PageCount != 250 {
		t.Fatalf("expected 250 pages for Naruto, got %d", childNaruto.PageCount)
	}
	// Check pin propagation to base item
	if pins["local:Action/Naruto"] != "2026-08-20T10:00:00Z" {
		t.Fatalf("expected pin to propagate to local:Action/Naruto, got %s", pins["local:Action/Naruto"])
	}

	// 3. Verify Other Children
	if childOP == nil || childBleach == nil {
		t.Fatalf("expected both One Piece and Bleach to exist, got op=%v, bleach=%v", childOP, childBleach)
	}

	// 4. Verify Merged Root Manga Dragon Ball
	if rootDB == nil {
		t.Fatal("merged Dragon Ball not found")
	}
	if rootDB.CoverImageURL != "/covers/local-db.jpg" {
		t.Fatalf("expected local Dragon Ball cover, got %s", rootDB.CoverImageURL)
	}
	if rootDB.ChapterCount != 52 {
		t.Fatalf("expected 52 chapters for Dragon Ball, got %d", rootDB.ChapterCount)
	}
	if rootDB.PageCount != 520 {
		t.Fatalf("expected 520 pages for Dragon Ball, got %d", rootDB.PageCount)
	}
}

func TestGetReaderManifestMergeChapters(t *testing.T) {
	rootA := t.TempDir()
	rootB := t.TempDir()

	// Source A (Local): Chapters 1 and 2
	mangaDirA := filepath.Join(rootA, "Naruto")
	ch1DirA := filepath.Join(mangaDirA, "Vol 01")
	ch2DirA := filepath.Join(mangaDirA, "Vol 02")
	_ = os.MkdirAll(ch1DirA, 0o755)
	_ = os.MkdirAll(ch2DirA, 0o755)
	_ = os.WriteFile(filepath.Join(ch1DirA, "001.jpg"), []byte("page1"), 0o644)
	_ = os.WriteFile(filepath.Join(ch2DirA, "001.jpg"), []byte("page2"), 0o644)

	// Source B (Network): Chapter 2 (duplicate) and Chapter 3
	mangaDirB := filepath.Join(rootB, "Naruto")
	ch2DirB := filepath.Join(mangaDirB, "Vol 02")
	ch3DirB := filepath.Join(mangaDirB, "Vol 03")
	_ = os.MkdirAll(ch2DirB, 0o755)
	_ = os.MkdirAll(ch3DirB, 0o755)
	_ = os.WriteFile(filepath.Join(ch2DirB, "001.jpg"), []byte("page2-dup"), 0o644)
	_ = os.WriteFile(filepath.Join(ch3DirB, "001.jpg"), []byte("page3"), 0o644)

	sources := []contracts.LibrarySource{
		{
			ID:      "src-a",
			Name:    "Local",
			Type:    contracts.SourceTypeLocal,
			Path:    rootA,
			Enabled: true,
		},
		{
			ID:      "src-b",
			Name:    "SMB",
			Type:    contracts.SourceTypeSMB,
			Path:    rootB,
			Enabled: true,
		},
	}

	mangaIDA := EncodeMangaIDWithSource("src-a", "Naruto")
	mangaIDB := EncodeMangaIDWithSource("src-b", "Naruto")

	// 1. Separate mode on src-a: only chapters 1 and 2
	manifestSepA, err := GetReaderManifestWithSources(sources, mangaIDA, contracts.DuplicateMergeModeSeparate)
	if err != nil {
		t.Fatalf("get manifest sep A: %v", err)
	}
	if len(manifestSepA.Chapters) != 2 {
		t.Fatalf("expected 2 chapters in separate mode for A, got %d", len(manifestSepA.Chapters))
	}

	// 2. Separate mode on src-b: only chapters 2 and 3
	manifestSepB, err := GetReaderManifestWithSources(sources, mangaIDB, contracts.DuplicateMergeModeSeparate)
	if err != nil {
		t.Fatalf("get manifest sep B: %v", err)
	}
	if len(manifestSepB.Chapters) != 2 {
		t.Fatalf("expected 2 chapters in separate mode for B, got %d", len(manifestSepB.Chapters))
	}

	// 3. Merge mode: should merge chapters 1, 2, 3 (with Vol 02 deduplicated, keeping src-a's)
	manifestMerged, err := GetReaderManifestWithSources(sources, mangaIDA, contracts.DuplicateMergeModeMerge)
	if err != nil {
		t.Fatalf("get manifest merged: %v", err)
	}
	if len(manifestMerged.Chapters) != 3 {
		t.Fatalf("expected 3 merged chapters, got %d", len(manifestMerged.Chapters))
	}
	if manifestMerged.Chapters[0].Title != "Vol 01" || manifestMerged.Chapters[1].Title != "Vol 02" || manifestMerged.Chapters[2].Title != "Vol 03" {
		t.Fatalf("unexpected chapter titles order: %s, %s, %s",
			manifestMerged.Chapters[0].Title, manifestMerged.Chapters[1].Title, manifestMerged.Chapters[2].Title)
	}
	if manifestMerged.TotalPages != 3 {
		t.Fatalf("expected 3 total pages, got %d", manifestMerged.TotalPages)
	}
	// Check chapter numbering and startPage
	for i, ch := range manifestMerged.Chapters {
		if ch.Number != float64(i+1) {
			t.Fatalf("expected chapter %d number to be %d, got %v", i, i+1, ch.Number)
		}
		if ch.StartPage != i {
			t.Fatalf("expected chapter %d startPage to be %d, got %d", i, i, ch.StartPage)
		}
	}
	// Verify that Vol 03 has page pointing to src-b
	if !strings.Contains(manifestMerged.Chapters[2].Pages[0].SourceURL, "src-b") {
		t.Fatalf("expected chapter 3 page to point to src-b, got %s", manifestMerged.Chapters[2].Pages[0].SourceURL)
	}
}

func TestResolveMultiSourceAssetPathFallback(t *testing.T) {
	rootA := t.TempDir()
	rootB := t.TempDir()

	mangaDirB := filepath.Join(rootB, "MangaB")
	if err := os.MkdirAll(mangaDirB, 0o755); err != nil {
		t.Fatalf("mkdir MangaB: %v", err)
	}
	writeFile(t, filepath.Join(mangaDirB, "cover.jpg"), "cover-bytes")
	writeZipArchive(t, filepath.Join(mangaDirB, "ch1.cbz"), map[string]string{
		"001.jpg": "page-bytes",
	})

	sourcesMap := map[string]string{
		"src-a": rootA,
		"src-b": rootB,
	}

	// 1. Filesystem asset fallback: URL points to src-a or default, but file exists in src-b
	reqURLWithoutSource := "/library-files/MangaB/cover.jpg"
	resolvedPath, err := ResolveMultiSourceAssetPath(sourcesMap, rootA, reqURLWithoutSource)
	if err != nil {
		t.Fatalf("expected fallback resolution to succeed, got: %v", err)
	}
	expectedPath, _ := filepath.EvalSymlinks(filepath.Join(mangaDirB, "cover.jpg"))
	if resolvedPath != expectedPath {
		t.Fatalf("expected resolved path %q, got %q", expectedPath, resolvedPath)
	}

	// URL with mismatched source prefix also falls back if not in primary
	reqURLWithSrcA := "/library-files/_src/src-a/MangaB/cover.jpg"
	resolvedPath2, err := ResolveMultiSourceAssetPath(sourcesMap, rootA, reqURLWithSrcA)
	if err != nil {
		t.Fatalf("expected fallback resolution for mismatched src-a to succeed, got: %v", err)
	}
	if resolvedPath2 != expectedPath {
		t.Fatalf("expected resolved path %q, got %q", expectedPath, resolvedPath2)
	}

	// 2. Archive asset fallback
	reqArchiveURL := LibraryArchiveAssetPrefix + LibrarySourceAssetPrefix + "src-a/" + encodePathToken("MangaB/ch1.cbz") + "/" + encodePathToken("001.jpg")
	rc, contentType, size, err := OpenMultiSourceArchiveAsset(sourcesMap, rootA, reqArchiveURL)
	if err != nil {
		t.Fatalf("expected archive fallback to succeed, got: %v", err)
	}
	rc.Close()
	if contentType != "image/jpeg" || size <= 0 {
		t.Fatalf("unexpected archive asset attributes: type=%s, size=%d", contentType, size)
	}

	// 3. GetReaderManifestWithSources fallback when mangaID has no source prefix or default, but manga is in src-b
	sourcesList := []contracts.LibrarySource{
		{ID: "src-a", Name: "Source A", Path: rootA, Enabled: true},
		{ID: "src-b", Name: "Source B", Path: rootB, Enabled: true},
	}
	manifestFallback, err := GetReaderManifestWithSources(sourcesList, encodeMangaID("MangaB"), contracts.DuplicateMergeModeSeparate)
	if err != nil {
		t.Fatalf("expected manifest fallback to find MangaB in src-b, got: %v", err)
	}
	if len(manifestFallback.Chapters) != 1 {
		t.Fatalf("expected 1 chapter from MangaB, got %d", len(manifestFallback.Chapters))
	}
}

func TestCollectionKeyNormalization(t *testing.T) {
	keyEmpty := collectionKey("", "CollectionA")
	keyDefault := collectionKey("default", "CollectionA")
	keyCustom := collectionKey("src-1", "CollectionA")

	if keyEmpty != "default::CollectionA" {
		t.Fatalf("expected default::CollectionA, got %s", keyEmpty)
	}
	if keyDefault != "default::CollectionA" {
		t.Fatalf("expected default::CollectionA, got %s", keyDefault)
	}
	if keyEmpty != keyDefault {
		t.Fatalf("expected keyEmpty == keyDefault, got %s != %s", keyEmpty, keyDefault)
	}
	if keyCustom != "src-1::CollectionA" {
		t.Fatalf("expected src-1::CollectionA, got %s", keyCustom)
	}
}

func TestRemoteSourceDisconnectedFallback(t *testing.T) {
	rootLocal := t.TempDir()
	rootRemote := filepath.Join(t.TempDir(), "non-existent-or-disconnected")

	// Local source has Action/Manga1
	mangaLocalDir := filepath.Join(rootLocal, "Action", "Manga1")
	if err := os.MkdirAll(mangaLocalDir, 0o755); err != nil {
		t.Fatalf("mkdir mangaLocal: %v", err)
	}
	writeFile(t, filepath.Join(mangaLocalDir, "001.jpg"), "page1")

	sources := []contracts.LibrarySource{
		{
			ID:      "src-local",
			Name:    "Local",
			Path:    rootLocal,
			Enabled: true,
		},
		{
			ID:      "src-remote",
			Name:    "Remote",
			Path:    rootRemote,
			Enabled: true,
		},
	}

	// 1. GetReaderManifestWithSources fallback when mangaID explicitly points to disconnected src-remote
	remoteMangaID := EncodeMangaIDWithSource("src-remote", "Action/Manga1")
	manifest, err := GetReaderManifestWithSources(sources, remoteMangaID, contracts.DuplicateMergeModeSeparate)
	if err != nil {
		t.Fatalf("expected fallback to local source for disconnected remote manga, got: %v", err)
	}
	if len(manifest.Chapters) != 1 {
		t.Fatalf("expected 1 chapter loaded from local fallback, got %d", len(manifest.Chapters))
	}

	// 2. ResolveDirectoryPathWithSources fallback when src-remote is disconnected
	dirPath, err := ResolveDirectoryPathWithSources(sources, remoteMangaID)
	if err != nil {
		t.Fatalf("expected directory fallback to local source, got: %v", err)
	}
	expectedDir, _ := filepath.EvalSymlinks(mangaLocalDir)
	if dirPath != expectedDir {
		t.Fatalf("expected dir %q, got %q", expectedDir, dirPath)
	}
}
