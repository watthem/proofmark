import { loadProofmarkConfig } from '../config/load.js'
import {
  createDemoSyncDashboardData,
  createSyncDashboardData,
  createUnconfiguredSyncDashboardData,
  type SyncDashboardData,
} from './evidence.js'
import { samplePrismaPostgresDryRun } from './postgresSampler.js'

export type LoadSyncDashboardDataOptions = {
  cwd?: string
  sampleSize?: number
  allowDemo?: boolean
  allowUnconfigured?: boolean
}

export async function loadSyncDashboardData(
  options: LoadSyncDashboardDataOptions = {},
): Promise<SyncDashboardData> {
  const cwd = options.cwd ?? process.cwd()

  if (options.allowDemo === true) {
    return createDemoSyncDashboardData()
  }

  try {
    const loaded = await loadProofmarkConfig(cwd)
    const sample = await samplePrismaPostgresDryRun({
      cwd,
      config: loaded.config,
      sourceUrl: loaded.sourceUrl,
      ...(options.sampleSize === undefined ? {} : { sampleSize: options.sampleSize }),
    })

    return createSyncDashboardData({
      project: loaded.config.project,
      databaseLabel: sample.databaseLabel,
      dataSource: {
        kind: 'postgres',
        label: 'Postgres dry run',
        message: 'Evidence sampled read-only from the configured source Postgres database.',
      },
      dryRunEvidence: sample.evidence,
      durationMs: sample.durationMs,
    })
  } catch (error) {
    if (options.allowUnconfigured === true) {
      return createUnconfiguredSyncDashboardData(getErrorMessage(error))
    }

    throw error
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load dry-run evidence.'
}
