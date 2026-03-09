import { registerTranslator } from './registry'
import { AzureTranslator } from './azure'
import { GoogleTranslator } from './google'
import { DeepLTranslator } from './deepl'
import { CopyTranslator } from './copy'
import { GeminiTranslator } from './gemini'
import { OpenRouterTranslator } from './openrouter'

export function registerAllTranslators() {
  registerTranslator(AzureTranslator, { limit: 1000, maxchars: 50000 })
  registerTranslator(GoogleTranslator, { limit: 128, maxchars: 30000 })
  registerTranslator(DeepLTranslator, { limit: 50, maxchars: 30000 })
  registerTranslator(GeminiTranslator, { limit: 5, maxchars: 30000 })
  registerTranslator(OpenRouterTranslator, { limit: 50, maxchars: 30000 })

  registerTranslator(CopyTranslator, { limit: Number.MAX_SAFE_INTEGER, maxchars: Number.MAX_SAFE_INTEGER })
}
