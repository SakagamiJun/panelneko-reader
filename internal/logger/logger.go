package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	maxFileSize = 5 * 1024 * 1024 // 5 MB
	maxBackups  = 3
)

type FileLogger struct {
	mu       sync.Mutex
	logDir   string
	logFile  *os.File
	filePath string
	fileSize int64
	enabled  bool
}

var globalLogger *FileLogger
var once sync.Once

func Get() *FileLogger {
	once.Do(func() {
		globalLogger = &FileLogger{}
	})
	return globalLogger
}

func (l *FileLogger) Init(logDir string, enabled bool) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.logDir = logDir
	l.enabled = enabled
	l.filePath = filepath.Join(logDir, "panelneko.log")

	if l.logFile != nil {
		_ = l.logFile.Close()
		l.logFile = nil
	}

	if !enabled {
		return nil
	}

	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return fmt.Errorf("create log dir: %w", err)
	}

	return l.openLogFile()
}

func (l *FileLogger) SetEnabled(enabled bool) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.enabled = enabled
	if !enabled {
		if l.logFile != nil {
			_ = l.logFile.Close()
			l.logFile = nil
		}
		return nil
	}

	if l.logFile == nil && l.logDir != "" {
		_ = os.MkdirAll(l.logDir, 0o755)
		return l.openLogFile()
	}
	return nil
}

func (l *FileLogger) LogDir() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.logDir
}

func (l *FileLogger) openLogFile() error {
	fi, err := os.Stat(l.filePath)
	if err == nil {
		l.fileSize = fi.Size()
	} else {
		l.fileSize = 0
	}

	f, err := os.OpenFile(l.filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("open log file: %w", err)
	}
	l.logFile = f
	return nil
}

func (l *FileLogger) rotate() {
	if l.logFile != nil {
		_ = l.logFile.Close()
		l.logFile = nil
	}

	// Rotate backups: .2 -> .3, .1 -> .2, log -> .1
	for i := maxBackups - 1; i >= 1; i-- {
		oldPath := fmt.Sprintf("%s.%d", l.filePath, i)
		newPath := fmt.Sprintf("%s.%d", l.filePath, i+1)
		_ = os.Rename(oldPath, newPath)
	}
	_ = os.Rename(l.filePath, fmt.Sprintf("%s.1", l.filePath))

	_ = l.openLogFile()
}

func (l *FileLogger) Log(level string, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if !l.enabled || l.logFile == nil {
		return
	}

	msg := fmt.Sprintf(format, args...)
	entry := fmt.Sprintf("[%s] [%s] %s\n", time.Now().Format("2006-01-02 15:04:05.000"), level, msg)
	entryBytes := []byte(entry)

	if l.fileSize+int64(len(entryBytes)) > maxFileSize {
		l.rotate()
	}

	if l.logFile != nil {
		n, err := l.logFile.Write(entryBytes)
		if err == nil {
			l.fileSize += int64(n)
		}
	}
}

func (l *FileLogger) Info(format string, args ...any) {
	l.Log("INFO", format, args...)
}

func (l *FileLogger) Warn(format string, args ...any) {
	l.Log("WARN", format, args...)
}

func (l *FileLogger) Error(format string, args ...any) {
	l.Log("ERROR", format, args...)
}
