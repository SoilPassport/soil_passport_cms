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

const BUILT: Record<string, JSX.Element> = { dashboard: <Dashboard />, users: <Users />, roles: <Roles />, audit: <Audit /> };

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>);
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isConfigured ? <BrowserRouter><AuthProvider><Guarded /></AuthProvider></BrowserRouter> : <SetupRequired />}</React.StrictMode>);
