package library

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"golang.org/x/image/draw"
	"golang.org/x/image/webp"
	"golang.org/x/sync/singleflight"
)

func init() {
	image.RegisterFormat("webp", "RIFF????WEBP", webp.Decode, webp.DecodeConfig)
}

const (
	// LibraryThumbnailPrefix identifies incoming requests for downscaled cover thumbnails.
	LibraryThumbnailPrefix = "/library-thumbnail/"

	// Thumbnail resolution and JPEG compression tiers:
	// Low: Width 400, Quality 78 (Fastest, minimal memory and disk footprint)
	ThumbnailWidthLow   = 400
	ThumbnailQualityLow = 78

	// Medium (Default): Width 640, Quality 84 (Balanced for 1080p/2K and 4K 6-column grid)
	ThumbnailWidthMed   = 640
	ThumbnailQualityMed = 84

	// High: Width 960, Quality 90 (Optimized for 4K 2x retina display and 4-column layout)
	ThumbnailWidthHigh   = 960
	ThumbnailQualityHigh = 90

	// Legacy backward compatibility constants
	DefaultThumbnailWidth = ThumbnailWidthLow
	ThumbnailQuality      = 82
)

// ResolveThumbnailParams returns the target width and JPEG quality for a given ThumbnailQuality tier.
func ResolveThumbnailParams(quality contracts.ThumbnailQuality) (targetWidth int, jpegQuality int) {
	switch quality {
	case contracts.ThumbnailQualityLow:
		return ThumbnailWidthLow, ThumbnailQualityLow
	case contracts.ThumbnailQualityHigh:
		return ThumbnailWidthHigh, ThumbnailQualityHigh
	case contracts.ThumbnailQualityMedium:
		fallthrough
	default:
		return ThumbnailWidthMed, ThumbnailQualityMed
	}
}

var (
	thumbSingleFlight singleflight.Group
	thumbSemaphore    = make(chan struct{}, 4)
)

// BuildThumbnailURL wraps an original library asset URL with the thumbnail prefix using default medium quality.
func BuildThumbnailURL(rawURL string) string {
	return BuildThumbnailURLWithQuality(rawURL, contracts.ThumbnailQualityMedium)
}

// BuildThumbnailURLWithQuality wraps an original library asset URL with the thumbnail prefix and quality query parameter.
func BuildThumbnailURLWithQuality(rawURL string, quality contracts.ThumbnailQuality) string {
	if rawURL == "" {
		return ""
	}
	clean := StripThumbnailURL(rawURL)
	prefix := LibraryThumbnailPrefix + strings.TrimPrefix(clean, "/")
	if quality == "" || quality == contracts.ThumbnailQualityOff {
		return prefix
	}
	return fmt.Sprintf("%s?q=%s", prefix, quality)
}

// StripThumbnailURL removes the thumbnail prefix and any query parameters, restoring the original asset path.
func StripThumbnailURL(thumbnailURL string) string {
	cleanURL := thumbnailURL
	if idx := strings.Index(cleanURL, "?"); idx != -1 {
		cleanURL = cleanURL[:idx]
	}
	if !strings.HasPrefix(cleanURL, LibraryThumbnailPrefix) {
		return cleanURL
	}
	return "/" + strings.TrimPrefix(cleanURL, LibraryThumbnailPrefix)
}

// GetThumbnailCacheSize calculates the total disk space in bytes consumed by thumbnail cache files.
func GetThumbnailCacheSize(cacheDir string) (int64, error) {
	var totalSize int64
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			if info, err := entry.Info(); err == nil {
				totalSize += info.Size()
			}
		}
	}
	return totalSize, nil
}

// ClearThumbnailCache deletes all cached thumbnail files from the cache directory.
func ClearThumbnailCache(cacheDir string) error {
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		_ = os.Remove(filepath.Join(cacheDir, entry.Name()))
	}
	return nil
}

func computeThumbnailCacheKey(sourcePath string, modTime time.Time, entryPath string, targetWidth int, quality int) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s:%d:%s:%d:%d", sourcePath, modTime.UnixNano(), entryPath, targetWidth, quality)
	return hex.EncodeToString(h.Sum(nil))[:32]
}

