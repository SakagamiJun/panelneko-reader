package library

import (
	"archive/zip"
	"errors"
	"io"
	"path"
	"path/filepath"
	"strings"

	"github.com/nwaples/rardecode/v2"
)

type archiveFile interface {
	Name() string
	IsDir() bool
	Size() int64
	Open() (io.ReadCloser, error)
}

type archiveHandle interface {
	Files() []archiveFile
	Close() error
}

type zipFileEntry struct {
	file *zip.File
}

func (z *zipFileEntry) Name() string { return z.file.Name }
func (z *zipFileEntry) IsDir() bool  { return z.file.FileInfo().IsDir() }
func (z *zipFileEntry) Size() int64 {
	size := int64(z.file.UncompressedSize64)
	if uint64(size) != z.file.UncompressedSize64 {
		return -1
	}
	return size
}
func (z *zipFileEntry) Open() (io.ReadCloser, error) { return z.file.Open() }

type zipArchiveHandle struct {
	reader *zip.ReadCloser
	files  []archiveFile
}

func (z *zipArchiveHandle) Files() []archiveFile { return z.files }
func (z *zipArchiveHandle) Close() error         { return z.reader.Close() }

type rarFileEntry struct {
	archivePath string
	file        *rardecode.File
}

func (r *rarFileEntry) Name() string { return r.file.Name }
func (r *rarFileEntry) IsDir() bool  { return r.file.IsDir }
func (r *rarFileEntry) Size() int64 {
	if r.file.UnKnownSize {
		return -1
	}
	return r.file.UnPackedSize
}

func (r *rarFileEntry) Open() (io.ReadCloser, error) {
	rc, err := r.file.Open()
	if err == nil {
		return rc, nil
	}
	if errors.Is(err, rardecode.ErrSolidOpen) {
		reader, rErr := rardecode.OpenReader(r.archivePath)
		if rErr != nil {
			return nil, rErr
		}
		for {
			header, nErr := reader.Next()
			if nErr != nil {
				reader.Close()
				return nil, nErr
			}
			if header.Name == r.file.Name {
				return reader, nil
			}
		}
	}
	return nil, err
}

type rarArchiveHandle struct {
	files []archiveFile
}

func (r *rarArchiveHandle) Files() []archiveFile { return r.files }
func (r *rarArchiveHandle) Close() error         { return nil }

func openZipArchive(archivePath string) (archiveHandle, error) {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, err
	}
	files := make([]archiveFile, len(reader.File))
	for i, f := range reader.File {
		files[i] = &zipFileEntry{file: f}
	}
	return &zipArchiveHandle{reader: reader, files: files}, nil
}

func openRarArchive(archivePath string) (archiveHandle, error) {
	rawFiles, err := rardecode.List(archivePath)
	if err != nil {
		return nil, err
	}
	files := make([]archiveFile, len(rawFiles))
	for i, f := range rawFiles {
		files[i] = &rarFileEntry{archivePath: archivePath, file: f}
	}
	return &rarArchiveHandle{files: files}, nil
}

func openArchiveHandle(archivePath string) (archiveHandle, error) {
	ext := strings.ToLower(path.Ext(filepath.ToSlash(archivePath)))
	if ext == ".cbr" || ext == ".rar" {
		handle, err := openRarArchive(archivePath)
		if err == nil {
			return handle, nil
		}
		// Fallback: archive may be a zip misnamed as .cbr or .rar
		if zipHandle, zipErr := openZipArchive(archivePath); zipErr == nil {
			return zipHandle, nil
		}
		return nil, err
	}

	// Default to zip (.cbz, .zip)
	handle, err := openZipArchive(archivePath)
	if err == nil {
		return handle, nil
	}
	// Fallback: archive may be a rar misnamed as .cbz or .zip
	if rarHandle, rarErr := openRarArchive(archivePath); rarErr == nil {
		return rarHandle, nil
	}
	return nil, err
}
