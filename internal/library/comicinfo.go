package library

import (
	"archive/zip"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type ComicInfo struct {
	XMLName xml.Name `xml:"ComicInfo"`
	Series  string   `xml:"Series"`
	Title   string   `xml:"Title"`
	Number  string   `xml:"Number"`
	Summary string   `xml:"Summary"`
	Writer  string   `xml:"Writer"`
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

func readComicInfoFromArchive(archiveReader *zip.ReadCloser) (ComicInfo, bool) {
	for _, file := range archiveReader.File {
		if strings.EqualFold(file.Name, "ComicInfo.xml") {
			rc, err := file.Open()
			if err != nil {
				return ComicInfo{}, false
			}
			defer rc.Close()
			data, err := io.ReadAll(rc)
			if err != nil {
				return ComicInfo{}, false
			}
			info, err := parseComicInfo(data)
			return info, err == nil
		}
	}
	return ComicInfo{}, false
}
