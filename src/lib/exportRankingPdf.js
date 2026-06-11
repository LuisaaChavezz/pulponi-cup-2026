import { jsPDF } from 'jspdf';

function formatUsername(row) {
  const raw = row?.username ?? row?.name ?? 'jugador';
  return String(raw).replace(/^@+/, '').trim() || 'jugador';
}

export function exportRankingPdf(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageBottom = 287;
  let y = margin;

  pdf.setTextColor(180, 14, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Pulponi Cup 2026 — Ranking', margin, y);
  y += 7;

  pdf.setTextColor(90, 90, 98);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const exportedAt = new Date().toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  pdf.text(`Exportado: ${exportedAt}`, margin, y);
  y += 9;

  const colX = [margin, margin + 14, margin + 88, margin + 118, margin + 148];
  const headers = ['#', 'Usuario', 'Puntos', 'Exactos', 'Racha'];

  function drawTableHeader() {
    pdf.setTextColor(120, 120, 130);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    headers.forEach((label, i) => pdf.text(label, colX[i], y));
    y += 2;
    pdf.setDrawColor(255, 30, 39);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, 196, y);
    y += 5;
  }

  drawTableHeader();

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(30, 30, 34);

  list.forEach((row, index) => {
    if (y > pageBottom) {
      pdf.addPage();
      y = margin;
      drawTableHeader();
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 30, 34);
    }

    const username = formatUsername(row);
    const truncated = username.length > 28 ? `${username.slice(0, 26)}…` : username;

    const rank = row.rank_position ?? index + 1;

    pdf.text(String(rank), colX[0], y);
    pdf.text(truncated, colX[1], y);
    pdf.text(String(Number(row.points ?? 0)), colX[2], y);
    pdf.text(String(Number(row.exacts ?? 0)), colX[3], y);
    pdf.text(String(Number(row.streak ?? 0)), colX[4], y);
    y += 6;
  });

  pdf.save('pulponi-ranking.pdf');
}
