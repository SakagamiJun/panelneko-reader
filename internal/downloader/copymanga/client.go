package copymanga

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/crypto"
)

const (
	SiteName           = "copymanga"
	DefaultAPIDomain   = "api.copy202601.com"
	UserAgent          = "COPY/3.0.0"
	DefaultTimeoutSecs = 15
	Salt               = 1729
)

var bufferPool = sync.Pool{
	New: func() any {
		b := make([]byte, 64*1024) // 64KB chunk buffer
		return &b
	},
}

var pageBufferPool = sync.Pool{
	New: func() any {
		b := make([]byte, 0, 256*1024) // 256KB buffer for atomic page buffering
		return bytes.NewBuffer(b)
	},
}

type CDNNode struct {
	Host         string
	Failures     atomic.Int32
	CoolingUntil atomic.Int64 // Unix timestamp in seconds
}

func (n *CDNNode) IsHealthy() bool {
	coolUntil := n.CoolingUntil.Load()
	if coolUntil > 0 {
		if time.Now().Unix() < coolUntil {
			return false
		}
		n.CoolingUntil.Store(0)
		n.Failures.Store(0)
	}
	return true
}

func (n *CDNNode) RecordFailure() {
	fails := n.Failures.Add(1)
	if fails >= 2 {
		// Cool down for 60 seconds
		n.CoolingUntil.Store(time.Now().Unix() + 60)
	}
}

func (n *CDNNode) RecordSuccess() {
	n.Failures.Store(0)
}

type AccountStore interface {
	GetCopyMangaAccounts() ([]contracts.CopyMangaAccount, error)
	SaveCopyMangaAccount(acc contracts.CopyMangaAccount) error
	UpdateCopyMangaAccountLimited(username string, limitedAt int64) error
	UpdateCopyMangaAccountToken(username string, token string, lastCheckedAt int64) error
	DeleteCopyMangaAccount(username string) error
}

type Client struct {
	httpClient          *http.Client
	imgClient           *http.Client
	apiDomain           string
	userConfiguredToken string
	userUsername        string
	userPasswordEnc     string
	userLimitedAt       int64
	token               string
	cdnMode             string // "official" | "striped"
	cdnNodes            []*CDNNode
	retryBackoffs       []time.Duration
	store               AccountStore
	accountLock         sync.Mutex
	lastReqTime         time.Time
	mu                  sync.RWMutex
}

func NewClient(apiDomain string, token string, timeoutSeconds int) *Client {
	if apiDomain == "" {
		apiDomain = DefaultAPIDomain
	}
	apiDomain = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(apiDomain), "https://"), "http://")
	apiDomain = strings.TrimRight(apiDomain, "/")

	if timeoutSeconds <= 0 {
		timeoutSeconds = DefaultTimeoutSecs
	}

	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
	}

	client := &Client{
		httpClient: &http.Client{
			Timeout:   time.Duration(timeoutSeconds) * time.Second,
			Transport: transport,
		},
		imgClient: &http.Client{
			Timeout:   time.Duration(timeoutSeconds*2) * time.Second,
			Transport: transport,
		},
		apiDomain:           apiDomain,
		userConfiguredToken: token,
		token:               token,
		cdnMode:             "official",
		cdnNodes: []*CDNNode{
			{Host: "c1.mangafunc.fun"},
			{Host: "c2.mangafunc.fun"},
			{Host: "c3.mangafunc.fun"},
			{Host: "c4.mangafunc.fun"},
		},
		retryBackoffs: []time.Duration{15 * time.Second, 30 * time.Second},
	}
	return client
}

func (c *Client) SetStore(s AccountStore) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store = s
}

func (c *Client) SetUserCredentials(username, encPassword string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.userUsername = username
	c.userPasswordEnc = encPassword
}

func (c *Client) LoginUser(ctx context.Context, username, password string) (string, error) {
	return c.loginWithAccount(ctx, username, password)
}

func (c *Client) SetRetryBackoffs(backoffs []time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.retryBackoffs = backoffs
}

