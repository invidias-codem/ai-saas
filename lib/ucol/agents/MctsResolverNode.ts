/**
 * UCOL MCTS Resolver Node
 * 
 * Implements a Monte Carlo Tree Search (MCTS) algorithm for codebase error resolution.
 * Instead of a linear zero-shot fix, it expands a tree of possible file modifications,
 * uses an LLM Critic (Claude) to simulate compiler validation, and backpropagates
 * successful resolution strategies into the Knowledge Graph.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

// ─── Clients ──────────────────────────────────────────────────────────────────

function getGemini() {
  return new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
}

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null as any;
  return createClient(url, key);
}

// ─── 1. MCTS Types ─────────────────────────────────────────────────────────────

export interface CodeState {
  filePaths: string[];
  fileContents: Record<string, string>;
  errorTrace: string;
}

export interface CodeAction {
  id: string;
  description: string; // Plain English description of the move
  diffs: Record<string, string>; // The actual code changes
}

export class MctsNode {
  state: CodeState;
  actionTaken: CodeAction | null;
  parent: MctsNode | null;
  children: MctsNode[];
  
  visits: number;
  totalReward: number; // Sum of simulated compiler success rates
  
  constructor(state: CodeState, actionTaken: CodeAction | null, parent: MctsNode | null = null) {
    this.state = state;
    this.actionTaken = actionTaken;
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.totalReward = 0;
  }

  // UCB1 formula: (w / n) + C * sqrt(ln(N) / n)
  getUcbScore(explorationParam: number = 1.414): number {
    if (this.visits === 0) return Infinity; // Force exploration of unvisited nodes
    const exploit = this.totalReward / this.visits;
    const explore = explorationParam * Math.sqrt(Math.log(this.parent?.visits || 1) / this.visits);
    return exploit + explore;
  }
}

// ─── 2. The Agent Logic ────────────────────────────────────────────────────────

export class MctsResolverAgent {
  private maxIterations: number;
  private maxDepth: number;

  constructor(maxIterations = 3, maxDepth = 2) {
    this.maxIterations = maxIterations;
    this.maxDepth = maxDepth;
  }

  /**
   * Main MCTS Execution Loop
   */
  public async resolveError(initialState: CodeState): Promise<{ confidence: number; fileChanges: Record<string, string>; summary: string; title: string; }> {
    console.log('[MCTS] Starting resolution tree search...');
    const root = new MctsNode(initialState, null);

    for (let i = 0; i < this.maxIterations; i++) {
      console.log(`[MCTS] Iteration ${i + 1}/${this.maxIterations}`);
      // 1. SELECTION
      const nodeToExpand = this.selectNode(root);

      // 2. EXPANSION
      if (this.getDepth(nodeToExpand) < this.maxDepth && (nodeToExpand.visits > 0 || nodeToExpand === root)) {
        await this.expandNode(nodeToExpand);
      }

      // Pick an unvisited child to simulate, or simulate the node itself if it has no children
      const nodeToSimulate = nodeToExpand.children.find(c => c.visits === 0) || nodeToExpand;

      // 3. SIMULATION
      const reward = await this.simulate(nodeToSimulate.state);

      // 4. BACKPROPAGATION
      this.backpropagate(nodeToSimulate, reward);
    }

    // Select the best action based on the highest average reward
    const bestChild = this.getBestChild(root, 0); // explorationParam = 0 (pure exploitation)
    
    if (bestChild && bestChild.actionTaken) {
      console.log(`[MCTS] Winning Strategy: ${bestChild.actionTaken.description} (Score: ${bestChild.totalReward / bestChild.visits})`);
      
      // Save strategy to Knowledge Graph asynchronously
      this.saveLearnedStrategy(initialState.errorTrace, bestChild.actionTaken).catch(e => console.error('[MCTS] Save strategy failed:', e));
      
      return {
        confidence: bestChild.totalReward / bestChild.visits,
        fileChanges: bestChild.actionTaken.diffs,
        summary: `MCTS Resolution: ${bestChild.actionTaken.description}`,
        title: `fix(mcts): Auto-resolve error via MCTS strategy`
      };
    }
    
    // Fallback if MCTS fails to find any valid path
    return {
      confidence: 0,
      fileChanges: {},
      summary: 'MCTS failed to find a confident resolution path',
      title: 'fix: unknown'
    };
  }

  // ─── MCTS Phases ─────────────────────────────────────────────────────────────

  private selectNode(node: MctsNode): MctsNode {
    let current = node;
    while (current.children.length > 0) {
      const unvisited = current.children.find(c => c.visits === 0);
      if (unvisited) return unvisited;

      current = current.children.reduce((best, child) => 
        child.getUcbScore() > best.getUcbScore() ? child : best
      );
    }
    return current;
  }

  private async expandNode(node: MctsNode): Promise<void> {
    console.log('[MCTS] Expanding state space (Policy Network generating moves)...');
    
    // Use Gemini (Fast/Policy) to brainstorm distinct approaches
    const gemini = getGemini();
    const model = gemini.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview', generationConfig: { responseMimeType: 'application/json' } });
    
    const prompt = `
      You are the Policy Network for an MCTS error resolver.
      Here is an error trace:
      ${node.state.errorTrace}
      
      Here is the current code state:
      ${JSON.stringify(node.state.fileContents)}
      
      Generate exactly 3 distinct, mutually exclusive approaches to fix this error. 
      For example, Approach A might be adding a type assertion, Approach B might be wrapping in a try-catch, Approach C might be rewriting the logic.
      Return JSON: { "actions": [{ "description": "<plain english explanation>", "diffs": { "filepath": "<entire new file content replacing the old>" } }] }
    `;

    try {
      const response = await model.generateContent(prompt);
      const text = response.response.text();
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      
      for (const action of (parsed.actions || [])) {
        const nextState: CodeState = {
          filePaths: node.state.filePaths,
          fileContents: { ...node.state.fileContents, ...action.diffs },
          errorTrace: node.state.errorTrace
        };
        
        node.children.push(new MctsNode(nextState, action, node));
      }
      console.log(`[MCTS] Expanded ${node.children.length} branches.`);
    } catch (e) {
      console.error('[MCTS] Expansion failed:', e);
    }
  }

  private async simulate(state: CodeState): Promise<number> {
    console.log('[MCTS] Simulating compiler validation (Value Network Critic)...');
    
    // Try Claude Sonnet, fallback to Gemini
    const anthropic = getAnthropicClient();
    
    const prompt = `
      You are the Value Network (Critic) for an MCTS error resolver.
      You are acting as a strict TypeScript compiler and security scanner.
      
      Original Error:
      ${state.errorTrace}
      
      Proposed Code State:
      ${JSON.stringify(state.fileContents)}
      
      Will this new code completely resolve the error without introducing new type errors, logic bugs, or security vulnerabilities?
      Score this from 0.0 (utter failure/broken) to 1.0 (perfect, production-ready fix).
      
      Return ONLY a JSON object: { "score": 0.85, "reasoning": "..." }
    `;

    try {
      let text = '';
      if (anthropic) {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }]
        });
        text = response.content[0].type === 'text' ? response.content[0].text : '';
      } else {
        // Fallback to Gemini if no Anthropic key
        const gemini = getGemini();
        const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro', generationConfig: { responseMimeType: 'application/json' } });
        const res = await model.generateContent(prompt);
        text = res.response.text();
      }

      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return typeof parsed.score === 'number' ? parsed.score : 0;
    } catch (e) {
      console.error('[MCTS] Simulation failed:', e);
      return 0.1; // Penalize broken simulations heavily but non-zero to differentiate from crash
    }
  }

  private backpropagate(node: MctsNode, reward: number): void {
    let current: MctsNode | null = node;
    while (current !== null) {
      current.visits += 1;
      current.totalReward += reward;
      current = current.parent;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getDepth(node: MctsNode): number {
    let depth = 0;
    let current = node.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }

  private getBestChild(node: MctsNode, explorationParam: number): MctsNode | null {
    if (node.children.length === 0) return null;
    return node.children.reduce((best, child) => 
      child.getUcbScore(explorationParam) > best.getUcbScore(explorationParam) ? child : best
    );
  }

  private async saveLearnedStrategy(errorTrace: string, action: CodeAction) {
    try {
      const supabase = getSupabase();
      await supabase.from('knowledge_nodes').insert({
        node_type: 'concept',
        content: `Error Resolution Strategy Learned via MCTS:\nError: ${errorTrace}\nWinning Approach: ${action.description}`,
        canonical_name: `mcts_resolution_${Date.now()}`
      });
      console.log(`[MCTS] Saved learned strategy to Knowledge Graph!`);
    } catch (e) {
      console.error('[MCTS] Failed to save strategy:', e);
    }
  }
}
