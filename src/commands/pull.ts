import pc from 'picocolors'
import type { DatabaseRow } from '../streams/localDbStream.js'
import {
  type DryRunEvidenceRow,
  type SyncDashboardData,
} from '../sync/evidence.js'
import { loadSyncDashboardData } from '../sync/dashboardData.js'

export type PullOptions = {
  env: string
  dryRun: boolean
  demo?: boolean
  sampleSize?: number
  cwd?: string
}

/**
 * Runs the local-first data workflow.
 */
export async function executeDataPull(options: PullOptions): Promise<void> {
  console.log(pc.dim(`Connecting to profile: [${options.env}]`))
  console.log(pc.dim(`Dry run: ${String(options.dryRun)}`))

  if (options.dryRun) {
    const dashboardDataOptions = {
      allowDemo: options.demo === true,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.sampleSize === undefined ? {} : { sampleSize: options.sampleSize }),
    }
    const dashboardData = await loadSyncDashboardData(dashboardDataOptions)
    printDryRunReport(dashboardData)
    return
  }

  console.log(
    pc.yellow(
      'Write-mode database sync is not implemented yet. Run with --dry-run to inspect real Postgres sampling evidence.',
    ),
  )
}

export type PullPreviewRow = {
  tableName: string
  before: DatabaseRow
  after: DatabaseRow
}

function printDryRunReport(data: SyncDashboardData): void {
  console.log('')
  console.log(pc.bold(data.dataSource.label))
  console.log(pc.dim(data.dataSource.message))
  console.log('')
  console.log(pc.bold('Dry-run mutation evidence'))
  printEvidenceTable(data.dryRunEvidence)

  console.log('')
  console.log(pc.bold('Zero PII certificate'))
  const status = data.certificate.passed ? pc.green('PASS') : pc.red('FAIL')
  console.log(`${status} ${data.certificate.summary}`)
  console.log(
    pc.dim(
      `${data.navigationCounts.rules} active rules across ${data.navigationCounts.projects} registered projects.`,
    ),
  )
}

function printEvidenceTable(rows: Array<DryRunEvidenceRow>): void {
  const tableRows = rows.map((row) => [
    `${row.tableName}.${row.columnName}`,
    row.originalValue,
    row.maskedValue,
    row.strategy,
    row.detection,
  ])
  const headers = ['Field', 'Original sample', 'Masked sample', 'Strategy', 'Detected by']
  const widths = headers.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...tableRows.map((row) => row[columnIndex]?.length ?? 0),
    ),
  )

  console.log(formatTableRow(headers, widths, pc.dim))
  console.log(formatTableRow(widths.map((width) => '-'.repeat(width)), widths, pc.dim))

  for (const row of tableRows) {
    console.log(formatTableRow(row, widths))
  }
}

function formatTableRow(
  cells: Array<string>,
  widths: Array<number>,
  transform: (value: string) => string = (value) => value,
): string {
  return cells
    .map((cell, index) => transform(cell.padEnd(widths[index] ?? cell.length)))
    .join('  ')
}
