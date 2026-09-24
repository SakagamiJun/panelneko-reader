package settings

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

type Service struct {
	store *store.SQLiteStore
	cache contracts.AppSettings
}

func NewService(store *store.SQLiteStore) (*Service, error) {
	service := &Service{
		store: store,
		cache: DefaultSettings(),
	}

	settings, found, err := store.GetSettings()
	if err != nil {
		return nil, err
	}

	if !found {
		if err := store.SaveSettings(service.cache); err != nil {
			return nil, err
		}

		return service, nil
	}

	normalized, err := service.Normalize(settings)
	if err != nil {
		return nil, err
	}

	service.cache = normalized
	if err := store.SaveSettings(normalized); err != nil {
		return nil, err
	}

	return service, nil
}

func DefaultSettings() contracts.AppSettings {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}

	defaultRoot := filepath.Join(homeDir, "MangaLibrary")
	defaultSources := []contracts.LibrarySource{
		{
			ID:      "default",
			Name:    "Default Library",
			Type:    contracts.SourceTypeLocal,
			Path:    defaultRoot,
			Enabled: true,
			Status:  contracts.SourceStatusOnline,
		},
	}

	return contracts.AppSettings{
		LibraryRoot:               defaultRoot,
		LibrarySources:            defaultSources,
		LocaleMode:                contracts.LocaleModeSystem,
		Locale:                    "en",
		ThemeMode:                 contracts.ThemeModeSystem,
		ReaderScrollCachePages:    6,
		AutoRestoreReaderProgress: true,
		ReaderDirection:           contracts.ReaderDirectionRTL,
		ReaderSpreadMode:          contracts.ReaderSpreadModeAuto,
		ReaderCoverSolo:           true,
		ReaderFitMode:             contracts.ReaderFitModeContain,
		ReaderFilter:              contracts.ReaderFilterNone,
		ReaderSideClickMode:       contracts.ReaderSideClickModeRightNext,
		ReaderClickCenterZoom:     false,
		ReaderDoubleClickZoom:     false,
		Shortcuts: map[string]string{
			"nextPage":      "ArrowRight", // or Space/ArrowDown handled in frontend
			"prevPage":      "ArrowLeft",  // or ArrowUp handled in frontend
			"nextChapter":   "]",
			"prevChapter":   "[",
			"toggleMode":    "m",
			"backToLibrary": "Escape",
			"toggleMenu":    "h",
		},
		AutoCheckUpdates:     boolPtr(true),
		EnableThumbnailCache: boolPtr(true),
		ThumbnailQuality:     contracts.ThumbnailQualityMedium,
	}
}

func boolPtr(b bool) *bool {
	return &b
}

func (s *Service) Get() contracts.AppSettings {
	return s.cache
}

func (s *Service) Update(input contracts.AppSettings) (contracts.AppSettings, error) {
	normalized, err := s.Normalize(input)
	if err != nil {
		return contracts.AppSettings{}, err
	}

	if err := s.store.SaveSettings(normalized); err != nil {
		return contracts.AppSettings{}, err
	}

	s.cache = normalized
	return normalized, nil
}

