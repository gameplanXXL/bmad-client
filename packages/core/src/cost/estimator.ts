import type { LLMProvider, Logger } from '../types.js';

/**
 * Cost estimation result
 */
export interface CostEstimate {
  min: number;
  max: number;
  average: number;
  currency: string;
  confidence: 'low' | 'medium' | 'high';
  basedOn: string; // Description of estimation method
}

/**
 * Historical usage data for estimation
 */
export interface HistoricalUsage {
  agentId: string;
  command: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
}

/**
 * CostEstimator - Estimates session costs before execution
 *
 * Provides cost estimates based on:
 * - Historical data from similar agent/command combinations
 * - Conservative assumptions when no historical data exists
 * - Document size estimates (if provided)
 *
 * @example
 * ```typescript
 * const estimator = new CostEstimator(provider);
 *
 * const estimate = estimator.estimate('pm', 'create-prd');
 * console.log(`Estimated cost: $${estimate.average.toFixed(2)}`);
 * console.log(`Range: $${estimate.min} - $${estimate.max}`);
 * ```
 */
export class CostEstimator {
  private provider: LLMProvider;
  private logger?: Logger;
  private historicalData: HistoricalUsage[] = [];

  // Default token estimates (conservative)
  private readonly DEFAULT_ESTIMATES = {
    // Simple commands (help, status, etc.)
    simple: { input: 2000, output: 1000 },
    // Document creation (PRD, architecture, etc.)
    document: { input: 5000, output: 10000 },
    // Complex tasks (multi-agent, research, etc.)
    complex: { input: 10000, output: 20000 },
  };

  constructor(provider: LLMProvider, logger?: Logger) {
    this.provider = provider;
    this.logger = logger;
  }

  /**
   * Estimate cost for an agent/command combination
   *
   * @param agentId - Agent ID
   * @param command - Command to execute
   * @param options - Optional estimation options
   * @returns Cost estimate with range
   */
  estimate(
    agentId: string,
    command: string,
    options?: {
      documentSize?: 'small' | 'medium' | 'large';
      complexity?: 'simple' | 'document' | 'complex';
    }
  ): CostEstimate {
    // Try to find historical data
    const historical = this.findHistoricalData(agentId, command);

    if (historical.length > 0) {
      return this.estimateFromHistorical(historical);
    }

    // Fall back to conservative estimates
    return this.estimateFromDefaults(agentId, command, options);
  }

  /**
   * Add historical usage data for future estimates
   *
   * @param usage - Historical usage data
   */
  addHistoricalData(usage: HistoricalUsage): void {
    this.historicalData.push(usage);

    // Keep only last 100 entries per agent/command
    const key = `${usage.agentId}:${usage.command}`;
    const entries = this.historicalData.filter(
      (h) => `${h.agentId}:${h.command}` === key
    );

    if (entries.length > 100) {
      // Remove oldest entries
      const toRemove = entries.slice(0, entries.length - 100);
      this.historicalData = this.historicalData.filter(
        (h) => !toRemove.includes(h)
      );
    }

    this.logger?.debug('Historical data added', {
      agentId: usage.agentId,
      command: usage.command,
      cost: usage.cost.toFixed(4),
    });
  }

  /**
   * Estimate based on historical data
   */
  private estimateFromHistorical(historical: HistoricalUsage[]): CostEstimate {
    const costs = historical.map((h) => h.cost);
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    const average = costs.reduce((sum, c) => sum + c, 0) / costs.length;

    // Confidence based on sample size
    let confidence: 'low' | 'medium' | 'high';
    if (historical.length >= 10) {
      confidence = 'high';
    } else if (historical.length >= 5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      min,
      max,
      average,
      currency: 'USD',
      confidence,
      basedOn: `${historical.length} historical executions`,
    };
  }

  /**
   * Estimate based on default assumptions
   */
  private estimateFromDefaults(
    agentId: string,
    command: string,
    options?: {
      documentSize?: 'small' | 'medium' | 'large';
      complexity?: 'simple' | 'document' | 'complex';
    }
  ): CostEstimate {
    // Determine complexity
    let complexity = options?.complexity;
    if (!complexity) {
      complexity = this.inferComplexity(agentId, command);
    }

    const tokenEstimate = this.DEFAULT_ESTIMATES[complexity];

    // Adjust for document size if provided
    let multiplier = 1.0;
    if (options?.documentSize === 'large') {
      multiplier = 2.0;
    } else if (options?.documentSize === 'small') {
      multiplier = 0.5;
    }

    const inputTokens = tokenEstimate.input * multiplier;
    const outputTokens = tokenEstimate.output * multiplier;

    // Calculate costs using provider
    const modelInfo = this.provider.getModelInfo();
    const inputCost = (inputTokens / 1000) * modelInfo.inputCostPer1k;
    const outputCost = (outputTokens / 1000) * modelInfo.outputCostPer1k;
    const totalCost = inputCost + outputCost;

    // Provide range with ±30% variance
    const min = totalCost * 0.7;
    const max = totalCost * 1.3;

    return {
      min,
      max,
      average: totalCost,
      currency: 'USD',
      confidence: 'low',
      basedOn: 'Conservative default estimates (no historical data)',
    };
  }

  /**
   * Infer complexity from agent and command
   */
  private inferComplexity(agentId: string, command: string): 'simple' | 'document' | 'complex' {
    // Simple commands
    if (command.match(/^(help|status|list)$/i)) {
      return 'simple';
    }

    // Document creation commands
    if (command.match(/^create-/i)) {
      return 'document';
    }

    // Complex agents (orchestrator, architect)
    if (agentId.match(/^(bmad-orchestrator|architect|sm)$/i)) {
      return 'complex';
    }

    // Default to document complexity
    return 'document';
  }

  /**
   * Find historical data for agent/command combination
   */
  private findHistoricalData(agentId: string, command: string): HistoricalUsage[] {
    return this.historicalData.filter(
      (h) => h.agentId === agentId && h.command === command
    );
  }

  /**
   * Clear all historical data (useful for testing)
   */
  clearHistory(): void {
    this.historicalData = [];
  }

  /**
   * Get all historical data (for persistence)
   */
  getHistory(): HistoricalUsage[] {
    return [...this.historicalData];
  }

  /**
   * Load historical data (from persistence)
   */
  loadHistory(data: HistoricalUsage[]): void {
    this.historicalData = data;
    this.logger?.info('Historical data loaded', { entries: data.length });
  }
}
