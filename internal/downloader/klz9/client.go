package klz9

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/store"
	"golang.org/x/net/html"
)

const (
	SiteName       = "klz9"
	DefaultBaseURL = "https://klz9.com"
	UserAgent      = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 PanelNeko/1.0"
	DefaultSecret  = "KL9K40zaSyC9K40vOMLLbEcepIFBhUKXwELqxlwTEF"
)

var (
	apiBaseRe        = regexp.MustCompile(`apiUrl:"([^"]+)"`)
	secretReDirect   = regexp.MustCompile(`const\s+rr\s*=\s*"([^"]+)"`)
	secretReAnchor   = regexp.MustCompile(`\$\{t\}\.([a-zA-Z0-9_$]+)`)
	ignoreListRe     = regexp.MustCompile(`a=a\.filter\(i=>!\[(.*?)\]\.includes\(i\)\)\.map`)
	rewriteSegmentRe = regexp.MustCompile(`\.replace\("([^"]+)","([^"]+)"\)`)
)

type Client struct {
	store      *store.SQLiteStore
	httpClient *http.Client
	baseURL    string
	mu         sync.RWMutex
	cached     *contracts.SiteProfile
}

func NewClient(store *store.SQLiteStore, baseURL string, timeoutSeconds int) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")

	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}

	return &Client{
		store: store,
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
		baseURL: baseURL,
	}
}

func (c *Client) SetBaseURL(baseURL string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	c.baseURL = strings.TrimRight(baseURL, "/")
}

func (c *Client) GetProfile(ctx context.Context, forceRefresh bool) (contracts.SiteProfile, error) {
	c.mu.RLock()
	if !forceRefresh && c.cached != nil && c.cached.APIBase != "" && c.cached.SignatureSecret != "" {
		p := *c.cached
		c.mu.RUnlock()
		return p, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	if !forceRefresh {
		if p, found, err := c.store.GetLatestSiteProfile(SiteName); err == nil && found && p.APIBase != "" && p.SignatureSecret != "" {
			c.cached = &p
			return p, nil
		}
	}

	profile, err := c.fetchAndExtractProfile(ctx)
	if err != nil {
		if c.cached != nil {
			return *c.cached, nil
		}
		profile = contracts.SiteProfile{
			Site:            SiteName,
			APIBase:         c.baseURL + "/api",
			SignatureSecret: DefaultSecret,
			SignatureMode:   "sha256(ts + \".\" + secret)",
			ExtractedAt:     time.Now().UTC().Format(time.RFC3339),
		}
	}

	_ = c.store.SaveSiteProfile(profile)
	c.cached = &profile
	return profile, nil
}

func (c *Client) fetchAndExtractProfile(ctx context.Context) (contracts.SiteProfile, error) {
	htmlContent, err := c.fetchText(ctx, c.baseURL)
	if err != nil {
		return contracts.SiteProfile{}, fmt.Errorf("fetch homepage %s: %w", c.baseURL, err)
	}

	bundleURL, bundleHash, err := extractBundleURLFromHTML(c.baseURL, htmlContent)
	if err != nil {
		return contracts.SiteProfile{}, err
	}

	bundleContent, err := c.fetchText(ctx, bundleURL)
	if err != nil {
		return contracts.SiteProfile{}, fmt.Errorf("fetch bundle %s: %w", bundleURL, err)
	}

	profile := extractSiteProfile(bundleURL, bundleHash, bundleContent, c.baseURL)
	return profile, nil
}

func extractBundleURLFromHTML(baseURLStr string, htmlContent string) (string, string, error) {
	pageURL, err := url.Parse(baseURLStr)
	if err != nil {
		return "", "", fmt.Errorf("parse base url: %w", err)
	}

	root, err := html.Parse(strings.NewReader(htmlContent))
	if err == nil {
		var walk func(*html.Node) string
		walk = func(node *html.Node) string {
			if node.Type == html.ElementNode && node.Data == "script" {
				for _, attribute := range node.Attr {
					if attribute.Key == "src" && (strings.Contains(attribute.Val, "/assets/index-") || strings.Contains(attribute.Val, "/assets/main-")) && strings.Contains(attribute.Val, ".js") {
						return attribute.Val
					}
				}
			}
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				if match := walk(child); match != "" {
					return match
				}
			}
			return ""
		}

		if match := walk(root); match != "" {
			resolved := pageURL.ResolveReference(&url.URL{Path: match})
			return resolved.String(), path.Base(match), nil
		}
	}

	re := regexp.MustCompile(`/assets/(?:index|main)-[^"']+\.js`)
	if match := re.FindString(htmlContent); match != "" {
		resolved := pageURL.ResolveReference(&url.URL{Path: match})
		return resolved.String(), path.Base(match), nil
	}

	return "", "", fmt.Errorf("unable to locate main bundle script in html")
}

