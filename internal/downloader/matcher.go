package downloader

import (
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	bracketTagRe  = regexp.MustCompile(`\[.*?\]|\(.*?\)|【.*?】|（.*?）|<.*?>`)
	volumeChRe    = regexp.MustCompile(`(?i)(第\s*\d+\s*[卷话回期册]|vol\s*\.?\s*\d+|ch\s*\.?\s*\d+|part\s*\.?\s*\d+).*$`)
	extraSpaceRe  = regexp.MustCompile(`\s+`)
	leadingZeroRe = regexp.MustCompile(`(?i)(^|[^\d])0+(\d+)`)
	extRe         = regexp.MustCompile(`(?i)\.(cbz|cbr|zip|rar|tar|pdf)$`)
)

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

// MatchChapterTitle returns true if the online chapter title corresponds to the local chapter title or path.
func MatchChapterTitle(onlineTitle, localTitle, localPath string) bool {
	onNorm := NormalizeChapterTitleForMatch(onlineTitle)
	if onNorm == "" {
		return false
	}

	if localTitle != "" {
		locNorm := NormalizeChapterTitleForMatch(localTitle)
		if locNorm != "" && locNorm == onNorm {
			return true
		}
	}

	if localPath != "" {
		pathNorm := NormalizeChapterTitleForMatch(filepath.Base(localPath))
		if pathNorm != "" && pathNorm == onNorm {
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
