import type { Translator, BulkTranslateOpts } from './types'
import { normalizeLocaleWithMap } from '../util/localeNorm'

// JSON Schema for enforcing structured output
const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Array of translated strings maintaining the same order as input'
    }
  },
  required: ['translations'],
  additionalProperties: false
}

export const OpenRouterTranslator: Translator = {
  name: 'openrouter',

  async translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts) {
    const key = opts.apiConfig.key as string
    const endpoint =
      (opts.apiConfig.endpoint as string | undefined)?.replace(/\/+$/, '') ||
      'https://openrouter.ai/api/v1/chat/completions'
    const model = opts.apiConfig.openrouterModel || 'anthropic/claude-3-haiku'
    const temperature = opts.apiConfig.temperature ?? 0.1
    const maxTokens = opts.apiConfig.maxOutputTokens ?? 2048
    const systemPrompt = opts.apiConfig.systemPrompt || 'You are a professional translator that provides accurate, contextually appropriate translations while preserving the original meaning and tone.'

    // Use langMap from config, fallback to no mapping if not provided
    const langMap = opts.apiConfig.langMap || {}

    if (!key) throw new Error(`OpenRouter Translator: missing 'key'`)

    const sourceLanguage = normalizeLocaleWithMap(opts.sourceLocale, langMap)
    const targetLanguage = normalizeLocaleWithMap(opts.targetLocale, langMap)

    const headers = {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/tohagan/vscode-i18n-translator-ext',
      'X-Title': 'VSCode i18n Translator Extension'
    }

    // Process texts in a single API call to maintain context and efficiency
    // Build context information for the prompt
    const contextInfo = contexts.some(c => c)
      ? '\n\nContext information is provided for some texts to help with translation accuracy. Use the context to understand the meaning and choose appropriate translations:\n' +
        texts.map((text, idx) => {
          const context = contexts[idx]
          return context ? `"${text}" (Context: ${context})` : `"${text}"`
        }).join('\n')
      : ''

    const prompt = `Translate the following array of texts from ${sourceLanguage} to ${targetLanguage}.

IMPORTANT INSTRUCTIONS:
- Maintain the exact same order of translations as the input texts
- Preserve any formatting, placeholders, or special characters (like {{variable}}, %s, etc.)
- If a text contains HTML tags, preserve them exactly
- If a text is already in the target language or appears to be a proper noun/brand name, you may keep it unchanged
- Consider the context information when provided to ensure accurate, contextually appropriate translations
- Return only the JSON object with the translations array

Input texts to translate:
${JSON.stringify(texts, null, 2)}${contextInfo}

Respond with a JSON object containing a "translations" array with the translated texts in the same order.`

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: {
        type: 'json_object',
        schema: TRANSLATION_SCHEMA
      }
    }

    try {
      // Note: Using native fetch instead of postJson utility due to compatibility issues with the test environment
      // The postJson utility appears to have issues with the AbortController signal in Vitest
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`)
      }

      const text = await response.text()
      const json = text ? JSON.parse(text) : {}

      // Parse the response
      const responseContent = json?.choices?.[0]?.message?.content
      if (!responseContent) {
        console.error('OpenRouter translation error: No response content')
        return texts // Return original texts on error
      }

      let parsedResponse: any
      try {
        // Try to parse the response content directly first
        parsedResponse = JSON.parse(responseContent)
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from the response
        // OpenRouter sometimes returns extra text around the JSON
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            parsedResponse = JSON.parse(jsonMatch[0])
          } catch (secondParseError) {
            console.error('OpenRouter translation error: Failed to parse extracted JSON response', secondParseError)
            return texts
          }
        } else {
          console.error('OpenRouter translation error: Failed to parse JSON response', parseError)
          return texts
        }
      }

      const translations = parsedResponse?.translations
      if (!Array.isArray(translations)) {
        console.error('OpenRouter translation error: Response does not contain translations array')
        return texts
      }

      // Ensure we have the same number of translations as input texts
      if (translations.length !== texts.length) {
        console.error(`OpenRouter translation error: Expected ${texts.length} translations, got ${translations.length}`)
        return texts
      }

      return translations.map((translation: any, idx: number) => {
        // Ensure translation is a string and fallback to original if not
        if (typeof translation !== 'string') {
          console.warn(`OpenRouter translation warning: Translation ${idx} is not a string, using original`)
          return texts[idx]
        }
        return translation.trim()
      })
    } catch (error: any) {
      console.error(`OpenRouter translation error: ${error.message}`, error)
      return texts // Return original texts on error
    }
  }
}