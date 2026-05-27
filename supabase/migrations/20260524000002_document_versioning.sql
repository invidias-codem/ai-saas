-- Upgrades workspace_documents to support version control
ALTER TABLE workspace_documents 
ADD COLUMN parent_id UUID REFERENCES workspace_documents(id) ON DELETE SET NULL,
ADD COLUMN version INTEGER DEFAULT 1;

-- Specialized table for document drift analytics
CREATE TABLE document_delta_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    old_document_id UUID REFERENCES workspace_documents(id) ON DELETE CASCADE,
    new_document_id UUID REFERENCES workspace_documents(id) ON DELETE CASCADE,
    drift_score FLOAT NOT NULL, -- Global average semantic drift
    audit_verdict TEXT NOT NULL, -- e.g., 'PASSED', 'CONTRADICTION_DETECTED'
    delta_payload JSONB, -- Stores exact chunk indices and scoreClaims outcomes
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index the parent_id to optimize version tree retrievals
CREATE INDEX idx_workspace_docs_parent_id ON workspace_documents(parent_id);
