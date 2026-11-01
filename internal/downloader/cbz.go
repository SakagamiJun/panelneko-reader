package downloader

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// StreamSaveCBZ saves a list of image byte-producers directly into a .cbz archive atomically.
func StreamSaveCBZ(
	finalFilePath string,
	xmlMetadata []byte,
	totalPages int,
	fetchImage func(ctx context.Context, pageIndex int, writer io.Writer) error,
	getPageFilename ...func(pageIndex int) string,
) error {
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
		if len(getPageFilename) > 0 && getPageFilename[0] != nil {
			if customName := getPageFilename[0](i); customName != "" {
				entryName = customName
			}
		}
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
