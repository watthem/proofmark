export type DatabaseRow = Record<string, unknown>

export type RowStreamCursor = {
  offset: number
  limit: number
}

export type RowBatchReader = {
  tableName: string
  readBatch: (cursor: RowStreamCursor) => Promise<Array<DatabaseRow>>
}

export type RowStreamOptions = {
  batchSize?: number
}

/**
 * Converts a paged row reader into an async stream primitive.
 *
 * The actual database adapter will own SQL generation and connections. This
 * function only provides bounded backpressure for the pull pipeline.
 */
export async function* streamDatabaseRows(
  reader: RowBatchReader,
  options: RowStreamOptions = {},
): AsyncGenerator<DatabaseRow> {
  const batchSize = options.batchSize ?? 500
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize must be a positive integer')
  }

  let offset = 0

  while (true) {
    const batch = await reader.readBatch({ offset, limit: batchSize })
    if (batch.length === 0) {
      return
    }

    for (const row of batch) {
      yield row
    }

    if (batch.length < batchSize) {
      return
    }

    offset += batch.length
  }
}
