import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { buildMatchExportTitle, formatExportKickoffLine, formatExportLine } from './predictionActivity';

function escapeCsvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function predictionsToCsvRows(rows, matchLabel = '') {
  const header = ['usuario', 'marcador', 'accion', 'fecha', 'partido'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(r.displayName || r.username || ''),
        escapeCsvCell(r.scoreLabel),
        escapeCsvCell(r.actionLabel),
        escapeCsvCell(r.at instanceof Date ? r.at.toISOString() : r.at),
        escapeCsvCell(matchLabel),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function downloadTextFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {object[]} rows - filas con scoreLabel, actionLabel, at, displayName
 * @param {string} title
 * @param {string} [kickoffLine]
 */
export function downloadPredictionsPdf(rows, title = 'Últimas predicciones', kickoffLine = null) {
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
  doc.setTextColor(35, 35, 38);
  doc.setFontSize(9);
  if (!rows.length) {
    doc.text('No hay predicciones para este partido.', margin, y);
    doc.save(`pulponi-predicciones-${Date.now()}.pdf`);
    return;
  }
  for (const r of rows) {
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
}

export function downloadMatchPredictionsPdf(match, rows) {
  const title = buildMatchExportTitle(match);
  const kickoffLine = formatExportKickoffLine(match);
  downloadPredictionsPdf(rows, title, kickoffLine);
}

export async function downloadPredictionsRaster(element, format) {
  if (!element) return;
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#08080a',
    logging: false,
    useCORS: true,
  });
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const quality = format === 'jpeg' ? 0.92 : undefined;
  const url = canvas.toDataURL(mime, quality);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pulponi-predicciones-${Date.now()}.${ext}`;
  a.click();
}
