import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SQLiteCache } from '../src/cache.sqlite'

function makeTmpDir(prefix = 'i18n-cache-test-') {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('SQLiteCache (better-sqlite3 real DB)', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = makeTmpDir()
    dbPath = join(dir, 'cache.db')
    console.log('Using temp cache DB:', dbPath)
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  it('putMany/getMany respects context in PK and persists across reopen', async () => {
    // 1) create + write
    let cache = new SQLiteCache(dbPath)

    // miss first
    let got = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu']
    })
    expect(got.size).toBe(0)

    // put both contexts
    await cache.putMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      pairs: [
        { src: 'Save', dst: 'Enregistrer', ctx: 'button' },
        { src: 'Save', dst: 'Sauvegarder', ctx: 'menu' }
      ]
    })

    // hit now
    got = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu']
    })
    expect(got.get('Save::button')).toBe('Enregistrer')
    expect(got.get('Save::menu')).toBe('Sauvegarder')

    cache.close()

    // 2) reopen & verify persistence
    cache = new SQLiteCache(dbPath)
    const again = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu']
    })
    expect(again.get('Save::button')).toBe('Enregistrer')
    expect(again.get('Save::menu')).toBe('Sauvegarder')

    // 3) upsert update
    await cache.putMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      pairs: [{ src: 'Save', dst: 'Mettre de côté', ctx: 'menu' }]
    })
    const afterUpdate = await cache.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save'],
      contexts: ['menu']
    })
    expect(afterUpdate.get('Save::menu')).toBe('Mettre de côté')

    // 4) CSV export/import round-trip to a fresh DB
    const csvPath = join(dir, 'cache.csv')
    await cache.exportCSV(csvPath)
    expect(existsSync(csvPath)).toBe(true)
    const csvText = readFileSync(csvPath, 'utf8')
    expect(csvText.split(/\r?\n/)[0]).toMatch(
      /engine_name,source_lang,target_lang,source_text,context,translated_text,updated_at/
    )

    cache.close()

    // Fresh DB + import
    const db2 = join(dir, 'cache2.db')
    let cache2 = new SQLiteCache(db2)
    const imported = await cache2.importCSV(csvPath)
    expect(imported).toBeGreaterThan(0)

    const hitImported = await cache2.getMany({
      engine: 'deepl',
      source: 'EN',
      target: 'FR',
      texts: ['Save', 'Save'],
      contexts: ['button', 'menu']
    })
    expect(hitImported.get('Save::button')).toBe('Enregistrer')
    expect(hitImported.get('Save::menu')).toBe('Mettre de côté')

    cache2.close()
  })
})
