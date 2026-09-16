package library

import (
	"archive/zip"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
)

var libraryManifestSemaphore = make(chan struct{}, 32)

const (
	LibraryAssetPrefix        = "/library-files/"
	LibraryArchiveAssetPrefix = "/library-archive/"
	archiveSidecarSuffix      = ".panelneko-chapter.json"
)

func IsLibraryAssetRequest(requestPath string) bool {
	return strings.HasPrefix(requestPath, LibraryAssetPrefix) || strings.HasPrefix(requestPath, LibraryArchiveAssetPrefix)
}

type chapterSourceKind string

const (
	chapterSourceDirectory chapterSourceKind = "directory"
	chapterSourceArchive   chapterSourceKind = "archive"
)

type mangaManifest struct {
	relativePath string
	updatedAt    time.Time
	sourceURL    string
	reader       contracts.ReaderManifest
}

type chapterSource struct {
	id          string
	title       string
	number      float64
	sourceURL   string
	completedAt string
	localPath   string
	pages       []contracts.ReaderPage
	updatedAt   time.Time
}

type chapterSourceDescriptor struct {
	kind      chapterSourceKind
	path      string
	name      string
	mangaPath string
}

type chapterMetadata struct {
	id          string
	title       string
	number      float64
	sourceURL   string
	completedAt string
}

type archiveEntry struct {
	file           *zip.File
	normalizedPath string
}

type archiveAssetReadCloser struct {
	entryReader io.ReadCloser
	cacheEntry  *archiveCacheEntry
}

func (r *archiveAssetReadCloser) Read(buffer []byte) (int, error) {
	return r.entryReader.Read(buffer)
}

func (r *archiveAssetReadCloser) Close() error {
	entryErr := r.entryReader.Close()
	releaseArchive(r.cacheEntry)
	return entryErr
}

func hasCollectionMarker(dirPath string) bool {
	markers := []string{
		".collection",
		".category",
		"collection.txt",
		"_collection",
		".panelneko-collection",
	}
	for _, m := range markers {
		target := filepath.Join(dirPath, m)
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}

func getMangaModTime(mangaPath string, fallback int64) int64 {
	info, err := os.Stat(mangaPath)
	if err != nil {
		return fallback
	}
	if !info.IsDir() {
		return info.ModTime().UnixNano()
	}
	entries, err := os.ReadDir(mangaPath)
	if err != nil {
		return fallback
	}
	max := info.ModTime().UnixNano()
	if max < fallback {
		max = fallback
	}
	for _, e := range entries {
		if info, err := e.Info(); err == nil {
			if t := info.ModTime().UnixNano(); t > max {
				max = t
			}
		}
	}
	return max
}

func ScanLibraryManga(outputRoot string, prevItems map[string]contracts.LibraryManga, prevModTimes map[string]int64) ([]contracts.LibraryManga, map[string]int64, error) {
	entries, err := os.ReadDir(outputRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return []contracts.LibraryManga{}, nil, nil
		}
		return nil, nil, fmt.Errorf("read library root: %w", err)
	}

	newModTimes := make(map[string]int64)

	var items []contracts.LibraryManga
	var mu sync.Mutex
	var wg sync.WaitGroup
	var firstErr error
	var errOnce sync.Once

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		wg.Add(1)
		go func(entry os.DirEntry) {
			defer wg.Done()
			entryPath := filepath.Join(outputRoot, entry.Name())

			info, err := entry.Info()
			if err != nil {
				return
			}

			if hasCollectionMarker(entryPath) {
				subEntries, err := os.ReadDir(entryPath)
				if err != nil {
					return
				}

				collRelativePath := filepath.ToSlash(entry.Name())

				// Compute the aggregate mod time for the entire collection.
				var collModTimeMax int64 = info.ModTime().UnixNano()
				for _, subEntry := range subEntries {
					if !subEntry.IsDir() && !isSupportedArchivePath(subEntry.Name()) {
						continue
					}
					subPath := filepath.Join(entryPath, subEntry.Name())
					subInfo, err := subEntry.Info()
					if err != nil {
						continue
					}
					subModTime := getMangaModTime(subPath, subInfo.ModTime().UnixNano())
					if subModTime > collModTimeMax {
						collModTimeMax = subModTime
					}
				}

				// Collection-level cache: if the aggregate mod time is unchanged,
				// reuse all previously cached items for this collection.
				if prevTime, ok := prevModTimes[collRelativePath]; ok && prevTime == collModTimeMax {
					if prevColl, ok := prevItems[collRelativePath]; ok {
						mu.Lock()
						items = append(items, prevColl)
						newModTimes[prevColl.ID] = collModTimeMax
						for _, prev := range prevItems {
							if prev.ParentPath == collRelativePath {
								items = append(items, prev)
								newModTimes[prev.ID] = prevModTimes[prev.RelativePath]
							}
						}
						mu.Unlock()
						return
					}
				}

				var collItems []contracts.LibraryManga
				var collModTimes = make(map[string]int64)

				for _, subEntry := range subEntries {
					if !subEntry.IsDir() && !isSupportedArchivePath(subEntry.Name()) {
						continue
					}
					subPath := filepath.Join(entryPath, subEntry.Name())
					subRelPath := filepath.ToSlash(filepath.Join(entry.Name(), subEntry.Name()))
					subInfo, err := subEntry.Info()
					if err != nil {
						continue
					}
					subModTime := getMangaModTime(subPath, subInfo.ModTime().UnixNano())

					if prevTime, ok := prevModTimes[subRelPath]; ok && prevTime == subModTime {
						if prevItem, ok := prevItems[subRelPath]; ok {
							collItems = append(collItems, prevItem)
							collModTimes[prevItem.ID] = subModTime
							continue
						}
					}

					manifest, err := loadMangaManifest(outputRoot, subPath, subRelPath)
					if err != nil {
						continue
					}
					if len(manifest.reader.Chapters) == 0 {
						continue
					}

					subItem := contracts.LibraryManga{
						ID:            manifest.reader.MangaID,
						Title:         manifest.reader.Title,
						SourceURL:     manifest.sourceURL,
						RelativePath:  manifest.relativePath,
						ParentPath:    filepath.ToSlash(entry.Name()),
						IsCollection:  false,
						MangaCount:    0,
						CoverImageURL: manifest.reader.CoverImageURL,
						ChapterCount:  len(manifest.reader.Chapters),
						PageCount:     manifest.reader.TotalPages,
						LastUpdated:   manifest.updatedAt.UTC().Format(time.RFC3339),
					}

					collItems = append(collItems, subItem)
					collModTimes[subItem.ID] = subModTime
				}

				if len(collItems) > 0 {
					sort.SliceStable(collItems, func(i, j int) bool {
						return naturalLess(collItems[i].Title, collItems[j].Title)
					})

					totalChapters := 0
					totalPages := 0
					latestUpdate := time.Unix(0, collModTimeMax).UTC()
					coverURL := collItems[0].CoverImageURL

					for _, child := range collItems {
						totalChapters += child.ChapterCount
						totalPages += child.PageCount
						if t, err := time.Parse(time.RFC3339, child.LastUpdated); err == nil && t.After(latestUpdate) {
							latestUpdate = t
						}
					}

					collItem := contracts.LibraryManga{
						ID:            encodeMangaID(collRelativePath),
						Title:         entry.Name(),
						SourceURL:     "",
						RelativePath:  collRelativePath,
						ParentPath:    "",
						IsCollection:  true,
						MangaCount:    len(collItems),
						CoverImageURL: coverURL,
						ChapterCount:  totalChapters,
						PageCount:     totalPages,
						LastUpdated:   latestUpdate.Format(time.RFC3339),
					}

					mu.Lock()
					items = append(items, collItem)
					newModTimes[collItem.ID] = collModTimeMax
					for _, ci := range collItems {
						items = append(items, ci)
						newModTimes[ci.ID] = collModTimes[ci.ID]
					}
					mu.Unlock()
				}
				return
			}

			modTime := getMangaModTime(entryPath, info.ModTime().UnixNano())
			relPath := filepath.ToSlash(entry.Name())

			if prevTime, ok := prevModTimes[relPath]; ok && prevTime == modTime {
				if prevItem, ok := prevItems[relPath]; ok {
					mu.Lock()
					items = append(items, prevItem)
					newModTimes[prevItem.ID] = modTime
					mu.Unlock()
					return
				}
			}

			manifest, err := loadMangaManifest(outputRoot, entryPath, relPath)
			if err != nil {
				errOnce.Do(func() { firstErr = err })
				return
			}
			if len(manifest.reader.Chapters) == 0 {
				return
			}

			item := contracts.LibraryManga{
				ID:            manifest.reader.MangaID,
				Title:         manifest.reader.Title,
				SourceURL:     manifest.sourceURL,
				RelativePath:  manifest.relativePath,
				ParentPath:    "",
				IsCollection:  false,
				MangaCount:    0,
				CoverImageURL: manifest.reader.CoverImageURL,
				ChapterCount:  len(manifest.reader.Chapters),
				PageCount:     manifest.reader.TotalPages,
				LastUpdated:   manifest.updatedAt.UTC().Format(time.RFC3339),
			}

			mu.Lock()
			items = append(items, item)
			newModTimes[item.ID] = modTime
			mu.Unlock()
		}(entry)
	}

	wg.Wait()
	if firstErr != nil {
		return nil, nil, firstErr
	}

	return items, newModTimes, nil
}

