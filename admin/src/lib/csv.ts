import { supabase } from './supabase';

// Cells that start with = + - @ are prefixed so spreadsheets do not run them as formulas.
const cell = (v: unknown) => { let s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv<T extends Record<string, unknown>>(rows: T[], cols: { key: string; label: string }[]) {
  return [cols.map(c => cell(c.label)).join(','), ...rows.map(r => cols.map(c => cell(r[c.key as keyof T])).join(','))].join('\r\n');
}
export async function downloadCsv(filename: string, csv: string, auditAction: string, count: number) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  await supabase.rpc('write_audit', { p_action: auditAction, p_entity_type: 'setting', p_entity_id: null, p_details: { rows: count, file: filename } });
}
