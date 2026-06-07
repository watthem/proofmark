import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ProofmarkConfig } from './types.js'

export type LoadedProofmarkConfig = {
  config: ProofmarkConfig
  configPath: string
  sourceUrl: string
  targetUrl?: string
}

export async function loadProofmarkConfig(
  cwd = process.cwd(),
): Promise<LoadedProofmarkConfig> {
  const configPath = path.join(cwd, 'proofmark.json')

  if (!existsSync(configPath)) {
    throw new Error(`proofmark.json not found at ${configPath}`)
  }

  const parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown
  const config = assertProofmarkConfig(parsed)
  const sourceUrl = resolveConfigReference(config.database.sourceUrl)
  const targetUrl = resolveConfigReference(config.database.targetUrl, {
    required: false,
  })

  if (!isPostgresUrl(sourceUrl)) {
    throw new Error('database.sourceUrl must resolve to a postgres:// or postgresql:// URL')
  }

  return {
    config,
    configPath,
    sourceUrl,
    ...(targetUrl ? { targetUrl } : {}),
  }
}

export function resolveConfigReference(
  value: string,
  options: { required?: boolean } = {},
): string {
  const required = options.required ?? true
  const envMatch = /^process\.env\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(value)

  if (!envMatch) {
    if (value === '' && required) {
      throw new Error('Expected a non-empty configuration value')
    }
    return value
  }

  const envName = envMatch[1] ?? ''
  const resolved = process.env[envName]

  if (!resolved && required) {
    throw new Error(`Environment variable ${envName} is required`)
  }

  return resolved ?? ''
}

function assertProofmarkConfig(value: unknown): ProofmarkConfig {
  if (!isRecord(value)) {
    throw new Error('proofmark.json must contain an object')
  }

  if (value.$schema !== 'https://proofmark.dev/schema.json') {
    throw new Error('proofmark.json has an unsupported $schema')
  }

  if (typeof value.project !== 'string' || value.project.trim() === '') {
    throw new Error('proofmark.json project must be a non-empty string')
  }

  if (!isRecord(value.database)) {
    throw new Error('proofmark.json database must be an object')
  }

  const database = value.database
  if (
    database.orm !== 'prisma' &&
    database.orm !== 'drizzle' &&
    database.orm !== 'unknown'
  ) {
    throw new Error('proofmark.json database.orm must be prisma, drizzle, or unknown')
  }

  for (const key of ['schemaPath', 'sourceUrl', 'targetUrl']) {
    if (typeof database[key] !== 'string') {
      throw new Error(`proofmark.json database.${key} must be a string`)
    }
  }

  if (!isRecord(value.masking)) {
    throw new Error('proofmark.json masking must be an object')
  }

  return value as ProofmarkConfig
}

function isPostgresUrl(value: string): boolean {
  return value.startsWith('postgres://') || value.startsWith('postgresql://')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
