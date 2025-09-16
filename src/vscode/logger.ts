import * as vscode from 'vscode';
import { Logger, LogLevel } from '../core/util/logger';

/**
 * VSCode logger implementation
 */
export class VSCodeLogger implements Logger {
  constructor(private outputChannel: vscode.OutputChannel) {}

  setLevel(_level: LogLevel): void {
    // VSCode logger doesn't support log levels directly
    // We could store the level and filter messages, but we'll just accept all messages
  }

  info(message: string): void {
    this.outputChannel.appendLine(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.outputChannel.appendLine(`[WARN] ${message}`);
  }

  error(message: string): void {
    this.outputChannel.appendLine(`[ERROR] ${message}`);
  }

  debug(message: string): void {
    this.outputChannel.appendLine(`[DEBUG] ${message}`);
  }

  appendLine(message: string): void {
    this.outputChannel.appendLine(message);
  }

  show(): void {
    this.outputChannel.show();
  }
}