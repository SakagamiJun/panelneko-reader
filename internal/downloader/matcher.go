package downloader

import (
	"fmt"
	"math"
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

		// 2. Substring containment check
		// (e.g. "31.1第31.1话机翻" contains "31.1话机翻")
		if len(onNorm) >= 3 && strings.Contains(locNorm, onNorm) {
			return true
		}
		if len(locNorm) >= 3 && strings.Contains(onNorm, locNorm) {
			return true
		}

		// 3. Extracted semantic chapter number check
		onNum := ExtractChapterNumber(onlineTitle, -1)
		locNum := ExtractChapterNumber(cand, -2)
		if onNum >= 0 && onNum == locNum {
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
