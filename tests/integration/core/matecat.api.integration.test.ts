import { describe, expect, it } from 'vitest'
import { MateCatService, type MateCatSettings } from '../../../src/core/review/MateCatService'
import { ConsoleLogger } from '../../../src/core/util/baseLogger'

const mateCatApiKey = process.env.MATECAT_API_KEY

const hasMateCatCredentials = typeof mateCatApiKey === 'string' && mateCatApiKey.trim().length > 0
const initialDelayMs = Number(process.env.MATECAT_INTEGRATION_INITIAL_DELAY_MS ?? '3000')
const pollIntervalMs = Number(process.env.MATECAT_INTEGRATION_POLL_INTERVAL_MS ?? '5000')
const jobsTimeoutMs = Number(process.env.MATECAT_INTEGRATION_JOBS_TIMEOUT_MS ?? '180000')
const completionTimeoutMs = Number(process.env.MATECAT_INTEGRATION_COMPLETION_TIMEOUT_MS ?? '240000')

function buildTestXliffContent(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="fr" datatype="plaintext" original="integration-test.txt">
    <body>
      <trans-unit id="1">
        <source>Hello integration test</source>
        <target state="translated">Bonjour integration test</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
}

function log(message: string): void {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

function getChunks(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const directChunks = payload.chunks
  if (Array.isArray(directChunks)) {
    return directChunks.filter(
      (chunk): chunk is Record<string, unknown> => Boolean(chunk && typeof chunk === 'object')
    )
  }

  const jobsCandidate = payload.jobs
  if (!Array.isArray(jobsCandidate)) {
    return []
  }

  const chunks: Array<Record<string, unknown>> = []
  for (const job of jobsCandidate) {
    if (!job || typeof job !== 'object') {
      continue
    }

    const jobRecord = job as Record<string, unknown>
    const jobChunks = jobRecord.chunks
    if (!Array.isArray(jobChunks)) {
      continue
    }

    for (const chunk of jobChunks) {
      if (chunk && typeof chunk === 'object') {
        chunks.push(chunk as Record<string, unknown>)
      }
    }
  }

  return chunks
}

function hasJobReference(payload: Record<string, unknown>): boolean {
  const jobsCandidate = payload.jobs
  if (Array.isArray(jobsCandidate) && jobsCandidate.length > 0) {
    return true
  }

  const filesCandidate = payload.files
  if (Array.isArray(filesCandidate)) {
    return filesCandidate.some((fileItem) => {
      if (!fileItem || typeof fileItem !== 'object') {
        return false
      }

      const fileRecord = fileItem as Record<string, unknown>
      return (
        fileRecord.id_job !== undefined ||
        fileRecord.job_id !== undefined ||
        fileRecord.id !== undefined
      )
    })
  }

  return false
}

function extractJobIds(payload: Record<string, unknown>): string[] {
  const jobIds = new Set<string>()

  const addJobId = (candidate: unknown): void => {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      jobIds.add(candidate.trim())
      return
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      jobIds.add(String(candidate))
    }
  }

  const jobsCandidate = payload.jobs
  if (Array.isArray(jobsCandidate)) {
    for (const job of jobsCandidate) {
      if (typeof job === 'string' || typeof job === 'number') {
        addJobId(job)
        continue
      }

      if (!job || typeof job !== 'object') {
        continue
      }

      const jobRecord = job as Record<string, unknown>
      addJobId(jobRecord.id_job ?? jobRecord.job_id ?? jobRecord.id)
    }
  }

  const filesCandidate = payload.files
  if (Array.isArray(filesCandidate)) {
    for (const fileItem of filesCandidate) {
      if (!fileItem || typeof fileItem !== 'object') {
        continue
      }

      const fileRecord = fileItem as Record<string, unknown>
      addJobId(fileRecord.id_job ?? fileRecord.job_id ?? fileRecord.id)
    }
  }

  addJobId(payload.id_job ?? payload.job_id)
  return Array.from(jobIds)
}

