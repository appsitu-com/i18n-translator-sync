import { vi } from 'vitest';

// More comprehensive TranslatorManager mock with built-in dispose method
export const createTranslatorManagerMock = () => {
  return {
    startWatching: vi.fn().mockResolvedValue(undefined),
    translateSingleFile: vi.fn().mockResolvedValue(undefined),
    bulkTranslate: vi.fn().mockResolvedValue(5),
    pushToMateCat: vi.fn().mockResolvedValue(undefined),
    pullFromMateCat: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn()
  };
};

// Export for use in tests
export default {
  createTranslatorManagerMock
};