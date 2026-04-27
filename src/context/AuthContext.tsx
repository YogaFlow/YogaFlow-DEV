import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { User as SupabaseUser, type Session, type AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';
import { clearDevTenantSlug } from './TenantContext';

interface AuthContextType {
  user: SupabaseUser | null;
  userProfile: User | null;
  loading: boolean;
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

/**
 * Profil-Laden darf bei kaltem Edge / Supabase mehrere Versuche brauchen.
 * Wichtig: Bei Timeout oder Fehler niemals signOut — sonst wirkt langsames Netz wie „ausgeloggt“
 * und triggert erneut Auth + weitere parallele Requests (siehe applySession_timeout-Schleifen).
 */
const PROFILE_FETCH_ATTEMPTS = 3;
const PROFILE_FETCH_MS = 15_000;
/** Max. Wartezeit auf das erste INITIAL_SESSION-Event. Kommt es nicht (Supabase pausiert /
 *  abgelaufenes Token → endloser Refresh-Loop), löschen wir die lokalen Token und zeigen dem
 *  User die Login-Maske statt eines ewigen Spinners. */
const INITIAL_SESSION_TIMEOUT_MS = 8_000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/**
 * Prüft synchron (kein Netzwerk), ob der Supabase-Client eine gespeicherte Session im
 * localStorage hat. Gibt es keine → loading sofort false → Login-Formular erscheint
 * sofort, ohne auf INITIAL_SESSION zu warten. Gibt es eine (möglicherweise abgelaufen) →
 * loading bleibt true und der Safety-Timer greift nach 8 s.
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
  /**
   * Ohne gespeicherte Session: sofort false → Login-Formular erscheint ohne Verzögerung.
   * Mit gespeicherter Session: true → warten auf INITIAL_SESSION (oder Safety-Timer nach 8 s).
   */
  const [loading, setLoading] = useState(() => hasStoredSession());

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
    /** Erhöht bei jedem neuen applySession / Logout / Unmount — ältere Profil-Ladevorgänge schreiben keinen State mehr. */
    const profileLoadGenerationRef = { current: 0 };

    // Safety: wenn INITIAL_SESSION nicht innerhalb von 8 s feuert (Supabase-Projekt pausiert
    // oder abgelaufenes Token → endloser interner Refresh-Loop), löschen wir die lokalen
    // Supabase-Token aus localStorage und setzen loading=false. Der User sieht die Login-Maske
    // und kann sich neu anmelden — das Login-Request weckt das Projekt auf.
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
        setLoading(false);
      }
    }, INITIAL_SESSION_TIMEOUT_MS);

    /** Lädt public.users mit Retries; bei Misserfolg: Session bleibt, Profil null (Redirect zu profile_missing möglich). */
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

    const applySession = async (session: Session | null) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        profileLoadGenerationRef.current += 1;
        if (isMounted) setUserProfile(null);
        return;
      }
      profileLoadGenerationRef.current += 1;
      const generation = profileLoadGenerationRef.current;
      await loadProfileWithRetries(session.user.id, generation);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;

        if (event === 'INITIAL_SESSION') {
          initialSessionReceived = true;
          window.clearTimeout(safetyTimer);
          setLoading(true);
          try {
            await applySession(session);
          } catch (error) {
            console.error('Auth: INITIAL_SESSION / applySession', error);
            if (isMounted) {
              setUser(session?.user ?? null);
              setUserProfile(null);
            }
          } finally {
            if (isMounted) setLoading(false);
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          await applySession(session);
        } catch (err) {
          console.error('onAuthStateChange:', err);
          if (isMounted) {
            setUser(session?.user ?? null);
            setUserProfile(null);
          }
        } finally {
          if (isMounted) setLoading(false);
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

  const isOwner       = useMemo(() => userProfile?.role === 'owner',                              [userProfile]);
  const isAdmin       = useMemo(() => userProfile?.role === 'owner' || userProfile?.role === 'admin', [userProfile]);
  const isCourseLeader = useMemo(() => ['owner', 'admin', 'teacher'].includes(userProfile?.role ?? ''), [userProfile]);
  const isParticipant = useMemo(() => userProfile?.role === 'user',                               [userProfile]);

  const isEmailConfirmed = useMemo(() => {
    if (!user) return false;
    const authConfirmed = !!(user as { email_confirmed_at?: string | null }).email_confirmed_at;
    const appConfirmed = userProfile?.email_verified === true;
    return authConfirmed || appConfirmed;
  }, [user, userProfile]);

  const value: AuthContextType = {
    user, userProfile, loading, isEmailConfirmed,
    signIn, signUp, signOut, changePassword,
    hasRole, isOwner, isAdmin, isCourseLeader, isParticipant
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
