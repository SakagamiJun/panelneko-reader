package library

import (
	"io"
	"sync"
)

// StreamBufferSize defines the buffer size used for streaming assets (64 KB).
const StreamBufferSize = 64 * 1024

var streamBufferPool = sync.Pool{
	New: func() any {
		buf := make([]byte, StreamBufferSize)
		return &buf
	},
}

// GetStreamBuffer borrows a 64 KB slice pointer from the global pool.
func GetStreamBuffer() *[]byte {
	return streamBufferPool.Get().(*[]byte)
}

// PutStreamBuffer returns a 64 KB slice pointer back to the pool.
func PutStreamBuffer(buf *[]byte) {
	if buf != nil && len(*buf) == StreamBufferSize {
		streamBufferPool.Put(buf)
	}
}

// CopyStream copies from src to dst using a pooled 64 KB buffer, eliminating per-request heap allocations.
func CopyStream(dst io.Writer, src io.Reader) (int64, error) {
	buf := GetStreamBuffer()
	defer PutStreamBuffer(buf)
	return io.CopyBuffer(dst, src, *buf)
}
