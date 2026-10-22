package downloader

import (
	"testing"
)

func TestCleanMangaTitle(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty input", "", ""},
		{"brackets-only title preserved by fallback", "【K】", "【K】"},
		{"only brackets and whitespace falls back to trimmed raw", " [  ] 【  】 ( ) ", "[  ] 【  】 ( )"},
		{"complex scanlation tags and volume", "[某某汉化组] 葬送的芙莉莲 第01卷 [修正版]", "葬送的芙莉莲"},
		{"tankobon prefix and volume", "【单行本】鬼灭之刃 Vol.01", "鬼灭之刃"},
		{"english chapter suffix", "Chainsaw Man Ch.1", "Chainsaw Man"},
		{"pure title untouched", "火影忍者", "火影忍者"},
		{"nested scanlation and chapter", "[OPFans] 海贼王 第1100话", "海贼王"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CleanMangaTitle(tt.input)
			if got != tt.expected {
				t.Errorf("CleanMangaTitle(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestLevenshteinSimilarity(t *testing.T) {
	// Adversarial boundaries: empty string, zero length
	if s := LevenshteinSimilarity("", ""); s != 1.0 {
		t.Errorf("expected 1.0 for two empty strings, got %f", s)
	}
	if s := LevenshteinSimilarity("海贼王", ""); s != 0.0 {
		t.Errorf("expected 0.0 for comparison with empty string, got %f", s)
	}
	if s := LevenshteinSimilarity("", "火影"); s != 0.0 {
		t.Errorf("expected 0.0 for comparison with empty string, got %f", s)
	}

	// Completely disjoint strings
	if s := LevenshteinSimilarity("海贼王", "鬼灭之刃"); s > 0.0 {
		t.Errorf("expected 0.0 for completely disjoint strings, got %f", s)
	}

	// Partial match range
	if s := LevenshteinSimilarity("葬送的芙莉莲", "芙莉莲"); s <= 0.0 || s >= 1.0 {
		t.Errorf("expected partial similarity between 0 and 1, got %f", s)
	}
}

func TestFormatChapterFilename(t *testing.T) {
	if got := FormatChapterFilename(1.0, "第01话", ".cbz"); got != "001 - 第01话.cbz" {
		t.Errorf("FormatChapterFilename(1.0) = %q, want %q", got, "001 - 第01话.cbz")
	}
	if got := FormatChapterFilename(1.5, "第01.5话", ".cbz"); got != "001.5 - 第01.5话.cbz" {
		t.Errorf("FormatChapterFilename(1.5) = %q, want %q", got, "001.5 - 第01.5话.cbz")
	}
	if got := FormatChapterFilename(0.0, "序章", ""); got != "000 - 序章" {
		t.Errorf("FormatChapterFilename(0.0) = %q, want %q", got, "000 - 序章")
	}
}

func TestMatchChapterTitle_Adversarial(t *testing.T) {
	// 1. Third-party non-standard prefix ("02 - 1.5话") matches online "第01.5话"
	if !MatchChapterTitle("第01.5话", "", "02 - 1.5话.cbz") {
		t.Errorf("expected '02 - 1.5话.cbz' to match online '第01.5话'")
	}

	// 2. Local title with scanlation tag matches clean online chapter
	if !MatchChapterTitle("第15话", "", "[汉化组] 015 - 第15话.cbz") {
		t.Errorf("expected scanlation-tagged path to match online chapter")
	}

	// 3. Online title with parenthetical tag matches clean local file
	if !MatchChapterTitle("第15话 (加笔修正)", "", "015 - 第15话.cbz") {
		t.Errorf("expected online title with bracketed note to match local clean chapter")
	}

	// 4. Adversarial: false positive prevention
	// Chapter 1 must NOT match Chapter 15 or Chapter 115
	if MatchChapterTitle("第1话", "", "015 - 第15话.cbz") {
		t.Errorf("false positive: Chapter 1 matched Chapter 15")
	}
	if MatchChapterTitle("1", "", "015 - 115.cbz") {
		t.Errorf("false positive: '1' matched '115'")
	}
	if MatchChapterTitle("15", "", "001 - 150.cbz") {
		t.Errorf("false positive: '15' matched '150'")
	}

	// 5. Adversarial: empty inputs
	if MatchChapterTitle("", "", "") {
		t.Errorf("expected false for all-empty inputs")
	}
	if MatchChapterTitle("第1话", "", "") {
		t.Errorf("expected false when local targets are empty")
	}
}
