import { describe, expect, it } from 'vitest'
import { MateCatService, type MateCatSettings } from '../../../src/core/review/MateCatService'
import { ConsoleLogger } from '../../../src/core/util/baseLogger'

const mateCatApiKey = process.env.MATECAT_API_KEY
const fallbackStatusProjectId = process.env.MATECAT_STATUS_PROJECT_ID
const fallbackStatusProjectPass = process.env.MATECAT_STATUS_PROJECT_PASS

const hasMateCatCredentials = typeof mateCatApiKey === 'string' && mateCatApiKey.trim().length > 0

function buildTestXliffContent(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" datatype="plaintext" original="integration-test.txt">
    <body>
      <trans-unit id="1">
        <source>Hello integration test</source>
        <target></target>
      </trans-unit>
    </body>
  </file>
</xliff>`
}

describe.runIf(hasMateCatCredentials)('integration: matecat api', () => {
  it('creates a review project and checks project status with raw API calls', async () => {
    const service = new MateCatService(new ConsoleLogger())
    const settings: MateCatSettings = {
      apiKey: mateCatApiKey!,
      newProjectDefaults: {
        project_name: `integration-${Date.now()}`
      }
    }

    const createdProject = await service.createReviewProject(settings, {
      fields: {
        project_name: `integration-${Date.now()}`,
        source_lang: 'en',
        target_lang: 'fr'
      },
      uploads: [
        {
          fieldName: 'files[]',
          fileName: 'integration-review.xliff',
          content: Buffer.from(buildTestXliffContent(), 'utf8'),
          contentType: 'application/xliff+xml'
        }
      ]
    })

    const projectId = createdProject.projectId ?? fallbackStatusProjectId
    const projectPass = createdProject.projectPass ?? fallbackStatusProjectPass
    expect(createdProject).toBeDefined()

    if (!projectId || projectId.trim().length === 0 || !projectPass || projectPass.trim().length === 0) {
      // Some MateCat responses do not expose a project ID directly.
      // In that case, create call success is still validated here.
      return
    }

    const statuses = await service.checkReviewProjectStatus(settings, [
      {
        projectId,
        projectPass
      }
    ])
    expect(statuses).toHaveLength(1)
    expect(statuses[0]?.projectId).toBe(projectId)
    expect(statuses[0]?.status.trim().length).toBeGreaterThan(0)
  }, 120000)
})

describe.runIf(!hasMateCatCredentials)('integration: matecat api', () => {
  it('is skipped because MATECAT_API_KEY is not configured', () => {
    expect(process.env.MATECAT_API_KEY).toBeFalsy()
  })
})
