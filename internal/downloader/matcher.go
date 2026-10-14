package downloader

import (
	"regexp"
	"strings"
)

var (
	bracketTagRe = regexp.MustCompile(`\[.*?\]|\(.*?\)|【.*?】|（.*?）|<.*?>`)
	volumeChRe   = regexp.MustCompile(`(?i)(第\s*\d+\s*[卷话回期册]|vol\s*\.?\s*\d+|ch\s*\.?\s*\d+|part\s*\.?\s*\d+).*$`)
	extraSpaceRe = regexp.MustCompile(`\s+`)
)

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
