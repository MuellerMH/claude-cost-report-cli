'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { aggregate } = require('../src/aggregator');

test('aggregate liefert leere Zeilen und Null-Summen für eine leere Eingabe', () => {
  const report = aggregate([]);
  assert.deepEqual(report.rows, []);
  assert.deepEqual(report.totals, { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 });
});

test('aggregate gruppiert nach Modell und Tag und summiert Tokens/Kosten', () => {
  const records = [
    { date: '2026-11-01', model: 'claude-sonnet-4-5', inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
    { date: '2026-11-01', model: 'claude-sonnet-4-5', inputTokens: 200, outputTokens: 80, costUsd: 0.02 },
    { date: '2026-11-01', model: 'claude-opus-4-1', inputTokens: 300, outputTokens: 120, costUsd: 0.09 },
    { date: '2026-11-02', model: 'claude-sonnet-4-5', inputTokens: 50, outputTokens: 10, costUsd: 0.005 },
  ];

  const { rows, totals } = aggregate(records);

  assert.equal(rows.length, 3);

  const day1Sonnet = rows.find((r) => r.date === '2026-11-01' && r.model === 'claude-sonnet-4-5');
  assert.deepEqual(day1Sonnet, {
    date: '2026-11-01',
    model: 'claude-sonnet-4-5',
    requests: 2,
    inputTokens: 300,
    outputTokens: 130,
    costUsd: 0.03,
    totalTokens: 430,
  });

  assert.equal(totals.requests, 4);
  assert.equal(totals.inputTokens, 650);
  assert.equal(totals.outputTokens, 260);
  assert.equal(totals.totalTokens, 910);
  assert.ok(Math.abs(totals.costUsd - 0.125) < 1e-9);
});

test('aggregate sortiert Zeilen nach Datum, dann nach Modellname', () => {
  const records = [
    { date: '2026-11-02', model: 'claude-sonnet-4-5', inputTokens: 1, outputTokens: 1, costUsd: 0.001 },
    { date: '2026-11-01', model: 'claude-opus-4-1', inputTokens: 1, outputTokens: 1, costUsd: 0.001 },
    { date: '2026-11-01', model: 'claude-haiku-4-5', inputTokens: 1, outputTokens: 1, costUsd: 0.001 },
  ];

  const { rows } = aggregate(records);

  assert.deepEqual(
    rows.map((r) => `${r.date}|${r.model}`),
    ['2026-11-01|claude-haiku-4-5', '2026-11-01|claude-opus-4-1', '2026-11-02|claude-sonnet-4-5'],
  );
});
