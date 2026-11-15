import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { ALL_ITEMS } from './lib/nav';
import Layout, { Shell } from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Mfa from './pages/Mfa';
import Account, { SetPassword } from './pages/Account';
import { AccessPending, SetupRequired } from './pages/Notices';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Audit from './pages/Audit';
import Placeholder from './pages/Placeholder';
import Articles from './pages/Articles';
import ArticleEdit from './pages/ArticleEdit';
import Categories from './pages/Categories';
import Pages from './pages/Pages';
import PageEdit from './pages/PageEdit';
import Events from './pages/Events';
import EventEdit from './pages/EventEdit';
import Settings from './pages/Settings';
import Media from './pages/Media';
import Gallery from './pages/Gallery';
import GalleryEdit from './pages/GalleryEdit';
import Videos from './pages/Videos';
import Documents from './pages/Documents';
import Enquiries from './pages/Enquiries';
import Newsletter from './pages/Newsletter';
import Roadmap from './pages/Roadmap';
import Crm from './pages/Crm';
import Email from './pages/Email';
import Seo from './pages/Seo';
import Vouchers from './pages/Vouchers';
import IntegrationSettings from './pages/IntegrationSettings';
import Campaigns from './pages/Campaigns';
import Reports from './pages/Reports';
import System from './pages/System';
import Storage from './pages/Storage';
import DocumentEdit from './pages/DocumentEdit';

const BUILT: Record<string, JSX.Element> = { vouchers: <Vouchers />, config: <IntegrationSettings />, seo: <Seo />, reports: <Reports />, system: <System />, storage: <Storage />, dashboard: <Dashboard />, users: <Users />, roles: <Roles />, audit: <Audit />, pages: <Pages />, articles: <Articles />, events: <Events />, settings: <Settings />, media: <Media />, gallery: <Gallery />, video: <Videos />, documents: <Documents />, roadmap: <Roadmap />, investment: <Enquiries kind="investment" />, partnerships: <Enquiries kind="partnership" />, contact: <Enquiries kind="contact" />, newsletter: <Newsletter />, crm: <Crm />, email: <Email /> };

function Guarded() {
  const a = useAuth();
  if (a.loading) return <Spinner />;
  if (!a.session) return <Shell><Login /></Shell>;
  if (a.recovery) return <Shell><SetPassword /></Shell>;
  if (a.profile?.status !== 'active' || a.roles.length === 0) return <Shell><AccessPending /></Shell>;
  if (a.mfaRequired && a.aal !== 'aal2') return <Shell><Mfa /></Shell>;
  return (
    <Routes>
      <Route element={<Layout />}>
        {ALL_ITEMS.map(i => <Route key={i.key} path={i.path} element={!i.perm || a.can(i.perm) ? (BUILT[i.key] ?? <Placeholder itemKey={i.key} />) : <Navigate to="/" replace />} />)}
        {a.can('pages.edit') && <><Route path="/pages/new" element={<PageEdit />} /><Route path="/pages/:id" element={<PageEdit />} /></>}
        {a.can('articles.edit') && <><Route path="/articles/new" element={<ArticleEdit />} /><Route path="/articles/categories" element={<Categories />} /><Route path="/articles/:id" element={<ArticleEdit />} /></>}
        {a.can('events.edit') && <><Route path="/events/new" element={<EventEdit />} /><Route path="/events/:id" element={<EventEdit />} /></>}
        {a.can('newsletter.view') && <Route path="/newsletter/campaigns" element={<Campaigns />} />}
        {a.can('gallery.edit') && <><Route path="/gallery/new" element={<GalleryEdit />} /></>}
        {a.can('gallery.view') && <Route path="/gallery/:id" element={<GalleryEdit />} />}
        {a.can('documents.edit') && <Route path="/documents/new" element={<DocumentEdit />} />}
        {a.can('documents.view') && <Route path="/documents/:id" element={<DocumentEdit />} />}
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>);
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isConfigured ? <BrowserRouter><AuthProvider><Guarded /></AuthProvider></BrowserRouter> : <SetupRequired />}</React.StrictMode>);