func GetReaderManifest(outputRoot string, mangaID string) (contracts.ReaderManifest, error) {
	relativePath, err := decodeMangaID(mangaID)
	if err != nil {
		return contracts.ReaderManifest{}, err
	}

	mangaDir, err := resolveWithinRoot(outputRoot, relativePath)
	if err != nil {
		return contracts.ReaderManifest{}, err
	}

	manifest, err := loadMangaManifest(outputRoot, mangaDir, relativePath)
	if err != nil {
		return contracts.ReaderManifest{}, err
	}

	return manifest.reader, nil
}

func ResolveDirectoryPath(outputRoot string, mangaID string) (string, error) {
	relativePath, err := decodeMangaID(mangaID)
	if err != nil {
		relativePath = filepath.FromSlash(mangaID)
	}

	targetPath, err := resolveWithinRoot(outputRoot, relativePath)
	if err != nil {
		return "", err
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		return "", err
	}

	if !info.IsDir() {
		return filepath.Dir(targetPath), nil
	}

	return targetPath, nil
}

func OpenDirectoryInFileManager(dirPath string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", dirPath)
	case "windows":
		cmd = exec.Command("explorer", dirPath)
	default:
		cmd = exec.Command("xdg-open", dirPath)
	}
	return cmd.Start()
}

var FileOpener = OpenDirectoryInFileManager

func ResolveLibraryAssetPath(outputRoot string, requestPath string) (string, error) {
	if !strings.HasPrefix(requestPath, LibraryAssetPrefix) {
		return "", fmt.Errorf("unsupported asset path: %s", requestPath)
	}

	relativeURLPath := strings.TrimPrefix(requestPath, LibraryAssetPrefix)
	if relativeURLPath == "" {
		return "", fmt.Errorf("empty asset path")
	}

	decodedPath, err := url.PathUnescape(relativeURLPath)
	if err != nil {
		return "", fmt.Errorf("decode asset path: %w", err)
	}

	targetPath, err := resolveWithinRoot(outputRoot, filepath.FromSlash(decodedPath))
	if err != nil {
		return "", err
	}

	if !isSupportedImagePath(targetPath) {
		return "", fmt.Errorf("unsupported asset extension: %s", targetPath)
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		return "", fmt.Errorf("stat asset path: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("asset path is a directory")
	}

	return targetPath, nil
}

func OpenArchiveAsset(outputRoot string, requestPath string) (io.ReadCloser, string, int64, error) {
	archivePath, entryPath, err := resolveArchiveAssetRequest(outputRoot, requestPath)
	if err != nil {
		return nil, "", -1, err
	}

	info, err := os.Stat(archivePath)
	if err != nil {
		return nil, "", -1, err
	}
	if info.IsDir() {
		return nil, "", -1, fmt.Errorf("archive path is a directory")
	}

	cacheEntry, err := acquireArchive(archivePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, "", -1, &os.PathError{
				Op:   "open archive",
				Path: archivePath,
				Err:  os.ErrNotExist,
			}
		}
		return nil, "", -1, fmt.Errorf("open archive: %w", err)
	}

	entry, err := findArchiveImageEntryFromCache(cacheEntry, entryPath)
	if err != nil {
		releaseArchive(cacheEntry)
		return nil, "", -1, err
	}

	entryReader, err := entry.file.Open()
	if err != nil {
		releaseArchive(cacheEntry)
		return nil, "", -1, fmt.Errorf("open archive entry: %w", err)
	}

	size := int64(entry.file.UncompressedSize64)
	if uint64(size) != entry.file.UncompressedSize64 {
		size = -1
	}

	contentType := contentTypeForImagePath(entry.normalizedPath)
	return &archiveAssetReadCloser{
		entryReader: entryReader,
		cacheEntry:  cacheEntry,
	}, contentType, size, nil
}

