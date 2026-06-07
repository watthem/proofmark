import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDemoSyncDashboardData,
  createSyncDashboardData,
  createZeroPiiCertificate,
  formatDurationMs,
  formatRows,
} from '../dist/cli/src/sync/evidence.js'

describe('sync evidence prototype data', () => {
  it('creates demo dashboard data only through the explicit demo helper', () => {
    const data = createDemoSyncDashboardData()

    assert.equal(data.navigationCounts.projects, 3)
    assert.equal(data.navigationCounts.rules, 18)
    assert.equal(data.navigationCounts.logs, data.syncExecutions.length)
    assert.equal(data.latestSync.id, data.syncExecutions[0].id)
    assert.equal(data.certificate.passed, true)
    assert.equal(data.dataSource.kind, 'demo')
  })

  it('creates real-source dashboard data from supplied dry-run evidence', () => {
    const data = createSyncDashboardData({
      project: 'acme-web',
      databaseLabel: 'localhost/acme',
      dataSource: {
        kind: 'postgres',
        label: 'Postgres dry run',
        message: 'sampled read-only',
      },
      dryRunEvidence: [
        {
          tableName: 'users',
          columnName: 'email',
          originalValue: 'person@example.com',
          maskedValue: 'user-123@example.test',
          strategy: 'faker.internet.email',
          detection: 'Config rule: User.email',
          confidence: 'high',
        },
      ],
      durationMs: 1200,
    })

    assert.equal(data.dataSource.kind, 'postgres')
    assert.equal(data.navigationCounts.projects, 1)
    assert.equal(data.navigationCounts.rules, 1)
    assert.equal(data.navigationCounts.logs, 1)
    assert.equal(data.certificate.passed, true)
  })

  it('fails the zero-PII certificate if a masked value contains the source value', () => {
    const certificate = createZeroPiiCertificate([
      {
        tableName: 'users',
        columnName: 'email',
        originalValue: 'person@example.com',
        maskedValue: 'person@example.com',
        strategy: 'faker.internet.email',
        detection: 'Regex match: email',
        confidence: 'high',
      },
    ])

    assert.equal(certificate.passed, false)
    assert.equal(certificate.rawPiiLeaks, 1)
  })

  it('formats row counts and durations for CLI and dashboard display', () => {
    assert.equal(formatRows(3_225_000), '3.2M')
    assert.equal(formatRows(482_000), '482K')
    assert.equal(formatDurationMs(258_000), '4m 18s')
  })
})
