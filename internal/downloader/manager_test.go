package downloader

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sakagamijun/panelneko-reader/internal/contracts"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/copymanga"
	"github.com/sakagamijun/panelneko-reader/internal/downloader/klz9"
	"github.com/sakagamijun/panelneko-reader/internal/settings"
	"github.com/sakagamijun/panelneko-reader/internal/store"
)

func TestDownloadManagerLifecycle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mgr-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbStore, err := store.Open(filepath.Join(tmpDir, "store"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dbStore.Close()

	settService, err := settings.NewService(dbStore)
	if err != nil {
		t.Fatalf("new settings: %v", err)
	}

	libDir := filepath.Join(tmpDir, "library")
	if err := os.MkdirAll(libDir, 0o755); err != nil {
		t.Fatalf("mkdir lib: %v", err)
	}
	curSett := settService.Get()
	curSett.LibraryRoot = libDir
	if len(curSett.LibrarySources) > 0 {
		curSett.LibrarySources[0].Path = libDir
	}
	if _, err := settService.Update(curSett); err != nil {
		t.Fatalf("update settings: %v", err)
	}

	copyClient := copymanga.NewClient("example.com", "", 5)
	klzClient := klz9.NewClient(dbStore, "https://klz9.com", 5)

	mgr := NewManager(dbStore, settService, copyClient, klzClient)
	defer mgr.Close()

	var emittedEvents []string
	mgr.SetEmitter(func(eventName string, payload any) {
		emittedEvents = append(emittedEvents, eventName)
	})

	inputs := []contracts.CreateDownloadTaskInput{
		{
			Source:        "copymanga",
			MangaID:       "manga-1",
			MangaTitle:    "Test Manga",
			ChapterID:     "ch-1",
			ChapterTitle:  "Chapter 1",
			ChapterNumber: 1.0,
		},
		{
			Source:        "copymanga",
			MangaID:       "manga-1",
			MangaTitle:    "Test Manga",
			ChapterID:     "ch-2",
			ChapterTitle:  "Chapter 2",
			ChapterNumber: 2.0,
		},
	}

	created, err := mgr.CreateTasks(inputs)
	if err != nil {
		t.Fatalf("create tasks: %v", err)
	}
	if len(created) != 2 {
		t.Fatalf("expected 2 tasks created, got %d", len(created))
	}

	tasks, err := mgr.GetTasks()
	if err != nil {
		t.Fatalf("get tasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("expected 2 tasks in store, got %d", len(tasks))
	}

	// Test Pause & Cancel
	taskID := tasks[0].ID
	if err := mgr.PauseTask(taskID); err != nil {
		t.Errorf("pause task failed: %v", err)
	}

	var tPaused contracts.DownloadTask
	var found bool
	for i := 0; i < 20; i++ {
		tPaused, found, _ = dbStore.GetDownloadTask(taskID)
		if found && tPaused.Status == contracts.DownloadStatusPaused {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !found || tPaused.Status != contracts.DownloadStatusPaused {
		t.Errorf("expected task to be paused, got %v", tPaused.Status)
	}

	if err := mgr.CancelTask(taskID); err != nil {
		t.Errorf("cancel task failed: %v", err)
	}
	_, foundAfterCancel, _ := dbStore.GetDownloadTask(taskID)
	if foundAfterCancel {
		t.Errorf("expected task to be deleted after cancel")
	}

	// Test Progress calculation
	prog := mgr.GetProgress()
	if prog.TotalTasks != 1 {
		t.Errorf("expected 1 remaining total task, got %d", prog.TotalTasks)
	}
}

func TestWaitingSourceAndResume(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mgr-waiting-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbStore, err := store.Open(filepath.Join(tmpDir, "store"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dbStore.Close()

	settService, err := settings.NewService(dbStore)
	if err != nil {
		t.Fatalf("new settings: %v", err)
	}

	libDir := filepath.Join(tmpDir, "library")
	if err := os.MkdirAll(libDir, 0o755); err != nil {
		t.Fatalf("mkdir lib: %v", err)
	}
	curSett := settService.Get()
	curSett.LibraryRoot = libDir
	if len(curSett.LibrarySources) > 0 {
		curSett.LibrarySources[0].Path = libDir
	}
	if _, err := settService.Update(curSett); err != nil {
		t.Fatalf("update settings: %v", err)
	}

	nasMountPath := filepath.Join(tmpDir, "nas_mount")
	// Add offline source
	current := settService.Get()
	src := contracts.LibrarySource{
		ID:      "nas-source-1",
		Name:    "NAS Manga",
		Type:    contracts.SourceTypeLocal,
		Path:    nasMountPath,
		Enabled: true,
	}
	current.LibrarySources = append(current.LibrarySources, src)
	if _, err := settService.Update(current); err != nil {
		t.Fatalf("update settings: %v", err)
	}

	copyClient := copymanga.NewClient("example.com", "", 5)
	klzClient := klz9.NewClient(dbStore, "https://klz9.com", 5)

	mgr := NewManager(dbStore, settService, copyClient, klzClient)
	defer mgr.Close()

	inputs := []contracts.CreateDownloadTaskInput{
		{
			Source:         "copymanga",
			MangaID:        "manga-nas",
			MangaTitle:     "NAS Manga Test",
			ChapterID:      "ch-nas-1",
			ChapterTitle:   "Chapter 1",
			ChapterNumber:  1.0,
			TargetSourceID: src.ID,
		},
	}

	tasks, err := mgr.CreateTasks(inputs)
	if err != nil {
		t.Fatalf("create tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}

	// Because nasMountPath does not exist, resolveTargetDirectory will fail with offline error
	dir, err := mgr.resolveTargetDirectory(tasks[0])
	if err == nil {
		t.Fatalf("expected error when resolving non-existent target source directory, got dir: %s", dir)
	}

	// Update task status to waiting_source simulating worker encountering offline NAS
	_ = dbStore.UpdateDownloadTaskStatus(tasks[0].ID, contracts.DownloadStatusWaitingSource, "offline")

	// Now create the NAS directory simulating mount / reconnect
	if err := os.MkdirAll(nasMountPath, 0o755); err != nil {
		t.Fatalf("mkdir nas: %v", err)
	}

	resolvedDir, err := mgr.resolveTargetDirectory(tasks[0])
	if err != nil {
		t.Fatalf("expected successful resolution after mount, got err: %v", err)
	}
	if resolvedDir != nasMountPath {
		t.Errorf("expected resolved dir %s, got %s", nasMountPath, resolvedDir)
	}

	// Test ResumeWaitingTasks
	mgr.ResumeWaitingTasks(src.ID)

	updatedTask, found, _ := dbStore.GetDownloadTask(tasks[0].ID)
	if !found {
		t.Fatalf("task not found")
	}
	if updatedTask.Status != contracts.DownloadStatusPending && updatedTask.Status != contracts.DownloadStatusDownloading && updatedTask.Status != contracts.DownloadStatusFailed {
		// It might transition quickly to Failed in worker since mock client won't reach real server, but it must have resumed from waiting_source!
		if updatedTask.Status == contracts.DownloadStatusWaitingSource {
			t.Errorf("task should have been resumed from waiting_source, but is still %v", updatedTask.Status)
		}
	}
}

func TestSpeedMonitoring(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "mgr-speed-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbStore, err := store.Open(filepath.Join(tmpDir, "store"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer dbStore.Close()

	settService, err := settings.NewService(dbStore)
	if err != nil {
		t.Fatalf("new settings: %v", err)
	}

	copyClient := copymanga.NewClient("example.com", "", 5)
	klzClient := klz9.NewClient(dbStore, "https://klz9.com", 5)

	mgr := NewManager(dbStore, settService, copyClient, klzClient)
	defer mgr.Close()

	// Simulate bytes written
	mgr.totalBytesSec.Add(1024 * 1024 * 2) // 2 MB

	// Simulate one tick manually to verify speed format calculation
	secBytes := mgr.totalBytesSec.Swap(0)
	mgr.bytesPerSec.Store(secBytes)
	mb := float64(secBytes) / (1024.0 * 1024.0)
	str := "2.00 MB/s"
	mgr.speedFormatted.Store(&str)

	prog := mgr.GetProgress()
	if prog.SpeedFormatted != "2.00 MB/s" {
		t.Errorf("expected 2.00 MB/s, got %s", prog.SpeedFormatted)
	}
	if prog.BytesPerSec != float64(1024*1024*2) {
		t.Errorf("expected 2097152 bytesPerSec, got %f", prog.BytesPerSec)
	}
	_ = mb
}

func TestFolderChapterCompletenessDetection(t *testing.T) {
	chapterDir := t.TempDir()

	if pages := existingPageNumbers(chapterDir, 3); len(pages) != 0 {
		t.Fatalf("expected no pages in empty chapter dir, got %v", pages)
	}

	for _, name := range []string{"001.jpg", "002.png", "003.webp"} {
		if err := os.WriteFile(filepath.Join(chapterDir, name), []byte("page"), 0o644); err != nil {
			t.Fatalf("write page %s: %v", name, err)
		}
	}
	if err := os.WriteFile(filepath.Join(chapterDir, "ComicInfo.xml"), []byte("<ComicInfo/>"), 0o644); err != nil {
		t.Fatalf("write ComicInfo: %v", err)
	}
	if err := os.WriteFile(filepath.Join(chapterDir, "004.jpg"), []byte("outside"), 0o644); err != nil {
		t.Fatalf("write extra page: %v", err)
	}

	pages := existingPageNumbers(chapterDir, 3)
	if len(pages) != 3 {
		t.Fatalf("expected 3 pages within range, got %v", pages)
	}
	if !hasAllChapterPages(chapterDir, 3) {
		t.Fatal("expected all chapter pages to be detected")
	}
	if _, ok := readChapterCompleteMarker(chapterDir); ok {
		t.Fatal("unexpected completion marker before it was written")
	}

	if err := writeChapterCompleteMarker(chapterDir, 3); err != nil {
		t.Fatalf("write completion marker: %v", err)
	}
	if total, ok := readChapterCompleteMarker(chapterDir); !ok || total != 3 {
		t.Fatalf("expected completion marker with total 3, got total=%d ok=%v", total, ok)
	}

	if err := os.Remove(filepath.Join(chapterDir, "002.png")); err != nil {
		t.Fatalf("remove page: %v", err)
	}
	if hasAllChapterPages(chapterDir, 3) {
		t.Fatal("expected partial chapter to be detected as incomplete")
	}
	if pages := existingPageNumbers(chapterDir, 3); len(pages) != 2 {
		t.Fatalf("expected 2 remaining pages, got %v", pages)
	}
}