func AssetURLForPath(outputRoot string, filePath string) (string, error) {
	relativePath, err := relativePathWithinRoot(outputRoot, filePath)
	if err != nil {
		return "", err
	}

	segments := strings.Split(relativePath, "/")
	for index, segment := range segments {
		segments[index] = url.PathEscape(segment)
	}

	return LibraryAssetPrefix + strings.Join(segments, "/"), nil
}

func ArchiveAssetURL(outputRoot string, archivePath string, entryPath string) (string, error) {
	relativeArchivePath, err := relativePathWithinRoot(outputRoot, archivePath)
	if err != nil {
		return "", err
	}

	normalizedEntryPath, err := normalizeArchiveEntryPath(entryPath)
	if err != nil {
		return "", err
	}

	if shouldIgnoreArchiveEntry(normalizedEntryPath) {
		return "", fmt.Errorf("unsupported archive entry: %s", normalizedEntryPath)
	}
	if !isSupportedImagePath(normalizedEntryPath) {
		return "", fmt.Errorf("unsupported archive entry extension: %s", normalizedEntryPath)
	}

	return LibraryArchiveAssetPrefix +
		encodePathToken(relativeArchivePath) +
		"/" +
		encodePathToken(normalizedEntryPath), nil
}

func ArchiveSidecarPath(archivePath string) string {
	return strings.TrimSuffix(archivePath, filepath.Ext(archivePath)) + archiveSidecarSuffix
}

func loadMangaManifest(outputRoot string, mangaPath string, relativePath string) (mangaManifest, error) {
	info, err := os.Stat(mangaPath)
	if err != nil {
		return mangaManifest{}, fmt.Errorf("stat manga path: %w", err)
	}

	var descriptors []chapterSourceDescriptor
	title := filepath.Base(mangaPath)

	if !info.IsDir() {
		if isSupportedArchivePath(mangaPath) {
			title = strings.TrimSuffix(title, filepath.Ext(title))
			descriptors = append(descriptors, chapterSourceDescriptor{
				kind: chapterSourceArchive,
				path: mangaPath,
				name: title,
			})
		} else {
			return mangaManifest{}, fmt.Errorf("unsupported manga file: %s", mangaPath)
		}
	} else {
		chapterEntries, err := os.ReadDir(mangaPath)
		if err != nil {
			return mangaManifest{}, fmt.Errorf("read manga directory: %w", err)
		}

		for _, entry := range chapterEntries {
			switch {
			case entry.IsDir():
				resolved, err := resolveChapterDescriptors(filepath.Join(mangaPath, entry.Name()))
				if err != nil {
					return mangaManifest{}, fmt.Errorf("resolve chapters in %s: %w", entry.Name(), err)
				}
				descriptors = append(descriptors, resolved...)
			case isSupportedArchivePath(entry.Name()):
				descriptors = append(descriptors, chapterSourceDescriptor{
					kind: chapterSourceArchive,
					path: filepath.Join(mangaPath, entry.Name()),
					name: entry.Name(),
				})
			}
		}

		if len(descriptors) == 0 {
			if hasImages, _ := dirHasImages(mangaPath); hasImages {
				descriptors = append(descriptors, chapterSourceDescriptor{
					kind:      chapterSourceDirectory,
					path:      mangaPath,
					name:      title,
					mangaPath: mangaPath,
				})
			}
		}
	}

	for i := range descriptors {
		descriptors[i].mangaPath = mangaPath
	}

	chapters := make([]chapterSource, 0, len(descriptors))
	var (
		totalPages int
		updatedAt  time.Time
		sourceURL  string
	)

	var mu sync.Mutex
	var wg sync.WaitGroup
	var firstErr error
	var errOnce sync.Once

	for _, descriptor := range descriptors {
		wg.Add(1)
		go func(descriptor chapterSourceDescriptor) {
			defer wg.Done()

			libraryManifestSemaphore <- struct{}{}
			source, err := loadChapterSource(outputRoot, descriptor)
			<-libraryManifestSemaphore

			if err != nil {
				errOnce.Do(func() { firstErr = err })
				return
			}
			if len(source.pages) == 0 {
				return
			}

			mu.Lock()
			if source.updatedAt.After(updatedAt) {
				updatedAt = source.updatedAt
			}
			if sourceURL == "" && source.sourceURL != "" {
				sourceURL = source.sourceURL
			}
			totalPages += len(source.pages)
			chapters = append(chapters, source)
			mu.Unlock()
		}(descriptor)
	}

	wg.Wait()
	if firstErr != nil {
		return mangaManifest{}, firstErr
	}

	sort.SliceStable(chapters, func(i, j int) bool {
		return chapterLess(chapters[i], chapters[j])
	})

	readerChapters := make([]contracts.ReaderChapter, 0, len(chapters))
	startPage := 0
	coverImageURL := ""
	for _, source := range chapters {
		readerChapter := contracts.ReaderChapter{
			ID:          source.id,
			Title:       source.title,
			Number:      source.number,
			StartPage:   startPage,
			PageCount:   len(source.pages),
			Pages:       source.pages,
			LocalPath:   source.localPath,
			CompletedAt: source.completedAt,
		}
		if coverImageURL == "" && len(source.pages) > 0 {
			coverImageURL = source.pages[0].SourceURL
		}
		readerChapters = append(readerChapters, readerChapter)
		startPage += len(source.pages)
	}

	return mangaManifest{
		relativePath: filepath.ToSlash(relativePath),
		updatedAt:    updatedAt,
		sourceURL:    sourceURL,
		reader: contracts.ReaderManifest{
			MangaID:       encodeMangaID(relativePath),
			Title:         title,
			CoverImageURL: coverImageURL,
			TotalPages:    totalPages,
			Chapters:      readerChapters,
		},
	}, nil
}

