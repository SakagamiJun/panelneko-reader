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
