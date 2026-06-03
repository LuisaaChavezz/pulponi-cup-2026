import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  buildMatchExportTitle,
  formatExportKickoffLine,
  formatExportLine,
  formatMatchSectionHeading,
} from './predictionActivity';

function escapeCsvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Dispara descarga en el navegador (Safari / móvil requieren nodo en el DOM). */
export function triggerBrowserDownload(href, filename) {
  if (!href || !filename) return false;
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    if (href.startsWith('blob:')) URL.revokeObjectURL(href);
  }, 200);
  return true;
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
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    return triggerBrowserDownload(url, filename);
  } catch {
    return false;
  }
}

/**
 * @param {object[]} rows - filas con scoreLabel, actionLabel, at, displayName
 * @param {string} title
 * @param {string} [kickoffLine]
 */
export function downloadPredictionsPdf(rows, title = 'Últimas predicciones', kickoffLine = null) {
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
    doc.setTextColor(35, 35, 38);
    doc.setFontSize(9);
    if (!rows.length) {
      doc.text('No hay predicciones para este partido.', margin, y);
    } else {
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
    }
    doc.save(`pulponi-predicciones-${Date.now()}.pdf`);
    return true;
  } catch {
    return false;
  }
}

export function downloadMatchPredictionsPdf(match, rows) {
  const title = buildMatchExportTitle(match);
  const kickoffLine = formatExportKickoffLine(match);
  return downloadPredictionsPdf(rows, title, kickoffLine);
}

export function predictionsAllMatchesToCsv(groups) {
  const lines = ['partido,usuario,marcador,accion,fecha'];
  for (const g of groups ?? []) {
    const label = g.match
      ? `${g.match.home_team ?? 'Local'} vs ${g.match.away_team ?? 'Visitante'}`
      : '';
    for (const r of g.rows ?? []) {
      lines.push(
        [
          escapeCsvCell(label),
          escapeCsvCell(r.displayName || r.username || ''),
          escapeCsvCell(r.scoreLabel),
          escapeCsvCell(r.actionLabel),
          escapeCsvCell(r.at instanceof Date ? r.at.toISOString() : r.at),
        ].join(',')
      );
    }
  }
  return lines.join('\n');
}

/**
 * @param {{ match: object, title: string, kickoffLine: string|null, rows: object[] }[]} groups
 */
export function downloadAllPredictionsPdf(groups, docTitle = 'Todas las predicciones — Pulponi Cup') {
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    let y = margin;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 20, 28);
    doc.setFontSize(15);
    doc.text(docTitle, margin, y, { maxWidth: 520 });
    y += 26;

    if (!groups?.length) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(35, 35, 38);
      doc.setFontSize(10);
      doc.text('No hay predicciones exportables todavía.', margin, y);
    } else {
      for (const g of groups) {
        if (y > 700) {
          doc.addPage();
          y = margin;
        }
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(35, 35, 38);
        doc.setFontSize(11);
        doc.text(formatMatchSectionHeading(g.match), margin, y, { maxWidth: 520 });
        y += 16;
        if (g.kickoffLine) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(90, 90, 98);
          doc.setFontSize(9);
          doc.text(g.kickoffLine, margin, y);
          y += 14;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        for (const r of g.rows ?? []) {
          if (y > 760) {
            doc.addPage();
            y = margin;
          }
          doc.setTextColor(22, 22, 26);
          doc.text(`• ${formatExportLine(r)}`, margin + 8, y, { maxWidth: 500 });
          y += 16;
        }
        y += 10;
      }
    }
    doc.save(`pulponi-todas-predicciones-${Date.now()}.pdf`);
    return true;
  } catch {
    return false;
  }
}

export async function downloadPredictionsRaster(element, format) {
  if (!element) return false;
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#08080a',
      logging: false,
      useCORS: true,
      width: element.scrollWidth || 720,
      height: element.scrollHeight || 400,
    });
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const quality = format === 'jpeg' ? 0.92 : undefined;

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality);
    });
    if (!blob) return false;

    const url = URL.createObjectURL(blob);
    const ok = triggerBrowserDownload(url, `pulponi-predicciones-${Date.now()}.${ext}`);
    return ok;
  } catch {
    return false;
  }
}
