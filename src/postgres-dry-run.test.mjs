import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadProofmarkConfig, resolveConfigReference } from '../dist/cli/src/config/load.js'
import { applyMaskingStrategy } from '../dist/cli/src/sync/masking.js'
import {
  buildSampleQuery,
  createPrismaPostgresSamplingPlan,
  executeSamplingPlan,
  quoteQualifiedIdentifier,
  samplePrismaPostgresDryRun,
} from '../dist/cli/src/sync/postgresSampler.js'
import { parsePrismaSchema } from '../dist/cli/src/introspection/prismaAdapter.js'

const PRISMA_SCHEMA = String.raw`
model User {
  id            Int    @id @default(autoincrement())
  email         String @unique
  passwordHash  String @map("password_hash")
  firstName     String @map("first_name")

  @@map("users")
}
`

const CONFIG = {
  $schema: 'https://proofmark.dev/schema.json',
  project: 'acme-web',
  database: {
    orm: 'prisma',
    schemaPath: './schema.prisma',
    sourceUrl: 'process.env.PROOFMARK_TEST_DATABASE_URL',
    targetUrl: 'process.env.PROOFMARK_TEST_TARGET_URL',
  },
  masking: {
    User: {
      email: 'faker.internet.email',
      passwordHash: {
        strategy: 'static',
        value: '$2b$10$proofmarkLOCALDEVHASHPLACEHOLDER',
      },
      firstName: 'faker.person.firstName',
    },
  },
}

describe('proofmark config loading', () => {
  it('loads proofmark.json and resolves process.env database references', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'proofmark-config-'))
    process.env.PROOFMARK_TEST_DATABASE_URL = 'postgresql://localhost/acme'

    await writeFile(
      path.join(cwd, 'proofmark.json'),
      `${JSON.stringify(CONFIG, null, 2)}\n`,
      'utf8',
    )

    const loaded = await loadProofmarkConfig(cwd)

    assert.equal(loaded.config.project, 'acme-web')
    assert.equal(loaded.sourceUrl, 'postgresql://localhost/acme')
  })

  it('rejects missing required environment references', () => {
    delete process.env.PROOFMARK_TEST_MISSING_DATABASE_URL

    assert.throws(
      () => resolveConfigReference('process.env.PROOFMARK_TEST_MISSING_DATABASE_URL'),
      /Environment variable PROOFMARK_TEST_MISSING_DATABASE_URL is required/,
    )
  })
})

describe('Prisma Postgres dry-run planning', () => {
  it('maps Prisma models and mapped fields to Postgres table and column names', () => {
    const plan = createPrismaPostgresSamplingPlan(
      CONFIG,
      parsePrismaSchema(PRISMA_SCHEMA),
    )

    assert.deepEqual(plan, [
      {
        tableName: 'users',
        fields: [
          {
            modelName: 'User',
            fieldName: 'email',
            tableName: 'users',
            columnName: 'email',
            strategy: 'faker.internet.email',
            detection: 'Config rule: User.email',
          },
          {
            modelName: 'User',
            fieldName: 'passwordHash',
            tableName: 'users',
            columnName: 'password_hash',
            strategy: {
              strategy: 'static',
              value: '$2b$10$proofmarkLOCALDEVHASHPLACEHOLDER',
            },
            detection: 'Config rule: User.passwordHash',
          },
          {
            modelName: 'User',
            fieldName: 'firstName',
            tableName: 'users',
            columnName: 'first_name',
            strategy: 'faker.person.firstName',
            detection: 'Config rule: User.firstName',
          },
        ],
      },
    ])
  })

  it('quotes SQL identifiers and binds only the sampling limit', () => {
    const query = buildSampleQuery('public.users', [
      'email',
      'password_hash',
      'name"with_quote',
    ])

    assert.equal(
      query,
      'SELECT "email", "password_hash", "name""with_quote" FROM "public"."users" WHERE "email" IS NOT NULL OR "password_hash" IS NOT NULL OR "name""with_quote" IS NOT NULL LIMIT $1',
    )
    assert.equal(quoteQualifiedIdentifier('users; drop table users;'), '"users; drop table users;"')
  })
})

