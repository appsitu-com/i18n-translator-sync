import type { IConfigProvider } from '../coreConfig'
import type { IFileSystem } from '../util/fs'
import type { ILogger } from '../util/baseLogger'
import type { IReviewService } from './reviewService'
import { MateCatReviewService, type MateCatReviewServiceDependencies } from './mateCatReviewService'

export type ReviewServiceName = 'matecat'

export type ReviewServiceFactoryOptions = {
  workspacePath: string
  fileSystem: IFileSystem
  logger: ILogger
  configProvider: IConfigProvider
  serviceDependencies?: ReviewServiceDependencies
}

export type ReviewServiceDependencies = {
  matecat?: MateCatReviewServiceDependencies
}

export function createReviewServiceFromConfig(options: ReviewServiceFactoryOptions): IReviewService {
  const configuredService = options.configProvider.get<string>('translator.reviewService', 'matecat')
  const reviewService = (configuredService ?? 'matecat').toLowerCase() as ReviewServiceName

  switch (reviewService) {
    case 'matecat':
      return new MateCatReviewService(
        options.workspacePath,
        options.fileSystem,
        options.logger,
        options.configProvider,
        options.serviceDependencies?.matecat
      )
    default:
      throw new Error(`Unsupported review service "${configuredService}". Supported services: matecat`)
  }
}
