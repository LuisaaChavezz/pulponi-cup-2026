import { jsPDF } from 'jspdf';
import { buildMatchExportTitle, formatExportKickoffLine, formatExportLine } from './predictionActivity';

const PDF_MARGIN = 40;
const PDF_PAGE_BOTTOM = 760;

function ensurePdfSpace(doc, y, needed = 18) {
  if (y + needed > PDF_PAGE_BOTTOM) {
    doc.addPage();
    return PDF_MARGIN;
  }
  return y;
}

function writePdfMatchSection(doc, y, { title, kickoffLine, rows }) {
  y = ensurePdfSpace(doc, y, 40);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 22, 26);
  doc.setFontSize(11);
  doc.text(title, PDF_MARGIN, y, { maxWidth: 520 });
  y += 16;

  if (kickoffLine) {
    y = ensurePdfSpace(doc, y, 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 98);
    doc.setFontSize(9);
    doc.text(kickoffLine, PDF_MARGIN, y);
    y += 14;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const r of rows ?? []) {
    y = ensurePdfSpace(doc, y, 18);
    doc.setTextColor(22, 22, 26);
    doc.text(formatExportLine(r), PDF_MARGIN, y, { maxWidth: 520 });
    y += 18;
  }

  return y + 12;
}

export function downloadPredictionsPdf(rows, title = 'Predicciones Pulponi Cup', kickoffLine = null) {
  console.log('[EXPORT PDF START]');
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = PDF_MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 20, 28);
    doc.setFontSize(15);
    doc.text(title, PDF_MARGIN, y, { maxWidth: 520 });
    y += 22;

    if (kickoffLine) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 90, 98);
      doc.setFontSize(10);
      doc.text(kickoffLine, PDF_MARGIN, y);
      y += 18;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const r of rows ?? []) {
      y = ensurePdfSpace(doc, y, 18);
      doc.setTextColor(22, 22, 26);
      doc.text(formatExportLine(r), PDF_MARGIN, y, { maxWidth: 520 });
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

export function downloadAllPredictionsPdf(groups, title = 'Todas las predicciones — Pulponi Cup 2026') {
  console.log('[EXPORT PDF START]');
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = PDF_MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 20, 28);
    doc.setFontSize(15);
    doc.text(title, PDF_MARGIN, y, { maxWidth: 520 });
    y += 28;

    for (const group of groups ?? []) {
      y = writePdfMatchSection(doc, y, {
        title: group.title ?? buildMatchExportTitle(group.match),
        kickoffLine: group.kickoffLine ?? formatExportKickoffLine(group.match),
        rows: group.rows,
      });
    }

    doc.save(`pulponi-todas-predicciones-${Date.now()}.pdf`);
    return true;
  } catch (error) {
    console.log('[EXPORT ERROR]', error);
    throw error;
  }
}
