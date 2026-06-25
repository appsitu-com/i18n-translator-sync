export type ReviewProjectStatus = {
  projectId: string
  status: string
}

export type ReviewArtifact = {
  filePath: string
  fileName: string
  contentType: string
}

export type ReviewPushRequest = {
  artifacts: ReviewArtifact[]
}

export interface IReviewService {
  pushReviewProject(request: ReviewPushRequest): Promise<void>
  pullReviewedProjects(): Promise<void>
  getPendingReviewStatus(): Promise<ReviewProjectStatus[]>
}
