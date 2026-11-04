import { createClient } from '@supabase/supabase-js';

// Pin all financial and membership requests to the dedicated SuperTech AI project.
// Do not allow stale Bolt/Vite environment overrides to redirect authenticated
// Edge Function requests to another Supabase project.
const supabaseUrl = 'https://jtfsqhewotinvlrcadwq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZnNxaGV3b3RpbnZscmNhZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3NDY1ODEsImV4cCI6MjEwOTMyMjU4MX0.m3OxPz5v8u4oUHElVNbCcfi8Cd-d6_xu8nFORxwCNUc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
