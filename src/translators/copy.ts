import type { Translator, BulkTranslateOpts } from './types';
export const CopyTranslator: Translator = {
  name: 'copy',
  async translateMany(texts: string[], _contexts: (string|null|undefined)[], _opts: BulkTranslateOpts) { return texts.slice(); }
};
