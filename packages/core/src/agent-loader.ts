import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import matter from 'gray-matter';
import { load as yamlLoad } from 'js-yaml';
import { AgentDefinitionSchema } from './agent-schema.js';
import type { AgentDefinition, Logger } from './types.js';

export interface ExpansionPackInfo {
  name: string;
  path: string;
  agentCount: number;
  agents: AgentDefinition[];
}

/**
 * AgentLoader - Loads and parses agent definitions from markdown files
 */
export class AgentLoader {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Load a single agent from a markdown file
   */
  async loadAgent(filePath: string): Promise<AgentDefinition> {
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      return this.parseAgentFile(fileContent, filePath);
    } catch (error) {
      if (error instanceof Error) {
        throw new AgentLoadError(`Failed to load agent from ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load all agents from a directory
   */
  async loadFromDirectory(dirPath: string): Promise<AgentDefinition[]> {
    try {
      const files = await readdir(dirPath);
      const mdFiles = files.filter((f) => extname(f) === '.md');

      const agents = await Promise.all(
        mdFiles.map((file) => this.loadAgent(join(dirPath, file)))
      );

      return agents;
    } catch (error) {
      if (error instanceof Error) {
        throw new AgentLoadError(`Failed to load agents from ${dirPath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Scan directories for expansion packs and load their agents.
   * Looks for .bmad-* subdirectories in the provided search paths.
   */
  async loadExpansionPacks(searchPaths: string[]): Promise<ExpansionPackInfo[]> {
    const expansionPacks: ExpansionPackInfo[] = [];

    for (const searchPath of searchPaths) {
      try {
        const packs = await this.discoverExpansionPacks(searchPath);
        expansionPacks.push(...packs);
      } catch (error) {
        // Log warning but don't fail if a search path is invalid
        if (error instanceof Error) {
          this.logger?.warn(`Failed to scan expansion packs in ${searchPath}: ${error.message}`);
        }
      }
    }

    return expansionPacks;
  }

  /**
   * Discover expansion packs in a directory (looks for .bmad-* subdirectories)
   */
  private async discoverExpansionPacks(basePath: string): Promise<ExpansionPackInfo[]> {
    const packs: ExpansionPackInfo[] = [];

    try {
      const entries = await readdir(basePath);

      // Find all .bmad-* directories
      const bmadDirs = entries.filter((entry) => entry.startsWith('.bmad-'));

      for (const bmadDir of bmadDirs) {
        const packPath = join(basePath, bmadDir);
        const agentsPath = join(packPath, 'agents');

        try {
          // Check if agents directory exists
          const agentsDirStat = await stat(agentsPath);
          if (!agentsDirStat.isDirectory()) {
            continue;
          }

          // Load agents from this expansion pack
          const agents = await this.loadFromDirectory(agentsPath);

          // Extract pack name from directory (e.g., .bmad-expert-author -> expert-author)
          const packName = bmadDir.replace('.bmad-', '');

          packs.push({
            name: packName,
            path: packPath,
            agentCount: agents.length,
            agents,
          });

          this.logger?.info(`Found expansion pack: ${packName} with ${agents.length} agents`, {
            path: packPath,
          });
        } catch (error) {
          // Log warning for individual pack but continue with others
          if (error instanceof Error) {
            this.logger?.warn(`Failed to load expansion pack ${bmadDir}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new AgentLoadError(`Failed to discover expansion packs in ${basePath}: ${error.message}`);
      }
      throw error;
    }

    return packs;
  }

  /**
   * Parse agent definition from markdown file content
   * Supports two formats:
   * 1. YAML Frontmatter (---\nyaml\n---) - Core agents
   * 2. Code Block YAML (```yaml\nyaml\n```) - Expansion Pack agents
   */
  private parseAgentFile(content: string, filePath: string): AgentDefinition {
    try {
      let yamlData: Record<string, unknown> = {};

      // Try YAML Frontmatter first (Core agent format)
      const { data } = matter(content);

      if (data && Object.keys(data).length > 0) {
        yamlData = data;
      } else {
        // Try Code Block YAML format (Expansion Pack format)
        const codeBlockMatch = content.match(/```yaml\n([\s\S]*?)\n```/);

        if (codeBlockMatch && codeBlockMatch[1]) {
          // Parse YAML from code block
          yamlData = yamlLoad(codeBlockMatch[1]) as Record<string, unknown>;
        }
      }

      // Validate with Zod schema
      const parsed = AgentDefinitionSchema.parse(yamlData);

      // Return as AgentDefinition
      return parsed as AgentDefinition;
    } catch (error) {
      if (error instanceof Error) {
        throw new AgentParseError(
          `Failed to parse agent definition in ${filePath}: ${error.message}`
        );
      }
      throw error;
    }
  }
}

/**
 * Custom error for agent loading failures
 */
export class AgentLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentLoadError';
  }
}

/**
 * Custom error for agent parsing failures
 */
export class AgentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentParseError';
  }
}