func extractSiteProfile(bundleURL, bundleHash, bundleContent, fallbackBase string) contracts.SiteProfile {
	apiBase := ""
	if m := apiBaseRe.FindStringSubmatch(bundleContent); len(m) > 1 {
		apiBase = m[1]
	}
	if apiBase == "" {
		apiBase = strings.TrimRight(fallbackBase, "/") + "/api"
	}

	secret := ""
	if m := secretReDirect.FindStringSubmatch(bundleContent); len(m) > 1 {
		secret = m[1]
	}

	if secret == "" {
		if anchorMatch := secretReAnchor.FindStringSubmatch(bundleContent); len(anchorMatch) > 1 {
			varName := anchorMatch[1]
			varRe := regexp.MustCompile(fmt.Sprintf(`const\s+%s\s*=\s*"([^"]+)"`, regexp.QuoteMeta(varName)))
			if vm := varRe.FindStringSubmatch(bundleContent); len(vm) > 1 {
				secret = vm[1]
			}
		}
	}

	if secret == "" {
		secret = DefaultSecret
	}

	rewriteMap := extractRewriteMap(bundleContent)
	ignoreURLs := extractIgnoreURLs(bundleContent)

	return contracts.SiteProfile{
		Site:             SiteName,
		BundleURL:        bundleURL,
		BundleHash:       bundleHash,
		APIBase:          apiBase,
		SignatureSecret:  secret,
		SignatureMode:    "sha256(ts + \".\" + secret)",
		ImageHostRewrite: rewriteMap,
		IgnorePageURLs:   ignoreURLs,
		ExtractedAt:      time.Now().UTC().Format(time.RFC3339),
	}
}

func extractRewriteMap(bundleContent string) map[string]string {
	rewriteSegment := bundleContent
	if start := strings.Index(bundleContent, `Array.isArray(t.pages)?a=t.pages`); start >= 0 {
		if end := strings.Index(bundleContent[start:], `const s=t.last_update`); end >= 0 {
			rewriteSegment = bundleContent[start : start+end]
		}
	}

	pairs := rewriteSegmentRe.FindAllStringSubmatch(rewriteSegment, -1)
	if len(pairs) == 0 {
		return nil
	}

	raw := make(map[string]string)
	order := make([]string, 0, len(pairs))
	for _, pair := range pairs {
		if len(pair) < 3 {
			continue
		}
		raw[pair[1]] = pair[2]
		order = append(order, pair[1])
	}

	resolve := func(source string) string {
		seen := map[string]struct{}{}
		current := source
		target, ok := raw[current]
		for ok {
			if _, exists := seen[current]; exists {
				return target
			}
			seen[current] = struct{}{}
			next, nextExists := raw[target]
			if !nextExists {
				return target
			}
			current = target
			target = next
			ok = true
		}
		return raw[source]
	}

	finalMap := make(map[string]string, len(raw))
	for _, source := range order {
		finalMap[source] = resolve(source)
	}
	return finalMap
}

func extractIgnoreURLs(bundleContent string) []string {
	match := ignoreListRe.FindStringSubmatch(bundleContent)
	if len(match) < 2 {
		return nil
	}

	var ignore []string
	for _, item := range strings.Split(match[1], ",") {
		trimmed := strings.Trim(item, `"' `)
		if trimmed != "" {
			ignore = append(ignore, trimmed)
		}
	}
	return ignore
}

func (c *Client) fetchText(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "text/html,application/javascript,application/json;q=0.9,*/*;q=0.8")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("http %d for %s", resp.StatusCode, rawURL)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (c *Client) fetchSignedJSON(ctx context.Context, endpoint string) (map[string]any, error) {
	profile, err := c.GetProfile(ctx, false)
	if err != nil {
		return nil, err
	}

	payload, err := c.doSignedRequest(ctx, profile, endpoint)
	if err != nil && isAuthOrSignError(err) {
		refreshedProfile, refreshErr := c.GetProfile(ctx, true)
		if refreshErr == nil {
			return c.doSignedRequest(ctx, refreshedProfile, endpoint)
		}
	}
	return payload, err
}

func (c *Client) doSignedRequest(ctx context.Context, profile contracts.SiteProfile, endpoint string) (map[string]any, error) {
	reqURL := strings.TrimRight(profile.APIBase, "/") + endpoint
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	ts := strconv.FormatInt(time.Now().Unix(), 10)
	sig := calculateSignature(ts, profile.SignatureSecret)

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Referer", c.baseURL)
	req.Header.Set("x-client-ts", ts)
	req.Header.Set("x-client-sig", sig)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("auth failure status %d", resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("http %d for %s", resp.StatusCode, reqURL)
	}

	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decode json: %w", err)
	}
	return data, nil
}

func calculateSignature(timestamp, secret string) string {
	sum := sha256.Sum256([]byte(timestamp + "." + secret))
	return hex.EncodeToString(sum[:])
}

