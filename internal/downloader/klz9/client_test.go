package klz9

import (
	"testing"
)

func TestCalculateSignature(t *testing.T) {
	ts := "1730365200"
	secret := "test_secret_key"
	sig := calculateSignature(ts, secret)
	if sig == "" {
		t.Fatalf("expected signature, got empty")
	}

	// Signature for 1730365200.test_secret_key
	expected := "0ffaa1687688eedf1654c23c36f10bd23e2e6610f56a4509bc7d2c552f6fbc27"
	if sig != expected {
		t.Fatalf("expected %s, got %s", expected, sig)
	}
}

func TestExtractSiteProfile(t *testing.T) {
	bundleContent := `
		apiUrl:"https://example.com/api";
		const rr="KL9K40zaSyC9K40vOMLLbEcepIFBhUKXwELqxlwTEF";
		Array.isArray(t.pages)?a=t.pages.replace("old_cdn", "new_cdn"):null;
		const s=t.last_update;
		a=a.filter(i=>!["https://ad.com/banner.jpg"].includes(i)).map(x=>x);
	`
	profile := extractSiteProfile("https://example.com/assets/index-test.js", "index-test.js", bundleContent, "https://example.com")
	if profile.APIBase != "https://example.com/api" {
		t.Errorf("expected apiBase https://example.com/api, got %s", profile.APIBase)
	}
	if profile.SignatureSecret != "KL9K40zaSyC9K40vOMLLbEcepIFBhUKXwELqxlwTEF" {
		t.Errorf("expected secret KL9K40zaSyC9K40vOMLLbEcepIFBhUKXwELqxlwTEF, got %s", profile.SignatureSecret)
	}
	if len(profile.IgnorePageURLs) != 1 || profile.IgnorePageURLs[0] != "https://ad.com/banner.jpg" {
		t.Errorf("expected ignore URL https://ad.com/banner.jpg, got %v", profile.IgnorePageURLs)
	}
}

func TestGetStringAndFloat_Boundaries(t *testing.T) {
	m := map[string]any{
		"nilVal":   nil,
		"emptyStr": "   ",
		"intVal":   436091,
		"floatVal": float64(436091),
		"fracVal":  436091.5,
		"numStr":   "  12345  ",
	}

	if s := getString(m, "nonexistent"); s != "" {
		t.Errorf("expected empty string for nonexistent key, got %q", s)
	}
	if s := getString(m, "nilVal", "emptyStr", "floatVal"); s != "436091" {
		t.Errorf("expected 436091, got %q", s)
	}
	if s := getString(m, "fracVal"); s != "436091.5" {
		t.Errorf("expected 436091.5, got %q", s)
	}
	if s := getString(m, "numStr"); s != "12345" {
		t.Errorf("expected 12345, got %q", s)
	}

	if f := getFloat(m, "nonexistent"); f != 0 {
		t.Errorf("expected 0, got %v", f)
	}
	if f := getFloat(m, "nilVal", "floatVal"); f != 436091 {
		t.Errorf("expected 436091, got %v", f)
	}
	if f := getFloat(m, "numStr"); f != 12345 {
		t.Errorf("expected 12345, got %v", f)
	}
}

func TestExtractPageURLsFromPayload_EdgeCases(t *testing.T) {
	// Nil and empty payloads
	if res := extractPageURLsFromPayload(nil); res != nil {
		t.Errorf("expected nil for nil payload, got %v", res)
	}
	if res := extractPageURLsFromPayload(map[string]any{}); res != nil {
		t.Errorf("expected nil for empty payload, got %v", res)
	}

	// Content with \n\r, empty lines, and non-http noise
	payloadNewline := map[string]any{
		"content": "https://img.example.com/1.jpg\n\rhttps://img.example.com/2.jpg\r\n\njavascript:void(0)\nhttps://img.example.com/3.jpg\n",
	}
	urls := extractPageURLsFromPayload(payloadNewline)
	if len(urls) != 3 {
		t.Fatalf("expected 3 urls, got %d: %v", len(urls), urls)
	}
	if urls[0] != "https://img.example.com/1.jpg" || urls[1] != "https://img.example.com/2.jpg" || urls[2] != "https://img.example.com/3.jpg" {
		t.Fatalf("unexpected extracted urls: %v", urls)
	}

	// Content as JSON array string
	payloadJSON := map[string]any{
		"content": `["https://img.example.com/a.jpg", "https://img.example.com/b.jpg"]`,
	}
	urlsJSON := extractPageURLsFromPayload(payloadJSON)
	if len(urlsJSON) != 2 || urlsJSON[0] != "https://img.example.com/a.jpg" {
		t.Fatalf("unexpected extracted json urls: %v", urlsJSON)
	}

	// Pages as []any array
	payloadPages := map[string]any{
		"pages": []any{
			"https://img.example.com/p1.jpg",
			"",
			nil,
			"https://img.example.com/p2.jpg",
		},
	}
	urlsPages := extractPageURLsFromPayload(payloadPages)
	if len(urlsPages) != 2 || urlsPages[0] != "https://img.example.com/p1.jpg" || urlsPages[1] != "https://img.example.com/p2.jpg" {
		t.Fatalf("unexpected extracted pages urls: %v", urlsPages)
	}
}
