import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createMaskingConfig,
  parsePrismaSchema,
} from '../dist/cli/src/introspection/prismaAdapter.js'

const SCHEMA = String.raw`
enum Role {
  USER
  ADMIN
}

model User {
  id               Int      @id @default(autoincrement())
  email            String   @unique
  password_hash    String
  firstName        String?
  stripeCustomerId String?
  posts            Post[]
  role             Role     @default(USER)

  @@map("users")
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}

model IgnoredEvent {
  id      Int    @id
  payload String

  @@ignore
}
`

describe('parsePrismaSchema', () => {
  it('parses models, mapped table names, enums, scalar fields, and relations', () => {
    const schema = parsePrismaSchema(SCHEMA)

    assert.deepEqual(schema.enums, ['Role'])
    assert.equal(schema.models.length, 3)

    const user = schema.models.find((model) => model.name === 'User')
    assert.ok(user)
    assert.equal(user.dbName, 'users')

    const email = user.fields.find((field) => field.name === 'email')
    assert.equal(email?.kind, 'scalar')
    assert.equal(email?.isUnique, true)

    const posts = user.fields.find((field) => field.name === 'posts')
    assert.equal(posts?.kind, 'relation')
    assert.equal(posts?.isList, true)

    const role = user.fields.find((field) => field.name === 'role')
    assert.equal(role?.kind, 'enum')

    const ignored = schema.models.find((model) => model.name === 'IgnoredEvent')
    assert.equal(ignored?.isIgnored, true)
  })
})

describe('createMaskingConfig', () => {
  it('infers starter masking rules for likely PII fields only', () => {
    const masking = createMaskingConfig(parsePrismaSchema(SCHEMA))

    assert.deepEqual(masking, {
      User: {
        email: 'faker.internet.email',
        password_hash: {
          strategy: 'static',
          value: '$2b$10$proofmarkLOCALDEVHASHPLACEHOLDER',
        },
        firstName: 'faker.person.firstName',
        stripeCustomerId: 'scramble',
      },
    })
  })
})
