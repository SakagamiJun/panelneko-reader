package settings

import (
	"path/filepath"
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

func TestNewServicePersistsDefaults(t *testing.T) {
	sqliteStore, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	service, err := NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	current := service.Get()
	if current.LocaleMode != "system" {
		t.Fatalf("unexpected default locale mode: %s", current.LocaleMode)
	}
	if current.ReaderScrollCachePages != 6 {
		t.Fatalf("unexpected default reader cache size: %d", current.ReaderScrollCachePages)
	}
	if !current.AutoRestoreReaderProgress {
		t.Fatal("expected auto restore reader progress to be enabled by default")
	}
	if filepath.Base(current.LibraryRoot) != "MangaLibrary" {
		t.Fatalf("unexpected library root: %s", current.LibraryRoot)
	}
	if current.ReaderSideClickMode != "right_next" {
		t.Fatalf("unexpected default reader side click mode: %s", current.ReaderSideClickMode)
	}
	if current.AutoCheckUpdates == nil || !*current.AutoCheckUpdates {
		t.Fatal("expected auto check updates to be enabled by default")
	}
	if current.EnableThumbnailCache == nil || !*current.EnableThumbnailCache {
		t.Fatal("expected enable thumbnail cache to be enabled by default")
	}
}

func TestNormalizeRejectsUnsupportedLocale(t *testing.T) {
	sqliteStore, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	service, err := NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	_, err = service.Normalize(DefaultSettings())
	if err != nil {
		t.Fatalf("normalize defaults should succeed: %v", err)
	}

	input := DefaultSettings()
	input.LocaleMode = "manual"
	input.Locale = "fr"
	if _, err := service.Normalize(input); err == nil {
		t.Fatal("expected normalize to reject unsupported locale")
	}
}

func TestNormalizeAppliesReaderDefaults(t *testing.T) {
	sqliteStore, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	service, err := NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	input := DefaultSettings()
	input.ReaderScrollCachePages = 12
	input.AutoRestoreReaderProgress = false

	normalized, err := service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize settings: %v", err)
	}

	if normalized.ReaderScrollCachePages != 12 {
		t.Fatalf("expected reader cache pages to keep explicit value, got %d", normalized.ReaderScrollCachePages)
	}
	if normalized.AutoRestoreReaderProgress {
		t.Fatal("expected auto restore reader progress to follow explicit false value")
	}

	input.ReaderClickCenterZoom = true
	input.ReaderDoubleClickZoom = true
	input.ReaderSideClickMode = "follow"
	updated, err := service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize zoom settings: %v", err)
	}
	if !updated.ReaderClickCenterZoom || !updated.ReaderDoubleClickZoom {
		t.Fatal("expected zoom settings to be true")
	}
	if updated.ReaderSideClickMode != "follow" {
		t.Fatalf("expected reader side click mode to be follow, got %s", updated.ReaderSideClickMode)
	}

	input.ReaderSideClickMode = "invalid_mode"
	fallback, err := service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize invalid side click mode: %v", err)
	}
	if fallback.ReaderSideClickMode != "right_next" {
		t.Fatalf("expected invalid side click mode to fallback to right_next, got %s", fallback.ReaderSideClickMode)
	}
}

func TestNormalizeAutoCheckUpdates(t *testing.T) {
	sqliteStore, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	service, err := NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	input := DefaultSettings()
	f := false
	input.AutoCheckUpdates = &f
	normalized, err := service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if normalized.AutoCheckUpdates == nil || *normalized.AutoCheckUpdates {
		t.Fatal("expected AutoCheckUpdates to be false")
	}

	input.AutoCheckUpdates = nil
	normalized, err = service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if normalized.AutoCheckUpdates == nil || !*normalized.AutoCheckUpdates {
		t.Fatal("expected AutoCheckUpdates to default to true when nil")
	}
}

func TestNormalizeEnableThumbnailCache(t *testing.T) {
	sqliteStore, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	service, err := NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	input := DefaultSettings()
	f := false
	input.EnableThumbnailCache = &f
	normalized, err := service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if normalized.EnableThumbnailCache == nil || *normalized.EnableThumbnailCache {
		t.Fatal("expected EnableThumbnailCache to be false")
	}

	input.EnableThumbnailCache = nil
	normalized, err = service.Normalize(input)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if normalized.EnableThumbnailCache == nil || !*normalized.EnableThumbnailCache {
		t.Fatal("expected EnableThumbnailCache to default to true when nil")
	}
}

func TestNormalizeLibrarySources(t *testing.T) {
	sqliteStore, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open sqlite store: %v", err)
	}
	defer sqliteStore.Close()

	service, err := NewService(sqliteStore)
	if err != nil {
		t.Fatalf("new settings service: %v", err)
	}

	// 1. Default settings has 1 source
	defaults := DefaultSettings()
	if len(defaults.LibrarySources) != 1 {
		t.Fatalf("expected 1 default library source, got %d", len(defaults.LibrarySources))
	}
	if defaults.LibrarySources[0].ID != "default" {
		t.Fatalf("expected default source ID to be 'default', got %s", defaults.LibrarySources[0].ID)
	}

	// 2. Legacy input with only LibraryRoot migrations to LibrarySources
	inputLegacy := contracts.AppSettings{
		LibraryRoot: "/legacy/manga/path",
	}
	normLegacy, err := service.Normalize(inputLegacy)
	if err != nil {
		t.Fatalf("normalize legacy settings: %v", err)
	}
	if len(normLegacy.LibrarySources) != 1 {
		t.Fatalf("expected 1 migrated library source, got %d", len(normLegacy.LibrarySources))
	}
	if normLegacy.LibrarySources[0].Path != "/legacy/manga/path" {
		t.Fatalf("expected migrated path, got %s", normLegacy.LibrarySources[0].Path)
	}

	// 3. Multi-source input normalizes properly
	inputMulti := contracts.AppSettings{
		LibrarySources: []contracts.LibrarySource{
			{
				ID:      "s1",
				Name:    "Local SSD",
				Type:    contracts.SourceTypeLocal,
				Path:    "/Volumes/SSD/Manga",
				Enabled: false,
			},
			{
				ID:      "s1", // duplicate ID test
				Name:    "",   // empty name test
				Type:    contracts.SourceTypeSMB,
				Path:    "/Volumes/NAS/Comics",
				Enabled: true,
			},
		},
	}
	normMulti, err := service.Normalize(inputMulti)
	if err != nil {
		t.Fatalf("normalize multi-source settings: %v", err)
	}
	if len(normMulti.LibrarySources) != 2 {
		t.Fatalf("expected 2 sources, got %d", len(normMulti.LibrarySources))
	}
	if normMulti.LibrarySources[0].ID == normMulti.LibrarySources[1].ID {
		t.Fatalf("expected duplicate IDs to be disambiguated, got %s and %s", normMulti.LibrarySources[0].ID, normMulti.LibrarySources[1].ID)
	}
	if normMulti.LibrarySources[1].Name != "Comics" {
		t.Fatalf("expected empty name to default to base path 'Comics', got %s", normMulti.LibrarySources[1].Name)
	}
	if normMulti.LibraryRoot != "/Volumes/NAS/Comics" {
		t.Fatalf("expected LibraryRoot to sync with first enabled source, got %s", normMulti.LibraryRoot)
	}
}
