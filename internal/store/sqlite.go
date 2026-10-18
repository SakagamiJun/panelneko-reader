package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

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
	pragmas := []string{
		`PRAGMA journal_mode = WAL;`,
		`PRAGMA busy_timeout = 5000;`,
		`PRAGMA synchronous = NORMAL;`,
		`PRAGMA cache_size = -2000;`,
	}
	for _, pragma := range pragmas {
		if _, err := s.db.Exec(pragma); err != nil {
			return fmt.Errorf("execute pragma %s: %w", pragma, err)
		}
	}

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
			parent_path TEXT NOT NULL DEFAULT '',
			is_collection INTEGER NOT NULL DEFAULT 0,
			manga_count INTEGER NOT NULL DEFAULT 0,
			cover_image_url TEXT NOT NULL,
			chapter_count INTEGER NOT NULL,
			page_count INTEGER NOT NULL,
			last_updated TEXT NOT NULL,
			mod_time INTEGER NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS pinned_items (
			id TEXT PRIMARY KEY,
			pinned_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS site_profiles (
			site TEXT NOT NULL,
			bundle_hash TEXT PRIMARY KEY,
			bundle_url TEXT NOT NULL,
			profile_json TEXT NOT NULL,
			extracted_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS download_tasks (
			id TEXT PRIMARY KEY,
			source TEXT NOT NULL,
			manga_id TEXT NOT NULL,
			manga_title TEXT NOT NULL,
			manga_cover_url TEXT NOT NULL DEFAULT '',
			chapter_id TEXT NOT NULL,
			chapter_title TEXT NOT NULL,
			chapter_number REAL NOT NULL DEFAULT 0,
			chapter_group TEXT NOT NULL DEFAULT '',
			target_source_id TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			total_pages INTEGER NOT NULL DEFAULT 0,
			downloaded_pages INTEGER NOT NULL DEFAULT 0,
			speed TEXT NOT NULL DEFAULT '',
			error_message TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS manga_online_links (
			manga_id TEXT PRIMARY KEY,
			online_source TEXT NOT NULL,
			online_comic_id TEXT NOT NULL,
			online_title TEXT NOT NULL DEFAULT '',
			auto_follow INTEGER NOT NULL DEFAULT 0,
			follow_policy TEXT NOT NULL DEFAULT 'latest_only',
			last_checked_at TEXT NOT NULL DEFAULT '',
			last_notified_chapter TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE TABLE IF NOT EXISTS copymanga_accounts (
			username TEXT PRIMARY KEY,
			password TEXT NOT NULL,
			token TEXT NOT NULL,
			limited_at INTEGER NOT NULL DEFAULT 0,
			last_checked_at INTEGER NOT NULL DEFAULT 0
		);`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}

	s.addColumnIfNotExists("library_manga", "parent_path", "TEXT NOT NULL DEFAULT ''")
	s.addColumnIfNotExists("library_manga", "is_collection", "INTEGER NOT NULL DEFAULT 0")
	s.addColumnIfNotExists("library_manga", "manga_count", "INTEGER NOT NULL DEFAULT 0")
	s.addColumnIfNotExists("library_manga", "source_id", "TEXT NOT NULL DEFAULT 'default'")
	s.addColumnIfNotExists("library_manga", "is_available", "INTEGER NOT NULL DEFAULT 1")
	s.addColumnIfNotExists("download_tasks", "chapter_group", "TEXT NOT NULL DEFAULT ''")
	s.addColumnIfNotExists("download_tasks", "target_source_id", "TEXT NOT NULL DEFAULT ''")

	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_library_manga_source ON library_manga (source_id)`)

	return nil
}

func (s *SQLiteStore) addColumnIfNotExists(table, column, colDef string) {
	rows, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var dfltValue *string
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return
		}
		if name == column {
			return
		}
	}
	s.db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, colDef))
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
	return s.SaveLibraryMangaForSource("default", mangas, modTimes)
}

