/**
 * UCOL MCTS Resolver Node
 * 
 * Implements a Monte Carlo Tree Search (MCTS) algorithm for codebase error resolution.
 * Instead of a linear zero-shot fix, it expands a tree of possible file modifications,
 * uses an LLM Critic (Claude) to simulate compiler validation, and backpropagates
 * successful resolution strategies into the Knowledge Graph.
 */

import { generateText } from 'ai';
import { getUcolProvider } from '../providers/providerFactory';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

  constructor(maxIterations = 5, maxDepth = 3) {
    this.maxIterations = maxIterations;
    this.maxDepth = maxDepth;
  }

  /**
   * Main MCTS Execution Loop
   */
  public async resolveError(initialState: CodeState): Promise<CodeAction | null> {
    console.log('[MCTS] Starting resolution tree search...');
    const root = new MctsNode(initialState, null);

    for (let i = 0; i < this.maxIterations; i++) {
      // 1. SELECTION: Traverse the tree using UCB1 to find a leaf node
      const nodeToExpand = this.selectNode(root);

      // 2. EXPANSION: Use Gemini (Policy Network) to generate N possible fixes
      if (this.getDepth(nodeToExpand) < this.maxDepth && nodeToExpand.visits > 0 || nodeToExpand === root) {
        await this.expandNode(nodeToExpand);
      }

      // Pick an unvisited child to simulate, or simulate the node itself if it has no children
      const nodeToSimulate = nodeToExpand.children.find(c => c.visits === 0) || nodeToExpand;

      // 3. SIMULATION: Use Claude (Value Network) to grade the code state
      const reward = await this.simulate(nodeToSimulate.state);

      // 4. BACKPROPAGATION: Update visits and rewards up the tree
      this.backpropagate(nodeToSimulate, reward);
    }

    // Select the best action based on the highest average reward
    const bestChild = this.getBestChild(root, 0); // explorationParam = 0 (pure exploitation)
    
    if (bestChild && bestChild.actionTaken) {
      await this.saveLearnedStrategy(initialState.errorTrace, bestChild.actionTaken);
      return bestChild.actionTaken;
    }
    return null;
  }

  // ─── MCTS Phases ─────────────────────────────────────────────────────────────

  private selectNode(node: MctsNode): MctsNode {
    let current = node;
    while (current.children.length > 0) {
      // If any child is unvisited, we must expand it first
      const unvisited = current.children.find(c => c.visits === 0);
      if (unvisited) return unvisited;

      // Otherwise, pick the child with the highest UCB1 score
      current = current.children.reduce((best, child) => 
        child.getUcbScore() > best.getUcbScore() ? child : best
      );
    }
    return current;
  }

  private async expandNode(node: MctsNode): Promise<void> {
    console.log('[MCTS] Expanding state space (Policy Network generating moves)...');
    
    // Use Gemini (Fast/Policy) to brainstorm distinct approaches
    const provider = getUcolProvider('google', 'gemini-3.1-flash-lite-preview');
    
    const prompt = `
      You are the Policy Network for an MCTS error resolver.
      Here is an error trace:
      ${node.state.errorTrace}
      
      Here is the current code state:
      ${JSON.stringify(node.state.fileContents)}
      
      Generate exactly 3 distinct, mutually exclusive approaches to fix this error. 
      Return JSON: { "actions": [{ "description": "...", "diffs": { "filename": "new content" } }] }
    `;

    try {
      const response = await generateText({
        model: provider,
        prompt,
      });

      const parsed = JSON.parse(response.text.replace(/```json|```/g, ''));
      
      for (const action of parsed.actions) {
        // Create a new hypothetical code state for this branch
        const nextState: CodeState = {
          filePaths: node.state.filePaths,
          fileContents: { ...node.state.fileContents, ...action.diffs },
          errorTrace: node.state.errorTrace
        };
        
        node.children.push(new MctsNode(nextState, action, node));
      }
    } catch (e) {
      console.error('[MCTS] Expansion failed:', e);
    }
  }

  private async simulate(state: CodeState): Promise<number> {
    console.log('[MCTS] Simulating compiler validation (Value Network Critic)...');
    
    // Use Claude Sonnet (Quality/Critic) to grade the state
    const provider = getUcolProvider('anthropic', 'claude-sonnet-4-6');
    
    const prompt = `
      You are the Value Network (Critic) for an MCTS error resolver.
      You are acting as a strict TypeScript compiler.
      
      Original Error:
      ${state.errorTrace}
      
      Proposed Code State:
      ${JSON.stringify(state.fileContents)}
      
      Will this new code completely resolve the error without introducing new type errors, logic bugs, or security vulnerabilities?
      Score this from 0.0 (utter failure/broken) to 1.0 (perfect, production-ready fix).
      
      Return ONLY a JSON object: { "score": 0.85, "reasoning": "..." }
    `;

    try {
      const response = await generateText({
        model: provider,
        prompt,
      });

      const parsed = JSON.parse(response.text.replace(/```json|```/g, ''));
      return typeof parsed.score === 'number' ? parsed.score : 0;
    } catch (e) {
      console.error('[MCTS] Simulation failed:', e);
      return 0; // Penalize broken simulations
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

  /**
   * Commits the winning strategy to the UCOL Knowledge Graph so the 
   * agent learns this fix topology for the future.
   */
  private async saveLearnedStrategy(errorTrace: string, action: CodeAction) {
    try {
      await supabaseAdmin.from('knowledge_nodes').insert({
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
