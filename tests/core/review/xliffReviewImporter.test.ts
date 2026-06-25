import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { JsonlTranslationMemory } from '../../../src/core/tm/JsonlTranslationMemory'
import { mergeReviewedXliffFilesIntoTranslationMemory, parseReviewedXliff } from '../../../src/core/review/xliffReviewImporter'
import type { ILogger } from '../../../src/core/util/baseLogger'

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn()
  }
}

describe('XLIFF reviewed import', () => {
  const logger = createLogger()
  let workspacePath = ''

  afterEach(() => {
    if (workspacePath) {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })

  it('parses reviewed XLIFF file metadata and units', () => {
    const batches = parseReviewedXliff(
      `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
      <trans-unit id="2">
        <source>World</source>
        <target>Monde</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
      'review.xliff'
    )

    expect(batches).toEqual([
      {
        sourcePath: 'i18n/fr/messages.json',
        sourceLocale: 'en',
        targetLocale: 'fr',
        units: [
          { id: '1', sourceText: 'Hello', targetText: 'Bonjour' },
          { id: '2', sourceText: 'World', targetText: 'Monde' }
        ]
      }
    ])
  })

  it('returns no parsed files for an empty reviewed XLIFF payload', () => {
    expect(parseReviewedXliff('', 'review.xliff')).toEqual([])
  })

  it('uses fallback file metadata when reviewed XLIFF omits source, target, or original attributes', () => {
    expect(
      parseReviewedXliff(
        `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file>
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        'review.xliff'
      )
    ).toEqual([
      {
        sourcePath: 'review.xliff',
        sourceLocale: '',
        targetLocale: '',
        units: [{ id: '1', sourceText: 'Hello', targetText: 'Bonjour' }]
      }
    ])
  })

  it('parses multiple file blocks from one reviewed XLIFF payload', () => {
    const batches = parseReviewedXliff(
      `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
  <file source-language="en" target-language="es" original="i18n/es/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Hola</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
      'review.xliff'
    )

    expect(batches).toEqual([
      {
        sourcePath: 'i18n/fr/messages.json',
        sourceLocale: 'en',
        targetLocale: 'fr',
        units: [{ id: '1', sourceText: 'Hello', targetText: 'Bonjour' }]
      },
      {
        sourcePath: 'i18n/es/messages.json',
        sourceLocale: 'en',
        targetLocale: 'es',
        units: [{ id: '1', sourceText: 'Hello', targetText: 'Hola' }]
      }
    ])
  })

  it('keeps repeated segment ids as separate parsed units when the reviewed content differs', () => {
    const batches = parseReviewedXliff(
      `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
      <trans-unit id="1">
        <source>Hello again</source>
        <target>Bonjour encore</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
      'review.xliff'
    )

    expect(batches).toEqual([
      {
        sourcePath: 'i18n/fr/messages.json',
        sourceLocale: 'en',
        targetLocale: 'fr',
        units: [
          { id: '1', sourceText: 'Hello', targetText: 'Bonjour' },
          { id: '1', sourceText: 'Hello again', targetText: 'Bonjour encore' }
        ]
      }
    ])
  })

  it('keeps the same source text in separate files as distinct file-level batches', () => {
    const batches = parseReviewedXliff(
      `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Save</source>
        <target>Enregistrer</target>
      </trans-unit>
    </body>
  </file>
  <file source-language="en" target-language="fr" original="i18n/fr/buttons.json">
    <body>
      <trans-unit id="1">
        <source>Save</source>
        <target>Sauvegarder</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
      'review.xliff'
    )

    expect(batches).toEqual([
      {
        sourcePath: 'i18n/fr/messages.json',
        sourceLocale: 'en',
        targetLocale: 'fr',
        units: [{ id: '1', sourceText: 'Save', targetText: 'Enregistrer' }]
      },
      {
        sourcePath: 'i18n/fr/buttons.json',
        sourceLocale: 'en',
        targetLocale: 'fr',
        units: [{ id: '1', sourceText: 'Save', targetText: 'Sauvegarder' }]
      }
    ])
  })

  it('skips malformed units that are missing source or target text', async () => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-xliff-import-'))
    mkdirSync(workspacePath, { recursive: true })
    const tmPath = path.join(workspacePath, 'translation.jsonl')
    const tm = new JsonlTranslationMemory(tmPath, workspacePath, logger)

    const imported = await mergeReviewedXliffFilesIntoTranslationMemory(
      [
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
      <trans-unit id="2">
        <source>Ignored because target missing</source>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        }
      ],
      tm,
      logger
    )

    expect(imported).toBe(1)

    const lookup = await tm.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello', 'Ignored because target missing'],
      contexts: ['1', '2'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1, 2]
    })

    expect(lookup.get('Hello::1')).toEqual({ translation: 'Bonjour', textPos: 1 })
    expect(lookup.get('Ignored because target missing::2')).toBeUndefined()
  })

  it('decodes XML entities in reviewed source and target text', async () => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-xliff-import-'))
    mkdirSync(workspacePath, { recursive: true })
    const tmPath = path.join(workspacePath, 'translation.jsonl')
    const tm = new JsonlTranslationMemory(tmPath, workspacePath, logger)

    await mergeReviewedXliffFilesIntoTranslationMemory(
      [
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Fish &amp; Chips</source>
        <target>Poisson &amp; Frites</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        }
      ],
      tm,
      logger
    )

    const lookup = await tm.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Fish & Chips'],
      contexts: ['1'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1]
    })

    expect(lookup.get('Fish & Chips::1')).toEqual({ translation: 'Poisson & Frites', textPos: 1 })
  })

  it('imports the same source text in different contexts as distinct TM rows', async () => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-xliff-import-'))
    mkdirSync(workspacePath, { recursive: true })
    const tmPath = path.join(workspacePath, 'translation.jsonl')
    const tm = new JsonlTranslationMemory(tmPath, workspacePath, logger)

    await mergeReviewedXliffFilesIntoTranslationMemory(
      [
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="button-title">
        <source>Save</source>
        <target>Enregistrer</target>
      </trans-unit>
      <trans-unit id="menu-label">
        <source>Save</source>
        <target>Sauvegarder</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        }
      ],
      tm,
      logger
    )

    const buttonLookup = await tm.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: ['button-title'],
      sourcePath: 'i18n/fr/messages.json',
      positions: ['button-title']
    })

    const menuLookup = await tm.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Save'],
      contexts: ['menu-label'],
      sourcePath: 'i18n/fr/messages.json',
      positions: ['menu-label']
    })

    expect(buttonLookup.get('Save::button-title')).toEqual({ translation: 'Enregistrer', textPos: 'button-title' })
    expect(menuLookup.get('Save::menu-label')).toEqual({ translation: 'Sauvegarder', textPos: 'menu-label' })
  })

  it('merges reviewed XLIFF content into translation memory with reviewed human metadata', async () => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-xliff-import-'))
    mkdirSync(workspacePath, { recursive: true })
    const tmPath = path.join(workspacePath, 'translation.jsonl')
    const tm = new JsonlTranslationMemory(tmPath, workspacePath, logger)

    const imported = await mergeReviewedXliffFilesIntoTranslationMemory(
      [
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        }
      ],
      tm,
      logger
    )

    expect(imported).toBe(1)

    const lookup = await tm.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: ['1'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1]
    })

    expect(lookup.get('Hello::1')).toEqual({ translation: 'Bonjour', textPos: 1 })

    const persisted = readFileSync(tmPath, 'utf8')
    expect(persisted).toContain('"status":"reviewed"')
    expect(persisted).toContain('"origin":"human"')
  })

  it('updates the same TM key when reviewed target text changes', async () => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-xliff-import-'))
    mkdirSync(workspacePath, { recursive: true })
    const tmPath = path.join(workspacePath, 'translation.jsonl')
    const tm = new JsonlTranslationMemory(tmPath, workspacePath, logger)

    await tm.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/messages.json',
      status: 'initial',
      origin: 'ai',
      pairs: [{ src: 'Hello', dst: 'Bonjour (AI)', ctx: '1', pos: 1 }]
    })

    const imported = await mergeReviewedXliffFilesIntoTranslationMemory(
      [
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour (Human)</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        }
      ],
      tm,
      logger
    )

    expect(imported).toBe(1)

    const lookup = await tm.getMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      texts: ['Hello'],
      contexts: ['1'],
      sourcePath: 'i18n/fr/messages.json',
      positions: [1]
    })

    expect(lookup.get('Hello::1')).toEqual({ translation: 'Bonjour (Human)', textPos: 1 })

    const persisted = readFileSync(tmPath, 'utf8')
    expect(persisted.match(/"sourceText":"Hello"/g)).toHaveLength(1)
    expect(persisted).toContain('"origin":"human"')
  })

  it('skips reviewed units whose target text did not change', async () => {
    workspacePath = mkdtempSync(path.join(tmpdir(), 'i18n-xliff-import-'))
    mkdirSync(workspacePath, { recursive: true })
    const tmPath = path.join(workspacePath, 'translation.jsonl')
    const tm = new JsonlTranslationMemory(tmPath, workspacePath, logger)

    await tm.putMany({
      engine: 'matecat',
      sourceLocale: 'en',
      targetLocale: 'fr',
      sourcePath: 'i18n/fr/messages.json',
      status: 'initial',
      origin: 'ai',
      pairs: [{ src: 'Hello', dst: 'Bonjour', ctx: '1', pos: 1 }]
    })

    const imported = await mergeReviewedXliffFilesIntoTranslationMemory(
      [
        {
          projectId: 'mc-1',
          fileName: 'reviewed.xliff',
          content: `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" original="i18n/fr/messages.json">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <target>Bonjour</target>
      </trans-unit>
    </body>
  </file>
</xliff>`,
        }
      ],
      tm,
      logger
    )

    expect(imported).toBe(0)

    const persisted = readFileSync(tmPath, 'utf8')
    expect(persisted.match(/"sourceText":"Hello"/g)).toHaveLength(1)
    expect(persisted).toContain('"origin":"ai"')
    expect(persisted).not.toContain('"origin":"human"')
  })
})