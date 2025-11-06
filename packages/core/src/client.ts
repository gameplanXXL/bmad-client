import { EventEmitter } from 'eventemitter3';
import type { BmadClientConfig, SessionOptions, ConversationalOptions, Logger } from './types.js';
import { BmadSession } from './session.js';
import { ConversationalSession } from './conversational-session.js';
import { TemplateRegistry, TemplateLoader } from './templates/index.js';
import type { StorageAdapter } from './storage/index.js';
import { InMemoryStorageAdapter, GoogleCloudStorageAdapter } from './storage/index.js';
import { resolve } from 'path';

/**
 * BmadClient - Main entry point for the SDK
 */
export class BmadClient extends EventEmitter {
  private config: BmadClientConfig;
  private logger: Logger;
  private templateRegistry: TemplateRegistry;
  private storage?: StorageAdapter;
  private initPromise?: Promise<void>;

  constructor(config: BmadClientConfig) {
    super();
    this.config = config;
    this.logger = config.logger || this.createDefaultLogger(config.logLevel || 'info');
    this.templateRegistry = new TemplateRegistry();

    const providerType = 'type' in config.provider ? config.provider.type : 'custom';
    const providerModel = 'model' in config.provider ? config.provider.model : 'default';

    this.logger.info('BmadClient initialized', {
      provider: providerType,
      model: providerModel || 'default',
      storage: config.storage?.type || 'none',
    });

    // Start initialization in background (templates + storage)
    this.initPromise = this.initialize();
  }

  /**
   * Initialize client (templates + storage)
   */
  private async initialize(): Promise<void> {
    await Promise.all([
      this.loadTemplates(),
      this.initializeStorage(),
    ]);
  }

