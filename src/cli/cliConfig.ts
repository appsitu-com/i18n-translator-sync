import * as fs from 'fs';
import * as path from 'path';
import { IConfigProvider } from '../core/coreConfig';
import { IFileSystem } from '../core/util/fs';
import { ILogger } from '../core/util/baseLogger';

/**
 * CLI configuration provider
 * Loads configuration from a project-level translator.json file and provides a VSCode-like interface
 */
export class CliConfigProvider implements IConfigProvider {
  private config: Record<string, any> = {};

  /**
   * Create a new CLI configuration provider
   * @param fs IFileSystem abstraction
   * @param logger ILogger interface
   * @param configPath Path to the project's translator.json configuration file
   */
  constructor(
    private fs: IFileSystem,
    private logger: ILogger,
    private configPath: string
  ) {}

  /**
   * No-op load: translator.json is parsed and validated centrally by core config loader.
   */
  async load(): Promise<void> {
    return;
  }

  /**
   * Save configuration to a file
   */
  private saveConfig(): void {
    try {
      // Ensure the directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save the config file
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error(`Error saving configuration to ${this.configPath}:`, error);
    }
  }

  /**
   * Get a configuration value
   */
  get<T>(section: string, defaultValue?: T): T {
    // Split the section by dots
    const parts = section.split('.');

    // Navigate the config object
    let current = this.config;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // If we're at the last part, return it or the default value
      if (i === parts.length - 1) {
        return (current[part] !== undefined ? current[part] : defaultValue) as T;
      }

      // Otherwise, navigate deeper into the object
      if (!current[part] || typeof current[part] !== 'object') {
        return defaultValue as T;
      }

      current = current[part];
    }

    return defaultValue as T;
  }

  /**
   * Update a configuration value
   */
  async update(section: string, value: any): Promise<void> {
    // Split the section by dots
    const parts = section.split('.');

    // Navigate and update the config object
    let current = this.config;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // If we're at the last part, set the value
      if (i === parts.length - 1) {
        current[part] = value;
        break;
      }

      // Otherwise, ensure the path exists
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }

      current = current[part];
    }

    // Save the updated config
    this.saveConfig();
  }
}