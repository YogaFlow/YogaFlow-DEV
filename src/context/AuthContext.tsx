import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { User as SupabaseUser, type Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';
import { clearDevTenantSlug } from './TenantContext';

interface AuthContextType {
  user: SupabaseUser | null;
  userProfile: User | null;
  /** true nur während des ersten Session-Checks (INITIAL_SESSION noch nicht empfangen).
   *  Typischerweise < 2 s. Blockiert AuthPage, bis wir wissen ob eine Session existiert. */
  loading: boolean;
  /** true während das Profil aus public.users geladen wird (kann bei pausiertem Supabase-Projekt
   *  länger dauern). Trennung von `loading` verhindert ewige Spinner auf dem Login-Screen. */
  profileLoading: boolean;
  /** Nur true wenn E-Mail bestätigt — verhindert Dashboard-Flash nach Registrierung. */
  isEmailConfirmed: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, userData: any) => Promise<any>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: { message: string } | null }>;
  hasRole: (role: UserRole) => boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isCourseLeader: boolean;
  isParticipant: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const PROFILE_FETCH_ATTEMPTS = 3;
const PROFILE_FETCH_MS = 15_000;
/** Maximale Wartezeit auf INITIAL_SESSION. Feuert es nicht (Supabase pausiert / stale Token),
 *  werden lokale Session-Token gelöscht und loading=false gesetzt → Login-Formular erscheint. */
const INITIAL_SESSION_TIMEOUT_MS = 8_000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/**
 * Prüft synchron, ob eine Supabase-Session im localStorage liegt.
 * Keine Session → loading sofort false → Login-Formular erscheint sofort.
 * Session vorhanden → loading=true, Safety-Timer greift nach 8 s falls nötig.
 */
