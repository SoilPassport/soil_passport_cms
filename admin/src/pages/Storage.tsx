import { PageHeader } from '../components/ui';
import { Status } from './System';
const LIMITS_MB: Record<string, number> = { images: 10, video: 150, 'pdf and office documents': 30 };

export default function Storage() {
  return <><PageHeader title="Storage Settings" sub="Media is stored in a Cloudflare R2 bucket. Credentials live in Supabase Edge Function secrets, never in this app." />
    <h2 className="mb-2 font-medium">Connection</h2><Status only={['r2', 'cors']} />
    <h2 className="mb-2 mt-8 font-medium">Upload limits</h2>
    <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="p-3">Type</th><th className="p-3">Maximum size</th></tr></thead><tbody className="divide-y divide-slate-100">{Object.entries(LIMITS_MB).map(([k, v]) => <tr key={k}><td className="p-3 capitalize">{k}</td><td className="p-3">{String(v)} MB</td></tr>)}</tbody></table></div>
    <p className="mt-2 text-xs text-slate-500">Limits and allowed file types are enforced by the media function on the server. SVG uploads are blocked. Changing limits requires a code change and redeploy. Use a custom domain (for example media.soilpassport.com) for production instead of the r2.dev address, which is rate limited and intended for testing.</p></>;
}