// ServeThumbnail handles thumbnail derivation, disk caching, and HTTP delivery.
// If enabled is false or generation fails, it transparently falls back to serving the original raw asset.
func ServeThumbnail(outputRoot string, cacheDir string, requestPath string, w http.ResponseWriter, r *http.Request, enabled bool) error {
	quality := contracts.ThumbnailQualityMedium
	if !enabled {
		quality = contracts.ThumbnailQualityOff
	}
	return ServeMultiSourceThumbnailWithQuality(map[string]string{"default": outputRoot}, outputRoot, cacheDir, requestPath, w, r, quality)
}

func ServeMultiSourceThumbnail(sourcesMap map[string]string, defaultRoot string, cacheDir string, requestPath string, w http.ResponseWriter, r *http.Request, enabled bool) error {
	quality := contracts.ThumbnailQualityMedium
	if !enabled {
		quality = contracts.ThumbnailQualityOff
	}
	return ServeMultiSourceThumbnailWithQuality(sourcesMap, defaultRoot, cacheDir, requestPath, w, r, quality)
}

func ServeMultiSourceThumbnailWithQuality(sourcesMap map[string]string, defaultRoot string, cacheDir string, requestPath string, w http.ResponseWriter, r *http.Request, quality contracts.ThumbnailQuality) error {
	if r != nil && r.URL != nil {
		if qParam := r.URL.Query().Get("q"); qParam != "" {
			quality = contracts.ThumbnailQuality(qParam)
		}
	}

	subPath := StripThumbnailURL(requestPath)

	if quality == contracts.ThumbnailQualityOff {
		return serveMultiSourceFallbackAsset(sourcesMap, defaultRoot, subPath, w, r)
	}

	isArchive := strings.HasPrefix(subPath, LibraryArchiveAssetPrefix)
	isFile := strings.HasPrefix(subPath, LibraryAssetPrefix)

	if !isArchive && !isFile {
		return fmt.Errorf("unsupported asset path for thumbnail: %s", subPath)
	}

	var sourcePath, entryPath string
	var modTime time.Time

	if isArchive {
		var err error
		sourcePath, entryPath, err = resolveMultiSourceArchiveAssetRequest(sourcesMap, defaultRoot, subPath)
		if err != nil {
			return err
		}
		info, err := os.Stat(sourcePath)
		if err != nil {
			return err
		}
		modTime = info.ModTime()
	} else {
		var err error
		sourcePath, err = ResolveMultiSourceAssetPath(sourcesMap, defaultRoot, subPath)
		if err != nil {
			return err
		}
		info, err := os.Stat(sourcePath)
		if err != nil {
			return err
		}
		modTime = info.ModTime()
	}

	targetWidth, jpegQuality := ResolveThumbnailParams(quality)
	cacheKey := computeThumbnailCacheKey(sourcePath, modTime, entryPath, targetWidth, jpegQuality)
	cachedFilePath := filepath.Join(cacheDir, cacheKey+".jpg")

	// 1. Fast path: cache file already exists on disk
	if fileExists(cachedFilePath) {
		serveCachedThumbnail(cachedFilePath, cacheKey, w, r)
		return nil
	}

	// 2. Slow path: singleflight deduplication and bounded concurrency generation
	_, err, _ := thumbSingleFlight.Do(cacheKey, func() (any, error) {
		// Double check if generated by another concurrent task
		if fileExists(cachedFilePath) {
			return nil, nil
		}

		thumbSemaphore <- struct{}{}
		defer func() { <-thumbSemaphore }()

		if err := os.MkdirAll(cacheDir, 0o755); err != nil {
			return nil, fmt.Errorf("create cache dir: %w", err)
		}

		var reader io.ReadCloser
		if isArchive {
			cacheEntry, err := acquireArchive(sourcePath)
			if err != nil {
				return nil, err
			}
			entry, err := findArchiveImageEntryFromCache(cacheEntry, entryPath)
			if err != nil {
				releaseArchive(cacheEntry)
				return nil, err
			}
			entryReader, err := entry.file.Open()
			if err != nil {
				releaseArchive(cacheEntry)
				return nil, err
			}
			reader = &archiveAssetReadCloser{
				entryReader: entryReader,
				cacheEntry:  cacheEntry,
			}
		} else {
			f, err := os.Open(sourcePath)
			if err != nil {
				return nil, err
			}
			reader = f
		}
		defer reader.Close()

		srcImg, _, err := image.Decode(reader)
		if err != nil {
			return nil, fmt.Errorf("decode image: %w", err)
		}

		bounds := srcImg.Bounds()
		srcW := bounds.Dx()
		srcH := bounds.Dy()
		if srcW <= 0 || srcH <= 0 {
			return nil, fmt.Errorf("invalid image bounds: %dx%d", srcW, srcH)
		}

		var finalImg image.Image = srcImg
		if srcW > targetWidth {
			targetW := targetWidth
			targetH := int(float64(srcH) * (float64(targetW) / float64(srcW)))
			if targetH <= 0 {
				targetH = 1
			}

			dstRGBA := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
			draw.CatmullRom.Scale(dstRGBA, dstRGBA.Bounds(), srcImg, bounds, draw.Over, nil)
			finalImg = dstRGBA
		}

		tmpFile, err := os.CreateTemp(cacheDir, "thumb-*.tmp")
		if err != nil {
			return nil, fmt.Errorf("create temp thumbnail: %w", err)
		}
		tmpPath := tmpFile.Name()

		bufWriter := bufio.NewWriter(tmpFile)
		jpegOpts := &jpeg.Options{Quality: jpegQuality}
		if err := jpeg.Encode(bufWriter, finalImg, jpegOpts); err != nil {
			_ = tmpFile.Close()
			_ = os.Remove(tmpPath)
			return nil, fmt.Errorf("encode jpeg: %w", err)
		}
		if err := bufWriter.Flush(); err != nil {
			_ = tmpFile.Close()
			_ = os.Remove(tmpPath)
			return nil, fmt.Errorf("flush temp thumbnail: %w", err)
		}
		if err := tmpFile.Close(); err != nil {
			_ = os.Remove(tmpPath)
			return nil, fmt.Errorf("close temp thumbnail: %w", err)
		}

		if err := os.Rename(tmpPath, cachedFilePath); err != nil {
			_ = os.Remove(tmpPath)
			return nil, fmt.Errorf("rename temp thumbnail: %w", err)
		}

		return nil, nil
	})

	if err != nil {
		return serveMultiSourceFallbackAsset(sourcesMap, defaultRoot, subPath, w, r)
	}

	if fileExists(cachedFilePath) {
		serveCachedThumbnail(cachedFilePath, cacheKey, w, r)
		return nil
	}

	return serveMultiSourceFallbackAsset(sourcesMap, defaultRoot, subPath, w, r)
}

