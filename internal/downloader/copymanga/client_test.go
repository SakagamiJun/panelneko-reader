package copymanga

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCopyMangaSearchAndStriping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/search/comic" {
			q := r.URL.Query().Get("q")
			if q != "onepiece" {
				http.Error(w, "invalid query", http.StatusBadRequest)
				return
			}
			resp := copyAPIResponse{
				Code: 200,
			}
			data := searchResultsData{
				Total: 1,
				List: []searchComicItem{
					{
						Name:     "One Piece",
						PathWord: "one-piece",
						Cover:    "https://cdn.example.com/cover.jpg",
						Brief:    "Luffy adventure",
						Status: struct {
							Value   int    `json:"value"`
							Display string `json:"display"`
						}{Value: 0, Display: "连载中"},
					},
				},
			}
			raw, _ := json.Marshal(data)
			resp.Results = raw
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)

	res, err := client.SearchManga(context.Background(), "onepiece", 1, 20)
	if err != nil {
		t.Fatalf("SearchManga failed: %v", err)
	}
	if len(res.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(res.Items))
	}
	if res.Items[0].Title != "One Piece" {
		t.Errorf("expected One Piece, got %s", res.Items[0].Title)
	}

	// Test CDN Striping
	origURL := "https://cdn.example.com/p1.webp"

	// Default is official route (no rewriting)
	if sOfficial := client.GetStripedCDNURL(origURL, 0); sOfficial != origURL {
		t.Errorf("expected official route to retain original url, got %s", sOfficial)
	}

	// Enable striped CDN mode
	client.SetCDNSettings("striped", nil)
	s1 := client.GetStripedCDNURL(origURL, 0)
	s2 := client.GetStripedCDNURL(origURL, 1)
	if s1 == s2 {
		t.Errorf("expected different striped CDN URLs for index 0 and 1, got %s and %s", s1, s2)
	}

	// Test Failure Record & Cooling
	client.RecordCDNResult(s1, false)
	client.RecordCDNResult(s1, false)
	// After 2 failures, s1 node should cool down
	s3 := client.GetStripedCDNURL(origURL, 0)
	if s3 == s1 {
		t.Errorf("expected node to cool down and select another node, got %s", s3)
	}
}

func TestStreamSaveCBZWithComicInfo(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "cbz-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	client := NewClient("", "", 5)
	xmlData, err := client.BuildComicInfoXML("One Piece", "Chapter 1", "Oda Eiichiro", "Great pirate era", 1.0, 3)
	if err != nil {
		t.Fatalf("build comicinfo xml: %v", err)
	}

	cbzPath := filepath.Join(tmpDir, "one_piece_001.cbz")
	err = StreamSaveCBZ(cbzPath, xmlData, 3, func(ctx context.Context, pageIndex int, writer io.Writer) error {
		// Mock image content
		content := fmt.Sprintf("fake_image_bytes_%d", pageIndex+1)
		_, wErr := writer.Write([]byte(content))
		return wErr
	})
	if err != nil {
		t.Fatalf("StreamSaveCBZ failed: %v", err)
	}

	// Read and verify zip content
	zr, err := zip.OpenReader(cbzPath)
	if err != nil {
		t.Fatalf("open cbz: %v", err)
	}
	defer zr.Close()

	if len(zr.File) != 4 { // 1 ComicInfo.xml + 3 pages
		t.Fatalf("expected 4 files in zip, got %d", len(zr.File))
	}

	hasComicInfo := false
	for _, f := range zr.File {
		if f.Name == "ComicInfo.xml" {
			hasComicInfo = true
			rc, _ := f.Open()
			body, _ := io.ReadAll(rc)
			rc.Close()
			if !strings.Contains(string(body), "Oda Eiichiro") {
				t.Errorf("expected Oda Eiichiro in ComicInfo.xml, got %s", string(body))
			}
		}
	}
	if !hasComicInfo {
		t.Fatalf("ComicInfo.xml was not created in cbz")
	}
}
