import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { parseTemplate } from './parser.js';
import { TemplateRegistry } from './registry.js';
import type { Logger } from '../types.js';
import type { TemplateDefinition } from './schema.js';

/**
 * Template Loader - Loads templates from filesystem
 */
export class TemplateLoader {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Load a single template from file
   *
   * @param filePath - Path to template YAML file
   * @returns Parsed template definition
   */
  async loadTemplate(filePath: string): Promise<TemplateDefinition> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const template = parseTemplate(content);

      this.logger?.debug(`Loaded template: ${template.template.id} from ${filePath}`);

      return template;
    } catch (error) {
      this.logger?.warn(`Failed to load template from ${filePath}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Load all templates from a directory
   *
   * @param dirPath - Directory path containing template YAML files
   * @returns Array of loaded templates
   */
  async loadFromDirectory(dirPath: string): Promise<TemplateDefinition[]> {
    try {
      const files = await readdir(dirPath);
      const yamlFiles = files.filter((f) => extname(f) === '.yaml' || extname(f) === '.yml');

      this.logger?.debug(`Found ${yamlFiles.length} template files in ${dirPath}`);

      const templates: TemplateDefinition[] = [];

      for (const file of yamlFiles) {
        try {
          const template = await this.loadTemplate(join(dirPath, file));
          templates.push(template);
        } catch (error) {
          // Log warning but continue loading other templates
          this.logger?.warn(`Skipping invalid template: ${file}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      return templates;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger?.debug(`Template directory not found: ${dirPath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Load templates and register them in registry
   *
   * @param dirPath - Directory path containing templates
   * @param registry - Template registry to register templates in
   * @returns Number of templates loaded
   */
  async loadAndRegister(dirPath: string, registry: TemplateRegistry): Promise<number> {
    const templates = await this.loadFromDirectory(dirPath);

    let registered = 0;
    for (const template of templates) {
      try {
        // Check if template is already registered before attempting to register
        if (registry.has(template.template.id)) {
          this.logger?.debug(`Template already registered: ${template.template.id}`);
          continue;
        }

        registry.register(template);
        registered++;
      } catch (error) {
        this.logger?.warn(`Failed to register template: ${template.template.id}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    this.logger?.info(`Loaded ${registered} templates from ${dirPath}`);

    return registered;
  }

  /**
   * Load templates from multiple directories (core + expansion packs)
   *
   * @param searchPaths - Array of directory paths to scan
   * @param registry - Template registry
   * @returns Total number of templates loaded
   */
  async loadFromMultiplePaths(searchPaths: string[], registry: TemplateRegistry): Promise<number> {
    let totalLoaded = 0;

    for (const searchPath of searchPaths) {
      try {
        const loaded = await this.loadAndRegister(searchPath, registry);
        totalLoaded += loaded;
      } catch (error) {
        this.logger?.warn(`Failed to load templates from ${searchPath}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return totalLoaded;
  }

  /**
   * Discover and load templates from expansion packs
   *
   * @param expansionPackPaths - Paths to scan for .bmad-* directories
   * @param registry - Template registry
   * @returns Number of templates loaded from expansion packs
   */
  async loadFromExpansionPacks(
    expansionPackPaths: string[],
    registry: TemplateRegistry
  ): Promise<number> {
    let totalLoaded = 0;

    for (const basePath of expansionPackPaths) {
      try {
        const { readdir: readdirSync } = await import('fs/promises');
        const entries = await readdirSync(basePath);

        // Find all .bmad-* directories
        const bmadDirs = entries.filter((entry) => entry.startsWith('.bmad-'));

        for (const bmadDir of bmadDirs) {
          const templatesPath = join(basePath, bmadDir, 'templates');

          try {
            const loaded = await this.loadAndRegister(templatesPath, registry);
            totalLoaded += loaded;

            if (loaded > 0) {
              this.logger?.info(`Loaded ${loaded} templates from expansion pack: ${bmadDir}`);
            }
          } catch (error) {
            // Continue with other expansion packs
            this.logger?.debug(`No templates in ${bmadDir}`);
          }
        }
      } catch (error) {
        this.logger?.warn(`Failed to scan expansion packs in ${basePath}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return totalLoaded;
  }
}
