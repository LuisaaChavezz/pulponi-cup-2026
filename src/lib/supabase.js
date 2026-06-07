import { createClient } from '@supabase/supabase-js';

function readEnv(key) {
  if (typeof import.meta !== 'undefined' && import.meta.env?.[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY');

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
