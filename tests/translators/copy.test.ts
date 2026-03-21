import { it, expect, describe } from 'vitest'
import { CopyTranslator } from '../../src/translators/copy'

describe('copy', () => {
  it('copy engine returns same texts', async () => {
    const out = await CopyTranslator.translateMany(['a', 'b'], [null, null], {
      sourceLocale: 'en',
      targetLocale: 'en-US',
      rootDir: '.',
      apiConfig: {}
    })
    expect(out).toEqual(['a', 'b'])
  })
})