function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => {
      if (!k.startsWith('sb-')) return false;
      const val = localStorage.getItem(k);
      if (!val) return false;
      try {
        const parsed = JSON.parse(val);
        return parsed != null && typeof parsed === 'object' && 'access_token' in parsed;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  /** Nur true bis INITIAL_SESSION empfangen wurde (i.d.R. < 2 s). */
  const [loading, setLoading] = useState(() => hasStoredSession());
  /** Separater Lade-Zustand für den DB-Fetch aus public.users. */
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchUserProfile = useCallback(async (userId: string, signal: AbortSignal) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .abortSignal(signal)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }, []);

  useEffect(() => {
    let isMounted = true;
    let initialSessionReceived = false;
    const profileLoadGenerationRef = { current: 0 };

    // Safety: INITIAL_SESSION feuert nicht → stale Token. Löschen + loading freigeben.
    const safetyTimer = window.setTimeout(() => {
      if (initialSessionReceived || !isMounted) return;
      console.warn('Auth: INITIAL_SESSION nicht empfangen nach 8 s — lösche lokale Session-Token.');
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('sb-'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      profileLoadGenerationRef.current += 1;
      if (isMounted) {
        setUser(null);
        setUserProfile(null);
        setProfileLoading(false);
        setLoading(false);
      }
    }, INITIAL_SESSION_TIMEOUT_MS);

    const loadProfileWithRetries = async (userId: string, generation: number): Promise<void> => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < PROFILE_FETCH_ATTEMPTS; attempt++) {
        if (!isMounted || profileLoadGenerationRef.current !== generation) return;
        const attemptAc = new AbortController();
        const timer = window.setTimeout(() => attemptAc.abort(), PROFILE_FETCH_MS);
        try {
          const profile = await fetchUserProfile(userId, attemptAc.signal);
          window.clearTimeout(timer);
          if (!isMounted || profileLoadGenerationRef.current !== generation) return;
          setUserProfile(profile);
          return;
        } catch (e) {
          window.clearTimeout(timer);
          if (!isMounted || profileLoadGenerationRef.current !== generation) return;
          const timedOut = attemptAc.signal.aborted && isAbortError(e);
          lastErr = timedOut ? new Error('profileFetch_timeout') : e;
          if (attempt < PROFILE_FETCH_ATTEMPTS - 1) {
            console.warn(
              `Auth: Profil-Laden Versuch ${attempt + 1}/${PROFILE_FETCH_ATTEMPTS} fehlgeschlagen — erneuter Versuch.`,
              lastErr,
            );
            await delay(800 * (attempt + 1));
          }
        }
      }
      console.error('Auth: Profil nach allen Versuchen nicht ladbar — Session bleibt erhalten.', lastErr);
      if (isMounted && profileLoadGenerationRef.current === generation) setUserProfile(null);
    };

    /**
     * Startet den Profil-Fetch im Hintergrund (fire-and-forget).
     * `loading` wird NICHT gesetzt — nur `profileLoading`.
     * So kann der Login-Screen sofort angezeigt werden, während das Profil lädt.
     */
    const startProfileLoad = (userId: string) => {
      setProfileLoading(true);
      profileLoadGenerationRef.current += 1;
      const generation = profileLoadGenerationRef.current;
      void loadProfileWithRetries(userId, generation).then(() => {
        if (isMounted && profileLoadGenerationRef.current === generation) {
          setProfileLoading(false);
        }
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;

        if (event === 'INITIAL_SESSION') {
          initialSessionReceived = true;
          window.clearTimeout(safetyTimer);
          // Session-Zustand sofort setzen, loading sofort freigeben.
          // Profil lädt im Hintergrund via profileLoading.
          setUser(session?.user ?? null);
          if (session?.user) {
            startProfileLoad(session.user.id);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null);
          return;
        }

        if (event === 'SIGNED_OUT') {
          profileLoadGenerationRef.current += 1;
          setUser(null);
          setUserProfile(null);
          setProfileLoading(false);
          setLoading(false);
          return;
        }

        // SIGNED_IN, USER_UPDATED, PASSWORD_RECOVERY, etc.
        setUser(session?.user ?? null);
        if (session?.user) {
          startProfileLoad(session.user.id);
        } else {
          profileLoadGenerationRef.current += 1;
          setUserProfile(null);
          setProfileLoading(false);
        }
      },
    );

    return () => {
      isMounted = false;
      window.clearTimeout(safetyTimer);
      profileLoadGenerationRef.current += 1;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error?.message === 'Invalid login credentials') {
      return {
        data,
        error: {
          ...error,
          message: 'E-Mail oder Passwort ist falsch.'
        }
      };
    }
    return { data, error };
  };

  const signUp = async (email: string, password: string, userData: any) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: userData }
    });
    return { data, error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      clearDevTenantSlug();
      setUser(null);
      setUserProfile(null);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) {
      return { error: { message: 'Benutzer nicht gefunden. Bitte erneut anmelden.' } };
    }
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });
    if (reAuthError) {
      return { error: { message: reAuthError.message === 'Invalid login credentials'
        ? 'Aktuelles Passwort ist falsch.'
        : 'Aktuelles Passwort konnte nicht verifiziert werden.' }
      };
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      return { error: { message: updateError.message.toLowerCase().includes('same password')
        ? 'Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.'
        : 'Passwort konnte nicht geändert werden.' }
      };
    }
    return { error: null };
  };

  const hasRole = (role: UserRole): boolean => userProfile?.role === role;

  const isOwner        = useMemo(() => userProfile?.role === 'owner',                                   [userProfile]);
  const isAdmin        = useMemo(() => userProfile?.role === 'owner' || userProfile?.role === 'admin',   [userProfile]);
  const isCourseLeader = useMemo(() => ['owner', 'admin', 'teacher'].includes(userProfile?.role ?? ''), [userProfile]);
  const isParticipant  = useMemo(() => userProfile?.role === 'user',                                    [userProfile]);

  const isEmailConfirmed = useMemo(() => {
    if (!user) return false;
    const authConfirmed = !!(user as { email_confirmed_at?: string | null }).email_confirmed_at;
    const appConfirmed = userProfile?.email_verified === true;
    return authConfirmed || appConfirmed;
  }, [user, userProfile]);

  const value: AuthContextType = {
    user, userProfile, loading, profileLoading, isEmailConfirmed,
    signIn, signUp, signOut, changePassword,
    hasRole, isOwner, isAdmin, isCourseLeader, isParticipant,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