func (c *Client) SetCDNSettings(mode string, customCDNs []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if mode != "striped" {
		c.cdnMode = "official"
	} else {
		c.cdnMode = "striped"
	}

	if len(customCDNs) > 0 {
		var nodes []*CDNNode
		for _, raw := range customCDNs {
			h := strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(raw), "https://"), "http://")
			h = strings.Trim(h, "/")
			if h != "" {
				nodes = append(nodes, &CDNNode{Host: h})
			}
		}
		if len(nodes) > 0 {
			c.cdnNodes = nodes
			return
		}
	}
	// fallback default striped nodes
	c.cdnNodes = []*CDNNode{
		{Host: "c1.mangafunc.fun"},
		{Host: "c2.mangafunc.fun"},
		{Host: "c3.mangafunc.fun"},
		{Host: "c4.mangafunc.fun"},
	}
}

func (c *Client) SetAPIDomain(domain string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if domain == "" {
		domain = DefaultAPIDomain
	}
	domain = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(domain), "https://"), "http://")
	c.apiDomain = strings.TrimRight(domain, "/")
}

func (c *Client) SetToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = strings.TrimSpace(token)
}

func (c *Client) getDomain() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.apiDomain
}

func (c *Client) getToken() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.token
}

func (c *Client) defaultHeaders(req *http.Request, explicitToken string) {
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("version", "2025.08.15")
	req.Header.Set("platform", "1")
	req.Header.Set("webp", "1")
	req.Header.Set("region", "1")

	tok := explicitToken
	if tok == "" {
		tok = c.getToken()
	}
	if tok != "" {
		req.Header.Set("authorization", "Token "+tok)
	}
}

type copyAPIResponse struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Results json.RawMessage `json:"results"`
}

func (c *Client) paceRequest(domain string) {
	if strings.HasPrefix(domain, "127.0.0.1") || strings.HasPrefix(domain, "localhost") {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	elapsed := time.Since(c.lastReqTime)
	if elapsed < 1500*time.Millisecond {
		time.Sleep(1500*time.Millisecond - elapsed)
	}
	c.lastReqTime = time.Now()
}

func (c *Client) getJSON(ctx context.Context, endpoint string, query url.Values, target any) error {
	domain := c.getDomain()
	c.paceRequest(domain)

	scheme := "https"
	if strings.HasPrefix(domain, "127.0.0.1") || strings.HasPrefix(domain, "localhost") {
		scheme = "http"
	}
	fullURL := fmt.Sprintf("%s://%s%s", scheme, domain, endpoint)
	if len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		token, username, err := c.acquireToken(ctx)
		if err != nil {
			return err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
		if err != nil {
			return err
		}
		c.defaultHeaders(req, token)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return err
		}

		if resp.StatusCode == 210 {
			_ = resp.Body.Close()
			c.markAccountLimited(username)
			lastErr = fmt.Errorf("risk control 210: account rate-limited")
			continue
		}

		if resp.StatusCode == 401 && username != "" {
			_ = resp.Body.Close()
			_, _ = c.lazyRefreshToken(ctx, username)
			lastErr = fmt.Errorf("token expired (401)")
			continue
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			return fmt.Errorf("copymanga api error status %d", resp.StatusCode)
		}

		var base copyAPIResponse
		err = json.NewDecoder(resp.Body).Decode(&base)
		_ = resp.Body.Close()
		if err != nil {
			return fmt.Errorf("decode copymanga response: %w", err)
		}
		if base.Code != 200 {
			return fmt.Errorf("copymanga api code %d: %s", base.Code, base.Message)
		}

		if target != nil && len(base.Results) > 0 {
			if err := json.Unmarshal(base.Results, target); err != nil {
				return fmt.Errorf("decode copymanga results: %w", err)
			}
		}
		return nil
	}

	return lastErr
}

