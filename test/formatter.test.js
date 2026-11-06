'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { aggregate } = require('../src/aggregator');
const { formatTable, formatJson, formatCsv } = require('../src/formatter');

const SAMPLE_RECORDS = [
  { date: '2026-11-01', model: 'claude-sonnet-4-5', inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
  { date: '2026-11-02', model: 'claude-opus-4-1', inputTokens: 300, outputTokens: 120, costUsd: 0.09 },
];

test('formatTable zeigt Kopfzeile, beide Datenzeilen und eine GESAMT-Zeile (was der Mensch in der Konsole sieht)', () => {
  const report = aggregate(SAMPLE_RECORDS);
  const output = formatTable(report);
  const lines = output.split('\n');

  assert.match(lines[0], /Datum/);
  assert.match(lines[0], /Modell/);
  assert.match(lines[0], /Kosten \(USD\)/);
  assert.ok(output.includes('claude-sonnet-4-5'));
  assert.ok(output.includes('claude-opus-4-1'));
  assert.ok(output.includes('GESAMT'));
  assert.ok(output.includes('0.1000')); // Gesamtkosten 0.01 + 0.09, 4 Nachkommastellen
});

test('formatTable meldet verständlich, wenn keine Nutzungsdaten vorliegen (das Nicht-Ereignis)', () => {
  const output = formatTable(aggregate([]));
  assert.equal(output, 'Keine Nutzungsdaten gefunden.');
});

test('formatJson liefert strukturierte Zeilen + Summen, die sich wieder einlesen lassen', () => {
  const report = aggregate(SAMPLE_RECORDS);
  const parsed = JSON.parse(formatJson(report));

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].model, 'claude-sonnet-4-5');
  assert.equal(parsed.rows[0].costUsd, 0.01);
  assert.equal(parsed.totals.requests, 2);
  assert.ok(Math.abs(parsed.totals.costUsd - 0.1) < 1e-9);
});

test('formatCsv liefert eine Kopfzeile, eine Zeile je Datensatz und eine GESAMT-Zeile', () => {
  const report = aggregate(SAMPLE_RECORDS);
  const lines = formatCsv(report).split('\n');

  assert.equal(lines.length, 4); // Kopfzeile + 2 Datenzeilen + GESAMT
  assert.ok(lines[0].startsWith('Datum,Modell'));
  assert.ok(lines[3].startsWith(',GESAMT'));
});
