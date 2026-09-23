package library

import (
	"bytes"
	"crypto/rand"
	"io"
	"sync"
	"testing"
)

func TestCopyStream(t *testing.T) {
	sizes := []int{0, 15, 1024, StreamBufferSize - 1, StreamBufferSize, StreamBufferSize + 1, 512 * 1024}

	for _, size := range sizes {
		data := make([]byte, size)
		if size > 0 {
			if _, err := rand.Read(data); err != nil {
				t.Fatalf("generate random data: %v", err)
			}
		}

		src := bytes.NewReader(data)
		dst := new(bytes.Buffer)

		n, err := CopyStream(dst, src)
		if err != nil {
			t.Fatalf("CopyStream error for size %d: %v", size, err)
		}
		if n != int64(size) {
			t.Errorf("expected copied %d bytes, got %d", size, n)
		}
		if !bytes.Equal(dst.Bytes(), data) {
			t.Errorf("copied data does not match original for size %d", size)
		}
	}
}

func TestStreamBufferPool(t *testing.T) {
	buf := GetStreamBuffer()
	if buf == nil {
		t.Fatal("GetStreamBuffer returned nil")
	}
	if len(*buf) != StreamBufferSize {
		t.Fatalf("expected buffer size %d, got %d", StreamBufferSize, len(*buf))
	}
	PutStreamBuffer(buf)
	// Put nil or wrong-sized slice should not panic
	PutStreamBuffer(nil)
	wrongSize := make([]byte, 10)
	PutStreamBuffer(&wrongSize)
}

func TestCopyStreamConcurrent(t *testing.T) {
	const workers = 20
	const dataSize = 128 * 1024

	data := make([]byte, dataSize)
	if _, err := rand.Read(data); err != nil {
		t.Fatalf("generate random data: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			src := bytes.NewReader(data)
			dst := new(bytes.Buffer)
			n, err := CopyStream(dst, src)
			if err != nil {
				t.Errorf("concurrent CopyStream error: %v", err)
				return
			}
			if n != int64(dataSize) {
				t.Errorf("expected %d bytes, got %d", dataSize, n)
				return
			}
			if !bytes.Equal(dst.Bytes(), data) {
				t.Error("concurrent copied data corrupted")
			}
		}()
	}
	wg.Wait()
}

func BenchmarkCopyStream(b *testing.B) {
	data := make([]byte, 256*1024)
	b.SetBytes(int64(len(data)))
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		src := bytes.NewReader(data)
		_, _ = CopyStream(io.Discard, src)
	}
}
