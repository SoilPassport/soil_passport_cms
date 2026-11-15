import type { ReactNode } from 'react';
export const Spinner = () => <div className="flex justify-center p-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" role="status" aria-label="Loading" /></div>;
export const PageHeader = ({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold">{title}</h1>{sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}</div>{actions}</div>);
export const Empty = ({ children }: { children: ReactNode }) => <div className="p-10 text-center text-sm text-slate-500">{children}</div>;
export const ErrorBox = ({ msg }: { msg: string }) => <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{msg}</div>;
export const Badge = ({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) => {
  const t = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700' }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>; };
export const Field = ({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) => (
  <div><label className="label" htmlFor={htmlFor}>{label}</label>{children}{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>);
export const Toast = ({ msg }: { msg: string }) => msg ? <div role="status" className="fixed bottom-4 right-4 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{msg}</div> : null;
