import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { downloadMatchPredictionsPdf } from '../lib/exportPredictions';
import { buildMatchDownloadRows } from '../lib/predictionActivity';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function slugifyLabel(label) {
  return (
    String(label ?? 'partido')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .toLowerCase() || 'partido'
  );
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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

  triggerBlobDownload(blob, `pulponi-${slugifyLabel(label)}.pdf`);
}

function downloadViaClient(match, exportContext) {
  const profiles = exportContext?.profiles ?? [];
  const activityLog = exportContext?.activityLog ?? [];
  const currentUsername = exportContext?.currentUsername ?? null;
  const now = exportContext?.now ?? new Date();

  const rows = buildMatchDownloadRows(
    profiles,
    match.id,
    activityLog,
    match,
    now,
    currentUsername
  );

  if (!rows.length) {
    throw new Error('No hay predicciones para descargar en este partido.');
  }

  downloadMatchPredictionsPdf(match, rows);
}

/**
 * @param {{ profiles?: array, activityLog?: array, currentUsername?: string, now?: Date }} exportContext
 *   Datos para fallback local (jsPDF) si la Edge Function no está desplegada.
 */
export function useMatchPdf(exportContext) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadMatchPdf = useCallback(
    async (match) => {
      if (!match?.id) return;

      const label = `${match.home_team ?? 'Local'} vs ${match.away_team ?? 'Visitante'}`;

      setLoading(true);
      setError(null);

      try {
        try {
          await downloadViaEdgeFunction(match.id, label);
        } catch (edgeErr) {
          console.warn('[useMatchPdf] Edge Function no disponible, usando PDF local', edgeErr);
          downloadViaClient(match, exportContext);
        }
      } catch (e) {
        setError(e?.message ?? 'No se pudo generar el PDF.');
      } finally {
        setLoading(false);
      }
    },
    [exportContext]
  );

  return { downloadMatchPdf, loading, error };
}
