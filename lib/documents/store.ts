import { supabaseAdmin } from '@/lib/supabaseClient';
import { WorkspaceDocument, DocumentChunk, StorageState, EmbeddingTier } from '../types/documents';

/**
 * Creates a new document record in the database.
 */
export async function createDocument(doc: Omit<WorkspaceDocument, 'id' | 'created_at' | 'updated_at'>): Promise<WorkspaceDocument> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('workspace_documents')
    .insert([doc])
    .select()
    .single();

  if (error) {
    console.error('[DocumentStore] Error creating document:', error);
    throw new Error(`Failed to create document: ${error.message}`);
  }

  return data as WorkspaceDocument;
}

/**
 * Retrieves a document by its ID and Workspace ID.
 */
export async function getDocument(id: string, workspaceId?: string | null): Promise<WorkspaceDocument | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  let query = supabaseAdmin
    .from('workspace_documents')
    .select('*')
    .eq('id', id);

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[DocumentStore] Error fetching document:', error);
    throw new Error(`Failed to fetch document: ${error.message}`);
  }

  return data as WorkspaceDocument;
}

/**
 * Updates the storage state of a document (e.g., WARM -> COMPRESSING -> COLD)
 */
export async function updateDocumentState(id: string, state: StorageState): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { error } = await supabaseAdmin
    .from('workspace_documents')
    .update({ storage_state: state, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[DocumentStore] Error updating document state:', error);
    throw new Error(`Failed to update document state: ${error.message}`);
  }
}

/**
 * Persists document chunks to the database in bulk.
 */
export async function saveDocumentChunks(chunks: Omit<DocumentChunk, 'id' | 'created_at'>[]): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  if (chunks.length === 0) return;

  const { error } = await supabaseAdmin
    .from('document_chunks')
    .insert(chunks);

  if (error) {
    console.error('[DocumentStore] Error saving chunks:', error);
    throw new Error(`Failed to save chunks: ${error.message}`);
  }
}

/**
 * Deletes raw content from chunks when transitioning to COLD storage.
 * Keeps the vectors intact for searchability.
 */
export async function clearRawTextFromChunks(documentId: string): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not configured');
    }
  
    const { error } = await supabaseAdmin
      .from('document_chunks')
      .update({ content: null })
      .eq('document_id', documentId);
  
    if (error) {
      console.error('[DocumentStore] Error clearing chunk content:', error);
      throw new Error(`Failed to clear chunk content: ${error.message}`);
    }
  }
