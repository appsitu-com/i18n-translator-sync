/**
 * Utility for normalizing engine configuration field names
 * Ensures consistent field names between translator.json and internal config
 */

/**
 * Normalize Azure translator configuration field names
 */
export function normalizeAzureConfig(config: any): any {
  const normalized: any = { ...config };

  // Normalize apiKey -> key
  if (normalized.apiKey) {
    if (!normalized.key) {
      normalized.key = normalized.apiKey;
    }
    delete normalized.apiKey;
  }

  // Normalize url -> endpoint (Azure translator expects 'endpoint')
  if (normalized.url) {
    if (!normalized.endpoint) {
      normalized.endpoint = normalized.url;
    }
    delete normalized.url;
  }

  return normalized;
}

/**
 * Merge engine configuration, only overriding with non-empty values
 * This prevents empty strings from overwriting valid defaults
 */
export function mergeEngineConfig(defaultConfig: any, overrideConfig: any): any {
  const result = { ...defaultConfig };

  for (const [key, value] of Object.entries(overrideConfig)) {
    // Only override if the value is not empty string, null, or undefined
    if (value !== '' && value != null) {
      result[key] = value;
    }
  }

  return result;
}
