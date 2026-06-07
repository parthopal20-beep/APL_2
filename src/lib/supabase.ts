import { createClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://igoewaumdhsboszkhyuk.supabase.co'; // Paste Supabase Project URL here
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnb2V3YXVtZGhzYm9zemtoeXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTM0MjIsImV4cCI6MjA5NjAyOTQyMn0._ddOrepVCQZzGAfu0jVfKqm6ncY8mQiHCu02joCDyQQ'; // Paste Supabase Anon Key here

const cleanUrl = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const match = raw.match(/https:\/\/[a-zA-Z0-9.-]+\.supabase\.co/);
  return match ? match[0] : raw.trim();
};

const getConfigs = () => {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL || localStorage.getItem('VITE_SUPABASE_URL');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY || localStorage.getItem('VITE_SUPABASE_ANON_KEY');
  const url = cleanUrl(rawUrl);
  return { url, key: key?.trim() };
};

const { url: supabaseUrl, key: supabaseAnonKey } = getConfigs();

// Secure initialization
const isConfigured = !!(
  supabaseUrl && 
  supabaseUrl.startsWith('https://') && 
  !supabaseUrl.includes('your-project-url') && 
  !supabaseUrl.includes('placeholder')
);

if (!isConfigured) {
  console.warn('Supabase is not configured yet with an environment variable.');
}

// Create original client
const realSupabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export const getSupabaseStatus = async () => {
  if (!isConfigured) return { status: 'PARTIAL' as const, reason: 'Supabase keys missing' };
  
  try {
     const { error } = await realSupabase.from('users').select('count', { count: 'exact', head: true });
     if (error) throw error;
     
     return { status: 'HEALTHY' as const, reason: 'Supabase Cloud Connected' };
  } catch (e: any) {
     return { status: 'ERROR' as const, reason: e.message || 'Connection failed' };
  }
};

// Proxied Supabase Client (Now just direct reference)
const supabase = realSupabase;

export { supabaseUrl, supabaseAnonKey, isConfigured, supabase, realSupabase };

