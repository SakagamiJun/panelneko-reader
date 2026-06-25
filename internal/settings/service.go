package settings

import (
	"fmt"
	"os"
	"path/filepath"

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

	return contracts.AppSettings{
		LibraryRoot:               filepath.Join(homeDir, "MangaLibrary"),
		LocaleMode:                contracts.LocaleModeSystem,
		Locale:                    "en",
		ThemeMode:                 contracts.ThemeModeSystem,
		ReaderScrollCachePages:    6,
		AutoRestoreReaderProgress: true,
		Shortcuts: map[string]string{
			"nextPage":      "ArrowRight", // or Space/ArrowDown handled in frontend
			"prevPage":      "ArrowLeft",  // or ArrowUp handled in frontend
			"nextChapter":   "]",
			"prevChapter":   "[",
			"toggleMode":    "m",
			"backToLibrary": "Escape",
			"toggleMenu":    "h",
		},
	}
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

	if input.LibraryRoot != "" {
		settings.LibraryRoot = input.LibraryRoot
	}

	if input.ReaderScrollCachePages > 0 {
		settings.ReaderScrollCachePages = input.ReaderScrollCachePages
		settings.AutoRestoreReaderProgress = input.AutoRestoreReaderProgress
	}

	if input.Shortcuts != nil {
		for k, v := range input.Shortcuts {
			settings.Shortcuts[k] = v
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
