import { registerTranslator } from './registry';
import { AzureTranslator } from './azure';
import { GoogleTranslator } from './google';
import { DeepLTranslator } from './deepl';
import { CopyTranslator } from './copy';
import { GeminiTranslator } from './gemini';
import { OpenRouterTranslator } from './openrouter';

export function registerAllTranslators() {
  registerTranslator(AzureTranslator, { limit: 100 });
  registerTranslator(GoogleTranslator, { limit: 128 });
  registerTranslator(DeepLTranslator, { limit: 50 });
  registerTranslator(GeminiTranslator, { limit: 5 });
  registerTranslator(OpenRouterTranslator, { limit: 50 });
  registerTranslator(CopyTranslator, { limit: Number.MAX_SAFE_INTEGER });
}
