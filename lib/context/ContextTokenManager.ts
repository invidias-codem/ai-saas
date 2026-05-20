import { estimateTokenCount } from '@/lib/ragMemory';
import {
  TokenBudget,
  PreparedContextSections,
  ContextAllocationResult,
  SectionAllocation,
  ContextSectionKey,
} from './types';
import { ContextCompactor } from './ContextCompactor';

export class ContextTokenManager {
  /**
   * Determine conservative token limits based on the target LLM provider/model.
   */
  static getModelLimits(modelId: string = 'gemini-1.5-pro'): {
    totalMax: number;
    historyReserve: number;
    retrievedReserve: number;
    systemReserve: number;
  } {
    const id = modelId.toLowerCase();
    
    // Conservative limits to avoid latency blow-up and cost constraints, while respecting model thresholds
    if (id.includes('gemini-1.5-pro') || id.includes('gemini-2.5-pro')) {
      return {
        totalMax: 200000,
        historyReserve: 40000,
        retrievedReserve: 120000,
        systemReserve: 8000,
      };
    } else if (id.includes('gemini-3.1-flash') || id.includes('gemini')) {
      return {
        totalMax: 100000,
        historyReserve: 20000,
        retrievedReserve: 60000,
        systemReserve: 4000,
      };
    } else if (id.includes('claude')) {
      return {
        totalMax: 96000,
        historyReserve: 24000,
        retrievedReserve: 48000,
        systemReserve: 4000,
      };
    } else if (id.includes('deepseek')) {
      return {
        totalMax: 32000,
        historyReserve: 8000,
        retrievedReserve: 120000 / 8, // ~15,000 for retrieval
        systemReserve: 3000,
      };
    }

    // Safe default for standard models
    return {
      totalMax: 32000,
      historyReserve: 8000,
      retrievedReserve: 16000,
      systemReserve: 3000,
    };
  }

  /**
   * Classify user query intent to optimize proportional token allocation.
   */
  static detectUserIntent(query: string = ''): 'code' | 'search' | 'general' {
    const q = query.toLowerCase();
    
    const codeKeywords = [
      'code', 'file', 'function', 'class', 'method', 'refactor', 'compile', 
      'typescript', 'javascript', 'python', 'bug', 'error', 'interface', 'import',
      'harness', 'executor', 'route', 'api', 'schema', 'migration'
    ];
    
    const searchKeywords = [
      'who', 'when', 'latest', 'news', 'search', 'crawl', 'web', 'current',
      'recent events', 'google', 'bluesky', 'market', 'trends'
    ];

    if (codeKeywords.some(kw => q.includes(kw))) {
      return 'code';
    }
    if (searchKeywords.some(kw => q.includes(kw))) {
      return 'search';
    }
    return 'general';
  }

