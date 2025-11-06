import type { CostReport, ModelCost, ChildSessionCost, Usage, LLMProvider, Logger } from '../types.js';
import { EventEmitter } from 'eventemitter3';

/**
 * Cost tracking events
 */
export interface CostTrackerEvents {
  'cost-warning': (data: { currentCost: number; limit: number; percentage: number }) => void;
  'cost-limit-exceeded': (data: { currentCost: number; limit: number }) => void;
}

/**
 * Cost tracker configuration
 */
export interface CostTrackerConfig {
  costLimit?: number;
  warningThresholds?: number[]; // Default: [0.5, 0.75, 0.9]
  currency?: string; // Default: 'USD'
  logger?: Logger;
}

/**
 * CostTracker - Tracks token usage and calculates costs in real-time
 *
 * Features:
 * - Per-model cost breakdown
 * - Cost limit enforcement
 * - Warning events at configurable thresholds
 * - Child session cost aggregation
 * - Detailed cost reporting
 *
 * @example
 * ```typescript
 * const tracker = new CostTracker(provider, { costLimit: 5.0 });
 *
 * tracker.on('cost-warning', ({ currentCost, limit, percentage }) => {
 *   console.log(`Warning: ${percentage}% of cost limit reached`);
 * });
 *
 * tracker.recordUsage(usage, 'claude-sonnet-4');
 * const report = tracker.getReport();
 * ```
 */
export class CostTracker extends EventEmitter<CostTrackerEvents> {
  private provider: LLMProvider;
  private config: Required<CostTrackerConfig>;
  private logger?: Logger;

  // Totals
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCost = 0;
  private apiCallCount = 0;

  // Per-model breakdown
  private modelBreakdown: Map<string, {
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
  }> = new Map();

  // Child sessions
  private childSessions: ChildSessionCost[] = [];

  // Warning tracking (to avoid duplicate warnings)
  private emittedWarnings: Set<number> = new Set();

  constructor(provider: LLMProvider, config?: CostTrackerConfig) {
    super();
    this.provider = provider;
    this.logger = config?.logger;

    this.config = {
      costLimit: config?.costLimit ?? Infinity,
      warningThresholds: config?.warningThresholds ?? [0.5, 0.75, 0.9],
      currency: config?.currency ?? 'USD',
      logger: config?.logger as Logger,
    };

    this.logger?.debug('CostTracker initialized', {
      costLimit: this.config.costLimit,
      warningThresholds: this.config.warningThresholds,
    });
  }

  /**
   * Record API usage and calculate cost
   *
   * @param usage - Token usage from API call
   * @param model - Model used for the call
   * @throws CostLimitExceededError if cost limit is exceeded
   */
  recordUsage(usage: Usage, model: string): void {
    // Update totals
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.apiCallCount++;

    // Calculate cost for this call
    const cost = this.provider.calculateCost(usage);
    this.totalCost += cost;

    // Update per-model breakdown
    const breakdown = this.modelBreakdown.get(model) || {
      inputTokens: 0,
      outputTokens: 0,
      inputCost: 0,
      outputCost: 0,
    };

    const modelInfo = this.provider.getModelInfo();
    const inputCost = (usage.inputTokens / 1000) * modelInfo.inputCostPer1k;
    const outputCost = (usage.outputTokens / 1000) * modelInfo.outputCostPer1k;

    breakdown.inputTokens += usage.inputTokens;
    breakdown.outputTokens += usage.outputTokens;
    breakdown.inputCost += inputCost;
    breakdown.outputCost += outputCost;

    this.modelBreakdown.set(model, breakdown);

    this.logger?.debug('Usage recorded', {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: cost.toFixed(4),
      totalCost: this.totalCost.toFixed(4),
    });

    // Check for warnings
    this.checkWarnings();

    // Check for cost limit
    this.checkCostLimit();
  }

