import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { triggerPdfBlobDownload } from '../lib/matchResultsPdf';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function invokeSummaryFn(fnName, body, fallbackFilename) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Inicia sesión para descargar el resumen.');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase no está configurado.');
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
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
  if (!blob || blob.size === 0) {
    throw new Error('El servicio PDF devolvió un archivo vacío.');
  }

  triggerPdfBlobDownload(blob, fallbackFilename);
}

export function useUserSummaryPdf() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadUserSummaryPdf = useCallback(async (userId) => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await invokeSummaryFn(
        'generate-user-summary-pdf',
        { profile_id: userId },
        'pulponi-resumen.pdf'
      );
    } catch (e) {
      setError(e?.message ?? 'No se pudo generar el resumen.');
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadAllSummariesPdf = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await invokeSummaryFn(
        'generate-all-summaries-pdf',
        {},
        'pulponi-resumenes-todos.pdf'
      );
    } catch (e) {
      setError(e?.message ?? 'No se pudieron generar los resúmenes.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { downloadUserSummaryPdf, downloadAllSummariesPdf, loading, error };
}
