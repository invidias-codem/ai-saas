#!/usr/bin/env python3
"""eval/blog_quality.py

Opik-based evaluation harness for the Lattice OS weekly blog agent.
Falls back to local deterministic evaluation if Opik is not configured.

Usage:
  python eval/blog_quality.py --trace-id <trace_id>
  python eval/blog_quality.py --task-id <task_id>
  OPIIK_API_KEY=... python eval/blog_quality.py --trace-id ...

Exit codes:
  0 = pass
  1 = fail
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Optional

FRONTMATTER_REQUIRED_KEYS = ["publishedAt", "title", "description", "author", "category"]
EXPECTED_AUTHOR = "genie-team"
MAX_INPUT_TOKENS_BUDGET = 12000
MAX_OUTPUT_TOKENS_BUDGET = 4000


@dataclass
class EvalResult:
    trace_id: Optional[str]
    task_id: Optional[str]
    frontmatter_ok: bool
    voice_ok: bool
    length_ok: bool
    token_budget_ok: bool
    llm_score: Optional[int]
    issues: list[str]
    passed: bool


def extract_frontmatter(mdx: str) -> tuple[str, str]:
    text = mdx.strip()
    if text.startswith("```"):
        text = re.sub(r"^```.*?\n", "", text, count=1, flags=re.DOTALL)
        text = re.sub(r"\n```$", "", text, flags=re.DOTALL)
        text = text.strip()

    m = re.search(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return "", text
    return m.group(1), text


def parse_yaml_like(block: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            out[key] = value
    return out


def deterministic_checks(mdx: str) -> tuple[bool, list[str], bool, bool]:
    frontmatter_block, body = extract_frontmatter(mdx)
    issues: list[str] = []

    fm = parse_yaml_like(frontmatter_block)
    frontmatter_ok = True
    for key in FRONTMATTER_REQUIRED_KEYS:
        if not fm.get(key):
            frontmatter_ok = False
            issues.append(f"missing frontmatter key: {key}")

    if fm.get("author") != EXPECTED_AUTHOR:
        frontmatter_ok = False
        issues.append(f"unexpected author: {fm.get('author')}")

    lowered = body.lower()
    voice_ok = True
    filler_phrases = [
        "in today's fast-paced world",
        "in today's rapidly evolving world",
        "in this blog post",
        "in this article",
    ]
    for phrase in filler_phrases:
        if phrase in lowered:
            voice_ok = False
            issues.append(f"filler phrase detected: {phrase}")
            break

    word_count = len(body.split())
    length_ok = 300 <= word_count <= 1800
    if not length_ok:
        issues.append(f"word count out of range: {word_count}")

    return frontmatter_ok, issues, voice_ok, length_ok


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def local_llm_judge(mdx: str) -> tuple[int, list[str]]:
    _, body = extract_frontmatter(mdx)
    issues: list[str] = []
    score = 8

    if "lattice" not in body.lower():
        issues.append("missing Lattice OS branding")
        score -= 2
    if "UCOL" not in body and "ucol" not in body.lower():
        issues.append("missing UCOL reference")
        score -= 1
    if "terminal" not in body.lower():
        issues.append("missing terminal-native execution theme")
        score -= 1
    if "agent" not in body.lower():
        issues.append("missing agentic execution theme")
        score -= 1

    return max(1, min(10, score)), issues


def opik_available() -> bool:
    try:
        import opik  # noqa: F401
        return bool(os.environ.get("OPIK_API_KEY"))
    except Exception:
        return False


def load_trace_output(trace_id: str) -> str:
    if not opik_available():
        raise RuntimeError("Opik is not configured")
    import opik
    client = opik.Opik(api_key=os.environ["OPIK_API_KEY"])
    trace = client.trace.get(trace_id)
    if not trace:
        raise ValueError(f"Trace not found: {trace_id}")
    output = trace.output or ""
    if isinstance(output, dict):
        output = json.dumps(output)
    return str(output)


def load_task_output(task_id: str) -> str:
    # Placeholder: wire this to your task API / DB if needed.
    raise NotImplementedError("task_id lookup not implemented in eval harness")


def evaluate(trace_id: Optional[str], task_id: Optional[str], raw_mdx: Optional[str]) -> EvalResult:
    if raw_mdx is None:
        if trace_id:
            raw_mdx = load_trace_output(trace_id)
        elif task_id:
            raw_mdx = load_task_output(task_id)
        else:
            raise ValueError("Provide --trace-id, --task-id, or --mdx-file")

    frontmatter_ok, issues, voice_ok, length_ok = deterministic_checks(raw_mdx)
    token_budget_ok = estimate_tokens(raw_mdx) <= MAX_OUTPUT_TOKENS_BUDGET

    if opik_available():
        try:
            import opik
            client = opik.Opik(api_key=os.environ["OPIK_API_KEY"])
            trace = client.trace.get(trace_id or "")
            prompt_tokens = getattr(trace, "prompt_tokens", None) or 0
            completion_tokens = getattr(trace, "completion_tokens", None) or 0
            token_budget_ok = (prompt_tokens + completion_tokens) <= MAX_INPUT_TOKENS_BUDGET + MAX_OUTPUT_TOKENS_BUDGET
            llm_score, judge_issues = local_llm_judge(raw_mdx)
            issues.extend(judge_issues)
        except Exception as exc:
            issues.append(f"opik_judge_failed: {exc}")
            llm_score, _ = local_llm_judge(raw_mdx)
    else:
        llm_score, judge_issues = local_llm_judge(raw_mdx)
        issues.extend(judge_issues)

    passed = frontmatter_ok and voice_ok and length_ok and token_budget_ok and (llm_score or 0) >= 6
    return EvalResult(
        trace_id=trace_id,
        task_id=task_id,
        frontmatter_ok=frontmatter_ok,
        voice_ok=voice_ok,
        length_ok=length_ok,
        token_budget_ok=token_budget_ok,
        llm_score=llm_score,
        issues=issues,
        passed=passed,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Blog post quality eval")
    parser.add_argument("--trace-id")
    parser.add_argument("--task-id")
    parser.add_argument("--mdx-file")
    args = parser.parse_args()

    raw_mdx: Optional[str] = None
    if args.mdx_file:
        with open(args.mdx_file, "r", encoding="utf-8") as f:
            raw_mdx = f.read()

    result = evaluate(args.trace_id, args.task_id, raw_mdx)
    payload = {
        "trace_id": result.trace_id,
        "task_id": result.task_id,
        "passed": result.passed,
        "frontmatter_ok": result.frontmatter_ok,
        "voice_ok": result.voice_ok,
        "length_ok": result.length_ok,
        "token_budget_ok": result.token_budget_ok,
        "llm_score": result.llm_score,
        "issues": result.issues,
    }
    print(json.dumps(payload, indent=2))
    return 0 if result.passed else 1


if __name__ == "__main__":
    sys.exit(main())
