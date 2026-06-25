package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
	"github.com/sakagamijun/panelneko-reader/internal/contracts"
)

type SQLiteStore struct {
	db      *sql.DB
	dataDir string
}

func Open(dataDir string) (*SQLiteStore, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "app.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)

	store := &SQLiteStore{
		db:      db,
		dataDir: dataDir,
	}

	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *SQLiteStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}

	return s.db.Close()
}

func (s *SQLiteStore) DataDir() string {
	return s.dataDir
}

func (s *SQLiteStore) init() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS reader_progress (
			manga_id TEXT PRIMARY KEY,
			chapter_id TEXT NOT NULL,
			page INTEGER NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS library_manga (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			source_url TEXT NOT NULL,
			relative_path TEXT NOT NULL,
			cover_image_url TEXT NOT NULL,
			chapter_count INTEGER NOT NULL,
			page_count INTEGER NOT NULL,
			last_updated TEXT NOT NULL,
			mod_time INTEGER NOT NULL
		);`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}

	return nil
}

func (s *SQLiteStore) GetSettings() (contracts.AppSettings, bool, error) {
	const query = `SELECT value FROM settings WHERE key = 'app'`

	var raw string
	if err := s.db.QueryRow(query).Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.AppSettings{}, false, nil
		}

		return contracts.AppSettings{}, false, fmt.Errorf("select settings: %w", err)
	}

	var settings contracts.AppSettings
	if err := json.Unmarshal([]byte(raw), &settings); err != nil {
		return contracts.AppSettings{}, false, fmt.Errorf("decode settings: %w", err)
	}

	return settings, true, nil
}

func (s *SQLiteStore) SaveSettings(settings contracts.AppSettings) error {
	raw, err := json.Marshal(settings)
	if err != nil {
		return fmt.Errorf("encode settings: %w", err)
	}

	const query = `
		INSERT INTO settings (key, value)
		VALUES ('app', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`

	if _, err := s.db.Exec(query, string(raw)); err != nil {
		return fmt.Errorf("save settings: %w", err)
	}

	return nil
}

func (s *SQLiteStore) GetReaderProgress(mangaID string) (contracts.ReaderProgress, bool, error) {
	const query = `
		SELECT manga_id, chapter_id, page, updated_at
		FROM reader_progress
		WHERE manga_id = ?
	`

	var progress contracts.ReaderProgress
	if err := s.db.QueryRow(query, mangaID).Scan(&progress.MangaID, &progress.ChapterID, &progress.Page, &progress.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.ReaderProgress{}, false, nil
		}

		return contracts.ReaderProgress{}, false, fmt.Errorf("select reader progress: %w", err)
	}

	return progress, true, nil
}

func (s *SQLiteStore) SaveLibraryManga(mangas []contracts.LibraryManga, modTimes map[string]int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`DELETE FROM library_manga`)
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO library_manga (id, title, source_url, relative_path, cover_image_url, chapter_count, page_count, last_updated, mod_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, m := range mangas {
		modTime := modTimes[m.ID]
		if _, err := stmt.Exec(m.ID, m.Title, m.SourceURL, m.RelativePath, m.CoverImageURL, m.ChapterCount, m.PageCount, m.LastUpdated, modTime); err != nil {
			return err
		}
	}

	return tx.Commit()
}

type LibraryMangaRecord struct {
	contracts.LibraryManga
	ModTime int64
}

func (s *SQLiteStore) ListLibraryManga() ([]LibraryMangaRecord, error) {
	rows, err := s.db.Query(`
		SELECT id, title, source_url, relative_path, cover_image_url, chapter_count, page_count, last_updated, mod_time
		FROM library_manga
		ORDER BY last_updated DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []LibraryMangaRecord
	for rows.Next() {
		var r LibraryMangaRecord
		if err := rows.Scan(
			&r.ID, &r.Title, &r.SourceURL, &r.RelativePath, &r.CoverImageURL,
			&r.ChapterCount, &r.PageCount, &r.LastUpdated, &r.ModTime,
		); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func (s *SQLiteStore) SaveReaderProgress(progress contracts.ReaderProgress) error {
	const query = `
		INSERT INTO reader_progress (manga_id, chapter_id, page, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(manga_id) DO UPDATE SET
			chapter_id = excluded.chapter_id,
			page = excluded.page,
			updated_at = excluded.updated_at
	`

	if _, err := s.db.Exec(query, progress.MangaID, progress.ChapterID, progress.Page, progress.UpdatedAt); err != nil {
		return fmt.Errorf("save reader progress: %w", err)
	}

	return nil
}
