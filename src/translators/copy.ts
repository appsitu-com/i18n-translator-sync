import type { Translator, BulkTranslateOpts } from './types';
export const CopyTranslator: Translator = {
  name: 'copy',
  normalizeLocale(locale: string) { return locale; },
  async translateMany(texts: string[], _contexts: (string|null|undefined)[], _opts: BulkTranslateOpts) { return texts.slice(); }
};