  /**
   * Orchestrate dynamic token allocation among the available retrieval sections.
   */
  static assembleContext(
    systemInstruction: string,
    sections: PreparedContextSections,
    options: {
      modelId?: string;
      userQuery?: string;
      customBudget?: number;
    } = {}
  ): ContextAllocationResult {
    const { modelId = 'gemini-1.5-pro', userQuery = '', customBudget } = options;
    
    // Step 1: Establish base limits
    const limits = this.getModelLimits(modelId);
    const totalMax = customBudget ?? limits.totalMax;
    
    const systemTokens = estimateTokenCount(systemInstruction);
    const queryTokens = estimateTokenCount(userQuery);
    
    // Step 2: Intent detection & Dynamic Allocation
    const intent = this.detectUserIntent(userQuery);
    
    // Remaining available capacity for retrieved context
    const initialAvailable = Math.max(0, totalMax - systemTokens - queryTokens - limits.historyReserve);
    const retrievedBudget = Math.min(limits.retrievedReserve, initialAvailable);

    // Build the dynamic allocation sections
    const rawSections: { key: ContextSectionKey; label: string; text: string }[] = [
      { key: 'userContextPrompt', label: 'User Context', text: sections.userContextPrompt || '' },
      { key: 'userProfileContext', label: 'User Profile', text: sections.userProfileContext || '' },
      { key: 'factContext', label: 'Fact Context', text: sections.factContext || '' },
      { key: 'graphContext', label: 'Graph Context', text: sections.graphContext || '' },
      { key: 'searchContext', label: 'Search Context', text: sections.searchContext || '' },
      { key: 'memoryContext', label: 'Memory Context', text: sections.memoryContext || '' },
    ];

    const allocations: SectionAllocation[] = [];

    // Define priorities and allocation weights based on user query intent
    for (const sec of rawSections) {
      if (!sec.text || sec.text.trim().length === 0) continue;

      let priority = 50;
      let ratio = 0.15; // default proportional ratio of retrievedBudget
      let required = false;

      if (sec.key === 'userContextPrompt') {
        priority = 100;
        ratio = 0.1;
        required = true;
      } else if (sec.key === 'userProfileContext') {
        priority = 90;
        ratio = 0.15;
      }

      // Intent-specific weighting
      if (intent === 'code') {
        switch (sec.key) {
          case 'memoryContext': // Workspace codebases/RAG
            priority = 95;
            ratio = 0.45;
            break;
          case 'factContext':
            priority = 85;
            ratio = 0.15;
            break;
          case 'graphContext':
            priority = 80;
            ratio = 0.1;
            break;
          case 'searchContext':
            priority = 40;
            ratio = 0.05;
            break;
        }
      } else if (intent === 'search') {
        switch (sec.key) {
          case 'searchContext': // Search/Crawl results
            priority = 95;
            ratio = 0.5;
            break;
          case 'factContext':
            priority = 90;
            ratio = 0.15;
            break;
          case 'graphContext':
            priority = 85;
            ratio = 0.1;
            break;
          case 'memoryContext':
            priority = 60;
            ratio = 0.1;
            break;
        }
      } else { // general
        switch (sec.key) {
          case 'factContext':
            priority = 95;
            ratio = 0.3;
            break;
          case 'memoryContext':
            priority = 85;
            ratio = 0.25;
            break;
          case 'searchContext':
            priority = 75;
            ratio = 0.15;
            break;
          case 'graphContext':
            priority = 70;
            ratio = 0.1;
            break;
        }
      }

      const estimatedTokens = estimateTokenCount(sec.text);
      const allocatedTokens = Math.max(200, Math.floor(retrievedBudget * ratio));

      allocations.push({
        key: sec.key,
        label: sec.label,
        text: sec.text,
        priority,
        estimatedTokens,
        allocatedTokens,
        required,
      });
    }

    // Step 3: Compaction and Selection
    const allocatedSections: SectionAllocation[] = [];
    const omittedSections: SectionAllocation[] = [];
    let currentRetrievedTokens = 0;

    // Process from highest to lowest priority
    const sortedAllocations = [...allocations].sort((a, b) => b.priority - a.priority);

    for (const alloc of sortedAllocations) {
      if (alloc.required) {
        allocatedSections.push(alloc);
        currentRetrievedTokens += alloc.estimatedTokens;
        continue;
      }

      const projectedTotal = currentRetrievedTokens + alloc.estimatedTokens;

      if (projectedTotal <= retrievedBudget) {
        // Fits perfectly without compaction
        allocatedSections.push(alloc);
        currentRetrievedTokens += alloc.estimatedTokens;
      } else {
        // Exceeds remaining budget, try compacting to fit the dynamically allocated slice or remaining slot
        const remainingSlot = Math.max(200, retrievedBudget - currentRetrievedTokens);
        const targetBudgetLimit = Math.min(alloc.allocatedTokens, remainingSlot);

        if (targetBudgetLimit >= 200) {
          // Determine language heuristic for code outline mode
          const language = alloc.key === 'memoryContext' ? 'typescript' : undefined;
          
          const compaction = ContextCompactor.compact(alloc.text, targetBudgetLimit, {
            mode: 'auto',
            language,
          });

          if (compaction.compactedTokens <= remainingSlot) {
            allocatedSections.push({
              ...alloc,
              text: compaction.compactedText,
              estimatedTokens: compaction.compactedTokens,
            });
            currentRetrievedTokens += compaction.compactedTokens;
          } else {
            omittedSections.push(alloc);
          }
        } else {
          omittedSections.push(alloc);
        }
      }
    }

    // Reassemble the packed context blocks
    const packedContext = allocatedSections
      // Maintain natural logical layout order of keys rather than priority order
      .sort((a, b) => {
        const order = ['userContextPrompt', 'userProfileContext', 'factContext', 'graphContext', 'searchContext', 'memoryContext'];
        return order.indexOf(a.key) - order.indexOf(b.key);
      })
      .map(sec => `=== ${sec.label} ===\n${sec.text.trim()}`)
      .join('\n\n');

    return {
      allocatedSections,
      omittedSections,
      totalAllocatedTokens: currentRetrievedTokens,
      packedContext,
    };
  }
}
