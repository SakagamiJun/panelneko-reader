package downloader

import (
	"bytes"
	"fmt"
	"math"
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	bracketTagRe        = regexp.MustCompile(`\[.*?\]|\(.*?\)|【.*?】|（.*?）|<.*?>`)
	volumeChRe          = regexp.MustCompile(`(?i)(第\s*\d+\s*[卷话回期册]|vol\s*\.?\s*\d+|ch\s*\.?\s*\d+|part\s*\.?\s*\d+).*$`)
	extraSpaceRe        = regexp.MustCompile(`\s+`)
	leadingZeroRe       = regexp.MustCompile(`(?i)(^|[^\d])0+(\d+)`)
	extRe               = regexp.MustCompile(`(?i)\.(cbz|cbr|zip|rar|tar|pdf)$`)
	prefixIndexRe       = regexp.MustCompile(`^\[?\d+(?:\.\d+)?\]?\s*[-_.\s]\s*`)
	explicitChapterRe   = regexp.MustCompile(`(?i)(?:第|ch\.?\s*|chapter\s*|#)\s*(\d+(?:\.\d+)?)\s*(?:话|話|回|期|卷|集)?`)
	suffixChapterRe     = regexp.MustCompile(`(?i)(?:^|[^\d])(\d+(?:\.\d+)?)\s*(?:话|話|回|期|卷|集)`)
	leadingNumChapterRe = regexp.MustCompile(`(?i)^\[?(\d+(?:\.\d+)?)\]?\s*[-_.\s]`)
)

// ExtractChapterNumber parses the semantic chapter number from a title string.
// Returns fallback if no valid chapter number can be recognized.
func ExtractChapterNumber(title string, fallback float64) float64 {
	s := strings.TrimSpace(title)
	if s == "" {
		return fallback
	}

	if m := explicitChapterRe.FindStringSubmatch(s); len(m) > 1 {
		if val, err := strconv.ParseFloat(m[1], 64); err == nil {
			return val
		}
	}

	if m := suffixChapterRe.FindStringSubmatch(s); len(m) > 1 {
		if val, err := strconv.ParseFloat(m[1], 64); err == nil {
			return val
		}
	}

	if m := leadingNumChapterRe.FindStringSubmatch(s); len(m) > 1 {
		if val, err := strconv.ParseFloat(m[1], 64); err == nil {
			return val
		}
	}

	return fallback
}

// FormatChapterFilename generates clean, standard filenames supporting integer and decimal chapters.
// Example: 1.0 -> "001 - Title.cbz", 1.5 -> "001.5 - Title.cbz"
func FormatChapterFilename(chNum float64, safeTitle string, ext string) string {
	var numStr string
	if chNum == math.Trunc(chNum) {
		numStr = fmt.Sprintf("%03d", int(chNum))
	} else {
		numStr = fmt.Sprintf("%05.1f", chNum)
	}
	if ext != "" && !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	return fmt.Sprintf("%s - %s%s", numStr, safeTitle, ext)
}

var recognizedImageExts = map[string]string{
	".jpg":  ".jpg",
	".jpeg": ".jpg",
	".png":  ".png",
	".webp": ".webp",
	".gif":  ".gif",
	".avif": ".avif",
}

// DetectExtensionFromURL extracts a recognized normalized image extension from an image URL.
// Returns ".jpg", ".png", ".webp", ".gif", ".avif", or "" if unrecognized.
func DetectExtensionFromURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	var ext string
	if err == nil {
		ext = strings.ToLower(path.Ext(u.Path))
	} else {
		cleanURL := strings.SplitN(rawURL, "?", 2)[0]
		cleanURL = strings.SplitN(cleanURL, "#", 2)[0]
		ext = strings.ToLower(path.Ext(cleanURL))
	}
	if normExt, ok := recognizedImageExts[ext]; ok {
		return normExt
	}
	return ""
}

