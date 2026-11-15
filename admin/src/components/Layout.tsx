import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV, type NavItem } from '../lib/nav';
import { useAuth } from '../lib/auth';

const SITE = 'https://soilpassport.com';
const onPath = (pathname: string, p: string) => p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/');
const itemActive = (pathname: string, i: NavItem) => onPath(pathname, i.path) || (i.children ?? []).some(c => onPath(pathname, c.path));

export default function Layout() {
  const { can, profile, roles, signOut } = useAuth();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  const groups = NAV.map(g => ({ ...g, items: g.items.filter(i => !i.perm || can(i.perm)) })).filter(g => g.items.length);
  const found = groups.findIndex(g => g.items.some(i => itemActive(loc.pathname, i)));
  const current = groups[found >= 0 ? found : 0];
  const showSide = !!current && (current.items.length > 1 || (current.items[0].children ?? []).length > 0);

  const links = (g: typeof groups[number], closeOnClick = false) => g.items.map(i => {
    const kids = (i.children ?? []).filter(c => !c.perm || can(c.perm));
    const mark = !i.built ? <span className="float-right text-[10px] opacity-60">soon</span> : null;
    return <div key={i.key}>
      <NavLink to={i.path} end={i.path === '/' || kids.length > 0} onClick={() => closeOnClick && setMenu(false)} className={({ isActive }) => (isActive || (kids.length > 0 && itemActive(loc.pathname, i) && !kids.some(c => onPath(loc.pathname, c.path))) ? 'active' : '')}>{i.label}{mark}</NavLink>
      {kids.map(c => <NavLink key={c.path} to={c.path} end onClick={() => closeOnClick && setMenu(false)} className={({ isActive }) => 'sub ' + (isActive ? 'active' : '')}>{c.label}</NavLink>)}
    </div>;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sp-header">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 lg:px-7">
          <NavLink to="/" className="sp-brand py-3"><img src="/logo.png" alt="" />Soil Passport™ <span className="hidden text-xs opacity-70 sm:inline">Admin</span></NavLink>
          <nav aria-label="Main" className="hidden items-stretch lg:flex">
            {groups.map(g => <NavLink key={g.label} to={g.items[0].path} className={() => 'sp-tab ' + (g === current ? 'active' : '')} aria-current={g === current ? 'page' : undefined}>{g.label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right xl:block"><div className="font-medium leading-tight">{profile?.full_name || profile?.email}</div><div className="text-xs opacity-70">{roles.map(r => r.name).join(', ') || 'No role'}</div></div>
            <button className="sp-gold" onClick={() => void signOut()}>Sign out</button>
            <button className="rounded border border-white/20 px-2.5 py-1.5 lg:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>{menu ? '✕' : '☰'}</button>
          </div>
        </div>
        {menu && <nav aria-label="Mobile" className="max-h-[75vh] overflow-y-auto border-t border-white/10 px-4 pb-4 lg:hidden">
          {groups.map(g => <div key={g.label} className="sp-mobile mt-3">
            <div className="px-2 py-1 text-[11px] uppercase tracking-widest" style={{ color: 'var(--gold)', fontFamily: "'IBM Plex Mono',monospace" }}>{g.label}</div>
            {links(g, true)}</div>)}
        </nav>}
      </header>

      <div className={`mx-auto flex w-full max-w-[1400px] flex-1 ${showSide ? 'lg:grid lg:grid-cols-[250px_1fr]' : ''}`}>
        {showSide && <aside className="sp-side hidden lg:block"><nav aria-label={current.label} className="sticky top-[62px] max-h-[calc(100vh-62px)] overflow-y-auto p-4">
          <div className="sp-side-title mb-3">{current.label}</div>{links(current)}</nav></aside>}
        <main className="min-w-0 flex-1 p-4 lg:p-8"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
      </div>

      <footer className="sp-footer" aria-label="Site footer">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] lg:px-7">
          <div><div className="sp-brand mb-2"><img src="/logo.png" alt="" />Soil Passport™</div><p className="max-w-[40ch] text-sm">Intelligence for soil. Technology for climate. Infrastructure for the future. Soil Passport Ltd — United Kingdom.</p></div>
          <div><h4>Website</h4><a href={SITE} target="_blank" rel="noopener noreferrer">soilpassport.com</a><a href={SITE + '/news.html'} target="_blank" rel="noopener noreferrer">News</a><a href={SITE + '/events.html'} target="_blank" rel="noopener noreferrer">Events</a><a href={SITE + '/downloads.html'} target="_blank" rel="noopener noreferrer">Downloads</a></div>
          <div><h4>Legal</h4><a href={SITE + '/privacy.html'} target="_blank" rel="noopener noreferrer">Privacy Policy</a><a href={SITE + '/terms.html'} target="_blank" rel="noopener noreferrer">Terms</a><a href={SITE + '/cookies.html'} target="_blank" rel="noopener noreferrer">Cookie Policy</a></div>
        </div>
        <div className="mx-auto max-w-[1400px] px-4 lg:px-7"><div className="bottom"><span>© {new Date().getFullYear()} Soil Passport Ltd. Staff-only administration area.</span><span>Access is logged.</span></div></div>
      </footer>
    </div>);
}
