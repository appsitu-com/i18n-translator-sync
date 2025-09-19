import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleLogger, LogLevel } from '../../../src/core/util/baseLogger';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleInfoSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create logger with default prefix
    logger = new ConsoleLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Log level filtering', () => {
    it('should respect log level when logging', () => {
      logger.setLevel(LogLevel.Warn);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[i18n-translator] Warning message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[i18n-translator] Error message');
    });

    it('should log all levels when set to Debug', () => {
      logger.setLevel(LogLevel.Debug);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(consoleDebugSpy).toHaveBeenCalledWith('[i18n-translator] Debug message');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[i18n-translator] Info message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[i18n-translator] Warning message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[i18n-translator] Error message');
    });

    it('should not log anything when set to None', () => {
      logger.setLevel(LogLevel.None);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Custom prefix', () => {
    it('should use custom prefix when provided', () => {
      const customLogger = new ConsoleLogger('custom-prefix');

      customLogger.info('Info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith('[custom-prefix] Info message');
    });
  });

  describe('Utility methods', () => {
    it('should append line using console.log', () => {
      logger.appendLine('Direct line');

      expect(consoleLogSpy).toHaveBeenCalledWith('[i18n-translator] Direct line');
    });

    it('should have a no-op show method', () => {
      expect(() => logger.show()).not.toThrow();
    });
  });
});