package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
)

type Manager struct {
	eventBuffer []TelemetryEvent
	bufferMutex sync.Mutex
	apiEndpoint string
	bearerToken string
	flusherOn   bool
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewManager() *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{eventBuffer: []TelemetryEvent{}, ctx: ctx, cancel: cancel}
}

func ValidateCloudConfig(base, token string) error {
	if base == "" {
		return nil
	} // Local-only recording never requires egress.
	if base != netguard.AppOrigin || token == "" {
		return errors.New("telemetry requires an approved HTTPS origin and an upstream credential")
	}
	return nil
}

func (m *Manager) StartFlusher(base, token string) error {
	if err := ValidateCloudConfig(base, token); err != nil {
		return err
	}
	m.bufferMutex.Lock()
	defer m.bufferMutex.Unlock()
	if m.ctx.Err() != nil {
		return errors.New("telemetry manager is closed")
	}
	if base == "" {
		m.apiEndpoint, m.bearerToken = "", ""
		return nil
	}
	m.apiEndpoint, m.bearerToken = netguard.AppOrigin+"/api/harness/telemetry", token
	if !m.flusherOn {
		m.flusherOn = true
		go m.flushWorker()
	}
	return nil
}

func (m *Manager) Close() { m.cancel() }

func (m *Manager) RecordEvent(event TelemetryEvent) {
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	m.bufferMutex.Lock()
	defer m.bufferMutex.Unlock()
	if len(m.eventBuffer) >= 1000 {
		copy(m.eventBuffer, m.eventBuffer[1:])
		m.eventBuffer = m.eventBuffer[:999]
	}
	m.eventBuffer = append(m.eventBuffer, event)
}

func (m *Manager) FlushImmediate(event TelemetryEvent) { m.RecordEvent(event); go m.Flush() }

func (m *Manager) flushWorker() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			m.Flush()
		case <-m.ctx.Done():
			return
		}
	}
}

func (m *Manager) Flush() {
	m.bufferMutex.Lock()
	if len(m.eventBuffer) == 0 || m.apiEndpoint == "" {
		m.bufferMutex.Unlock()
		return
	}
	events := append([]TelemetryEvent(nil), m.eventBuffer...)
	endpoint, token := m.apiEndpoint, m.bearerToken
	m.eventBuffer = nil
	m.bufferMutex.Unlock()
	payload, err := json.Marshal(events)
	if err != nil {
		log.Print("[Telemetry] Cannot encode event batch")
		return
	}
	req, err := http.NewRequestWithContext(m.ctx, "POST", endpoint, bytes.NewBuffer(payload))
	if err != nil {
		log.Print("[Telemetry] Cannot construct request")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := netguard.CloudClient.Do(req)
	if err != nil {
		log.Print("[Telemetry] Approved upstream unavailable")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[Telemetry] Cloud rejected event batch: %d", resp.StatusCode)
	}
}

func (m *Manager) GetBufferedEvents() []TelemetryEvent {
	m.bufferMutex.Lock()
	defer m.bufferMutex.Unlock()
	return append([]TelemetryEvent(nil), m.eventBuffer...)
}
