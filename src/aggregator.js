'use strict';

/**
 * Aggregiert normalisierte Nutzungseinträge zu einer Zeile je Modell und Tag,
 * plus einer Gesamtsumme über alle Zeilen.
 *
 * @param {Array<{date: string, model: string, inputTokens: number, outputTokens: number, costUsd: number}>} records
 * @returns {{rows: Array<{date: string, model: string, requests: number, inputTokens: number, outputTokens: number, totalTokens: number, costUsd: number}>, totals: {requests: number, inputTokens: number, outputTokens: number, totalTokens: number, costUsd: number}}}
 */
function aggregate(records) {
  const buckets = new Map(); // Schlüssel "date|model" -> Zeile

  for (const record of records) {
    const key = `${record.date}|${record.model}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        date: record.date,
        model: record.model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.requests += 1;
    bucket.inputTokens += record.inputTokens;
    bucket.outputTokens += record.outputTokens;
    bucket.costUsd += record.costUsd;
  }

  const rows = Array.from(buckets.values())
    .map((row) => ({ ...row, totalTokens: row.inputTokens + row.outputTokens }))
    .sort((a, b) => (a.date === b.date ? a.model.localeCompare(b.model) : a.date.localeCompare(b.date)));

  const totals = rows.reduce(
    (acc, row) => ({
      requests: acc.requests + row.requests,
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      totalTokens: acc.totalTokens + row.totalTokens,
      costUsd: acc.costUsd + row.costUsd,
    }),
    { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
  );

  return { rows, totals };
}

module.exports = { aggregate };
