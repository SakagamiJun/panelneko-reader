//go:build pprof

package main

import (
	"encoding/json"
	"log"
	"net/http"
	_ "net/http/pprof"
	"os"
	"runtime"
)

func init() {
	http.HandleFunc("/debug/memstats", func(w http.ResponseWriter, _ *http.Request) {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)

		toMB := func(b uint64) float64 { return float64(b) / (1024 * 1024) }

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"alloc_mb":          toMB(m.Alloc),
			"total_alloc_mb":    toMB(m.TotalAlloc),
			"sys_mb":            toMB(m.Sys),
			"heap_alloc_mb":     toMB(m.HeapAlloc),
			"heap_sys_mb":       toMB(m.HeapSys),
			"heap_idle_mb":      toMB(m.HeapIdle),
			"heap_inuse_mb":     toMB(m.HeapInuse),
			"heap_released_mb":  toMB(m.HeapReleased),
			"heap_objects":      m.HeapObjects,
			"stack_inuse_mb":    toMB(m.StackInuse),
			"num_gc":            m.NumGC,
			"gc_pause_total_ms": float64(m.PauseTotalNs) / 1e6,
		})
	})

	go func() {
		addr := os.Getenv("PPROF_ADDR")
		if addr == "" {
			addr = "127.0.0.1:6060"
		}
		log.Printf("[pprof] Debug server listening on %s", addr)
		log.Println("[pprof]   GET /debug/pprof/    — standard Go profiles")
		log.Println("[pprof]   GET /debug/memstats   — JSON memory stats")
		if err := http.ListenAndServe(addr, nil); err != nil {
			log.Printf("[pprof] server error: %v", err)
		}
	}()
}
