package harness

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ExecuteGitHubRequest executes a secure GitHub API request through the WAF.
func ExecuteGitHubRequest(ctx context.Context, method, url, body, token string, allowedRepos []string) (ToolExecutionResult, error) {
	// Initialize secure client with WAF middleware
	secureClient := &http.Client{
		Transport: &WAFTransport{
			Base:         http.DefaultTransport,
			AllowedRepos: allowedRepos,
		},
		Timeout: 15 * time.Second,
	}

	var reqBody io.Reader
	if body != "" {
		reqBody = strings.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to create request: %v", err),
			Code:  CodeInternalError,
		}, nil
	}

	if token != "" {
		req.Header.Set("Authorization", "token "+token)
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := secureClient.Do(req)
	if err != nil {
		// Ensure token is scrubbed from error logs if Do() fails and somehow includes headers
		safeErr := strings.ReplaceAll(err.Error(), token, "[REDACTED_TOKEN]")
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to execute request: %s", safeErr),
			Code:  CodeInternalError,
		}, nil
	}
	defer resp.Body.Close()

	respBodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to read response body: %v", err),
			Code:  CodeInternalError,
		}, nil
	}

	if resp.StatusCode >= 400 {
		return ToolExecutionResult{
			Ok:     false,
			Output: string(respBodyBytes),
			Error:  fmt.Sprintf("HTTP Error %d: %s", resp.StatusCode, resp.Status),
			Code:   CodeInternalError, // Depending on use case we might define specific error codes
		}, nil
	}

	return ToolExecutionResult{
		Ok:     true,
		Output: string(respBodyBytes),
	}, nil
}