func serveCachedThumbnail(cachedFilePath string, cacheKey string, w http.ResponseWriter, r *http.Request) {
	etag := fmt.Sprintf(`"%s"`, cacheKey)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("ETag", etag)

	if match := r.Header.Get("If-None-Match"); match != "" && match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	http.ServeFile(w, r, cachedFilePath)
}

func serveFallbackAsset(outputRoot string, subPath string, w http.ResponseWriter, r *http.Request) error {
	return serveMultiSourceFallbackAsset(map[string]string{"default": outputRoot}, outputRoot, subPath, w, r)
}

func serveMultiSourceFallbackAsset(sourcesMap map[string]string, defaultRoot string, subPath string, w http.ResponseWriter, r *http.Request) error {
	if strings.HasPrefix(subPath, LibraryArchiveAssetPrefix) {
		reader, contentType, contentLength, err := OpenMultiSourceArchiveAsset(sourcesMap, defaultRoot, subPath)
		if err != nil {
			return err
		}
		defer reader.Close()

		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		if contentLength >= 0 {
			w.Header().Set("Content-Length", fmt.Sprintf("%d", contentLength))
			etag := fmt.Sprintf(`"%x-%x"`, len(subPath), contentLength)
			w.Header().Set("ETag", etag)
			if match := r.Header.Get("If-None-Match"); match != "" && match == etag {
				w.WriteHeader(http.StatusNotModified)
				return nil
			}
		}

		_, err = CopyStream(w, reader)
		return err
	}

	targetPath, err := ResolveMultiSourceAssetPath(sourcesMap, defaultRoot, subPath)
	if err != nil {
		return err
	}

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, targetPath)
	return nil
}
