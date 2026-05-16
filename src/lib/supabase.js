import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl?.startsWith('https://')) {
  throw new Error('VITE_SUPABASE_URL inválida: ' + supabaseUrl);
}

if (!supabaseAnonKey || typeof supabaseAnonKey !== 'string' || !supabaseAnonKey.trim()) {
  throw new Error('VITE_SUPABASE_ANON_KEY inválida o vacía');
}

export const supabase = createClient(supabaseUrl.trim(), supabaseAnonKey.trim(), {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
