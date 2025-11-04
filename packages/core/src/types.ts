/**
 * Core types for BMad Client Library
 */

// ============================================================================
// Provider Types
// ============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResponse {
  message: {
    role: 'assistant';
    content: string;
    toolCalls?: ToolCall[];
  };
  usage: Usage;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
}

export interface ProviderOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  sendMessage(
    messages: Message[],
    tools: Tool[],
    options?: ProviderOptions
  ): Promise<ProviderResponse>;

  calculateCost(usage: Usage): number;
  getModelInfo(): ModelInfo;
}

export interface ModelInfo {
  name: string;
  maxTokens: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentDefinition {
  agent: {
    name: string;
    id: string;
    title: string;
    icon: string;
    whenToUse: string;
    customization?: string;
  };
  persona: {
    role: string;
    style: string;
    identity: string;
    focus: string;
    core_principles: string[];
  };
  commands: string[];
  dependencies: {
    tasks?: string[];
    templates?: string[];
    checklists?: string[];
    data?: string[];
  };
  activation_instructions?: string[];
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionOptions {
  costLimit?: number;
  pauseTimeout?: number;
  context?: Record<string, unknown>;
}

export interface SessionResult {
  status: 'completed' | 'failed' | 'timeout';
  documents: Document[];
  costs: CostReport;
  duration: number;
  error?: Error;
}

export interface Document {
  path: string;
  content: string;
}

export interface CostReport {
  totalCost: number;
  currency: string;
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  breakdown: ModelCost[];
}

export interface ModelCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
}

export interface Question {
  question: string;
  context?: string;
}

export type SessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'timeout';

// ============================================================================
// Client Configuration
// ============================================================================

export interface BmadClientConfig {
  provider: ProviderConfig;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  logger?: Logger;
}

export interface ProviderConfig {
  type: 'anthropic';
  apiKey: string;
  model?: string;
}

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}
