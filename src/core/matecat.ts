import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from './util/logger';
import { TranslationCache } from './cache/sqlite';

/**
 * MateCat integration settings
 */
export type MateCatSettings = {
  /**
   * URL for pushing translations to MateCat
   */
  pushUrl: string;   // e.g., https://matecat.example/api/projects/{projectId}/files

  /**
   * URL for pulling translations from MateCat
   */
  pullUrl: string;   // e.g., https://matecat.example/api/projects/{projectId}/files/{fileId}/download

  /**
   * Optional API key for authentication
   */
  apiKey?: string;   // optional header: Authorization: Bearer <apiKey>

  /**
   * Project ID to use in URL templates
   */
  projectId?: string;

  /**
   * HTTP method to use for pulling translations
   */
  pullMethod?: 'GET' | 'POST';

  /**
   * Additional headers to include in requests
   */
  extraHeaders?: Record<string,string>;
};

/**
 * MateCat integration service
 */
export class MateCatService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Fill template strings with variables
   */
  private fillTemplate(url: string, vars: Record<string,string|undefined>): string {
    return url.replace(/\{(\w+)\}/g, (_,k) => (vars[k] ?? ''));
  }

  /**
   * Export cache to a CSV file
   */
  private async exportCacheCsv(cache: TranslationCache, tmpDir?: string): Promise<string> {
    const dir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'matecat-'));
    const csvPath = path.join(dir, 'translations.csv');
    await cache.exportCSV(csvPath);
    return csvPath;
  }

  /**
   * Push translation cache to MateCat for review
   */
  public async pushCacheToMateCat(
    cache: TranslationCache,
    settings: MateCatSettings,
    notifyCallback?: (message: string) => void
  ): Promise<void> {
    if (!settings.pushUrl) {
      throw new Error('MateCat pushUrl not configured');
    }

    const vars = { projectId: settings.projectId };
    const url = this.fillTemplate(settings.pushUrl, vars);

    this.logger.info(`Pushing translations to MateCat: ${url}`);

    const csv = await this.exportCacheCsv(cache);
    const boundary = `----mcform${Math.random().toString(16).slice(2)}`;
    const bodyParts: any[] = [];
    const append = (chunk: string | Buffer) => bodyParts.push(
      typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
    );

    append(`--${boundary}\r\n`);
    append(`Content-Disposition: form-data; name="file"; filename="translations.csv"\r\n`);
    append(`Content-Type: text/csv\r\n\r\n`);
    append(fs.readFileSync(csv));
    append(`\r\n--${boundary}--\r\n`);

    const headers: Record<string,string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    };

    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    if (settings.extraHeaders) {
      Object.assign(headers, settings.extraHeaders);
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: Buffer.concat(bodyParts) as any
      });

      const txt = await res.text();

      if (!res.ok) {
        throw new Error(`MateCat push failed: ${res.status} ${res.statusText} ${txt}`);
      }

      this.logger.info('Successfully pushed translations to MateCat');

      if (notifyCallback) {
        notifyCallback('MateCat: CSV cache pushed for review.');
      }
    } catch (error) {
      this.logger.error(`Error pushing to MateCat: ${error}`);
      throw error;
    }
  }

  /**
   * Pull reviewed translations from MateCat
   */
  public async pullReviewedFromMateCat(
    cache: TranslationCache,
    settings: MateCatSettings,
    notifyCallback?: (message: string) => void
  ): Promise<number> {
    if (!settings.pullUrl) {
      throw new Error('MateCat pullUrl not configured');
    }

    const vars = { projectId: settings.projectId };
    const url = this.fillTemplate(settings.pullUrl, vars);

    this.logger.info(`Pulling translations from MateCat: ${url}`);

    const headers: Record<string,string> = {};

    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    if (settings.extraHeaders) {
      Object.assign(headers, settings.extraHeaders);
    }

    try {
      const res = await fetch(url, {
        method: settings.pullMethod ?? 'GET',
        headers
      });

      const buf = Buffer.from(await res.arrayBuffer());

      if (!res.ok) {
        const t = buf.toString('utf8');
        throw new Error(`MateCat pull failed: ${res.status} ${res.statusText} ${t}`);
      }

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matecat-'));
      const csvPath = path.join(tmp, 'reviewed.csv');
      fs.writeFileSync(csvPath, buf);

      const imported = await cache.importCSV(csvPath);

      this.logger.info(`Imported ${imported} reviewed translations from MateCat`);

      if (notifyCallback) {
        notifyCallback(`MateCat: imported ${imported} reviewed translations.`);
      }

      return imported;
    } catch (error) {
      this.logger.error(`Error pulling from MateCat: ${error}`);
      throw error;
    }
  }
}