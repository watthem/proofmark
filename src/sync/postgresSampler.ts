import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'
import type { MaskingStrategy, ProofmarkConfig } from '../config/types.js'
import {
  parsePrismaSchema,
  type PrismaSchema,
} from '../introspection/prismaAdapter.js'
import {
  applyMaskingStrategy,
  isMeaningfulSample,
  stringifySampleValue,
} from './masking.js'
import type { DryRunEvidenceRow } from './evidence.js'

export type QueryResultRows = {
  rows: Array<Record<string, unknown>>
}

export type PostgresQueryClient = {
  query: (text: string, values?: Array<unknown>) => Promise<QueryResultRows>
}

export type SamplingField = {
  modelName: string
  fieldName: string
  tableName: string
  columnName: string
  strategy: MaskingStrategy
  detection: string
}

export type TableSamplingPlan = {
  tableName: string
  fields: Array<SamplingField>
}

export type PostgresDryRunSampleOptions = {
  cwd: string
  config: ProofmarkConfig
  sourceUrl: string
  sampleSize?: number
  client?: PostgresQueryClient
  /**
   * HMAC key for deterministic masking. Should come from PROOFMARK_WORKSEED in the
   * caller's environment. If absent, masking falls back to unkeyed SHA-256 — correct
   * output shape but no security guarantee against rainbow tables.
   *
   * @status
   * a) working  — yes, threaded through to applyMaskingStrategy
   * b) correct  — only if PROOFMARK_WORKSEED is set; warn and degrade gracefully otherwise
   * c) fast     — n/a, this is config
   */
  projectSeed?: string
}

export type PostgresDryRunSampleResult = {
  evidence: Array<DryRunEvidenceRow>
  durationMs: number
  databaseLabel: string
}

const DEFAULT_SAMPLE_SIZE = 5

/**
 * Sample rows from a Prisma-managed Postgres source and return dry-run masking evidence.
 *
 * Reads PROOFMARK_WORKSEED from process.env when projectSeed is not supplied by the
 * caller. Warns (does not throw) when the seed is absent — dry-run output is still
 * correct in shape, but the masking has no HMAC security guarantee.
 *
 * @status
 * a) working  — yes, dry-run path is end-to-end functional
 * b) correct  — yes when PROOFMARK_WORKSEED is present; degrades with a warning otherwise
 * c) fast     — yes for dry-run sample sizes (1–100 rows); not optimized for bulk loads
 */
export async function samplePrismaPostgresDryRun(
  options: PostgresDryRunSampleOptions,
): Promise<PostgresDryRunSampleResult> {
  if (options.config.database.orm !== 'prisma') {
    throw new Error('Real Postgres dry-run sampling currently requires database.orm = prisma')
  }

  const projectSeed = resolveProjectSeed(options.projectSeed)

  const startedAt = Date.now()
  const schemaPath = path.resolve(options.cwd, options.config.database.schemaPath)
  const schema = parsePrismaSchema(await readFile(schemaPath, 'utf8'))
  const plan = createPrismaPostgresSamplingPlan(options.config, schema)
  const sampleSize = normalizeSampleSize(options.sampleSize)

  if (plan.length === 0) {
    return {
      evidence: [],
      durationMs: Date.now() - startedAt,
      databaseLabel: describePostgresSource(options.sourceUrl),
    }
  }

  if (options.client) {
    const evidence = await executeSamplingPlan(options.client, plan, sampleSize, projectSeed)
    return {
      evidence,
      durationMs: Date.now() - startedAt,
      databaseLabel: describePostgresSource(options.sourceUrl),
    }
  }

  const pool = new Pool({
    connectionString: options.sourceUrl,
    max: 1,
  })

  try {
    const evidence = await executeSamplingPlan(pool, plan, sampleSize, projectSeed)
    return {
      evidence,
      durationMs: Date.now() - startedAt,
      databaseLabel: describePostgresSource(options.sourceUrl),
    }
  } finally {
    await pool.end()
  }
}

/**
 * Read the project seed from the caller or fall back to PROOFMARK_WORKSEED in env.
 * Fails closed: throws when no seed is resolvable, because masking with an empty
 * HMAC key is not secure and silently producing unkeyed output would break the
 * core guarantee. The CLI loads .env at startup, so a seed written by
 * `proofmark init` is normally present. The demo path returns before sampling
 * (see dashboardData.ts) and never reaches this function.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes: explicit > env > fail-closed; no unkeyed masking can occur
 * c) fast     — yes
 */
