import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: SupabaseUser | null;
  userProfile: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, userData: any) => Promise<any>;
  signOut: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  isCourseLeader: boolean;
  isParticipant: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
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
        if (isMounted) {
          setUserProfile(data);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserProfile(session.user.id);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error getting session:', error);
        if (isMounted) {
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
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
    // Check if Supabase is properly configured
    if (!import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL.includes('placeholder')) {
      return { 
        data: null, 
        error: { message: 'Supabase ist nicht konfiguriert. Bitte richten Sie Ihre Supabase-Verbindung ein.' } 
      };
    }

    console.log('Attempting sign in with:', { 
      email, 
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY 
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Sign in error:', error);
      if (error.message === 'Invalid login credentials') {
        return {
          data,
          error: { 
            ...error, 
            message: 'E-Mail oder Passwort ist falsch. Stellen Sie sicher, dass Sie registriert sind und die korrekten Anmeldedaten verwenden.' 
          }
        };
      }
    }

    return { data, error };
  };

  const signUp = async (email: string, password: string, userData: any) => {
    // Check if Supabase is properly configured
    if (!import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL.includes('placeholder')) {
      return {
        data: null,
        error: { message: 'Supabase ist nicht konfiguriert. Bitte richten Sie Ihre Supabase-Verbindung ein.' }
      };
    }

    console.log('Signing up with userData:', userData);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
        emailRedirectTo: undefined
      }
    });

    if (error) {
      console.error('Sign up error:', error);
    } else {
      console.log('Sign up successful:', data);
    }

    // Das Benutzerprofil wird automatisch durch den Datenbank-Trigger erstellt

    return { data, error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error during sign out:', error);
    } finally {
      setUser(null);
      setUserProfile(null);
    }
  };

  const hasRole = (role: UserRole): boolean => {
    if (!userProfile?.roles) return false;
    return userProfile.roles.includes(role);
  };

  const isAdmin = useMemo(() => {
    if (!userProfile?.roles) return false;
    return userProfile.roles.includes('admin');
  }, [userProfile]);

  const isCourseLeader = useMemo(() => {
    if (!userProfile?.roles) return false;
    return userProfile.roles.includes('course_leader');
  }, [userProfile]);

  const isParticipant = useMemo(() => {
    if (!userProfile?.roles) return false;
    return userProfile.roles.includes('participant');
  }, [userProfile]);

  const value = {
    user,
    userProfile,
    loading,
    signIn,
    signUp,
    signOut,
    hasRole,
    isAdmin,
    isCourseLeader,
    isParticipant
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};