func (s *Service) Normalize(input contracts.AppSettings) (contracts.AppSettings, error) {
	settings := DefaultSettings()

	if len(input.LibrarySources) > 0 {
		var normalizedSources []contracts.LibrarySource
		seenIDs := make(map[string]bool)
		for i, src := range input.LibrarySources {
			id := strings.TrimSpace(src.ID)
			if id == "" {
				id = fmt.Sprintf("src-%d-%d", time.Now().UnixNano(), i+1)
			}
			if seenIDs[id] {
				id = fmt.Sprintf("%s-%d", id, i+1)
			}
			seenIDs[id] = true

			name := strings.TrimSpace(src.Name)
			pathVal := strings.TrimSpace(src.Path)
			if name == "" {
				if pathVal != "" {
					name = filepath.Base(pathVal)
				}
				if name == "" || name == "." || name == "/" {
					name = fmt.Sprintf("Library %d", i+1)
				}
			}

			srcType := src.Type
			if srcType == "" {
				srcType = contracts.SourceTypeLocal
			}

			status := src.Status
			if status == "" {
				status = contracts.SourceStatusOnline
			}

			normalizedSources = append(normalizedSources, contracts.LibrarySource{
				ID:           id,
				Name:         name,
				Type:         srcType,
				Path:         pathVal,
				Enabled:      src.Enabled,
				ReadOnly:     src.ReadOnly,
				Status:       status,
				ErrorMessage: src.ErrorMessage,
				MangaCount:   src.MangaCount,
				LastScanned:  src.LastScanned,
			})
		}
		settings.LibrarySources = normalizedSources

		var activePath string
		for _, s := range normalizedSources {
			if s.Enabled && s.Path != "" {
				activePath = s.Path
				break
			}
		}
		if activePath == "" && len(normalizedSources) > 0 {
			activePath = normalizedSources[0].Path
		}
		if activePath != "" {
			settings.LibraryRoot = activePath
		} else if input.LibraryRoot != "" {
			settings.LibraryRoot = input.LibraryRoot
		}
	} else if input.LibraryRoot != "" {
		settings.LibraryRoot = input.LibraryRoot
		settings.LibrarySources = []contracts.LibrarySource{
			{
				ID:      "default",
				Name:    "Default Library",
				Type:    contracts.SourceTypeLocal,
				Path:    input.LibraryRoot,
				Enabled: true,
				Status:  contracts.SourceStatusOnline,
			},
		}
	}

	if input.ReaderScrollCachePages > 0 {
		settings.ReaderScrollCachePages = input.ReaderScrollCachePages
		settings.AutoRestoreReaderProgress = input.AutoRestoreReaderProgress
	}

	if input.ReaderDirection == contracts.ReaderDirectionLTR {
		settings.ReaderDirection = contracts.ReaderDirectionLTR
	} else {
		settings.ReaderDirection = contracts.ReaderDirectionRTL
	}

	switch input.ReaderSpreadMode {
	case contracts.ReaderSpreadModeSingle:
		settings.ReaderSpreadMode = contracts.ReaderSpreadModeSingle
	case contracts.ReaderSpreadModeDouble:
		settings.ReaderSpreadMode = contracts.ReaderSpreadModeDouble
	default:
		settings.ReaderSpreadMode = contracts.ReaderSpreadModeAuto
	}

	if input.ReaderDirection != "" || input.ReaderSpreadMode != "" {
		settings.ReaderCoverSolo = input.ReaderCoverSolo
	}

	switch input.ReaderFitMode {
	case contracts.ReaderFitModeWidth:
		settings.ReaderFitMode = contracts.ReaderFitModeWidth
	case contracts.ReaderFitModeHeight:
		settings.ReaderFitMode = contracts.ReaderFitModeHeight
	case contracts.ReaderFitModeOriginal:
		settings.ReaderFitMode = contracts.ReaderFitModeOriginal
	default:
		settings.ReaderFitMode = contracts.ReaderFitModeContain
	}

	switch input.ReaderFilter {
	case contracts.ReaderFilterInvert:
		settings.ReaderFilter = contracts.ReaderFilterInvert
	case contracts.ReaderFilterSepia:
		settings.ReaderFilter = contracts.ReaderFilterSepia
	case contracts.ReaderFilterHighContrast:
		settings.ReaderFilter = contracts.ReaderFilterHighContrast
	default:
		settings.ReaderFilter = contracts.ReaderFilterNone
	}

	switch input.ReaderSideClickMode {
	case contracts.ReaderSideClickModeFollow:
		settings.ReaderSideClickMode = contracts.ReaderSideClickModeFollow
	case contracts.ReaderSideClickModeLeftNext:
		settings.ReaderSideClickMode = contracts.ReaderSideClickModeLeftNext
	default:
		settings.ReaderSideClickMode = contracts.ReaderSideClickModeRightNext
	}

	settings.ReaderClickCenterZoom = input.ReaderClickCenterZoom
	settings.ReaderDoubleClickZoom = input.ReaderDoubleClickZoom

	if input.Shortcuts != nil {
		for k, v := range input.Shortcuts {
			settings.Shortcuts[k] = v
		}
	}

	if input.AutoCheckUpdates == nil {
		settings.AutoCheckUpdates = boolPtr(true)
	} else {
		settings.AutoCheckUpdates = boolPtr(*input.AutoCheckUpdates)
	}

	switch input.ThumbnailQuality {
	case contracts.ThumbnailQualityOff:
		settings.ThumbnailQuality = contracts.ThumbnailQualityOff
		settings.EnableThumbnailCache = boolPtr(false)
	case contracts.ThumbnailQualityLow:
		settings.ThumbnailQuality = contracts.ThumbnailQualityLow
		settings.EnableThumbnailCache = boolPtr(true)
	case contracts.ThumbnailQualityMedium:
		settings.ThumbnailQuality = contracts.ThumbnailQualityMedium
		settings.EnableThumbnailCache = boolPtr(true)
	case contracts.ThumbnailQualityHigh:
		settings.ThumbnailQuality = contracts.ThumbnailQualityHigh
		settings.EnableThumbnailCache = boolPtr(true)
	case "":
		if input.EnableThumbnailCache != nil && !*input.EnableThumbnailCache {
			settings.ThumbnailQuality = contracts.ThumbnailQualityOff
			settings.EnableThumbnailCache = boolPtr(false)
		} else {
			settings.ThumbnailQuality = contracts.ThumbnailQualityMedium
			settings.EnableThumbnailCache = boolPtr(true)
		}
	default:
		return contracts.AppSettings{}, contracts.ContractError{
			Code:    contracts.ErrCodeSettingsInvalid,
			Message: fmt.Sprintf("unsupported thumbnail quality: %s", input.ThumbnailQuality),
		}
	}

	switch input.LocaleMode {
	case "", contracts.LocaleModeSystem:
		settings.LocaleMode = contracts.LocaleModeSystem
	case contracts.LocaleModeManual:
		settings.LocaleMode = contracts.LocaleModeManual
	default:
		return contracts.AppSettings{}, contracts.ContractError{
			Code:    contracts.ErrCodeSettingsInvalid,
			Message: fmt.Sprintf("unsupported locale mode: %s", input.LocaleMode),
		}
	}

	switch input.Locale {
	case "", "en":
		settings.Locale = "en"
	case "zh-CN", "ja":
		settings.Locale = input.Locale
	default:
		return contracts.AppSettings{}, contracts.ContractError{
			Code:    contracts.ErrCodeSettingsInvalid,
			Message: fmt.Sprintf("unsupported locale: %s", input.Locale),
		}
	}

	switch input.ThemeMode {
	case "", contracts.ThemeModeSystem:
		settings.ThemeMode = contracts.ThemeModeSystem
	case contracts.ThemeModeLight, contracts.ThemeModeDark:
		settings.ThemeMode = input.ThemeMode
	default:
		return contracts.AppSettings{}, contracts.ContractError{
			Code:    contracts.ErrCodeSettingsInvalid,
			Message: fmt.Sprintf("unsupported theme mode: %s", input.ThemeMode),
		}
	}

	return settings, nil
}
