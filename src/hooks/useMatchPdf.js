import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchResultsPdfPayload,
  requestResultsPdfBlob,
  resolvePdfServiceUrl,
  slugifyMatchPdfLabel,
  triggerPdfBlobDownload,
} from '../lib/matchResultsPdf';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function downloadViaEdgeFunction(matchId, label) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('Inicia sesión para descargar el PDF.');
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase no está configurado.');
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
  if (!blob || blob.size === 0) {
    throw new Error('El servicio PDF devolvió un archivo vacío.');
  }

  triggerPdfBlobDownload(blob, `pulponi-${label}.pdf`);
}

async function downloadViaPdfService(match) {
  const pdfServiceUrl = resolvePdfServiceUrl();
  if (!pdfServiceUrl) {
    throw new Error(
      'Servicio PDF no configurado. Despliega api/generate-pdf en Vercel o define VITE_PDF_SERVICE_URL.'
    );
  }

  const body = await fetchResultsPdfPayload(match);
  const blob = await requestResultsPdfBlob(pdfServiceUrl, body);
  triggerPdfBlobDownload(blob, `pulponi-${slugifyMatchPdfLabel(match)}.pdf`);
}

export function useMatchPdf() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadMatchPdf = useCallback(async (match) => {
    if (!match?.id) return;

    const label = slugifyMatchPdfLabel(match);

    setLoading(true);
    setError(null);

    try {
      try {
        await downloadViaEdgeFunction(match.id, label);
      } catch (edgeErr) {
        console.warn('[useMatchPdf] Edge Function no disponible, probando /api/generate-pdf', edgeErr);
        await downloadViaPdfService(match);
      }
    } catch (e) {
      setError(e?.message ?? 'No se pudo generar el PDF de resultados.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { downloadMatchPdf, loading, error };
}
