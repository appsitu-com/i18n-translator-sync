export type ReviewProjectStatus = {
  projectId: string
  status: string
  percentDone?: number
  projectName?: string
}

export type ReviewArtifact = {
  filePath: string
  fileName: string
  contentType: string
}

export type ReviewPushRequest = {
  targetLocale: string
  artifacts: ReviewArtifact[]
}

export interface IReviewService {
  pushReviewProject(request: ReviewPushRequest): Promise<void>
  pullReviewedProjects(): Promise<void>
  getPendingReviewStatus(): Promise<ReviewProjectStatus[]>
}
