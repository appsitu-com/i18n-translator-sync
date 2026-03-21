import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import { ConfigProvider } from '../core/coreConfig';
import { TRANSLATOR_JSON } from '../core/constants';
import { substituteEnvVarsInObject } from '../core/util/envSubstitution';

/**
 * VSCode configuration provider implementation
 */
export class VsCodeConfigProvider implements ConfigProvider {
  private config: Record<string, any> = {};

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

    const configPath = path.join(workspaceFolder.uri.fsPath, TRANSLATOR_JSON);

    try {
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const rawConfig = JSON5.parse(configContent);

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