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
/** Lista en texto plano para pegar en un correo o un chat: un título y una línea por registro (nombre primero, sin valores vacíos). */
export function toPlainList(title: string, rows: string[][]): string {
  const clean = (value: string) => (value ?? '').replace(/\s+/g, ' ').trim();
  const lines = rows.map(row => { const [name, ...rest] = row.map(clean); return '– ' + [name || 'Sin nombre', ...rest.filter(value => value && value !== '—')].join(' · '); });
  return [clean(title), ...(lines.length ? lines : ['Nada en esta vista.'])].join('\n') + '\n';
}