func loadChapterSource(outputRoot string, descriptor chapterSourceDescriptor) (chapterSource, error) {
	switch descriptor.kind {
	case chapterSourceDirectory:
		return loadDirectoryChapterSource(outputRoot, descriptor)
	case chapterSourceArchive:
		return loadArchiveChapterSource(outputRoot, descriptor)
	default:
		return chapterSource{}, fmt.Errorf("unsupported chapter source type: %s", descriptor.kind)
	}
}

func loadDirectoryChapterSource(outputRoot string, descriptor chapterSourceDescriptor) (chapterSource, error) {
	chapterDir := descriptor.path
	info, hasInfo := readComicInfoFromDir(chapterDir)

	baseName := filepath.Base(chapterDir)
	metadata := resolveChapterMetadata(baseName, info, hasInfo)
	if descriptor.mangaPath != "" {
		if relToManga, err := filepath.Rel(descriptor.mangaPath, chapterDir); err == nil && relToManga != "." {
			metadata.id = filepath.ToSlash(relToManga)
		}
	} else if relToRoot, err := relativePathWithinRoot(outputRoot, chapterDir); err == nil {
		parts := strings.SplitN(relToRoot, "/", 2)
		if len(parts) == 2 {
			metadata.id = parts[1]
		}
	}
	pages, err := readDirectoryPages(outputRoot, chapterDir, metadata)
	if err != nil {
		return chapterSource{}, err
	}

	stat, err := os.Stat(chapterDir)
	if err != nil {
		return chapterSource{}, fmt.Errorf("stat chapter directory: %w", err)
	}

	return chapterSource{
		id:          metadata.id,
		title:       metadata.title,
		number:      metadata.number,
		sourceURL:   metadata.sourceURL,
		completedAt: metadata.completedAt,
		localPath:   chapterDir,
		pages:       pages,
		updatedAt:   stat.ModTime(),
	}, nil
}

func loadArchiveChapterSource(outputRoot string, descriptor chapterSourceDescriptor) (chapterSource, error) {
	archivePath := descriptor.path
	cacheEntry, err := acquireArchive(archivePath)
	if err != nil {
		return chapterSource{}, fmt.Errorf("open chapter archive: %w", err)
	}
	defer releaseArchive(cacheEntry)
	archiveReader := cacheEntry.archive

	info, hasInfo := readComicInfoFromArchive(archiveReader)
	baseName := strings.TrimSuffix(filepath.Base(archivePath), filepath.Ext(archivePath))
	metadata := resolveChapterMetadata(baseName, info, hasInfo)
	if descriptor.mangaPath != "" {
		if relToManga, err := filepath.Rel(descriptor.mangaPath, archivePath); err == nil && relToManga != "." {
			metadata.id = strings.TrimSuffix(filepath.ToSlash(relToManga), filepath.Ext(relToManga))
		}
	} else if relToRoot, err := relativePathWithinRoot(outputRoot, archivePath); err == nil {
		parts := strings.SplitN(relToRoot, "/", 2)
		if len(parts) == 2 {
			metadata.id = strings.TrimSuffix(parts[1], filepath.Ext(parts[1]))
		}
	}
	pages, err := readArchivePages(outputRoot, archivePath, archiveReader, metadata)
	if err != nil {
		return chapterSource{}, err
	}

	stat, err := os.Stat(archivePath)
	if err != nil {
		return chapterSource{}, fmt.Errorf("stat chapter archive: %w", err)
	}

	return chapterSource{
		id:          metadata.id,
		title:       metadata.title,
		number:      metadata.number,
		sourceURL:   metadata.sourceURL,
		completedAt: metadata.completedAt,
		localPath:   archivePath,
		pages:       pages,
		updatedAt:   stat.ModTime(),
	}, nil
}

// ── Archive Cache ────────────────────────────────────────────────────────────

type archiveCacheEntry struct {
	path     string
	archive  *zip.ReadCloser
	indexMap map[string]*zip.File
	refs     int
	lastUse  time.Time
	modTime  time.Time
}

var (
	acMutex   sync.Mutex
	acEntries = make(map[string]*archiveCacheEntry)
)

func acquireArchive(archivePath string) (*archiveCacheEntry, error) {
	info, err := os.Stat(archivePath)
	if err != nil {
		return nil, err
	}
	modTime := info.ModTime()

	acMutex.Lock()
	defer acMutex.Unlock()

	if entry, ok := acEntries[archivePath]; ok {
		if entry.modTime.Equal(modTime) {
			entry.refs++
			entry.lastUse = time.Now()
			return entry, nil
		}
		// File modified: remove stale entry from cache map
		if entry.refs == 0 {
			entry.archive.Close()
		}
		delete(acEntries, archivePath)
	}

	for len(acEntries) >= 3 {
		var oldestPath string
		var oldestTime time.Time
		for p, e := range acEntries {
			if e.refs == 0 {
				if oldestPath == "" || e.lastUse.Before(oldestTime) {
					oldestPath = p
					oldestTime = e.lastUse
				}
			}
		}
		if oldestPath != "" {
			acEntries[oldestPath].archive.Close()
			delete(acEntries, oldestPath)
		} else {
			break
		}
	}

	archiveReader, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, err
	}

	indexMap := make(map[string]*zip.File, len(archiveReader.File))
	for _, file := range archiveReader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if normalized, err := normalizeArchiveEntryPath(file.Name); err == nil {
			indexMap[normalized] = file
		}
	}

	entry := &archiveCacheEntry{
		path:     archivePath,
		archive:  archiveReader,
		indexMap: indexMap,
		refs:     1,
		lastUse:  time.Now(),
		modTime:  modTime,
	}
	acEntries[archivePath] = entry
	return entry, nil
}

