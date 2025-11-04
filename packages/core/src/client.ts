import { EventEmitter } from 'eventemitter3';
import type { BmadClientConfig, SessionOptions, Logger } from './types.js';
import { BmadSession } from './session.js';

/**
 * BmadClient - Main entry point for the SDK
 */
export class BmadClient extends EventEmitter {
  private config: BmadClientConfig;
  private logger: Logger;

  constructor(config: BmadClientConfig) {
    super();
    this.config = config;
    this.logger = config.logger || this.createDefaultLogger(config.logLevel || 'info');

    this.logger.info('BmadClient initialized', {
      provider: config.provider.type,
      model: config.provider.model || 'default',
    });
  }

  /**
   * Start a new agent session
   */
  async startAgent(
    agentId: string,
    command: string,
    options?: SessionOptions
  ): Promise<BmadSession> {
    this.logger.info('Starting agent session', { agentId, command });

    const session = new BmadSession(this, agentId, command, options);

    return session;
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
