package copymanga

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
)

func TestCopyMangaCDNStripingAndCooling(t *testing.T) {
	client := NewClient("example.com", "", 5)
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

func TestReorderImageURLsByWords_Adversarial(t *testing.T) {
	urls := []string{"urlB", "urlD", "urlA", "urlC"}

	// 0-based valid permutation: B->1, D->3, A->0, C->2
	res0 := ReorderImageURLsByWords(urls, []int{1, 3, 0, 2})
	expected := []string{"urlA", "urlB", "urlC", "urlD"}
	for i, exp := range expected {
		if res0[i] != exp {
			t.Fatalf("0-based permutation mismatch at %d: got %s, want %s", i, res0[i], exp)
		}
	}

	// 1-based valid permutation: B->2, D->4, A->1, C->3
	res1 := ReorderImageURLsByWords(urls, []int{2, 4, 1, 3})
	for i, exp := range expected {
		if res1[i] != exp {
			t.Fatalf("1-based permutation mismatch at %d: got %s, want %s", i, res1[i], exp)
		}
	}

	// Adversarial: mismatched length
	shortWords := ReorderImageURLsByWords(urls, []int{1, 2})
	if shortWords[0] != "urlB" || len(shortWords) != 4 {
		t.Fatalf("expected untouched slice on mismatched words length")
	}

	// Adversarial: duplicate indices
	dupWords := ReorderImageURLsByWords(urls, []int{0, 1, 1, 2})
	if dupWords[0] != "urlB" {
		t.Fatalf("expected untouched slice on duplicate words")
	}

	// Adversarial: negative index
	negWords := ReorderImageURLsByWords(urls, []int{-1, 0, 1, 2})
	if negWords[0] != "urlB" {
		t.Fatalf("expected untouched slice on negative words")
	}

	// Adversarial: out-of-range index
	oorWords := ReorderImageURLsByWords(urls, []int{0, 1, 2, 99})
	if oorWords[0] != "urlB" {
		t.Fatalf("expected untouched slice on out of range words")
	}

	// Adversarial: empty
	if empty := ReorderImageURLsByWords(nil, nil); len(empty) != 0 {
		t.Fatalf("expected empty slice for nil inputs")
	}
}

func TestGetChapterImageURLs_WordsReorderIntegration(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := copyAPIResponse{Code: 200}
		data := chapterDetailData{}
		data.Chapter.Words = []int{1, 0}
		data.Chapter.Contents = []struct {
			URL string `json:"url"`
		}{
			{URL: "https://c1.mangafunc.fun/comic/op/second_page.webp"},
			{URL: "https://c1.mangafunc.fun/comic/op/first_page.webp"},
		}
		raw, _ := json.Marshal(data)
		resp.Results = raw
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)

	urls, err := client.GetChapterImageURLs(context.Background(), "one-piece", "ch-reorder")
	if err != nil {
		t.Fatalf("GetChapterImageURLs failed: %v", err)
	}
	if len(urls) != 2 {
		t.Fatalf("expected 2 urls, got %d", len(urls))
	}
	if urls[0] != "https://c1.mangafunc.fun/comic/op/first_page.webp" {
		t.Errorf("expected first_page at index 0 after reorder, got %s", urls[0])
	}
	if urls[1] != "https://c1.mangafunc.fun/comic/op/second_page.webp" {
		t.Errorf("expected second_page at index 1 after reorder, got %s", urls[1])
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

func (m *mockAccountStore) DeleteCopyMangaAccount(username string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	newList := make([]contracts.CopyMangaAccount, 0, len(m.accounts))
	for _, a := range m.accounts {
		if a.Username != username {
			newList = append(newList, a)
		}
	}
	m.accounts = newList
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

func TestCopyMangaSetUserTokenOverridesAndClears(t *testing.T) {
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{
			{Username: "auto_user", Token: "auto_token", LimitedAt: 0},
		},
	}
	client := NewClient("127.0.0.1", "", 5)
	client.SetStore(mockStore)

	client.SetUserToken("personal_token")
	token, username, err := client.acquireToken(context.Background())
	if err != nil {
		t.Fatalf("unexpected error after setting user token: %v", err)
	}
	if token != "personal_token" || username != "" {
		t.Fatalf("expected personal token with empty username, got token=%q username=%q", token, username)
	}

	client.SetUserToken("")
	token, username, err = client.acquireToken(context.Background())
	if err != nil {
		t.Fatalf("unexpected error after clearing user token: %v", err)
	}
	if token != "auto_token" || username != "auto_user" {
		t.Fatalf("expected fallback to account pool, got token=%q username=%q", token, username)
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

func TestCopyMangaConcurrentRegistrationPoolCap(t *testing.T) {
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/register" {
			_ = json.NewEncoder(w).Encode(copyAPIResponse{Code: 200, Message: "ok"})
			return
		}
		if r.URL.Path == "/api/v3/login" {
			_ = json.NewEncoder(w).Encode(copyAPIResponse{
				Code:    200,
				Results: json.RawMessage(`{"token":"registered_token"}`),
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)
	client.SetStore(mockStore)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tok, _, err := client.acquireToken(context.Background())
			if err != nil || tok == "" {
				t.Errorf("acquireToken failed: %v", err)
			}
		}()
	}
	wg.Wait()

	accounts, _ := mockStore.GetCopyMangaAccounts()
	if len(accounts) > 3 {
		t.Fatalf("expected at most 3 accounts in pool, got %d", len(accounts))
	}
	if len(accounts) == 0 {
		t.Fatalf("expected at least 1 account registered, got 0")
	}
}

func TestCopyMangaPersonalAccountRelayToPoolOn210(t *testing.T) {
	mockStore := &mockAccountStore{
		accounts: []contracts.CopyMangaAccount{
			{Username: "pool_user1", Token: "pool_token1", LimitedAt: 0},
		},
	}

	client := NewClient("127.0.0.1", "personal_token", 5)
	client.SetUserCredentials("personal_user", "enc_pwd")
	client.SetStore(mockStore)

	// Initially, acquireToken returns personal token
	tok, user, err := client.acquireToken(context.Background())
	if err != nil || tok != "personal_token" || user != "personal_user" {
		t.Fatalf("expected personal token initially, got: tok=%s user=%s err=%v", tok, user, err)
	}

	// Personal account hits 210
	client.markAccountLimited("personal_user")

	// Next acquireToken must smoothly relay to pool account!
	tok2, user2, err2 := client.acquireToken(context.Background())
	if err2 != nil || tok2 != "pool_token1" || user2 != "pool_user1" {
		t.Fatalf("expected pool token on personal cooldown, got: tok=%s user=%s err=%v", tok2, user2, err2)
	}
}

func TestCopyMangaGetMangaGroups(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v3/comic2/") {
			resp := copyAPIResponse{
				Code:    200,
				Message: "ok",
			}
			detail := comicDetailData{}
			detail.Comic.Name = "Test Manga"
			detail.Groups = map[string]struct {
				Name     string `json:"name"`
				PathWord string `json:"path_word"`
			}{
				"default":  {Name: "话", PathWord: "default"},
				"tankobon": {Name: "卷", PathWord: "tankobon"},
				"extra":    {Name: "番外篇", PathWord: "extra"},
			}
			raw, _ := json.Marshal(detail)
			resp.Results = raw
			_ = json.NewEncoder(w).Encode(resp)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)

	groups, err := client.GetMangaGroups(context.Background(), "test-manga")
	if err != nil {
		t.Fatalf("GetMangaGroups failed: %v", err)
	}
	if len(groups) != 3 {
		t.Fatalf("expected 3 groups, got %d: %+v", len(groups), groups)
	}
	// Check that real names "话", "卷", "番外篇" are present
	groupMap := make(map[string]bool)
	for _, g := range groups {
		groupMap[g] = true
	}
	if !groupMap["话"] || !groupMap["卷"] || !groupMap["番外篇"] {
		t.Fatalf("expected groups to contain 话, 卷, 番外篇, got %+v", groups)
	}
}

func TestCopyMangaGetMangaChaptersWithOrdered(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/api/v3/comic2/") {
			detail := comicDetailData{}
			detail.Comic.Name = "Test Manga"
			detail.Groups = map[string]struct {
				Name     string `json:"name"`
				PathWord string `json:"path_word"`
			}{
				"default": {Name: "话", PathWord: "default"},
			}
			raw, _ := json.Marshal(detail)
			_ = json.NewEncoder(w).Encode(copyAPIResponse{Code: 200, Message: "ok", Results: raw})
			return
		}
		if strings.Contains(r.URL.Path, "/group/default/chapters") {
			list := []map[string]any{
				{"uuid": "ch-1", "name": "第1话", "index": 0.0, "ordered": 10},
				{"uuid": "ch-1.5", "name": "第1.5话", "index": 1.0, "ordered": 15},
				{"uuid": "ch-0", "name": "第0话", "index": 2.0, "ordered": 0},
				{"uuid": "ch-fallback", "name": "第4话", "index": 4.0}, // no ordered field
			}
			data := map[string]any{
				"total": 4,
				"list":  list,
			}
			raw, _ := json.Marshal(data)
			_ = json.NewEncoder(w).Encode(copyAPIResponse{Code: 200, Message: "ok", Results: raw})
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	host := strings.TrimPrefix(server.URL, "http://")
	client := NewClient(host, "", 5)

	chapters, err := client.GetMangaChapters(context.Background(), "test-manga")
	if err != nil {
		t.Fatalf("GetMangaChapters failed: %v", err)
	}
	if len(chapters) != 4 {
		t.Fatalf("expected 4 chapters, got %d", len(chapters))
	}

	// ch-1: ordered=10 -> 1.0
	if chapters[0].Number != 1.0 || chapters[0].Ordered != 10 {
		t.Errorf("ch-1: expected Number=1.0 Ordered=10, got Number=%f Ordered=%d", chapters[0].Number, chapters[0].Ordered)
	}
	// ch-1.5: ordered=15 -> 1.5
	if chapters[1].Number != 1.5 || chapters[1].Ordered != 15 {
		t.Errorf("ch-1.5: expected Number=1.5 Ordered=15, got Number=%f Ordered=%d", chapters[1].Number, chapters[1].Ordered)
	}
	// ch-0: ordered=0 -> 0.0
	if chapters[2].Number != 0.0 || chapters[2].Ordered != 0 {
		t.Errorf("ch-0: expected Number=0.0 Ordered=0, got Number=%f Ordered=%d", chapters[2].Number, chapters[2].Ordered)
	}
	// ch-fallback: ordered nil -> fallback to index 4.0
	if chapters[3].Number != 4.0 || chapters[3].Ordered != 0 {
		t.Errorf("ch-fallback: expected Number=4.0 Ordered=0, got Number=%f Ordered=%d", chapters[3].Number, chapters[3].Ordered)
	}
}

func TestGenerateNaturalIDAndPassword(t *testing.T) {
	seenIDs := make(map[string]struct{}, 2000)

	for i := 0; i < 2000; i++ {
		id := generateNaturalID()
		if len(id) < 6 || len(id) > 20 {
			t.Fatalf("unexpected ID length: %d for ID: %s", len(id), id)
		}
		// Must start with letter
		if id[0] < 'a' || id[0] > 'z' {
			t.Fatalf("ID must start with a lowercase letter, got: %s", id)
		}
		// Strict check: pure lowercase alphanumeric only, NO symbols like _ -
		for _, ch := range id {
			if !((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
				t.Fatalf("ID contains illegal character %q in %s", ch, id)
			}
		}
		seenIDs[id] = struct{}{}

		pwd := generateRandomPassword()
		if len(pwd) != 12 {
			t.Fatalf("unexpected password length: %d", len(pwd))
		}
		for _, ch := range pwd {
			if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
				t.Fatalf("password contains illegal character %q in %s", ch, pwd)
			}
		}
	}

	// In 2000 samples, collision count should be virtually zero
	if len(seenIDs) < 1995 {
		t.Fatalf("high collision rate: got %d unique IDs out of 2000", len(seenIDs))
	}
}