func releaseArchive(entry *archiveCacheEntry) {
	acMutex.Lock()
	defer acMutex.Unlock()

	entry.refs--
	if entry.refs == 0 {
		if current, ok := acEntries[entry.path]; !ok || current != entry {
			// It was evicted or replaced while in use; close it now.
			entry.archive.Close()
		} else {
			for len(acEntries) > 3 {
				var oldestPath string
				var oldestTime time.Time
				for p, e := range acEntries {
					if e.refs == 0 {
						if oldestPath == "" || e.lastUse.Before(oldestTime) {
							oldestPath = p
							oldestTime = e.lastUse
						}
					}
				}
				if oldestPath != "" {
					acEntries[oldestPath].archive.Close()
					delete(acEntries, oldestPath)
				} else {
					break
				}
			}
		}
	}
}

func readDirectoryPages(outputRoot string, chapterDir string, metadata chapterMetadata) ([]contracts.ReaderPage, error) {
	pages := make([]contracts.ReaderPage, 0)

	chapterRelativePath, err := relativePathWithinRoot(outputRoot, chapterDir)
	if err != nil {
		return nil, err
	}
	segments := strings.Split(chapterRelativePath, "/")
	for i, seg := range segments {
		segments[i] = url.PathEscape(seg)
	}
	baseSourceURL := LibraryAssetPrefix + strings.Join(segments, "/") + "/"

	entries, err := os.ReadDir(chapterDir)
	if err != nil {
		return nil, fmt.Errorf("read chapter directory: %w", err)
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return naturalLess(entries[i].Name(), entries[j].Name())
	})
	for index, entry := range entries {
		if entry.IsDir() {
			continue
		}

		fullPath := filepath.Join(chapterDir, entry.Name())
		if !isSupportedImagePath(fullPath) {
			continue
		}
		sourceURL := baseSourceURL + url.PathEscape(entry.Name())
		pages = append(pages, buildReaderPage(metadata, index, entry.Name(), sourceURL))
	}

	return pages, nil
}

func readArchivePages(outputRoot string, archivePath string, archiveReader *zip.ReadCloser, metadata chapterMetadata) ([]contracts.ReaderPage, error) {
	entries, err := collectArchiveImageEntries(archiveReader)
	if err != nil {
		return nil, err
	}

	archiveRelativePath, err := relativePathWithinRoot(outputRoot, archivePath)
	if err != nil {
		return nil, err
	}
	baseSourceURL := LibraryArchiveAssetPrefix + encodePathToken(archiveRelativePath) + "/"

	pages := make([]contracts.ReaderPage, 0)

	sort.SliceStable(entries, func(i, j int) bool {
		return naturalLess(entries[i].normalizedPath, entries[j].normalizedPath)
	})
	for index, entry := range entries {
		sourceURL := baseSourceURL + encodePathToken(entry.normalizedPath)
		pages = append(pages, buildReaderPage(metadata, index, entry.normalizedPath, sourceURL))
	}

	return pages, nil
}

func buildReaderPage(metadata chapterMetadata, pageIndex int, fileName string, sourceURL string) contracts.ReaderPage {
	return contracts.ReaderPage{
		ID:           fmt.Sprintf("%s:%03d", metadata.id, pageIndex),
		ChapterID:    metadata.id,
		ChapterTitle: metadata.title,
		PageIndex:    pageIndex,
		FileName:     fileName,
		SourceURL:    sourceURL,
	}
}

func resolveChapterMetadata(baseName string, info ComicInfo, hasInfo bool) chapterMetadata {
	metadata := chapterMetadata{
		id:     baseName,
		title:  baseName,
		number: inferChapterNumber(baseName),
	}

	if !hasInfo {
		return metadata
	}

	if info.Number != "" {
		if val, err := strconv.ParseFloat(info.Number, 64); err == nil {
			metadata.number = val
		}
	} else if metadata.number == 0 && info.Title != "" {
		metadata.number = inferChapterNumber(info.Title)
	}
	if info.Title != "" {
		metadata.title = info.Title
	}
	return metadata
}

func resolveArchiveAssetRequest(outputRoot string, requestPath string) (string, string, error) {
	if !strings.HasPrefix(requestPath, LibraryArchiveAssetPrefix) {
		return "", "", fmt.Errorf("unsupported archive asset path: %s", requestPath)
	}

	relativeURLPath := strings.TrimPrefix(requestPath, LibraryArchiveAssetPrefix)
	if relativeURLPath == "" {
		return "", "", fmt.Errorf("empty archive asset path")
	}

	pathSegments := strings.Split(relativeURLPath, "/")
	if len(pathSegments) != 2 || pathSegments[0] == "" || pathSegments[1] == "" {
		return "", "", fmt.Errorf("invalid archive asset path: %s", requestPath)
	}

	archiveRelativePath, err := decodePathToken(pathSegments[0])
	if err != nil {
		return "", "", fmt.Errorf("decode archive path: %w", err)
	}
	entryPath, err := decodePathToken(pathSegments[1])
	if err != nil {
		return "", "", fmt.Errorf("decode archive entry: %w", err)
	}

	archivePath, err := resolveWithinRoot(outputRoot, filepath.FromSlash(archiveRelativePath))
	if err != nil {
		return "", "", err
	}
	if !isSupportedArchivePath(archivePath) {
		return "", "", fmt.Errorf("unsupported archive extension: %s", archivePath)
	}

	normalizedEntryPath, err := normalizeArchiveEntryPath(entryPath)
	if err != nil {
		return "", "", err
	}
	if shouldIgnoreArchiveEntry(normalizedEntryPath) {
		return "", "", fmt.Errorf("unsupported archive entry: %s", normalizedEntryPath)
	}
	if !isSupportedImagePath(normalizedEntryPath) {
		return "", "", fmt.Errorf("unsupported archive entry extension: %s", normalizedEntryPath)
	}

	return archivePath, normalizedEntryPath, nil
}

