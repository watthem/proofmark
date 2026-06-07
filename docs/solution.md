---
title: How Proofmark masking works
description: How Proofmark uses deterministic HMAC-keyed masking to replace PII with realistic fake data while preserving local testing behavior.
---

# Proofmark Masking: How It Works

Local data masking often fails in one of two ways: it is too fake to test the
app, or too opaque to trust. You get replacement values back, but not much
evidence about how they were produced.

Proofmark makes the dry run inspectable. Every masking operation is
deterministic, transparent, and reproducible by the team that owns the project
seed. This document describes what happens, step by step, with real code.

---

## The problem we're solving

Developers need realistic data to work locally. The options today are bad:

- **Write your own anonymization script.** It's brittle, it's usually wrong, and it breaks
  every time the schema changes.
- **Use a lookup table.** You store `{ real: "jane@company.com", fake: "user_4829@example.com" }`.
  Congratulations, you've built a honeypot containing every piece of PII you were trying to protect.
- **Use an enterprise tool.** Six-month procurement cycle, $50k floor, built for data scientists
  who care about k-anonymity. You're a developer who needs `npx seed-local` to work.

The hard part isn't generating fake data. Any library can do that. The hard part is
**consistent fake data across tables** — so when `jane@company.com` is a foreign key in
both your `users` table and your `invoices` table, both rows mask to the same fake email.
Without that, your local database has broken referential integrity and is useless for testing.

---

## What Proofmark guarantees

1. **Stateless.** We never store a mapping from real to fake values. No lookup table, no database,
   no file on disk.

2. **Consistent.** The same real value always produces the same fake value, across every table,
   every column, every run — as long as the project seed doesn't change.

3. **Keyed.** The mapping uses your `PROOFMARK_WORKSEED`. Without the seed, an
   attacker cannot reproduce the mapping for common inputs like
   `"jane@company.com"`.

4. **Transparent.** You can see exactly which `faker` method runs for each field, and you can
   predict the output for any input if you have the seed.

---

## The algorithm

### Step 1: The project seed

When you run `proofmark init` (or `npm run cli -- init` from this repo), a
random 32-byte seed is generated and written to your local `.env`:

```
PROOFMARK_WORKSEED=a3f9c2e1b4d8...  # 64-character hex string
```

This seed is local to your machine. It never leaves your environment. If you're working in a
team, each developer generates their own seed — that's intentional. The point isn't that two
developers produce the same fake values; the point is that **within a single run**, every
occurrence of the same real value maps to the same fake value.

### Step 2: HMAC the real value

For each PII field, we compute an HMAC-SHA256 of the real value, keyed with the project seed:

```ts
import { createHmac } from 'node:crypto'

const hash = createHmac('sha256', projectSeed)
  .update(realValue)
  .digest('hex')
// → e.g. "a3f9c2e1b4d87f2a..."  (64 hex chars)
```

The HMAC is a one-way function. Given `hash` and `realValue`, you cannot recover
`projectSeed`. Given `hash` and `projectSeed`, there is no direct inverse for
`realValue`; for guessable values, an attacker can still test candidates. The
security model below covers that case.

### Step 3: Derive an integer seed for the PRNG

We take four 32-bit chunks from the hex digest and use them to seed a local Faker instance:

```ts
const numericSeeds = [0, 1, 2, 3].map(
  (i) => parseInt(hash.slice(i * 8, i * 8 + 8), 16)
)
// → e.g. [2751726305, 3033989930, 1994293002, 2887631062]
```

Using four chunks instead of one gives 128 bits of seed entropy to Faker's Mersenne Twister,
which avoids seed collisions in large datasets.

### Step 4: Create an isolated Faker instance

**We never touch the global `faker` singleton.** Global state and async code do not mix.
Instead, we create a throwaway instance, seed it, call the method, and let it be garbage
collected:

```ts
import { Faker, en } from '@faker-js/faker'

const f = new Faker({ locale: [en] })
f.seed(numericSeeds)
const fakeEmail = f.internet.email()
// f is discarded — nothing else is affected
```

### Step 5: Call the configured Faker method

The `proofmark.json` config tells us which `faker` method to use for each field:

```json
{
  "masking": {
    "users": {
      "email": "internet.email",
      "firstName": "person.firstName",
      "phone": "phone.number"
    }
  }
}
```

We dispatch directly to the named method on the isolated instance. What you see in the config
is what runs. No magic.

---

## Why referential integrity is guaranteed

Consider this schema:

```sql
CREATE TABLE users (
  id     SERIAL PRIMARY KEY,
  email  TEXT UNIQUE
);

CREATE TABLE invoices (
  id         SERIAL PRIMARY KEY,
  billed_to  TEXT REFERENCES users(email)
);
```

Both `users.email` and `invoices.billed_to` contain `"jane@company.com"`.

When Proofmark masks them:

```
HMAC("jane@company.com", seed) → hash_A
numericSeeds(hash_A)           → [n1, n2, n3, n4]
Faker.seed([n1, n2, n3, n4])   → deterministic state
faker.internet.email()         → "aurora.hayes@example.com"
```

