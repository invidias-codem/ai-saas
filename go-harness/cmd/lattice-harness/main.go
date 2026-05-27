package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
)

type JSONRPCRequest struct {
	ID            string          `json:"id"`
	Version       string          `json:"jsonrpc"`
	WorkspaceRoot string          `json:"workspaceRoot"`
	Action        string          `json:"action"`
	AuthToken     string          `json:"authToken,omitempty"`
	Inputs        json.RawMessage `json:"inputs"`
}

type JSONRPCResponse struct {
	ID      string                       `json:"id"`
	Version string                       `json:"jsonrpc"`
	Result  *harness.ToolExecutionResult `json:"result,omitempty"`
	Error   *JSONRPCError                `json:"error,omitempty"`
}

type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Structs mapping to harness arguments
type ReadFileArgs struct {
	FilePath string `json:"filePath"`
}

type WriteFileArgs struct {
	FilePath string `json:"filePath"`
	Content  string `json:"content"`
}

type PatchFileArgs struct {
	FilePath     string `json:"filePath"`
	SearchBlock  string `json:"search_block"`
	ReplaceBlock string `json:"replace_block"`
}

type RunCommandArgs struct {
	Command   string `json:"command"`
	TimeoutMs *int   `json:"timeoutMs,omitempty"`
}

type GitHubRequestArgs struct {
	Method       string   `json:"method"`
	URL          string   `json:"url"`
	Body         string   `json:"body,omitempty"`
	AllowedRepos []string `json:"allowedRepos"` // Injected by Next.js per request
}

type IngestRepositoryArgs struct {
	WorkspaceID  string `json:"workspaceId"`
	RepoFullName string `json:"repoFullName"`
	ClerkToken   string `json:"clerkToken"`
	APIBaseURL   string `json:"apiBaseURL"`
	GitHubToken  string `json:"githubToken"`
}

type SemanticSearchArgs struct {
	WorkspaceID  string `json:"workspaceId"`
	RepoFullName string `json:"repoFullName"`
	Query        string `json:"query"`
	ClerkToken   string `json:"clerkToken"`
	APIBaseURL   string `json:"apiBaseURL"`
}

type GetFileContentsArgs struct {
	RepoFullName string   `json:"repoFullName"`
	FilePath     string   `json:"filePath"`
	AllowedRepos []string `json:"allowedRepos"` // Injected by Next.js per request
}

var (
	harnessMutex    sync.Mutex
	activeHarnesses = make(map[string]*harness.LocalIOHarness)
	stdoutMutex     sync.Mutex
	expectedToken   string
)

func main() {
	// Violent Descriptor Separation
	log.SetOutput(os.Stderr)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer cleanupHarnesses()

	expectedToken = os.Getenv("LATTICE_AUTH_TOKEN")
	if expectedToken == "" {
		log.Println("WARNING: LATTICE_AUTH_TOKEN is not set. The daemon is running in insecure mode (not recommended).")
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		log.Printf("Received signal %v, shutting down...", sig)
		cancel()
		cleanupHarnesses()
		os.Exit(1)
	}()

	// Use bufio.Reader instead of bufio.Scanner to bypass strict 64KB/1MB line limits
	reader := bufio.NewReader(os.Stdin)

	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			if err == io.EOF {
				log.Printf("Received EOF on stdin. Shutting down daemon.")
				break
			}
			log.Printf("Daemon read error: %v", err)
			break
		}

		if len(line) == 0 {
			continue
		}

		go processFrame(ctx, line)
	}
}

func cleanupHarnesses() {
	harnessMutex.Lock()
	defer harnessMutex.Unlock()
	for k, h := range activeHarnesses {
		h.Close()
		delete(activeHarnesses, k)
	}
}

func getOrInitHarness(workspaceRoot string) (*harness.LocalIOHarness, error) {
	harnessMutex.Lock()
	defer harnessMutex.Unlock()

	if h, ok := activeHarnesses[workspaceRoot]; ok {
		return h, nil
	}

	h, err := harness.NewLocalIOHarness(workspaceRoot)
	if err != nil {
		return nil, err
	}
	activeHarnesses[workspaceRoot] = h
	return h, nil
}

func writeResponse(resp JSONRPCResponse) {
	// Thread-Safe Output (Mutex) to prevent stream interleaving
	stdoutMutex.Lock()
	defer stdoutMutex.Unlock()
	json.NewEncoder(os.Stdout).Encode(resp)
}

