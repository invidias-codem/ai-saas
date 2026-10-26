package main

import (
	"errors"
	"io"
	"net/http"
	"strings"
)

const maxRPCRequestBytes = 2 * 1024 * 1024

func newRPCHandler(session *SessionContext, origins string) http.Handler {
	allowed := make(map[string]bool)
	for _, origin := range strings.Split(origins, ",") {
		if value := strings.TrimSpace(origin); value != "" {
			allowed[value] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")
		if origin != "" && !allowed[origin] {
			http.Error(w, "Origin is not allowed", http.StatusForbidden)
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST, OPTIONS")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxRPCRequestBytes)
		defer r.Body.Close()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			var limit *http.MaxBytesError
			if errors.As(err, &limit) {
				http.Error(w, "RPC body exceeds 2 MiB", http.StatusRequestEntityTooLarge)
			} else {
				http.Error(w, "Bad request", http.StatusBadRequest)
			}
			return
		}
		processFrame(w, r.Context(), session, body)
	})
}