function resolveProjectSeed(explicitSeed?: string): string {
  if (explicitSeed) return explicitSeed
  const envSeed = process.env['PROOFMARK_WORKSEED']
  if (envSeed) return envSeed
  throw new Error(
    'PROOFMARK_WORKSEED is not set, so masking would use an empty key — refusing to run. ' +
    'Run `proofmark init` to generate a workspace seed in .env, or export PROOFMARK_WORKSEED. ' +
    'Use `--demo` to preview without a real database.',
  )
}

export function createPrismaPostgresSamplingPlan(
  config: ProofmarkConfig,
  schema: PrismaSchema,
): Array<TableSamplingPlan> {
  const modelMap = new Map(schema.models.map((model) => [model.name, model]))
  const plansByTable = new Map<string, TableSamplingPlan>()

  for (const [modelName, rules] of Object.entries(config.masking)) {
    const model = modelMap.get(modelName)
    if (!model || model.isIgnored) {
      throw new Error(`Masking config references unknown or ignored Prisma model ${modelName}`)
    }

    const tableName = model.dbName ?? model.name

    for (const [fieldName, strategy] of Object.entries(rules)) {
      const field = model.fields.find((candidate) => candidate.name === fieldName)
      if (!field || field.isIgnored || field.kind !== 'scalar' || field.isList) {
        throw new Error(
          `Masking config references unsupported Prisma field ${modelName}.${fieldName}`,
        )
      }

      const tablePlan = plansByTable.get(tableName) ?? {
        tableName,
        fields: [],
      }
      tablePlan.fields.push({
        modelName,
        fieldName,
        tableName,
        columnName: field.dbName ?? field.name,
        strategy,
        detection: `Config rule: ${modelName}.${fieldName}`,
      })
      plansByTable.set(tableName, tablePlan)
    }
  }

  return [...plansByTable.values()]
}

/**
 * Execute a sampling plan against a live Postgres client, applying masking to each row.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes: SQL identifiers are quoted; values parameterized; masking keyed
 * c) fast     — yes for dry-run sizes; sequential table queries are fine at 1–100 rows
 */
export async function executeSamplingPlan(
  client: PostgresQueryClient,
  plan: Array<TableSamplingPlan>,
  sampleSize: number,
  projectSeed: string,
): Promise<Array<DryRunEvidenceRow>> {
  const evidence: Array<DryRunEvidenceRow> = []

  for (const table of plan) {
    const query = buildSampleQuery(
      table.tableName,
      table.fields.map((field) => field.columnName),
    )
    const result = await client.query(query, [sampleSize])

    for (const field of table.fields) {
      const sampledValue = result.rows
        .map((row) => row[field.columnName])
        .find((value) => isMeaningfulSample(value))

      if (!isMeaningfulSample(sampledValue)) {
        continue
      }

      evidence.push({
        tableName: field.tableName,
        columnName: field.columnName,
        originalValue: stringifySampleValue(sampledValue),
        maskedValue: applyMaskingStrategy(sampledValue, field.strategy, projectSeed),
        strategy:
          typeof field.strategy === 'string'
            ? field.strategy
            : field.strategy.strategy,
        detection: field.detection,
        confidence: 'high',
      })
    }
  }

  return evidence
}

export function buildSampleQuery(
  tableName: string,
  columnNames: Array<string>,
): string {
  if (columnNames.length === 0) {
    throw new Error(`Cannot sample ${tableName} without columns`)
  }

  const columns = [...new Set(columnNames)]
  const columnList = columns.map(quoteQualifiedIdentifier).join(', ')
  const whereClause = columns
    .map((column) => `${quoteQualifiedIdentifier(column)} IS NOT NULL`)
    .join(' OR ')

  return `SELECT ${columnList} FROM ${quoteQualifiedIdentifier(tableName)} WHERE ${whereClause} LIMIT $1`
}

export function quoteQualifiedIdentifier(identifier: string): string {
  const parts = identifier.split('.')

  if (parts.some((part) => part.trim() === '')) {
    throw new Error(`Invalid SQL identifier: ${identifier}`)
  }

  return parts.map(quoteIdentifier).join('.')
}

export function describePostgresSource(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl)
    const database = url.pathname.replace(/^\//, '') || 'postgres'
    return `${url.hostname}/${database}`
  } catch {
    return 'postgres source'
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

function normalizeSampleSize(value: number | undefined): number {
  const sampleSize = value ?? DEFAULT_SAMPLE_SIZE

  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 100) {
    throw new Error('sampleSize must be an integer from 1 to 100')
  }

  return sampleSize
}
