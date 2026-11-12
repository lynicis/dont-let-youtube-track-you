/**
 * Escape a value for inclusion in a CSV field (RFC 4180).
 * A leading =, +, -, @, tab or CR is prefixed with ' to prevent formula
 * injection when the file is opened in a spreadsheet.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
