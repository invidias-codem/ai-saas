package harness

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type SemanticSearchConfig struct {
	WorkspaceID  string
	RepoFullName string
	Query        string
	ClerkToken   string
	APIBaseURL   string
}

type SemanticSearchResponse struct {
	Success bool `json:"success"`
	Matches []struct {
		FilePath     string  `json:"file_path"`
		ContentChunk string  `json:"content_chunk"`
		Similarity   float64 `json:"similarity"`
	} `json:"matches"`
	Error string `json:"error,omitempty"`
}

func SemanticCodeSearch(ctx context.Context, config SemanticSearchConfig) (ToolExecutionResult, error) {
	url := fmt.Sprintf("%s/api/workspaces/%s/search", config.APIBaseURL, config.WorkspaceID)

	payload := map[string]interface{}{
		"repo_full_name": config.RepoFullName,
		"query":          config.Query,
		"match_count":    10,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return ToolExecutionResult{}, fmt.Errorf("failed to marshal search payload: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return ToolExecutionResult{}, fmt.Errorf("failed to create search request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.ClerkToken))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return ToolExecutionResult{}, fmt.Errorf("search request failed: %v", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return ToolExecutionResult{}, fmt.Errorf("failed to read search response: %v", err)
	}

	if resp.StatusCode >= 400 {
		return ToolExecutionResult{}, fmt.Errorf("search API returned error status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var searchResp SemanticSearchResponse
	if err := json.Unmarshal(bodyBytes, &searchResp); err != nil {
		return ToolExecutionResult{}, fmt.Errorf("failed to parse search response: %v", err)
	}

	if !searchResp.Success {
		return ToolExecutionResult{}, fmt.Errorf("search API returned failure: %s", searchResp.Error)
	}

	// Format results for the LLM
	var formattedResult strings.Builder
	formattedResult.WriteString(fmt.Sprintf("Found %d results for query: '%s'\n\n", len(searchResp.Matches), config.Query))

	for i, match := range searchResp.Matches {
		formattedResult.WriteString(fmt.Sprintf("--- Match %d (Similarity: %.2f) ---\n", i+1, match.Similarity))
		formattedResult.WriteString(fmt.Sprintf("File: %s\n", match.FilePath))
		formattedResult.WriteString(fmt.Sprintf("Content:\n%s\n\n", match.ContentChunk))
	}

	return ToolExecutionResult{
		Success: true,
		Stdout:  formattedResult.String(),
	}, nil
}

type GithubFileContentResponse struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
}

func GetFileContents(ctx context.Context, repoFullName string, filePath string, expectedToken string, allowedRepos []string) (ToolExecutionResult, error) {
	// The WAF wrapper handles checking allowedRepos internally
	url := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s", repoFullName, filePath)
	
	wafRes, err := ExecuteGitHubRequest(ctx, "GET", url, "", expectedToken, allowedRepos)
	if err != nil {
		return ToolExecutionResult{}, fmt.Errorf("GitHub API request failed via WAF: %v", err)
	}

	if !wafRes.Success {
		return wafRes, nil
	}

	var fileResp GithubFileContentResponse
	if err := json.Unmarshal([]byte(wafRes.Stdout), &fileResp); err != nil {
		return ToolExecutionResult{}, fmt.Errorf("failed to parse GitHub file content response: %v", err)
	}

	if fileResp.Encoding != "base64" {
		return ToolExecutionResult{
			Success: true,
			Stdout:  wafRes.Stdout, // Fallback if it's not base64 for some reason
		}, nil
	}

	// Decode Base64
	decodedBytes, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(fileResp.Content, "\n", ""))
	if err != nil {
		return ToolExecutionResult{}, fmt.Errorf("failed to decode base64 file content: %v", err)
	}

	return ToolExecutionResult{
		Success: true,
		Stdout:  string(decodedBytes),
	}, nil
}