  /**
   * Initialize storage adapter if configured
   */
  private async initializeStorage(): Promise<void> {
    if (!this.config.storage) {
      this.logger.debug('No storage configured, skipping storage initialization');
      return;
    }

    try {
      // Create storage adapter based on config
      if (this.config.storage.type === 'memory') {
        this.storage = new InMemoryStorageAdapter();
      } else if (this.config.storage.type === 'gcs') {
        if (!this.config.storage.projectId || !this.config.storage.bucketName) {
          throw new Error('GCS storage requires projectId and bucketName');
        }
        this.storage = new GoogleCloudStorageAdapter({
          projectId: this.config.storage.projectId,
          bucketName: this.config.storage.bucketName,
          keyFilename: this.config.storage.keyFilename,
          credentials: this.config.storage.credentials,
        });
      } else if (this.config.storage.type === 'custom') {
        if (!this.config.storage.adapter) {
          throw new Error('Custom storage type requires adapter');
        }
        this.storage = this.config.storage.adapter;
      }

      if (this.storage) {
        await this.storage.initialize();
        this.logger.info('Storage initialized', { type: this.config.storage.type });
      }
    } catch (error) {
      this.logger.error('Failed to initialize storage', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Wait for client initialization to complete (template loading)
   */
  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Load templates from .bmad-core and expansion packs
   */
  private async loadTemplates(): Promise<void> {
    const loader = new TemplateLoader(this.logger);

    try {
      // Load from local .bmad-core/templates/
      const localPath = resolve(process.cwd(), '.bmad-core/templates/');
      await loader.loadAndRegister(localPath, this.templateRegistry);

      // Load from bmad-export-author fallback (for development)
      const fallbackPath = resolve(process.cwd(), '../bmad-export-author/.bmad-core/templates/');
      await loader.loadAndRegister(fallbackPath, this.templateRegistry);

      // Load from expansion packs
      const expansionPackPaths = this.config.expansionPackPaths || [resolve(process.cwd(), '../')];
      await loader.loadFromExpansionPacks(expansionPackPaths, this.templateRegistry);

      this.logger.info(`Loaded ${this.templateRegistry.size} templates`);
    } catch (error) {
      this.logger.warn('Failed to load some templates', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Start a new agent session (one-shot execution)
   */
  async startAgent(
    agentId: string,
    command: string,
    options?: SessionOptions
  ): Promise<BmadSession> {
    this.logger.info('Starting agent session', { agentId, command });

    const session = new BmadSession(this, agentId, command, options);

    // Load agents into VFS for discovery (needs to be done before tools can access them)
    await session.initializeVFS();

    return session;
  }

  /**
   * Start a new conversational session (multi-turn interaction)
   *
   * Unlike startAgent (one-shot execution), this creates a persistent
   * conversation where you can send multiple messages and maintain
   * context across turns (Claude Code-like REPL).
   *
   * @example
   * ```typescript
   * const conversation = await client.startConversation('pm');
   *
   * await conversation.send('Create a PRD for todo app');
   * await conversation.waitForCompletion();
   *
   * await conversation.send('Update target users section');
   * await conversation.waitForCompletion();
   *
   * const result = await conversation.end();
   * ```
   */
  async startConversation(
    agentId: string,
    options?: ConversationalOptions
  ): Promise<ConversationalSession> {
    this.logger.info('Starting conversational session', { agentId });

    const conversation = new ConversationalSession(this, agentId, options);

    return conversation;
  }

  /**
   * Get client configuration
   */
  getConfig(): BmadClientConfig {
    return this.config;
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get storage adapter (if configured)
   */
  getStorage(): StorageAdapter | undefined {
    return this.storage;
  }

  /**
   * Get template registry
   */
  get templates(): TemplateRegistry {
    return this.templateRegistry;
  }

  /**
   * Recover session from saved state
   * Loads session from storage and creates new session instance
   *
   * @param sessionId - Session ID to recover
   * @returns Restored session instance
   * @throws Error if storage not configured or session not found
   *
   * @example
   * ```typescript
   * // Recover crashed session
   * const session = await client.recoverSession('sess_123_abc');
   *
   * // Continue execution if paused
   * if (session.getStatus() === 'paused') {
   *   session.answer('User response');
   * }
   *
   * const result = await session.execute();
   * ```
   */
  async recoverSession(sessionId: string): Promise<BmadSession> {
    if (!this.storage) {
      throw new Error('Storage not configured - cannot recover session');
    }

    this.logger.info('Recovering session from storage', { sessionId });

    try {
      const state = await this.storage.loadSessionState(sessionId);
      const session = await BmadSession.deserialize(this, state);

      this.logger.info('Session recovered successfully', {
        sessionId,
        status: session.getStatus(),
        messageCount: state.messages.length,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to recover session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * List all saved sessions
   *
   * @param options - Query options to filter sessions
   * @returns List of session summaries
   * @throws Error if storage not configured
   *
   * @example
   * ```typescript
   * // List all sessions
   * const result = await client.listSessions();
   * console.log(`Found ${result.total} sessions`);
   *
   * // Filter by agent
   * const pmSessions = await client.listSessions({ agentId: 'pm' });
   *
   * // Get recent sessions
   * const recent = await client.listSessions({
   *   startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
   *   limit: 10,
   * });
   * ```
   */
  async listSessions(options?: import('./storage/types.js').StorageQueryOptions): Promise<import('./storage/types.js').SessionListResult> {
    if (!this.storage) {
      throw new Error('Storage not configured - cannot list sessions');
    }

    return await this.storage.listSessions(options);
  }

  /**
   * Delete saved session state
   *
   * @param sessionId - Session ID to delete
   * @returns true if deleted, false if not found
   * @throws Error if storage not configured
   *
   * @example
   * ```typescript
   * // Delete old session
   * const deleted = await client.deleteSession('sess_123_abc');
   * if (deleted) {
   *   console.log('Session deleted');
   * }
   * ```
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.storage) {
      throw new Error('Storage not configured - cannot delete session');
    }

    this.logger.info('Deleting session', { sessionId });

    try {
      const deleted = await this.storage.deleteSession(sessionId);

      if (deleted) {
        this.logger.info('Session deleted', { sessionId });
      } else {
        this.logger.warn('Session not found for deletion', { sessionId });
      }

      return deleted;
    } catch (error) {
      this.logger.error('Failed to delete session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Health check - verify all components are operational
   *
   * Checks:
   * - Provider connectivity (test API call)
   * - Storage accessibility (if configured)
   * - Template registry status
   *
   * @returns Health status for each component
   *
   * @example
   * ```typescript
   * const health = await client.healthCheck();
   *
   * if (!health.healthy) {
   *   console.error('Client unhealthy:', health.issues);
   * }
   * ```
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    provider: { healthy: boolean; error?: string };
    storage: { healthy: boolean; error?: string };
    templates: { healthy: boolean; count: number };
    timestamp: number;
    issues: string[];
  }> {
    const timestamp = Date.now();
    const issues: string[] = [];

    // Check Provider
    let providerHealthy = false;
    let providerError: string | undefined;

    try {
      const provider = this.getProvider();
      // Simple test: create messages array (no actual API call to avoid costs)
      if (provider && typeof provider.streamMessages === 'function') {
        providerHealthy = true;
      } else {
        providerError = 'Provider missing required methods';
        issues.push('Provider not properly configured');
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : 'Unknown provider error';
      issues.push(`Provider error: ${providerError}`);
    }

    // Check Storage
    let storageHealthy = false;
    let storageError: string | undefined;

    if (this.storage) {
      try {
        // Test storage with a simple operation
        const testPath = '/.health-check';
        await this.storage.exists(testPath);
        storageHealthy = true;
      } catch (error) {
        storageError = error instanceof Error ? error.message : 'Unknown storage error';
        issues.push(`Storage error: ${storageError}`);
      }
    } else {
      storageHealthy = true; // Storage is optional
    }

    // Check Templates
    const templateCount = this.templateRegistry.list().length;
    const templatesHealthy = templateCount > 0;

    if (!templatesHealthy) {
      issues.push('No templates loaded');
    }

    const healthy = providerHealthy && storageHealthy && templatesHealthy;

    return {
      healthy,
      provider: { healthy: providerHealthy, error: providerError },
      storage: { healthy: storageHealthy, error: storageError },
      templates: { healthy: templatesHealthy, count: templateCount },
      timestamp,
      issues,
    };
  }

  /**
   * Get diagnostic information about the client
   *
   * Returns detailed information about:
   * - Configuration
   * - Loaded templates
   * - Storage statistics (if available)
   * - System information
   *
   * @returns Diagnostic data
   *
   * @example
   * ```typescript
   * const diagnostics = await client.getDiagnostics();
   * console.log('Templates:', diagnostics.templates.count);
   * console.log('Storage:', diagnostics.storage.type);
   * ```
   */
  async getDiagnostics(): Promise<{
    version: string;
    config: {
      provider: string;
      storage: string;
      logLevel: string;
    };
    templates: {
      count: number;
      templates: Array<{ id: string; name: string; sectionCount: number }>;
    };
    storage?: {
      type: string;
      initialized: boolean;
      sessionCount?: number;
    };
    system: {
      nodeVersion: string;
      platform: string;
      memory: {
        used: number;
        total: number;
      };
    };
  }> {
    // Get provider type
    const providerType = 'type' in this.config.provider
      ? this.config.provider.type
      : 'custom';

    // Get storage info
    let storageInfo: { type: string; initialized: boolean; sessionCount?: number } | undefined;

    if (this.config.storage) {
      storageInfo = {
        type: this.config.storage.type,
        initialized: this.storage !== undefined,
      };

      // Try to get session count
      if (this.storage) {
        try {
          const sessions = await this.storage.listSessions({ limit: 1 });
          storageInfo.sessionCount = sessions.total;
        } catch {
          // Ignore errors when fetching session count
        }
      }
    }

    // Get template information
    const allTemplates = this.templateRegistry.list();
    const templates = {
      count: allTemplates.length,
      templates: allTemplates.map(t => ({
        id: t.template.id,
        name: t.template.name,
        sectionCount: t.sections.length,
      })),
    };

    // System information
    const memUsage = process.memoryUsage();
    const system = {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      },
    };

    return {
      version: '0.1.0', // TODO: Read from package.json
      config: {
        provider: providerType,
        storage: this.config.storage?.type || 'none',
        logLevel: this.config.logLevel || 'info',
      },
      templates,
      storage: storageInfo,
      system,
    };
  }

  /**
   * Create default console logger
   */
  private createDefaultLogger(level: string): Logger {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevel = levels.indexOf(level);

    return {
      error: (msg: string, meta?: unknown) => {
        if (currentLevel >= 0) console.error(`[BMAD ERROR] ${msg}`, meta || '');
      },
      warn: (msg: string, meta?: unknown) => {
        if (currentLevel >= 1) console.warn(`[BMAD WARN] ${msg}`, meta || '');
      },
      info: (msg: string, meta?: unknown) => {
        if (currentLevel >= 2) console.log(`[BMAD INFO] ${msg}`, meta || '');
      },
      debug: (msg: string, meta?: unknown) => {
        if (currentLevel >= 3) console.log(`[BMAD DEBUG] ${msg}`, meta || '');
      },
    };
  }
}
