import * as vscode from 'vscode';
import { IConfigProvider } from '../core/coreConfig';

/**
 * VSCode configuration provider implementation
 */
export class VsCodeConfigProvider implements IConfigProvider {
  /**
   * No-op load: translator.json is parsed and validated centrally by core config loader.
   */
  async load(): Promise<void> {
    return;
  }

  /**
   * Get configuration for a specific section
   */
  get<T>(section: string, defaultValue?: T): T {
    const parts = section.split('.');

    // Handle translator.* lookups from VS Code settings scope directly.
    if (parts[0] === 'translator' && parts.length > 1) {
      const translatorSection = parts.slice(1).join('.');
      const config = vscode.workspace.getConfiguration('translator');
      return config.get<T>(translatorSection, defaultValue as T);
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