describe('Postgres dry-run execution', () => {
  it('samples configured columns and masks sampled source values', async () => {
    const queryCalls = []
    const TEST_SEED = 'proofmark-test-seed-do-not-use-in-production'

    const evidence = await executeSamplingPlan(
      {
        query: async (text, values) => {
          queryCalls.push({ text, values })
          return {
            rows: [
              {
                email: 'clara.oswald@gmail.com',
                password_hash: 'secret-production-password',
                first_name: 'Clara',
              },
            ],
          }
        },
      },
      createPrismaPostgresSamplingPlan(CONFIG, parsePrismaSchema(PRISMA_SCHEMA)),
      2,
      TEST_SEED,
    )

    assert.equal(queryCalls.length, 1)
    assert.deepEqual(queryCalls[0].values, [2])
    assert.equal(evidence.length, 3)
    assert.equal(evidence[0].originalValue, 'clara.oswald@gmail.com')
    // faker produces a realistic email; just verify it's not the original and looks like an email
    assert.match(evidence[0].maskedValue, /^[^@]+@[^@]+\.[^@]+$/)
    assert.notEqual(evidence[0].maskedValue, 'clara.oswald@gmail.com')
    assert.equal(evidence[1].maskedValue, '$2b$10$proofmarkLOCALDEVHASHPLACEHOLDER')
    assert.notEqual(evidence[2].maskedValue, 'Clara')
  })

  it('can run the full sampler against an injected Postgres query client', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'proofmark-sampler-'))
    await writeFile(path.join(cwd, 'schema.prisma'), PRISMA_SCHEMA, 'utf8')

    const sample = await samplePrismaPostgresDryRun({
      cwd,
      config: {
        ...CONFIG,
        database: {
          ...CONFIG.database,
          sourceUrl: 'postgresql://localhost/acme',
        },
      },
      sourceUrl: 'postgresql://localhost/acme',
      sampleSize: 1,
      projectSeed: 'proofmark-test-seed-do-not-use-in-production',
      client: {
        query: async () => ({
          rows: [
            {
              email: 'amy@example.com',
              password_hash: 'secret-production-password',
              first_name: 'Amy',
            },
          ],
        }),
      },
    })

    assert.equal(sample.databaseLabel, 'localhost/acme')
    assert.equal(sample.evidence.length, 3)
  })

  it('keeps generated masks different from the original source sample', () => {
    const TEST_SEED = 'proofmark-test-seed-do-not-use-in-production'
    assert.notEqual(
      applyMaskingStrategy('person@example.com', 'faker.internet.email', TEST_SEED),
      'person@example.com',
    )
    assert.notEqual(applyMaskingStrategy('4242', 'scramble', TEST_SEED), '4242')
  })

  it('fails closed when no project seed is resolvable (no unkeyed masking)', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'proofmark-noseed-'))
    await writeFile(path.join(cwd, 'schema.prisma'), PRISMA_SCHEMA, 'utf8')
    const previousSeed = process.env.PROOFMARK_WORKSEED
    delete process.env.PROOFMARK_WORKSEED

    try {
      await assert.rejects(
        () =>
          samplePrismaPostgresDryRun({
            cwd,
            config: {
              ...CONFIG,
              database: { ...CONFIG.database, sourceUrl: 'postgresql://localhost/acme' },
            },
            sourceUrl: 'postgresql://localhost/acme',
            sampleSize: 1,
            client: { query: async () => ({ rows: [{ email: 'amy@example.com' }] }) },
          }),
        /PROOFMARK_WORKSEED is not set/,
      )
    } finally {
      if (previousSeed !== undefined) process.env.PROOFMARK_WORKSEED = previousSeed
    }
  })
})
