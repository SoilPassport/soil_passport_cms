import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV, type NavItem } from '../lib/nav';
import { useAuth } from '../lib/auth';
import '../siteChrome.css';
import { SITE_FOOTER, SITE_HEADER } from './siteChrome.generated';

const onPath = (pathname: string, p: string) => p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/');
const itemActive = (pathname: string, i: NavItem) => onPath(pathname, i.path) || (i.children ?? []).some(c => onPath(pathname, c.path));

/** The soilpassport.com footer, copied from the website at build time. */
export function SiteFooter() {
  return <div className="spweb" dangerouslySetInnerHTML={{ __html: SITE_FOOTER }} />;
}

/** The soilpassport.com header (menus work like the website's). Used before sign-in. */
function SiteHeader() {
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const burger = t.closest('.hamburger');
    if (burger) { e.currentTarget.querySelector('.navlinks')?.classList.toggle('open'); return; }
    const tog = t.closest('.nav-dropdown-toggle');
    if (tog) e.currentTarget.querySelectorAll('.nav-dropdown').forEach(d => { if (d.contains(tog)) d.classList.toggle('open'); else d.classList.remove('open'); });
  };
  return <div className="spweb" onClick={click} dangerouslySetInnerHTML={{ __html: SITE_HEADER }} />;
}

/** Website header and footer around screens that have no admin menu yet (sign in, two-step, reset, notices). */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

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
            <NavLink to="/account" title="My account and password" className="hidden text-right xl:block"><div className="font-medium leading-tight">{profile?.full_name || profile?.email}</div><div className="text-xs opacity-70">{roles.map(r => r.name).join(', ') || 'No role'}</div></NavLink>
            <NavLink to="/account" className="sp-tab hidden lg:inline-flex xl:hidden" style={{ padding: '0 .6rem' }}>Account</NavLink>
            <button className="sp-gold" onClick={() => void signOut()}>Sign out</button>
            <button className="rounded border border-white/20 px-2.5 py-1.5 lg:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>{menu ? '✕' : '☰'}</button>
          </div>
        </div>
        {menu && <nav aria-label="Mobile" className="max-h-[75vh] overflow-y-auto border-t border-white/10 px-4 pb-4 lg:hidden">
          <div className="sp-mobile mt-3"><NavLink to="/account" onClick={() => setMenu(false)}>My account &amp; password</NavLink></div>
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

      <SiteFooter />
    </div>);
}
