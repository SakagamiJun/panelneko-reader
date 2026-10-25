package library

import (
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type ComicInfo struct {
	XMLName         xml.Name `xml:"ComicInfo"`
	Series          string   `xml:"Series"`
	Title           string   `xml:"Title"`
	Number          string   `xml:"Number"`
	Summary         string   `xml:"Summary"`
	Writer          string   `xml:"Writer"`
	ScanInformation string   `xml:"ScanInformation"`
	Web             string   `xml:"Web"`
	Notes           string   `xml:"Notes"`
}

func parseComicInfo(data []byte) (ComicInfo, error) {
	var info ComicInfo
	err := xml.Unmarshal(data, &info)
	return info, err
}

func readComicInfoFromDir(dir string) (ComicInfo, bool) {
	data, err := os.ReadFile(filepath.Join(dir, "ComicInfo.xml"))
	if err != nil {
		return ComicInfo{}, false
	}
	info, err := parseComicInfo(data)
	return info, err == nil
}

func readComicInfoFromArchive(files []archiveFile) (ComicInfo, bool) {
	for _, file := range files {
		cleaned := strings.ReplaceAll(file.Name(), "\\", "/")
		if strings.EqualFold(filepath.Base(cleaned), "ComicInfo.xml") {
			rc, err := file.Open()
			if err != nil {
				return ComicInfo{}, false
			}
			data, err := io.ReadAll(rc)
			_ = rc.Close()
			if err != nil {
				return ComicInfo{}, false
			}
			info, err := parseComicInfo(data)
			return info, err == nil
		}
	}
	return ComicInfo{}, false
}
