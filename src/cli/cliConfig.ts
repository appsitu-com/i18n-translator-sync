import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import { ConfigProvider } from '../core/coreConfig';
import { FileSystem } from '../core/util/fs';
import { Logger } from '../core/util/baseLogger';
import { substituteEnvVarsInObject } from '../core/util/envSubstitution';

/**
 * CLI configuration provider
 * Loads configuration from a project-level translator.json file and provides a VSCode-like interface
 */
export class CliConfigProvider implements ConfigProvider {
  private config: Record<string, any> = {};

  /**
   * Create a new CLI configuration provider
   * @param fs FileSystem abstraction
   * @param logger Logger interface
   * @param configPath Path to the project's translator.json configuration file
   */
  constructor(
    private fs: FileSystem,
    private logger: Logger,
    private configPath: string
  ) {}

  /**
   * Load configuration from the project's translator.json file
   */
  async load(): Promise<void> {
    try {
      if (await this.fs.fileExists(this.fs.createUri(this.configPath))) {
        const content = await this.fs.readFile(this.fs.createUri(this.configPath));
        const rawConfig = JSON5.parse(content);

        // Substitute environment variables in the translator section
        if (rawConfig.translator) {
          this.logger.debug(`Substituting environment variables in translator config`);
          rawConfig.translator = substituteEnvVarsInObject(rawConfig.translator);
        }

        this.config = rawConfig;
        this.logger.debug(`Loaded project configuration from ${this.configPath}`);
      } else {
        this.logger.warn(`Project configuration file not found: ${this.configPath}`);
        this.logger.warn(`Please create a translator.json file in your project directory.`);
      }
    } catch (error) {
      this.logger.error(`Error loading project configuration from ${this.configPath}: ${error}`);
    }
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