import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigProvider } from '../core/coreConfig';

/**
 * VSCode configuration provider implementation
 */
export class VsCodeConfigProvider implements ConfigProvider {
  private config: Record<string, any> = {};

  /**
   * Load configuration from .translator.json file in the workspace
   */
  async load(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const configPath = path.join(workspaceFolder.uri.fsPath, '.translator.json');

    try {
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(configContent);
        console.log(`Loaded VSCode configuration from: ${configPath}`);
      }
    } catch (error) {
      console.error(`Error loading .translator.json configuration: ${error}`);
    }
  }

  /**
   * Get configuration for a specific section
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

      console.log(`Loaded ${section} translator config from .translator.json and environment variables`);

      return engineConfig as T;
    }

    const parts = section.split('.');

    // Handle special case for translator settings - check .translator.json first
    if (parts[0] === 'translator' && parts.length > 1) {
      // Check .translator.json config first
      const translatorSection = parts.slice(1).join('.');
      let current = this.config;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          break;
        }
      }
      if (current !== this.config) {
        return current as T;
      }

      // Fall back to VSCode settings
      const config = vscode.workspace.getConfiguration('translator');
      return config.get<T>(translatorSection, defaultValue as T);
    }

    // Handle other settings - check .translator.json first
    if (section.includes('.')) {
      const parts = section.split('.');
      let current: any = this.config;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          current = undefined;
          break;
        }
      }
      if (current !== undefined) {
        return current as T;
      }
    } else {
      if (this.config[section] !== undefined) {
        return this.config[section] as T;
      }
    }

    // Fall back to VSCode settings
    const config = vscode.workspace.getConfiguration();
    return config.get<T>(section, defaultValue as T);
  }

  /**
   * Update configuration for a specific section
   */
  async update(section: string, value: any): Promise<void> {
    const parts = section.split('.');

    // Handle special case for translator settings
    if (parts[0] === 'translator' && parts.length > 1) {
      const config = vscode.workspace.getConfiguration('translator');
      await config.update(parts.slice(1).join('.'), value, vscode.ConfigurationTarget.Workspace);
      return;
    }

    // Handle other settings
    const config = vscode.workspace.getConfiguration();
    await config.update(section, value, vscode.ConfigurationTarget.Workspace);
  }
}