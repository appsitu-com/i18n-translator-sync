import type { IMateCatPulledFile } from './MateCatService'

export type ReviewProjectStatus = {
  projectId: string
  status: string
  projectName: string
  totalTexts: number
  translatedTexts: number
}

export type ReviewArtifact = {
  filePath: string
  fileName: string
  contentType: string
}

export type ReviewPushRequest = {
  targetLocale: string
  mappedLocale?: string
  artifacts: ReviewArtifact[]
}

export interface IReviewService {
  pushReviewProject(request: ReviewPushRequest): Promise<void>
  pullReviewedProjects(): Promise<void>
  pullReviewedFiles(): Promise<IMateCatPulledFile[]>
  getPendingReviewStatus(): Promise<ReviewProjectStatus[]>
}

// Re-export for convenience
export type { IMateCatPulledFile }
