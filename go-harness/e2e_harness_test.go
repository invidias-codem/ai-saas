package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"time"
)

type JSONRPCRequest struct {
	ID            string      `json:"id"`
	Version       string      `json:"jsonrpc"`
	WorkspaceRoot string      `json:"workspaceRoot"`
	Action        string      `json:"action"`
	AuthToken     string      `json:"authToken,omitempty"`
	Inputs        interface{} `json:"inputs"`
}

func main() {
	log.Println("Starting E2E Harness Test...")

	// 1. Boot the Daemon
	cmd := exec.Command("go", "run", "./cmd/lattice-harness")
	
	// Prepare environment
	cmd.Env = os.Environ()
	// Set expected LATTICE_AUTH_TOKEN if not set (or use a test one)
	authToken := os.Getenv("LATTICE_AUTH_TOKEN")
	if authToken == "" {
		authToken = "test-token-123"
		cmd.Env = append(cmd.Env, "LATTICE_AUTH_TOKEN="+authToken)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Fatalf("Failed to acquire stdin pipe: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Fatalf("Failed to acquire stdout pipe: %v", err)
	}
	
	// Pass stderr directly to our stderr so we can see WAF/Daemon logs
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Fatalf("Failed to start daemon: %v", err)
	}
	defer func() {
		stdin.Close()
		cmd.Process.Kill()
	}()

	reader := bufio.NewReader(stdout)

	// Helper to send a request and read the response
	sendRequest := func(req JSONRPCRequest) {
		jsonData, err := json.Marshal(req)
		if err != nil {
			log.Fatalf("Failed to marshal request: %v", err)
		}

		log.Printf("\n>>> Sending Request: %s\n", req.Action)
		
		// Write to daemon stdin
		stdin.Write(jsonData)
		stdin.Write([]byte("\n"))

		// Read from daemon stdout
		respLine, err := reader.ReadBytes('\n')
		if err != nil {
			if err != io.EOF {
				log.Fatalf("Failed to read response: %v", err)
			}
		}
		
		log.Printf("<<< Received Response: %s\n", string(respLine))
		time.Sleep(1 * time.Second) // Tiny pause between requests
	}

	workspaceID := "test-workspace-uuid"
	repoFullName := "invidias-codem/ai-saas" // Replace with a smaller test repo
	apiBaseURL := "http://localhost:3000"

	// 2. The Ingestion Trigger
	sendRequest(JSONRPCRequest{
		ID:            "req-1",
		Version:       "2.0",
		WorkspaceRoot: "/tmp/lattice-workspace",
		Action:        "ingest_repository",
		AuthToken:     authToken,
		Inputs: map[string]string{
			"workspaceId":  workspaceID,
			"repoFullName": repoFullName,
			"clerkToken":   authToken, // Using the same test token for Next.js auth for this mock
			"apiBaseURL":   apiBaseURL,
			"githubToken":  os.Getenv("GITHUB_TOKEN"), // Needed to clone private repos
		},
	})

	// 3. The Global Search
	sendRequest(JSONRPCRequest{
		ID:            "req-2",
		Version:       "2.0",
		WorkspaceRoot: "/tmp/lattice-workspace",
		Action:        "semantic_code_search",
		AuthToken:     authToken,
		Inputs: map[string]string{
			"workspaceId":  workspaceID,
			"repoFullName": repoFullName,
			"query":        "authentication middleware",
			"clerkToken":   authToken,
			"apiBaseURL":   apiBaseURL,
		},
	})

	// 4. The Local Read
	sendRequest(JSONRPCRequest{
		ID:            "req-3",
		Version:       "2.0",
		WorkspaceRoot: "/tmp/lattice-workspace",
		Action:        "get_file_contents",
		AuthToken:     authToken,
		Inputs: map[string]interface{}{
			"repoFullName": repoFullName,
			"filePath":     "package.json", // An example file we assume exists
			"allowedRepos": []string{repoFullName},
		},
	})

	log.Println("\nE2E Test Sequence Completed.")
}
