import { type PersonaDocument } from "./persona-schema.js";

/**
 * Deterministic XML canonicalization for PersonaDocument.
 *
 * Rules:
 * 1. Attributes emitted in strict lexicographic order.
 * 2. Elements emitted in fixed schema order.
 * 3. Array contents sorted alphabetically before serialization.
 * 4. No whitespace between tags, no indentation, no BOM, no comments.
 * 5. UTF-8 encoding, standard XML escaping.
 */

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

function serializeAttributes(attrs: Record<string, string>): string {
  return Object.keys(attrs)
    .sort()
    .map((key) => ` ${key}="${escapeXml(attrs[key])}"`)
    .join("");
}

function serializeStringElement(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function serializeStringElements(name: string, values: string[]): string {
  const sorted = [...values].sort();
  return sorted.map((v) => `<${name}>${escapeXml(v)}</${name}>`).join("");
}

export function canonicalizePersonaDocument(doc: PersonaDocument): string {
  const rootAttrs: Record<string, string> = {
    documentId: doc.documentId,
    nonce: doc.nonce,
    previousVersionHash: doc.previousVersionHash,
    signatureHash: doc.signatureHash,
    state: doc.state,
  };

  const domainBoundaries = [
    `<domainBoundaries>`,
    `<allowedNamespaces>`,
    serializeStringElements("ns", doc.domainBoundaries.allowedNamespaces),
    `</allowedNamespaces>`,
    `<forbiddenNamespaces>`,
    serializeStringElements("ns", doc.domainBoundaries.forbiddenNamespaces),
    `</forbiddenNamespaces>`,
    serializeStringElement("toneLock", doc.domainBoundaries.toneLock),
    `</domainBoundaries>`,
  ].join("");

  const transitionAudit = [
    `<transitionAudit>`,
    serializeStringElement("triggerEvent", doc.transitionAudit.triggerEvent),
    serializeStringElement("timestamp", doc.transitionAudit.timestamp),
    `</transitionAudit>`,
  ].join("");

  return `<persona${serializeAttributes(rootAttrs)}>${domainBoundaries}${transitionAudit}</persona>`;
}

/**
 * Return canonical UTF-8 bytes for SHA-256.
 */
export function canonicalPersonaBytes(doc: PersonaDocument): Uint8Array {
  const xml = canonicalizePersonaDocument(doc);
  return new TextEncoder().encode(xml);
}
