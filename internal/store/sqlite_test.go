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

func TestPinnedItemsRoundTrip(t *testing.T) {
	sqliteStore, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	pinnedMap, err := sqliteStore.GetPinnedMap()
	if err != nil {
		t.Fatalf("get pinned map: %v", err)
	}
	if len(pinnedMap) != 0 {
		t.Fatalf("expected empty pinned map, got %d items", len(pinnedMap))
	}

	// Toggle pin on
	pinned, err := sqliteStore.TogglePin("manga-1")
	if err != nil {
		t.Fatalf("toggle pin on: %v", err)
	}
	if !pinned {
		t.Fatal("expected pinned to be true")
	}

	pinnedMap, err = sqliteStore.GetPinnedMap()
	if err != nil {
		t.Fatalf("get pinned map: %v", err)
	}
	if len(pinnedMap) != 1 || pinnedMap["manga-1"] == "" {
		t.Fatalf("expected 1 pinned item, got %+v", pinnedMap)
	}

	// Toggle pin off
	pinned, err = sqliteStore.TogglePin("manga-1")
	if err != nil {
		t.Fatalf("toggle pin off: %v", err)
	}
	if pinned {
		t.Fatal("expected pinned to be false")
	}

	pinnedMap, err = sqliteStore.GetPinnedMap()
	if err != nil {
		t.Fatalf("get pinned map: %v", err)
	}
	if len(pinnedMap) != 0 {
		t.Fatalf("expected empty pinned map after unpin, got %d items", len(pinnedMap))
	}

	// Test SetPin
	if err := sqliteStore.SetPin("manga-2", true, "2026-08-23T12:00:00Z"); err != nil {
		t.Fatalf("set pin: %v", err)
	}
	pinnedMap, err = sqliteStore.GetPinnedMap()
	if err != nil {
		t.Fatalf("get pinned map: %v", err)
	}
	if pinnedMap["manga-2"] != "2026-08-23T12:00:00Z" {
		t.Fatalf("expected custom pinnedAt timestamp, got %q", pinnedMap["manga-2"])
	}
}

func TestPerSourceLibraryMangaStore(t *testing.T) {
	sqliteStore, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	// 1. Save items for source-A
	mangasA := []contracts.LibraryManga{
		{
			ID:           "srcA-1",
			SourceID:     "source-A",
			Title:        "Manga A1",
			RelativePath: "Manga A1",
			ChapterCount: 1,
			PageCount:    10,
			LastUpdated:  "2026-04-21T00:00:00Z",
			IsAvailable:  true,
		},
	}
	if err := sqliteStore.SaveLibraryMangaForSource("source-A", mangasA, map[string]int64{"srcA-1": 100}); err != nil {
		t.Fatalf("save source-A: %v", err)
	}

	// 2. Save items for source-B
	mangasB := []contracts.LibraryManga{
		{
			ID:           "srcB-1",
			SourceID:     "source-B",
			Title:        "Manga B1",
			RelativePath: "Manga B1",
			ChapterCount: 2,
			PageCount:    20,
			LastUpdated:  "2026-04-22T00:00:00Z",
			IsAvailable:  true,
		},
	}
	if err := sqliteStore.SaveLibraryMangaForSource("source-B", mangasB, map[string]int64{"srcB-1": 200}); err != nil {
		t.Fatalf("save source-B: %v", err)
	}

	// 3. List all should return both items
	all, err := sqliteStore.ListLibraryManga()
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2 items, got %d", len(all))
	}

	// 4. Overwrite source-A should NOT touch source-B
	mangasA2 := []contracts.LibraryManga{
		{
			ID:           "srcA-2",
			SourceID:     "source-A",
			Title:        "Manga A2",
			RelativePath: "Manga A2",
			ChapterCount: 3,
			PageCount:    30,
			LastUpdated:  "2026-04-23T00:00:00Z",
			IsAvailable:  true,
		},
	}
	if err := sqliteStore.SaveLibraryMangaForSource("source-A", mangasA2, map[string]int64{"srcA-2": 300}); err != nil {
		t.Fatalf("save source-A overwrite: %v", err)
	}

	bItems, err := sqliteStore.ListLibraryMangaBySource("source-B")
	if err != nil {
		t.Fatalf("list source-B: %v", err)
	}
	if len(bItems) != 1 || bItems[0].ID != "srcB-1" {
		t.Fatalf("expected source-B item to be preserved, got %+v", bItems)
	}

	// 5. Test availability toggle for source-A (offline fallback simulation)
	if err := sqliteStore.SetSourceAvailability("source-A", false); err != nil {
		t.Fatalf("set availability: %v", err)
	}
	aItems, err := sqliteStore.ListLibraryMangaBySource("source-A")
	if err != nil {
		t.Fatalf("list source-A: %v", err)
	}
	if len(aItems) != 1 || aItems[0].IsAvailable {
		t.Fatalf("expected source-A item to be marked as unavailable (offline), got %+v", aItems)
	}

	// 6. Test delete source
	if err := sqliteStore.DeleteSourceLibraryManga("source-B"); err != nil {
		t.Fatalf("delete source-B: %v", err)
	}
	allAfterDelete, err := sqliteStore.ListLibraryManga()
	if err != nil {
		t.Fatalf("list after delete: %v", err)
	}
	if len(allAfterDelete) != 1 || allAfterDelete[0].SourceID != "source-A" {
		t.Fatalf("expected only source-A to remain after deleting source-B, got %+v", allAfterDelete)
	}
}

