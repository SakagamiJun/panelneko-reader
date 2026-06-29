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
	"path"
	"path/filepath"
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
	kind chapterSourceKind
	path string
	name string
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

func getMangaModTime(mangaDir string, fallback int64) int64 {
	entries, err := os.ReadDir(mangaDir)
	if err != nil {
		return fallback
	}
	max := fallback
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
			mangaDir := filepath.Join(outputRoot, entry.Name())

			info, err := entry.Info()
			if err != nil {
				return
			}

			modTime := getMangaModTime(mangaDir, info.ModTime().UnixNano())

			if prevTime, ok := prevModTimes[entry.Name()]; ok && prevTime == modTime {
				if prevItem, ok := prevItems[entry.Name()]; ok {
					mu.Lock()
					items = append(items, prevItem)
					newModTimes[prevItem.ID] = modTime
					mu.Unlock()
					return
				}
			}

			manifest, err := loadMangaManifest(outputRoot, mangaDir, entry.Name())
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

	entry, err := findArchiveImageEntry(cacheEntry.archive, entryPath)
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

func loadMangaManifest(outputRoot string, mangaDir string, relativePath string) (mangaManifest, error) {
	chapterEntries, err := os.ReadDir(mangaDir)
	if err != nil {
		return mangaManifest{}, fmt.Errorf("read manga directory: %w", err)
	}

	descriptors := make([]chapterSourceDescriptor, 0, len(chapterEntries))
	for _, entry := range chapterEntries {
		switch {
		case entry.IsDir():
			resolved, err := resolveChapterDescriptors(filepath.Join(mangaDir, entry.Name()))
			if err != nil {
				return mangaManifest{}, fmt.Errorf("resolve chapters in %s: %w", entry.Name(), err)
			}
			descriptors = append(descriptors, resolved...)
		case isSupportedArchivePath(entry.Name()):
			descriptors = append(descriptors, chapterSourceDescriptor{
				kind: chapterSourceArchive,
				path: filepath.Join(mangaDir, entry.Name()),
				name: entry.Name(),
			})
		}
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
			Title:         filepath.Base(mangaDir),
			CoverImageURL: coverImageURL,
			TotalPages:    totalPages,
			Chapters:      readerChapters,
		},
	}, nil
}

func loadChapterSource(outputRoot string, descriptor chapterSourceDescriptor) (chapterSource, error) {
	switch descriptor.kind {
	case chapterSourceDirectory:
		return loadDirectoryChapterSource(outputRoot, descriptor.path)
	case chapterSourceArchive:
		return loadArchiveChapterSource(outputRoot, descriptor.path)
	default:
		return chapterSource{}, fmt.Errorf("unsupported chapter source type: %s", descriptor.kind)
	}
}

func loadDirectoryChapterSource(outputRoot string, chapterDir string) (chapterSource, error) {
	info, hasInfo := readComicInfoFromDir(chapterDir)

	baseName := filepath.Base(chapterDir)
	metadata := resolveChapterMetadata(baseName, info, hasInfo)
	if relToRoot, err := relativePathWithinRoot(outputRoot, chapterDir); err == nil {
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

func loadArchiveChapterSource(outputRoot string, archivePath string) (chapterSource, error) {
	cacheEntry, err := acquireArchive(archivePath)
	if err != nil {
		return chapterSource{}, fmt.Errorf("open chapter archive: %w", err)
	}
	defer releaseArchive(cacheEntry)
	archiveReader := cacheEntry.archive

	info, hasInfo := readComicInfoFromArchive(archiveReader)
	baseName := strings.TrimSuffix(filepath.Base(archivePath), filepath.Ext(archivePath))
	metadata := resolveChapterMetadata(baseName, info, hasInfo)
	if relToRoot, err := relativePathWithinRoot(outputRoot, archivePath); err == nil {
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
	path    string
	archive *zip.ReadCloser
	refs    int
	lastUse time.Time
	modTime time.Time
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

	entry := &archiveCacheEntry{
		path:    archivePath,
		archive: archiveReader,
		refs:    1,
		lastUse: time.Now(),
		modTime: modTime,
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
