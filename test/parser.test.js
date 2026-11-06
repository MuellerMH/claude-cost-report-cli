'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { normalizeRecord, parseJsonl, parseCsv, parseCsvLine, detectFormat } = require('../src/parser');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test('normalizeRecord liest Pflichtfelder über Feldnamen-Varianten', () => {
  const record = normalizeRecord({
    time: '2026-11-01T08:00:00Z',
    modelName: 'claude-sonnet-4-5',
    prompt_tokens: '100',
    completion_tokens: '50',
    cost: '0.01',
  });
  assert.deepEqual(record, {
    date: '2026-11-01',
    model: 'claude-sonnet-4-5',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  });
});

test('normalizeRecord verwirft Datensätze mit fehlendem Pflichtfeld', () => {
  assert.equal(normalizeRecord({ timestamp: '2026-11-01T08:00:00Z', model: 'x', input_tokens: 1, output_tokens: 1 }), null);
  assert.equal(normalizeRecord({}), null);
  assert.equal(normalizeRecord(null), null);
});

test('normalizeRecord verwirft ungültiges Datum und negative Zahlen statt zu raten', () => {
  const base = { model: 'claude-sonnet-4-5', input_tokens: 1, output_tokens: 1, cost_usd: 0.001 };
  assert.equal(normalizeRecord({ ...base, timestamp: 'nicht-interpretierbar' }), null);
  assert.equal(normalizeRecord({ ...base, timestamp: '2026-11-01T08:00:00Z', input_tokens: -5 }), null);
  assert.equal(normalizeRecord({ ...base, timestamp: '2026-11-01T08:00:00Z', cost_usd: 'abc' }), null);
});

test('parseJsonl parst gültige Zeilen und ignoriert leere Zeilen', () => {
  const content = [
    '{"timestamp": "2026-11-01T08:00:00Z", "model": "claude-sonnet-4-5", "input_tokens": 100, "output_tokens": 50, "cost_usd": 0.01}',
    '',
    '{"timestamp": "2026-11-02T08:00:00Z", "model": "claude-opus-4-1", "input_tokens": 200, "output_tokens": 80, "cost_usd": 0.05}',
    '',
  ].join('\n');
  const { records, errors } = parseJsonl(content);
  assert.equal(records.length, 2);
  assert.equal(errors.length, 0);
  assert.equal(records[0].model, 'claude-sonnet-4-5');
});

test('parseJsonl liefert leere Liste für eine leere Datei (keine Fehler)', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'empty.jsonl'), 'utf8');
  const { records, errors } = parseJsonl(content);
  assert.deepEqual(records, []);
  assert.deepEqual(errors, []);
});

test('parseJsonl meldet fehlerhafte Zeilen mit Zeilennummer, verarbeitet den Rest trotzdem', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'mixed-errors.jsonl'), 'utf8');
  const { records, errors } = parseJsonl(content);

  // Zeile 1 und Zeile 7 sind gültig, der Rest ist jeweils aus einem anderen Grund defekt.
  assert.equal(records.length, 2);
  assert.equal(records[0].model, 'claude-sonnet-4-5');
  assert.equal(records[1].model, 'claude-opus-4-1');

  assert.equal(errors.length, 4);
  assert.equal(errors[0].line, 2); // kaputtes JSON
  assert.match(errors[0].reason, /ungültiges JSON/);
  assert.equal(errors[1].line, 3); // fehlende Felder (output_tokens, cost_usd)
  assert.equal(errors[2].line, 4); // Zeitstempel nicht interpretierbar
  assert.equal(errors[3].line, 5); // negative Tokenzahl
});

test('parseCsvLine zerlegt einfache und zitierte Felder inkl. Escaping', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(parseCsvLine('"Hallo, Welt",42'), ['Hallo, Welt', '42']);
  assert.deepEqual(parseCsvLine('"mit ""Anführung""",x'), ['mit "Anführung"', 'x']);
});

test('parseCsv parst Kopfzeile + Datenzeilen', () => {
  const content = [
    'timestamp,model,input_tokens,output_tokens,cost_usd',
    '2026-11-01T08:00:00Z,claude-sonnet-4-5,100,50,0.01',
    '2026-11-02T08:00:00Z,claude-opus-4-1,200,80,0.05',
  ].join('\n');
  const { records, errors } = parseCsv(content);
  assert.equal(records.length, 2);
  assert.equal(errors.length, 0);
  assert.equal(records[0].date, '2026-11-01');
});

test('parseCsv liefert leere Liste für Inhalt ohne Zeilen', () => {
  const { records, errors } = parseCsv('');
  assert.deepEqual(records, []);
  assert.deepEqual(errors, []);
});

test('parseCsv liefert leere Liste für eine Datei mit nur Kopfzeile', () => {
  const { records, errors } = parseCsv('timestamp,model,input_tokens,output_tokens,cost_usd\n');
  assert.deepEqual(records, []);
  assert.deepEqual(errors, []);
});

test('parseCsv meldet Spaltenzahl-Abweichungen und fehlende Pflichtfelder, verarbeitet den Rest trotzdem', () => {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, 'mixed-errors.csv'), 'utf8');
  const { records, errors } = parseCsv(content);

  // Zeile 2 und Zeile 5 sind gültig; Zeile 3 hat zu wenige Spalten, Zeile 4 hat ein leeres model-Feld.
  assert.equal(records.length, 2);
  assert.equal(records[0].model, 'claude-sonnet-4-5');
  assert.equal(records[1].model, 'claude-haiku-4-5');

  assert.equal(errors.length, 2);
  assert.equal(errors[0].line, 3);
  assert.match(errors[0].reason, /Spaltenzahl/);
  assert.equal(errors[1].line, 4);
  assert.match(errors[1].reason, /Pflichtfeld/);
});

test('detectFormat erkennt Format über Dateiendung', () => {
  assert.equal(detectFormat('log.jsonl', ''), 'jsonl');
  assert.equal(detectFormat('log.json', ''), 'jsonl');
  assert.equal(detectFormat('log.csv', ''), 'csv');
});

test('detectFormat erkennt Format über Inhalt, wenn die Endung nicht eindeutig ist', () => {
  assert.equal(detectFormat('log.txt', '{"model": "x"}\n'), 'jsonl');
  assert.equal(detectFormat('log.txt', 'model,timestamp\nx,y\n'), 'csv');
  assert.equal(detectFormat('log.txt', ''), 'csv');
});
