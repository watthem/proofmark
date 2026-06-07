export type SyncStatus = 'success' | 'warning' | 'failed'

export type DryRunEvidenceRow = {
  tableName: string
  columnName: string
  originalValue: string
  maskedValue: string
  strategy: string
  detection: string
  confidence: 'high' | 'medium' | 'low'
}

export type SyncDataSourceKind = 'postgres' | 'demo' | 'unconfigured'

export type SyncDataSource = {
  kind: SyncDataSourceKind
  label: string
  message: string
}

export type ZeroPiiCertificate = {
  passed: boolean
  detectedFields: number
  mutatedFields: number
  rawPiiLeaks: number
  summary: string
}

export type SyncExecution = {
  id: string
  project: string
  database: string
  finishedAt: string
  durationMs: number
  duration: string
  rowsScrubbed: number
  rowsScrubbedLabel: string
  status: SyncStatus
  rulesApplied: number
  piiFieldsDetected: number
}

export type SummaryMetric = {
  label: string
  value: string
  tone: string
}

export type NavigationCounts = {
  projects: number
  rules: number
  logs: number
}

export type WorkspaceSummary = {
  name: string
  detail: string
}

export type SyncDashboardData = {
  dataSource: SyncDataSource
  workspace: WorkspaceSummary
  navigationCounts: NavigationCounts
  projectSummary: Array<SummaryMetric>
  syncExecutions: Array<SyncExecution>
  latestSync: SyncExecution
  dryRunEvidence: Array<DryRunEvidenceRow>
  certificate: ZeroPiiCertificate
}

export type CreateSyncDashboardDataOptions = {
  project: string
  databaseLabel: string
  dryRunEvidence: Array<DryRunEvidenceRow>
  dataSource: SyncDataSource
  durationMs?: number
}

const DEMO_DRY_RUN_EVIDENCE: Array<DryRunEvidenceRow> = [
  {
    tableName: 'users',
    columnName: 'email',
    originalValue: 'clara.oswald@gmail.com',
    maskedValue: 'marin.hale@example.test',
    strategy: 'faker.internet.email',
    detection: 'Regex match: email',
    confidence: 'high',
  },
  {
    tableName: 'users',
    columnName: 'phone',
    originalValue: '+1 (206) 555-0199',
    maskedValue: '+1 (415) 555-0138',
    strategy: 'faker.phone.number',
    detection: 'Heuristic: phone',
    confidence: 'high',
  },
  {
    tableName: 'users',
    columnName: 'password_hash',
    originalValue: 'secret-production-password',
    maskedValue: '$2b$10$proofmarkLOCALDEVHASHPLACEHOLDER',
    strategy: 'static',
    detection: 'Column name: password',
    confidence: 'high',
  },
  {
    tableName: 'orders',
    columnName: 'credit_card_last4',
    originalValue: '4242',
    maskedValue: '7319',
    strategy: 'scramble',
    detection: 'Column name: card',
    confidence: 'medium',
  },
]

const DEMO_SYNC_LOGS: Array<
  Omit<SyncExecution, 'duration' | 'rowsScrubbedLabel'>
> = [
  {
    id: 'sync_8cf91',
    project: 'acme-web',
    database: 'prod_main',
    finishedAt: '2026-06-05 07:42',
    durationMs: 258_000,
    rowsScrubbed: 1_800_000,
    status: 'success',
    rulesApplied: 18,
    piiFieldsDetected: 18,
  },
  {
    id: 'sync_8cf54',
    project: 'billing-api',
    database: 'stripe_shadow',
    finishedAt: '2026-06-05 06:16',
    durationMs: 167_000,
    rowsScrubbed: 482_000,
    status: 'warning',
    rulesApplied: 11,
    piiFieldsDetected: 12,
  },
  {
    id: 'sync_8ce99',
    project: 'support-ops',
    database: 'zendesk_replica',
    finishedAt: '2026-06-04 22:09',
    durationMs: 363_000,
    rowsScrubbed: 943_000,
    status: 'success',
    rulesApplied: 13,
    piiFieldsDetected: 13,
  },
]

export function createDemoSyncDashboardData(): SyncDashboardData {
  return createSyncDashboardDataFromExecutions({
    dataSource: {
      kind: 'demo',
      label: 'Demo evidence',
      message: 'Showing bundled sample evidence. Run against proofmark.json for real Postgres sampling.',
    },
    workspace: {
      name: 'Acme Platform',
      detail: 'Next.js / Prisma / Postgres',
    },
    syncLogs: DEMO_SYNC_LOGS,
    dryRunEvidence: DEMO_DRY_RUN_EVIDENCE,
  })
}

export function createUnconfiguredSyncDashboardData(
  message = 'Run proofmark init and configure a Postgres source URL to collect dry-run evidence.',
): SyncDashboardData {
  return createSyncDashboardDataFromExecutions({
    dataSource: {
      kind: 'unconfigured',
      label: 'No project config',
      message,
    },
    workspace: {
      name: 'No project loaded',
      detail: 'proofmark.json not found',
    },
    syncLogs: [],
    dryRunEvidence: [],
  })
}

