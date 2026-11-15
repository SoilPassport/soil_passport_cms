import { useState } from 'react';
import MediaPicker from './MediaPicker';

export default function ImageField({ id, label, value, onChange, disabled, hint }: { id: string; label: string; value: string; onChange: (v: string, alt?: string) => void; disabled?: boolean; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div><label className="label" htmlFor={id}>{label}</label>
      <div className="flex gap-2"><input id={id} className="input" type="url" placeholder="https://…" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />
        {!disabled && <button type="button" className="btn btn-ghost shrink-0" onClick={() => setOpen(true)}>Choose</button>}</div>
      {value && <div className="mt-2 flex items-center gap-3"><img src={value} alt="" className="h-16 w-24 rounded border border-slate-200 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />{!disabled && <button type="button" className="text-xs underline" onClick={() => onChange('')}>Remove</button>}</div>}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {open && <MediaPicker kinds={['image']} onClose={() => setOpen(false)} onPick={([a]) => { onChange(a.public_url ?? '', a.alt_text ?? ''); setOpen(false); }} />}
    </div>);
}