func (s *SQLiteStore) SaveLibraryMangaForSource(sourceID string, mangas []contracts.LibraryManga, modTimes map[string]int64) error {
	if sourceID == "" {
		sourceID = "default"
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`DELETE FROM library_manga WHERE source_id = ?`, sourceID)
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO library_manga (id, source_id, title, source_url, relative_path, parent_path, is_collection, manga_count, cover_image_url, chapter_count, page_count, last_updated, mod_time, is_available)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, m := range mangas {
		modTime := modTimes[m.ID]
		isColl := 0
		if m.IsCollection {
			isColl = 1
		}
		itemSourceID := m.SourceID
		if itemSourceID == "" {
			itemSourceID = sourceID
		}
		isAvail := 1
		if !m.IsAvailable {
			isAvail = 0
		}
		if _, err := stmt.Exec(m.ID, itemSourceID, m.Title, m.SourceURL, m.RelativePath, m.ParentPath, isColl, m.MangaCount, m.CoverImageURL, m.ChapterCount, m.PageCount, m.LastUpdated, modTime, isAvail); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *SQLiteStore) SetSourceAvailability(sourceID string, isAvailable bool) error {
	avail := 0
	if isAvailable {
		avail = 1
	}
	_, err := s.db.Exec(`UPDATE library_manga SET is_available = ? WHERE source_id = ?`, avail, sourceID)
	return err
}

func (s *SQLiteStore) DeleteSourceLibraryManga(sourceID string) error {
	_, err := s.db.Exec(`DELETE FROM library_manga WHERE source_id = ?`, sourceID)
	return err
}

type LibraryMangaRecord struct {
	contracts.LibraryManga
	ModTime int64
}

func (s *SQLiteStore) ListLibraryManga() ([]LibraryMangaRecord, error) {
	rows, err := s.db.Query(`
		SELECT id, source_id, title, source_url, relative_path, parent_path, is_collection, manga_count, cover_image_url, chapter_count, page_count, last_updated, mod_time, is_available
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
		var isColl int
		var isAvail int
		if err := rows.Scan(
			&r.ID, &r.SourceID, &r.Title, &r.SourceURL, &r.RelativePath, &r.ParentPath, &isColl, &r.MangaCount, &r.CoverImageURL,
			&r.ChapterCount, &r.PageCount, &r.LastUpdated, &r.ModTime, &isAvail,
		); err != nil {
			return nil, err
		}
		r.IsCollection = (isColl == 1)
		r.IsAvailable = (isAvail == 1)
		records = append(records, r)
	}
	return records, rows.Err()
}

func (s *SQLiteStore) ListLibraryMangaBySource(sourceID string) ([]LibraryMangaRecord, error) {
	rows, err := s.db.Query(`
		SELECT id, source_id, title, source_url, relative_path, parent_path, is_collection, manga_count, cover_image_url, chapter_count, page_count, last_updated, mod_time, is_available
		FROM library_manga
		WHERE source_id = ?
		ORDER BY last_updated DESC
	`, sourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []LibraryMangaRecord
	for rows.Next() {
		var r LibraryMangaRecord
		var isColl int
		var isAvail int
		if err := rows.Scan(
			&r.ID, &r.SourceID, &r.Title, &r.SourceURL, &r.RelativePath, &r.ParentPath, &isColl, &r.MangaCount, &r.CoverImageURL,
			&r.ChapterCount, &r.PageCount, &r.LastUpdated, &r.ModTime, &isAvail,
		); err != nil {
			return nil, err
		}
		r.IsCollection = (isColl == 1)
		r.IsAvailable = (isAvail == 1)
		records = append(records, r)
	}
	return records, rows.Err()
}

func (s *SQLiteStore) GetLibraryManga(id string) (contracts.LibraryManga, bool, error) {
	row := s.db.QueryRow(`
		SELECT id, source_id, title, source_url, relative_path, parent_path, is_collection, manga_count, cover_image_url, chapter_count, page_count, last_updated, is_available
		FROM library_manga
		WHERE id = ?
	`, id)

	var m contracts.LibraryManga
	var isColl int
	var isAvail int
	if err := row.Scan(
		&m.ID, &m.SourceID, &m.Title, &m.SourceURL, &m.RelativePath, &m.ParentPath, &isColl, &m.MangaCount, &m.CoverImageURL,
		&m.ChapterCount, &m.PageCount, &m.LastUpdated, &isAvail,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.LibraryManga{}, false, nil
		}
		return contracts.LibraryManga{}, false, err
	}
	m.IsCollection = (isColl == 1)
	m.IsAvailable = (isAvail == 1)
	return m, true, nil
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

func (s *SQLiteStore) GetPinnedMap() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT id, pinned_at FROM pinned_items`)
	if err != nil {
		return nil, fmt.Errorf("query pinned items: %w", err)
	}
	defer rows.Close()

	pinned := make(map[string]string)
	for rows.Next() {
		var id, pinnedAt string
		if err := rows.Scan(&id, &pinnedAt); err != nil {
			return nil, fmt.Errorf("scan pinned item: %w", err)
		}
		pinned[id] = pinnedAt
	}
	return pinned, rows.Err()
}

func (s *SQLiteStore) TogglePin(id string) (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM pinned_items WHERE id = ?`, id).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check pin status: %w", err)
	}

	if count > 0 {
		_, err := s.db.Exec(`DELETE FROM pinned_items WHERE id = ?`, id)
		if err != nil {
			return false, fmt.Errorf("unpin item: %w", err)
		}
		return false, nil
	}

	pinnedAt := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = s.db.Exec(`INSERT INTO pinned_items (id, pinned_at) VALUES (?, ?)`, id, pinnedAt)
	if err != nil {
		return false, fmt.Errorf("pin item: %w", err)
	}

	return true, nil
}

func (s *SQLiteStore) SetPin(id string, isPinned bool, pinnedAt string) error {
	if isPinned {
		if pinnedAt == "" {
			pinnedAt = time.Now().UTC().Format(time.RFC3339Nano)
		}
		_, err := s.db.Exec(`
			INSERT INTO pinned_items (id, pinned_at)
			VALUES (?, ?)
			ON CONFLICT(id) DO UPDATE SET pinned_at = excluded.pinned_at
		`, id, pinnedAt)
		return err
	}

	_, err := s.db.Exec(`DELETE FROM pinned_items WHERE id = ?`, id)
	return err
}

func (s *SQLiteStore) SaveSiteProfile(profile contracts.SiteProfile) error {
	raw, err := json.Marshal(profile)
	if err != nil {
		return fmt.Errorf("encode site profile: %w", err)
	}

	const query = `
		INSERT INTO site_profiles (
			site, bundle_hash, bundle_url, profile_json, extracted_at
		) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(bundle_hash) DO UPDATE SET
			site = excluded.site,
			bundle_url = excluded.bundle_url,
			profile_json = excluded.profile_json,
			extracted_at = excluded.extracted_at
	`
	_, err = s.db.Exec(query, profile.Site, profile.BundleHash, profile.BundleURL, string(raw), profile.ExtractedAt)
	if err != nil {
		return fmt.Errorf("upsert site profile: %w", err)
	}
	return nil
}

func (s *SQLiteStore) GetSiteProfile(bundleHash string) (contracts.SiteProfile, bool, error) {
	const query = `SELECT profile_json FROM site_profiles WHERE bundle_hash = ?`
	var raw string
	if err := s.db.QueryRow(query, bundleHash).Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.SiteProfile{}, false, nil
		}
		return contracts.SiteProfile{}, false, fmt.Errorf("select site profile: %w", err)
	}

	var profile contracts.SiteProfile
	if err := json.Unmarshal([]byte(raw), &profile); err != nil {
		return contracts.SiteProfile{}, false, fmt.Errorf("decode site profile: %w", err)
	}
	return profile, true, nil
}

func (s *SQLiteStore) GetLatestSiteProfile(site string) (contracts.SiteProfile, bool, error) {
	const query = `SELECT profile_json FROM site_profiles WHERE site = ? ORDER BY extracted_at DESC LIMIT 1`
	var raw string
	if err := s.db.QueryRow(query, site).Scan(&raw); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.SiteProfile{}, false, nil
		}
		return contracts.SiteProfile{}, false, fmt.Errorf("select latest site profile: %w", err)
	}

	var profile contracts.SiteProfile
	if err := json.Unmarshal([]byte(raw), &profile); err != nil {
		return contracts.SiteProfile{}, false, fmt.Errorf("decode latest site profile: %w", err)
	}
	return profile, true, nil
}

func (s *SQLiteStore) GetDownloadTask(id string) (contracts.DownloadTask, bool, error) {
	const query = `
		SELECT id, source, manga_id, manga_title, manga_cover_url,
		       chapter_id, chapter_title, chapter_number, chapter_group, target_source_id,
		       status, total_pages, downloaded_pages, speed, error_message,
		       created_at, updated_at
		FROM download_tasks
		WHERE id = ?
	`
	var t contracts.DownloadTask
	var statusStr string
	err := s.db.QueryRow(query, id).Scan(
		&t.ID, &t.Source, &t.MangaID, &t.MangaTitle, &t.MangaCoverURL,
		&t.ChapterID, &t.ChapterTitle, &t.ChapterNumber, &t.ChapterGroup, &t.TargetSourceID,
		&statusStr, &t.TotalPages, &t.DownloadedPages, &t.Speed, &t.ErrorMessage,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.DownloadTask{}, false, nil
		}
		return contracts.DownloadTask{}, false, fmt.Errorf("select download task: %w", err)
	}
	t.Status = contracts.DownloadTaskStatus(statusStr)
	return t, true, nil
}

func (s *SQLiteStore) SaveDownloadTask(task contracts.DownloadTask) error {
	const query = `
		INSERT INTO download_tasks (
			id, source, manga_id, manga_title, manga_cover_url,
			chapter_id, chapter_title, chapter_number, chapter_group, target_source_id,
			status, total_pages, downloaded_pages, speed, error_message,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status = excluded.status,
			total_pages = excluded.total_pages,
			downloaded_pages = excluded.downloaded_pages,
			speed = excluded.speed,
			error_message = excluded.error_message,
			updated_at = excluded.updated_at
	`
	_, err := s.db.Exec(query,
		task.ID, task.Source, task.MangaID, task.MangaTitle, task.MangaCoverURL,
		task.ChapterID, task.ChapterTitle, task.ChapterNumber, task.ChapterGroup, task.TargetSourceID,
		string(task.Status), task.TotalPages, task.DownloadedPages, task.Speed, task.ErrorMessage,
		task.CreatedAt, task.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("save download task: %w", err)
	}
	return nil
}

func (s *SQLiteStore) GetDownloadTasks() ([]contracts.DownloadTask, error) {
	const query = `
		SELECT id, source, manga_id, manga_title, manga_cover_url,
		       chapter_id, chapter_title, chapter_number, chapter_group, target_source_id,
		       status, total_pages, downloaded_pages, speed, error_message,
		       created_at, updated_at
		FROM download_tasks
		ORDER BY created_at DESC
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query download tasks: %w", err)
	}
	defer rows.Close()

	var tasks []contracts.DownloadTask
	for rows.Next() {
		var t contracts.DownloadTask
		var statusStr string
		err := rows.Scan(
			&t.ID, &t.Source, &t.MangaID, &t.MangaTitle, &t.MangaCoverURL,
			&t.ChapterID, &t.ChapterTitle, &t.ChapterNumber, &t.ChapterGroup, &t.TargetSourceID,
			&statusStr, &t.TotalPages, &t.DownloadedPages, &t.Speed, &t.ErrorMessage,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan download task: %w", err)
		}
		t.Status = contracts.DownloadTaskStatus(statusStr)
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (s *SQLiteStore) UpdateDownloadTaskStatus(id string, status contracts.DownloadTaskStatus, errorMsg string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	const query = `UPDATE download_tasks SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`
	_, err := s.db.Exec(query, string(status), errorMsg, now, id)
	return err
}

func (s *SQLiteStore) UpdateDownloadTaskProgress(id string, downloadedPages int, totalPages int, speed string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	const query = `UPDATE download_tasks SET downloaded_pages = ?, total_pages = ?, speed = ?, updated_at = ? WHERE id = ?`
	_, err := s.db.Exec(query, downloadedPages, totalPages, speed, now, id)
	return err
}

func (s *SQLiteStore) DeleteDownloadTask(id string) error {
	const query = `DELETE FROM download_tasks WHERE id = ?`
	_, err := s.db.Exec(query, id)
	return err
}

func (s *SQLiteStore) ClearCompletedDownloadTasks() error {
	const query = `DELETE FROM download_tasks WHERE status IN ('completed', 'failed')`
	_, err := s.db.Exec(query)
	return err
}

func (s *SQLiteStore) SaveMangaOnlineLink(link contracts.MangaOnlineLink) error {
	const query = `
		INSERT INTO manga_online_links (
			manga_id, online_source, online_comic_id, online_title,
			auto_follow, follow_policy, last_checked_at, last_notified_chapter
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(manga_id) DO UPDATE SET
			online_source = excluded.online_source,
			online_comic_id = excluded.online_comic_id,
			online_title = excluded.online_title,
			auto_follow = excluded.auto_follow,
			follow_policy = excluded.follow_policy,
			last_checked_at = excluded.last_checked_at,
			last_notified_chapter = excluded.last_notified_chapter
	`
	autoFollowInt := 0
	if link.AutoFollow {
		autoFollowInt = 1
	}
	policy := link.FollowPolicy
	if policy == "" {
		policy = "latest_only"
	}
	_, err := s.db.Exec(query,
		link.MangaID, link.OnlineSource, link.OnlineComicID, link.OnlineTitle,
		autoFollowInt, policy, link.LastCheckedAt, link.LastNotifiedChapter,
	)
	if err != nil {
		return fmt.Errorf("save manga online link: %w", err)
	}
	return nil
}

func (s *SQLiteStore) GetMangaOnlineLink(mangaID string) (contracts.MangaOnlineLink, bool, error) {
	const query = `
		SELECT manga_id, online_source, online_comic_id, online_title,
		       auto_follow, follow_policy, last_checked_at, last_notified_chapter
		FROM manga_online_links
		WHERE manga_id = ?
	`
	var link contracts.MangaOnlineLink
	var autoFollowInt int
	err := s.db.QueryRow(query, mangaID).Scan(
		&link.MangaID, &link.OnlineSource, &link.OnlineComicID, &link.OnlineTitle,
		&autoFollowInt, &link.FollowPolicy, &link.LastCheckedAt, &link.LastNotifiedChapter,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return contracts.MangaOnlineLink{}, false, nil
		}
		return contracts.MangaOnlineLink{}, false, fmt.Errorf("select manga online link: %w", err)
	}
	link.AutoFollow = autoFollowInt == 1
	return link, true, nil
}

func (s *SQLiteStore) GetAutoFollowMangaLinks() ([]contracts.MangaOnlineLink, error) {
	const query = `
		SELECT manga_id, online_source, online_comic_id, online_title,
		       auto_follow, follow_policy, last_checked_at, last_notified_chapter
		FROM manga_online_links
		WHERE auto_follow = 1
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query auto follow manga links: %w", err)
	}
	defer rows.Close()

	var links []contracts.MangaOnlineLink
	for rows.Next() {
		var link contracts.MangaOnlineLink
		var autoFollowInt int
		err := rows.Scan(
			&link.MangaID, &link.OnlineSource, &link.OnlineComicID, &link.OnlineTitle,
			&autoFollowInt, &link.FollowPolicy, &link.LastCheckedAt, &link.LastNotifiedChapter,
		)
		if err != nil {
			return nil, fmt.Errorf("scan auto follow manga link: %w", err)
		}
		link.AutoFollow = autoFollowInt == 1
		links = append(links, link)
	}
	return links, rows.Err()
}

func (s *SQLiteStore) GetAllMangaOnlineLinks() ([]contracts.MangaOnlineLink, error) {
	const query = `
		SELECT manga_id, online_source, online_comic_id, online_title,
		       auto_follow, follow_policy, last_checked_at, last_notified_chapter
		FROM manga_online_links
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query all manga online links: %w", err)
	}
	defer rows.Close()

	var links []contracts.MangaOnlineLink
	for rows.Next() {
		var link contracts.MangaOnlineLink
		var autoFollowInt int
		err := rows.Scan(
			&link.MangaID, &link.OnlineSource, &link.OnlineComicID, &link.OnlineTitle,
			&autoFollowInt, &link.FollowPolicy, &link.LastCheckedAt, &link.LastNotifiedChapter,
		)
		if err != nil {
			return nil, fmt.Errorf("scan manga online link: %w", err)
		}
		link.AutoFollow = autoFollowInt == 1
		links = append(links, link)
	}
	return links, rows.Err()
}

func (s *SQLiteStore) DeleteMangaOnlineLink(mangaID string) error {
	const query = `DELETE FROM manga_online_links WHERE manga_id = ?`
	_, err := s.db.Exec(query, mangaID)
	return err
}

func (s *SQLiteStore) GetCopyMangaAccounts() ([]contracts.CopyMangaAccount, error) {
	rows, err := s.db.Query(`SELECT username, password, token, limited_at, last_checked_at FROM copymanga_accounts ORDER BY limited_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("query copymanga accounts: %w", err)
	}
	defer rows.Close()

	var list []contracts.CopyMangaAccount
	for rows.Next() {
		var a contracts.CopyMangaAccount
		if err := rows.Scan(&a.Username, &a.Password, &a.Token, &a.LimitedAt, &a.LastCheckedAt); err != nil {
			return nil, fmt.Errorf("scan copymanga account: %w", err)
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

func (s *SQLiteStore) SaveCopyMangaAccount(a contracts.CopyMangaAccount) error {
	const query = `
		INSERT INTO copymanga_accounts (username, password, token, limited_at, last_checked_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(username) DO UPDATE SET
			password = excluded.password,
			token = excluded.token,
			limited_at = excluded.limited_at,
			last_checked_at = excluded.last_checked_at
	`
	_, err := s.db.Exec(query, a.Username, a.Password, a.Token, a.LimitedAt, a.LastCheckedAt)
	if err != nil {
		return fmt.Errorf("save copymanga account: %w", err)
	}
	return nil
}

func (s *SQLiteStore) UpdateCopyMangaAccountLimited(username string, limitedAt int64) error {
	_, err := s.db.Exec(`UPDATE copymanga_accounts SET limited_at = ? WHERE username = ?`, limitedAt, username)
	if err != nil {
		return fmt.Errorf("update copymanga account limited: %w", err)
	}
	return nil
}

func (s *SQLiteStore) UpdateCopyMangaAccountToken(username string, token string, lastCheckedAt int64) error {
	_, err := s.db.Exec(`UPDATE copymanga_accounts SET token = ?, last_checked_at = ? WHERE username = ?`, token, lastCheckedAt, username)
	if err != nil {
		return fmt.Errorf("update copymanga account token: %w", err)
	}
	return nil
}

func (s *SQLiteStore) DeleteCopyMangaAccount(username string) error {
	_, err := s.db.Exec(`DELETE FROM copymanga_accounts WHERE username = ?`, username)
	if err != nil {
		return fmt.Errorf("delete copymanga account: %w", err)
	}
	return nil
}
