import * as vscode from 'vscode';
import { ConfigProvider } from '../core/config';

/**
 * VSCode configuration provider implementation
 */
export class VsCodeConfigProvider implements ConfigProvider {
  /**
   * Get configuration for a specific section
   */
  get<T>(section: string, defaultValue?: T): T {
    const parts = section.split('.');

    // Handle special case for translator settings
    if (parts[0] === 'translator' && parts.length > 1) {
      const config = vscode.workspace.getConfiguration('translator');
      return config.get<T>(parts.slice(1).join('.'), defaultValue as T);
    }

    // Handle other settings
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