package downloader

import (
	"os"
	"path/filepath"
	"testing"

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

	copyClient := copymanga.NewClient("example.com", "", 5)
	klzClient := klz9.NewClient(dbStore, "https://klz9.com", 5)

	mgr := NewManager(dbStore, settService, copyClient, klzClient)

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

	tPaused, found, _ := dbStore.GetDownloadTask(taskID)
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