type searchComicItem struct {
	Name     string `json:"name"`
	PathWord string `json:"path_word"`
	Author   []struct {
		Name string `json:"name"`
	} `json:"author"`
	Cover  string `json:"cover"`
	Brief  string `json:"brief"`
	Status struct {
		Value   int    `json:"value"`
		Display string `json:"display"`
	} `json:"status"`
	DatetimeUpdated string `json:"datetime_updated"`
}

type searchResultsData struct {
	List   []searchComicItem `json:"list"`
	Total  int               `json:"total"`
	Limit  int               `json:"limit"`
	Offset int               `json:"offset"`
}

func (c *Client) SearchManga(ctx context.Context, query string, page int, limit int) (contracts.OnlineSearchResult, error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit

	q := url.Values{}
	q.Set("q", strings.TrimSpace(query))
	q.Set("limit", strconv.Itoa(limit))
	q.Set("offset", strconv.Itoa(offset))
	q.Set("platform", "1")

	var data searchResultsData
	if err := c.getJSON(ctx, "/api/v3/search/comic", q, &data); err != nil {
		return contracts.OnlineSearchResult{}, err
	}

	items := make([]contracts.OnlineMangaItem, 0, len(data.List))
	for _, it := range data.List {
		authors := make([]string, 0, len(it.Author))
		for _, a := range it.Author {
			if strings.TrimSpace(a.Name) != "" {
				authors = append(authors, strings.TrimSpace(a.Name))
			}
		}

		statusStr := it.Status.Display
		if it.Status.Value == 0 {
			statusStr = "ongoing"
		} else if it.Status.Value == 1 {
			statusStr = "completed"
		}

		items = append(items, contracts.OnlineMangaItem{
			ID:          it.PathWord,
			Source:      SiteName,
			Title:       it.Name,
			Author:      strings.Join(authors, ", "),
			CoverURL:    it.Cover,
			Status:      statusStr,
			Description: it.Brief,
			UpdateTime:  it.DatetimeUpdated,
		})
	}

	totalPages := 1
	if data.Total > 0 && limit > 0 {
		totalPages = (data.Total + limit - 1) / limit
	}

	return contracts.OnlineSearchResult{
		Items:      items,
		TotalItems: data.Total,
		Page:       page,
		TotalPages: totalPages,
	}, nil
}

type comicDetailData struct {
	Comic struct {
		Name     string `json:"name"`
		PathWord string `json:"path_word"`
		Brief    string `json:"brief"`
		Cover    string `json:"cover"`
		Author   []struct {
			Name string `json:"name"`
		} `json:"author"`
	} `json:"comic"`
	Groups map[string]struct {
		Name     string `json:"name"`
		PathWord string `json:"path_word"`
	} `json:"groups"`
}

type chapterItemInList struct {
	UUID  string  `json:"uuid"`
	Name  string  `json:"name"`
	Index float64 `json:"index"`
}

type chaptersRespData struct {
	List  []chapterItemInList `json:"list"`
	Total int                 `json:"total"`
}

