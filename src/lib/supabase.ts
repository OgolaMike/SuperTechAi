import { createClient } from '@supabase/supabase-js';

// Public browser credentials for the dedicated SuperTech AI Supabase project.
// Environment variables may override these values in hosted deployments.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://jtfsqhewotinvlrcadwq.supabase.co';

const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZnNxaGV3b3RpbnZscmNhZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3NDY1ODEsImV4cCI6MjEwOTMyMjU4MX0.m3OxPz5v8u4oUHElVNbCcfi8Cd-d6_xu8nFORxwCNUc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
