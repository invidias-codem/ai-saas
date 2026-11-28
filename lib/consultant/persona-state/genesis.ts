import crypto from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { PersonaDocumentSchema, type PersonaDocument } from "./persona-schema";
import { canonicalPersonaBytes } from "./canonicalize";
import { verifySignedConfig, type SignedConfig } from "./signed-config";

const GENESIS_IDENTITY = "lattice-os-persona-v1";
export const GENESIS_PREVIOUS_HASH = crypto
  .createHash("sha256")
  .update(GENESIS_IDENTITY)
  .digest("hex");

/**
 * Factory for the genesis PersonaDocument.
 */
export function createGenesisDocument(
  allowedNamespaces: string[],
  forbiddenNamespaces: string[],
  toneLock: "CLINICAL" | "PREMIUM_CONSULTANT" | "RESTRICTED",
): PersonaDocument {
  const nonce = uuidv7();
  const now = new Date().toISOString();

  const doc: PersonaDocument = {
    documentId: uuidv7(),
    nonce,
    previousVersionHash: GENESIS_PREVIOUS_HASH,
    signatureHash: "",
    state: "IDLE",
    domainBoundaries: {
      allowedNamespaces,
      forbiddenNamespaces,
      toneLock,
    },
    transitionAudit: {
      triggerEvent: "SYSTEM_BOOT",
      timestamp: now,
    },
  };

  const signatureHash = crypto
    .createHash("sha256")
    .update(canonicalPersonaBytes(doc))
    .digest("hex");

  return { ...doc, signatureHash };
}

/**
 * Derive the genesis previousVersionHash constant.
 */
export function getGenesisPreviousHash(): string {
  return GENESIS_PREVIOUS_HASH;
}

/**
 * Convenience: check if a document is the genesis link.
 */
export function isGenesisLink(doc: PersonaDocument): boolean {
  return doc.previousVersionHash === GENESIS_PREVIOUS_HASH;
}

/**
 * Create genesis document from a signed operator config.
 */
export async function createGenesisDocumentFromSignedConfig(
  signedConfig: SignedConfig,
): Promise<PersonaDocument> {
  const verification = await verifySignedConfig(signedConfig);
  if (!verification.valid) {
    throw new Error(`Signed config rejected: ${verification.reason}`);
  }

  const ns = signedConfig.namespaces;
  return createGenesisDocument(
    ns.allowedNamespaces,
    ns.forbiddenNamespaces,
    "CLINICAL",
  );
}
