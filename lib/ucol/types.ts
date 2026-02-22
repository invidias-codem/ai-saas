// lib/ucol/types.ts
// Shared types for the UCOL (Unified Context Orchestration Layer) Code Builder

// ─── Project Plan (Gemini output) ───

export interface ProjectPlan {
    appName: string;
    description: string;
    techStack: string[];
    pages: PageSpec[];
    components: ComponentSpec[];
    dataModel: DataModelSpec[];
    apiRoutes: ApiRouteSpec[];
    reasoning: string;
}

export interface PageSpec {
    name: string;
    route: string;
    description: string;
    components: string[]; // component names used on this page
}

export interface ComponentSpec {
    name: string;
    filePath: string;
    description: string;
    props: PropSpec[];
    dependencies: string[]; // other component names this imports
    priority: number;       // build order hint (lower = earlier)
}

export interface PropSpec {
    name: string;
    type: string;
    required: boolean;
    description: string;
}

export interface DataModelSpec {
    name: string;
    fields: { name: string; type: string; description: string }[];
}

export interface ApiRouteSpec {
    path: string;
    method: string;
    description: string;
    requestBody?: string;
    responseBody?: string;
}

// ─── Generated Files (Claude output) ───

export interface GeneratedFile {
    path: string;
    content: string;
    language: string;
    component: string;  // which component this belongs to
    model: string;      // attribution: "claude"
}

// ─── Context Routing ───

export interface ContextPackage {
    source: 'gemini' | 'claude' | 'user';
    target: 'gemini' | 'claude';
    payload: {
        type: 'plan' | 'code' | 'review' | 'refinement';
        content: any;
        reasoning: string;
        relevanceScore: number;
    };
    timestamp: number;
    sessionId: string;
}

export interface ContextFlowEntry {
    id: string;
    timestamp: number;
    source: string;
    target: string;
    action: string;
    reasoning: string;
    status: 'active' | 'complete' | 'error';
}

// ─── Review Feedback (Gemini Reviewer output) ───

export interface ReviewFeedback {
    approved: boolean;
    score: number;         // 1-10 quality score
    critique: string;      // specific issues found
    suggestions: string[]; // actionable fix suggestions
    failedCriteria: string[]; // which rubric items failed
}

export interface RefinementContext {
    attempt: number;
    previousCode: string;
    feedbackHistory: ReviewFeedback[]; // ALL prior critiques, not just latest
    component: ComponentSpec;
}

// ─── Build Request / Response ───

export interface BuildRequest {
    prompt: string;
    sessionId: string;
    refinement?: string;
    existingPlan?: ProjectPlan;
}

export interface BuildResponse {
    plan: ProjectPlan;
    files: GeneratedFile[];
    contextFlow: ContextFlowEntry[];
}

// ─── Session ───

export interface BuildSession {
    id: string;
    userId: string;
    plan?: ProjectPlan;
    files: GeneratedFile[];
    contextFlow: ContextFlowEntry[];
    reviewRounds: number; // total review iterations across all components
}

