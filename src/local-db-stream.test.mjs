import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { streamDatabaseRows } from '../dist/cli/src/streams/localDbStream.js'

describe('streamDatabaseRows', () => {
  it('streams paged rows until the source is exhausted', async () => {
    const calls = []
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]

    const streamed = []
    for await (const row of streamDatabaseRows(
      {
        tableName: 'users',
        readBatch: async (cursor) => {
          calls.push(cursor)
          return rows.slice(cursor.offset, cursor.offset + cursor.limit)
        },
      },
      { batchSize: 2 },
    )) {
      streamed.push(row)
    }

    assert.deepEqual(streamed, rows)
    assert.deepEqual(calls, [
      { offset: 0, limit: 2 },
      { offset: 2, limit: 2 },
    ])
  })

  it('rejects invalid batch sizes', async () => {
    await assert.rejects(
      async () => {
        for await (const _row of streamDatabaseRows(
          {
            tableName: 'users',
            readBatch: async () => [],
          },
          { batchSize: 0 },
        )) {
          // Exhaust the generator.
        }
      },
      /batchSize must be a positive integer/,
    )
  })
})
