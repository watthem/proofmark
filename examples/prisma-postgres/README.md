# Proofmark Prisma/Postgres Example

This example gives Proofmark a real Prisma schema and a seeded Postgres source
database. It is intentionally small: no Prisma Client generation, no app, and no
write-mode sync.

## Prerequisites

- Docker with Compose
- Node dependencies installed at the repo root

## Run From This Repo

From the repo root:

```sh
npm install
npm run build:cli
```

Then run the example:

```sh
cd examples/prisma-postgres
cp .env.example .env
docker compose up -d --wait
node ../../dist/cli/bin/cli.js pull --dry-run
```

The output should show dry-run evidence for `users.email`,
`users.phone_number`, `appointments.intake_email`, and other configured PII
fields. `users.email` and `appointments.intake_email` share source values so
their masked values stay consistent without a lookup table.

Clean up the database:

```sh
docker compose down -v
```

## Run With The Published Package

After Proofmark is published, the same folder should work with:

```sh
cd examples/prisma-postgres
cp .env.example .env
docker compose up -d --wait
npx proofmark pull --dry-run
```

## Files

- `prisma/schema.prisma`: Prisma model metadata used by Proofmark.
- `postgres/init.sql`: seeded Postgres tables and rows.
- `proofmark.json`: checked-in masking rules for this example.
- `.env.example`: demo-only source database URL and workseed.

The example workseed is not secret and must not be reused outside this demo.
