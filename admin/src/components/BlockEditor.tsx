import { BLOCKS, type Block, type BlockType, type Field } from '../lib/blocks';
import { useState } from 'react';
import ImageField from './ImageField';

type Obj = Record<string, unknown>;
function Inp({ f, v, on, id, disabled }: { f: Field; v: string; on: (s: string) => void; id: string; disabled: boolean }) {
  if (f.k === 'image_url') return <ImageField id={id} label={f.l} value={v} disabled={disabled} onChange={x => on(x)} />;
  return <div><label className="label" htmlFor={id}>{f.l}</label>{f.area ? <textarea id={id} className="input" rows={3} value={v} disabled={disabled} onChange={e => on(e.target.value)} /> : <input id={id} className="input" value={v} disabled={disabled} onChange={e => on(e.target.value)} />}{f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}</div>;
}

export default function BlockEditor({ blocks, onChange, disabled }: { blocks: Block[]; onChange: (b: Block[]) => void; disabled: boolean }) {
  const [add, setAdd] = useState<BlockType>('text');
  const upd = (i: number, patch: Obj) => onChange(blocks.map((b, j) => j === i ? { ...b, ...patch } as Block : b));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= blocks.length) return; const c = [...blocks]; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  return (
    <div className="space-y-3">
      {blocks.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">This page has no sections yet. Add one below.</p>}
      {blocks.map((b, i) => { const def = BLOCKS[b.type]; if (!def) return null; const items = (b[def.items?.key ?? ''] as Obj[] | undefined) ?? []; return (
        <fieldset key={i} className="card p-4"><legend className="sr-only">{def.label} {i + 1}</legend>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{i + 1}. {def.label}</h3>
            {!disabled && <div className="flex gap-1"><button type="button" className="btn btn-ghost py-0.5 text-xs" aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button type="button" className="btn btn-ghost py-0.5 text-xs" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="btn btn-ghost py-0.5 text-xs" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Remove</button></div>}</div>
          <div className="space-y-3">{def.fields.map(f => <Inp key={f.k} id={`b${i}-${f.k}`} f={f} v={String(b[f.k] ?? '')} disabled={disabled} on={s => upd(i, { [f.k]: s })} />)}
            {def.items && <div className="space-y-3 border-t border-slate-100 pt-3">{items.map((it, n) => <div key={n} className="rounded-lg bg-slate-50 p-3"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{def.items!.label} {n + 1}</span>{!disabled && <button type="button" className="underline" onClick={() => upd(i, { [def.items!.key]: items.filter((_, m) => m !== n) })}>Remove</button>}</div>
              <div className="space-y-2">{def.items!.fields.map(f => <Inp key={f.k} id={`b${i}-i${n}-${f.k}`} f={f} v={String(it[f.k] ?? '')} disabled={disabled} on={s => upd(i, { [def.items!.key]: items.map((x, m) => m === n ? { ...x, [f.k]: s } : x) })} />)}</div></div>)}
              {!disabled && <button type="button" className="btn btn-ghost text-xs" onClick={() => upd(i, { [def.items!.key]: [...items, {}] })}>+ Add {def.items.label.toLowerCase()}</button>}</div>}
          </div></fieldset>); })}
      {!disabled && <div className="flex flex-wrap items-end gap-2"><div><label className="label" htmlFor="add-block">Add section</label><select id="add-block" className="input" value={add} onChange={e => setAdd(e.target.value as BlockType)}>{(Object.keys(BLOCKS) as BlockType[]).map(k => <option key={k} value={k}>{BLOCKS[k].label}</option>)}</select></div>
        <button type="button" className="btn btn-ghost" onClick={() => onChange([...blocks, { type: add }])}>Add</button></div>}
    </div>);
}
