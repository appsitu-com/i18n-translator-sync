# OpenRouter.ai Translator

The OpenRouter translator provides access to a wide variety of large language models through a unified API. This adapter supports structured JSON output and contextual translation.

## Features

- **JSON Schema Enforcement**: Uses OpenRouter's structured output feature to ensure consistent JSON responses
- **Contextual Translation**: Supports context arrays to provide additional information for accurate translations
- **Single API Call**: Makes one API call per source file, processing all texts together for efficiency and context preservation
- **Model Flexibility**: Supports any model available through OpenRouter.ai
- **Error Handling**: Graceful fallback to original text on API errors
- **Batch Processing**: Processes entire file contents in a single request

## Configuration

### Required Environment Variables

```env
OPENROUTER_API_KEY='your-openrouter-api-key'
OPENROUTER_API_URL='https://openrouter.ai/api/v1/chat/completions'
```

### Optional Configuration

The following options can be configured in your translation settings:

- `openrouterModel`: Model to use (default: `anthropic/claude-3-haiku`)
- `temperature`: Creativity level 0.0-1.0 (default: `0.1`)
- `maxOutputTokens`: Maximum response tokens (default: `2048`)
- `systemPrompt`: Custom system message for the model
- `timeoutMs`: Request timeout in milliseconds (default: `60000`)

### Example Configuration

```json
{
  "translationEngine": "openrouter",
  "apiConfig": {
    "key": "${OPENROUTER_API_KEY}",
    "endpoint": "${OPENROUTER_API_URL}",
    "openrouterModel": "anthropic/claude-3-haiku",
    "temperature": 0.1,
    "maxOutputTokens": 2048,
    "timeoutMs": 60000
  }
}
```

## How It Works

### JSON Input/Output Structure

The translator accepts two JSON arrays:
1. **Source texts**: Array of strings to translate
2. **Context information**: Array of context strings (can contain null values)

It returns a JSON array of translated strings in the same order.

### Context Array Usage

The context array provides additional information to help the AI understand the meaning and choose appropriate translations:

```typescript
const texts = ["Button", "Menu", "Save"]
const contexts = [
  "UI element for clicking",
  "Navigation element",
  null  // No context for this item
]
```

The context is explained in the prompt as follows:

> "Context information is provided for some texts to help with translation accuracy. Use the context to understand the meaning and choose appropriate translations"

### API Call Structure

The translator makes a single API call per file with:

```json
{
  "model": "anthropic/claude-3-haiku",
  "messages": [
    {
      "role": "system",
      "content": "You are a professional translator..."
    },
    {
      "role": "user",
      "content": "Translate the following array of texts from English to Spanish..."
    }
  ],
  "temperature": 0.1,
  "max_tokens": 2048,
  "response_format": {
    "type": "json_object",
    "schema": {
      "type": "object",
      "properties": {
        "translations": {
          "type": "array",
          "items": {"type": "string"}
        }
      },
      "required": ["translations"]
    }
  }
}
```

### JSON Schema Enforcement

The translator uses OpenRouter's `response_format` feature to enforce a specific JSON schema:

```typescript
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
```

This ensures the AI always returns properly formatted JSON with a `translations` array.

## Supported Models

OpenRouter provides access to many models including:

- **Anthropic**: `anthropic/claude-3-haiku`, `anthropic/claude-3-sonnet`, `anthropic/claude-3-opus`
- **OpenAI**: `openai/gpt-4`, `openai/gpt-3.5-turbo`, `openai/gpt-4-turbo`
- **Google**: `google/gemini-pro`, `google/gemini-pro-vision`
- **Meta**: `meta-llama/llama-2-70b-chat`, `meta-llama/codellama-34b-instruct`
- **Mistral**: `mistralai/mistral-7b-instruct`, `mistralai/mixtral-8x7b-instruct`

See [OpenRouter Models](https://openrouter.ai/models) for the complete list.

## Error Handling

The translator includes comprehensive error handling:

1. **API Errors**: Network or authentication failures return original texts
2. **Invalid JSON**: Malformed responses fall back to original texts
3. **Schema Violations**: Missing or invalid translation arrays return originals
4. **Count Mismatches**: Wrong number of translations returns originals
5. **Type Errors**: Non-string translations use original text for those items

## Prompt Engineering

The translator uses carefully crafted prompts that:

1. **Specify source and target languages** using normalized language names
2. **Include context information** when available to improve accuracy
3. **Preserve formatting** instructions for HTML tags and placeholders
4. **Maintain order** requirements for the output array
5. **Handle edge cases** like proper nouns and already-translated content

### Example Prompt

```
Translate the following array of texts from English to Spanish.

IMPORTANT INSTRUCTIONS:
- Maintain the exact same order of translations as the input texts
- Preserve any formatting, placeholders, or special characters (like {{variable}}, %s, etc.)
- If a text contains HTML tags, preserve them exactly
- If a text is already in the target language or appears to be a proper noun/brand name, you may keep it unchanged
- Consider the context information when provided to ensure accurate, contextually appropriate translations
- Return only the JSON object with the translations array

Input texts to translate:
["Button", "Menu", "Save file as..."]

Context information is provided for some texts to help with translation accuracy:
"Button" (Context: UI element for clicking)
"Menu" (Context: Navigation element)
"Save file as..."

Respond with a JSON object containing a "translations" array with the translated texts in the same order.
```

## Benefits

1. **Context-Aware**: Uses context to improve translation accuracy
2. **Efficient**: Single API call per file reduces latency and costs
3. **Reliable**: JSON schema enforcement ensures consistent output format
4. **Flexible**: Supports any OpenRouter model for different quality/cost trade-offs
5. **Robust**: Comprehensive error handling with graceful degradation
6. **Format-Preserving**: Maintains special formatting, HTML tags, and placeholders

## Limitations

1. **Token Limits**: Large files may exceed model token limits
2. **Cost**: LLM-based translation can be more expensive than traditional APIs
3. **Latency**: May be slower than specialized translation services
4. **Model Dependency**: Quality depends on the chosen model's capabilities

## Best Practices

1. **Choose appropriate models**: Use faster/cheaper models for simple content, premium models for complex translations
2. **Provide good context**: Include meaningful context information to improve accuracy
3. **Monitor costs**: Track usage and costs especially with premium models
4. **Test with sample data**: Validate translations with your specific content types
5. **Set appropriate timeouts**: Allow sufficient time for LLM processing