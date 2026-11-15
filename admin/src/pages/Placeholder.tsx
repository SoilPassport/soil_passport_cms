import { ALL_ITEMS } from '../lib/nav';
import { PageHeader, Badge } from '../components/ui';
const PHASES: Record<number, string> = { 1: 'Foundation', 2: 'Core CMS', 3: 'Media and Documents', 4: 'Business Modules', 5: 'Integrations', 6: 'Security and Deployment' };
export default function Placeholder({ itemKey }: { itemKey: string }) {
  const item = ALL_ITEMS.find(i => i.key === itemKey)!;
  return <><PageHeader title={item.label} />
    <div className="card p-6"><Badge tone="amber">Not built yet</Badge>
      <p className="mt-3 text-sm text-slate-700">{item.blurb}</p>
      <p className="mt-3 text-sm text-slate-500">Scheduled for <strong>Phase {item.phase} — {PHASES[item.phase]}</strong>. The database tables and permissions for this module already exist in the Phase 1 migrations.</p></div></>;
}