func findArchiveImageEntryFromCache(cacheEntry *archiveCacheEntry, entryPath string) (archiveEntry, error) {
	if cacheEntry.indexMap != nil {
		if file, ok := cacheEntry.indexMap[entryPath]; ok {
			if shouldIgnoreArchiveEntry(entryPath) {
				return archiveEntry{}, fmt.Errorf("unsupported archive entry: %s", entryPath)
			}
			if !isSupportedImagePath(entryPath) {
				return archiveEntry{}, fmt.Errorf("unsupported archive entry extension: %s", entryPath)
			}
			return archiveEntry{
				file:           file,
				normalizedPath: entryPath,
			}, nil
		}
	}
	return findArchiveImageEntry(cacheEntry.archive, entryPath)
}

func findArchiveImageEntry(archiveReader *zip.ReadCloser, entryPath string) (archiveEntry, error) {
	for _, file := range archiveReader.File {
		if file.FileInfo().IsDir() {
			continue
		}

		normalizedEntryPath, err := normalizeArchiveEntryPath(file.Name)
		if err != nil {
			return archiveEntry{}, fmt.Errorf("normalize archive entry path: %w", err)
		}
		if normalizedEntryPath != entryPath {
			continue
		}
		if shouldIgnoreArchiveEntry(normalizedEntryPath) {
			return archiveEntry{}, fmt.Errorf("unsupported archive entry: %s", normalizedEntryPath)
		}
		if !isSupportedImagePath(normalizedEntryPath) {
			return archiveEntry{}, fmt.Errorf("unsupported archive entry extension: %s", normalizedEntryPath)
		}

		return archiveEntry{
			file:           file,
			normalizedPath: normalizedEntryPath,
		}, nil
	}

	return archiveEntry{}, &os.PathError{
		Op:   "open archive entry",
		Path: entryPath,
		Err:  os.ErrNotExist,
	}
}

func collectArchiveImageEntries(archiveReader *zip.ReadCloser) ([]archiveEntry, error) {
	entries := make([]archiveEntry, 0, len(archiveReader.File))
	for _, file := range archiveReader.File {
		if file.FileInfo().IsDir() {
			continue
		}

		normalizedEntryPath, err := normalizeArchiveEntryPath(file.Name)
		if err != nil {
			return nil, fmt.Errorf("normalize archive entry path: %w", err)
		}
		if shouldIgnoreArchiveEntry(normalizedEntryPath) || !isSupportedImagePath(normalizedEntryPath) {
			continue
		}

		entries = append(entries, archiveEntry{
			file:           file,
			normalizedPath: normalizedEntryPath,
		})
	}

	return entries, nil
}

func normalizeArchiveEntryPath(entryPath string) (string, error) {
	if entryPath == "" || strings.Contains(entryPath, "\x00") {
		return "", fmt.Errorf("illegal archive entry path: %s", entryPath)
	}

	normalizedPath := strings.ReplaceAll(entryPath, "\\", "/")
	if strings.HasPrefix(normalizedPath, "/") {
		return "", fmt.Errorf("illegal archive entry path: %s", entryPath)
	}

	cleanedPath := path.Clean(normalizedPath)
	if cleanedPath == "." || cleanedPath == ".." || strings.HasPrefix(cleanedPath, "../") {
		return "", fmt.Errorf("illegal archive entry path: %s", entryPath)
	}

	return cleanedPath, nil
}

func shouldIgnoreArchiveEntry(entryPath string) bool {
	pathSegments := strings.Split(entryPath, "/")
	for _, segment := range pathSegments {
		if segment == "" || segment == "__MACOSX" || strings.HasPrefix(segment, ".") {
			return true
		}
	}
	return false
}

func relativePathWithinRoot(root string, targetPath string) (string, error) {
	resolvedRoot, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("abs output root: %w", err)
	}
	if symlinkResolvedRoot, symlinkErr := filepath.EvalSymlinks(resolvedRoot); symlinkErr == nil {
		resolvedRoot = cleanExtendedPath(symlinkResolvedRoot)
	} else {
		resolvedRoot = cleanExtendedPath(resolvedRoot)
	}

	resolvedTargetPath, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("abs file path: %w", err)
	}
	if symlinkResolvedTargetPath, symlinkErr := filepath.EvalSymlinks(resolvedTargetPath); symlinkErr == nil {
		resolvedTargetPath = cleanExtendedPath(symlinkResolvedTargetPath)
	} else {
		resolvedTargetPath = cleanExtendedPath(resolvedTargetPath)
	}

	relativePath, err := robustRel(resolvedRoot, resolvedTargetPath)
	if err != nil {
		return "", fmt.Errorf("derive asset relative path: %w", err)
	}

	relativePath = filepath.ToSlash(relativePath)
	if relativePath == "." || strings.HasPrefix(relativePath, "../") || strings.Contains(relativePath, "\x00") {
		return "", fmt.Errorf("illegal asset relative path: %s", relativePath)
	}

	return relativePath, nil
}

