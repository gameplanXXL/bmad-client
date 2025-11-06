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
