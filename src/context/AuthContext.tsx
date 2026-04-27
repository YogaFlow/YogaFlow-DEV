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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applySession = async (session: Session | null) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        if (isMounted) setUserProfile(null);
        return;
      }
      try {
        const profile = await fetchUserProfile(session.user.id);
        if (isMounted) setUserProfile(profile);
      } catch (error) {
        console.error('Error fetching user profile:', error);
        if (isMounted) setUserProfile(null);
      }
    };

    const init = async () => {
      setLoading(true);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.error('Error getting session:', error);
        if (!isMounted) return;
        await applySession(session ?? null);
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;

        // Gleiche Quelle wie getSession() in init() — sonst doppeltes Profil-Laden und
        // riskantes setLoading(true), das nie wieder false wird (z. B. bei Race / hängender Anfrage).
        if (event === 'INITIAL_SESSION') {
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null);
          return;
        }

        setLoading(true);
        try {
          await applySession(session);
        } catch (err) {
          console.error('onAuthStateChange:', err);
          if (isMounted) setUserProfile(null);
        } finally {
          if (isMounted) setLoading(false);
        }
      },
    );

    return () => {
      isMounted = false;
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