func isAuthOrSignError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "auth failure") || strings.Contains(msg, "401") || strings.Contains(msg, "403")
}

func (c *Client) SearchManga(ctx context.Context, query string, page int, limit int) (contracts.OnlineSearchResult, error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}

	query = strings.TrimSpace(query)
	endpoint := fmt.Sprintf("/manga/list?page=%d&limit=%d&search=%s", page, limit, url.QueryEscape(query))

	payload, err := c.fetchSignedJSON(ctx, endpoint)
	if err != nil {
		return contracts.OnlineSearchResult{}, err
	}

	rawItems, _ := payload["items"].([]any)
	totalPages := 1
	if tp, ok := payload["totalPages"].(float64); ok && tp > 0 {
		totalPages = int(tp)
	}
	totalItems := len(rawItems)
	if ti, ok := payload["totalItems"].(float64); ok && ti > 0 {
		totalItems = int(ti)
	}

	items := make([]contracts.OnlineMangaItem, 0, len(rawItems))
	for _, raw := range rawItems {
		itemMap, ok := raw.(map[string]any)
		if !ok {
			continue
		}

		id := getString(itemMap, "slug", "id", "_id")
		title := getString(itemMap, "name", "title", "mangaTitle")
		if title == "" {
			title = id
		}
		author := getString(itemMap, "author", "authorName")
		coverURL := getString(itemMap, "thumbnail", "cover", "image")
		status := getString(itemMap, "status")
		desc := getString(itemMap, "description", "summary")
		updateTime := getString(itemMap, "updatedAt", "last_update", "createdAt")

		items = append(items, contracts.OnlineMangaItem{
			ID:          id,
			Source:      SiteName,
			Title:       title,
			Author:      author,
			CoverURL:    coverURL,
			Status:      status,
			Description: desc,
			UpdateTime:  updateTime,
		})
	}

	return contracts.OnlineSearchResult{
		Items:      items,
		TotalItems: totalItems,
		Page:       page,
		TotalPages: totalPages,
	}, nil
}

func (c *Client) GetMangaChapters(ctx context.Context, slug string) ([]contracts.OnlineMangaChapter, error) {
	endpoint := "/manga/slug/" + url.PathEscape(slug)
	payload, err := c.fetchSignedJSON(ctx, endpoint)
	if err != nil {
		return nil, err
	}

	chaptersRaw, _ := payload["chapters"].([]any)
	chapters := make([]contracts.OnlineMangaChapter, 0, len(chaptersRaw))

	for _, raw := range chaptersRaw {
		chMap, ok := raw.(map[string]any)
		if !ok {
			continue
		}

		id := getString(chMap, "id", "_id", "chapterId")
		title := getString(chMap, "name", "title", "chapterName")
		num := getFloat(chMap, "chapter", "number", "chapterNumber")
		date := getString(chMap, "date", "updatedAt", "releaseDate")

		if title == "" {
			title = fmt.Sprintf("Chapter %.1f", num)
			title = strings.TrimSuffix(title, ".0")
		}

		chapters = append(chapters, contracts.OnlineMangaChapter{
			ID:          id,
			MangaID:     slug,
			Source:      SiteName,
			Title:       title,
			Number:      num,
			ReleaseDate: date,
		})
	}

	sort.SliceStable(chapters, func(i, j int) bool {
		return chapters[i].Number > chapters[j].Number
	})

	return chapters, nil
}

func (c *Client) GetChapterPages(ctx context.Context, chapterID string) ([]string, error) {
	profile, err := c.GetProfile(ctx, false)
	if err != nil {
		return nil, err
	}

	endpoint := "/chapter/" + url.PathEscape(chapterID)
	payload, err := c.fetchSignedJSON(ctx, endpoint)
	if err != nil {
		return nil, err
	}

	pagesRaw, _ := payload["pages"].([]any)
	pages := make([]string, 0, len(pagesRaw))
	ignoreMap := make(map[string]bool)
	for _, ign := range profile.IgnorePageURLs {
		ignoreMap[ign] = true
	}

	for _, raw := range pagesRaw {
		pageURL, ok := raw.(string)
		if !ok || pageURL == "" {
			continue
		}
		if ignoreMap[pageURL] {
			continue
		}

		for orig, target := range profile.ImageHostRewrite {
			if strings.Contains(pageURL, orig) {
				pageURL = strings.ReplaceAll(pageURL, orig, target)
			}
		}
		pages = append(pages, pageURL)
	}

	return pages, nil
}

func getString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if val, ok := m[k]; ok && val != nil {
			if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

func getFloat(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if val, ok := m[k]; ok && val != nil {
			switch v := val.(type) {
			case float64:
				return v
			case float32:
				return float64(v)
			case int:
				return float64(v)
			case int64:
				return float64(v)
			case string:
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					return f
				}
			}
		}
	}
	return 0
}
