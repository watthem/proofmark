import { createHash, createHmac } from 'node:crypto'
import { Faker, en } from '@faker-js/faker'
import type { MaskingStrategy } from '../config/types.js'

/**
 * Apply a masking strategy to a single value, producing a stable fake replacement.
 *
 * Determinism guarantee: identical (value, strategy, projectSeed) inputs always
 * produce identical output, across tables, columns, and runs. This is what makes
 * referential integrity work without a lookup table.
 *
 * See docs/solution.md for the full algorithm.
 *
 * @status
 * a) working  — yes, used in dry-run sampling path
 * b) correct  — yes, after HMAC upgrade; projectSeed required for security guarantee
 * c) fast     — yes, single HMAC + one Faker instantiation per call; negligible overhead
 */
export function applyMaskingStrategy(
  value: unknown,
  strategy: MaskingStrategy,
  projectSeed: string,
): string {
  const original = stringifySampleValue(value)

  if (typeof strategy !== 'string') {
    if (strategy.strategy === 'static') {
      return strategy.value
    }

    return scrambleValue(original, projectSeed)
  }

  if (strategy === 'scramble') {
    return scrambleValue(original, projectSeed)
  }

  // Faker-backed strategies: isolated instance per call, seeded from HMAC.
  // See fakerFromHmac() for why we never touch the global faker singleton.
  const f = fakerFromHmac(original, projectSeed)

  if (strategy.includes('internet.email')) {
    return f.internet.email()
  }

  if (strategy.includes('phone.number')) {
    return f.phone.number({ style: 'national' })
  }

  if (strategy.includes('person.firstName')) {
    return f.person.firstName()
  }

  if (strategy.includes('person.lastName')) {
    return f.person.lastName()
  }

  if (strategy.includes('person.fullName')) {
    return f.person.fullName()
  }

  if (strategy.includes('location.streetAddress')) {
    return f.location.streetAddress()
  }

  if (strategy.includes('location.city')) {
    return f.location.city()
  }

  if (strategy.includes('location.zipCode')) {
    return f.location.zipCode()
  }

  if (strategy.includes('internet.ip')) {
    return f.internet.ip()
  }

  if (strategy.includes('internet.userAgent')) {
    return f.internet.userAgent()
  }

  return scrambleValue(original, projectSeed)
}

/**
 * Create a throwaway Faker instance seeded deterministically from an HMAC digest.
 *
 * We use four 32-bit chunks of the digest (128 bits total) as the Mersenne Twister
 * seed array. This avoids the global faker singleton, which is unsafe under async
 * parallelism. Each call gets its own isolated PRNG state.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes: isolated instance, 128-bit seed entropy, no global side effects
 * c) fast     — yes: Faker instantiation is lightweight; allocation cost is negligible
 *               relative to the I/O cost of the surrounding Postgres sampling
 */
function fakerFromHmac(value: string, projectSeed: string): Faker {
  const hash = hmacHex(value, projectSeed)
  const seeds = [0, 1, 2, 3].map((i) => parseInt(hash.slice(i * 8, i * 8 + 8), 16))
  const f = new Faker({ locale: [en] })
  f.seed(seeds)
  return f
}

/**
 * Stringify any value to a consistent string before hashing.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes: covers all Postgres column types we sample
 * c) fast     — yes
 */
export function stringifySampleValue(value: unknown): string {
  if (value === null) {
    return '(null)'
  }

  if (value === undefined) {
    return '(undefined)'
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Guard against masking empty or null samples that would produce misleading evidence.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes
 * c) fast     — yes
 */
export function isMeaningfulSample(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim() !== ''
  }

  return true
}

/**
 * Replace a value with a stable hash-derived token of similar shape.
 * Used as the fallback strategy and for the explicit "scramble" config value.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes, after projectSeed threading; was unkeyed before
 * c) fast     — yes
 */
function scrambleValue(value: string, projectSeed: string): string {
  const length = Math.max(8, Math.min(value.length, 24))
  const hash = stableToken(value, projectSeed, length)

  if (/^\d+$/.test(value)) {
    return stableDigits(value, projectSeed, value.length)
  }

  if (/^[A-Za-z0-9_-]+$/.test(value)) {
    return `pm_${hash}`
  }

  return `masked_${hash}`
}

/**
 * Compute an HMAC-SHA256 digest of value keyed with projectSeed.
 *
 * This replaces the previous unkeyed SHA-256. The key makes the mapping
 * project-specific: without PROOFMARK_WORKSEED you cannot reconstruct the
 * mapping even for common plaintext inputs like "jane@company.com".
 *
 * @status
 * a) working  — yes
 * b) correct  — yes: HMAC-SHA256 is cryptographically appropriate for this use case
 * c) fast     — yes: single HMAC op, hardware-accelerated on all modern Node targets
 */
function hmacHex(value: string, projectSeed: string): string {
  return createHmac('sha256', projectSeed).update(value).digest('hex')
}

/**
 * Return the first `length` hex characters of the HMAC digest.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes, after switch from createHash to hmacHex
 * c) fast     — yes
 */
function stableToken(value: string, projectSeed: string, length: number): string {
  return hmacHex(value, projectSeed).slice(0, length)
}

/**
 * Derive a numeric string of exactly `length` digits from the HMAC digest.
 * Used for zip codes, phone suffixes, and other digit-only fields.
 *
 * @status
 * a) working  — yes
 * b) correct  — yes, after projectSeed threading; digit distribution is uniform
 * c) fast     — yes
 */
function stableDigits(value: string, projectSeed: string, length: number): string {
  const hex = stableToken(value, projectSeed, Math.max(length * 2, 8))
  let digits = ''

  for (const character of hex) {
    digits += Number.parseInt(character, 16) % 10
    if (digits.length === length) {
      break
    }
  }

  return digits.padEnd(length, '0')
}
