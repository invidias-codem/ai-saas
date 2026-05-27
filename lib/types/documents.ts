export enum StorageState {
  WARM = 'WARM',
  COMPRESSING = 'COMPRESSING',
  COLD = 'COLD'
}

export enum EmbeddingTier {
  STANDARD_768 = 'STANDARD_768',
  HIGH_RES_3076 = 'HIGH_RES_3076'
}

export interface WorkspaceDocument {
  id: string;
  workspace_id: string | null;
  user_id: string;
  filename: string;
  mime_type: string;
  storage_uri?: string;
  storage_state: StorageState;
  content_raw?: string;
  embedding_tier: EmbeddingTier;
  parent_id?: string;
  version?: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content?: string;
  embedding_768?: number[];
  embedding_3076?: number[];
  created_at: string;
}

export interface UploadDocumentRequest {
  workspaceId?: string | null;
  filename: string;
  mimeType: string;
  storageUri?: string;
  base64Data?: string; // For small files uploaded directly
  parentId?: string;
}

export interface UploadDocumentResponse {
  id: string;
  workspaceId: string;
  filename: string;
  storageState: StorageState;
  embeddingTier: EmbeddingTier;
  chunkCount: number;
}
