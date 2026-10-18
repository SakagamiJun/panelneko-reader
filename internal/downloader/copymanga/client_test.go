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
	"sync"
	"testing"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
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

func TestGetChapterImageURLsHighResReplacement(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v3/comic/one-piece/chapter2/ch1-uuid") {
			resp := copyAPIResponse{
				Code: 200,
			}
			data := chapterDetailData{}
			data.Chapter.Contents = []struct {
				URL string `json:"url"`
			}{
				{URL: "https://c1.mangafunc.fun/comic/op/001.c800x.webp"},
				{URL: "https://c1.mangafunc.fun/comic/op/002.webp"},
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

	urls, err := client.GetChapterImageURLs(context.Background(), "one-piece", "ch1-uuid")
	if err != nil {
		t.Fatalf("GetChapterImageURLs failed: %v", err)
	}
	if len(urls) != 2 {
		t.Fatalf("expected 2 urls, got %d", len(urls))
	}
	if urls[0] != "https://c1.mangafunc.fun/comic/op/001.c1500x.webp" {
		t.Errorf("expected .c1500x. in url, got %s", urls[0])
	}
	if urls[1] != "https://c1.mangafunc.fun/comic/op/002.webp" {
		t.Errorf("expected untouched url for non-c800x, got %s", urls[1])
	}
}

func TestDownloadImageStreamInStreamRetry(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			// First attempt fails with 502 Bad Gateway
			http.Error(w, "bad gateway", http.StatusBadGateway)
			return
		}
		// Second attempt succeeds
		w.Header().Set("Content-Type", "image/webp")
		_, _ = w.Write([]byte("valid-image-bytes"))
	}))
	defer server.Close()

	client := NewClient("example.com", "", 5)
	client.SetRetryBackoffs([]time.Duration{10 * time.Millisecond, 20 * time.Millisecond})

	var buf strings.Builder
	err := client.DownloadImageStream(context.Background(), server.URL, &buf)
	if err != nil {
		t.Fatalf("expected DownloadImageStream to succeed via in-stream retry, got: %v", err)
	}

	if attempts != 2 {
		t.Errorf("expected 2 attempts, got %d", attempts)
	}

	if buf.String() != "valid-image-bytes" {
		t.Errorf("expected 'valid-image-bytes', got %s", buf.String())
	}
}

type mockAccountStore struct {
	mu       sync.Mutex
	accounts []contracts.CopyMangaAccount
}

func (m *mockAccountStore) GetCopyMangaAccounts() ([]contracts.CopyMangaAccount, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	res := make([]contracts.CopyMangaAccount, len(m.accounts))
	copy(res, m.accounts)
	return res, nil
}

func (m *mockAccountStore) SaveCopyMangaAccount(acc contracts.CopyMangaAccount) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, a := range m.accounts {
		if a.Username == acc.Username {
			m.accounts[i] = acc
			return nil
		}
	}
	m.accounts = append(m.accounts, acc)
	return nil
}

func (m *mockAccountStore) UpdateCopyMangaAccountLimited(username string, limitedAt int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, a := range m.accounts {
		if a.Username == username {
			m.accounts[i].LimitedAt = limitedAt
			return nil
		}
	}
	return nil
}

func (m *mockAccountStore) UpdateCopyMangaAccountToken(username string, token string, lastCheckedAt int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, a := range m.accounts {
		if a.Username == username {
			m.accounts[i].Token = token
			m.accounts[i].LastCheckedAt = lastCheckedAt
			return nil
		}
	}
	return nil
}

func TestCopyMangaUserConfiguredTokenPrecedence(t *testing.T) {
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{
			{Username: "auto_user", Token: "auto_token", LimitedAt: 0},
		},
	}
	client := NewClient("127.0.0.1", "custom_user_token", 5)
	client.SetStore(mockStore)

	token, username, err := client.acquireToken(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "custom_user_token" {
		t.Errorf("expected custom_user_token, got %s", token)
	}
	if username != "" {
		t.Errorf("expected empty username for custom token, got %s", username)
	}
}

