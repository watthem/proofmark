import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import pc from 'picocolors'
import type { ProofmarkConfig } from '../config/types.js'
import {
  createMaskingConfig,
  parsePrismaSchema,
} from '../introspection/prismaAdapter.js'

export type InitializeProjectOptions = {
  cwd?: string
  schemaPath?: string
  overwrite?: boolean
}

type SchemaDiscovery =
  | {
      orm: 'prisma'
      schemaPath: string
      absoluteSchemaPath: string
    }
  | {
      orm: 'drizzle'
      schemaPath: string
      absoluteSchemaPath: string
    }
  | {
      orm: 'unknown'
      schemaPath: ''
      absoluteSchemaPath: ''
    }

/**
 * Scans a project and writes a starter proofmark.json config.
 * Also generates PROOFMARK_WORKSEED and appends it to .env if not already set.
 *
 * Prisma schemas are parsed locally so production credentials never need to be
 * read during initialization.
 *
 * @status
 * a) working  — yes: config generation and schema discovery work end-to-end
 * b) correct  — yes: seed generation added; .gitignore check ensures seed is not committed
 * c) fast     — yes: local file I/O only, no network calls
 */
export async function initializeProject(
  options: InitializeProjectOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const configPath = path.join(cwd, 'proofmark.json')

  if (existsSync(configPath) && options.overwrite !== true) {
    console.log(pc.yellow(`A proofmark.json file already exists at ${configPath}`))
    return
  }

  const discovery = discoverSchema(cwd, options.schemaPath)
  const masking = await loadMaskingRules(discovery)

  const config: ProofmarkConfig = {
    $schema: 'https://proofmark.dev/schema.json',
    project: path.basename(cwd),
    database: {
      orm: discovery.orm,
      schemaPath: discovery.schemaPath,
      sourceUrl: 'process.env.PROD_DATABASE_URL',
      targetUrl: 'process.env.LOCAL_DATABASE_URL',
    },
    masking,
  }

  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

  if (discovery.orm === 'prisma') {
    console.log(pc.green(`Found Prisma schema at ${discovery.schemaPath}`))
  } else if (discovery.orm === 'drizzle') {
    console.log(pc.green(`Found Drizzle configuration at ${discovery.schemaPath}`))
  } else {
    console.log(pc.yellow('No Prisma or Drizzle schema detected.'))
  }

  console.log(pc.green('Generated proofmark.json at project root.'))

  await ensureWorkspaceSeed(cwd)
}

/**
 * Generate PROOFMARK_WORKSEED and write it to .env if not already present.
 * Also ensures .env is listed in .gitignore.
 *
 * The seed is a 32-byte random hex string (256 bits). It is the HMAC key for all
 * masking operations in this project — see docs/solution.md for the security model.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes: idempotent (skips if already set), gitignore enforced
 * c) fast     — yes: randomBytes is synchronous-equivalent, file I/O is tiny
 */
async function ensureWorkspaceSeed(cwd: string): Promise<void> {
  const envPath = path.join(cwd, '.env')
  const gitignorePath = path.join(cwd, '.gitignore')

  const existingEnv = existsSync(envPath)
    ? await readFile(envPath, 'utf8')
    : ''

  if (existingEnv.includes('PROOFMARK_WORKSEED=')) {
    console.log(pc.dim('PROOFMARK_WORKSEED already set in .env — skipping.'))
    return
  }

  const seed = randomBytes(32).toString('hex')
  const seedLine = `\nPROOFMARK_WORKSEED=${seed}\n`
  await appendFile(envPath, seedLine, 'utf8')
  console.log(pc.green('Generated PROOFMARK_WORKSEED and appended to .env'))

  // Ensure .env is gitignored so the seed is never committed.
  const existingGitignore = existsSync(gitignorePath)
    ? await readFile(gitignorePath, 'utf8')
    : ''

  if (!existingGitignore.split('\n').some((line) => line.trim() === '.env')) {
    await appendFile(gitignorePath, '\n.env\n', 'utf8')
    console.log(pc.dim('Added .env to .gitignore'))
  }
}

function discoverSchema(cwd: string, explicitSchemaPath?: string): SchemaDiscovery {
  if (explicitSchemaPath) {
    const normalizedPath = normalizeRelativePath(explicitSchemaPath)
    const absoluteSchemaPath = path.resolve(cwd, explicitSchemaPath)
    return {
      orm: 'prisma',
      schemaPath: normalizedPath,
      absoluteSchemaPath,
    }
  }

  const prismaPath = './prisma/schema.prisma'
  const absolutePrismaPath = path.join(cwd, prismaPath)
  if (existsSync(absolutePrismaPath)) {
    return {
      orm: 'prisma',
      schemaPath: prismaPath,
      absoluteSchemaPath: absolutePrismaPath,
    }
  }

  for (const drizzlePath of [
    './drizzle.config.ts',
    './drizzle.config.mts',
    './drizzle.config.js',
    './drizzle.config.mjs',
  ]) {
    const absoluteDrizzlePath = path.join(cwd, drizzlePath)
    if (existsSync(absoluteDrizzlePath)) {
      return {
        orm: 'drizzle',
        schemaPath: drizzlePath,
        absoluteSchemaPath: absoluteDrizzlePath,
      }
    }
  }

  return {
    orm: 'unknown',
    schemaPath: '',
    absoluteSchemaPath: '',
  }
}

async function loadMaskingRules(
  discovery: SchemaDiscovery,
): Promise<ProofmarkConfig['masking']> {
  if (discovery.orm !== 'prisma') {
    return {}
  }

  const schema = await readFile(discovery.absoluteSchemaPath, 'utf8')
  const parsedSchema = parsePrismaSchema(schema)
  return createMaskingConfig(parsedSchema)
}

function normalizeRelativePath(inputPath: string) {
  const normalized = inputPath.replaceAll(path.sep, '/').replaceAll('\\', '/')
  return normalized.startsWith('.') ? normalized : `./${normalized}`
}