func sendErrorResponse(id string, code int, message string) {
	writeResponse(JSONRPCResponse{
		ID:      id,
		Version: "2.0",
		Error:   &JSONRPCError{Code: code, Message: message},
	})
}

func processFrame(ctx context.Context, line []byte) {
	var req JSONRPCRequest
	
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic recovered in processFrame: %v", r)
			sendErrorResponse(req.ID, -32603, fmt.Sprintf("Internal Server Error (Panic): %v", r))
		}
	}()

	if err := json.Unmarshal(line, &req); err != nil {
		sendErrorResponse("", -32700, "Parse error: invalid JSON string payload")
		return
	}

	// Inner Ring Security check: verify the injected auth token
	if expectedToken != "" && req.AuthToken != expectedToken {
		log.Printf("Unauthorized JSON-RPC payload received. Expected valid auth token.")
		sendErrorResponse(req.ID, -32000, "Unauthorized: Invalid or missing authToken")
		return
	}

	ioHarness, err := getOrInitHarness(req.WorkspaceRoot)
	if err != nil {
		sendErrorResponse(req.ID, -32602, fmt.Sprintf("Invalid workspace initialization: %v", err))
		return
	}

	var res harness.ToolExecutionResult

	switch req.Action {
	case "read_file":
		var args ReadFileArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.ReadFile(ctx, args.FilePath)
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for read_file")
			return
		}
	case "write_file":
		var args WriteFileArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.WriteFile(ctx, args.FilePath, args.Content)
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for write_file")
			return
		}
	case "patch_file":
		var args PatchFileArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.PatchFile(ctx, args.FilePath, args.SearchBlock, args.ReplaceBlock)
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for patch_file")
			return
		}
	case "run_command":
		var args RunCommandArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.RunCommand(ctx, args.Command, args.TimeoutMs)
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for run_command")
			return
		}
	case "github_request":
		var args GitHubRequestArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			var err error
			res, err = harness.ExecuteGitHubRequest(ctx, args.Method, args.URL, args.Body, expectedToken, args.AllowedRepos)
			if err != nil {
				sendErrorResponse(req.ID, -32603, fmt.Sprintf("Failed to execute GitHub request: %v", err))
				return
			}
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for github_request")
			return
		}
	case "ingest_repository":
		var args IngestRepositoryArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			err := harness.CrawlAndIngest(harness.CrawlerConfig{
				WorkspaceID:  args.WorkspaceID,
				RepoFullName: args.RepoFullName,
				AuthToken:    args.ClerkToken,
				APIBaseURL:   args.APIBaseURL,
				GitHubToken:  args.GitHubToken,
			})
			if err != nil {
				sendErrorResponse(req.ID, -32603, fmt.Sprintf("Crawler error: %v", err))
				return
			}
			res = harness.ToolExecutionResult{
				Success: true,
				Stdout:  "Repository ingested successfully",
			}
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for ingest_repository")
			return
		}
	case "semantic_code_search":
		var args SemanticSearchArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			var err error
			res, err = harness.SemanticCodeSearch(ctx, harness.SemanticSearchConfig{
				WorkspaceID:  args.WorkspaceID,
				RepoFullName: args.RepoFullName,
				Query:        args.Query,
				ClerkToken:   args.ClerkToken,
				APIBaseURL:   args.APIBaseURL,
			})
			if err != nil {
				sendErrorResponse(req.ID, -32603, fmt.Sprintf("Search error: %v", err))
				return
			}
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for semantic_code_search")
			return
		}
	case "get_file_contents":
		var args GetFileContentsArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			var err error
			res, err = harness.GetFileContents(ctx, args.RepoFullName, args.FilePath, expectedToken, args.AllowedRepos)
			if err != nil {
				sendErrorResponse(req.ID, -32603, fmt.Sprintf("File read error: %v", err))
				return
			}
		} else {
			sendErrorResponse(req.ID, -32602, "Invalid params for get_file_contents")
			return
		}
	default:
		sendErrorResponse(req.ID, -32601, fmt.Sprintf("Method '%s' not found", req.Action))
		return
	}

	writeResponse(JSONRPCResponse{
		ID:      req.ID,
		Version: "2.0",
		Result:  &res,
	})
}
