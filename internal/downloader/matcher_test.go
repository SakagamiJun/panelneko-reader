package downloader

import (
	"testing"
)

func TestCleanMangaTitle(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"[某某汉化组] 葬送的芙莉莲 第01卷 [修正版]", "葬送的芙莉莲"},
		{"【单行本】鬼灭之刃 Vol.01", "鬼灭之刃"},
		{"Chainsaw Man Ch.1", "Chainsaw Man"},
		{"火影忍者", "火影忍者"},
		{"[OPFans] 海贼王 第1100话", "海贼王"},
	}

	for _, tt := range tests {
		got := CleanMangaTitle(tt.input)
		if got != tt.expected {
			t.Errorf("CleanMangaTitle(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestLevenshteinSimilarity(t *testing.T) {
	if s := LevenshteinSimilarity("葬送的芙莉莲", "葬送的芙莉莲"); s != 1.0 {
		t.Errorf("expected 1.0, got %f", s)
	}

	if s := LevenshteinSimilarity("葬送的芙莉莲", "芙莉莲"); s <= 0.0 || s >= 1.0 {
		t.Errorf("expected between 0 and 1, got %f", s)
	}
}
