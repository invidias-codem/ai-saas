import { Artifact } from "@/components/chat/ArtifactCard";

export type ParsedBotContent = {
  text: string;
  artifacts: Artifact[];
};

const ARTIFACT_BLOCK_RE = /```artifact:(\w+)(?:\s+(.*?))?\n([\s\S]*?)```/g;

export function parseArtifacts(text: string): ParsedBotContent {
  const artifacts: Artifact[] = [];
  let cleaned = text;
  let match: RegExpExecArray | null;

  while ((match = ARTIFACT_BLOCK_RE.exec(text)) !== null) {
    const kind = match[1].trim().toLowerCase();
    const title = match[2]?.trim() || undefined;
    const content = match[3] ?? "";

    if (["code", "ui", "diagram"].includes(kind)) {
      const langMatch = title?.match(/^([a-z0-9+#.\-]+)(?:\s+(.*))?$/i);
      artifacts.push({
        kind: kind as Artifact["kind"],
        title: langMatch?.[2] || title || undefined,
        content,
        language: kind === "code" ? langMatch?.[1] : undefined,
      });
    }
  }

  if (artifacts.length > 0) {
    cleaned = text.replace(ARTIFACT_BLOCK_RE, "").trim();
  }

  return { text: cleaned, artifacts };
}
