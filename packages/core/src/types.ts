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
    content: string | ContentBlock[];
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
    title?: string;
    icon?: string;
    whenToUse?: string;
    customization?: string;
  };
  persona?: {
    role: string;
    style: string;
    identity: string;
    focus: string;
    core_principles: string[];
  };
  // Commands can be either string array, object array, or mixed
  commands?: string[] | Record<string, string>[] | (string | Record<string, string>)[];
  dependencies?: {
    tasks?: string[];
    templates?: string[];
    checklists?: string[];
    data?: string[];
    utils?: string[];
    workflows?: string[];
  };
  activation_instructions?: string[];
  // Meta fields used by BMad orchestration (flexible types)
  'IDE-FILE-RESOLUTION'?: unknown;
  'REQUEST-RESOLUTION'?: unknown;
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionOptions {
  costLimit?: number;
  pauseTimeout?: number;
  context?: Record<string, unknown>;
  parentSessionId?: string; // Set when this is a child session
  isSubAgent?: boolean; // True if this session is invoked by another agent
  autoSave?: boolean; // Auto-save session state after each API call (default: false)
  autoSaveInterval?: number; // Auto-save interval in milliseconds (default: after each API call)
}

export interface SessionResult {
  status: 'completed' | 'failed' | 'timeout';
  documents: Document[];
  costs: CostReport;
  duration: number;
  error?: Error;
  messages?: Message[]; // Full conversation history
  finalResponse?: string; // Last assistant message (for convenience)
  storageUrls?: string[]; // URLs to stored documents (if storage configured)
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
  childSessions?: ChildSessionCost[]; // Costs from invoked sub-agents
}

export interface ChildSessionCost {
  sessionId: string;
  agent: string;
  command: string;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
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

/**
 * Serialized session state for persistence and recovery
 */
export interface SessionState {
  // Session identity
  id: string;
  agentId: string;
  command: string;
  status: SessionStatus;

  // Timestamps
  createdAt: number;
  startedAt?: number;
  pausedAt?: number;
  completedAt?: number;

  // Conversation state
  messages: Message[];

  // VFS state
  vfsFiles: Record<string, string>; // path -> content

  // Cost tracking
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  apiCallCount: number;
  childSessionCosts: ChildSessionCost[];

  // Pause/resume state
  pendingQuestion?: {
    question: string;
    context?: string;
  };

  // Options
  options: SessionOptions;

  // Provider info (for recreation)
  providerType: 'anthropic' | 'custom';
  modelName?: string;
}

/**
 * Serialized conversational session state
 */
export interface ConversationalSessionState extends SessionState {
  // Conversation history
  turns: ConversationTurn[];

  // Conversational status
  conversationalStatus: ConversationalStatus;

  // Current processing state
  currentUserMessage?: string;
}

// ============================================================================
// Conversational Session Types
// ============================================================================

export interface ConversationalOptions {
  costLimit?: number;
  pauseTimeout?: number;
  autoSave?: boolean; // Auto-save state after each turn
  context?: Record<string, unknown>;
}

export interface ConversationTurn {
  id: string;
  userMessage: string;
  agentResponse: string;
  toolCalls: ToolCall[];
  tokensUsed: { input: number; output: number };
  cost: number;
  timestamp: number;
}

export interface ConversationResult {
  conversationId: string;
  turns: ConversationTurn[];
  documents: Document[];
  totalCost: number;
  totalTokens: { input: number; output: number };
  duration: number;
}

export type ConversationalStatus = 'idle' | 'processing' | 'waiting_for_answer' | 'ended' | 'error';

// ============================================================================
// Client Configuration
// ============================================================================

export interface BmadClientConfig {
  provider: ProviderConfig | LLMProvider;
  storage?: StorageConfig; // Optional storage configuration
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  logger?: Logger;
  expansionPackPaths?: string[]; // Paths to scan for .bmad-*/ directories
}

export interface StorageConfig {
  type: 'memory' | 'gcs' | 'custom';

  // GCS-specific config
  projectId?: string;
  bucketName?: string;
  keyFilename?: string;
  credentials?: Record<string, unknown>;

  // Custom adapter
  adapter?: any; // StorageAdapter (avoiding circular dependency)
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
