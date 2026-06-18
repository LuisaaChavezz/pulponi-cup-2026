import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function slugifyLabel(label) {
  return String(label ?? 'partido')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase() || 'partido';
}

export function useMatchPdf() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadMatchPdf = useCallback(async (matchId, label) => {
    if (!matchId) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError('Supabase no está configurado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError('Inicia sesión para descargar el PDF.');
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-match-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ match_id: matchId }),
      });

      if (!res.ok) {
        let message = `Error ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) message = String(errJson.error);
        } catch {
          // respuesta no JSON
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pulponi-${slugifyLabel(label)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message ?? 'No se pudo generar el PDF.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { downloadMatchPdf, loading, error };
}
