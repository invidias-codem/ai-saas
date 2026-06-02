package telemetry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Manager struct {
	eventBuffer []TelemetryEvent
	bufferMutex sync.Mutex
	apiEndpoint string
	bearerToken string
	flusherOn   bool
}

func NewManager() *Manager {
	return &Manager{
		eventBuffer: make([]TelemetryEvent, 0),
		flusherOn:   false,
	}
}

// StartFlusher activates the background flusher securely
func (m *Manager) StartFlusher(apiBaseUrl, authToken string) {
	m.bufferMutex.Lock()
	defer m.bufferMutex.Unlock()

	m.apiEndpoint = apiBaseUrl + "/api/harness/telemetry"
	m.bearerToken = authToken

	if !m.flusherOn {
		m.flusherOn = true
		go m.flushWorker()
	}
}

// RecordEvent pushes a new event into the thread-safe buffer
func (m *Manager) RecordEvent(event TelemetryEvent) {
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	m.bufferMutex.Lock()
	m.eventBuffer = append(m.eventBuffer, event)
	m.bufferMutex.Unlock()
}

// FlushImmediate records an event and immediately pushes the entire buffer to the cloud
func (m *Manager) FlushImmediate(event TelemetryEvent) {
	m.RecordEvent(event)
	// Execute flush in a goroutine to not block the caller
	go m.Flush()
}

func (m *Manager) flushWorker() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		<-ticker.C
		m.Flush()
	}
}

// Flush sends buffered events to the cloud and clears the local buffer
func (m *Manager) Flush() {
	m.bufferMutex.Lock()
	if len(m.eventBuffer) == 0 || m.apiEndpoint == "" {
		m.bufferMutex.Unlock()
		return
	}
	
	// Copy buffer to release lock quickly
	eventsToFlush := make([]TelemetryEvent, len(m.eventBuffer))
	copy(eventsToFlush, m.eventBuffer)
	m.eventBuffer = nil
	m.bufferMutex.Unlock()

	// Send to cloud
	payload, err := json.Marshal(eventsToFlush)
	if err != nil {
		fmt.Printf("[Telemetry] Error marshaling events: %v\n", err)
		return
	}

	req, err := http.NewRequest("POST", m.apiEndpoint, bytes.NewBuffer(payload))
	if err != nil {
		fmt.Printf("[Telemetry] Error creating request: %v\n", err)
		return
	}
	
	req.Header.Set("Content-Type", "application/json")
	if m.bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+m.bearerToken)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[Telemetry] Error sending events: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fmt.Printf("[Telemetry] Cloud rejected events with status: %d\n", resp.StatusCode)
	}
}

// GetBufferedEvents returns a copy of the current buffered events (used for testing)
func (m *Manager) GetBufferedEvents() []TelemetryEvent {
	m.bufferMutex.Lock()
	defer m.bufferMutex.Unlock()
	
	eventsCopy := make([]TelemetryEvent, len(m.eventBuffer))
	copy(eventsCopy, m.eventBuffer)
	return eventsCopy
}
