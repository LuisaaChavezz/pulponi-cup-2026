import { jsPDF } from 'jspdf';
import { displayTeamName } from './matchUtils';
import { formatAmericanOdd } from './parlayCalculator';

function formatUserLabel(username) {
  const raw = String(username ?? '').trim();
  if (!raw) return '@jugador';
  return raw.startsWith('@') ? raw : `@${raw.replace(/^@+/, '')}`;
}

function matchLabel(sel) {
  const home = displayTeamName(sel?.homeTeam) ?? 'Local';
  const away = displayTeamName(sel?.awayTeam) ?? 'Visitante';
  return `${home} vs ${away}`;
}

/**
 * Exporta la combinada actual del usuario a PDF (solo selección en curso).
 */
export function exportParlayPdf({ username, selections = [], stake = 0, totalOdds = 1, grossGain = 0 }) {
  const picks = Array.isArray(selections) ? selections : [];
  if (picks.length < 1) {
    throw new Error('Sin selecciones');
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageBottom = 287;
  let y = margin;

  pdf.setTextColor(180, 14, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Pulponi Cup 2026 — Parlay', margin, y);
  y += 7;

  pdf.setTextColor(90, 90, 98);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const exportedAt = new Date().toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  pdf.text(`Descargado: ${exportedAt}`, margin, y);
  y += 5;
  pdf.text(`Usuario: ${formatUserLabel(username)}`, margin, y);
  y += 9;

  pdf.setTextColor(120, 120, 130);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('Selecciones', margin, y);
  y += 2;
  pdf.setDrawColor(255, 30, 39);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, 196, y);
  y += 6;

  picks.forEach((sel, index) => {
    if (y > pageBottom - 24) {
      pdf.addPage();
      y = margin;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 34);
    pdf.text(`${index + 1}. ${matchLabel(sel)}`, margin, y);
    y += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(60, 60, 68);
    pdf.text(`Selección: ${sel.outcomeLabel ?? '—'}`, margin + 2, y);
    y += 4;
    pdf.text(`Momio: ${formatAmericanOdd(sel.decimalOdds)}`, margin + 2, y);
    y += 7;
  });

  y += 2;
  pdf.setDrawColor(255, 30, 39);
  pdf.line(margin, y, 196, y);
  y += 7;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 30, 34);
  pdf.text('Resumen', margin, y);
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  const summaryRows = [
    ['Momio total', formatAmericanOdd(totalOdds)],
    ['Monto virtual', `${Math.round(Number(stake) || 0)} pts`],
    ['Posible ganancia', `${Math.round(Number(grossGain) || 0)} pts`],
  ];

  summaryRows.forEach(([label, value]) => {
    pdf.setTextColor(90, 90, 98);
    pdf.text(label, margin, y);
    pdf.setTextColor(30, 30, 34);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(value), margin + 52, y);
    pdf.setFont('helvetica', 'normal');
    y += 6;
  });

  pdf.save('pulponi-parlay.pdf');
}