func resolveWithinRoot(root string, relativePath string) (string, error) {
	if relativePath == "" {
		return "", fmt.Errorf("empty relative path")
	}

	cleanedPath := filepath.Clean(relativePath)
	if cleanedPath == "." || filepath.IsAbs(cleanedPath) || strings.Contains(cleanedPath, "\x00") {
		return "", fmt.Errorf("illegal relative path: %s", relativePath)
	}

	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("abs root: %w", err)
	}
	absoluteTarget := filepath.Join(absoluteRoot, cleanedPath)
	absoluteTarget, err = filepath.Abs(absoluteTarget)
	if err != nil {
		return "", fmt.Errorf("abs target: %w", err)
	}

	resolvedRoot, err := filepath.EvalSymlinks(absoluteRoot)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		// Fallback to absolute path on Windows if EvalSymlinks fails (e.g. OneDrive)
		resolvedRoot = absoluteRoot
	}
	if resolvedRoot == "" {
		resolvedRoot = absoluteRoot
	} else {
		resolvedRoot = cleanExtendedPath(resolvedRoot)
	}

	resolvedTarget, err := filepath.EvalSymlinks(absoluteTarget)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		// Fallback
		resolvedTarget = absoluteTarget
	}
	if resolvedTarget == "" {
		resolvedTarget = filepath.Join(resolvedRoot, cleanedPath)
	} else {
		resolvedTarget = cleanExtendedPath(resolvedTarget)
	}

	relativeToRoot, err := robustRel(resolvedRoot, resolvedTarget)
	if err != nil {
		return "", fmt.Errorf("derive root-relative path: %w", err)
	}
	if relativeToRoot == "." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) || relativeToRoot == ".." {
		return "", fmt.Errorf("path escapes manga root")
	}

	return resolvedTarget, nil
}

func encodePathToken(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodePathToken(value string) (string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}

func encodeMangaID(relativePath string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(filepath.ToSlash(relativePath)))
}

func decodeMangaID(identifier string) (string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(identifier)
	if err != nil {
		return "", fmt.Errorf("decode manga id: %w", err)
	}
	return filepath.FromSlash(string(decoded)), nil
}

func inferChapterNumber(chapterDirName string) float64 {
	label := chapterDirName
	if dashIndex := strings.Index(label, " - "); dashIndex >= 0 {
		label = label[:dashIndex]
	}
	label = strings.ReplaceAll(label, "_", ".")

	for index := 0; index < len(label); index += 1 {
		if !isASCIIDigit(label[index]) {
			continue
		}

		end := index + 1
		for end < len(label) && isASCIIDigit(label[end]) {
			end++
		}
		if end < len(label) && label[end] == '.' {
			decimalEnd := end + 1
			for decimalEnd < len(label) && isASCIIDigit(label[decimalEnd]) {
				decimalEnd++
			}
			if decimalEnd > end+1 {
				end = decimalEnd
			}
		}

		value, err := strconv.ParseFloat(label[index:end], 64)
		if err == nil {
			return value
		}
	}

	return 0
}

func chapterLess(left chapterSource, right chapterSource) bool {
	if left.number != right.number {
		return left.number < right.number
	}
	if left.title != right.title {
		return naturalLess(left.title, right.title)
	}
	if left.id != right.id {
		return naturalLess(left.id, right.id)
	}
	return naturalLess(left.localPath, right.localPath)
}

func naturalLess(left string, right string) bool {
	leftIndex := 0
	rightIndex := 0

	for leftIndex < len(left) && rightIndex < len(right) {
		leftChar := left[leftIndex]
		rightChar := right[rightIndex]

		if isASCIIDigit(leftChar) && isASCIIDigit(rightChar) {
			leftEnd := leftIndex
			for leftEnd < len(left) && isASCIIDigit(left[leftEnd]) {
				leftEnd++
			}
			rightEnd := rightIndex
			for rightEnd < len(right) && isASCIIDigit(right[rightEnd]) {
				rightEnd++
			}

			leftNumStart := leftIndex
			for leftNumStart < leftEnd && left[leftNumStart] == '0' {
				leftNumStart++
			}
			rightNumStart := rightIndex
			for rightNumStart < rightEnd && right[rightNumStart] == '0' {
				rightNumStart++
			}

			leftLen := leftEnd - leftNumStart
			rightLen := rightEnd - rightNumStart

			if leftLen == 0 {
				leftLen = 1
				leftNumStart = leftEnd - 1
			}
			if rightLen == 0 {
				rightLen = 1
				rightNumStart = rightEnd - 1
			}

			if leftLen != rightLen {
				return leftLen < rightLen
			}

			leftNumber := left[leftNumStart:leftEnd]
			rightNumber := right[rightNumStart:rightEnd]
			if leftNumber != rightNumber {
				return leftNumber < rightNumber
			}

			leftRun := left[leftIndex:leftEnd]
			rightRun := right[rightIndex:rightEnd]
			if leftRun != rightRun {
				return leftRun < rightRun
			}

			leftIndex = leftEnd
			rightIndex = rightEnd
			continue
		}

		if leftChar != rightChar {
			return leftChar < rightChar
		}

		leftIndex++
		rightIndex++
	}

	if len(left) != len(right) {
		return len(left) < len(right)
	}

	return left < right
}

func resolveChapterDescriptors(dirPath string) ([]chapterSourceDescriptor, error) {
	hasImages, err := dirHasImages(dirPath)
	if err != nil {
		return nil, err
	}
	if hasImages {
		return []chapterSourceDescriptor{{
			kind: chapterSourceDirectory,
			path: dirPath,
			name: filepath.Base(dirPath),
		}}, nil
	}

	// Preserve directories with ComicInfo.xml as chapters even when
	// images live in child folders.
	if _, err := os.Stat(filepath.Join(dirPath, "ComicInfo.xml")); err == nil {
		return []chapterSourceDescriptor{{
			kind: chapterSourceDirectory,
			path: dirPath,
			name: filepath.Base(dirPath),
		}}, nil
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}
	var descriptors []chapterSourceDescriptor
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		subDir := filepath.Join(dirPath, entry.Name())
		ok, err := dirHasImages(subDir)
		if err != nil {
			return nil, err
		}
		if ok {
			descriptors = append(descriptors, chapterSourceDescriptor{
				kind: chapterSourceDirectory,
				path: subDir,
				name: entry.Name(),
			})
		}
	}
	return descriptors, nil
}

func dirHasImages(dir string) (bool, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		if !entry.IsDir() && isSupportedImagePath(entry.Name()) {
			return true, nil
		}
	}
	return false, nil
}

func isASCIIDigit(value byte) bool {
	return value >= '0' && value <= '9'
}

