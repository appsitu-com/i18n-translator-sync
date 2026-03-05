/**
 * Log level enum for controlling verbosity
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  None = 4
}

/**
 * Platform-agnostic logger interface for output
 */
export interface Logger {
  /**
   * Log an informational message
   */
  info(message: string): void

  /**
   * Log a warning message
   */
  warn(message: string): void

  /**
   * Log an error message
   */
  error(message: string): void

  /**
   * Log a debug message
   */
  debug(message: string): void

  /**
   * Append a raw line to the output
   */
  appendLine(message: string): void

  /**
   * Show the output (implementation-dependent)
   */
  show(): void

  /**
   * Set the log level
   */
  setLevel?(level: LogLevel): void
}

export const NO_OP_LOGGER: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  appendLine: () => {},
  show: () => {}
}

/**
 * Logger implementation that writes to console
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string
  private level: LogLevel = LogLevel.Info

  constructor(prefix: string = 'i18n-translator') {
    this.prefix = prefix
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  info(message: string): void {
    if (this.level <= LogLevel.Info) {
      console.info(`[${this.prefix}] ${message}`)
    }
  }

  warn(message: string): void {
    if (this.level <= LogLevel.Warn) {
      console.warn(`[${this.prefix}] ${message}`)
    }
  }

  error(message: string): void {
    if (this.level <= LogLevel.Error) {
      console.error(`[${this.prefix}] ${message}`)
    }
  }

  debug(message: string): void {
    if (this.level <= LogLevel.Debug) {
      console.debug(`[${this.prefix}] ${message}`)
    }
  }

  appendLine(message: string): void {
    console.log(`[${this.prefix}] ${message}`)
  }

  show(): void {
    // No-op for console logger
  }
}

// Singleton instance for console logger
export const consoleLogger = new ConsoleLogger()