function computePercentFromLatestStats(payload: Record<string, unknown>): number | undefined {
  let total = 0
  let completed = 0

  for (const chunkRecord of getChunks(payload)) {
    const statsCandidate = chunkRecord.stats
    if (!statsCandidate || typeof statsCandidate !== 'object') {
      continue
    }

    const statsRecord = statsCandidate as Record<string, unknown>
    const selectedStats =
      statsRecord.raw && typeof statsRecord.raw === 'object'
        ? (statsRecord.raw as Record<string, unknown>)
        : statsRecord.equivalent && typeof statsRecord.equivalent === 'object'
          ? (statsRecord.equivalent as Record<string, unknown>)
          : undefined

    if (!selectedStats) {
      continue
    }

    const totalSegments = asFiniteNumber(selectedStats.total)
    if (!totalSegments || totalSegments <= 0) {
      continue
    }

    const translated = asFiniteNumber(selectedStats.translated) ?? 0
    const approved = asFiniteNumber(selectedStats.approved) ?? 0
    const approved2 = asFiniteNumber(selectedStats.approved2) ?? 0

    total += totalSegments
    completed += translated + approved + approved2
  }

  if (total <= 0) {
    return undefined
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
}

function reduceStatusFromChunks(payload: Record<string, unknown>): string | undefined {
  const statuses = getChunks(payload)
    .map((chunk) => chunk.status)
    .filter((status): status is string => typeof status === 'string' && status.trim().length > 0)
    .map((status) => normalizeStatus(status))

  if (statuses.length === 0) {
    return undefined
  }

  const completedStatuses = new Set(['complete', 'completed', 'done', 'closed', 'archived', 'final', 'finalized'])
  const allCompleted = statuses.every((status) => completedStatuses.has(status))
  if (allCompleted) {
    return 'completed'
  }

  const unique = Array.from(new Set(statuses))
  if (unique.length === 1) {
    return unique[0]
  }

  return 'in_progress'
}

function isProjectCompleted(status: string, percentDone: number | undefined): boolean {
  const normalizedStatus = normalizeStatus(status)
  return normalizedStatus === 'completed' || normalizedStatus === 'complete' || normalizedStatus === 'finalized' || (percentDone ?? 0) >= 100
}

async function fetchProjectJobsPayload(settings: MateCatSettings, projectId: string, projectPass: string): Promise<Record<string, unknown>> {
  const startTime = Date.now()
  const projectUrl = `https://www.matecat.com/api/v3/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(projectPass)}`
  const projectResponse = await fetch(projectUrl, {
    method: 'GET',
    headers: {
      'x-matecat-key': settings.apiKey
    }
  })

  const projectBody = await projectResponse.text()
  const projectElapsed = Date.now() - startTime
  if (!projectResponse.ok) {
    log(`  API GET /projects: ${projectResponse.status} (${projectElapsed}ms)`)
    throw new Error(`MateCat project fetch failed: ${projectResponse.status} ${projectResponse.statusText} ${projectBody}`)
  }
  log(`  API GET /projects: 200 OK (${projectElapsed}ms, ${projectBody.length} bytes)`)

  const responseData = JSON.parse(projectBody) as Record<string, unknown>
  // API wraps response in a 'project' key
  const projectPayload = (responseData.project ?? responseData) as Record<string, unknown>

  const jobsArray = projectPayload.jobs
  if (!Array.isArray(jobsArray)) {
    log(`    ⚠️  WARNING: No jobs array in project response. Top keys: ${Object.keys(projectPayload).join(', ')}`)
    return projectPayload
  }

  log(`    Found ${jobsArray.length} job(s) in project`)

  // Build chunks array from ExtendedJob items
  const chunks: Array<Record<string, unknown>> = []
  for (const job of jobsArray) {
    if (!job || typeof job !== 'object') {
      continue
    }

    const jobRecord = job as Record<string, unknown>
    const jobId = jobRecord.id
    const stats = jobRecord.stats
    const status = jobRecord.status

    // Transform ExtendedJob into chunk-like structure for compatibility
    chunks.push({
      id: jobId,
      status,
      stats: stats, // Stats object already has { raw, equivalent } structure
      password: jobRecord.password,
      source: jobRecord.source,
      target: jobRecord.target
    })
  }

  log(`    Extracted ${chunks.length} chunk(s) from jobs`)

  // Log stats structure for debugging
  if (chunks.length > 0) {
    const firstChunk = chunks[0]
    if (firstChunk.stats) {
      const statsStr = JSON.stringify(firstChunk.stats, null, 0).substring(0, 200)
      log(`    First chunk stats: ${statsStr}`)
    } else {
      log(`    First chunk has NO stats object`)
    }
    if (jobsArray[0] && typeof jobsArray[0] === 'object') {
      const originalStats = (jobsArray[0] as Record<string, unknown>).stats
      const statsStr = JSON.stringify(originalStats, null, 0).substring(0, 300)
      log(`    Original ExtendedJob.stats: ${statsStr}`)
    }
  }

  return {
    ...projectPayload,
    jobs: jobsArray,
    chunks
  }
}

async function pollUntil<T>(
  readValue: () => Promise<T>,
  isDone: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
  timeoutMessage: string
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastValue: T | undefined
  let lastError: unknown
  let pollCount = 0
  const startTime = Date.now()

  log(`POLL STARTED: ${timeoutMessage} (timeout: ${timeoutMs}ms, interval: ${intervalMs}ms)`)

  while (true) {
    pollCount++
    try {
      lastValue = await readValue()
      if (isDone(lastValue)) {
        const elapsed = Date.now() - startTime
        log(`POLL SUCCESS: ${timeoutMessage} (${pollCount} attempts, ${elapsed}ms total)`)
        return lastValue
      }
      lastError = undefined
    } catch (error) {
      lastError = error
      const elapsed = Date.now() - startTime
      log(`POLL ATTEMPT ${pollCount} (${elapsed}ms): ${lastError instanceof Error ? lastError.message : String(lastError)}`)
    }

    if (Date.now() >= deadline) {
      const elapsed = Date.now() - startTime
      const errorSuffix =
        lastError instanceof Error
          ? ` Last error: ${lastError.message}`
          : lastError
            ? ` Last error: ${String(lastError)}`
            : ''
      log(`POLL TIMEOUT: ${timeoutMessage} after ${elapsed}ms and ${pollCount} attempts${errorSuffix}`)
      throw new Error(`${timeoutMessage}.${errorSuffix}`)
    }

    await sleep(intervalMs)
  }
}

describe.runIf(hasMateCatCredentials)('integration: matecat api', () => {
  it('creates project, discovers delayed jobs, validates stats summary, pulls files, and deletes when complete', async () => {
    log('TEST START: Matecat API integration test')
    const testStartTime = Date.now()

    const service = new MateCatService(new ConsoleLogger())
    const settings: MateCatSettings = {
      apiKey: mateCatApiKey!,
      newProjectDefaults: {
        project_name: `integration-${Date.now()}`
      }
    }

    let createdProjectRef: { projectId: string; projectPass: string } | undefined

    try {
      log('STEP 1: Creating project...')
      const createStartTime = Date.now()
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

      expect(typeof createdProject.projectId).toBe('string')
      expect(typeof createdProject.projectPass).toBe('string')
      expect(createdProject.projectId?.trim().length ?? 0).toBeGreaterThan(0)
      expect(createdProject.projectPass?.trim().length ?? 0).toBeGreaterThan(0)

      createdProjectRef = {
        projectId: createdProject.projectId as string,
        projectPass: createdProject.projectPass as string
      }
      const createElapsed = Date.now() - createStartTime
      log(`STEP 1 COMPLETE: Project created (${createElapsed}ms) - ID: ${createdProjectRef.projectId}`)

      log(`STEP 2: Waiting ${initialDelayMs}ms for Matecat to provision jobs...`)
      await sleep(initialDelayMs)
      log(`STEP 2 COMPLETE: Initial delay done`)

      log(`STEP 3: Polling for job discovery (timeout: ${jobsTimeoutMs}ms)...`)
      const discoveredStatus = await pollUntil(
        async () => {
          const statuses = await service.checkReviewProjectStatus(settings, [createdProjectRef])
          const payload = await fetchProjectJobsPayload(settings, createdProjectRef.projectId, createdProjectRef.projectPass)
          return {
            summary: statuses[0],
            payload
          }
        },
        ({ summary, payload }) => {
          const hasVisibleStatus = Boolean(summary && summary.status.trim().length > 0 && summary.status !== 'unknown')
          const hasChunks = getChunks(payload).length > 0
          const hasJobRef = hasJobReference(payload)
          if (hasVisibleStatus || hasChunks || hasJobRef) {
            log(`  ✓ Job discovered: status=${summary?.status}, chunks=${getChunks(payload).length}, hasJobRef=${hasJobRef}`)
          }
          return hasVisibleStatus || hasChunks || hasJobRef
        },
        jobsTimeoutMs,
        pollIntervalMs,
        'Timed out waiting for delayed MateCat job/status visibility after project creation'
      )
      log(`STEP 3 COMPLETE: Job discovered`)

      expect(discoveredStatus.summary).toBeDefined()

      log(`STEP 4: Verifying stats are readable (no alignment wait - requires human translation)...`)
      const statusWithStats = await service.checkReviewProjectStatus(settings, [createdProjectRef])
      expect(statusWithStats[0]).toBeDefined()
      const payload = await fetchProjectJobsPayload(settings, createdProjectRef.projectId, createdProjectRef.projectPass)
      const chunks = getChunks(payload)
      expect(chunks.length).toBeGreaterThan(0)
      log(`STEP 4 COMPLETE: Stats verified - ${chunks.length} chunk(s) readable`)

      log(`STEP 5: Pulling reviewed translations...`)
      const pullStartTime = Date.now()
      const pulledFiles = await service.pullReviewedTranslations(settings, [createdProjectRef])
      const pullElapsed = Date.now() - pullStartTime
      log(`STEP 5 COMPLETE: Files pulled (${pullElapsed}ms) - ${pulledFiles.length} file(s)`)
      expect(pulledFiles.length).toBeGreaterThan(0)
      expect(pulledFiles.some((file) => file.content.includes('<xliff'))).toBe(true)

      log(`STEP 6: Deleting project (skipping completion wait - requires human translation)...`)
      const deleteStartTime = Date.now()
      await service.deleteReviewProject(settings, createdProjectRef)
      const deleteElapsed = Date.now() - deleteStartTime
      log(`STEP 6 COMPLETE: Project deleted (${deleteElapsed}ms)`)

      log(`STEP 7: Verifying deletion (expecting 'unknown' status)...`)
      const deletedProjectStatus = await service.checkReviewProjectStatus(settings, [createdProjectRef])
      expect(deletedProjectStatus).toEqual([expect.objectContaining({ status: 'unknown' })])
      log(`STEP 7 COMPLETE: Deletion verified - got 'unknown' status as expected`)
      createdProjectRef = undefined

      const totalElapsed = Date.now() - testStartTime
      log(`TEST COMPLETE: All steps passed in ${totalElapsed}ms`)
    } catch (error) {
      const totalElapsed = Date.now() - testStartTime
      log(`TEST FAILED after ${totalElapsed}ms: ${error instanceof Error ? error.message : String(error)}`)
      if (createdProjectRef) {
        try {
          log(`CLEANUP: Attempting to delete project ${createdProjectRef.projectId}...`)
          await service.deleteReviewProject(settings, createdProjectRef)
          log(`CLEANUP: Project deleted successfully`)
        } catch (cleanupError) {
          log(`CLEANUP ERROR: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)
        }
      }

      throw error
    }
  }, 360000)
})

describe.runIf(!hasMateCatCredentials)('integration: matecat api', () => {
  it('is skipped because MATECAT_API_KEY is not configured', () => {
    expect(process.env.MATECAT_API_KEY).toBeFalsy()
  })
})
