import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VSCodeLogger } from '../../src/vscode/logger';
import { LogLevel } from '../../src/core/util/logger';

describe('VSCodeLogger', () => {
  let mockOutputChannel: any;
  let logger: VSCodeLogger;

  beforeEach(() => {
    // Mock VS Code output channel
    mockOutputChannel = {
      appendLine: vi.fn(),
      append: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn()
    };

    logger = new VSCodeLogger(mockOutputChannel);
  });

  describe('Logging methods', () => {
    it('should append messages with proper prefix', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      logger.debug('Debug message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[INFO] Info message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[WARN] Warning message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[ERROR] Error message');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[DEBUG] Debug message');
    });

    it('should have setLevel method that does nothing', () => {
      expect(() => logger.setLevel?.(LogLevel.Info)).not.toThrow();
    });

    it('should forward appendLine to output channel', () => {
      logger.appendLine('Direct message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Direct message');
    });

    it('should forward show to output channel', () => {
      logger.show();

      expect(mockOutputChannel.show).toHaveBeenCalled();
    });
  });
});