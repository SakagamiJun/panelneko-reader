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

func TestExtractChapterNumber(t *testing.T) {
	cases := []struct {
		input    string
		expected float64
	}{
		{"第31.1话机翻", 31.1},
		{"31.1 第31.1话机翻", 31.1},
		{"第01.5话", 1.5},
		{"02 - 1.5话.cbz", 1.5},
		{"Ch. 12", 12.0},
		{"Chapter 15.5", 15.5},
		{"#005", 5.0},
		{"特别篇", -1},
		{"", -1},
	}

	for _, tc := range cases {
		got := ExtractChapterNumber(tc.input, -1)
		if got != tc.expected {
			t.Errorf("ExtractChapterNumber(%q) = %f, want %f", tc.input, got, tc.expected)
		}
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
	// 0. User reported real-world case: local "31.1 第31.1话机翻" matches online "第31.1话机翻"
	if !MatchChapterTitle("第31.1话机翻", "", "31.1 第31.1话机翻.cbz") {
		t.Errorf("expected '31.1 第31.1话机翻.cbz' to match online '第31.1话机翻'")
	}
	if !MatchChapterTitle("第31.1话机翻", "31.1 第31.1话机翻", "") {
		t.Errorf("expected local title '31.1 第31.1话机翻' to match online '第31.1话机翻'")
	}
	if !MatchChapterTitle("第31.1话", "", "31.1 第31.1话机翻.cbz") {
		t.Errorf("expected '31.1 第31.1话机翻.cbz' to match online '第31.1话'")
	}

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
	// Substring digit boundary: Chapter 60 must NOT match Chapter 160
	if MatchChapterTitle("第60话", "160 第160话", "") {
		t.Errorf("false positive: '第60话' matched '160 第160话'")
	}
	if MatchChapterTitle("第1话", "161 第161话", "") {
		t.Errorf("false positive: '第1话' matched '161 第161话'")
	}
	if MatchChapterTitle("第10话", "212 - 第210话", "") {
		t.Errorf("false positive: '第10话' matched '212 - 第210话'")
	}
	if MatchChapterTitle("第11话", "213 - 第211话", "") {
		t.Errorf("false positive: '第11话' matched '213 - 第211话'")
	}
	// Genuine matches must still succeed
	if !MatchChapterTitle("第160话", "160 第160话", "") {
		t.Errorf("expected genuine match: '第160话' with '160 第160话'")
	}
	if !MatchChapterTitle("第196话", "198 - 第196话", "") {
		t.Errorf("expected genuine match: '第196话' with '198 - 第196话'")
	}

	// 5. Adversarial: empty inputs
	if MatchChapterTitle("", "", "") {
		t.Errorf("expected false for all-empty inputs")
	}
	if MatchChapterTitle("第1话", "", "") {
		t.Errorf("expected false when local targets are empty")
	}
}

func TestDetectExtensionFromURL_Adversarial(t *testing.T) {
	// Adversarial boundaries: empty, whitespace, malformed URLs
	if ext := DetectExtensionFromURL(""); ext != "" {
		t.Errorf("expected empty for empty string, got %q", ext)
	}
	if ext := DetectExtensionFromURL("   \n\t  "); ext != "" {
		t.Errorf("expected empty for whitespace, got %q", ext)
	}
	if ext := DetectExtensionFromURL("https://example.com/path/"); ext != "" {
		t.Errorf("expected empty for trailing slash, got %q", ext)
	}
	if ext := DetectExtensionFromURL("https://example.com/no-ext"); ext != "" {
		t.Errorf("expected empty for no extension, got %q", ext)
	}
	if ext := DetectExtensionFromURL("https://example.com/file.pdf"); ext != "" {
		t.Errorf("expected empty for non-image extension, got %q", ext)
	}

	// Query string and fragment masking
	if ext := DetectExtensionFromURL("https://example.com/001.c1500x.webp?fake=.jpg#fake=.png"); ext != ".webp" {
		t.Errorf("expected .webp, got %q", ext)
	}
	if ext := DetectExtensionFromURL("https://example.com/img_01.JPEG?v=2"); ext != ".jpg" {
		t.Errorf("expected .jpg for normalized .JPEG, got %q", ext)
	}
	if ext := DetectExtensionFromURL("https://example.com/photo.PNG"); ext != ".png" {
		t.Errorf("expected .png for .PNG, got %q", ext)
	}
}

func TestSniffImageExtension_Adversarial(t *testing.T) {
	// Adversarial slices: nil, 0-byte, 1-byte, 2-byte truncated (must not panic)
	if ext := SniffImageExtension(nil); ext != "" {
		t.Errorf("expected empty for nil, got %q", ext)
	}
	if ext := SniffImageExtension([]byte{}); ext != "" {
		t.Errorf("expected empty for empty slice, got %q", ext)
	}
	if ext := SniffImageExtension([]byte{0xFF}); ext != "" {
		t.Errorf("expected empty for 1-byte slice, got %q", ext)
	}
	if ext := SniffImageExtension([]byte{0xFF, 0xD8}); ext != "" {
		t.Errorf("expected empty for incomplete JPEG header, got %q", ext)
	}
	if ext := SniffImageExtension([]byte("RIFF1234")); ext != "" {
		t.Errorf("expected empty for incomplete WebP header, got %q", ext)
	}

	// Valid headers
	if ext := SniffImageExtension([]byte{0xFF, 0xD8, 0xFF, 0xE0}); ext != ".jpg" {
		t.Errorf("expected .jpg, got %q", ext)
	}
	if ext := SniffImageExtension([]byte("\x89PNG\r\n\x1a\n\x00\x00")); ext != ".png" {
		t.Errorf("expected .png, got %q", ext)
	}
	if ext := SniffImageExtension([]byte("RIFF\x00\x00\x00\x00WEBPVP8 ")); ext != ".webp" {
		t.Errorf("expected .webp, got %q", ext)
	}
}

func TestFormatPageFilename_Adversarial(t *testing.T) {
	if got := FormatPageFilename(1, ".jpg"); got != "001.jpg" {
		t.Errorf("expected 001.jpg, got %q", got)
	}
	if got := FormatPageFilename(25, "png"); got != "025.png" {
		t.Errorf("expected 025.png for dotless extension, got %q", got)
	}
	if got := FormatPageFilename(3, ""); got != "003.webp" {
		t.Errorf("expected 003.webp fallback for empty extension, got %q", got)
	}
}
