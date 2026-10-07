package library

import (
	"encoding/base64"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// minimalRARArchiveBase64 contains a valid RAR4 archive containing a single file:
// "001.jpg" with content "fake-image-bytes".
const minimalRARArchiveBase64 = "UmFyIRoHAM+QcwAADQAAAAAAAAAfXHQAgCcAEAAAABAAAAAA4+y4oAAAAAAUMAcAIAAAADAwMS5qcGdmYWtlLWltYWdlLWJ5dGVzxD17AEAHAA=="

func writeTestRarArchive(t *testing.T, archivePath string) {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString(minimalRARArchiveBase64)
	if err != nil {
		t.Fatalf("decode test rar base64: %v", err)
	}
	if err := os.WriteFile(archivePath, data, 0o644); err != nil {
		t.Fatalf("write test rar archive: %v", err)
	}
}

func TestCBRArchiveFormatSupport(t *testing.T) {
	// Verify format extensions recognition
	if !isSupportedArchivePath("test.cbr") {
		t.Errorf("expected test.cbr to be supported archive")
	}
	if !isSupportedArchivePath("test.rar") {
		t.Errorf("expected test.rar to be supported archive")
	}
	if !isSupportedArchivePath("TEST.CBR") {
		t.Errorf("expected TEST.CBR to be supported archive (case insensitive)")
	}

	root := t.TempDir()
	mangaDir := filepath.Join(root, "CBR Comic")
	if err := os.MkdirAll(mangaDir, 0o755); err != nil {
		t.Fatalf("mkdir mangaDir: %v", err)
	}

	// 1. Genuine RAR archive with .cbr extension
	cbrPath := filepath.Join(mangaDir, "001 - Volume 1.cbr")
	writeTestRarArchive(t, cbrPath)

	// 2. ZIP archive misnamed as .cbr (common in user collections)
	zipAsCbrPath := filepath.Join(mangaDir, "002 - Volume 2.cbr")
	writeZipArchive(t, zipAsCbrPath, map[string]string{
		"001.jpg": "zip-image-bytes",
	})

	mangas, _, err := ScanLibraryManga(root, nil, nil)
	if err != nil {
		t.Fatalf("ScanLibraryManga failed: %v", err)
	}
	if len(mangas) != 1 {
		t.Fatalf("expected 1 manga, got %d", len(mangas))
	}
	if mangas[0].ChapterCount != 2 {
		t.Fatalf("expected 2 chapters in CBR comic, got %d", mangas[0].ChapterCount)
	}

	manifest, err := GetReaderManifest(root, mangas[0].ID)
	if err != nil {
		t.Fatalf("LoadReaderManifest failed: %v", err)
	}
	if len(manifest.Chapters) != 2 {
		t.Fatalf("expected 2 manifest chapters, got %d", len(manifest.Chapters))
	}

	// Read asset from genuine RAR CBR
	assetReader, contentType, _, err := OpenMultiSourceArchiveAsset(
		map[string]string{"default": root},
		root,
		LibraryArchiveAssetPrefix+encodePathToken("CBR Comic/001 - Volume 1.cbr")+"/"+encodePathToken("001.jpg"),
	)
	if err != nil {
		t.Fatalf("OpenMultiSourceArchiveAsset for RAR .cbr failed: %v", err)
	}
	defer assetReader.Close()

	if contentType != "image/jpeg" {
		t.Errorf("expected contentType image/jpeg, got %s", contentType)
	}
	body, err := io.ReadAll(assetReader)
	if err != nil {
		t.Fatalf("read asset body: %v", err)
	}
	if string(body) != "fake-image-bytes" {
		t.Errorf("unexpected content: %s", string(body))
	}

	// Read asset from zip-fallback CBR
	assetReader2, contentType2, _, err := OpenMultiSourceArchiveAsset(
		map[string]string{"default": root},
		root,
		LibraryArchiveAssetPrefix+encodePathToken("CBR Comic/002 - Volume 2.cbr")+"/"+encodePathToken("001.jpg"),
	)
	if err != nil {
		t.Fatalf("OpenMultiSourceArchiveAsset for zip fallback .cbr failed: %v", err)
	}
	defer assetReader2.Close()

	if contentType2 != "image/jpeg" {
		t.Errorf("expected contentType image/jpeg, got %s", contentType2)
	}
	body2, err := io.ReadAll(assetReader2)
	if err != nil {
		t.Fatalf("read asset body 2: %v", err)
	}
	if string(body2) != "zip-image-bytes" {
		t.Errorf("unexpected fallback content: %s", string(body2))
	}
}
