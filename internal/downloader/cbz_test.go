package downloader

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStreamSaveCBZWithComicInfo(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "cbz-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	xmlData, err := BuildComicInfoXML(ComicInfoOptions{
		Series:    "One Piece",
		Title:     "Chapter 1",
		Writer:    "Oda Eiichiro",
		Summary:   "Great pirate era",
		Number:    1.0,
		PageCount: 3,
	})
	if err != nil {
		t.Fatalf("build comicinfo xml: %v", err)
	}

	cbzPath := filepath.Join(tmpDir, "one_piece_001.cbz")
	err = StreamSaveCBZ(context.Background(), cbzPath, xmlData, 3, func(ctx context.Context, pageIndex int, writer io.Writer) error {
		content := fmt.Sprintf("fake_image_bytes_%d", pageIndex+1)
		_, wErr := writer.Write([]byte(content))
		return wErr
	})
	if err != nil {
		t.Fatalf("StreamSaveCBZ failed: %v", err)
	}

	zr, err := zip.OpenReader(cbzPath)
	if err != nil {
		t.Fatalf("open cbz: %v", err)
	}
	defer zr.Close()

	if len(zr.File) != 4 {
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

func TestStreamSaveCBZWithCustomPageNamer(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "cbz-namer-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	cbzPath := filepath.Join(tmpDir, "custom_ext.cbz")
	pageNamer := func(idx int) string {
		exts := []string{".jpg", ".png"}
		return fmt.Sprintf("%03d%s", idx+1, exts[idx%len(exts)])
	}

	err = StreamSaveCBZ(context.Background(), cbzPath, nil, 2, func(ctx context.Context, pageIndex int, writer io.Writer) error {
		_, wErr := writer.Write([]byte("img"))
		return wErr
	}, pageNamer)
	if err != nil {
		t.Fatalf("StreamSaveCBZ failed: %v", err)
	}

	zr, err := zip.OpenReader(cbzPath)
	if err != nil {
		t.Fatalf("open cbz: %v", err)
	}
	defer zr.Close()

	if len(zr.File) != 2 {
		t.Fatalf("expected 2 files, got %d", len(zr.File))
	}
	if zr.File[0].Name != "001.jpg" || zr.File[1].Name != "002.png" {
		t.Fatalf("unexpected entry names: %s, %s", zr.File[0].Name, zr.File[1].Name)
	}
}

func TestStreamSaveCBZContextCancellation(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "cbz_cancel_test")
	if err != nil {
		t.Fatalf("create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel before or during execution

	cbzPath := filepath.Join(tmpDir, "canceled.cbz")
	err = StreamSaveCBZ(ctx, cbzPath, nil, 3, func(pCtx context.Context, pageIndex int, writer io.Writer) error {
		return pCtx.Err()
	})
	if err == nil {
		t.Fatal("expected cancellation error, got nil")
	}

	// Verify temporary file was deleted
	if _, statErr := os.Stat(cbzPath + ".tmp"); !os.IsNotExist(statErr) {
		t.Errorf("expected tmp file to be cleaned up on cancellation")
	}
}