func TestSQLitePragmasConfiguration(t *testing.T) {
	sqliteStore, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	var journalMode string
	if err := sqliteStore.db.QueryRow("PRAGMA journal_mode;").Scan(&journalMode); err != nil {
		t.Fatalf("query journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("expected journal_mode 'wal', got %q", journalMode)
	}

	var busyTimeout int
	if err := sqliteStore.db.QueryRow("PRAGMA busy_timeout;").Scan(&busyTimeout); err != nil {
		t.Fatalf("query busy_timeout: %v", err)
	}
	if busyTimeout < 5000 {
		t.Fatalf("expected busy_timeout >= 5000, got %d", busyTimeout)
	}
}

func TestCopyMangaAccountsRoundTrip(t *testing.T) {
	sqliteStore, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	// Initial query should be empty
	initial, err := sqliteStore.GetCopyMangaAccounts()
	if err != nil {
		t.Fatalf("get copymanga accounts: %v", err)
	}
	if len(initial) != 0 {
		t.Fatalf("expected empty accounts, got %d", len(initial))
	}

	// Save accounts
	acc1 := contracts.CopyMangaAccount{
		Username:      "user1",
		Password:      "pass1",
		Token:         "token1",
		LimitedAt:     100,
		LastCheckedAt: 200,
	}
	acc2 := contracts.CopyMangaAccount{
		Username:      "user2",
		Password:      "pass2",
		Token:         "token2",
		LimitedAt:     50,
		LastCheckedAt: 250,
	}

	if err := sqliteStore.SaveCopyMangaAccount(acc1); err != nil {
		t.Fatalf("save acc1: %v", err)
	}
	if err := sqliteStore.SaveCopyMangaAccount(acc2); err != nil {
		t.Fatalf("save acc2: %v", err)
	}

	// Should be ordered by limited_at ASC (acc2 with 50 first, then acc1 with 100)
	list, err := sqliteStore.GetCopyMangaAccounts()
	if err != nil {
		t.Fatalf("get accounts: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 accounts, got %d", len(list))
	}
	if list[0].Username != "user2" || list[1].Username != "user1" {
		t.Fatalf("expected acc2 then acc1, got %+v", list)
	}

	// Update limited_at
	if err := sqliteStore.UpdateCopyMangaAccountLimited("user2", 300); err != nil {
		t.Fatalf("update limited: %v", err)
	}
	listAfterLim, err := sqliteStore.GetCopyMangaAccounts()
	if err != nil {
		t.Fatalf("get accounts after limited: %v", err)
	}
	if listAfterLim[0].Username != "user1" || listAfterLim[1].Username != "user2" {
		t.Fatalf("expected acc1 (100) then acc2 (300), got %+v", listAfterLim)
	}

	// Update token
	if err := sqliteStore.UpdateCopyMangaAccountToken("user1", "newtoken1", 400); err != nil {
		t.Fatalf("update token: %v", err)
	}
	listAfterToken, err := sqliteStore.GetCopyMangaAccounts()
	if err != nil {
		t.Fatalf("get accounts after token: %v", err)
	}
	if listAfterToken[0].Token != "newtoken1" || listAfterToken[0].LastCheckedAt != 400 {
		t.Fatalf("expected newtoken1 and 400, got %+v", listAfterToken[0])
	}

	// Delete account
	if err := sqliteStore.DeleteCopyMangaAccount("user1"); err != nil {
		t.Fatalf("delete user1: %v", err)
	}
	listAfterDelete, err := sqliteStore.GetCopyMangaAccounts()
	if err != nil {
		t.Fatalf("get accounts after delete: %v", err)
	}
	if len(listAfterDelete) != 1 || listAfterDelete[0].Username != "user2" {
		t.Fatalf("expected only user2 remaining, got %+v", listAfterDelete)
	}
}
