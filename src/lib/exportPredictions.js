import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

function escapeCsvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function predictionsToCsvRows(rows) {
  const header = ['username', 'partido', 'marcador', 'avanza', 'fecha'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(r.username ? `@${r.username}` : ''),
        escapeCsvCell(r.matchLabel),
        escapeCsvCell(r.scoreLabel),
        escapeCsvCell(r.advances_team ?? ''),
        escapeCsvCell(r.at instanceof Date ? r.at.toISOString() : r.at),
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

export function downloadPredictionsPdf(rows, title = 'Últimas predicciones') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 20, 28);
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 28;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(35, 35, 38);
  doc.setFontSize(9);
  if (!rows.length) {
    doc.text('No hay predicciones registradas.', margin, y);
    doc.save(`pulponi-predicciones-${Date.now()}.pdf`);
    return;
  }
  for (const r of rows) {
    const line1 = `${r.username ? `@${r.username}` : '—'} · ${r.matchLabel}`;
    const line2 = `Marcador: ${r.scoreLabel}${r.advances_team ? ` · Avanza: ${r.advances_team}` : ''}`;
    const line3 = r.at instanceof Date ? r.at.toLocaleString('es-MX') : String(r.at ?? '');
    if (y > 760) {
      doc.addPage();
      y = margin;
    }
    doc.setTextColor(22, 22, 26);
    doc.text(line1, margin, y, { maxWidth: 520 });
    y += 14;
    doc.setTextColor(55, 55, 62);
    doc.text(line2, margin, y, { maxWidth: 520 });
    y += 14;
    doc.setTextColor(110, 110, 120);
    doc.text(line3, margin, y, { maxWidth: 520 });
    y += 22;
  }
  doc.save(`pulponi-predicciones-${Date.now()}.pdf`);
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
