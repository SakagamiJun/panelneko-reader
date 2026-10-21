package contracts

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestDownloaderSettings_UnmarshalJSON(t *testing.T) {
	tests := []struct {
		name                 string
		payload              string
		wantCDNs             []string
		wantAutoCheckUpdates bool
	}{
		{
			name: "valid slice of strings",
			payload: `{
				"enableCopyManga": true,
				"autoCheckComicUpdates": true,
				"copyMangaCustomCdns": ["https://cdn1.example.com", "https://cdn2.example.com"]
			}`,
			wantCDNs:             []string{"https://cdn1.example.com", "https://cdn2.example.com"},
			wantAutoCheckUpdates: true,
		},
		{
			name: "empty string in copymangaCustomCDNs (legacy UI binding)",
			payload: `{
				"enableCopyManga": true,
				"autoCheckComicUpdates": true,
				"copymangaCustomCDNs": ""
			}`,
			wantCDNs:             nil,
			wantAutoCheckUpdates: true,
		},
		{
			name: "comma separated string in copyMangaCustomCdns",
			payload: `{
				"enableCopyManga": true,
				"autoCheckComicUpdates": true,
				"copyMangaCustomCdns": "https://cdn1.example.com, https://cdn2.example.com"
			}`,
			wantCDNs:             []string{"https://cdn1.example.com", "https://cdn2.example.com"},
			wantAutoCheckUpdates: true,
		},
		{
			name: "comma separated string in copymangaCustomCDNs",
			payload: `{
				"enableCopyManga": true,
				"autoCheckComicUpdates": false,
				"copymangaCustomCDNs": "https://cdn3.example.com"
			}`,
			wantCDNs:             []string{"https://cdn3.example.com"},
			wantAutoCheckUpdates: false,
		},
		{
			name: "null cdns",
			payload: `{
				"enableCopyManga": false,
				"autoCheckComicUpdates": true,
				"copyMangaCustomCdns": null
			}`,
			wantCDNs:             nil,
			wantAutoCheckUpdates: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var ds DownloaderSettings
			if err := json.Unmarshal([]byte(tt.payload), &ds); err != nil {
				t.Fatalf("unexpected unmarshal error: %v", err)
			}
			if ds.AutoCheckComicUpdates != tt.wantAutoCheckUpdates {
				t.Errorf("AutoCheckComicUpdates = %v, want %v", ds.AutoCheckComicUpdates, tt.wantAutoCheckUpdates)
			}
			if !reflect.DeepEqual(ds.CopyMangaCustomCDNs, tt.wantCDNs) {
				t.Errorf("CopyMangaCustomCDNs = %v, want %v", ds.CopyMangaCustomCDNs, tt.wantCDNs)
			}
		})
	}
}
