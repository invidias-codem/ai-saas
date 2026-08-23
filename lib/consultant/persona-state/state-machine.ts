import crypto from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { PersonaDocument, PersonaState, AuthorizedTrigger } from "./persona-schema.js";
import { PersonaDocumentSchema, validateTransition, PersonaChainVerifier } from "./persona-schema.js";
import { canonicalPersonaBytes } from "./canonicalize.js";
import { type SignedConfig } from "./signed-config.js";
import { createGenesisDocumentFromSignedConfig, getGenesisPreviousHash } from "./genesis.js";

export interface InitializedPersonaMachine {
  genesis: PersonaDocument;
  current: PersonaDocument;
  chainVerifier: PersonaChainVerifier;
}

export class PersonaStateMachine {
  private current: PersonaDocument;
  private chainVerifier: PersonaChainVerifier;

  private constructor(
    genesis: PersonaDocument,
    current: PersonaDocument,
    chainVerifier: PersonaChainVerifier,
  ) {
    this.current = current;
    this.chainVerifier = chainVerifier;
  }

  static create(
    genesis: PersonaDocument,
    current: PersonaDocument,
    chainVerifier: PersonaChainVerifier,
  ): PersonaStateMachine {
    return new PersonaStateMachine(genesis, current, chainVerifier);
  }

  getCurrent(): PersonaDocument {
    return this.current;
  }

  /**
   * Transition the persona to a new state. Throws on invalid transition.
   * This is the ONLY path by which persona state can change.
   */
  async transition(
    toState: PersonaState,
    trigger: string,
    extraAudit?: Record<string, unknown>,
  ): Promise<PersonaDocument> {
    const now = new Date().toISOString();
    const nextNonce = uuidv7();

    const proposed: PersonaDocument = {
      documentId: this.current.documentId,
      nonce: nextNonce,
      previousVersionHash: this.current.signatureHash,
      signatureHash: "",
      state: toState,
      domainBoundaries: this.current.domainBoundaries,
      transitionAudit: {
        triggerEvent: trigger as AuthorizedTrigger,
        timestamp: now,
      },
    };

    proposed.signatureHash = crypto
      .createHash("sha256")
      .update(canonicalPersonaBytes(proposed))
      .digest("hex");

    const result = validateTransition(this.current, proposed, this.chainVerifier);
    if (!result.valid || !result.rule) {
      await this.recordFailedTransition(proposed, result.reason ?? "Unknown validation failure");
      throw new Error(`Persona transition rejected: ${result.reason}`);
    }

    // Persist and stream
    await this.persistTransition(proposed);
    this.current = proposed;
    return proposed;
  }

  private async persistTransition(proposed: PersonaDocument): Promise<void> {
    // Persist to KV store (implement with your state backend)
    // For now, this is a no-op placeholder
  }

  private async recordFailedTransition(
    proposed: PersonaDocument,
    reason: string,
  ): Promise<void> {
    // Record failed transition for audit
  }
}

/**
 * Initialize the persona state machine from a cryptographically signed config.
 *
 * This is the ONLY entry point for boot. It:
 * 1. Verifies the signed config (signature, timestamp, environment, namespaces)
 * 2. Creates the genesis document with locked boundaries
 * 3. Establishes the chain verifier with the genesis root
 * 4. Returns a machine in IDLE state
 *
 * The caller must then explicitly transition to INGESTING with SYSTEM_BOOT.
 */
export async function initializePersonaStateMachine(
  signedConfig: SignedConfig,
): Promise<InitializedPersonaMachine> {
  const genesis = await createGenesisDocumentFromSignedConfig(signedConfig);
  const genesisValidated = PersonaDocumentSchema.parse(genesis);
  const chainVerifier = new PersonaChainVerifier(getGenesisPreviousHash());

  return {
    genesis: genesisValidated,
    current: genesisValidated,
    chainVerifier,
  };
}
