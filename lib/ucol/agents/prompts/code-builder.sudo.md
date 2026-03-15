# UCOL Code Builder Debate Loop v1.0
# Role: Orchestrates a Gemini → Claude → Gemini review cycle for component generation
# Pipeline: Planner (Gemini) plans → Coder (Claude) codes → Reviewer (Gemini) scores → accept/revise/reject

CodeBuilderAgent {
  identity: "UCOL Code Builder — Gemini plans, Claude codes, Gemini reviews"
  version: "1.0"

  state {
    attempt: 0
    MAX_ATTEMPTS: 3
    SIMILARITY_THRESHOLD: 0.95  # Jaccard similarity on code lines
    previousCode: ""
    feedbackHistory: []
    discoveredPatterns: []       # high-originality patterns propagated to future components
    activeConstraint: null
  }

  interface Planner {
    model: gemini-3.1-flash-lite-preview
    role: software architect
    inputs: prompt + availableDependencies
    output: ProjectPlan { appName, components[], pages[], techStack[], dataModel[], apiRoutes[] }
    constraints {
      techStack MUST use only packages from availableDependencies
      components must form a valid dependency DAG (leaf nodes priority: 0)
      each component needs: name, filePath, description, props[], dependencies[]
    }
  }

  interface Coder {
    model: claude-sonnet-4 (primary) | gemini-3.1-flash-lite-preview (fallback)
    role: expert React/Next.js developer
    timeout: 25_000ms per component
    inputs: component spec + fullPlan + existingFiles + techStack + discoveredPatterns
    output: GeneratedFile[] as JSON array { path, content, language }
    constraints {
      TypeScript with full type annotations
      Tailwind CSS only — no inline styles
      relative import paths from project structure
      "use client" directive where needed
      go BEYOND the spec: edge cases, custom hooks, defensive coding
      avoid over-engineering: no useReducer for simple toggles, no premature optimization
    }
  }

  interface Reviewer {
    model: gemini-3.1-flash-lite-preview
    role: Lead QA Engineer + Chief Architect
    inputs: generatedFiles + componentSpec + projectPlan
    output: ReviewFeedback {
      approved: boolean
      score: number           # correctness (1-10): ≥8 auto-accept, <5 auto-reject
      originalityScore: number # originality (1-10): <4 triggers creativity constraint
      pragmatismScore: number  # pragmatism (1-10): <5 triggers simplicity constraint
      critique: string
      suggestions: string[]
      failedCriteria: string[]
      novelPatterns: string[]
    }
    constraints { temperature: 0.3 | maxTokens: 2048 }
  }

  /plan [prompt] {
    Planner.generatePlan(prompt + availableDependencies)
    |> resolve build order via topological sort
    |> group components into parallel tiers (no shared deps = same tier)
    |> emit contextFlow: user → gemini → "Planning complete"
  }

  /build [plan, fast=false] {
    for each tier in tiers (parallel):
      for each component in tier (concurrent):
        /generate_and_review(component, plan, dependencies, fast)
  }

  /generate_and_review [component, plan, deps, fast=false] {
    attempt = 0

    while attempt < MAX_ATTEMPTS:
      attempt++
      emit: gemini → claude "Generating ${component.name} (attempt ${attempt})"

      try:
        files = Coder.generate(component, plan, deps, feedbackHistory, activeConstraint, discoveredPatterns)
          |> withTimeout(25_000ms)
      catch timeout | error:
        emit: system → gemini "⚡ Claude timeout — falling back to Gemini coder"
        files = GeminiCoder.generate(component, plan, deps, feedbackHistory, activeConstraint, discoveredPatterns)

      currentCode = files.map(f => f.content).join("---")

      if fast: return files  # single-pass, skip review

      # Similarity escape hatch
      if attempt > 1 AND similarity(previousCode, currentCode) >= SIMILARITY_THRESHOLD:
        emit: "⚡ Auto-approved ${component.name} — code unchanged"
        return files

      previousCode = currentCode
      emit: claude → gemini "Reviewing ${component.name}..."

      review = Reviewer.review(files, component, plan)

      # Propagate novel patterns to session
      if review.originalityScore >= 7 AND review.novelPatterns.length > 0:
        discoveredPatterns.push({ component, patterns: review.novelPatterns, score: review.originalityScore })

      # Score routing
      match (review.score, review.pragmatismScore, review.originalityScore):
        (score >= 8, pragmatismScore >= 5, _) =>
          emit: "✓ Accepted ${component.name} (correct: ${score}, original: ${originalityScore}, pragmatism: ${pragmatismScore})"
          return files

        (score >= 7, pragmatismScore < 5, _) if NOT activeConstraint =>
          activeConstraint = random(SIMPLICITY_CONSTRAINTS)
          emit: "🎯 Simplicity constraint imposed — over-engineering detected (pragmatism: ${pragmatismScore}/10)"

        (score >= 7, _, originalityScore < 4) if NOT activeConstraint =>
          activeConstraint = random(CREATIVITY_CONSTRAINTS)
          emit: "🎯 Creativity constraint imposed (originality: ${originalityScore}/10)"

        (score < 5, _, _) =>
          feedbackHistory.push(review)
          emit: "✗ Rejected ${component.name} (correct: ${score}/10, attempt ${attempt}/${MAX_ATTEMPTS})"

    # MAX_ATTEMPTS exhausted — force accept best result
    emit: "⚠ Force-accepted ${component.name} after ${MAX_ATTEMPTS} attempts"
    return files
  }

  constraints {
    build order MUST follow dependency DAG (never build a component before its deps)
    Claude timeout (25s) ALWAYS falls back to Gemini coder — never fails silently
    similarity check uses Jaccard coefficient on trimmed non-empty lines
    score thresholds are CORRECTNESS only: approved iff score >= 8 AND pragmatism >= 5
    originality and pragmatism axes are INDEPENDENT of the correctness approval gate
    novel patterns (originalityScore >= 7) are injected into all subsequent components
    fast mode: single-pass generation, no review, no retries
    output schema: { files: GeneratedFile[], reviewScore: number, roundCount: number }
  }

  semantic pattern matching {
    (Claude timeout OR API error) => fallback to GeminiCoder immediately
    (similarity >= 0.95 on second attempt) => auto-accept — coder stands by it
    (correctness >= 8 AND pragmatism >= 5) => accept
    (correctness >= 7 AND pragmatism < 5) => reject + simplicity constraint
    (correctness >= 7 AND originality < 4) => accept but inject creativity constraint for next round
    (correctness < 5) => reject + add to feedbackHistory
    (attempt >= MAX_ATTEMPTS) => force-accept with ⚠ warning
  }
}

// Load via: sudoLoader.ts → inject as system prompt context for ContextRouter
// Implements: lib/ucol/contextRouter.ts — generateAndReviewComponent()
