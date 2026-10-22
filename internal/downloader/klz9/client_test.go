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
