# UCOL Code Builder Debate Loop v2.0
# Role: Orchestrates a Kimi K3 (plan) → Kimi K3 (code) → Kimi K3 (review) cycle for component generation
# Pipeline: Planner (Kimi K3) plans → Coder (Kimi K3) codes → Reviewer (Kimi K3) scores → accept/revise/reject
# All three stages run the same model (moonshotai/kimi-k3 on NVIDIA NIM) with distinct prompt personas.

CodeBuilderAgent {
  identity: "UCOL Code Builder — Kimi K3 plans, codes, and reviews (NVIDIA NIM)"
  version: "2.0"

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
    model: moonshotai/kimi-k3 (NVIDIA NIM)
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
    model: moonshotai/kimi-k3 (NVIDIA NIM)
    role: expert React/Next.js developer
    timeout: 90_000ms per component
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
    model: moonshotai/kimi-k3 (NVIDIA NIM)
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
      emit: kimi → kimi "Generating ${component.name} (attempt ${attempt})"

      try:
        files = Coder.generate(component, plan, deps, feedbackHistory, activeConstraint, discoveredPatterns)
          |> withTimeout(90_000ms)
      catch timeout | error:
        emit: system → kimi "⚡ Kimi coder failure — propagating error to review gate"
        throw error  # no silent fallback; the review gate must not ship unverified code

      currentCode = files.map(f => f.content).join("---")

      if fast: return files  # single-pass, skip review

      # Similarity escape hatch
      if attempt > 1 AND similarity(previousCode, currentCode) >= SIMILARITY_THRESHOLD:
        emit: "⚡ Auto-approved ${component.name} — code unchanged"
        return files

      previousCode = currentCode
      emit: kimi → kimi "Reviewing ${component.name}..."

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
    Kimi coder failure (90s timeout) throws to the review gate — never ships unverified code
    similarity check uses Jaccard coefficient on trimmed non-empty lines
    score thresholds are CORRECTNESS only: approved iff score >= 8 AND pragmatism >= 5
    originality and pragmatism axes are INDEPENDENT of the correctness approval gate
    novel patterns (originalityScore >= 7) are injected into all subsequent components
    fast mode: single-pass generation, no review, no retries
    output schema: { files: GeneratedFile[], reviewScore: number, roundCount: number }
  }

  semantic pattern matching {
    (Kimi coder timeout OR API error) => throw to review gate (no silent fallback)
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
