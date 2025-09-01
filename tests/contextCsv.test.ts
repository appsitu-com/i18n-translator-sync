import { it, expect } from 'vitest'
import { loadContextCsvForJson } from '../src/contextCsv'
import { workspace, Uri } from './mocks/vscode'

it('loads CSV with header and collects duplicates/empties', async () => {
  const csv = [
    'path,context',
    'buttons.save,button',
    'buttons.save,button', // dup
    'menu.file,' // empty value
  ].join('\n')
  ;(workspace.fs.readFile as any).mockResolvedValueOnce(Buffer.from(csv, 'utf8'))
  const res = await loadContextCsvForJson(Uri.file('/w/i18n/en/demo.json'))
  expect(res.map['buttons.save']).toBe('button')
  expect(res.stats.duplicates).toContain('buttons.save')
  expect(res.stats.emptyValues).toContain('menu.file')
})
