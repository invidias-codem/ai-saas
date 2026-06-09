package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	"github.com/invidias-codem/ai-saas/go-harness/harness"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
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

// SessionContext holds the long-lived memory structures initialized on boot.
type SessionContext struct {
	Registry  *fsutil.RootRegistry
	Telemetry *telemetry.Manager
	VectorDB  *harness.VectorIndex
}

type SyncGrantsArgs struct {
	ApiBaseUrl  string             `json:"api_base_url"`
	AuthToken   string             `json:"auth_token"`
	WorkspaceID string             `json:"workspace_id"`
	UserID      string             `json:"user_id"`
	Grants      []fsutil.RootGrant `json:"grants"`
}

type LocalCapabilityArgs struct {
	Path        string `json:"path"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
}

type SemanticSearchSecureArgs struct {
	Query       string `json:"query"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
}

type InsertEpisodicEventArgs struct {
	WorkspaceID string    `json:"workspace_id"`
	EventType   string    `json:"event_type"`
	Content     string    `json:"content"`
	Metadata    string    `json:"metadata"`
	Embedding   []float32 `json:"embedding"`
}

type SearchEpisodicEventsArgs struct {
	WorkspaceID    string    `json:"workspace_id"`
	QueryEmbedding []float32 `json:"query_embedding"`
	TopK           int       `json:"top_k"`
}

type ExecuteCommandSecureArgs struct {
	Command        string `json:"command"`
	TimeoutSeconds int    `json:"timeout_seconds"`
	Path           string `json:"path"`
	WorkspaceID    string `json:"workspace_id"`
	UserID         string `json:"user_id"`
}

type StartWorkspaceIngestionArgs struct {
	Path        string `json:"path"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	ApiBaseUrl  string `json:"api_base_url"`
	AuthToken   string `json:"auth_token"`
}

type WriteFileSecureArgs struct {
	Path        string `json:"path"`
	Content     string `json:"content"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
}

