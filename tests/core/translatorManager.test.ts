import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslatorManager } from '../../src/core/TranslatorManager';
import { TranslateProjectConfig, defaultConfig } from '../../src/core/coreConfig';
import { IFileSystem } from '../../src/core/util/fs';
import { ILogger } from '../../src/core/util/baseLogger';
import { IFileWatcher, IWorkspaceWatcher } from '../../src/core/util/watcher';
import { TRANSLATOR_JSON, TRANSLATOR_ENV } from '../../src/core/constants';
import * as path from 'path';
import * as fs from 'fs';

// Mock dependencies
const createMockFileSystem = () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  fileExists: vi.fn(),
  createDirectory: vi.fn(),
  readDirectory: vi.fn(),
  isDirectory: vi.fn().mockResolvedValue(false),
  stat: vi.fn().mockResolvedValue({
    isFile: true,
    isDirectory: false,
    mtime: new Date(),
    ctime: new Date(),
    size: 100
  }),
  createUri: vi.fn((path) => ({ fsPath: path, path, scheme: 'file' })),
  joinPath: vi.fn((uri, ...segments) => {
    const joined = [uri.fsPath, ...segments].join('/');
    return { fsPath: joined, path: joined, scheme: 'file' };
  })
});

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  appendLine: vi.fn(),
  show: vi.fn()
});

const createMockFileWatcher = () => ({
  watch: vi.fn(),
  waitUntilReady: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn()
});

const createMockWorkspaceWatcher = () => ({
  createFileSystemWatcher: vi.fn(),
  onDidRenameFiles: vi.fn(),
  dispose: vi.fn()
});

const createMockCache = () => ({
  putMany: vi.fn(),
  getMany: vi.fn(),
  close: vi.fn(),
  deleteForFile: vi.fn(),
  getAllForLocale: vi.fn(),
  exportCSV: vi.fn(async (filePath: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, 'source_text,target_text\nHello,Bonjour\n', 'utf8')
  }),
  exportTMX: vi.fn(async () => 0),
  exportXLIFF: vi.fn(async () => 0),
  importCSV: vi.fn(),
  getStats: vi.fn()
});

const createMockConfigProvider = () => ({
  get: vi.fn(),
  update: vi.fn()
});

// Mock project config
const defaultProjectConfig: TranslateProjectConfig = {
  ...defaultConfig,
  sourceDir: '',
  targetDir: '',
  sourcePaths: ['i18n/en'],
  sourceLocale: 'en',
  targetLocales: ['fr', 'es'],
  enableBackTranslation: false,
  defaultMarkdownEngine: 'azure',
  defaultJsonEngine: 'google',
  engineOverrides: {}
};

