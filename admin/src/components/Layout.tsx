import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV } from '../lib/nav';
import { useAuth } from '../lib/auth';

export default function Layout() {
  const { can, profile, roles, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const groups = NAV.map(g => ({ ...g, items: g.items.filter(i => !i.perm || can(i.perm)) })).filter(g => g.items.length);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto bg-ink px-3 py-4 text-sm text-slate-300">
      <div className="mb-5 px-2"><div className="font-semibold text-white">Soil Passport™</div><div className="text-xs text-slate-400">Content administration</div></div>
      {groups.map(g => (
        <div key={g.label} className="mb-2">
          <button className="flex w-full items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
            aria-expanded={!collapsed[g.label]} onClick={() => setCollapsed(c => ({ ...c, [g.label]: !c[g.label] }))}>
            {g.label}<span aria-hidden>{collapsed[g.label] ? '▸' : '▾'}</span></button>
          {!collapsed[g.label] && g.items.map(i => {
            const kids = (i.children ?? []).filter(c => !c.perm || can(c.perm));
            if (!kids.length) return (
              <NavLink key={i.key} to={i.path} end={i.path === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center justify-between rounded-md px-2 py-1.5 ${isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}>
                <span>{i.label}</span>{!i.built && <span className="text-[10px] text-slate-500">P{i.phase}</span>}
              </NavLink>);
            const inside = loc.pathname === i.path || loc.pathname.startsWith(i.path + '/');
            const isOpen = subOpen[i.key] ?? inside;
            return (
              <div key={i.key}>
                <button aria-expanded={isOpen} onClick={() => setSubOpen(o => ({ ...o, [i.key]: !isOpen }))}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${inside ? 'text-white' : 'hover:bg-white/5'}`}>
                  <span>{i.label}</span><span aria-hidden className="text-xs text-slate-500">{isOpen ? '▾' : '▸'}</span></button>
                {isOpen && <div className="ml-3 border-l border-white/10 pl-2">{kids.map(c => (
                  <NavLink key={c.path} to={c.path} end onClick={() => setOpen(false)}
                    className={({ isActive }) => `block rounded-md px-2 py-1 text-[13px] ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>{c.label}</NavLink>))}</div>}
              </div>);
          })}
        </div>))}
    </nav>);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden lg:block lg:sticky lg:top-0 lg:h-screen">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><div className="relative h-full w-[260px]">{sidebar}</div></div>}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="btn btn-ghost lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>☰</button>
          <div className="hidden text-sm text-slate-500 lg:block">{loc.pathname === '/' ? 'Dashboard' : loc.pathname.slice(1).replace(/-/g, ' ')}</div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right"><div className="font-medium leading-tight">{profile?.full_name || profile?.email}</div><div className="text-xs text-slate-500">{roles.map(r => r.name).join(', ') || 'No role'}</div></div>
            <button className="btn btn-ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>);
}
