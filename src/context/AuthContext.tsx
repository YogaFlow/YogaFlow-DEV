import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
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

  useEffect(() => {
    let isMounted = true;

    const fetchUserProfile = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (isMounted) setUserProfile(data);
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        if (session?.user) fetchUserProfile(session.user.id);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error getting session:', error);
        if (isMounted) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserProfile(session.user.id);
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
