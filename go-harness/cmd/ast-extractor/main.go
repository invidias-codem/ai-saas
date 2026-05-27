package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
)

type Chunk struct {
	Content      string   `json:"content"`
	LogicalName  string   `json:"logicalName"`
	ChunkType    string   `json:"chunkType"`
	StartLine    int      `json:"startLine"`
	EndLine      int      `json:"endLine"`
	Dependencies []string `json:"dependencies,omitempty"`
}

func main() {
	filePath := flag.String("file", "", "Path to the Go file to parse")
	flag.Parse()

	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "Error: -file parameter is required")
		os.Exit(1)
	}

	content, err := os.ReadFile(*filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading file: %v\n", err)
		os.Exit(1)
	}

	fset := token.NewFileSet()
	fileNode, err := parser.ParseFile(fset, *filePath, content, parser.ParseComments)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing file: %v\n", err)
		os.Exit(1)
	}

	var chunks []Chunk

	// Traverse AST declarations
	for _, decl := range fileNode.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			startPos := fset.Position(d.Pos())
			endPos := fset.Position(d.End())

			funcContent := string(content[startPos.Offset:endPos.Offset])
			logicalName := d.Name.Name
			chunkType := "function"

			if d.Recv != nil && len(d.Recv.List) > 0 {
				chunkType = "method"
				recvType := ""
				switch t := d.Recv.List[0].Type.(type) {
				case *ast.Ident:
					recvType = t.Name
				case *ast.StarExpr:
					if ident, ok := t.X.(*ast.Ident); ok {
						recvType = ident.Name
					}
				}
				if recvType != "" {
					logicalName = fmt.Sprintf("%s.%s", recvType, logicalName)
				}
			}

			chunks = append(chunks, Chunk{
				Content:     funcContent,
				LogicalName: logicalName,
				ChunkType:   chunkType,
				StartLine:   startPos.Line,
				EndLine:     endPos.Line,
			})

		case *ast.GenDecl:
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					typeSpec, ok := spec.(*ast.TypeSpec)
					if !ok {
						continue
					}
					startPos := fset.Position(d.Pos())
					endPos := fset.Position(d.End())

					chunkType := "struct"
					switch typeSpec.Type.(type) {
					case *ast.StructType:
						chunkType = "struct"
					case *ast.InterfaceType:
						chunkType = "interface"
					default:
						chunkType = "struct" // Map custom types or aliases to struct block chunks for retrieval ease
					}

					typeContent := string(content[startPos.Offset:endPos.Offset])
					chunks = append(chunks, Chunk{
						Content:     typeContent,
						LogicalName: typeSpec.Name.Name,
						ChunkType:   chunkType,
						StartLine:   startPos.Line,
						EndLine:     endPos.Line,
					})
				}
			}
		}
	}

	output, err := json.Marshal(chunks)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(string(output))
}