export function createSyncDashboardData(
  options: CreateSyncDashboardDataOptions,
): SyncDashboardData {
  const now = new Date()
  const rulesApplied = options.dryRunEvidence.length
  const syncLog = {
    id: createSyncId(now),
    project: options.project,
    database: options.databaseLabel,
    finishedAt: formatTimestamp(now),
    durationMs: options.durationMs ?? 0,
    rowsScrubbed: options.dryRunEvidence.length,
    status: options.dryRunEvidence.length > 0 ? 'success' : 'warning',
    rulesApplied,
    piiFieldsDetected: options.dryRunEvidence.length,
  } satisfies Omit<SyncExecution, 'duration' | 'rowsScrubbedLabel'>

  return createSyncDashboardDataFromExecutions({
    dataSource: options.dataSource,
    workspace: {
      name: options.project,
      detail: options.databaseLabel,
    },
    syncLogs: [syncLog],
    dryRunEvidence: options.dryRunEvidence,
  })
}

export function createSyncDashboardDataFromExecutions({
  dataSource,
  workspace,
  syncLogs,
  dryRunEvidence,
}: {
  dataSource: SyncDataSource
  workspace: WorkspaceSummary
  syncLogs: Array<Omit<SyncExecution, 'duration' | 'rowsScrubbedLabel'>>
  dryRunEvidence: Array<DryRunEvidenceRow>
}): SyncDashboardData {
  const syncExecutions = syncLogs.map((execution) => ({
    ...execution,
    duration: formatDurationMs(execution.durationMs),
    rowsScrubbedLabel: formatRows(execution.rowsScrubbed),
  }))
  const latestSync = syncExecutions[0] ?? createEmptySyncExecution()
  const uniqueProjects = new Set(syncExecutions.map((sync) => sync.project)).size
  const activeRules = syncExecutions.reduce(
    (maxRules, sync) => Math.max(maxRules, sync.rulesApplied),
    0,
  )
  const totalRowsScrubbed = syncExecutions.reduce(
    (total, sync) => total + sync.rowsScrubbed,
    0,
  )
  const p95DurationMs = calculateP95(
    syncExecutions.map((sync) => sync.durationMs),
  )
  const certificate = createZeroPiiCertificate(dryRunEvidence)

  return {
    dataSource,
    workspace,
    navigationCounts: {
      projects: uniqueProjects,
      rules: activeRules,
      logs: syncExecutions.length,
    },
    projectSummary: [
      { label: 'Registered projects', value: String(uniqueProjects), tone: 'text-teal-200' },
      { label: 'Active masking rules', value: String(activeRules), tone: 'text-amber-200' },
      { label: 'Rows scrubbed', value: formatRows(totalRowsScrubbed), tone: 'text-emerald-200' },
      { label: 'Last sync p95', value: formatDurationMs(p95DurationMs), tone: 'text-cyan-200' },
    ],
    syncExecutions,
    latestSync,
    dryRunEvidence,
    certificate,
  }
}

export function createZeroPiiCertificate(
  rows: Array<DryRunEvidenceRow>,
): ZeroPiiCertificate {
  const mutatedFields = rows.filter((row) => row.originalValue !== row.maskedValue)
    .length
  const rawPiiLeaks = rows.filter((row) =>
    row.maskedValue.includes(row.originalValue),
  ).length
  const passed = rows.length > 0 && mutatedFields === rows.length && rawPiiLeaks === 0

  return {
    passed,
    detectedFields: rows.length,
    mutatedFields,
    rawPiiLeaks,
    summary:
      rows.length === 0
        ? 'No dry-run evidence available yet.'
        : passed
          ? `${mutatedFields}/${rows.length} detected PII fields mutated. 0 raw source values found in masked samples.`
          : `${mutatedFields}/${rows.length} detected PII fields mutated. ${rawPiiLeaks} raw source values remain.`,
  }
}

export function formatRows(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`
  }

  return String(value)
}

export function formatDurationMs(value: number): string {
  if (value < 1_000) {
    return `${value}ms`
  }

  const totalSeconds = Math.round(value / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function calculateP95(values: Array<number>): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index] ?? 0
}

function createEmptySyncExecution(): SyncExecution {
  return {
    id: 'sync_empty',
    project: 'none',
    database: 'none',
    finishedAt: 'never',
    durationMs: 0,
    duration: '0ms',
    rowsScrubbed: 0,
    rowsScrubbedLabel: '0',
    status: 'warning',
    rulesApplied: 0,
    piiFieldsDetected: 0,
  }
}

function createSyncId(date: Date): string {
  const timestamp = date.toISOString().replace(/\D/g, '').slice(0, 14)
  return `dryrun_${timestamp}`
}

function formatTimestamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ')
}
