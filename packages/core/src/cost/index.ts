/**
 * Cost Tracking System - Real-time cost tracking, limits, and estimation
 *
 * Provides comprehensive cost management for LLM API usage including:
 * - Real-time token usage tracking
 * - Cost calculation with per-model breakdown
 * - Cost limit enforcement with warnings
 * - Child session cost aggregation
 * - Cost estimation before execution
 */

export {
  CostTracker,
  CostLimitExceededError,
  type CostTrackerConfig,
  type CostTrackerEvents,
} from './tracker.js';

export {
  CostEstimator,
  type CostEstimate,
  type HistoricalUsage,
} from './estimator.js';