type MovePathSecureArgs struct {
	SrcPath     string `json:"src_path"`
	DestPath    string `json:"dest_path"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
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

	portFlag := flag.Int("port", 0, "Port to bind the HTTP server to (0 for dynamic)")
	corsOriginsFlag := flag.String("cors-origins", "http://localhost:3000,tauri://localhost,https://tauri.localhost", "Comma-separated list of allowed CORS origins")
	flag.Parse()

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

	// 1. Initialize the decoupled memory structures
	telemetryManager := telemetry.NewManager() // Buffer is ready, flusher is OFF
	rootRegistry := fsutil.NewRootRegistry()
	vectorDB, err := harness.NewVectorIndex("lattice_vectors.db")
	if err != nil {
		log.Printf("Failed to initialize vector index: %v", err)
	}

	session := &SessionContext{
		Registry:  rootRegistry,
		Telemetry: telemetryManager,
		VectorDB:  vectorDB,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/rpc", func(w http.ResponseWriter, r *http.Request) {
		// CORS Headers
		origin := r.Header.Get("Origin")
		allowedOrigins := strings.Split(*corsOriginsFlag, ",")
		allowed := false
		for _, o := range allowedOrigins {
			if origin == strings.TrimSpace(o) {
				allowed = true
				break
			}
		}
		if allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			// Fallback for development if no origin is provided
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		processFrame(w, ctx, session, body)
	})

	addr := fmt.Sprintf("127.0.0.1:%d", *portFlag)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to bind to port: %v", err)
	}

	actualPort := listener.Addr().(*net.TCPAddr).Port

	// Print ready status to stdout (MUST be stdout so parent process can parse it)
	readyMsg := map[string]interface{}{
		"status": "ready",
		"port":   actualPort,
	}
	json.NewEncoder(os.Stdout).Encode(readyMsg)

	srv := &http.Server{Handler: mux}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	log.Printf("Listening on http://127.0.0.1:%d", actualPort)
	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
		log.Fatalf("HTTP server error: %v", err)
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

func writeResponse(w http.ResponseWriter, resp JSONRPCResponse) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func sendErrorResponse(w http.ResponseWriter, id string, code int, message string) {
	writeResponse(w, JSONRPCResponse{
		ID:      id,
		Version: "2.0",
		Error:   &JSONRPCError{Code: code, Message: message},
	})
}

func processFrame(w http.ResponseWriter, ctx context.Context, session *SessionContext, line []byte) {
	var req JSONRPCRequest

	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic recovered in processFrame: %v", r)
			sendErrorResponse(w, req.ID, -32603, fmt.Sprintf("Internal Server Error (Panic): %v", r))
		}
	}()

	if err := json.Unmarshal(line, &req); err != nil {
		sendErrorResponse(w, "", -32700, "Parse error: invalid JSON string payload")
		return
	}

	// Inner Ring Security check: verify the injected auth token
	if expectedToken != "" && req.AuthToken != expectedToken {
		log.Printf("Unauthorized JSON-RPC payload received. Expected valid auth token.")
		sendErrorResponse(w, req.ID, -32000, "Unauthorized: Invalid or missing authToken")
		return
	}

	ioHarness, err := getOrInitHarness(req.WorkspaceRoot)
	if err != nil {
		sendErrorResponse(w, req.ID, -32602, fmt.Sprintf("Invalid workspace initialization: %v", err))
		return
	}

	var res harness.ToolExecutionResult

	switch req.Action {
	case "sync_root_grants":
		var args SyncGrantsArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			// 1. Hydrate the registry
			session.Registry.UpdateGrants(args.Grants)

			// 2. Activate the background flusher securely
			session.Telemetry.StartFlusher(args.ApiBaseUrl, args.AuthToken)

			// Log the successful hydration
			session.Telemetry.RecordEvent(telemetry.NewEvent(
				args.UserID, args.WorkspaceID,
				"daemon_synchronized", "", "sync_root_grants",
				0, nil,
			))

			res = harness.ToolExecutionResult{
				Ok:     true,
				Output: fmt.Sprintf("Synchronized %d roots", len(args.Grants)),
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for sync_root_grants")
			return
		}

	case "read_file_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.ReadFileSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for read_file_secure")
			return
		}

	case "list_directory_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.ListDirectorySecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for list_directory_secure")
			return
		}

	case "stat_path_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.StatPathSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for stat_path_secure")
			return
		}

	case "start_workspace_ingestion":
		var args StartWorkspaceIngestionArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.StartWorkspaceIngestion(session.Registry, session.Telemetry, session.VectorDB, args.Path, args.WorkspaceID, args.UserID, args.AuthToken, args.ApiBaseUrl)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for start_workspace_ingestion")
			return
		}

	case "execute_command_secure":
		var args ExecuteCommandSecureArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			outputStr, execErr := harness.ExecuteCommandSecure(session.Registry, session.Telemetry, args.Command, args.Path, args.WorkspaceID, args.UserID, args.TimeoutSeconds)
			if execErr != nil {
				res = harness.ToolExecutionResult{Ok: false, Error: execErr.Error(), Code: "COMMAND_FAILED"}
			} else {
				res = harness.ToolExecutionResult{Ok: true, Output: outputStr}
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for execute_command_secure")
			return
		}

	case "discover_documents_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.DiscoverDocumentsSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for discover_documents_secure")
			return
		}

	case "extract_text_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.ExtractTextSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for extract_text_secure")
			return
		}

	case "summarize_repo_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.SummarizeRepoSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for summarize_repo_secure")
			return
		}

	case "semantic_search_secure":
		var args SemanticSearchSecureArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.SemanticSearchSecure(session.Registry, session.Telemetry, session.VectorDB, args.Query, args.WorkspaceID, args.UserID, expectedToken)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for semantic_search_secure")
			return
		}

	case "insert_episodic_event":
		var args InsertEpisodicEventArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			err := session.VectorDB.InsertEpisodicEvent(args.WorkspaceID, args.EventType, args.Content, args.Metadata, args.Embedding)
			if err != nil {
				res = harness.ToolExecutionResult{Ok: false, Error: err.Error()}
			} else {
				res = harness.ToolExecutionResult{Ok: true, Output: "Episodic event inserted successfully"}
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for insert_episodic_event")
			return
		}

	case "search_episodic_events":
		var args SearchEpisodicEventsArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			events, err := session.VectorDB.SearchEpisodicEvents(args.WorkspaceID, args.QueryEmbedding, args.TopK)
			if err != nil {
				res = harness.ToolExecutionResult{Ok: false, Error: err.Error()}
			} else {
				b, _ := json.Marshal(events)
				res = harness.ToolExecutionResult{Ok: true, Output: string(b)}
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for search_episodic_events")
			return
		}

	case "create_file_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.CreateFileSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for create_file_secure")
			return
		}

	case "write_file_secure":
		var args WriteFileSecureArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.WriteFileSecure(session.Registry, session.Telemetry, args.Path, args.Content, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for write_file_secure")
			return
		}

	case "create_directory_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.CreateDirectorySecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for create_directory_secure")
			return
		}

	case "delete_path_secure":
		var args LocalCapabilityArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.DeletePathSecure(session.Registry, session.Telemetry, args.Path, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for delete_path_secure")
			return
		}

	case "move_path_secure":
		var args MovePathSecureArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = harness.MovePathSecure(session.Registry, session.Telemetry, args.SrcPath, args.DestPath, args.WorkspaceID, args.UserID)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for move_path_secure")
			return
		}

	case "read_file":
		var args ReadFileArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.ReadFile(ctx, args.FilePath)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for read_file")
			return
		}
	case "write_file":
		var args WriteFileArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.WriteFile(ctx, args.FilePath, args.Content)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for write_file")
			return
		}
	case "patch_file":
		var args PatchFileArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.PatchFile(ctx, args.FilePath, args.SearchBlock, args.ReplaceBlock)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for patch_file")
			return
		}
	case "run_command":
		var args RunCommandArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			res = ioHarness.RunCommand(ctx, args.Command, args.TimeoutMs)
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for run_command")
			return
		}
	case "github_request":
		var args GitHubRequestArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			var err error
			res, err = harness.ExecuteGitHubRequest(ctx, args.Method, args.URL, args.Body, expectedToken, args.AllowedRepos)
			if err != nil {
				sendErrorResponse(w, req.ID, -32603, fmt.Sprintf("Failed to execute GitHub request: %v", err))
				return
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for github_request")
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
				sendErrorResponse(w, req.ID, -32603, fmt.Sprintf("Crawler error: %v", err))
				return
			}
			res = harness.ToolExecutionResult{
				Ok:     true,
				Output: "Repository ingested successfully",
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for ingest_repository")
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
				sendErrorResponse(w, req.ID, -32603, fmt.Sprintf("Search error: %v", err))
				return
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for semantic_code_search")
			return
		}
	case "get_file_contents":
		var args GetFileContentsArgs
		if json.Unmarshal(req.Inputs, &args) == nil {
			var err error
			res, err = harness.GetFileContents(ctx, args.RepoFullName, args.FilePath, expectedToken, args.AllowedRepos)
			if err != nil {
				sendErrorResponse(w, req.ID, -32603, fmt.Sprintf("File read error: %v", err))
				return
			}
		} else {
			sendErrorResponse(w, req.ID, -32602, "Invalid params for get_file_contents")
			return
		}
	default:
		sendErrorResponse(w, req.ID, -32601, fmt.Sprintf("Method '%s' not found", req.Action))
		return
	}

	writeResponse(w, JSONRPCResponse{
		ID:      req.ID,
		Version: "2.0",
		Result:  &res,
	})
}
