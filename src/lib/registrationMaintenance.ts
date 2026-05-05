import { supabase } from './supabase';

let cleanupRan = false;

export const runPastRegistrationCleanup = async () => {
  if (cleanupRan) return;

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return;
    }

    await supabase.rpc('close_past_course_registrations');
    cleanupRan = true;
  } catch (error) {
    console.error('Error running past registration cleanup:', error);
  }
};
