export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_tasks: {
        Row: {
          completed_at: string | null
          context: string | null
          created_at: string
          error: string | null
          id: string
          input: string
          model_preference: string | null
          result: string | null
          routing_tier: string | null
          status: string
          task_type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          context?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input: string
          model_preference?: string | null
          result?: string | null
          routing_tier?: string | null
          status?: string
          task_type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          context?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: string
          model_preference?: string | null
          result?: string | null
          routing_tier?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      ai_output_audit: {
        Row: {
          claim_embedding: string | null
          claim_text: string
          confidence: number | null
          contradicts_node: string | null
          created_at: string | null
          delta_score: number | null
          domain: string | null
          explanation: string | null
          graph_edge_id: string | null
          id: string
          model: string
          session_id: string | null
          verdict: string
        }
        Insert: {
          claim_embedding?: string | null
          claim_text: string
          confidence?: number | null
          contradicts_node?: string | null
          created_at?: string | null
          delta_score?: number | null
          domain?: string | null
          explanation?: string | null
          graph_edge_id?: string | null
          id?: string
          model: string
          session_id?: string | null
          verdict: string
        }
        Update: {
          claim_embedding?: string | null
          claim_text?: string
          confidence?: number | null
          contradicts_node?: string | null
          created_at?: string | null
          delta_score?: number | null
          domain?: string | null
          explanation?: string | null
          graph_edge_id?: string | null
          id?: string
          model?: string
          session_id?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_output_audit_contradicts_node_fkey"
            columns: ["contradicts_node"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_output_audit_graph_edge_id_fkey"
            columns: ["graph_edge_id"]
            isOneToOne: false
            referencedRelation: "knowledge_edges"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          decision: string | null
          event_type: string | null
          harness: string | null
          id: string
          ip_address: string | null
          metadata: Json
          org_id: string | null
          payload: Json | null
          severity: string
          trace_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          decision?: string | null
          event_type?: string | null
          harness?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          org_id?: string | null
          payload?: Json | null
          severity?: string
          trace_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          decision?: string | null
          event_type?: string | null
          harness?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          org_id?: string | null
          payload?: Json | null
          severity?: string
          trace_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bluesky_actor_memory: {
        Row: {
          actor_did: string
          display_name: string | null
          engagement_count: number
          first_seen_at: string
          handle: string
          last_interaction_at: string
          last_reply_at: string | null
          last_reply_summary: string | null
          notes: Json
          relationship_summary: string | null
          reply_count: number
          tone_preference_guess: string | null
          topics_engaged: Json
          updated_at: string
        }
        Insert: {
          actor_did: string
          display_name?: string | null
          engagement_count?: number
          first_seen_at?: string
          handle: string
          last_interaction_at?: string
          last_reply_at?: string | null
          last_reply_summary?: string | null
          notes?: Json
          relationship_summary?: string | null
          reply_count?: number
          tone_preference_guess?: string | null
          topics_engaged?: Json
          updated_at?: string
        }
        Update: {
          actor_did?: string
          display_name?: string | null
          engagement_count?: number
          first_seen_at?: string
          handle?: string
          last_interaction_at?: string
          last_reply_at?: string | null
          last_reply_summary?: string | null
          notes?: Json
          relationship_summary?: string | null
          reply_count?: number
          tone_preference_guess?: string | null
          topics_engaged?: Json
          updated_at?: string
        }
        Relationships: []
      }
      bluesky_conversation_memory: {
        Row: {
          actor_did: string
          actor_handle: string | null
          last_agent_position: string | null
          last_mention_uri: string | null
          last_reply_uri: string | null
          last_summary: string | null
          last_topic: string | null
          open_question: string | null
          reply_depth: number
          thread_root_uri: string
          updated_at: string
        }
        Insert: {
          actor_did: string
          actor_handle?: string | null
          last_agent_position?: string | null
          last_mention_uri?: string | null
          last_reply_uri?: string | null
          last_summary?: string | null
          last_topic?: string | null
          open_question?: string | null
          reply_depth?: number
          thread_root_uri: string
          updated_at?: string
        }
        Update: {
          actor_did?: string
          actor_handle?: string | null
          last_agent_position?: string | null
          last_mention_uri?: string | null
          last_reply_uri?: string | null
          last_summary?: string | null
          last_topic?: string | null
          open_question?: string | null
          reply_depth?: number
          thread_root_uri?: string
          updated_at?: string
        }
        Relationships: []
      }
      bluesky_engagement_learning: {
        Row: {
          action_taken: string
          author_did: string | null
          author_handle: string
          comment_cid: string | null
          comment_class: string
          comment_text: string
          comment_uri: string | null
          created_at: string
          id: string
          is_recurring_question_candidate: boolean
          normalized_comment_text: string
          packet_id: string | null
          packet_title: string | null
          post_topic: string | null
          post_uri: string | null
          rationale: string
          reply_text: string | null
          source_context: string
          suggested_reply_style: string | null
          topic_key: string | null
        }
        Insert: {
          action_taken: string
          author_did?: string | null
          author_handle: string
          comment_cid?: string | null
          comment_class: string
          comment_text: string
          comment_uri?: string | null
          created_at?: string
          id?: string
          is_recurring_question_candidate?: boolean
          normalized_comment_text: string
          packet_id?: string | null
          packet_title?: string | null
          post_topic?: string | null
          post_uri?: string | null
          rationale: string
          reply_text?: string | null
          source_context: string
          suggested_reply_style?: string | null
          topic_key?: string | null
        }
        Update: {
          action_taken?: string
          author_did?: string | null
          author_handle?: string
          comment_cid?: string | null
          comment_class?: string
          comment_text?: string
          comment_uri?: string | null
          created_at?: string
          id?: string
          is_recurring_question_candidate?: boolean
          normalized_comment_text?: string
          packet_id?: string | null
          packet_title?: string | null
          post_topic?: string | null
          post_uri?: string | null
          rationale?: string
          reply_text?: string | null
          source_context?: string
          suggested_reply_style?: string | null
          topic_key?: string | null
        }
        Relationships: []
      }
      bluesky_interactions: {
        Row: {
          author_did: string
          author_handle: string
          created_at: string
          cta_kind: string | null
          facts_extracted: number
          id: string
          inferred_topics: string[] | null
          mention_text: string
          mention_uri: string
          response_text: string | null
          response_uri: string | null
          routed_to: string | null
        }
        Insert: {
          author_did: string
          author_handle: string
          created_at?: string
          cta_kind?: string | null
          facts_extracted?: number
          id?: string
          inferred_topics?: string[] | null
          mention_text: string
          mention_uri: string
          response_text?: string | null
          response_uri?: string | null
          routed_to?: string | null
        }
        Update: {
          author_did?: string
          author_handle?: string
          created_at?: string
          cta_kind?: string | null
          facts_extracted?: number
          id?: string
          inferred_topics?: string[] | null
          mention_text?: string
          mention_uri?: string
          response_text?: string | null
          response_uri?: string | null
          routed_to?: string | null
        }
        Relationships: []
      }
      bluesky_poll_state: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bluesky_proactive_posts: {
        Row: {
          audience_mode: string | null
          created_at: string
          cta_mode: string
          decision_notes: Json | null
          freshness_score: number | null
          grounding: string | null
          id: string
          intent: string | null
          lane: string
          post_cid: string | null
          post_uri: string | null
          publication_title: string | null
          publication_url: string | null
          quality_score: number | null
          rhetorical_pattern: string | null
          source_confidence: number | null
          source_kind: string | null
          staleness_flags: Json | null
          suppressed: boolean
          suppression_reason: string | null
          text: string
          topic_cluster: string | null
          topics: string[]
          usefulness_score: number | null
        }
        Insert: {
          audience_mode?: string | null
          created_at?: string
          cta_mode?: string
          decision_notes?: Json | null
          freshness_score?: number | null
          grounding?: string | null
          id?: string
          intent?: string | null
          lane: string
          post_cid?: string | null
          post_uri?: string | null
          publication_title?: string | null
          publication_url?: string | null
          quality_score?: number | null
          rhetorical_pattern?: string | null
          source_confidence?: number | null
          source_kind?: string | null
          staleness_flags?: Json | null
          suppressed?: boolean
          suppression_reason?: string | null
          text: string
          topic_cluster?: string | null
          topics?: string[]
          usefulness_score?: number | null
        }
        Update: {
          audience_mode?: string | null
          created_at?: string
          cta_mode?: string
          decision_notes?: Json | null
          freshness_score?: number | null
          grounding?: string | null
          id?: string
          intent?: string | null
          lane?: string
          post_cid?: string | null
          post_uri?: string | null
          publication_title?: string | null
          publication_url?: string | null
          quality_score?: number | null
          rhetorical_pattern?: string | null
          source_confidence?: number | null
          source_kind?: string | null
          staleness_flags?: Json | null
          suppressed?: boolean
          suppression_reason?: string | null
          text?: string
          topic_cluster?: string | null
          topics?: string[]
          usefulness_score?: number | null
        }
        Relationships: []
      }
      bluesky_topic_state: {
        Row: {
          id: string
          lane: string
          last_posted_at: string | null
          post_count_30d: number
          post_count_7d: number
          topic: string
          updated_at: string
        }
        Insert: {
          id?: string
          lane: string
          last_posted_at?: string | null
          post_count_30d?: number
          post_count_7d?: number
          topic: string
          updated_at?: string
        }
        Update: {
          id?: string
          lane?: string
          last_posted_at?: string | null
          post_count_30d?: number
          post_count_7d?: number
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      characters: {
        Row: {
          avatar_image_url: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          personality_tags: string[] | null
          updated_at: string | null
          user_id: string
          version: number | null
          voice_id: string | null
        }
        Insert: {
          avatar_image_url: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          personality_tags?: string[] | null
          updated_at?: string | null
          user_id: string
          version?: number | null
          voice_id?: string | null
        }
        Update: {
          avatar_image_url?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          personality_tags?: string[] | null
          updated_at?: string | null
          user_id?: string
          version?: number | null
          voice_id?: string | null
        }
        Relationships: []
      }
      claim_attributions: {
        Row: {
          asserted_at: string | null
          claim_node_id: string | null
          confidence_at_assertion: number | null
          context_description: string | null
          context_session_id: string | null
          created_at: string | null
          id: string
          retracted_at: string | null
          retracted_reason: string | null
          speaker_display_name: string | null
          speaker_id: string
        }
        Insert: {
          asserted_at?: string | null
          claim_node_id?: string | null
          confidence_at_assertion?: number | null
          context_description?: string | null
          context_session_id?: string | null
          created_at?: string | null
          id?: string
          retracted_at?: string | null
          retracted_reason?: string | null
          speaker_display_name?: string | null
          speaker_id: string
        }
        Update: {
          asserted_at?: string | null
          claim_node_id?: string | null
          confidence_at_assertion?: number | null
          context_description?: string | null
          context_session_id?: string | null
          created_at?: string | null
          id?: string
          retracted_at?: string | null
          retracted_reason?: string | null
          speaker_display_name?: string | null
          speaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_attributions_claim_node_id_fkey"
            columns: ["claim_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          import_id: string | null
          is_archived: boolean
          is_deleted: boolean
          operating_profile_id: string | null
          source_platform: string | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          import_id?: string | null
          is_archived?: boolean
          is_deleted?: boolean
          operating_profile_id?: string | null
          source_platform?: string | null
          title?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          import_id?: string | null
          is_archived?: boolean
          is_deleted?: boolean
          operating_profile_id?: string | null
          source_platform?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_operating_profile_id_fkey"
            columns: ["operating_profile_id"]
            isOneToOne: false
            referencedRelation: "operating_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          transaction_type?: Database["public"]["Enums"]["credit_transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "supporter_credits"
            referencedColumns: ["user_id"]
          },
        ]
      }
      dataset_registry: {
        Row: {
          artifact_path: string | null
          counts: Json
          created_at: string
          filters: Json
          git_sha: string | null
          id: string
          version_hash: string
          workflow_run_id: string | null
        }
        Insert: {
          artifact_path?: string | null
          counts?: Json
          created_at?: string
          filters?: Json
          git_sha?: string | null
          id?: string
          version_hash: string
          workflow_run_id?: string | null
        }
        Update: {
          artifact_path?: string | null
          counts?: Json
          created_at?: string
          filters?: Json
          git_sha?: string | null
          id?: string
          version_hash?: string
          workflow_run_id?: string | null
        }
        Relationships: []
      }
      dispatch_audit_trail: {
        Row: {
          created_at: string
          critic_decision: string | null
          dispatch_nonce: string
          downgraded: boolean | null
          id: string
          model: string | null
          provider: string | null
          result: string
          session_id: string
          stage: string
          task_type: string
          tier: string | null
          violations: Json | null
        }
        Insert: {
          created_at?: string
          critic_decision?: string | null
          dispatch_nonce: string
          downgraded?: boolean | null
          id?: string
          model?: string | null
          provider?: string | null
          result: string
          session_id: string
          stage: string
          task_type: string
          tier?: string | null
          violations?: Json | null
        }
        Update: {
          created_at?: string
          critic_decision?: string | null
          dispatch_nonce?: string
          downgraded?: boolean | null
          id?: string
          model?: string | null
          provider?: string | null
          result?: string
          session_id?: string
          stage?: string
          task_type?: string
          tier?: string | null
          violations?: Json | null
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string | null
          created_at: string | null
          document_id: string | null
          embedding_3076: string | null
          embedding_768: string | null
          id: string
        }
        Insert: {
          chunk_index: number
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          embedding_3076?: string | null
          embedding_768?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          embedding_3076?: string | null
          embedding_768?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "workspace_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_delta_audits: {
        Row: {
          audit_verdict: string
          created_at: string | null
          delta_payload: Json | null
          drift_score: number
          id: string
          new_document_id: string | null
          old_document_id: string | null
          workspace_id: string
        }
        Insert: {
          audit_verdict: string
          created_at?: string | null
          delta_payload?: Json | null
          drift_score: number
          id?: string
          new_document_id?: string | null
          old_document_id?: string | null
          workspace_id: string
        }
        Update: {
          audit_verdict?: string
          created_at?: string | null
          delta_payload?: Json | null
          drift_score?: number
          id?: string
          new_document_id?: string | null
          old_document_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_delta_audits_new_document_id_fkey"
            columns: ["new_document_id"]
            isOneToOne: false
            referencedRelation: "workspace_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_delta_audits_old_document_id_fkey"
            columns: ["old_document_id"]
            isOneToOne: false
            referencedRelation: "workspace_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      donations: {
        Row: {
          amount_donated: number
          created_at: string | null
          credits_gifted: number
          id: string
          message: string | null
          platform: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_donated: number
          created_at?: string | null
          credits_gifted: number
          id?: string
          message?: string | null
          platform?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_donated?: number
          created_at?: string | null
          credits_gifted?: number
          id?: string
          message?: string | null
          platform?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      enterprise_licenses: {
        Row: {
          activated_at: string | null
          contact_email: string
          created_at: string
          expires_at: string | null
          feature_gates: string[]
          id: string
          instance_id: string | null
          license_key: string
          max_nodes: number
          max_seats: number
          organization_name: string
          revoked: boolean
          tier: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          contact_email: string
          created_at?: string
          expires_at?: string | null
          feature_gates?: string[]
          id?: string
          instance_id?: string | null
          license_key: string
          max_nodes?: number
          max_seats?: number
          organization_name: string
          revoked?: boolean
          tier?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          contact_email?: string
          created_at?: string
          expires_at?: string | null
          feature_gates?: string[]
          id?: string
          instance_id?: string | null
          license_key?: string
          max_nodes?: number
          max_seats?: number
          organization_name?: string
          revoked?: boolean
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          feedback_text: string | null
          id: string
          input: string | null
          labels: Json
          message_id: string | null
          metadata: Json
          model: string | null
          output: string | null
          prompt_version: string | null
          rating: number | null
          retrieval_context_ids: Json
          session_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          feedback_text?: string | null
          id?: string
          input?: string | null
          labels?: Json
          message_id?: string | null
          metadata?: Json
          model?: string | null
          output?: string | null
          prompt_version?: string | null
          rating?: number | null
          retrieval_context_ids?: Json
          session_id?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          feedback_text?: string | null
          id?: string
          input?: string | null
          labels?: Json
          message_id?: string | null
          metadata?: Json
          model?: string | null
          output?: string | null
          prompt_version?: string | null
          rating?: number | null
          retrieval_context_ids?: Json
          session_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          project_id: string | null
          provider_job_id: string
          result_url: string | null
          status: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          project_id?: string | null
          provider_job_id: string
          result_url?: string | null
          status: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          project_id?: string | null
          provider_job_id?: string
          result_url?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_embeddings: {
        Row: {
          content_chunk: string
          created_at: string | null
          embedding: string
          file_path: string
          id: string
          metadata: Json | null
          repo_full_name: string
          workspace_id: string
        }
        Insert: {
          content_chunk: string
          created_at?: string | null
          embedding: string
          file_path: string
          id?: string
          metadata?: Json | null
          repo_full_name: string
          workspace_id: string
        }
        Update: {
          content_chunk?: string
          created_at?: string | null
          embedding?: string
          file_path?: string
          id?: string
          metadata?: Json | null
          repo_full_name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_embeddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      github_installations: {
        Row: {
          created_at: string
          id: string
          installation_id: number
          owner: string
          repos: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          installation_id: number
          owner: string
          repos?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          installation_id?: number
          owner?: string
          repos?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      github_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      github_repo_syncs: {
        Row: {
          files_indexed: number
          id: string
          inngest_run_id: string | null
          last_commit: string | null
          repo: string
          status: string
          synced_at: string
          user_id: string
        }
        Insert: {
          files_indexed?: number
          id?: string
          inngest_run_id?: string | null
          last_commit?: string | null
          repo: string
          status?: string
          synced_at?: string
          user_id: string
        }
        Update: {
          files_indexed?: number
          id?: string
          inngest_run_id?: string | null
          last_commit?: string | null
          repo?: string
          status?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      graph_edges: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          relation: string
          source_node_id: string | null
          target_node_id: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          relation: string
          source_node_id?: string | null
          target_node_id?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          relation?: string
          source_node_id?: string | null
          target_node_id?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_nodes: {
        Row: {
          created_at: string | null
          description: string | null
          embedding: string | null
          embedding_3072: string | null
          embedding_768: string | null
          embedding_model: string | null
          embedding_provider: string | null
          embedding_updated_at: string | null
          id: string
          metadata: Json | null
          name: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_3072?: string | null
          embedding_768?: string | null
          embedding_model?: string | null
          embedding_provider?: string | null
          embedding_updated_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_3072?: string | null
          embedding_768?: string | null
          embedding_model?: string | null
          embedding_provider?: string | null
          embedding_updated_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      harness_root_grants: {
        Row: {
          allow_destructive: boolean
          created_at: string
          id: string
          label: string
          path: string
          read_only: boolean
          user_id: string
          workspace_id: string
        }
        Insert: {
          allow_destructive?: boolean
          created_at?: string
          id?: string
          label: string
          path: string
          read_only?: boolean
          user_id: string
          workspace_id: string
        }
        Update: {
          allow_destructive?: boolean
          created_at?: string
          id?: string
          label?: string
          path?: string
          read_only?: boolean
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      harness_telemetry_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_type: string
          id: string
          operation_type: string | null
          path_accessed: string | null
          success: boolean
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          operation_type?: string | null
          path_accessed?: string | null
          success: boolean
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          operation_type?: string | null
          path_accessed?: string | null
          success?: boolean
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          error_log: Json | null
          extracted_facts: number | null
          id: string
          metadata: Json | null
          processed_conversations: number | null
          source_platform: string
          started_at: string | null
          status: string
          stored_memories: number | null
          total_conversations: number | null
          total_messages: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_log?: Json | null
          extracted_facts?: number | null
          id?: string
          metadata?: Json | null
          processed_conversations?: number | null
          source_platform: string
          started_at?: string | null
          status?: string
          stored_memories?: number | null
          total_conversations?: number | null
          total_messages?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_log?: Json | null
          extracted_facts?: number | null
          id?: string
          metadata?: Json | null
          processed_conversations?: number | null
          source_platform?: string
          started_at?: string | null
          status?: string
          stored_memories?: number | null
          total_conversations?: number | null
          total_messages?: number | null
          user_id?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          completed_at: string | null
          error_log: Json | null
          file_name: string | null
          file_size_bytes: number | null
          id: string
          imported_memories: number | null
          metadata: Json | null
          processed_conversations: number | null
          source_platform: string
          started_at: string | null
          status: string
          total_conversations: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_log?: Json | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          imported_memories?: number | null
          metadata?: Json | null
          processed_conversations?: number | null
          source_platform: string
          started_at?: string | null
          status: string
          total_conversations?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_log?: Json | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          imported_memories?: number | null
          metadata?: Json | null
          processed_conversations?: number | null
          source_platform?: string
          started_at?: string | null
          status?: string
          total_conversations?: number | null
          user_id?: string
        }
        Relationships: []
      }
      jepa_divergence_events: {
        Row: {
          circuit_state: string | null
          confidence: number | null
          created_at: string | null
          detail: string | null
          divergence: number | null
          event_type: string
          fallback_used: boolean | null
          id: string
          latency_ms: number | null
          predictor_id: string | null
          query_hash: string | null
        }
        Insert: {
          circuit_state?: string | null
          confidence?: number | null
          created_at?: string | null
          detail?: string | null
          divergence?: number | null
          event_type: string
          fallback_used?: boolean | null
          id?: string
          latency_ms?: number | null
          predictor_id?: string | null
          query_hash?: string | null
        }
        Update: {
          circuit_state?: string | null
          confidence?: number | null
          created_at?: string | null
          detail?: string | null
          divergence?: number | null
          event_type?: string
          fallback_used?: boolean | null
          id?: string
          latency_ms?: number | null
          predictor_id?: string | null
          query_hash?: string | null
        }
        Relationships: []
      }
      jepa_training_queue: {
        Row: {
          action: Json
          divergence: number
          divergence_event_id: string | null
          id: string
          initial_state: Json
          processed_at: string | null
          query_hash: string | null
          queued_at: string | null
          resulting_state: Json
          status: string
        }
        Insert: {
          action: Json
          divergence: number
          divergence_event_id?: string | null
          id?: string
          initial_state: Json
          processed_at?: string | null
          query_hash?: string | null
          queued_at?: string | null
          resulting_state: Json
          status?: string
        }
        Update: {
          action?: Json
          divergence?: number
          divergence_event_id?: string | null
          id?: string
          initial_state?: Json
          processed_at?: string | null
          query_hash?: string | null
          queued_at?: string | null
          resulting_state?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jepa_training_queue_divergence_event_id_fkey"
            columns: ["divergence_event_id"]
            isOneToOne: false
            referencedRelation: "jepa_divergence_events"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edges: {
        Row: {
          causal_strength: number | null
          confidence: number | null
          created_at: string
          id: string
          metadata: Json
          relationship_type: string
          source_id: string
          target_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          weight: number
        }
        Insert: {
          causal_strength?: number | null
          confidence?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          relationship_type?: string
          source_id: string
          target_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weight?: number
        }
        Update: {
          causal_strength?: number | null
          confidence?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          relationship_type?: string
          source_id?: string
          target_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_nodes: {
        Row: {
          aliases: string[]
          canonical_name: string | null
          confidence: number | null
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          node_type: string
          source_type: string | null
          source_url: string | null
          superseded_by: string | null
          updated_at: string
          user_id: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          aliases?: string[]
          canonical_name?: string | null
          confidence?: number | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          node_type?: string
          source_type?: string | null
          source_url?: string | null
          superseded_by?: string | null
          updated_at?: string
          user_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          aliases?: string[]
          canonical_name?: string | null
          confidence?: number | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          node_type?: string
          source_type?: string | null
          source_url?: string | null
          superseded_by?: string | null
          updated_at?: string
          user_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_nodes_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      kofi_donations: {
        Row: {
          amount_usd: number | null
          created_at: string | null
          id: string
          is_processed: boolean | null
          kofi_transaction_id: string
          tier_name: string | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          amount_usd?: number | null
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          kofi_transaction_id: string
          tier_name?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          amount_usd?: number | null
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          kofi_transaction_id?: string
          tier_name?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      lambda_events: {
        Row: {
          created_at: string | null
          detail: string | null
          event: string
          id: number
          ts: number | null
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          event: string
          id?: number
          ts?: number | null
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          event?: string
          id?: number
          ts?: number | null
        }
        Relationships: []
      }
      lambda_state: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      learned_knowledge: {
        Row: {
          confidence: number | null
          expires_at: string | null
          extracted_at: string | null
          fact: string
          fact_embedding: string | null
          id: string
          source_type: string
          source_url: string | null
          topic: string
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          expires_at?: string | null
          extracted_at?: string | null
          fact: string
          fact_embedding?: string | null
          id?: string
          source_type: string
          source_url?: string | null
          topic: string
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          expires_at?: string | null
          extracted_at?: string | null
          fact?: string
          fact_embedding?: string | null
          id?: string
          source_type?: string
          source_url?: string | null
          topic?: string
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      learning_patterns: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          last_used: string | null
          query_embedding: string | null
          query_pattern: string
          query_type: string
          result_summary: string | null
          successful_approach: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          last_used?: string | null
          query_embedding?: string | null
          query_pattern: string
          query_type: string
          result_summary?: string | null
          successful_approach: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          last_used?: string | null
          query_embedding?: string | null
          query_pattern?: string
          query_type?: string
          result_summary?: string | null
          successful_approach?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          agent_error: string | null
          classification: string | null
          classification_summary: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          pr_number: number | null
          pr_url: string | null
          resolution_status: string | null
          source: string
          timestamp: string
          updated_at: string | null
        }
        Insert: {
          agent_error?: string | null
          classification?: string | null
          classification_summary?: string | null
          id?: string
          level?: string
          message: string
          metadata?: Json | null
          pr_number?: number | null
          pr_url?: string | null
          resolution_status?: string | null
          source?: string
          timestamp?: string
          updated_at?: string | null
        }
        Update: {
          agent_error?: string | null
          classification?: string | null
          classification_summary?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          pr_number?: number | null
          pr_url?: string | null
          resolution_status?: string | null
          source?: string
          timestamp?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      memory_bank: {
        Row: {
          confidence: number | null
          content: string
          embedding: string | null
          embedding_3072: string | null
          embedding_768: string | null
          embedding_model: string | null
          embedding_provider: string | null
          embedding_updated_at: string | null
          expires_at: string | null
          extracted_at: string | null
          extraction_type: string | null
          id: string
          import_job_id: string | null
          last_accessed_at: string | null
          metadata: Json | null
          original_timestamp: string | null
          reward_score: number | null
          scope: string | null
          source_conversation_id: string | null
          source_platform: string | null
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          content: string
          embedding?: string | null
          embedding_3072?: string | null
          embedding_768?: string | null
          embedding_model?: string | null
          embedding_provider?: string | null
          embedding_updated_at?: string | null
          expires_at?: string | null
          extracted_at?: string | null
          extraction_type?: string | null
          id?: string
          import_job_id?: string | null
          last_accessed_at?: string | null
          metadata?: Json | null
          original_timestamp?: string | null
          reward_score?: number | null
          scope?: string | null
          source_conversation_id?: string | null
          source_platform?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          content?: string
          embedding?: string | null
          embedding_3072?: string | null
          embedding_768?: string | null
          embedding_model?: string | null
          embedding_provider?: string | null
          embedding_updated_at?: string | null
          expires_at?: string | null
          extracted_at?: string | null
          extraction_type?: string | null
          id?: string
          import_job_id?: string | null
          last_accessed_at?: string | null
          metadata?: Json | null
          original_timestamp?: string | null
          reward_score?: number | null
          scope?: string | null
          source_conversation_id?: string | null
          source_platform?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_bank_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_bank_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_bank_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations_with_recovery"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_bank_old: {
        Row: {
          confidence: number | null
          content: string
          embedding: string | null
          expires_at: string | null
          extracted_at: string
          id: string
          metadata: Json | null
          scope: string
          type: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          content: string
          embedding?: string | null
          expires_at?: string | null
          extracted_at?: string
          id?: string
          metadata?: Json | null
          scope?: string
          type?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          content?: string
          embedding?: string | null
          expires_at?: string | null
          extracted_at?: string
          id?: string
          metadata?: Json | null
          scope?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations_with_recovery"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_models: {
        Row: {
          accuracy: number | null
          class_names: string[] | null
          created_at: string | null
          feature_names: string[]
          id: string
          model_type: string
          name: string
          notes: string | null
          sample_count: number | null
          serialized_model: Json
          trained_at: string | null
          version: string
        }
        Insert: {
          accuracy?: number | null
          class_names?: string[] | null
          created_at?: string | null
          feature_names: string[]
          id?: string
          model_type: string
          name: string
          notes?: string | null
          sample_count?: number | null
          serialized_model: Json
          trained_at?: string | null
          version: string
        }
        Update: {
          accuracy?: number | null
          class_names?: string[] | null
          created_at?: string | null
          feature_names?: string[]
          id?: string
          model_type?: string
          name?: string
          notes?: string | null
          sample_count?: number | null
          serialized_model?: Json
          trained_at?: string | null
          version?: string
        }
        Relationships: []
      }
      ml_training_examples: {
        Row: {
          confidence: number | null
          created_at: string | null
          features: Json
          id: string
          label: string
          label_source: string
          model_name: string
          used_in_training: boolean | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          features: Json
          id?: string
          label: string
          label_source: string
          model_name: string
          used_in_training?: boolean | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          features?: Json
          id?: string
          label?: string
          label_source?: string
          model_name?: string
          used_in_training?: boolean | null
        }
        Relationships: []
      }
      operating_profiles: {
        Row: {
          allow_agentic_runs: boolean
          allow_external_actions: boolean
          artifact_bias: string
          citation_preference: boolean
          context_window_budget: string
          cost_sensitivity: string
          created_at: string
          default_output_style: string
          description: string | null
          id: string
          is_default: boolean
          is_system_preset: boolean
          latency_preference: string
          memory_aggressiveness: string
          memory_policies: Json
          mode: string
          name: string
          premium_escalation_policy: string
          retrieval_depth: string
          review_before_action: boolean
          routing_overrides: Json
          slug: string
          tool_policies: Json
          tool_use_level: string
          ui_preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_agentic_runs?: boolean
          allow_external_actions?: boolean
          artifact_bias?: string
          citation_preference?: boolean
          context_window_budget?: string
          cost_sensitivity?: string
          created_at?: string
          default_output_style?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_system_preset?: boolean
          latency_preference?: string
          memory_aggressiveness?: string
          memory_policies?: Json
          mode?: string
          name: string
          premium_escalation_policy?: string
          retrieval_depth?: string
          review_before_action?: boolean
          routing_overrides?: Json
          slug: string
          tool_policies?: Json
          tool_use_level?: string
          ui_preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_agentic_runs?: boolean
          allow_external_actions?: boolean
          artifact_bias?: string
          citation_preference?: boolean
          context_window_budget?: string
          cost_sensitivity?: string
          created_at?: string
          default_output_style?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_system_preset?: boolean
          latency_preference?: string
          memory_aggressiveness?: string
          memory_policies?: Json
          mode?: string
          name?: string
          premium_escalation_policy?: string
          retrieval_depth?: string
          review_before_action?: boolean
          routing_overrides?: Json
          slug?: string
          tool_policies?: Json
          tool_use_level?: string
          ui_preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_role_permissions: {
        Row: {
          created_at: string
          permission: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          created_at?: string
          permission: string
          role: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          created_at?: string
          permission?: string
          role?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_keys: {
        Row: {
          created_at: string
          environment: string
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_min: number
          revoked: boolean
          scopes: string[]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          environment?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          rate_limit_per_min?: number
          revoked?: boolean
          scopes?: string[]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          environment?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_min?: number
          revoked?: boolean
          scopes?: string[]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_usage: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          key_id: string
          latency_ms: number
          method: string
          model_used: string | null
          status_code: number
          tokens_in: number
          tokens_out: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          key_id: string
          latency_ms?: number
          method?: string
          model_used?: string | null
          status_code: number
          tokens_in?: number
          tokens_out?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          key_id?: string
          latency_ms?: number
          method?: string
          model_used?: string | null
          status_code?: number
          tokens_in?: number
          tokens_out?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_usage_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "partner_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_webhook_log: {
        Row: {
          attempt_number: number
          created_at: string
          duration_ms: number | null
          event_type: string
          id: string
          payload_body: Json
          response_body: string | null
          response_status: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          event_type: string
          id?: string
          payload_body: Json
          response_body?: string | null
          response_status?: number | null
          success: boolean
          webhook_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          event_type?: string
          id?: string
          payload_body?: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_webhook_log_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "partner_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_webhooks: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          endpoint_url: string
          events: string[]
          id: string
          key_id: string
          signing_secret: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          endpoint_url: string
          events?: string[]
          id?: string
          key_id: string
          signing_secret: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          endpoint_url?: string
          events?: string[]
          id?: string
          key_id?: string
          signing_secret?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_webhooks_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "partner_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: string
          created_at: string
          email: string
          id: string
          transaction_id: string
        }
        Insert: {
          amount: string
          created_at?: string
          email: string
          id?: string
          transaction_id: string
        }
        Update: {
          amount?: string
          created_at?: string
          email?: string
          id?: string
          transaction_id?: string
        }
        Relationships: []
      }
      persona_chain_links: {
        Row: {
          document_id: string
          id: string
          nonce: string
          previous_version_hash: string
          timestamp: string
          transition_name: string
          version_hash: string
        }
        Insert: {
          document_id: string
          id?: string
          nonce: string
          previous_version_hash: string
          timestamp?: string
          transition_name: string
          version_hash: string
        }
        Update: {
          document_id?: string
          id?: string
          nonce?: string
          previous_version_hash?: string
          timestamp?: string
          transition_name?: string
          version_hash?: string
        }
        Relationships: []
      }
      persona_documents: {
        Row: {
          allowed_namespaces: string[]
          created_at: string
          document_id: string
          forbidden_namespaces: string[]
          id: string
          nonce: string
          previous_version_hash: string
          signature_hash: string
          state: string
          tone_lock: string
          transition_audit: Json
          updated_at: string
        }
        Insert: {
          allowed_namespaces?: string[]
          created_at?: string
          document_id: string
          forbidden_namespaces?: string[]
          id: string
          nonce: string
          previous_version_hash: string
          signature_hash: string
          state: string
          tone_lock?: string
          transition_audit?: Json
          updated_at?: string
        }
        Update: {
          allowed_namespaces?: string[]
          created_at?: string
          document_id?: string
          forbidden_namespaces?: string[]
          id?: string
          nonce?: string
          previous_version_hash?: string
          signature_hash?: string
          state?: string
          tone_lock?: string
          transition_audit?: Json
          updated_at?: string
        }
        Relationships: []
      }
      preview_sessions: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          language: string
          rendered_output: string | null
          status: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          rendered_output?: string | null
          status?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          rendered_output?: string | null
          status?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      provider_health: {
        Row: {
          failure_count: number
          last_checked: string
          last_failure_at: string | null
          last_failure_reason: string | null
          provider_key: string
          status: string
        }
        Insert: {
          failure_count?: number
          last_checked?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          provider_key: string
          status?: string
        }
        Update: {
          failure_count?: number
          last_checked?: string
          last_failure_at?: string | null
          last_failure_reason?: string | null
          provider_key?: string
          status?: string
        }
        Relationships: []
      }
      rag_usage: {
        Row: {
          cost_usd: number | null
          created_at: string | null
          id: string
          metadata: Json | null
          operation_type: string
          tokens_used: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string | null
          id: string
          metadata?: Json | null
          operation_type: string
          tokens_used?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          operation_type?: string
          tokens_used?: number | null
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          bonus_multiplier: number
          code: string
          created_at: string
          creator_handle: string
          creator_name: string | null
          email: string
          id: string
          is_active: boolean
          notes: string | null
          paypal_email: string | null
          track: string
        }
        Insert: {
          bonus_multiplier?: number
          code: string
          created_at?: string
          creator_handle: string
          creator_name?: string | null
          email: string
          id?: string
          is_active?: boolean
          notes?: string | null
          paypal_email?: string | null
          track?: string
        }
        Update: {
          bonus_multiplier?: number
          code?: string
          created_at?: string
          creator_handle?: string
          creator_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          paypal_email?: string | null
          track?: string
        }
        Relationships: []
      }
      referral_events: {
        Row: {
          amount_usd: number | null
          code: string
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          platform: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          amount_usd?: number | null
          code: string
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          platform?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          amount_usd?: number | null
          code?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          platform?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_events_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "referral_events_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "referral_summary"
            referencedColumns: ["code"]
          },
        ]
      }
      referral_payouts: {
        Row: {
          bonus_multiplier: number
          code: string
          conversion_payout_usd: number | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          signup_count: number
          signup_payout_usd: number | null
          status: string
          total_usd: number | null
          upgrade_count: number
          view_payout_usd: number
        }
        Insert: {
          bonus_multiplier?: number
          code: string
          conversion_payout_usd?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          signup_count?: number
          signup_payout_usd?: number | null
          status?: string
          total_usd?: number | null
          upgrade_count?: number
          view_payout_usd?: number
        }
        Update: {
          bonus_multiplier?: number
          code?: string
          conversion_payout_usd?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          signup_count?: number
          signup_payout_usd?: number | null
          status?: string
          total_usd?: number | null
          upgrade_count?: number
          view_payout_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "referral_payouts_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "referral_summary"
            referencedColumns: ["code"]
          },
        ]
      }
      relay_commands: {
        Row: {
          action_type: string
          created_at: string
          device_id: string
          id: string
          payload: Json
          requires_approval: boolean | null
          result_payload: Json | null
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          device_id: string
          id?: string
          payload?: Json
          requires_approval?: boolean | null
          result_payload?: Json | null
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          device_id?: string
          id?: string
          payload?: Json
          requires_approval?: boolean | null
          result_payload?: Json | null
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relay_devices: {
        Row: {
          created_at: string
          device_id: string
          device_name: string
          last_seen_at: string
          platform: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string
          last_seen_at?: string
          platform?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string
          last_seen_at?: string
          platform?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relay_observations: {
        Row: {
          active_app: string | null
          battery_state: string | null
          created_at: string
          device_id: string
          file_context: Json | null
          id: string
          network_class: string | null
          platform: string
          screen_context_summary: string | null
          user_id: string
        }
        Insert: {
          active_app?: string | null
          battery_state?: string | null
          created_at?: string
          device_id: string
          file_context?: Json | null
          id?: string
          network_class?: string | null
          platform: string
          screen_context_summary?: string | null
          user_id: string
        }
        Update: {
          active_app?: string | null
          battery_state?: string | null
          created_at?: string
          device_id?: string
          file_context?: Json | null
          id?: string
          network_class?: string | null
          platform?: string
          screen_context_summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      relay_sessions: {
        Row: {
          created_at: string
          device_id: string | null
          fts: unknown
          id: string
          raw_trajectory: Json | null
          response_summary: string | null
          reward_score: number | null
          status: string | null
          task_description: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          fts?: unknown
          id?: string
          raw_trajectory?: Json | null
          response_summary?: string | null
          reward_score?: number | null
          status?: string | null
          task_description: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          fts?: unknown
          id?: string
          raw_trajectory?: Json | null
          response_summary?: string | null
          reward_score?: number | null
          status?: string | null
          task_description?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relay_skills: {
        Row: {
          confidence_threshold: number | null
          created_at: string
          id: string
          requires_approval: boolean | null
          trigger_embedding_3072: string | null
          trigger_embedding_768: string | null
          trigger_pattern: string
          updated_at: string
          version: number | null
        }
        Insert: {
          confidence_threshold?: number | null
          created_at?: string
          id: string
          requires_approval?: boolean | null
          trigger_embedding_3072?: string | null
          trigger_embedding_768?: string | null
          trigger_pattern: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          confidence_threshold?: number | null
          created_at?: string
          id?: string
          requires_approval?: boolean | null
          trigger_embedding_3072?: string | null
          trigger_embedding_768?: string | null
          trigger_pattern?: string
          updated_at?: string
          version?: number | null
        }
        Relationships: []
      }
      slack_indexed_channels: {
        Row: {
          channel_id: string
          channel_name: string
          created_at: string | null
          created_by_slack_user: string | null
          enabled: boolean | null
          id: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          channel_name: string
          created_at?: string | null
          created_by_slack_user?: string | null
          enabled?: boolean | null
          id?: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          channel_name?: string
          created_at?: string | null
          created_by_slack_user?: string | null
          enabled?: boolean | null
          id?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      slack_indexed_messages: {
        Row: {
          channel_id: string
          created_at: string | null
          id: string
          message_ts: string
          team_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: string
          message_ts: string
          team_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: string
          message_ts?: string
          team_id?: string
        }
        Relationships: []
      }
      slack_indexer_logs: {
        Row: {
          action: string
          channel_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          messages_indexed: number | null
          messages_skipped: number | null
          team_id: string | null
        }
        Insert: {
          action: string
          channel_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          messages_indexed?: number | null
          messages_skipped?: number | null
          team_id?: string | null
        }
        Update: {
          action?: string
          channel_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          messages_indexed?: number | null
          messages_skipped?: number | null
          team_id?: string | null
        }
        Relationships: []
      }
      slack_integrations: {
        Row: {
          access_token: string
          bot_user_id: string | null
          created_at: string
          id: string
          slack_team_id: string
          slack_team_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token: string
          bot_user_id?: string | null
          created_at?: string
          id?: string
          slack_team_id: string
          slack_team_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string
          bot_user_id?: string | null
          created_at?: string
          id?: string
          slack_team_id?: string
          slack_team_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      supporter_credits: {
        Row: {
          credit_balance: number | null
          email: string | null
          is_supporter: boolean | null
          referral_captured_at: string | null
          referral_code: string | null
          tier: string
          total_donated_usd: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          credit_balance?: number | null
          email?: string | null
          is_supporter?: boolean | null
          referral_captured_at?: string | null
          referral_code?: string | null
          tier?: string
          total_donated_usd?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          credit_balance?: number | null
          email?: string | null
          is_supporter?: boolean | null
          referral_captured_at?: string | null
          referral_code?: string | null
          tier?: string
          total_donated_usd?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ucol_critic_verdicts: {
        Row: {
          checks: Json
          created_at: string | null
          id: string
          latency_ms: number | null
          output_preview: string | null
          overall_reason: string | null
          severity: string
          task_type: string | null
          user_id: string | null
        }
        Insert: {
          checks?: Json
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          output_preview?: string | null
          overall_reason?: string | null
          severity: string
          task_type?: string | null
          user_id?: string | null
        }
        Update: {
          checks?: Json
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          output_preview?: string | null
          overall_reason?: string | null
          severity?: string
          task_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ucol_procedural_memory: {
        Row: {
          avg_latency_ms: number
          confidence: number | null
          created_at: string | null
          failure_count: number
          id: string
          last_used_at: string | null
          promoted_at: string | null
          success_count: number
          task_description: string
          task_signature: string | null
          task_type: string
          tool_sequence: Json
          user_id: string
        }
        Insert: {
          avg_latency_ms?: number
          confidence?: number | null
          created_at?: string | null
          failure_count?: number
          id?: string
          last_used_at?: string | null
          promoted_at?: string | null
          success_count?: number
          task_description: string
          task_signature?: string | null
          task_type: string
          tool_sequence?: Json
          user_id: string
        }
        Update: {
          avg_latency_ms?: number
          confidence?: number | null
          created_at?: string | null
          failure_count?: number
          id?: string
          last_used_at?: string | null
          promoted_at?: string | null
          success_count?: number
          task_description?: string
          task_signature?: string | null
          task_type?: string
          tool_sequence?: Json
          user_id?: string
        }
        Relationships: []
      }
      ucol_routing_telemetry: {
        Row: {
          created_at: string
          estimated_cost_usd: number | null
          execution_mode: string
          graph_hits: number | null
          id: string
          intent_category: string
          latency_ms: number | null
          memory_hits: number | null
          notes: string | null
          operating_profile_id: string | null
          outcome: string
          read_scopes: Json
          request_id: string
          route_timestamp: string
          selected_model_refs: Json
          selected_tools: Json
          user_correction_signal: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number | null
          execution_mode: string
          graph_hits?: number | null
          id: string
          intent_category: string
          latency_ms?: number | null
          memory_hits?: number | null
          notes?: string | null
          operating_profile_id?: string | null
          outcome: string
          read_scopes?: Json
          request_id: string
          route_timestamp?: string
          selected_model_refs?: Json
          selected_tools?: Json
          user_correction_signal?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number | null
          execution_mode?: string
          graph_hits?: number | null
          id?: string
          intent_category?: string
          latency_ms?: number | null
          memory_hits?: number | null
          notes?: string | null
          operating_profile_id?: string | null
          outcome?: string
          read_scopes?: Json
          request_id?: string
          route_timestamp?: string
          selected_model_refs?: Json
          selected_tools?: Json
          user_correction_signal?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      ucol_state_diffs: {
        Row: {
          args: Json
          command: string
          created_at: string | null
          delta: string[] | null
          id: string
          latency_ms: number | null
          procedure_id: string | null
          state_after: Json | null
          state_before: Json | null
          success: boolean
          tool: string
          user_id: string
        }
        Insert: {
          args?: Json
          command: string
          created_at?: string | null
          delta?: string[] | null
          id?: string
          latency_ms?: number | null
          procedure_id?: string | null
          state_after?: Json | null
          state_before?: Json | null
          success?: boolean
          tool: string
          user_id: string
        }
        Update: {
          args?: Json
          command?: string
          created_at?: string | null
          delta?: string[] | null
          id?: string
          latency_ms?: number | null
          procedure_id?: string | null
          state_after?: Json | null
          state_before?: Json | null
          success?: boolean
          tool?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucol_state_diffs_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "ucol_procedural_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      ucol_workflows: {
        Row: {
          created_at: string
          current_step: string
          error_state: string | null
          id: string
          idempotency_key: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_step: string
          error_state?: string | null
          id: string
          idempotency_key: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_step?: string
          error_state?: string | null
          id?: string
          idempotency_key?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string | null
          secret_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          secret_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          secret_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          access_token_encrypted: string
          id: string
          is_connected: boolean | null
          metadata: Json | null
          refresh_token_encrypted: string | null
          scopes: string[] | null
          service_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          id?: string
          is_connected?: boolean | null
          metadata?: Json | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          service_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          id?: string
          is_connected?: boolean | null
          metadata?: Json | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          service_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          memory_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          memory_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          memory_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_provider_api_keys: {
        Row: {
          created_at: string | null
          provider: string
          secret_id: string
          secret_preview: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          provider: string
          secret_id: string
          secret_preview?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          provider?: string
          secret_id?: string
          secret_preview?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          preferred_image_model: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          preferred_image_model?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          preferred_image_model?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_token_budgets: {
        Row: {
          id: string
          last_model: string | null
          month_key: string
          tokens_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_model?: string | null
          month_key: string
          tokens_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_model?: string | null
          month_key?: string
          tokens_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_projects: {
        Row: {
          audio_url: string | null
          character_id: string | null
          created_at: string | null
          current_step: string | null
          id: string
          metadata: Json | null
          script_content: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          character_id?: string | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          metadata?: Json | null
          script_content?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          character_id?: string | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          metadata?: Json | null
          script_content?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_projects_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      wm_benchmark_results: {
        Row: {
          audit: Json
          composite_score: number
          created_at: string
          dimensions: Json
          domain: string
          id: string
          latency_ms: number
          model: string
          processed_by_feedback_loop: boolean
          routing_decision_id: string | null
          session_id: string
        }
        Insert: {
          audit?: Json
          composite_score: number
          created_at?: string
          dimensions?: Json
          domain: string
          id?: string
          latency_ms: number
          model: string
          processed_by_feedback_loop?: boolean
          routing_decision_id?: string | null
          session_id: string
        }
        Update: {
          audit?: Json
          composite_score?: number
          created_at?: string
          dimensions?: Json
          domain?: string
          id?: string
          latency_ms?: number
          model?: string
          processed_by_feedback_loop?: boolean
          routing_decision_id?: string | null
          session_id?: string
        }
        Relationships: []
      }
      wm_edges: {
        Row: {
          action: Json
          created_at: string
          embedding_dim: number
          embedding_model: string
          id: number
          user_id: string
          v_x: string
          v_y: string
          workspace_id: string
        }
        Insert: {
          action?: Json
          created_at?: string
          embedding_dim?: number
          embedding_model?: string
          id?: number
          user_id: string
          v_x: string
          v_y: string
          workspace_id: string
        }
        Update: {
          action?: Json
          created_at?: string
          embedding_dim?: number
          embedding_model?: string
          id?: number
          user_id?: string
          v_x?: string
          v_y?: string
          workspace_id?: string
        }
        Relationships: []
      }
      wm_events: {
        Row: {
          context_version_id: string | null
          created_at: string
          entity_id: string
          event_type: Database["public"]["Enums"]["wm_event_type"]
          id: string
          payload: Json
          source_model: string
          trust_tier: Database["public"]["Enums"]["trust_tier"]
        }
        Insert: {
          context_version_id?: string | null
          created_at?: string
          entity_id: string
          event_type: Database["public"]["Enums"]["wm_event_type"]
          id?: string
          payload: Json
          source_model: string
          trust_tier?: Database["public"]["Enums"]["trust_tier"]
        }
        Update: {
          context_version_id?: string | null
          created_at?: string
          entity_id?: string
          event_type?: Database["public"]["Enums"]["wm_event_type"]
          id?: string
          payload?: Json
          source_model?: string
          trust_tier?: Database["public"]["Enums"]["trust_tier"]
        }
        Relationships: []
      }
      wm_model_routing_weights: {
        Row: {
          demoted: boolean
          demotion_reason: string | null
          domain: string
          model: string
          routing_weight: number
          updated_at: string
        }
        Insert: {
          demoted?: boolean
          demotion_reason?: string | null
          domain: string
          model: string
          routing_weight?: number
          updated_at?: string
        }
        Update: {
          demoted?: boolean
          demotion_reason?: string | null
          domain?: string
          model?: string
          routing_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      wm_query_fingerprints: {
        Row: {
          created_at: string
          domain: string
          id: string
          keywords: string[]
          model_used: string
          session_id: string
          subdomain: string | null
          timestamp: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          keywords?: string[]
          model_used: string
          session_id: string
          subdomain?: string | null
          timestamp?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          keywords?: string[]
          model_used?: string
          session_id?: string
          subdomain?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      wm_staleness_events: {
        Row: {
          created_at: string
          domain: string
          graph_staleness_hours: number
          id: string
          js_divergence: number
          recommended_action: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          domain: string
          graph_staleness_hours: number
          id?: string
          js_divergence: number
          recommended_action: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
        }
        Update: {
          created_at?: string
          domain?: string
          graph_staleness_hours?: number
          id?: string
          js_divergence?: number
          recommended_action?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: []
      }
      workspace_documents: {
        Row: {
          content_raw: string | null
          created_at: string | null
          embedding_tier: Database["public"]["Enums"]["embedding_tier_enum"]
          filename: string
          id: string
          mime_type: string
          parent_id: string | null
          storage_state:
            | Database["public"]["Enums"]["storage_state_enum"]
            | null
          storage_uri: string | null
          updated_at: string | null
          user_id: string
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          content_raw?: string | null
          created_at?: string | null
          embedding_tier: Database["public"]["Enums"]["embedding_tier_enum"]
          filename: string
          id?: string
          mime_type: string
          parent_id?: string | null
          storage_state?:
            | Database["public"]["Enums"]["storage_state_enum"]
            | null
          storage_uri?: string | null
          updated_at?: string | null
          user_id: string
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          content_raw?: string | null
          created_at?: string | null
          embedding_tier?: Database["public"]["Enums"]["embedding_tier_enum"]
          filename?: string
          id?: string
          mime_type?: string
          parent_id?: string | null
          storage_state?:
            | Database["public"]["Enums"]["storage_state_enum"]
            | null
          storage_uri?: string | null
          updated_at?: string | null
          user_id?: string
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_documents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "workspace_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          role: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_personas: {
        Row: {
          content: string
          created_at: string
          id: string
          model: string
          name: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          model?: string
          name?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          model?: string
          name?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_personas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_repositories: {
        Row: {
          created_at: string
          id: string
          provider: string
          repo_full_name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider?: string
          repo_full_name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          repo_full_name?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_sources: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          origin_uri: string | null
          raw_text: string | null
          source_type: string
          title: string | null
          updated_at: string
          user_id: string
          valid_from: string
          valid_until: string | null
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          origin_uri?: string | null
          raw_text?: string | null
          source_type?: string
          title?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string
          valid_until?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          origin_uri?: string | null
          raw_text?: string | null
          source_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string
          valid_until?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_state: {
        Row: {
          last_open_conversation_id: string | null
          last_open_tab: string
          pinned_artifact_ids: Json
          pinned_memory_ids: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          last_open_conversation_id?: string | null
          last_open_tab?: string
          pinned_artifact_ids?: Json
          pinned_memory_ids?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          last_open_conversation_id?: string | null
          last_open_tab?: string
          pinned_artifact_ids?: Json
          pinned_memory_ids?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          active_github_repo: string | null
          color: string | null
          created_at: string
          default_operating_profile_id: string | null
          description: string | null
          icon: string | null
          id: string
          is_default: boolean
          kind: string
          last_opened_at: string
          memory_profile: Json
          name: string
          onboarding_state: string
          org_id: string | null
          routing_profile: Json
          slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_github_repo?: string | null
          color?: string | null
          created_at?: string
          default_operating_profile_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          last_opened_at?: string
          memory_profile?: Json
          name: string
          onboarding_state?: string
          org_id?: string | null
          routing_profile?: Json
          slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_github_repo?: string | null
          color?: string | null
          created_at?: string
          default_operating_profile_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          last_opened_at?: string
          memory_profile?: Json
          name?: string
          onboarding_state?: string
          org_id?: string | null
          routing_profile?: Json
          slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_default_operating_profile_id_fkey"
            columns: ["default_operating_profile_id"]
            isOneToOne: false
            referencedRelation: "operating_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      world_state_snapshots: {
        Row: {
          attribute: string
          captured_at: string | null
          changed_by: string | null
          confidence: number | null
          entity_id: string | null
          id: string
          previous_value: Json | null
          source: string | null
          value: Json
        }
        Insert: {
          attribute: string
          captured_at?: string | null
          changed_by?: string | null
          confidence?: number | null
          entity_id?: string | null
          id?: string
          previous_value?: Json | null
          source?: string | null
          value: Json
        }
        Update: {
          attribute?: string
          captured_at?: string | null
          changed_by?: string | null
          confidence?: number | null
          entity_id?: string | null
          id?: string
          previous_value?: Json | null
          source?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "world_state_snapshots_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      conversations_with_recovery: {
        Row: {
          created_at: string | null
          days_until_purge: number | null
          deleted_at: string | null
          id: string | null
          is_archived: boolean | null
          is_deleted: boolean | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          days_until_purge?: never
          deleted_at?: string | null
          id?: string | null
          is_archived?: boolean | null
          is_deleted?: boolean | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          days_until_purge?: never
          deleted_at?: string | null
          id?: string | null
          is_archived?: boolean | null
          is_deleted?: boolean | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      current_month_token_usage: {
        Row: {
          last_model: string | null
          tokens_used: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          last_model?: string | null
          tokens_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          last_model?: string | null
          tokens_used?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      model_truth_scores: {
        Row: {
          avg_delta_score: number | null
          confirmed_rate: number | null
          domain: string | null
          hallucination_rate: number | null
          last_evaluated: string | null
          misattribution_rate: number | null
          model: string | null
          supported_rate: number | null
          total_claims: number | null
        }
        Relationships: []
      }
      recent_critical_events: {
        Row: {
          action: string | null
          created_at: string | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      referral_summary: {
        Row: {
          bonus_multiplier: number | null
          code: string | null
          creator_handle: string | null
          first_event_at: string | null
          last_event_at: string | null
          total_revenue_usd: number | null
          total_signups: number | null
          total_upgrades: number | null
          total_visits: number | null
          track: string | null
        }
        Relationships: []
      }
      user_audit_summary: {
        Row: {
          action: string | null
          event_count: number | null
          last_seen: string | null
          user_id: string | null
        }
        Relationships: []
      }
      wm_current_entities: {
        Row: {
          current_payload: Json | null
          current_trust_tier: Database["public"]["Enums"]["trust_tier"] | null
          entity_id: string | null
          last_context_version: string | null
          last_modified_by: string | null
          last_updated_at: string | null
          latest_event_type: Database["public"]["Enums"]["wm_event_type"] | null
        }
        Relationships: []
      }
      wm_edges_view: {
        Row: {
          causal_strength: number | null
          confidence: number | null
          delta: Json | null
          id: string | null
          relation: string | null
          relationship_type: string | null
          source_node_id: string | null
          target_node_id: string | null
          trust_tier: Database["public"]["Enums"]["trust_tier"] | null
          user_id: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Relationships: []
      }
      wm_nodes_view: {
        Row: {
          description: string | null
          id: string | null
          metadata: Json | null
          name: string | null
          trust_tier: Database["public"]["Enums"]["trust_tier"] | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      commit_document_archival: {
        Args: { p_document_id: string; p_storage_uri: string }
        Returns: undefined
      }
      delete_user_provider_api_key: {
        Args: { p_provider: string; p_user_id: string }
        Returns: undefined
      }
      detect_workspace_source_delta: {
        Args: {
          new_embeddings: string[]
          similarity_threshold?: number
          target_origin_uri: string
          target_workspace_id: string
        }
        Returns: Database["public"]["Enums"]["workspace_source_delta_verdict"]
      }
      enqueue_high_divergence_events: {
        Args: {
          batch_size?: number
          min_divergence?: number
          older_than_minutes?: number
        }
        Returns: {
          action: Json
          divergence: number
          divergence_event_id: string | null
          id: string
          initial_state: Json
          processed_at: string | null
          query_hash: string | null
          queued_at: string | null
          resulting_state: Json
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jepa_training_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_causal_chain: {
        Args: {
          p_max_depth?: number
          p_min_causal_strength?: number
          p_root_node_id: string
        }
        Returns: {
          causal_strength: number
          confidence: number
          depth: number
          relationship_type: string
          source_node_id: string
          target_node_id: string
          valid_from: string
          valid_until: string
        }[]
      }
      get_days_until_purge: { Args: { p_deleted_at: string }; Returns: number }
      get_slack_integration: {
        Args: { p_encryption_key: string; p_slack_team_id: string }
        Returns: {
          access_token: string
          bot_user_id: string
          slack_team_id: string
        }[]
      }
      get_user_openai_key: { Args: { p_user_id: string }; Returns: string }
      get_user_provider_api_keys: {
        Args: { p_user_id: string }
        Returns: {
          api_key: string
          provider: string
        }[]
      }
      get_wm_related_entities: {
        Args: { p_central_node_id: string }
        Returns: {
          direction: string
          node_description: string
          node_id: string
          node_name: string
          node_type: string
          relation: string
        }[]
      }
      grant_welcome_credits: {
        Args: { p_amount?: number }
        Returns: {
          credited: boolean
          user_id: string
        }[]
      }
      increment_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_type?: Database["public"]["Enums"]["credit_transaction_type"]
          p_user_id: string
        }
        Returns: undefined
      }
      increment_token_usage: {
        Args: {
          p_model?: string
          p_month_key: string
          p_tokens: number
          p_user_id: string
        }
        Returns: undefined
      }
      match_code_embeddings: {
        Args: {
          filter_repo: string
          filter_workspace_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content_chunk: string
          file_path: string
          id: string
          similarity: number
        }[]
      }
      match_document_chunks_3076: {
        Args: {
          filter_document_ids?: string[]
          filter_workspace_id?: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          similarity: number
          storage_state: Database["public"]["Enums"]["storage_state_enum"]
          storage_uri: string
        }[]
      }
      match_document_chunks_3076_delta: {
        Args: {
          filter_document_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      match_document_chunks_768: {
        Args: {
          filter_document_ids?: string[]
          filter_workspace_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          similarity: number
          storage_state: Database["public"]["Enums"]["storage_state_enum"]
          storage_uri: string
        }[]
      }
      match_learned_knowledge: {
        Args: {
          filter_user_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          confidence: number
          expires_at: string
          extracted_at: string
          fact: string
          id: string
          similarity: number
          source_type: string
          source_url: string
          topic: string
          usage_count: number
          user_id: string
        }[]
      }
      match_learning_patterns: {
        Args: {
          filter_user_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          confidence: number
          id: string
          last_used: string
          query_pattern: string
          query_type: string
          result_summary: string
          similarity: number
          successful_approach: string
          usage_count: number
          user_id: string
        }[]
      }
      match_memories:
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              p_user_id: string
              query_embedding: string
            }
            Returns: {
              confidence: number
              content: string
              id: string
              scope: string
              similarity: number
              source_conversation_id: string
              type: string
              user_id: string
            }[]
          }
        | {
            Args: {
              filter_feature_type?: string
              filter_user_id: string
              match_count: number
              match_threshold: number
              query_embedding: string
            }
            Returns: {
              content: string
              created_at: string
              id: string
              metadata: Json
              reward_score: number
              similarity: number
              type: string
            }[]
          }
      match_memories_3072: {
        Args: {
          filter_feature_type?: string
          filter_user_id: string
          match_count: number
          match_threshold: number
          metadata_filter?: Json
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          reward_score: number
          similarity: number
          type: string
        }[]
      }
      match_memories_768: {
        Args: {
          filter_feature_type?: string
          filter_user_id: string
          match_count: number
          match_threshold: number
          metadata_filter?: Json
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          reward_score: number
          similarity: number
          type: string
        }[]
      }
      match_memories_scoped: {
        Args: {
          filter_conversation_id: string
          filter_user_id: string
          include_global?: boolean
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          confidence: number
          content: string
          id: string
          scope: string
          similarity: number
          source_conversation_id: string
          type: string
        }[]
      }
      match_nodes: {
        Args: {
          match_count: number
          match_threshold: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          name: string
          similarity: number
          type: string
        }[]
      }
      match_procedural_memory: {
        Args: {
          p_embedding: string
          p_limit?: number
          p_task_type?: string
          p_threshold?: number
          p_user_id: string
        }
        Returns: {
          avg_latency_ms: number
          confidence: number
          created_at: string
          failure_count: number
          id: string
          last_used_at: string
          promoted_at: string
          similarity: number
          success_count: number
          task_description: string
          task_type: string
          tool_sequence: Json
          user_id: string
        }[]
      }
      match_relay_skills_3072: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          confidence_threshold: number
          id: string
          requires_approval: boolean
          similarity: number
          trigger_pattern: string
        }[]
      }
      match_relay_skills_768: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          confidence_threshold: number
          id: string
          requires_approval: boolean
          similarity: number
          trigger_pattern: string
        }[]
      }
      match_wm_edges: {
        Args: {
          match_count: number
          match_threshold: number
          query_vector: string
        }
        Returns: {
          action: Json
          id: number
          similarity: number
          user_id: string
          v_x: string
          v_y: string
          workspace_id: string
        }[]
      }
      match_wm_nodes: {
        Args: {
          match_count: number
          match_threshold: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          name: string
          similarity: number
          trust_tier: Database["public"]["Enums"]["trust_tier"]
          type: string
        }[]
      }
      match_wm_nodes_3072: {
        Args: {
          match_count: number
          match_threshold: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          name: string
          similarity: number
          trust_tier: Database["public"]["Enums"]["trust_tier"]
          type: string
        }[]
      }
      match_wm_nodes_768: {
        Args: {
          match_count: number
          match_threshold: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          name: string
          similarity: number
          trust_tier: Database["public"]["Enums"]["trust_tier"]
          type: string
        }[]
      }
      match_workspace_sources: {
        Args: {
          filter_source_types?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_workspace_id: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          origin_uri: string
          similarity: number
          source_type: string
          title: string
        }[]
      }
      match_workspace_sources_with_lineage_json: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          target_workspace_id: string
        }
        Returns: Json
      }
      normalize_wm_delta: { Args: { p_delta: Json }; Returns: Json }
      process_kofi_donation: {
        Args: {
          p_amount_usd: number
          p_credits_to_add: number
          p_email: string
          p_kofi_transaction_id: string
          p_metadata?: Json
          p_tier_name: string
        }
        Returns: Json
      }
      purge_expired_deleted_conversations: { Args: never; Returns: number }
      refresh_wm_current_entities: { Args: never; Returns: undefined }
      search_code_rrf: {
        Args: {
          p_k?: number
          p_match_count?: number
          p_query_embedding: string
          p_query_text: string
          p_repo_filter?: string
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          kw_rank: number
          metadata: Json
          rrf_score: number
          vec_rank: number
        }[]
      }
      spend_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_idempotency_key: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: Json
      }
      supersede_workspace_source: {
        Args: {
          superseded_at?: string
          target_origin_uri: string
          target_workspace_id: string
        }
        Returns: number
      }
      upsert_persona_document_atomic: {
        Args: {
          p_allowed_ns: string[]
          p_document_id: string
          p_forbidden_ns: string[]
          p_nonce: string
          p_previous_hash: string
          p_signature_hash: string
          p_state: string
          p_timestamp: string
          p_tone_lock: string
          p_trigger_event: string
        }
        Returns: {
          allowed_namespaces: string[]
          created_at: string
          document_id: string
          forbidden_namespaces: string[]
          id: string
          nonce: string
          previous_version_hash: string
          signature_hash: string
          state: string
          tone_lock: string
          transition_audit: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "persona_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_slack_integration: {
        Args: {
          p_access_token: string
          p_bot_user_id: string
          p_encryption_key: string
          p_slack_team_id: string
          p_slack_team_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      upsert_user_provider_api_key: {
        Args: {
          p_api_key: string
          p_provider: string
          p_secret_preview: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      credit_transaction_type:
        | "PURCHASE"
        | "USAGE"
        | "BONUS"
        | "REFUND"
        | "MANUAL_ADJUSTMENT"
      embedding_tier_enum: "STANDARD_768" | "HIGH_RES_3076"
      org_role: "owner" | "admin" | "developer" | "auditor"
      storage_state_enum: "WARM" | "COMPRESSING" | "COLD"
      trust_tier: "AXIOM" | "CONFIRMED" | "SUPPORTED" | "UNVERIFIED"
      wm_event_type: "ASSERTED" | "CONTRADICTED" | "OBSOLETED" | "MERGED"
      wm_relationship_type:
        | "RELATES_TO"
        | "CORRELATES_WITH"
        | "PRECEDES"
        | "CAUSES"
        | "INHIBITS"
        | "CONTRADICTS"
        | "SUPPORTS"
        | "COUNTERFACTUAL_OF"
        | "IS_A"
        | "HAS_ATTRIBUTE"
        | "ASSERTED_BY"
        | "CONTEXT_OF"
        | "SUPERSEDES"
        | "ENABLES"
        | "REQUIRES"
      workspace_source_delta_verdict: "NEW" | "UNCHANGED" | "UPDATED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      credit_transaction_type: [
        "PURCHASE",
        "USAGE",
        "BONUS",
        "REFUND",
        "MANUAL_ADJUSTMENT",
      ],
      embedding_tier_enum: ["STANDARD_768", "HIGH_RES_3076"],
      org_role: ["owner", "admin", "developer", "auditor"],
      storage_state_enum: ["WARM", "COMPRESSING", "COLD"],
      trust_tier: ["AXIOM", "CONFIRMED", "SUPPORTED", "UNVERIFIED"],
      wm_event_type: ["ASSERTED", "CONTRADICTED", "OBSOLETED", "MERGED"],
      wm_relationship_type: [
        "RELATES_TO",
        "CORRELATES_WITH",
        "PRECEDES",
        "CAUSES",
        "INHIBITS",
        "CONTRADICTS",
        "SUPPORTS",
        "COUNTERFACTUAL_OF",
        "IS_A",
        "HAS_ATTRIBUTE",
        "ASSERTED_BY",
        "CONTEXT_OF",
        "SUPERSEDES",
        "ENABLES",
        "REQUIRES",
      ],
      workspace_source_delta_verdict: ["NEW", "UNCHANGED", "UPDATED"],
    },
  },
} as const