func (c *Client) GetMangaChapters(ctx context.Context, comicPathWord string) ([]contracts.OnlineMangaChapter, error) {
	q := url.Values{}
	q.Set("platform", "1")

	var detail comicDetailData
	if err := c.getJSON(ctx, "/api/v3/comic2/"+url.PathEscape(comicPathWord), q, &detail); err != nil {
		return nil, err
	}

	type groupTarget struct {
		pathWord string
		name     string
	}
	var targetGroups []groupTarget

	if len(detail.Groups) > 0 {
		if def, ok := detail.Groups["default"]; ok {
			name := def.Name
			if name == "" {
				name = "话"
			}
			targetGroups = append(targetGroups, groupTarget{pathWord: "default", name: name})
		}
		if tb, ok := detail.Groups["tankobon"]; ok {
			name := tb.Name
			if name == "" {
				name = "卷"
			}
			targetGroups = append(targetGroups, groupTarget{pathWord: "tankobon", name: name})
		}
		for k, v := range detail.Groups {
			if k != "default" && k != "tankobon" {
				name := v.Name
				if name == "" {
					name = k
				}
				targetGroups = append(targetGroups, groupTarget{pathWord: k, name: name})
			}
		}
	} else {
		targetGroups = append(targetGroups, groupTarget{pathWord: "default", name: "话"})
	}

	limit := 100
	var allChapters []contracts.OnlineMangaChapter

	for _, grp := range targetGroups {
		offset := 0
		for {
			cq := url.Values{}
			cq.Set("limit", strconv.Itoa(limit))
			cq.Set("offset", strconv.Itoa(offset))

			var chResp chaptersRespData
			err := c.getJSON(ctx, fmt.Sprintf("/api/v3/comic/%s/group/%s/chapters", url.PathEscape(comicPathWord), url.PathEscape(grp.pathWord)), cq, &chResp)
			if err != nil {
				return nil, err
			}

			for _, ch := range chResp.List {
				allChapters = append(allChapters, contracts.OnlineMangaChapter{
					ID:            ch.UUID,
					MangaID:       comicPathWord,
					Source:        SiteName,
					Title:         ch.Name,
					Number:        ch.Index,
					Group:         grp.name,
					GroupPathWord: grp.pathWord,
				})
			}

			offset += limit
			if offset >= chResp.Total || len(chResp.List) == 0 {
				break
			}
		}
	}

	return allChapters, nil
}

type chapterDetailData struct {
	Chapter struct {
		ComicPathWord string  `json:"comic_path_word"`
		Name          string  `json:"name"`
		Index         float64 `json:"index"`
		Words         []int   `json:"words"`
		Contents      []struct {
			URL string `json:"url"`
		} `json:"contents"`
	} `json:"chapter"`
}

func (c *Client) GetChapterImageURLs(ctx context.Context, comicPathWord, chapterUUID string) ([]string, error) {
	q := url.Values{}
	q.Set("platform", "1")

	var ch chapterDetailData
	err := c.getJSON(ctx, fmt.Sprintf("/api/v3/comic/%s/chapter2/%s", url.PathEscape(comicPathWord), url.PathEscape(chapterUUID)), q, &ch)
	if err != nil {
		return nil, err
	}

	urls := make([]string, 0, len(ch.Chapter.Contents))
	for _, item := range ch.Chapter.Contents {
		raw := strings.TrimSpace(item.URL)
		if raw != "" {
			// Upgrade default 800px preview resolution to 1500px high quality image
			hdURL := strings.ReplaceAll(raw, ".c800x.", ".c1500x.")
			urls = append(urls, hdURL)
		}
	}
	return urls, nil
}

func (c *Client) GetStripedCDNURL(originalURL string, pageIndex int) string {
	c.mu.RLock()
	mode := c.cdnMode
	nodes := c.cdnNodes
	c.mu.RUnlock()

	if mode != "striped" || len(nodes) == 0 {
		return originalURL
	}

	u, err := url.Parse(originalURL)
	if err != nil {
		return originalURL
	}

	healthyNodes := make([]*CDNNode, 0, len(nodes))
	for _, n := range nodes {
		if n.IsHealthy() {
			healthyNodes = append(healthyNodes, n)
		}
	}
	if len(healthyNodes) == 0 {
		healthyNodes = nodes // fallback to all
	}

	selected := healthyNodes[pageIndex%len(healthyNodes)]
	u.Host = selected.Host
	return u.String()
}

func (c *Client) RecordCDNResult(usedURL string, success bool) {
	u, err := url.Parse(usedURL)
	if err != nil {
		return
	}
	for _, n := range c.cdnNodes {
		if n.Host == u.Host {
			if success {
				n.RecordSuccess()
			} else {
				n.RecordFailure()
			}
			break
		}
	}
}

