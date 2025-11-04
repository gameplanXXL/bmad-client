import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import matter from 'gray-matter';
import { AgentDefinitionSchema } from './agent-schema.js';
import type { AgentDefinition } from './types.js';

/**
 * AgentLoader - Loads and parses agent definitions from markdown files
 */
export class AgentLoader {
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
   * Parse agent definition from markdown file content
   */
  private parseAgentFile(content: string, filePath: string): AgentDefinition {
    try {
      // Parse YAML frontmatter
      const { data } = matter(content);

      // Validate with Zod schema
      const parsed = AgentDefinitionSchema.parse(data);

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
