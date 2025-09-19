import { describe, it, expect, beforeEach } from 'vitest';
import { MockStatusBarManager, TranslatorState } from '../../src/vscode/statusBar';

describe('StatusBarManager', () => {
  let statusBarManager: MockStatusBarManager;

  beforeEach(() => {
    statusBarManager = new MockStatusBarManager();
  });

  describe('MockStatusBarManager', () => {
    it('should track creation state', () => {
      expect(statusBarManager.isCreated).toBe(false);

      statusBarManager.create();

      expect(statusBarManager.isCreated).toBe(true);
    });

    it('should track disposal state', () => {
      statusBarManager.create();
      expect(statusBarManager.isCreated).toBe(true);
      expect(statusBarManager.isDisposed).toBe(false);

      statusBarManager.dispose();

      expect(statusBarManager.isCreated).toBe(false);
      expect(statusBarManager.isDisposed).toBe(true);
    });

    it('should track status updates', () => {
      const state: TranslatorState = { isRunning: true, isInitialized: true };

      expect(statusBarManager.updateCount).toBe(0);
      expect(statusBarManager.lastState).toBeNull();

      statusBarManager.updateStatus(state);

      expect(statusBarManager.updateCount).toBe(1);
      expect(statusBarManager.lastState).toEqual(state);
    });

    it('should handle multiple status updates', () => {
      const state1: TranslatorState = { isRunning: false, isInitialized: true };
      const state2: TranslatorState = { isRunning: true, isInitialized: true };

      statusBarManager.updateStatus(state1);
      statusBarManager.updateStatus(state2);

      expect(statusBarManager.updateCount).toBe(2);
      expect(statusBarManager.lastState).toEqual(state2);
    });
  });

  describe('TranslatorState', () => {
    it('should handle uninitialized state', () => {
      const state: TranslatorState = { isRunning: false, isInitialized: false };

      statusBarManager.updateStatus(state);

      expect(statusBarManager.lastState).toEqual({
        isRunning: false,
        isInitialized: false
      });
    });

    it('should handle initialized but not running state', () => {
      const state: TranslatorState = { isRunning: false, isInitialized: true };

      statusBarManager.updateStatus(state);

      expect(statusBarManager.lastState).toEqual({
        isRunning: false,
        isInitialized: true
      });
    });

    it('should handle running state', () => {
      const state: TranslatorState = { isRunning: true, isInitialized: true };

      statusBarManager.updateStatus(state);

      expect(statusBarManager.lastState).toEqual({
        isRunning: true,
        isInitialized: true
      });
    });
  });
});