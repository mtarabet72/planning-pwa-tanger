import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileIncomplete: boolean;
  /** true lorsque l'utilisateur arrive via un lien "mot de passe oublié" et doit en définir un nouveau. */
  recoveryMode: boolean;
  setRecoveryMode: (v: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as Profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  async function loadProfile(userId: string) {
    const p = await fetchProfile(userId);
    setProfile(p);
  }

  useEffect(() => {
    // Un seul point d'entrée : onAuthStateChange émet INITIAL_SESSION au démarrage
    // (session existante ou null), ce qui évite le double chargement du profil
    // qu'entraînait l'appel parallèle à getSession().
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
        setSession(newSession);
        if (newSession?.user) {
          // Le rafraîchissement du jeton ne change pas le profil : inutile de le recharger.
          if (event !== 'TOKEN_REFRESHED') await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
          setRecoveryMode(false);
        }
        if (event === 'INITIAL_SESSION') setLoading(false);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: traduireErreurAuth(error.message) };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setRecoveryMode(false);
  }

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id);
  }

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    profileIncomplete: !!session && !loading && !profile,
    recoveryMode,
    setRecoveryMode,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}

function traduireErreurAuth(message: string): string {
  if (message.includes('Invalid login credentials')) return 'Identifiants incorrects.';
  if (message.includes('Email not confirmed')) return 'Adresse e-mail non confirmée.';
  return "Échec de la connexion. Vérifiez vos identifiants.";
}