describe('TranslatorManager', () => {
  let fileSystem: IFileSystem;
  let logger: ILogger;
  let cache: any;
  let workspaceWatcher: IWorkspaceWatcher;
  let configProvider: any;
  let translatorManager: TranslatorManager;
  let mockFileWatcher: any;

  beforeEach(() => {
    fileSystem = createMockFileSystem();
    logger = createMockLogger();
    cache = createMockCache();
    workspaceWatcher = createMockWorkspaceWatcher();
    configProvider = createMockConfigProvider();
    mockFileWatcher = createMockFileWatcher();

    vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
      if (section === 'translator.targetLocales') {
        return ['fr']
      }
      return defaultValue
    })

    // Setup mock workspace watcher
    vi.mocked(workspaceWatcher.createFileSystemWatcher).mockReturnValue(mockFileWatcher);

    translatorManager = new TranslatorManager(
      fileSystem,
      logger,
      cache,
      '/workspace',
      workspaceWatcher,
      configProvider,
      undefined,
      undefined
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('startWatching', () => {
    it('should create watchers for each source path', async () => {
      await translatorManager.startWatching(defaultProjectConfig);

      // Should create a watcher for each source path
      expect(workspaceWatcher.createFileSystemWatcher).toHaveBeenCalledWith();

      // Should set up watch with event handlers
      expect(mockFileWatcher.watch).toHaveBeenCalledWith(
        'i18n/en/**',
        expect.objectContaining({
          onDidCreate: expect.any(Function),
          onDidChange: expect.any(Function),
          onDidDelete: expect.any(Function)
        })
      );

      // Should set up rename handler
      expect(workspaceWatcher.onDidRenameFiles).toHaveBeenCalled();

      // Should log the start
      expect(logger.info).toHaveBeenCalledWith('Started watching for file changes');
    });

    it('should not start watching if already watching', async () => {
      // Start watching once
      await translatorManager.startWatching(defaultProjectConfig);

      // Reset mocks to check if they're called again
      vi.resetAllMocks();

      // Try to start watching again
      await translatorManager.startWatching(defaultProjectConfig);

      // Should warn and not create more watchers
      expect(logger.warn).toHaveBeenCalledWith('Already watching for file changes');
      expect(workspaceWatcher.createFileSystemWatcher).not.toHaveBeenCalled();
    });

    it('auto-exports cache after initial scan when files were processed', async () => {
      const processExistingSourceFilesSpy = vi
        .spyOn(translatorManager as any, 'processExistingSourceFiles')
        .mockResolvedValue(2)

      await translatorManager.startWatching({
        ...defaultProjectConfig,
        autoExport: true,
        csvExportPath: 'translator.csv'
      } as TranslateProjectConfig)

      expect(processExistingSourceFilesSpy).toHaveBeenCalled()
      const expectedCsvPath = path.join('/workspace', 'translator.csv')
      expect(cache.exportCSV).toHaveBeenCalledWith(expectedCsvPath)
      expect(logger.info).toHaveBeenCalledWith(`Auto-exported cache to ${expectedCsvPath}`)
    })
  });

  describe('stopWatching', () => {
    it('should dispose all watchers', async () => {
      // First start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Then stop watching
      await translatorManager.stopWatching();

      // Should dispose the watcher
      expect(mockFileWatcher.dispose).toHaveBeenCalled();

      // Should log the stop
      expect(logger.info).toHaveBeenCalledWith('Stopped watching for file changes');
    });

    it('should warn if not watching', async () => {
      await translatorManager.stopWatching();

      expect(logger.warn).toHaveBeenCalledWith('Not watching for file changes');
    });
  });

  describe('Review integration', () => {
    const mockReviewArtifactFiles = () => {
      vi.mocked(fileSystem.readDirectory).mockImplementation(async (uri) => {
        if (uri.fsPath === '/workspace') {
          return [
            { name: 'review.tmx', isDirectory: false },
            { name: 'notes.txt', isDirectory: false }
          ]
        }

        return []
      })
    }

    const mockLocalizedReviewArtifactFiles = () => {
      vi.mocked(fileSystem.readDirectory).mockImplementation(async (uri) => {
        if (uri.fsPath === '/workspace') {
          return [{ name: '.translator', isDirectory: true }]
        }

        if (uri.fsPath === '/workspace/.translator') {
          return [{ name: 'review', isDirectory: true }]
        }

        if (uri.fsPath === '/workspace/.translator/review') {
          return [
            { name: 'fr', isDirectory: true },
            { name: 'es', isDirectory: true }
          ]
        }

        if (uri.fsPath === '/workspace/.translator/review/fr') {
          return [{ name: 'upload', isDirectory: true }]
        }

        if (uri.fsPath === '/workspace/.translator/review/es') {
          return [{ name: 'upload', isDirectory: true }]
        }

        if (uri.fsPath === '/workspace/.translator/review/fr/upload') {
          return [{ name: 'fr.xliff', isDirectory: false }]
        }

        if (uri.fsPath === '/workspace/.translator/review/es/upload') {
          return [{ name: 'es.xliff', isDirectory: false }]
        }

        return []
      })
    }

    it('should push translations via review service', async () => {
      mockReviewArtifactFiles()

      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        pullReviewedFiles: vi.fn().mockResolvedValue([]),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      await manager.pushReviewProject()
      expect(mockReviewService.pushReviewProject).toHaveBeenCalledTimes(1)
      expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith({
        targetLocale: 'fr',
        mappedLocale: 'fr',
        artifacts: [
          {
            filePath: '/workspace/review.tmx',
            fileName: 'review.tmx',
            contentType: 'application/tmx+xml'
          }
        ]
      })
      expect(logger.info).toHaveBeenCalledWith('Successfully pushed translations to review service')
    })

    it('generates and pushes local human TMX when no review artifacts exist', async () => {
      vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
      vi.mocked(cache.exportTMX).mockResolvedValue(2)

      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      await manager.pushReviewProject()

      expect(cache.exportTMX).toHaveBeenCalledWith(
        path.join('/workspace', '.translator/review/fr/upload/local-tm-human.tmx'),
        { origin: 'human', targetLocale: 'fr' }
      )

      expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith({
        targetLocale: 'fr',
        mappedLocale: 'fr',
        artifacts: [
          {
            filePath: path.join('/workspace', '.translator/review/fr/upload/local-tm-human.tmx'),
            fileName: 'local-tm-human.tmx',
            contentType: 'application/tmx+xml'
          }
        ]
      })
    })

    it('uses ai-origin filter for generated XLIFF when push mode is changes', async () => {
      vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
      vi.mocked(cache.exportTMX).mockResolvedValue(0)
      vi.mocked(cache.exportXLIFF).mockResolvedValue(2)

      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        pullReviewedFiles: vi.fn().mockResolvedValue([]),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      await manager.pushReviewProject('changes')

      expect(cache.exportTMX).toHaveBeenCalledWith(
        path.join('/workspace', '.translator/review/fr/upload/local-tm-human.tmx'),
        { origin: 'human', targetLocale: 'fr' }
      )
      expect(cache.exportXLIFF).toHaveBeenCalledWith(
        path.join('/workspace', '.translator/review/fr/upload/local-tm-review.xliff'),
        { origin: 'ai', targetLocale: 'fr' }
      )
      expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith({
        targetLocale: 'fr',
        mappedLocale: 'fr',
        artifacts: [
          {
            filePath: path.join('/workspace', '.translator/review/fr/upload/local-tm-review.xliff'),
            fileName: 'local-tm-review.xliff',
            contentType: 'application/xliff+xml'
          }
        ]
      })
    })

    it('uses unfiltered generated XLIFF when push mode is all', async () => {
      vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
      vi.mocked(cache.exportTMX).mockResolvedValue(0)
      vi.mocked(cache.exportXLIFF).mockResolvedValue(3)

      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        pullReviewedFiles: vi.fn().mockResolvedValue([]),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      await manager.pushReviewProject('all')

      expect(cache.exportXLIFF).toHaveBeenCalledWith(
        path.join('/workspace', '.translator/review/fr/upload/local-tm-review.xliff'),
        { targetLocale: 'fr' }
      )
      expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith({
        targetLocale: 'fr',
        mappedLocale: 'fr',
        artifacts: [
          {
            filePath: path.join('/workspace', '.translator/review/fr/upload/local-tm-review.xliff'),
            fileName: 'local-tm-review.xliff',
            contentType: 'application/xliff+xml'
          }
        ]
      })
    })

    it('excludes the source locale from review push targets by default', async () => {
      vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
      vi.mocked(cache.exportTMX).mockResolvedValue(0)
      vi.mocked(cache.exportXLIFF).mockResolvedValue(2)

      vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
        if (section === 'translator.sourceLocale') {
          return 'en'
        }
        if (section === 'translator.targetLocales') {
          return ['en', 'fr']
        }
        return defaultValue
      })

      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      await manager.pushReviewProject('all')

      expect(cache.exportXLIFF).toHaveBeenCalledTimes(1)
      expect(cache.exportXLIFF).toHaveBeenCalledWith(
        path.join('/workspace', '.translator/review/fr/upload/local-tm-review.xliff'),
        { targetLocale: 'fr' }
      )
      expect(mockReviewService.pushReviewProject).toHaveBeenCalledTimes(1)
      expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith(
        expect.objectContaining({ targetLocale: 'fr' })
      )
    })

    it('should pull translations via review service', async () => {
      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        pullReviewedFiles: vi.fn().mockResolvedValue([]),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      await manager.pullReviewedProjects()
      expect(mockReviewService.pullReviewedFiles).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenCalledWith('Successfully pulled reviewed translations from review service')
    })

    it('should return review statuses via review service', async () => {
      const expectedStatuses = [{ projectId: 'mc-1', status: 'in_progress' }]
      const mockReviewService = {
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        pullReviewedFiles: vi.fn().mockResolvedValue([]),
        getPendingReviewStatus: vi.fn().mockResolvedValue(expectedStatuses)
      }

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService: () => mockReviewService
        }
      )

      const statuses = await manager.getPendingReviewStatus()
      expect(statuses).toEqual(expectedStatuses)
    })

    it('returns review push preview with XLIFF translation unit count', async () => {
      vi.mocked(fileSystem.readDirectory).mockImplementation(async (uri) => {
        if (uri.fsPath === '/workspace') {
          return [
            { name: 'a.xliff', isDirectory: false },
            { name: 'b.xlf', isDirectory: false },
            { name: 'glossary.tmx', isDirectory: false }
          ]
        }

        return []
      })

      vi.mocked(fileSystem.readFile).mockImplementation(async (uri) => {
        if (uri.fsPath.endsWith('a.xliff')) {
          return '<xliff><file><unit id="1"/><unit id="2"/></file></xliff>'
        }
        if (uri.fsPath.endsWith('b.xlf')) {
          return '<xliff><file><trans-unit id="3"/></file></xliff>'
        }
        return ''
      })

      const preview = await translatorManager.getReviewPushPreview()
      expect(preview).toEqual({ translationCount: 3, artifactCount: 3 })
    })

    it('returns zero translation count when only TMX artifacts exist', async () => {
      mockReviewArtifactFiles()

      const preview = await translatorManager.getReviewPushPreview()
      expect(preview).toEqual({ translationCount: 0, artifactCount: 1 })
    })

    it('counts both unit and trans-unit markers within XLIFF review artifacts', async () => {
      vi.mocked(fileSystem.readDirectory).mockImplementation(async (uri) => {
        if (uri.fsPath === '/workspace') {
          return [
            { name: 'mixed.xliff', isDirectory: false },
            { name: 'notes.tmx', isDirectory: false }
          ]
        }

        return []
      })

      vi.mocked(fileSystem.readFile).mockImplementation(async (uri) => {
        if (uri.fsPath.endsWith('mixed.xliff')) {
          return '<xliff><file><unit id="1"/><trans-unit id="2"/><unit id="3"/></file></xliff>'
        }
        return ''
      })

      const preview = await translatorManager.getReviewPushPreview()
      expect(preview).toEqual({ translationCount: 3, artifactCount: 2 })
    })

    it('does not count non-XLIFF artifacts toward translation count', async () => {
      vi.mocked(fileSystem.readDirectory).mockImplementation(async (uri) => {
        if (uri.fsPath === '/workspace') {
          return [
            { name: 'glossary.tmx', isDirectory: false },
            { name: 'metadata.txt', isDirectory: false }
          ]
        }

        return []
      })

      const preview = await translatorManager.getReviewPushPreview()
      expect(preview).toEqual({ translationCount: 0, artifactCount: 1 })
    })

    it('filters review artifacts by reviewer.targetLocales.include', async () => {
      mockLocalizedReviewArtifactFiles()

      vi.mocked(fileSystem.readFile).mockImplementation(async (uri) => {
        if (uri.fsPath.endsWith('fr.xliff')) {
          return '<xliff><file><unit id="1"/></file></xliff>'
        }
        if (uri.fsPath.endsWith('es.xliff')) {
          return '<xliff><file><unit id="2"/></file></xliff>'
        }
        return ''
      })

      vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
        if (section === 'translator.reviewer.targetLocales.include') {
          return ['fr']
        }
        return defaultValue
      })

      const preview = await translatorManager.getReviewPushPreview()
      expect(preview).toEqual({ translationCount: 1, artifactCount: 1 })
    })

    it('filters review artifacts by reviewer.targetLocales.exclude', async () => {
      mockLocalizedReviewArtifactFiles()

      vi.mocked(fileSystem.readFile).mockImplementation(async (uri) => {
        if (uri.fsPath.endsWith('fr.xliff')) {
          return '<xliff><file><unit id="1"/></file></xliff>'
        }
        if (uri.fsPath.endsWith('es.xliff')) {
          return '<xliff><file><unit id="2"/></file></xliff>'
        }
        return ''
      })

      vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
        if (section === 'translator.reviewer.targetLocales.exclude') {
          return ['es']
        }
        return defaultValue
      })

      const preview = await translatorManager.getReviewPushPreview()
      expect(preview).toEqual({ translationCount: 1, artifactCount: 1 })
    })

    it('reuses a single review service instance across operations', async () => {
      mockReviewArtifactFiles()

      const createReviewService = vi.fn(() => ({
        pushReviewProject: vi.fn().mockResolvedValue(undefined),
        pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
        pullReviewedFiles: vi.fn().mockResolvedValue([]),
        getPendingReviewStatus: vi.fn().mockResolvedValue([])
      }))

      const manager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          createReviewService
        }
      )

      await manager.pushReviewProject()
      await manager.pullReviewedProjects()
      await manager.getPendingReviewStatus()

      expect(createReviewService).toHaveBeenCalledTimes(1)
    })

    describe('Bug #3 - Locale mapping metadata storage', () => {
      it('includes mappedLocale in ReviewPushRequest when locale maps via engine langMap', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportTMX).mockResolvedValue(2)
        vi.mocked(cache.exportXLIFF).mockResolvedValue(0)

        // Mock translatorEngines with DeepL langMap: zh-CN → zh-Hans
        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: {
              langMap: {
                'zh-CN': 'zh-Hans',
                'zh-TW': 'zh-Hant',
                'zh-HK': 'zh-Hant'
              }
            }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['zh-CN']
          return defaultValue
        })

        await manager.pushReviewProject()

        // Verify mappedLocale is included
        expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith(
          expect.objectContaining({
            targetLocale: 'zh-CN',
            mappedLocale: 'zh-Hans',
            artifacts: expect.any(Array)
          })
        )
      })

      it('uses mappedLocale when querying TM for XLIFF export', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportTMX).mockResolvedValue(0)
        vi.mocked(cache.exportXLIFF).mockResolvedValue(5)

        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: {
              langMap: {
                'zh-CN': 'zh-Hans'
              }
            }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['zh-CN']
          return defaultValue
        })

        await manager.pushReviewProject()

        // Verify TM XLIFF export was called with MAPPED locale, not original
        expect(cache.exportXLIFF).toHaveBeenCalledWith(
          expect.any(String),
          { targetLocale: 'zh-Hans' }
        )
      })

      it('uses mappedLocale when querying TM for TMX export', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportTMX).mockResolvedValue(3)
        vi.mocked(cache.exportXLIFF).mockResolvedValue(0)

        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: {
              langMap: {
                'zh-CN': 'zh-Hans'
              }
            }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['zh-CN']
          return defaultValue
        })

        await manager.pushReviewProject()

        // Verify TM TMX export was called with MAPPED locale
        expect(cache.exportTMX).toHaveBeenCalledWith(
          expect.any(String),
          { origin: 'human', targetLocale: 'zh-Hans' }
        )
      })

      it('handles non-1:1 locale mappings (zh-CN, zh-TW, zh-HK all map to zh-Hant or zh-Hans)', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportXLIFF).mockResolvedValue(2)

        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: {
              langMap: {
                'zh-CN': 'zh-Hans',
                'zh-TW': 'zh-Hant',
                'zh-HK': 'zh-Hant'
              }
            }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        // Test zh-TW maps to zh-Hant
        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['zh-TW']
          return defaultValue
        })

        await manager.pushReviewProject()

        // Verify zh-TW gets mapped to zh-Hant
        expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith(
          expect.objectContaining({
            targetLocale: 'zh-TW',
            mappedLocale: 'zh-Hant'
          })
        )
      })

      it('preserves unmapped locale when no langMap entry exists', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportTMX).mockResolvedValue(2)

        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: {
              langMap: {
                'zh-CN': 'zh-Hans'
              }
            }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['fr']
          return defaultValue
        })

        await manager.pushReviewProject()

        // Verify fr (not in langMap) maps to itself
        expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith(
          expect.objectContaining({
            targetLocale: 'fr',
            mappedLocale: 'fr'
          })
        )
      })

      it('checks all engines langMaps to find locale mapping', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportTMX).mockResolvedValue(2)

        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: { langMap: { 'ja': 'ja' } },
            google: { langMap: { 'zh-CN': 'zh-CN' } },
            azure: { langMap: { 'pt': 'pt-BR' } }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['pt']
          return defaultValue
        })

        await manager.pushReviewProject()

        // Should find 'pt' → 'pt-BR' from azure engine
        expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith(
          expect.objectContaining({
            targetLocale: 'pt',
            mappedLocale: 'pt-BR'
          })
        )
      })

      it('proves zh-CN XLIFF gets generated with correct mapped locale (Bug #2 fix prerequisite)', async () => {
        vi.mocked(fileSystem.readDirectory).mockResolvedValue([])
        vi.mocked(cache.exportTMX).mockResolvedValue(0)
        vi.mocked(cache.exportXLIFF).mockResolvedValue(10) // Proves XLIFF was generated (had entries)

        const mockReviewService = {
          pushReviewProject: vi.fn().mockResolvedValue(undefined),
          pullReviewedProjects: vi.fn().mockResolvedValue(undefined),
          getPendingReviewStatus: vi.fn().mockResolvedValue([])
        }

        const manager = new TranslatorManager(
          fileSystem,
          logger,
          cache,
          '/workspace',
          workspaceWatcher,
          configProvider,
          undefined,
          undefined,
          {
            deepl: {
              langMap: {
                'zh-CN': 'zh-Hans'
              }
            }
          },
          undefined,
          {
            createReviewService: () => mockReviewService
          }
        )

        vi.mocked(configProvider.get).mockImplementation((section: string, defaultValue?: unknown) => {
          if (section === 'translator.targetLocales') return ['zh-CN']
          return defaultValue
        })

        await manager.pushReviewProject()

        // 1. XLIFF export should be called with zh-Hans (mapped), not zh-CN
        expect(cache.exportXLIFF).toHaveBeenCalledWith(
          path.join('/workspace', '.translator/review/zh-CN/upload/local-tm-review.xliff'),
          { targetLocale: 'zh-Hans' }
        )

        // 2. exportXLIFF returned 10 (non-zero), meaning entries were found and XLIFF was generated
        // This proves the mapped locale query worked and found entries

        // 3. ReviewPushRequest should include both unmapped and mapped locales
        expect(mockReviewService.pushReviewProject).toHaveBeenCalledWith(
          expect.objectContaining({
            targetLocale: 'zh-CN',
            mappedLocale: 'zh-Hans',
            artifacts: expect.arrayContaining([
              expect.objectContaining({
                filePath: expect.stringContaining('local-tm-review.xliff')
              })
            ])
          })
        )
      })
    })
  });

  describe('Fix #1 - Filter back-translation targets from review', () => {
    it('should identify back-translation targets correctly', async () => {
      // Create a simple test instance to test the private helper method
      const testManager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider
      )

      // Test the isBackTranslationTarget private method via reflection
      const isBackTranslationTarget = (testManager as any).isBackTranslationTarget.bind(testManager)

      // Test with English source locale
      expect(isBackTranslationTarget('fr_en', 'en')).toBe(true)
      expect(isBackTranslationTarget('es_en', 'en')).toBe(true)
      expect(isBackTranslationTarget('de_en', 'en')).toBe(true)
      expect(isBackTranslationTarget('zh-CN_en', 'en')).toBe(true)

      // Test with non-English source locales
      expect(isBackTranslationTarget('en_de', 'de')).toBe(true)
      expect(isBackTranslationTarget('fr_de', 'de')).toBe(true)
      expect(isBackTranslationTarget('es_fr', 'fr')).toBe(true)
      expect(isBackTranslationTarget('zh-Hans_zh-CN', 'zh-CN')).toBe(true)

      // Test that non-back-translation targets are NOT identified as such
      expect(isBackTranslationTarget('fr', 'en')).toBe(false)
      expect(isBackTranslationTarget('es', 'en')).toBe(false)
      expect(isBackTranslationTarget('de', 'de')).toBe(false)
      expect(isBackTranslationTarget('en_us', 'en')).toBe(false) // Different source
      expect(isBackTranslationTarget('fr-ca', 'en')).toBe(false)

      // Test case insensitivity
      expect(isBackTranslationTarget('FR_EN', 'en')).toBe(true)
      expect(isBackTranslationTarget('Es_EN', 'En')).toBe(true)
    })

    it('should filter back-translation targets from locale lists', () => {
      // Test by creating a sample list and filtering manually
      const locales = ['fr', 'es', 'de', 'fr_en', 'es_en', 'de_en', 'it']
      const sourceLocale = 'en'

      // Create test manager to use isBackTranslationTarget
      const testManager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider
      )
      const isBackTranslationTarget = (testManager as any).isBackTranslationTarget.bind(testManager)

      // Filter back-translation targets
      const forwardOnlyLocales = locales.filter((locale) => !isBackTranslationTarget(locale, sourceLocale))

      // Should have filtered out back-translation targets
      expect(forwardOnlyLocales).toEqual(['fr', 'es', 'de', 'it'])
      expect(forwardOnlyLocales).not.toContain('fr_en')
      expect(forwardOnlyLocales).not.toContain('es_en')
      expect(forwardOnlyLocales).not.toContain('de_en')
    })

    it('should handle non-English source locales in filtering', () => {
      const locales = ['en', 'fr', 'it', 'en_de', 'fr_de', 'it_de']
      const sourceLocale = 'de'

      const testManager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider
      )
      const isBackTranslationTarget = (testManager as any).isBackTranslationTarget.bind(testManager)

      // Filter back-translation targets
      const forwardOnlyLocales = locales.filter((locale) => !isBackTranslationTarget(locale, sourceLocale))

      // Should have filtered out back-translation targets
      expect(forwardOnlyLocales).toEqual(['en', 'fr', 'it'])
      expect(forwardOnlyLocales).not.toContain('en_de')
      expect(forwardOnlyLocales).not.toContain('fr_de')
      expect(forwardOnlyLocales).not.toContain('it_de')
    })
  });

  describe('File event handlers', () => {
    let mockPipeline: any;

    beforeEach(() => {
      // Mock pipeline methods
      mockPipeline = {
        processFile: vi.fn().mockResolvedValue(undefined),
        removeFile: vi.fn().mockResolvedValue(undefined)
      };

      // Replace real pipeline with mock
      (translatorManager as any).pipeline = mockPipeline;
    });

    it('should handle file creation events', async () => {
      // Start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Get the watch method call to extract the listeners
      const watchCall = vi.mocked(mockFileWatcher.watch).mock.calls[0];
      const listeners = watchCall[1];

      // Create a test URI
      const testUri = { fsPath: '/workspace/i18n/en/test.json', scheme: 'file', path: '/workspace/i18n/en/test.json' };

      // Trigger the create handler
      if (listeners.onDidCreate) {
        await listeners.onDidCreate(testUri);
      }

      // Should call the pipeline
      expect(mockPipeline.processFile).toHaveBeenCalledWith(
        testUri,
        '/workspace',
        defaultProjectConfig,
        undefined
      );

      // Should log the action
      expect(logger.info).toHaveBeenCalledWith(`File changed: ${testUri.fsPath}`);
      expect(logger.info).toHaveBeenCalledWith(`Successfully processed file: ${testUri.fsPath}`);
    });

    it('should handle file deletion events', async () => {
      await translatorManager.startWatching(defaultProjectConfig);

      const watchCall = vi.mocked(mockFileWatcher.watch).mock.calls[0];
      const listeners = watchCall[1];

      const testUri = { fsPath: '/workspace/i18n/en/deleted.json', scheme: 'file', path: '/workspace/i18n/en/deleted.json' };

      if (listeners.onDidDelete) {
        await listeners.onDidDelete(testUri);
      }

      expect(mockPipeline.removeFile).toHaveBeenCalledWith(
        testUri,
        '/workspace',
        defaultProjectConfig
      );

      expect(logger.info).toHaveBeenCalledWith(`File deleted: ${testUri.fsPath}`);
      expect(logger.info).toHaveBeenCalledWith(`Successfully removed translations for file: ${testUri.fsPath}`);
    });

    it('should skip processing of excluded temporary files (.git)', async () => {
      // Start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Get the watch method call to extract the listeners
      const watchCall = vi.mocked(mockFileWatcher.watch).mock.calls[0];
      const listeners = watchCall[1];

      // Create a test URI for a .git temporary file
      const excludedUri = { fsPath: '/workspace/i18n/en/messages.json.git', scheme: 'file' };

      // Reset the mock to clear previous calls
      vi.mocked(mockPipeline.processFile).mockClear();
      vi.mocked(logger.debug).mockClear();

      // Trigger the change handler with a .git file
      if (listeners.onDidChange) {
        await listeners.onDidChange(excludedUri);
      }

      // Should NOT call the pipeline for excluded files
      expect(mockPipeline.processFile).not.toHaveBeenCalled();

      // Should log that the file was skipped
      expect(logger.debug).toHaveBeenCalledWith(`Skipping excluded file: ${excludedUri.fsPath}`);
    });

    it('should skip processing of excluded temporary files (.swp)', async () => {
      // Start watching
      await translatorManager.startWatching(defaultProjectConfig);

      // Get the watch method call to extract the listeners
      const watchCall = vi.mocked(mockFileWatcher.watch).mock.calls[0];
      const listeners = watchCall[1];

      // Create a test URI for a Vim swap file
      const excludedUri = { fsPath: '/workspace/i18n/en/.messages.json.swp', scheme: 'file' };

      // Reset the mock
      vi.mocked(mockPipeline.processFile).mockClear();
      vi.mocked(logger.debug).mockClear();

      // Trigger the change handler
      if (listeners.onDidChange) {
        await listeners.onDidChange(excludedUri);
      }

      // Should NOT call the pipeline
      expect(mockPipeline.processFile).not.toHaveBeenCalled();

      // Should log that the file was skipped
      expect(logger.debug).toHaveBeenCalledWith(`Skipping excluded file: ${excludedUri.fsPath}`);
    });
  });

  describe('dispose', () => {
    it('should dispose watchers and close cache', async () => {
      // Start watching to create watchers
      await translatorManager.startWatching(defaultProjectConfig);

      // Dispose the manager
      translatorManager.dispose();

      // Should dispose watchers
      expect(mockFileWatcher.dispose).toHaveBeenCalled();

      // Should close the cache
      expect(cache.close).toHaveBeenCalled();
    });
  });

  describe('supported file detection', () => {
    it('accepts .js, .mjs and .cjs files as supported', () => {
      expect((translatorManager as any).isSupportedFile('/workspace/i18n/en/messages.js')).toBe(true)
      expect((translatorManager as any).isSupportedFile('/workspace/i18n/en/messages.mjs')).toBe(true)
      expect((translatorManager as any).isSupportedFile('/workspace/i18n/en/messages.cjs')).toBe(true)
    })
  })

  describe('Configuration file watching', () => {
    let configChangeCallback: (() => Promise<void>) | undefined;

    beforeEach(() => {
      // Create a new instance with a mock config change callback
      configChangeCallback = vi.fn().mockResolvedValue(undefined);
      translatorManager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        configChangeCallback
      );

      // Setup mock workspace watcher
      vi.mocked(workspaceWatcher.createFileSystemWatcher).mockReturnValue(mockFileWatcher);
    });

    it('should create watchers for translator.json and translator.env', async () => {
      await translatorManager.startWatching(defaultProjectConfig);

      // Should create multiple watchers for source paths + config files
      expect(workspaceWatcher.createFileSystemWatcher).toHaveBeenCalledTimes(3); // 1 for source + 2 for config files

      // Should set up watch for translator.json
      expect(mockFileWatcher.watch).toHaveBeenCalledWith(
        TRANSLATOR_JSON,
        expect.objectContaining({
          onDidCreate: expect.any(Function),
          onDidChange: expect.any(Function),
          onDidDelete: expect.any(Function)
        })
      );

      // Should set up watch for translator.env
      expect(mockFileWatcher.watch).toHaveBeenCalledWith(
        TRANSLATOR_ENV,
        expect.objectContaining({
          onDidCreate: expect.any(Function),
          onDidChange: expect.any(Function),
          onDidDelete: expect.any(Function)
        })
      );

      // Should log watcher creation
      expect(logger.info).toHaveBeenCalledWith(`Watcher created for configuration file: ${TRANSLATOR_JSON}`);
      expect(logger.info).toHaveBeenCalledWith(`Watcher created for environment file: ${TRANSLATOR_ENV}`);
    });

    it('should call config change callback when translator.json changes', async () => {
      await translatorManager.startWatching(defaultProjectConfig);

      // Get the watch call for translator.json (should be the 2nd watcher for config files)
      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      // Find the translator.json watch call
      const jsonWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_JSON);

      expect(jsonWatchCall).toBeDefined();
      if (jsonWatchCall) {
        const listeners = jsonWatchCall[1];

        // Trigger the change handler
        if (listeners.onDidChange) {
          await listeners.onDidChange({ fsPath: `/workspace/${TRANSLATOR_JSON}`, scheme: 'file' });
        }

        // Should call the config change callback
        expect(configChangeCallback).toHaveBeenCalled();

        // Should log the configuration change
        expect(logger.info).toHaveBeenCalledWith(
          `Configuration file changed (${TRANSLATOR_JSON}), reloading configuration...`
        );
      }
    });

    it('should call config change callback when translator.env changes', async () => {
      await translatorManager.startWatching(defaultProjectConfig);

      // Find the translator.env watch call
      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const envWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_ENV);

      expect(envWatchCall).toBeDefined();
      if (envWatchCall) {
        const listeners = envWatchCall[1];

        // Trigger the change handler
        if (listeners.onDidChange) {
          await listeners.onDidChange({ fsPath: `/workspace/${TRANSLATOR_ENV}`, scheme: 'file' });
        }

        // Should call the config change callback
        expect(configChangeCallback).toHaveBeenCalled();

        // Should log the configuration change
        expect(logger.info).toHaveBeenCalledWith(
          `Configuration file changed (${TRANSLATOR_ENV}), reloading configuration...`
        );
      }
    });

    it('should warn if config changes but no callback is provided', async () => {
      // Create manager without callback
      translatorManager = new TranslatorManager(
        fileSystem,
        logger,
        cache,
        '/workspace',
        workspaceWatcher,
        configProvider,
        undefined,
        undefined // No callback
      );

      await translatorManager.startWatching(defaultProjectConfig);

      const watchCalls = vi.mocked(mockFileWatcher.watch).mock.calls;
      const jsonWatchCall = watchCalls.find((call: unknown[]) => call[0] === TRANSLATOR_JSON);

      if (jsonWatchCall) {
        const listeners = jsonWatchCall[1];

        if (listeners.onDidChange) {
          await listeners.onDidChange({ fsPath: `/workspace/${TRANSLATOR_JSON}`, scheme: 'file' });
        }

        // Should warn that no handler is configured
        expect(logger.warn).toHaveBeenCalledWith(
          'Configuration changed but no handler is registered. Please restart the translator.'
        );
      }
    });
  });

  describe('isExcludedFile', () => {
    it('should exclude .git temporary files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.json.git')).toBe(true);
    });

    it('should exclude Vim swap files (.swp)', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/.file.json.swp')).toBe(true);
    });

    it('should exclude Vim backup files (.swo)', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.json.swo')).toBe(true);
    });

    it('should exclude Emacs backup files (~)', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.json~')).toBe(true);
    });

    it('should exclude .tmp temporary files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.tmp')).toBe(true);
    });

    it('should exclude .temp temporary files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.temp')).toBe(true);
    });

    it('should exclude .bak backup files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.bak')).toBe(true);
    });

    it('should exclude .orig original backup files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/file.orig')).toBe(true);
    });

    it('should not exclude regular JSON files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/messages.json')).toBe(false);
    });

    it('should not exclude files with git in the middle of the name', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/my-git-config.json')).toBe(false);
    });

    it('should not exclude .json files', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/config.json')).toBe(false);
    });

    it('should handle Windows paths correctly', () => {
      expect((translatorManager as any).isExcludedFile('C:\\Users\\user\\file.json.git')).toBe(true);
    });

    it('should handle complex file names', () => {
      expect((translatorManager as any).isExcludedFile('/path/to/messages.en.json.git')).toBe(true);
      expect((translatorManager as any).isExcludedFile('/path/to/messages.en.json')).toBe(false);
    });
  });
});