  /**
   * Add child session costs to the report
   *
   * @param childCost - Cost data from child session
   */
  addChildSession(childCost: ChildSessionCost): void {
    this.childSessions.push(childCost);

    this.logger?.debug('Child session cost added', {
      sessionId: childCost.sessionId,
      agent: childCost.agent,
      cost: childCost.totalCost.toFixed(4),
    });
  }

  /**
   * Check if cost warnings should be emitted
   */
  private checkWarnings(): void {
    if (this.config.costLimit === Infinity) return;

    const percentage = this.totalCost / this.config.costLimit;

    for (const threshold of this.config.warningThresholds) {
      if (percentage >= threshold && !this.emittedWarnings.has(threshold)) {
        this.emittedWarnings.add(threshold);

        const warningData = {
          currentCost: this.totalCost,
          limit: this.config.costLimit,
          percentage: threshold,
        };

        this.logger?.warn('Cost warning', warningData);
        this.emit('cost-warning', warningData);
      }
    }
  }

  /**
   * Check if cost limit has been exceeded
   *
   * @throws CostLimitExceededError if limit exceeded
   */
  private checkCostLimit(): void {
    if (this.config.costLimit === Infinity) return;

    if (this.totalCost > this.config.costLimit) {
      const errorData = {
        currentCost: this.totalCost,
        limit: this.config.costLimit,
      };

      this.logger?.error('Cost limit exceeded', errorData);
      this.emit('cost-limit-exceeded', errorData);

      throw new CostLimitExceededError(
        this.totalCost,
        this.config.costLimit,
        this.config.currency
      );
    }
  }

  /**
   * Get current cost report
   *
   * @returns Complete cost report with breakdown
   */
  getReport(): CostReport {
    const breakdown: ModelCost[] = Array.from(this.modelBreakdown.entries()).map(
      ([model, data]) => ({
        model,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        inputCost: data.inputCost,
        outputCost: data.outputCost,
      })
    );

    return {
      totalCost: this.totalCost,
      currency: this.config.currency,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      apiCalls: this.apiCallCount,
      breakdown,
      childSessions: this.childSessions.length > 0 ? this.childSessions : undefined,
    };
  }

  /**
   * Get current total cost
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Get total cost including child sessions
   */
  getTotalCostWithChildren(): number {
    const childCosts = this.childSessions.reduce((sum, child) => sum + child.totalCost, 0);
    return this.totalCost + childCosts;
  }

  /**
   * Get cost limit
   */
  getCostLimit(): number {
    return this.config.costLimit;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    if (this.config.costLimit === Infinity) return Infinity;
    return Math.max(0, this.config.costLimit - this.totalCost);
  }

  /**
   * Get percentage of budget used
   */
  getBudgetPercentage(): number {
    if (this.config.costLimit === Infinity) return 0;
    return (this.totalCost / this.config.costLimit) * 100;
  }

  /**
   * Update cost limit
   *
   * @param newLimit - New cost limit
   */
  updateCostLimit(newLimit: number): void {
    this.config.costLimit = newLimit;
    this.logger?.info('Cost limit updated', { newLimit });

    // Reset emitted warnings since limit changed
    this.emittedWarnings.clear();

    // Re-check warnings with new limit
    this.checkWarnings();

    // Check if already exceeded
    this.checkCostLimit();
  }

  /**
   * Reset all tracking data (useful for testing)
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCost = 0;
    this.apiCallCount = 0;
    this.modelBreakdown.clear();
    this.childSessions = [];
    this.emittedWarnings.clear();
  }
}

/**
 * Custom error for cost limit exceeded
 */
export class CostLimitExceededError extends Error {
  constructor(
    public currentCost: number,
    public limit: number,
    public currency: string = 'USD'
  ) {
    super(
      `Cost limit exceeded: ${currency} ${currentCost.toFixed(4)} > ${currency} ${limit.toFixed(2)}. ` +
      `Consider increasing costLimit or optimizing prompts to reduce token usage.`
    );
    this.name = 'CostLimitExceededError';
  }
}