The HMAC is a pure function. Same input + same seed + same strategy + same Faker
version = same hash = same numeric seeds = same Faker state = same output. The
two rows will both mask to `"aurora.hayes@example.com"` without Proofmark ever
consulting a lookup table.

---

## Security model

| Threat | Mitigated? | How |
|--------|-----------|-----|
| Attacker has fake value but not the seed, wants real value | ✅ | HMAC is one-way and keyed; without the seed there is no inverse and no rainbow table |
| Attacker rainbow-tables common emails (no seed) | ✅ | HMAC key required; per-project seeds defeat precomputed tables |
| Attacker has fake value **and** the seed, low-entropy field | ❌ | A guessable input (email, name, phone) can be brute-forced: for each candidate, compute HMAC(candidate, seed) → faker and compare. The seed must be protected like a credential. |
| Seed leaks via committed `.env` | ⚠️ | `.gitignore` enforced by `init`; treat as a credential leak — rotate the seed and re-run |
| Two projects with same seed produce same mappings | ✅ non-issue | Seeds are random 32-byte hex; collision probability negligible |

The seed is a credential, not a convenience token. Treat it like a database password:
keep it in `.env` or a secrets manager, never commit it. Masking protects PII from anyone
who does **not** have the seed — it is not a substitute for protecting the seed itself.
An attacker who obtains both a masked dataset and the seed can recover low-entropy values
(emails, names, phone numbers) by brute force, because those inputs are guessable. High-entropy
values (random tokens, long IDs) remain effectively unrecoverable. If the seed leaks, rotate it.

---

## The `proofmark.json` config

```json
{
  "$schema": "https://proofmark.dev/schema.json",
  "project": "acme-web",
  "database": {
    "orm": "prisma",
    "schemaPath": "prisma/schema.prisma",
    "sourceUrl": "process.env.PROD_DATABASE_URL",
    "targetUrl": "process.env.LOCAL_DATABASE_URL"
  },
  "masking": {
    "User": {
      "email": "internet.email",
      "firstName": "person.firstName",
      "lastName": "person.lastName",
      "phone": "phone.number",
      "address": "location.streetAddress"
    },
    "Order": {
      "billingEmail": "internet.email"
    }
  }
}
```

`masking.<ModelName>.<fieldName>` maps to a `faker` method path. The string is also what
appears in the dry-run report under the **Strategy** column, so you can always trace a masked
value back to the exact method that produced it.

Special strategies that don't use faker:

| Value | Behavior |
|-------|----------|
| `"scramble"` | Replaces with a stable hash-derived token of the same approximate length |
| `{ "strategy": "static", "value": "..." }` | Always replaces with the literal value (useful for password hashes) |

---

## Plugin API (`proofmark.config.ts`) — Planned, not yet implemented

> **Status: design sketch.** This interface is not built yet. It documents the intended
> extension point so the design can be reviewed; it does not work today. Track progress
> before relying on it.

For fields that faker can't handle — a legacy internal ID format, a Japanese postal code,
a domain-specific identifier — the plan is to let you provide your own masking function:

```ts
// proofmark.config.ts
import type { ProofmarkPlugin } from 'proofmark'

export default {
  strategies: {
    'custom.legacyId': (numericSeed: number) => {
      // numericSeed is the first 32-bit chunk of the HMAC
      // Determinism is your responsibility here
      const base = numericSeed % 900000
      return `LEG-${String(base + 100000).padStart(6, '0')}`
    },
  },
} satisfies ProofmarkPlugin
```

The plugin receives the pre-derived `numericSeed`, not the raw value or the project seed.
You get determinism for free; you control the format.

---

## What we're NOT doing (and why)

**k-anonymity / l-diversity / differential privacy.** These are statistical guarantees for
published datasets — academic papers, census releases, research data. They answer: "can an
attacker infer real values from the distribution of fake values across many rows?"

That's not our threat model. We're masking data for local development. Our threat model is:
"can a developer's laptop, staging server, or leaked dry-run report expose real customer PII?"

The answer to that question doesn't require a math PhD. It requires a good HMAC and a seed
that lives in `.env`.

**Lookup tables / vaults.** Storing mappings creates a honeypot — a single file that, if
leaked, exposes every PII-to-fake-value pair you've ever processed. Stateless masking has no
honeypot because there's nothing to steal. The mapping is recomputed on demand from the seed.

---

## Appendix: Collision probability

With 128 bits of HMAC-derived seed entropy fed into Faker's Mersenne Twister:

- For a dataset of 100,000 rows, the probability of two different values producing the same
  Faker output for the same field type is negligible (<10⁻³⁰).
- For practical local dev datasets (typically <10,000 rows), collisions are not a concern.

If your use case involves datasets large enough for collision probability to matter, you are
probably not in Proofmark's target audience (and should look at enterprise anonymization
platforms with proper statistical guarantees).
