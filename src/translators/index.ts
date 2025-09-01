import { registerTranslator } from './registry';
import { AzureTranslator } from './azure';
import { GoogleTranslator } from './google';
import { DeepLTranslator } from './deepl';
import { CopyTranslator } from './copy';

export function registerAllTranslators() {
  registerTranslator(AzureTranslator);
  registerTranslator(GoogleTranslator);
  registerTranslator(DeepLTranslator);
  registerTranslator(CopyTranslator);
}
