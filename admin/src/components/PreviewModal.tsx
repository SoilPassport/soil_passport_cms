import { useEffect, useState } from 'react';

export default function PreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  const [w, setW] = useState<'desktop' | 'mobile'>('desktop');
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Preview">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-t-xl bg-white p-3"><h2 className="text-sm font-semibold">Preview</h2>
        <div className="flex gap-2"><button type="button" className={`btn ${w === 'desktop' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setW('desktop')}>Desktop</button><button type="button" className={`btn ${w === 'mobile' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setW('mobile')}>Phone</button><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button></div></div>
      <div className="mx-auto flex w-full max-w-6xl flex-1 justify-center overflow-auto rounded-b-xl bg-slate-200 p-3">
        <iframe title="Page preview" sandbox="" srcDoc={html} className="h-full min-h-[70vh] rounded bg-white shadow" style={{ width: w === 'mobile' ? 390 : '100%' }} /></div>
    </div>);
}
