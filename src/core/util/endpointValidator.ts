import { ITranslatorConfig } from '../config/translatorConfigSchema'
import { AZURE_ALLOWED_DOMAINS } from '../../translators/azure'
import { GOOGLE_ALLOWED_DOMAINS } from '../../translators/google'
import { DEEPL_ALLOWED_DOMAINS } from '../../translators/deepl'
import { GEMINI_ALLOWED_DOMAINS } from '../../translators/gemini'
import { OPENROUTER_ALLOWED_DOMAINS } from '../../translators/openrouter'
import { NLLB_ALLOWED_DOMAINS } from '../../translators/nllb'
import { MYMEMORY_ALLOWED_DOMAINS } from '../../translators/mymemory'

/**
 * Exception thrown when an endpoint is from an untrusted domain.
 */
export class UntrustedEndpointError extends Error {
  constructor(
    public readonly engineName: string,
    public readonly endpoint: string,
    public readonly allowedDomains: readonly string[]
  ) {
    super(
      `Engine "${engineName}" has untrusted endpoint: ${endpoint}\n` +
      `Allowed domains: ${Array.from(allowedDomains).join(', ')}`
    )
    this.name = 'UntrustedEndpointError'
  }
}

/**
 * Allowed domains for each translation engine, sourced from each translator module.
 */
export const ALLOWED_DOMAINS = {
  azure: AZURE_ALLOWED_DOMAINS,
  google: GOOGLE_ALLOWED_DOMAINS,
  deepl: DEEPL_ALLOWED_DOMAINS,
  gemini: GEMINI_ALLOWED_DOMAINS,
  openrouter: OPENROUTER_ALLOWED_DOMAINS,
  nllb: NLLB_ALLOWED_DOMAINS,
  mymemory: MYMEMORY_ALLOWED_DOMAINS
} as const

/**
 * Extract the hostname from a URL string.
 * @param url The URL to parse
 * @returns The hostname, or undefined if URL is invalid
 */
function getHostnameFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch {
    return undefined
  }
}

/**
 * Check if a string is an environment variable reference (e.g., ${VAR_NAME} or env:VAR_NAME)
 * @param value The string to check
 * @returns true if the string contains an environment variable reference
 */
function isEnvVarReference(value: string): boolean {
  return /^\$\{[A-Z0-9_]+\}$|^env:[A-Z0-9_]+$/i.test(value)
}

/**
 * Check if a hostname matches a domain pattern.
 * Supports wildcards (e.g., "*.googleapis.com" matches "translation.googleapis.com")
 * @param hostname The hostname to check
 * @param domain The domain pattern (may include wildcards)
 * @returns true if the hostname matches the domain pattern
 */
function matchesDomain(hostname: string, domain: string): boolean {
  if (domain.startsWith('*.')) {
    // Wildcard domain: *.example.com matches foo.example.com, bar.example.com, etc.
    const baseDomain = domain.substring(2) // Remove '*.'
    return hostname.endsWith('.' + baseDomain) || hostname === baseDomain
  }
  return hostname === domain
}

/**
 * Check if an endpoint URL is from one of the whitelisted domains for an engine.
 * Skips validation for environment variable references.
 * @param endpoint The endpoint URL
 * @param allowedDomains Array of allowed domain patterns
 * @returns true if endpoint is from an allowed domain or is an env var reference
 */
function isEndpointAllowed(
  endpoint: string,
  allowedDomains: readonly string[]
): boolean {
  // Skip validation for environment variable references
  if (isEnvVarReference(endpoint)) {
    return true
  }

  const hostname = getHostnameFromUrl(endpoint)
  if (!hostname) {
    return false
  }

  return allowedDomains.some((domain) => matchesDomain(hostname, domain))
}

/**
 * Validates all engine endpoints in a translator config.
 * Throws UntrustedEndpointError if any endpoint is from an untrusted domain.
 *
 * @param config The translator configuration to validate
 * @throws {UntrustedEndpointError} if any endpoint is untrusted
 */
export function validateEndpoints(config: ITranslatorConfig): void {
  const translator = config.translator

  if (!translator) {
    return
  }

  // Check Azure endpoint
  if (translator.azure?.endpoint) {
    if (!isEndpointAllowed(translator.azure.endpoint, ALLOWED_DOMAINS.azure)) {
      throw new UntrustedEndpointError(
        'azure',
        translator.azure.endpoint,
        ALLOWED_DOMAINS.azure
      )
    }
  }

  // Check Google endpoint
  if (translator.google?.endpoint) {
    if (!isEndpointAllowed(translator.google.endpoint, ALLOWED_DOMAINS.google)) {
      throw new UntrustedEndpointError(
        'google',
        translator.google.endpoint,
        ALLOWED_DOMAINS.google
      )
    }
  }

  // Check DeepL endpoint
  if (translator.deepl?.endpoint) {
    if (!isEndpointAllowed(translator.deepl.endpoint, ALLOWED_DOMAINS.deepl)) {
      throw new UntrustedEndpointError(
        'deepl',
        translator.deepl.endpoint,
        ALLOWED_DOMAINS.deepl
      )
    }
  }

  // Check Gemini endpoint
  if (translator.gemini?.endpoint) {
    if (!isEndpointAllowed(translator.gemini.endpoint, ALLOWED_DOMAINS.gemini)) {
      throw new UntrustedEndpointError(
        'gemini',
        translator.gemini.endpoint,
        ALLOWED_DOMAINS.gemini
      )
    }
  }

  // Check OpenRouter endpoint
  if (translator.openrouter?.endpoint) {
    if (!isEndpointAllowed(translator.openrouter.endpoint, ALLOWED_DOMAINS.openrouter)) {
      throw new UntrustedEndpointError(
        'openrouter',
        translator.openrouter.endpoint,
        ALLOWED_DOMAINS.openrouter
      )
    }
  }

  // Check NLLB endpoint (OpenRouter-based)
  if (translator.nllb?.endpoint) {
    if (!isEndpointAllowed(translator.nllb.endpoint, ALLOWED_DOMAINS.nllb)) {
      throw new UntrustedEndpointError(
        'nllb',
        translator.nllb.endpoint,
        ALLOWED_DOMAINS.nllb
      )
    }
  }

  // Check MyMemory endpoint
  if (translator.mymemory?.endpoint) {
    if (!isEndpointAllowed(translator.mymemory.endpoint, ALLOWED_DOMAINS.mymemory)) {
      throw new UntrustedEndpointError(
        'mymemory',
        translator.mymemory.endpoint,
        ALLOWED_DOMAINS.mymemory
      )
    }
  }
}
