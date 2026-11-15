import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { ALL_ITEMS } from './lib/nav';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Mfa from './pages/Mfa';
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
import DocumentEdit from './pages/DocumentEdit';

const BUILT: Record<string, JSX.Element> = { dashboard: <Dashboard />, users: <Users />, roles: <Roles />, audit: <Audit />, pages: <Pages />, articles: <Articles />, events: <Events />, settings: <Settings />, media: <Media />, gallery: <Gallery />, video: <Videos />, documents: <Documents /> };

function Guarded() {
  const a = useAuth();
  if (a.loading) return <Spinner />;
  if (!a.session) return <Login />;
  if (a.profile?.status !== 'active' || a.roles.length === 0) return <AccessPending />;
  if (a.mfaRequired && a.aal !== 'aal2') return <Mfa />;
  return (
    <Routes>
      <Route element={<Layout />}>
        {ALL_ITEMS.map(i => <Route key={i.key} path={i.path} element={!i.perm || a.can(i.perm) ? (BUILT[i.key] ?? <Placeholder itemKey={i.key} />) : <Navigate to="/" replace />} />)}
        {a.can('pages.edit') && <><Route path="/pages/new" element={<PageEdit />} /><Route path="/pages/:id" element={<PageEdit />} /></>}
        {a.can('articles.edit') && <><Route path="/articles/new" element={<ArticleEdit />} /><Route path="/articles/categories" element={<Categories />} /><Route path="/articles/:id" element={<ArticleEdit />} /></>}
        {a.can('events.edit') && <><Route path="/events/new" element={<EventEdit />} /><Route path="/events/:id" element={<EventEdit />} /></>}
        {a.can('gallery.edit') && <><Route path="/gallery/new" element={<GalleryEdit />} /></>}
        {a.can('gallery.view') && <Route path="/gallery/:id" element={<GalleryEdit />} />}
        {a.can('documents.edit') && <Route path="/documents/new" element={<DocumentEdit />} />}
        {a.can('documents.view') && <Route path="/documents/:id" element={<DocumentEdit />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>);
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isConfigured ? <BrowserRouter><AuthProvider><Guarded /></AuthProvider></BrowserRouter> : <SetupRequired />}</React.StrictMode>);
