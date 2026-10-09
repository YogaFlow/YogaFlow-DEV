import { createClient } from '@supabase/supabase-js';
import { notifySessionHttp, resolveRequestUrl } from './sessionHttp';
import { markVoluntarySignOut } from './sessionRules.mjs';
import { currentTenantSlug } from './tenantSlug';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// Validate URL format
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

if (!supabaseUrl || !supabaseAnonKey || !isValidUrl(supabaseUrl)) {
  console.warn('Supabase environment variables are not properly configured. Please set up your Supabase project.');
} else {
  console.log('Supabase configured with URL:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const slug = currentTenantSlug();
      let nextInit = init;
      if (slug) {
        const headers = new Headers(init?.headers);
        headers.set('x-omlify-tenant', slug);
        nextInit = { ...init, headers };
      }
      return fetch(input, nextInit).then((response) => {
        notifySessionHttp(resolveRequestUrl(input), response);
        return response;
      });
    },
  },
});

export const signUp = async (email: string, password: string, userData: any) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData,
      emailRedirectTo: undefined
    }
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
};

export const signOut = async () => {
  markVoluntarySignOut();
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return { error };
  } catch {
    return { error: null };
  }
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};