import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigProvider } from '../core/coreConfig';
import { TRANSLATOR_JSON } from '../core/constants';
import { substituteEnvVarsInObject } from '../core/util/envSubstitution';

type EngineSection = 'azure' | 'google' | 'deepl' | 'gemini' | 'copy';

function isEngineSection(section: string): section is EngineSection {
  return section === 'azure' || section === 'google' || section === 'deepl' || section === 'gemini' || section === 'copy';
}

/**
 * VSCode configuration provider implementation
 */
export class VsCodeConfigProvider implements ConfigProvider {
  private config: Record<string, any> = {};
  private engineConfigCache: Partial<Record<EngineSection, unknown>> = {};

  /**
   * Load configuration from translator.json file in the workspace
   */
  async load(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    // Always clear cached values before reloading from disk.
    this.config = {};
    this.engineConfigCache = {};

    const configPath = path.join(workspaceFolder.uri.fsPath, TRANSLATOR_JSON);

    try {
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const rawConfig = JSON.parse(configContent);

        // Substitute environment variables in the translator section
        if (rawConfig.translator) {
          console.log(`[CONFIG] Substituting environment variables in translator config`);
          rawConfig.translator = substituteEnvVarsInObject(rawConfig.translator);
        }

        this.config = rawConfig;
        console.log(`Loaded VSCode configuration from: ${configPath}`);
      }
    } catch (error) {
      console.error(`Error loading translator.json configuration: ${error}`);
    }
  }

  /**
   * Get configuration for a specific section
   */
  get<T>(section: string, defaultValue?: T): T {
    // Special handling for translation engine configs
    if (isEngineSection(section)) {
      const cached = this.engineConfigCache[section] as T | undefined;
      if (cached !== undefined) {
        return cached;
      }

      // For translation engines, create a default configuration if not specified
      let engineConfig: any = {};

      if (section === 'azure') {
        const keyFromEnv = process.env.AZURE_TRANSLATION_KEY
        const masked = keyFromEnv && keyFromEnv.length > 8 ? `${keyFromEnv.substring(0, 4)}...${keyFromEnv.substring(keyFromEnv.length - 4)}` : keyFromEnv ? '[too short]' : '[not set]'
        console.log(`[CONFIG] Azure config from process.env - key: ${masked}, region: ${process.env.AZURE_TRANSLATION_REGION}`)
        engineConfig = {
          key: keyFromEnv,
          region: process.env.AZURE_TRANSLATION_REGION,
          endpoint: process.env.AZURE_TRANSLATION_URL || 'https://api.cognitive.microsofttranslator.com'
        };
      } else if (section === 'google') {
        engineConfig = {
          key: process.env.GOOGLE_TRANSLATION_KEY,
          endpoint: process.env.GOOGLE_TRANSLATION_URL || 'https://translation.googleapis.com',
          googleProjectId: process.env.GOOGLE_TRANSLATION_PROJECT_ID,
          googleLocation: process.env.GOOGLE_TRANSLATION_LOCATION || 'global'
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
        console.log(`[CONFIG] Merging translator.json config for ${section}:`, JSON.stringify({ ...translatorConfigs[section], key: '[REDACTED]', apiKey: '[REDACTED]' }, null, 2))

        // Keep translator.json values as-is (after env substitution).
        // Engine clients are responsible for interpreting aliases/fallbacks.
        engineConfig = { ...engineConfig, ...translatorConfigs[section] };
        console.log(`[CONFIG] Final merged config for ${section}:`, JSON.stringify({ ...engineConfig, key: engineConfig.key ? '[REDACTED]' : undefined, apiKey: engineConfig.apiKey ? '[REDACTED]' : undefined }, null, 2))
      }

      this.engineConfigCache[section] = engineConfig;
      return engineConfig as T;
    }

    const parts = section.split('.');

    // Handle special case for translator settings - check translator.json first
    if (parts[0] === 'translator' && parts.length > 1) {
      // Check translator.json config first
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

    // Handle other settings - check translator.json first
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