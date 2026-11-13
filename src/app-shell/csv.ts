/** CSV compatible con Excel en español: separador «;», BOM UTF-8 y comillas cuando hace falta. */
const cell = (value: string) => /[";\r\n]/.test(value) || /^\s|\s$/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
// Un texto que empieza por = + - @ podría interpretarse como fórmula al abrirlo en una hoja de cálculo: se neutraliza.
const safe = (value: string) => /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
export function toCsv(header: string[], rows: string[][]): string {
  return '﻿' + [header, ...rows].map(row => row.map(value => cell(safe(value ?? ''))).join(';')).join('\r\n') + '\r\n';
}
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
