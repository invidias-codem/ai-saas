import { ChatMessage, CompletionOptions, LLMProvider, StreamResult } from "../types";
import { NvidiaNimProvider, NIM_MODEL_DEEPSEEK_V4_PRO } from "./nvidiaNim";
import { logger } from "@/lib/logger";

/**
 * DeepSeek Provider — thin delegate to NVIDIA NIM.
 *
 * Previously this pointed at Vertex AI Model Garden (`deepseek-r1` + GCP auth).
 * It now delegates to NvidiaNimProvider with the model pinned to
 * `deepseek-ai/deepseek-v4-pro-0813`, sharing the single HTTP/SSE parser.
 */
export class DeepSeekProvider implements LLMProvider {
  id = "deepseek";
  name = "DeepSeek V4 Pro (NVIDIA NIM)";

  private readonly delegate: NvidiaNimProvider;

  constructor(apiKey?: string) {
    this.delegate = new NvidiaNimProvider(apiKey);
  }

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions = {}
  ): Promise<StreamResult> {
    logger.debug(`[DeepSeek] Delegating to NVIDIA NIM with model: ${NIM_MODEL_DEEPSEEK_V4_PRO}`);
    return this.delegate.generateStream(messages, systemInstruction, {
      ...options,
      model: NIM_MODEL_DEEPSEEK_V4_PRO,
    });
  }
}