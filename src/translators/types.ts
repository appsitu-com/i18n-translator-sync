export interface TranslationApiConfig {
  key: string;
  endpoint: string;
  timeoutMs?: number;
  // AZURE
  region?: string; // required for Azure
  // textType?: string; // I think it will autodetect HTML vs plain text when unspecified
  category?: string;
  batchSize?: number;
  azureModel?: string;

  // GOOGLE
  googleModel?: string;
  // DEEPL
  free?: boolean;
  formality?: string;
  deeplModel?: string;
}

export interface BulkTranslateOpts {
  sourceLocale: string;
  targetLocale: string;
  apiConfig: TranslationApiConfig;
}

export interface Translator {
  readonly name: string;
  normalizeLocale(locale: string): string;
  translateMany(texts: string[], contexts: (string | null | undefined)[], opts: BulkTranslateOpts): Promise<string[]>;
}
