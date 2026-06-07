export type MaskingStrategy =
  | string
  | {
      strategy: 'static'
      value: string
    }

export type ProofmarkConfig = {
  $schema: 'https://proofmark.dev/schema.json'
  project: string
  database: {
    orm: 'prisma' | 'drizzle' | 'unknown'
    schemaPath: string
    sourceUrl: string
    targetUrl: string
  }
  masking: Record<string, Record<string, MaskingStrategy>>
}
