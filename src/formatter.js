'use strict';

// Spaltenreihenfolge für alle drei Ausgabeformate (table/json/csv), damit
// Konsolen-Tabelle und Export dieselbe Struktur zeigen.
const COLUMNS = [
  { key: 'date', label: 'Datum', align: 'left' },
  { key: 'model', label: 'Modell', align: 'left' },
  { key: 'requests', label: 'Anfragen', align: 'right' },
  { key: 'inputTokens', label: 'Input-Tokens', align: 'right' },
  { key: 'outputTokens', label: 'Output-Tokens', align: 'right' },
  { key: 'totalTokens', label: 'Tokens gesamt', align: 'right' },
  { key: 'costUsd', label: 'Kosten (USD)', align: 'right' },
];

/**
 * Formatiert einen Kosten-Betrag für die Anzeige (4 Nachkommastellen, damit
 * auch Kleinstbeträge je Zeile noch sichtbar sind).
 *
 * @param {number} value
 * @returns {string}
 */
function formatCost(value) {
  return value.toFixed(4);
}

/**
 * Liest den Anzeigewert einer Spalte aus einer Zeile.
 *
 * @param {Object<string, *>} row
 * @param {string} key
 * @returns {string}
 */
function cellValue(row, key) {
  if (key === 'costUsd') return formatCost(row.costUsd);
  return String(row[key]);
}

/**
 * Formatiert den Report als Konsolen-Tabelle: fest ausgerichtete Spalten,
 * keine externe Tabellen-Bibliothek nötig.
 *
 * @param {{rows: Array, totals: Object}} report
 * @returns {string}
 */
function formatTable(report) {
  const { rows, totals } = report;

  if (rows.length === 0) {
    return 'Keine Nutzungsdaten gefunden.';
  }

  const totalsRow = { date: '', model: 'GESAMT', ...totals };

  const widths = COLUMNS.map((col) =>
    Math.max(col.label.length, ...rows.map((row) => cellValue(row, col.key).length), cellValue(totalsRow, col.key).length),
  );

  const pad = (text, width, align) => (align === 'right' ? text.padStart(width) : text.padEnd(width));

  const headerLine = COLUMNS.map((col, i) => pad(col.label, widths[i], col.align)).join('  ');
  const separatorLine = widths.map((w) => '-'.repeat(w)).join('  ');
  const rowLines = rows.map((row) => COLUMNS.map((col, i) => pad(cellValue(row, col.key), widths[i], col.align)).join('  '));
  const totalsLine = COLUMNS.map((col, i) => pad(cellValue(totalsRow, col.key), widths[i], col.align)).join('  ');

  return [headerLine, separatorLine, ...rowLines, separatorLine, totalsLine].join('\n');
}

/**
 * Formatiert den Report als JSON (Zeilen + Summen) für den Export.
 *
 * @param {{rows: Array, totals: Object}} report
 * @returns {string}
 */
function formatJson(report) {
  return JSON.stringify(
    {
      rows: report.rows.map((row) => ({ ...row, costUsd: Number(row.costUsd.toFixed(6)) })),
      totals: { ...report.totals, costUsd: Number(report.totals.costUsd.toFixed(6)) },
    },
    null,
    2,
  );
}

/**
 * Formatiert den Report als CSV (Kopfzeile + Zeilen + abschließende
 * GESAMT-Zeile) für den Export.
 *
 * @param {{rows: Array, totals: Object}} report
 * @returns {string}
 */
function formatCsv(report) {
  const header = COLUMNS.map((col) => col.label).join(',');
  const totalsRow = { date: '', model: 'GESAMT', ...report.totals };
  const lines = report.rows.map((row) => COLUMNS.map((col) => cellValue(row, col.key)).join(','));
  const totalsLine = COLUMNS.map((col) => cellValue(totalsRow, col.key)).join(',');
  return [header, ...lines, totalsLine].join('\n');
}

module.exports = { formatTable, formatJson, formatCsv, COLUMNS };
