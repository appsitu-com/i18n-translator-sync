import * as vscode from 'vscode';

/**
 * Represents the current state of the translator
 */
export interface ITranslatorState {
  isRunning: boolean;
  isInitialized: boolean;
}

/**
 * Interface for managing the status bar item
 */
export interface IStatusBarManager {
  /**
   * Create and show the status bar item
   */
  create(): void;

  /**
   * Update the status bar based on the current translator state
   */
  updateStatus(state: ITranslatorState): void;

  /**
   * Hide and dispose the status bar item
   */
  dispose(): void;
}

/**
 * VSCode implementation of the status bar manager
 */
export class VSCodeStatusBarManager implements IStatusBarManager {
  private statusBarItem: vscode.StatusBarItem | null = null;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  create(): void {
    if (this.statusBarItem) {
      return; // Already created
    }

    // Check if we're in a real VS Code environment (not in tests)
    if (typeof vscode.window.createStatusBarItem === 'function') {
      try {
        // Skip creating status bar item in test environments
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
          this.statusBarItem.command = 'translator.showContextMenu'; // Context menu command
          this.statusBarItem.show();
          this.context.subscriptions.push(this.statusBarItem);
        }
      } catch (error) {
        console.warn('Could not create status bar item:', error);
      }
    }
  }

  updateStatus(state: ITranslatorState): void {
    if (!this.statusBarItem) {
      return;
    }

    if (state.isRunning) {
      this.statusBarItem.text = '$(play-circle) Translator';
      this.statusBarItem.tooltip = 'i18n Translator is auto translating selected files. Click for menu options.';
      this.statusBarItem.command = 'translator.showContextMenu';
    } else if (state.isInitialized) {
      this.statusBarItem.text = '$(debug-pause) Translator';
      this.statusBarItem.tooltip = 'i18n Translator is Paused. Click for menu options.';
      this.statusBarItem.command = 'translator.showContextMenu';
    } else {
      this.statusBarItem.text = '$(globe) Translator';
      this.statusBarItem.tooltip = 'i18n Translator not Started. Click for menu options.';
      this.statusBarItem.command = 'translator.showContextMenu';
    }
  }

  dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = null;
    }
  }
}

/**
 * Mock implementation for testing
 */
export class MockStatusBarManager implements IStatusBarManager {
  public isCreated = false;
  public isDisposed = false;
  public lastState: ITranslatorState | null = null;
  public updateCount = 0;

  create(): void {
    this.isCreated = true;
  }

  updateStatus(state: ITranslatorState): void {
    this.lastState = state;
    this.updateCount++;
  }

  dispose(): void {
    this.isDisposed = true;
    this.isCreated = false;
  }
}