// SniffImageExtension detects the image format from the magic bytes of an image payload.
// Returns ".jpg", ".png", ".webp", ".gif", ".avif", or "" if unrecognized.
func SniffImageExtension(b []byte) string {
	if len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF {
		return ".jpg"
	}
	if len(b) >= 8 && bytes.Equal(b[:8], []byte("\x89PNG\r\n\x1a\n")) {
		return ".png"
	}
	if len(b) >= 12 && bytes.Equal(b[:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")) {
		return ".webp"
	}
	if len(b) >= 6 && (bytes.Equal(b[:6], []byte("GIF87a")) || bytes.Equal(b[:6], []byte("GIF89a"))) {
		return ".gif"
	}
	if len(b) >= 12 && bytes.Equal(b[4:8], []byte("ftyp")) && (bytes.Equal(b[8:12], []byte("avif")) || bytes.Equal(b[8:12], []byte("avis"))) {
		return ".avif"
	}
	return ""
}

// DetectImageExtension determines the appropriate file extension for an image,
// prioritizing the URL path extension, falling back to magic bytes sniffing, or returning a fallback.
func DetectImageExtension(rawURL string, header []byte, fallback string) string {
	if ext := DetectExtensionFromURL(rawURL); ext != "" {
		return ext
	}
	if ext := SniffImageExtension(header); ext != "" {
		return ext
	}
	if fallback != "" {
		if !strings.HasPrefix(fallback, ".") {
			return "." + fallback
		}
		return fallback
	}
	return ".webp"
}

// FormatPageFilename generates a 3-digit zero-padded filename with the given extension.
// Example: (1, ".jpg") -> "001.jpg"
func FormatPageFilename(pageIndex int, ext string) string {
	if ext == "" {
		ext = ".webp"
	} else if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	return fmt.Sprintf("%03d%s", pageIndex, ext)
}

// NormalizeChapterTitleForMatch cleans suffixes, extensions, dashes, brackets, and leading zeroes
// to yield a canonical comparable string for chapter title matching.
func NormalizeChapterTitleForMatch(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}

	// Strip file extension
	s = extRe.ReplaceAllString(s, "")

	// Extract title part after the last " - " delimiter (e.g. "001 - 第01话" -> "第01话")
	if dashIdx := strings.LastIndex(s, " - "); dashIdx >= 0 && dashIdx+3 < len(s) {
		s = s[dashIdx+3:]
	}

	// Remove leading order index prefix if present (e.g. "31.1 第31.1话机翻" -> "第31.1话机翻", "02_1.5话" -> "1.5话")
	s = prefixIndexRe.ReplaceAllString(s, "")

	// Remove scanlation brackets
	s = bracketTagRe.ReplaceAllString(s, "")

	// Normalize leading zeros in chapter indicators: e.g. 第01.5话 -> 第1.5话, #001 -> #1, 01.5 -> 1.5
	s = leadingZeroRe.ReplaceAllString(s, "${1}${2}")

	// Remove all whitespace
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ToLower(s)

	// Normalize prefix "第" (e.g. 第1.5话 -> 1.5话)
	s = strings.TrimPrefix(s, "第")

	return strings.TrimSpace(s)
}

func isASCIIDigitByte(b byte) bool {
	return b >= '0' && b <= '9'
}

// containsWordBounded checks if needle is contained in haystack without bleeding across digit boundaries.
// For instance, "60话" inside "160话" will fail because the '6' in needle is directly preceded by '1'.
func containsWordBounded(haystack, needle string) bool {
	if needle == "" || len(needle) > len(haystack) {
		return false
	}
	start := 0
	for {
		idx := strings.Index(haystack[start:], needle)
		if idx < 0 {
			return false
		}
		actualIdx := start + idx
		matchEnd := actualIdx + len(needle)

		leftOK := true
		if isASCIIDigitByte(needle[0]) && actualIdx > 0 && isASCIIDigitByte(haystack[actualIdx-1]) {
			leftOK = false
		}

		rightOK := true
		if isASCIIDigitByte(needle[len(needle)-1]) && matchEnd < len(haystack) && isASCIIDigitByte(haystack[matchEnd]) {
			rightOK = false
		}

		if leftOK && rightOK {
			return true
		}

		start = actualIdx + 1
		if start >= len(haystack) {
			return false
		}
	}
}

