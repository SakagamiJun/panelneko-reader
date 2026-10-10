package klz9

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/store"
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

func TestSearchMangaAndChapters(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "klz9-test-*")
	if err != nil {
		t.Fatalf("create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbStore, err := store.Open(filepath.Join(tmpDir, "store"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dbStore.Close()

	// Pre-populate profile in DB to skip external HTML extraction
	_ = dbStore.SaveSiteProfile(contracts.SiteProfile{
		Site:            SiteName,
		BundleHash:      "test-bundle",
		APIBase:         "", // will be set dynamically by mock server
		SignatureSecret: "test_secret",
	})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ts := r.Header.Get("x-client-ts")
		sig := r.Header.Get("x-client-sig")
		if ts == "" || sig == "" {
			http.Error(w, "missing headers", http.StatusUnauthorized)
			return
		}

		if r.URL.Path == "/manga/list" {
			search := r.URL.Query().Get("search")
			if search != "frieren" {
				http.Error(w, "unexpected search query", http.StatusBadRequest)
				return
			}
			resp := map[string]any{
				"items": []any{
					map[string]any{
						"slug":      "frieren-slug",
						"name":      "Sousou no Frieren",
						"author":    "Yamada Kanehito",
						"thumbnail": "https://example.com/cover.jpg",
						"status":    "ongoing",
					},
				},
				"totalItems": 1,
				"totalPages": 1,
			}
			_ = json.NewEncoder(w).Encode(resp)
			return
		}

		if r.URL.Path == "/manga/slug/frieren-slug" {
			resp := map[string]any{
				"chapters": []any{
					map[string]any{
						"id":      "ch-1",
						"name":    "Chapter 1",
						"chapter": 1.0,
					},
					map[string]any{
						"id":      "ch-2",
						"name":    "Chapter 2",
						"chapter": 2.0,
					},
				},
			}
			_ = json.NewEncoder(w).Encode(resp)
			return
		}

		http.NotFound(w, r)
	}))
	defer server.Close()

	// Update cached profile with test server APIBase
	_ = dbStore.SaveSiteProfile(contracts.SiteProfile{
		Site:            SiteName,
		BundleHash:      "test-bundle",
		APIBase:         server.URL,
		SignatureSecret: "test_secret",
	})

	client := NewClient(dbStore, server.URL, 5)
	results, err := client.SearchManga(context.Background(), "frieren", 1, 20)
	if err != nil {
		t.Fatalf("SearchManga failed: %v", err)
	}
	if len(results.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(results.Items))
	}
	if results.Items[0].Title != "Sousou no Frieren" {
		t.Errorf("expected Sousou no Frieren, got %s", results.Items[0].Title)
	}

	chapters, err := client.GetMangaChapters(context.Background(), "frieren-slug")
	if err != nil {
		t.Fatalf("GetMangaChapters failed: %v", err)
	}
	if len(chapters) != 2 {
		t.Fatalf("expected 2 chapters, got %d", len(chapters))
	}
	// Chapters should be sorted desc by number
	if chapters[0].Number != 2.0 {
		t.Errorf("expected chapter 2 first, got %v", chapters[0].Number)
	}
}
