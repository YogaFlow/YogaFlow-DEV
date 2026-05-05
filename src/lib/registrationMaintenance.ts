import { supabase } from './supabase';

let cleanupRan = false;

export const runPastRegistrationCleanup = async () => {
  if (cleanupRan) return;

  try {
    await supabase.rpc('close_past_course_registrations');
    cleanupRan = true;
  } catch (error) {
    console.error('Error running past registration cleanup:', error);
  }
};