func TestCopyMangaAccountPoolRotationOn210(t *testing.T) {
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{
			{Username: "user1", Token: "token1", LimitedAt: 0},
			{Username: "user2", Token: "token2", LimitedAt: 0},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("authorization")
		if auth == "Token token1" {
			// Account 1 hits rate limit 210
			w.WriteHeader(210)
			_ = json.NewEncoder(w).Encode(copyAPIResponse{Code: 210, Message: "rate limit"})
			return
		}
		if auth == "Token token2" {
			// Account 2 succeeds
			data := searchResultsData{
				Total: 1,
				List: []searchComicItem{
					{Name: "Success Comic", PathWord: "success-comic"},
				},
			}
			raw, _ := json.Marshal(data)
			_ = json.NewEncoder(w).Encode(copyAPIResponse{Code: 200, Results: raw})
			return
		}
		http.Error(w, "unexpected token", http.StatusUnauthorized)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)
	client.SetStore(mockStore)

	res, err := client.SearchManga(context.Background(), "test", 1, 10)
	if err != nil {
		t.Fatalf("expected SearchManga to succeed after rotating to token2, got err: %v", err)
	}
	if len(res.Items) != 1 || res.Items[0].Title != "Success Comic" {
		t.Errorf("unexpected results: %+v", res)
	}

	// Verify user1 was marked limited in store
	accounts, _ := mockStore.GetCopyMangaAccounts()
	var user1 contracts.CopyMangaAccount
	for _, a := range accounts {
		if a.Username == "user1" {
			user1 = a
		}
	}
	if user1.LimitedAt == 0 {
		t.Errorf("expected user1 LimitedAt to be updated, got 0")
	}
}

func TestCopyMangaLazyRefreshTokenOn401(t *testing.T) {
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{
			{Username: "user1", Password: "pwd1", Token: "expired_token", LimitedAt: 0},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/login" {
			_ = json.NewEncoder(w).Encode(copyAPIResponse{
				Code:    200,
				Results: json.RawMessage(`{"token":"refreshed_fresh_token"}`),
			})
			return
		}

		if r.URL.Path == "/api/v3/search/comic" {
			auth := r.Header.Get("authorization")
			if auth == "Token expired_token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if auth == "Token refreshed_fresh_token" {
				data := searchResultsData{
					Total: 1,
					List: []searchComicItem{
						{Name: "Refreshed Manga", PathWord: "refreshed-manga"},
					},
				}
				raw, _ := json.Marshal(data)
				_ = json.NewEncoder(w).Encode(copyAPIResponse{Code: 200, Results: raw})
				return
			}
			http.Error(w, "unexpected token", http.StatusUnauthorized)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)
	client.SetStore(mockStore)

	res, err := client.SearchManga(context.Background(), "test", 1, 10)
	if err != nil {
		t.Fatalf("expected SearchManga to succeed after lazy token refresh, got: %v", err)
	}
	if len(res.Items) != 1 || res.Items[0].Title != "Refreshed Manga" {
		t.Errorf("unexpected results: %+v", res)
	}

	// Verify token updated in store
	accounts, _ := mockStore.GetCopyMangaAccounts()
	if len(accounts) != 1 || accounts[0].Token != "refreshed_fresh_token" {
		t.Errorf("expected token in store to be refreshed_fresh_token, got %+v", accounts)
	}
}

func TestCopyMangaAccountPoolMaxCapThree(t *testing.T) {
	now := time.Now().Unix()
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{
			{Username: "u1", Token: "tok1", LimitedAt: now - 30},
			{Username: "u2", Token: "tok2", LimitedAt: now - 40},
			{Username: "u3", Token: "tok3", LimitedAt: now - 50},
		},
	}

	client := NewClient("127.0.0.1", "", 5)
	client.SetStore(mockStore)

	// Since 3 accounts exist and all are within 60s cooldown,
	// acquireToken should NOT call registration.
	// We cancel context after 50ms and verify error is context canceled.
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, _, err := client.acquireToken(ctx)
	if err == nil {
		t.Fatalf("expected context timeout while waiting for cooldown")
	}

	// Store accounts count must still be strictly 3 (no 4th account registered!)
	accounts, _ := mockStore.GetCopyMangaAccounts()
	if len(accounts) != 3 {
		t.Errorf("expected strictly 3 accounts in pool, got %d", len(accounts))
	}
}
