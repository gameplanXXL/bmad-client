/**
 * BMad Client Library
 *
 * SDK for executing BMad Method agents via LLM APIs
 */

export { BmadClient } from './client.js';
export { BmadSession } from './session.js';
export { ConversationalSession } from './conversational-session.js';
export { SystemPromptGenerator } from './prompt-generator.js';
export { AgentLoader, AgentLoadError, AgentParseError } from './agent-loader.js';
export { AnthropicProvider, AnthropicProviderError } from './providers/anthropic.js';
export { FallbackToolExecutor } from './tools/fallback-executor.js';

export type {
  BmadClientConfig,
  ProviderConfig,
  SessionOptions,
  SessionResult,
  SessionStatus,
  ConversationalOptions,
  ConversationTurn,
  ConversationResult,
  ConversationalStatus,
  AgentDefinition,
  Message,
  Tool,
  ToolCall,
  Document,
  CostReport,
  Question,
  Logger,
  LLMProvider,
  ModelInfo,
} from './types.js';

// Export template system
export * from './templates/index.js';

// Export task system
export * from './tasks/index.js';

// Export cost tracking system
export * from './cost/index.js';

// Export storage system
export * from './storage/index.js';
