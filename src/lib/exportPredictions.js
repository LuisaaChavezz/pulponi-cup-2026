import { jsPDF } from 'jspdf';
import { buildMatchExportTitle, formatExportKickoffLine, formatExportLine } from './predictionActivity';

const SCORE_HIDDEN = 'Oculto hasta cierre';

function escapeCsvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCsvDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/**
 * Descarga CSV: Blob → object URL → <a download> → click.
 * @param {string} filename
 * @param {Array<{ usuario?: string, partido?: string, marcador?: string, fecha_envio?: string, fecha_actualizacion?: string }>} rows
 */
export function downloadCSV(filename, rows) {
  console.log('[EXPORT CSV START]');
  try {
    const header = ['usuario', 'partido', 'marcador', 'fecha_envio', 'fecha_actualizacion'];
    const lines = [header.join(',')];
    for (const r of rows ?? []) {
      lines.push(
        [
          escapeCsvCell(r.usuario ?? ''),
          escapeCsvCell(r.partido ?? ''),
          escapeCsvCell(r.marcador ?? ''),
          escapeCsvCell(r.fecha_envio ?? ''),
          escapeCsvCell(r.fecha_actualizacion ?? ''),
        ].join(',')
      );
    }
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
    return true;
  } catch (error) {
    console.log('[EXPORT ERROR]', error);
    throw error;
  }
}

export function mapExportRowsToCsv(rows, partidoLabel) {
  return (rows ?? []).map((r) => ({
    usuario: r.displayName || r.username || '',
    partido: partidoLabel,
    marcador: r.scoreLabel ?? SCORE_HIDDEN,
    fecha_envio: formatCsvDate(r.sentAt),
    fecha_actualizacion: formatCsvDate(r.updatedAt),
  }));
}

export function downloadPredictionsPdf(rows, title = 'Predicciones Pulponi Cup', kickoffLine = null) {
  console.log('[EXPORT PDF START]');
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    let y = margin;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 20, 28);
    doc.setFontSize(15);
    doc.text(title, margin, y, { maxWidth: 520 });
    y += 22;
    if (kickoffLine) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 90, 98);
      doc.setFontSize(10);
      doc.text(kickoffLine, margin, y);
      y += 18;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const r of rows ?? []) {
      const line = formatExportLine(r);
      if (y > 760) {
        doc.addPage();
        y = margin;
      }
      doc.setTextColor(22, 22, 26);
      doc.text(line, margin, y, { maxWidth: 520 });
      y += 18;
    }
    doc.save(`pulponi-predicciones-${Date.now()}.pdf`);
    return true;
  } catch (error) {
    console.log('[EXPORT ERROR]', error);
    throw error;
  }
}

export function downloadMatchPredictionsPdf(match, rows) {
  const title = buildMatchExportTitle(match);
  const kickoffLine = formatExportKickoffLine(match);
  return downloadPredictionsPdf(rows, title, kickoffLine);
}

export { SCORE_HIDDEN };