// DownloadImageStream downloads an image into writer with buffer pool and server-friendly in-stream retries
func (c *Client) DownloadImageStream(ctx context.Context, targetURL string, writer io.Writer) error {
	c.mu.RLock()
	backoffs := c.retryBackoffs
	if len(backoffs) == 0 {
		backoffs = []time.Duration{15 * time.Second, 30 * time.Second}
	}
	c.mu.RUnlock()

	maxAttempts := len(backoffs) + 1
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			backoff := backoffs[attempt-1]
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", UserAgent)
		req.Header.Set("Accept", "image/webp,image/apng,image/*,*/*;q=0.8")
		req.Header.Set("Referer", "https://copymanga.tv/")

		resp, err := c.imgClient.Do(req)
		if err != nil {
			c.RecordCDNResult(targetURL, false)
			lastErr = err
			continue
		}

		// Fail fast on 404 Not Found to avoid wasteful retries against missing assets
		if resp.StatusCode == http.StatusNotFound {
			_ = resp.Body.Close()
			return fmt.Errorf("image not found (404): %s", targetURL)
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			c.RecordCDNResult(targetURL, false)
			lastErr = fmt.Errorf("image fetch status %d", resp.StatusCode)
			continue
		}

		pageBuf := pageBufferPool.Get().(*bytes.Buffer)
		pageBuf.Reset()

		bufPtr := bufferPool.Get().(*[]byte)
		_, err = io.CopyBuffer(pageBuf, resp.Body, *bufPtr)
		bufferPool.Put(bufPtr)
		_ = resp.Body.Close()

		if err != nil {
			pageBufferPool.Put(pageBuf)
			c.RecordCDNResult(targetURL, false)
			lastErr = err
			continue
		}

		_, err = pageBuf.WriteTo(writer)
		pageBufferPool.Put(pageBuf)
		if err != nil {
			return err
		}

		c.RecordCDNResult(targetURL, true)
		return nil
	}

	return fmt.Errorf("download image failed after %d attempts: %w", maxAttempts, lastErr)
}

type ComicInfoXML struct {
	XMLName xml.Name `xml:"ComicInfo"`
	Title   string   `xml:"Title,omitempty"`
	Series  string   `xml:"Series,omitempty"`
	Number  string   `xml:"Number,omitempty"`
	Writer  string   `xml:"Writer,omitempty"`
	Summary string   `xml:"Summary,omitempty"`
	Pages   int      `xml:"PageCount,omitempty"`
}

