import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface Profile { id: string; email: string; full_name: string | null; status: 'active' | 'suspended' | 'invited'; }
export interface RoleInfo { key: string; name: string; requires_mfa: boolean; }
interface AuthState {
  loading: boolean; session: Session | null; profile: Profile | null; roles: RoleInfo[]; permissions: Set<string>;
  aal: 'aal1' | 'aal2' | null; mfaRequired: boolean; mfaEnrolled: boolean;
  can: (perm: string) => boolean; refresh: () => Promise<void>; signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('AuthProvider missing'); return c; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setProfile(null); setRoles([]); setPermissions(new Set()); setAal(null); setLoading(false); return; }
    const [{ data: p }, { data: ur }, { data: lvl }, { data: factors }] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name,status').eq('id', s.user.id).maybeSingle(),
      supabase.from('user_roles').select('roles(id,key,name,requires_mfa)').eq('user_id', s.user.id),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    setProfile((p as Profile) ?? null);
    const rs = ((ur ?? []) as unknown as { roles: (RoleInfo & { id: string }) | null }[]).map(r => r.roles).filter(Boolean) as (RoleInfo & { id: string })[];
    setRoles(rs);
    setAal((lvl?.currentLevel as 'aal1' | 'aal2') ?? null);
    setMfaEnrolled((factors?.totp ?? []).some(f => f.status === 'verified'));
    if (rs.length) {
      const { data: rp } = await supabase.from('role_permissions').select('permissions(key)').in('role_id', rs.map(r => r.id));
      setPermissions(new Set(((rp ?? []) as unknown as { permissions: { key: string } | null }[]).map(x => x.permissions?.key).filter(Boolean) as string[]));
    } else setPermissions(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void load(s); });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<AuthState>(() => {
    const isSuper = roles.some(r => r.key === 'super_admin');
    const active = profile?.status === 'active';
    const mfaRequired = roles.some(r => r.requires_mfa);
    // UI convenience only. Real enforcement is Row Level Security in the database.
    const can = (perm: string) => active && (isSuper || permissions.has(perm));
    return {
      loading, session, profile, roles, permissions, aal, mfaRequired, mfaEnrolled, can,
      refresh: async () => { const { data } = await supabase.auth.getSession(); await load(data.session); },
      signOut: async () => { await supabase.auth.signOut(); },
    };
  }, [loading, session, profile, roles, permissions, aal, mfaEnrolled, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
