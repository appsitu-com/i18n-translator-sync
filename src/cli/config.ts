import * as fs from 'fs';
import * as path from 'path';
import { ConfigProvider } from '../core/config';
import { FileSystem } from '../core/util/fs';
import { Logger } from '../core/util/logger';

/**
 * CLI configuration provider
 * Loads configuration from a project-level .translate.json file and provides a VSCode-like interface
 */
export class CliConfigProvider implements ConfigProvider {
  private config: Record<string, any> = {};

  /**
   * Create a new CLI configuration provider
   * @param fs FileSystem abstraction
   * @param logger Logger interface
   * @param configPath Path to the project's .translate.json configuration file
   */
  constructor(
    private fs: FileSystem,
    private logger: Logger,
    private configPath: string
  ) {}

  /**
   * Load configuration from the project's .translate.json file
   */
  async load(): Promise<void> {
    try {
      if (await this.fs.fileExists(this.fs.createUri(this.configPath))) {
        const content = await this.fs.readFile(this.fs.createUri(this.configPath));
        this.config = JSON.parse(content);
        this.logger.debug(`Loaded project configuration from ${this.configPath}`);
      } else {
        this.logger.warn(`Project configuration file not found: ${this.configPath}`);
        this.logger.warn(`Please create a .translate.json file in your project directory.`);
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
    // Special handling for translation engine configs
    if (section === 'azure' || section === 'google' || section === 'deepl' || section === 'gemini' || section === 'copy') {
      // For translation engines, create a default configuration if not specified
      let engineConfig: any = {};

      if (section === 'azure') {
        engineConfig = {
          key: process.env.AZURE_TRANSLATION_KEY,
          region: process.env.AZURE_TRANSLATION_REGION,
          url: process.env.AZURE_TRANSLATION_URL || 'https://api.cognitive.microsofttranslator.com'
        };
      } else if (section === 'google') {
        engineConfig = {
          key: process.env.GOOGLE_TRANSLATION_KEY,
          url: process.env.GOOGLE_TRANSLATION_URL || 'https://translation.googleapis.com'
        };
      } else if (section === 'deepl') {
        engineConfig = {
          key: process.env.DEEPL_TRANSLATION_KEY,
          url: process.env.DEEPL_TRANSLATION_URL || 'https://api-free.deepl.com',
          free: true
        };
      } else if (section === 'gemini') {
        engineConfig = {
          key: process.env.GEMINI_API_KEY,
          geminiModel: 'gemini-1.5-pro',
          temperature: 0.1,
          maxOutputTokens: 1024
        };
      } else if (section === 'copy') {
        engineConfig = {}; // Copy engine doesn't need any config
      }

      // Check if config has translator-specific values
      const translatorConfigs = this.config.translator;
      if (translatorConfigs && translatorConfigs[section]) {
        // Merge with default config
        engineConfig = { ...engineConfig, ...translatorConfigs[section] };
      }

      this.logger.debug(`Loaded ${section} translator config: ${JSON.stringify({ ...engineConfig, key: engineConfig.key ? '***' : undefined })}`);

      return engineConfig as T;
    }

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