// MatchChapterTitle returns true if the online chapter title corresponds to the local chapter title or path.
func MatchChapterTitle(onlineTitle, localTitle, localPath string) bool {
	onNorm := NormalizeChapterTitleForMatch(onlineTitle)
	if onNorm == "" {
		return false
	}

	candidates := []string{localTitle, filepath.Base(localPath)}
	for _, cand := range candidates {
		cand = strings.TrimSpace(cand)
		if cand == "" {
			continue
		}

		locNorm := NormalizeChapterTitleForMatch(cand)
		if locNorm == "" {
			continue
		}

		// 1. Direct normalized equality (e.g. "31.1话机翻" == "31.1话机翻")
		if locNorm == onNorm {
			return true
		}

		// 2. Extracted semantic chapter number check
		onNum := ExtractChapterNumber(onlineTitle, -1)
		locNum := ExtractChapterNumber(cand, -2)
		if onNum >= 0 && locNum >= 0 {
			if onNum == locNum {
				return true
			}
			// If both titles explicitly contain recognized chapter numbers and they differ,
			// they are definitively different chapters; never allow substring check to confuse them.
			continue
		}

		// 3. Substring containment check with digit boundary safety
		// Only applied when at least one side does not have a conflicting explicit number
		if len(onNorm) >= 3 && containsWordBounded(locNorm, onNorm) {
			return true
		}
		if len(locNorm) >= 3 && containsWordBounded(onNorm, locNorm) {
			return true
		}
	}

	return false
}

// CleanMangaTitle cleans common release group prefixes, brackets, volume/chapter suffixes,
// returning the clean core series title for search matching.
func CleanMangaTitle(raw string) string {
	cleaned := bracketTagRe.ReplaceAllString(raw, " ")
	cleaned = volumeChRe.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)
	cleaned = extraSpaceRe.ReplaceAllString(cleaned, " ")

	if cleaned == "" {
		// Fallback to raw string without brackets
		cleaned = strings.TrimSpace(bracketTagRe.ReplaceAllString(raw, " "))
	}
	if cleaned == "" {
		cleaned = strings.TrimSpace(raw)
	}
	return cleaned
}

// LevenshteinSimilarity returns a score between 0.0 and 1.0 comparing s1 and s2.
func LevenshteinSimilarity(s1, s2 string) float64 {
	s1 = strings.ToLower(strings.TrimSpace(s1))
	s2 = strings.ToLower(strings.TrimSpace(s2))

	if s1 == s2 {
		return 1.0
	}
	if s1 == "" || s2 == "" {
		return 0.0
	}

	r1 := []rune(s1)
	r2 := []rune(s2)
	l1 := len(r1)
	l2 := len(r2)

	if l1 == 0 || l2 == 0 {
		return 0.0
	}

	prev := make([]int, l2+1)
	curr := make([]int, l2+1)

	for j := 0; j <= l2; j++ {
		prev[j] = j
	}

	for i := 1; i <= l1; i++ {
		curr[0] = i
		for j := 1; j <= l2; j++ {
			cost := 1
			if r1[i-1] == r2[j-1] {
				cost = 0
			}
			deletion := prev[j] + 1
			insertion := curr[j-1] + 1
			substitution := prev[j-1] + cost

			min := deletion
			if insertion < min {
				min = insertion
			}
			if substitution < min {
				min = substitution
			}
			curr[j] = min
		}
		copy(prev, curr)
	}

	dist := prev[l2]
	maxLen := l1
	if l2 > maxLen {
		maxLen = l2
	}
	return 1.0 - float64(dist)/float64(maxLen)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