func isSupportedArchivePath(filePath string) bool {
	switch strings.ToLower(path.Ext(filepath.ToSlash(filePath))) {
	case ".zip", ".cbz":
		return true
	default:
		return false
	}
}

func contentTypeForImagePath(filePath string) string {
	contentType := mime.TypeByExtension(strings.ToLower(path.Ext(filePath)))
	if contentType == "" {
		return "application/octet-stream"
	}
	return contentType
}

func isSupportedImagePath(filePath string) bool {
	switch strings.ToLower(path.Ext(filepath.ToSlash(filePath))) {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif":
		return true
	default:
		return false
	}
}

func fileExists(filePath string) bool {
	info, err := os.Stat(filePath)
	return err == nil && !info.IsDir()
}

func cleanExtendedPath(p string) string {
	if strings.HasPrefix(p, `\\?\UNC\`) {
		return `\\` + p[8:]
	}
	if strings.HasPrefix(p, `\\?\`) && len(p) >= 6 && p[5] == ':' {
		return p[4:]
	}
	if strings.HasPrefix(p, `\??\`) && len(p) >= 6 && p[5] == ':' {
		return p[4:]
	}
	return p
}

func robustRel(base, targ string) (string, error) {
	rel, err := filepath.Rel(base, targ)
	if err == nil && !strings.HasPrefix(rel, "..") {
		return rel, nil
	}

	baseLower := strings.ToLower(base)
	targLower := strings.ToLower(targ)
	relLower, errLower := filepath.Rel(baseLower, targLower)
	if errLower == nil && !strings.HasPrefix(relLower, "..") {
		if strings.HasPrefix(targLower, baseLower) {
			prefixLen := len(base)
			if !strings.HasSuffix(baseLower, string(filepath.Separator)) {
				prefixLen++
			}
			if prefixLen <= len(targ) {
				return targ[prefixLen:], nil
			}
			return ".", nil
		}
	}

	return rel, err
}

// ApplyPinsAndSort applies pin statuses, updates collection covers if child mangas are pinned,
// and sorts items (pinned items first, followed by default sorting).
func ApplyPinsAndSort(items []contracts.LibraryManga, pins map[string]string) []contracts.LibraryManga {
	if len(items) == 0 {
		return []contracts.LibraryManga{}
	}

	result := make([]contracts.LibraryManga, len(items))
	copy(result, items)

	// 1. Assign pin status to each item
	for i := range result {
		if pinnedAt, ok := pins[result[i].ID]; ok {
			result[i].IsPinned = true
			result[i].PinnedAt = pinnedAt
		} else {
			result[i].IsPinned = false
			result[i].PinnedAt = ""
		}
	}

	// 2. Map collection children by ParentPath
	collChildren := make(map[string][]contracts.LibraryManga)
	for _, item := range result {
		if item.ParentPath != "" {
			collChildren[item.ParentPath] = append(collChildren[item.ParentPath], item)
		}
	}

	// 3. For each collection, check if any of its children are pinned.
	// If so, update the collection's cover to the top pinned child manga's cover.
	for i := range result {
		if result[i].IsCollection {
			children := collChildren[result[i].RelativePath]
			var pinnedChildren []contracts.LibraryManga
			for _, child := range children {
				if child.IsPinned {
					pinnedChildren = append(pinnedChildren, child)
				}
			}
			if len(pinnedChildren) > 0 {
				sort.SliceStable(pinnedChildren, func(ci, cj int) bool {
					if pinnedChildren[ci].PinnedAt != pinnedChildren[cj].PinnedAt {
						return pinnedChildren[ci].PinnedAt > pinnedChildren[cj].PinnedAt
					}
					return pinnedChildren[ci].LastUpdated > pinnedChildren[cj].LastUpdated
				})
				if pinnedChildren[0].CoverImageURL != "" {
					result[i].CoverImageURL = pinnedChildren[0].CoverImageURL
				}
			}
		}
	}

	// 4. Separate root items and child items for sorting
	var rootItems []contracts.LibraryManga
	collChildrenMap := make(map[string][]contracts.LibraryManga)
	for _, item := range result {
		if item.ParentPath == "" {
			rootItems = append(rootItems, item)
		} else {
			collChildrenMap[item.ParentPath] = append(collChildrenMap[item.ParentPath], item)
		}
	}

	// Sort root items: pinned first (by PinnedAt DESC), then by LastUpdated DESC
	sort.SliceStable(rootItems, func(i, j int) bool {
		if rootItems[i].IsPinned != rootItems[j].IsPinned {
			return rootItems[i].IsPinned
		}
		if rootItems[i].IsPinned && rootItems[j].IsPinned {
			if rootItems[i].PinnedAt != rootItems[j].PinnedAt {
				return rootItems[i].PinnedAt > rootItems[j].PinnedAt
			}
		}
		return rootItems[i].LastUpdated > rootItems[j].LastUpdated
	})

	// Sort each collection's children: pinned first (by PinnedAt DESC), then natural title order
	for parentPath := range collChildrenMap {
		children := collChildrenMap[parentPath]
		sort.SliceStable(children, func(i, j int) bool {
			if children[i].IsPinned != children[j].IsPinned {
				return children[i].IsPinned
			}
			if children[i].IsPinned && children[j].IsPinned {
				if children[i].PinnedAt != children[j].PinnedAt {
					return children[i].PinnedAt > children[j].PinnedAt
				}
			}
			return naturalLess(children[i].Title, children[j].Title)
		})
		collChildrenMap[parentPath] = children
	}

	// Combine rootItems and all children in order
	sortedResult := make([]contracts.LibraryManga, 0, len(result))
	sortedResult = append(sortedResult, rootItems...)
	for _, item := range rootItems {
		if item.IsCollection {
			if children, ok := collChildrenMap[item.RelativePath]; ok {
				sortedResult = append(sortedResult, children...)
				delete(collChildrenMap, item.RelativePath)
			}
		}
	}
	for _, children := range collChildrenMap {
		sortedResult = append(sortedResult, children...)
	}

	return sortedResult
}
