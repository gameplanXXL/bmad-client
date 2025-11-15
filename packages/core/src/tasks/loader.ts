import { readFile, readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import matter from 'gray-matter';
import { TaskMetadataSchema, TaskValidationError, type TaskDefinition } from './schema.js';
import type { Logger } from '../types.js';

/**
 * Task Loader - Loads task workflows from markdown files
 */
export class TaskLoader {
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Load a single task from file
   *
   * @param filePath - Path to task markdown file
   * @returns Parsed task definition
   */
  async loadTask(filePath: string): Promise<TaskDefinition> {
    try {
      const fileContent = await readFile(filePath, 'utf-8');

      // Parse YAML frontmatter if present
      const { data, content } = matter(fileContent);

      // Validate metadata if present
      let metadata;
      if (data && Object.keys(data).length > 0) {
        const result = TaskMetadataSchema.safeParse(data);
        if (!result.success) {
          throw new TaskValidationError(`Invalid task metadata in ${filePath}`, result.error);
        }
        metadata = result.data;
      }

      const task: TaskDefinition = {
        metadata,
        content,
        filepath: filePath,
      };

      this.logger?.debug(`Loaded task: ${basename(filePath)}`);

      return task;
    } catch (error) {
      this.logger?.warn(`Failed to load task from ${filePath}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Load all tasks from a directory
   *
   * @param dirPath - Directory path containing task markdown files
   * @returns Array of loaded tasks
   */
  async loadFromDirectory(dirPath: string): Promise<TaskDefinition[]> {
    try {
      const files = await readdir(dirPath);
      const mdFiles = files.filter((f) => extname(f) === '.md');

      this.logger?.debug(`Found ${mdFiles.length} task files in ${dirPath}`);

      const tasks: TaskDefinition[] = [];

      for (const file of mdFiles) {
        try {
          const task = await this.loadTask(join(dirPath, file));
          tasks.push(task);
        } catch (error) {
          // Log warning but continue loading other tasks
          this.logger?.warn(`Skipping invalid task: ${file}`, {
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      return tasks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger?.debug(`Task directory not found: ${dirPath}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Load tasks from multiple directories (core + expansion packs)
   *
   * @param searchPaths - Array of directory paths to scan
   * @returns All loaded tasks
   */
  async loadFromMultiplePaths(searchPaths: string[]): Promise<TaskDefinition[]> {
    const allTasks: TaskDefinition[] = [];

    for (const searchPath of searchPaths) {
      try {
        const tasks = await this.loadFromDirectory(searchPath);
        allTasks.push(...tasks);
      } catch (error) {
        this.logger?.warn(`Failed to load tasks from ${searchPath}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return allTasks;
  }

  /**
   * Load tasks from expansion packs
   *
   * @param expansionPackPaths - Paths to scan for .bmad-* directories
   * @returns Tasks loaded from expansion packs
   */
  async loadFromExpansionPacks(expansionPackPaths: string[]): Promise<TaskDefinition[]> {
    const allTasks: TaskDefinition[] = [];

    for (const basePath of expansionPackPaths) {
      try {
        const entries = await readdir(basePath);

        // Find all .bmad-* directories
        const bmadDirs = entries.filter((entry) => entry.startsWith('.bmad-'));

        for (const bmadDir of bmadDirs) {
          const tasksPath = join(basePath, bmadDir, 'tasks');

          try {
            const tasks = await this.loadFromDirectory(tasksPath);
            allTasks.push(...tasks);

            if (tasks.length > 0) {
              this.logger?.info(`Loaded ${tasks.length} tasks from expansion pack: ${bmadDir}`);
            }
          } catch (error) {
            // Continue with other expansion packs
            this.logger?.debug(`No tasks in ${bmadDir}`);
          }
        }
      } catch (error) {
        this.logger?.warn(`Failed to scan expansion packs in ${basePath}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return allTasks;
  }
}

/**
 * Task Not Found Error
 */
export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}
