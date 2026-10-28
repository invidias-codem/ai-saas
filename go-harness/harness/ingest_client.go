package harness

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"
	"net/http"
)

const (
	// Target batch size slightly below 2.5MB to be extremely safe against Vercel's 4.5MB limit
	MaxBatchSizeBytes = 2 * 1024 * 1024
)

type IngestPayload struct {
	RepoFullName string      `json:"repo_full_name"`
	Chunks       []FileChunk `json:"chunks"`
}

type IngestClient struct {
	ctx          context.Context
	WorkspaceID  string
	RepoFullName string
	AuthToken    string
	APIBaseURL   string
	Buffer       []FileChunk
	BufferBytes  int
}

func NewIngestClient(workspaceID, repoFullName, authToken, apiBaseURL string) *IngestClient {
	return NewIngestClientContext(context.Background(), workspaceID, repoFullName, authToken, apiBaseURL)
}

func NewIngestClientContext(ctx context.Context, workspaceID, repoFullName, authToken, apiBaseURL string) *IngestClient {
	return &IngestClient{
		ctx:          ctx,
		WorkspaceID:  workspaceID,
		RepoFullName: repoFullName,
		AuthToken:    authToken,
		APIBaseURL:   apiBaseURL,
		Buffer:       make([]FileChunk, 0),
		BufferBytes:  0,
	}
}

func (c *IngestClient) AddChunk(chunk FileChunk) error {
	// Approximate byte size logic: FilePath bytes + Content bytes + some JSON overhead
	chunkBytes := len(chunk.FilePath) + len(chunk.Content) + 100

	if c.BufferBytes+chunkBytes > MaxBatchSizeBytes {
		if err := c.Flush(); err != nil {
			return err
		}
	}

	c.Buffer = append(c.Buffer, chunk)
	c.BufferBytes += chunkBytes
	return nil
}

func (c *IngestClient) Flush() error {
	if len(c.Buffer) == 0 {
		return nil
	}

	payload := IngestPayload{
		RepoFullName: c.RepoFullName,
		Chunks:       c.Buffer,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal ingest payload: %v", err)
	}

	url, err := netguard.APIURL(c.APIBaseURL, c.WorkspaceID, "ingest")
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(c.ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create ingest request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.AuthToken))

	client := netguard.CloudClient
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("ingest request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("ingest API returned error status: %d", resp.StatusCode)
	}

	// Reset buffer
	c.Buffer = make([]FileChunk, 0)
	c.BufferBytes = 0

	return nil
}
