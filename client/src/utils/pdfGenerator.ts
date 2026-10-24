import { PerformanceReport } from '../types';

export async function generatePdfReport(report: PerformanceReport) {
  const { default: jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = (autoTableModule as any).default || autoTableModule;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Colors
  const primaryColor: [number, number, number] = [30, 58, 138]; // Deep blue
  const secondaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
  const emeraldColor: [number, number, number] = [16, 185, 129];
  const roseColor: [number, number, number] = [244, 63, 94];
  const mutedText: [number, number, number] = [100, 116, 139];

  let currentY = 16;

  // 1. Header & Title Banner
  doc.setFillColor(...primaryColor);
  doc.rect(margin, currentY, pageWidth - margin * 2, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('AI TRADING v1.0 • EXECUTIVE PERFORMANCE STATEMENT', margin + 6, currentY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(224, 231, 255);
  doc.text('Laporan Hasil Perdagangan Kripto & Evaluasi Multi-Agent Swarm', margin + 6, currentY + 16);

  currentY += 28;

  // 2. Metadata Information Block
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 20, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...secondaryColor);

  doc.text('PERIODE LAPORAN:', margin + 4, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.periodLabel} (${report.startDate} - ${report.endDate})`, margin + 38, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('MODE TRADING:', margin + 4, currentY + 12);
  doc.setFont('helvetica', 'normal');
  const modeColor = report.currentMode === 'LIVE' ? [220, 38, 38] : [16, 185, 129];
  doc.setTextColor(modeColor[0], modeColor[1], modeColor[2]);
  doc.text(`${report.currentMode} TRADING`, margin + 38, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...secondaryColor);
  doc.text('WAKTU CETAK:', pageWidth - margin - 65, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleString('id-ID'), pageWidth - margin - 38, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('STATUS DOKUMEN:', pageWidth - margin - 65, currentY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text('Terverifikasi Sistem', pageWidth - margin - 38, currentY + 12);

  currentY += 26;

  // 3. Key Financial Performance Indicators (4 KPI Cards)
  const cardWidth = (pageWidth - margin * 2 - 9) / 4;
  const cardHeight = 22;

  const isNetProfit = report.netPnlIdr >= 0;
  const kpis = [
    {
      title: 'NET REALIZED PnL',
      val: `Rp ${Math.abs(report.netPnlIdr).toLocaleString('id-ID')}`,
      sub: `${isNetProfit ? '+' : '-'}${report.netPnlPercent.toFixed(2)}% Return`,
      color: isNetProfit ? emeraldColor : roseColor,
    },
    {
      title: 'WIN RATE %',
      val: `${report.winRatePercent.toFixed(1)}%`,
      sub: `${report.winningTrades} Menang / ${report.losingTrades} Kalah`,
      color: primaryColor,
    },
    {
      title: 'PROFIT FACTOR',
      val: report.profitFactor !== null ? report.profitFactor.toString() : 'N/A',
      sub: `Gross: Rp ${(report.grossProfitIdr / 1000).toFixed(0)}k`,
      color: primaryColor,
    },
    {
      title: 'MAX DRAWDOWN',
      val: `${report.maxDrawdownPercent.toFixed(2)}%`,
      sub: `Rp ${report.maxDrawdownIdr.toLocaleString('id-ID')}`,
      color: report.maxDrawdownPercent > 10 ? roseColor : mutedText,
    },
  ];

  kpis.forEach((k, idx) => {
    const xPos = margin + idx * (cardWidth + 3);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(xPos, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...mutedText);
    doc.text(k.title, xPos + 3.5, currentY + 5.5);

    doc.setFontSize(10);
    doc.setTextColor(k.color[0], k.color[1], k.color[2]);
    doc.text(k.val, xPos + 3.5, currentY + 12.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...mutedText);
    doc.text(k.sub, xPos + 3.5, currentY + 18);
  });

  currentY += cardHeight + 8;

  // 4. Section: AI Swarm & Counterfactual Alpha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...secondaryColor);
  doc.text('1. Efektivitas AI Multi-Agent & Proteksi Modal (A/B Alpha)', margin, currentY);

  currentY += 4;

  const aiTableRows = [
    [
      'Total Sinyal Masuk Diuji AI',
      `${report.aiEfficacy.evaluationsCount} Analisis`,
      'Peluru Kerugian Berhasil Dihindari (Bullets Dodged)',
      `${report.aiEfficacy.bulletsDodged} Koin`,
    ],
    [
      'Sinyal Disetujui (Approved)',
      `${report.aiEfficacy.approvedCount} Trade`,
      'Modal Diselamatkan dari Kerugian (Saved Capital)',
      `Rp ${report.aiEfficacy.savedCapitalIdr.toLocaleString('id-ID')}`,
    ],
    [
      'Sinyal Ditolak (Rejected)',
      `${report.aiEfficacy.rejectedCount} Trade`,
      'Peluang Terlewatkan (Opportunities Missed)',
      `${report.aiEfficacy.opportunitiesMissed} Koin (Rp ${report.aiEfficacy.missedProfitIdr.toLocaleString('id-ID')})`,
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    body: aiTableRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 50 },
      1: { cellWidth: 40 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 50 },
      3: { cellWidth: 42 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 5. Section: Breakdown Performa per Koin (Top Coins)
  if (report.coinBreakdown.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...secondaryColor);
    doc.text('2. Breakdown Kinerja Berdasarkan Simbol Koin', margin, currentY);

    currentY += 4;

    const coinTableRows = report.coinBreakdown.slice(0, 10).map((c) => [
      c.symbol,
      c.tradesCount.toString(),
      `${c.wins} / ${c.losses}`,
      `${c.winRatePercent.toFixed(1)}%`,
      `Rp ${c.totalPnlIdr.toLocaleString('id-ID')}`,
      `${c.avgPnlPercent >= 0 ? '+' : ''}${c.avgPnlPercent.toFixed(2)}%`,
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Koin / Pair', 'Total Trade', 'Menang / Kalah', 'Win Rate', 'Total PnL (IDR)', 'Rata-rata PnL (%)']],
      body: coinTableRows,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        4: { fontStyle: 'bold' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // 6. Section: Riwayat Transaksi Lengkap
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...secondaryColor);
  doc.text('3. Riwayat Transaksi Terperinci (Trade Journal)', margin, currentY);

  currentY += 4;

  const tradesRows = report.tradesList.slice(0, 50).map((t, idx) => {
    const isWin = t.pnl_idr >= 0;
    const closeTimeStr = t.closed_at ? new Date(t.closed_at).toLocaleDateString('id-ID') : '-';
    return [
      (idx + 1).toString(),
      t.symbol,
      closeTimeStr,
      `Rp ${t.entry_price.toLocaleString('id-ID')}`,
      `Rp ${t.exit_price.toLocaleString('id-ID')}`,
      `Rp ${Math.round(t.initial_cost_idr).toLocaleString('id-ID')}`,
      `${isWin ? '+' : ''}Rp ${Math.round(t.pnl_idr).toLocaleString('id-ID')}`,
      `${isWin ? '+' : ''}${t.pnl_percent.toFixed(2)}%`,
      t.exit_reason,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['No', 'Pair', 'Tanggal', 'Beli', 'Jual', 'Modal', 'Net PnL (IDR)', 'PnL %', 'Alasan Exit']],
    body: tradesRows.length > 0 ? tradesRows : [['-', 'Belum ada transaksi pada periode ini', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { fontStyle: 'bold', cellWidth: 16 },
      6: { fontStyle: 'bold' },
      8: { cellWidth: 32 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 7. Section: Catatan Belajar Mandiri AI (Self-Learning Post-Mortem)
  if (report.lessonsLearned.length > 0) {
    // Check if new page needed
    if (currentY + 35 > pageHeight) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...secondaryColor);
    doc.text('4. Catatan Evaluasi Belajar Mandiri AI (Self-Learning Insights)', margin, currentY);

    currentY += 4;

    const lessonsRows = report.lessonsLearned.slice(0, 5).map((l) => [
      l.date,
      l.symbol,
      l.result,
      `${l.pnl_percent >= 0 ? '+' : ''}${l.pnl_percent.toFixed(2)}%`,
      l.lesson,
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Tanggal', 'Koin', 'Hasil', 'PnL %', 'Pelajaran yang Diambil AI']],
      body: lessonsRows,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        1: { fontStyle: 'bold' },
        4: { cellWidth: 100 },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // 8. Add Page Numbers & Footer to all pages
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...mutedText);

    // Footer divider line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.text(
      'AI Trading Platform v1.0 • Autonomous Multi-Agent Swarm with Dynamic Exit • Generated Report',
      margin,
      pageHeight - 6
    );

    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageWidth - margin - 20,
      pageHeight - 6
    );
  }

  // Save PDF file to browser
  const filename = `AI_Trading_Statement_${report.periodLabel.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  doc.save(filename);
}
