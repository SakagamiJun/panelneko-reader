package downloader

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

type ComicInfoOptions struct {
	Series          string
	Title           string
	Writer          string
	Summary         string
	Number          float64
	PageCount       int
	ScanInformation string
	Web             string
	Notes           string
	MangaFormat     string
	MangaBlackWhite string
	MangaReadDir    string
}

type comicInfoXML struct {
	XMLName         xml.Name `xml:"ComicInfo"`
	Title           string   `xml:"Title,omitempty"`
	Series          string   `xml:"Series,omitempty"`
	Number          string   `xml:"Number,omitempty"`
	Writer          string   `xml:"Writer,omitempty"`
	Summary         string   `xml:"Summary,omitempty"`
	Pages           int      `xml:"PageCount,omitempty"`
	ScanInformation string   `xml:"ScanInformation,omitempty"`
	Web             string   `xml:"Web,omitempty"`
	Notes           string   `xml:"Notes,omitempty"`
	Manga           string   `xml:"Manga,omitempty"`
	BlackAndWhite   string   `xml:"BlackAndWhite,omitempty"`
	MangaReadDir    string   `xml:"MangaReadDir,omitempty"`
}

func BuildComicInfoXML(opts ComicInfoOptions) ([]byte, error) {
	numStr := fmt.Sprintf("%.1f", opts.Number)
	numStr = strings.TrimSuffix(numStr, ".0")

	info := comicInfoXML{
		Title:           opts.Title,
		Series:          opts.Series,
		Number:          numStr,
		Writer:          opts.Writer,
		Summary:         opts.Summary,
		Pages:           opts.PageCount,
		ScanInformation: opts.ScanInformation,
		Web:             opts.Web,
		Notes:           opts.Notes,
		Manga:           opts.MangaFormat,
		BlackAndWhite:   opts.MangaBlackWhite,
		MangaReadDir:    opts.MangaReadDir,
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
