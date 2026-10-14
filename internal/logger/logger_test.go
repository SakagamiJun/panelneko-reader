package logger

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileLogger(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "logger-test-*")
	if err != nil {
		t.Fatalf("temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	l := &FileLogger{}
	if err := l.Init(tmpDir, true); err != nil {
		t.Fatalf("init logger: %v", err)
	}

	l.Info("Test message %d", 123)
	l.Warn("Warning message")
	l.Error("Error message")

	logPath := filepath.Join(tmpDir, "panelneko.log")
	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log file: %v", err)
	}

	content := string(data)
	if !strings.Contains(content, "[INFO] Test message 123") {
		t.Errorf("missing info log in content: %s", content)
	}
	if !strings.Contains(content, "[WARN] Warning message") {
		t.Errorf("missing warn log in content: %s", content)
	}
	if !strings.Contains(content, "[ERROR] Error message") {
		t.Errorf("missing error log in content: %s", content)
	}

	// Test disabling
	if err := l.SetEnabled(false); err != nil {
		t.Fatalf("set enabled false: %v", err)
	}
	l.Info("Should not be logged")

	dataAfter, _ := os.ReadFile(logPath)
	if strings.Contains(string(dataAfter), "Should not be logged") {
		t.Errorf("disabled logger wrote message")
	}
}