func (c *Client) BuildComicInfoXML(series, title, writer, summary string, number float64, pageCount int) ([]byte, error) {
	numStr := fmt.Sprintf("%.1f", number)
	numStr = strings.TrimSuffix(numStr, ".0")

	info := ComicInfoXML{
		Title:   title,
		Series:  series,
		Number:  numStr,
		Writer:  writer,
		Summary: summary,
		Pages:   pageCount,
	}
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	enc := xml.NewEncoder(&buf)
	enc.Indent("", "  ")
	if err := enc.Encode(info); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// StreamSaveCBZ saves a list of image byte-producers directly into a .cbz archive atomically
func StreamSaveCBZ(finalFilePath string, xmlMetadata []byte, totalPages int, fetchImage func(ctx context.Context, pageIndex int, writer io.Writer) error) error {
	dir := filepath.Dir(finalFilePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}

	tmpPath := finalFilePath + ".tmp"
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("create tmp cbz: %w", err)
	}

	success := false
	defer func() {
		_ = tmpFile.Close()
		if !success {
			_ = os.Remove(tmpPath)
		}
	}()

	zipWriter := zip.NewWriter(tmpFile)

	// Write ComicInfo.xml if available
	if len(xmlMetadata) > 0 {
		metaEntry, err := zipWriter.Create("ComicInfo.xml")
		if err == nil {
			_, _ = metaEntry.Write(xmlMetadata)
		}
	}

	// Write images sequentially into zip
	for i := 0; i < totalPages; i++ {
		entryName := fmt.Sprintf("%03d.webp", i+1)
		entryWriter, err := zipWriter.Create(entryName)
		if err != nil {
			return fmt.Errorf("create zip entry %s: %w", entryName, err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		err = fetchImage(ctx, i, entryWriter)
		cancel()
		if err != nil {
			return fmt.Errorf("fetch page %d: %w", i+1, err)
		}
	}

	if err := zipWriter.Close(); err != nil {
		return fmt.Errorf("close zip writer: %w", err)
	}

	if err := tmpFile.Sync(); err != nil {
		return fmt.Errorf("sync tmp file: %w", err)
	}
	_ = tmpFile.Close()

	if err := os.Rename(tmpPath, finalFilePath); err != nil {
		return fmt.Errorf("rename tmp to cbz: %w", err)
	}

	success = true
	return nil
}

func (c *Client) loginWithAccount(ctx context.Context, username, password string) (string, error) {
	scheme := "https"
	domain := c.getDomain()
	if strings.HasPrefix(domain, "127.0.0.1") || strings.HasPrefix(domain, "localhost") {
		scheme = "http"
	}

	encodedPwd := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s-%d", password, Salt)))
	loginForm := url.Values{}
	loginForm.Set("username", username)
	loginForm.Set("password", encodedPwd)
	loginForm.Set("salt", strconv.Itoa(Salt))

	loginURL := fmt.Sprintf("%s://%s/api/v3/login", scheme, domain)
	lreq, err := http.NewRequestWithContext(ctx, http.MethodPost, loginURL, strings.NewReader(loginForm.Encode()))
	if err != nil {
		return "", err
	}
	lreq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	c.defaultHeaders(lreq, "")

	lresp, err := c.httpClient.Do(lreq)
	if err != nil {
		return "", err
	}
	defer lresp.Body.Close()

	var loginBase copyAPIResponse
	if err := json.NewDecoder(lresp.Body).Decode(&loginBase); err != nil {
		return "", err
	}

	var loginData struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(loginBase.Results, &loginData); err != nil {
		return "", err
	}

	if loginData.Token == "" {
		return "", fmt.Errorf("login failed: empty token")
	}

	return loginData.Token, nil
}

func (c *Client) registerAndSaveNewAccount(ctx context.Context) (contracts.CopyMangaAccount, error) {
	randNum := rand.Intn(90000) + 10000
	username := fmt.Sprintf("pneko%d", randNum)
	password := fmt.Sprintf("pwd%d", randNum)

	scheme := "https"
	domain := c.getDomain()
	if strings.HasPrefix(domain, "127.0.0.1") || strings.HasPrefix(domain, "localhost") {
		scheme = "http"
	}
	regURL := fmt.Sprintf("%s://%s/api/v3/register", scheme, domain)

	form := url.Values{}
	form.Set("username", username)
	form.Set("password", password)
	form.Set("source", "freeSite")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, regURL, strings.NewReader(form.Encode()))
	if err != nil {
		return contracts.CopyMangaAccount{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	c.defaultHeaders(req, "")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return contracts.CopyMangaAccount{}, err
	}
	_ = resp.Body.Close()

	token, err := c.loginWithAccount(ctx, username, password)
	if err != nil {
		return contracts.CopyMangaAccount{}, err
	}

	acc := contracts.CopyMangaAccount{
		Username:      username,
		Password:      password,
		Token:         token,
		LimitedAt:     0,
		LastCheckedAt: time.Now().Unix(),
	}

	if c.store != nil {
		_ = c.store.SaveCopyMangaAccount(acc)
	}

	return acc, nil
}

// RegisterTemporaryAccount allows generating a guest account if risk control 210 occurs
func (c *Client) RegisterTemporaryAccount(ctx context.Context) (string, error) {
	acc, err := c.registerAndSaveNewAccount(ctx)
	if err != nil {
		return "", err
	}
	c.SetToken(acc.Token)
	return acc.Token, nil
}

func (c *Client) acquireToken(ctx context.Context) (string, string, error) {
	c.mu.RLock()
	userToken := c.userConfiguredToken
	userUsername := c.userUsername
	userLimitedAt := c.userLimitedAt
	c.mu.RUnlock()

	now := time.Now().Unix()

	// 1. If personal account is configured, check if its 60s cooldown has passed
	if userToken != "" && (userLimitedAt == 0 || now-userLimitedAt > 60) {
		return userToken, userUsername, nil
	}

	c.accountLock.Lock()
	defer c.accountLock.Unlock()

	if c.store == nil {
		c.mu.RLock()
		tok := c.token
		c.mu.RUnlock()
		return tok, "", nil
	}

	accounts, err := c.store.GetCopyMangaAccounts()
	if err != nil {
		return "", "", err
	}

	// 2. Look for an available pool account whose 60s cooldown has passed
	for _, a := range accounts {
		if now-a.LimitedAt > 60 {
			return a.Token, a.Username, nil
		}
	}

	// 3. If no available account, and pool hasn't reached the 3-account cap:
	if len(accounts) < 3 {
		acc, err := c.registerAndSaveNewAccount(ctx)
		if err != nil {
			return "", "", err
		}
		return acc.Token, acc.Username, nil
	}

	// 4. Pool has reached the hard cap of 3 accounts. Do NOT register any new accounts!
	// Find the account that unfreezes earliest (including personal account if closer)
	earliestIdx := 0
	for i := 1; i < len(accounts); i++ {
		if accounts[i].LimitedAt < accounts[earliestIdx].LimitedAt {
			earliestIdx = i
		}
	}
	earliest := accounts[earliestIdx]
	earliestLimitedAt := earliest.LimitedAt
	tokenToReturn := earliest.Token
	usernameToReturn := earliest.Username

	if userToken != "" && userLimitedAt > 0 && userLimitedAt < earliestLimitedAt {
		earliestLimitedAt = userLimitedAt
		tokenToReturn = userToken
		usernameToReturn = userUsername
	}

	waitTime := time.Duration(60-(now-earliestLimitedAt)+1) * time.Second
	if waitTime < 1*time.Second {
		waitTime = 1 * time.Second
	} else if waitTime > 60*time.Second {
		waitTime = 60 * time.Second
	}

	select {
	case <-ctx.Done():
		return "", "", ctx.Err()
	case <-time.After(waitTime):
	}

	return tokenToReturn, usernameToReturn, nil
}

func (c *Client) markAccountLimited(username string) {
	c.mu.Lock()
	if c.userUsername != "" && c.userUsername == username {
		c.userLimitedAt = time.Now().Unix()
	}
	c.mu.Unlock()

	if c.store != nil && username != "" {
		_ = c.store.UpdateCopyMangaAccountLimited(username, time.Now().Unix())
	}
}

func (c *Client) lazyRefreshToken(ctx context.Context, username string) (string, error) {
	if username == "" {
		return "", nil
	}

	c.mu.RLock()
	isUserAcc := (c.userUsername != "" && c.userUsername == username)
	encPwd := c.userPasswordEnc
	c.mu.RUnlock()

	if isUserAcc && encPwd != "" {
		machineID := crypto.GetMachineID()
		plainPwd, err := crypto.DecryptPassword(encPwd, machineID, username)
		if err == nil && plainPwd != "" {
			newToken, err := c.loginWithAccount(ctx, username, plainPwd)
			if err == nil && newToken != "" {
				c.mu.Lock()
				c.userConfiguredToken = newToken
				c.token = newToken
				c.mu.Unlock()
				return newToken, nil
			}
		}
	}

	if c.store == nil {
		return "", nil
	}
	accounts, err := c.store.GetCopyMangaAccounts()
	if err != nil {
		return "", err
	}
	for _, a := range accounts {
		if a.Username == username {
			password := a.Password
			machineID := crypto.GetMachineID()
			if decrypted, decErr := crypto.DecryptPassword(password, machineID, username); decErr == nil && decrypted != "" {
				password = decrypted
			}
			newToken, err := c.loginWithAccount(ctx, a.Username, password)
			if err != nil {
				return "", err
			}
			_ = c.store.UpdateCopyMangaAccountToken(username, newToken, time.Now().Unix())
			return newToken, nil
		}
	}
	return "", fmt.Errorf("account not found: %s", username)
}
