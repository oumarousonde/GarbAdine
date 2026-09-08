const { Pool } = require('pg');
const ExcelJS = require('exceljs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Palette alignée sur le design de l'app (ambre / émeraude / rouge)
const COLORS = {
  headerFill: 'FFD97706',   // ambre (gradient-primary)
  headerFont: 'FFFFFFFF',
  saleFill: 'FFD1FAE5',     // vert clair
  saleFont: 'FF065F46',
  expenseFill: 'FFFEE2E2',  // rouge clair
  expenseFont: 'FF991B1B',
  summaryFill: 'FFFEF3C7',  // ambre clair
  border: 'FFE5E7EB',
};

function getRange(period, from, to) {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  if (period === 'custom' && from && to) return { from, to };
  if (period === 'week') {
    const start = new Date(today); start.setDate(start.getDate() - 6);
    return { from: fmt(start), to: fmt(today) };
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(start), to: fmt(today) };
  }
  return { from: fmt(today), to: fmt(today) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { shopId, period, from, to } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId requis' });

    const { from: dateFrom, to: dateTo } = getRange(period, from, to);

    const shopRes = await pool.query('SELECT name FROM shops WHERE id = $1', [shopId]);
    const shopName = shopRes.rows[0]?.name || 'GarbAdine';

    const txRes = await pool.query(
      `SELECT t.*, u.name as gerante_name FROM transactions t
       LEFT JOIN users u ON u.id = t.gerante_id
       WHERE t.shop_id = $1 AND t.transaction_date BETWEEN $2 AND $3
       ORDER BY t.transaction_date ASC, t.created_at ASC`,
      [shopId, dateFrom, dateTo]
    );
    const rows = txRes.rows;

    let totalSales = 0, totalExpenses = 0;
    rows.forEach(r => {
      const amt = parseFloat(r.total_amount) || 0;
      if (r.type === 'vente') totalSales += amt; else totalExpenses += amt;
    });

    // ===== Construction du classeur =====
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GarbAdine';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rapport', {
      views: [{ state: 'frozen', ySplit: 6 }]
    });

    sheet.columns = [
      { key: 'date', width: 14 },
      { key: 'type', width: 12 },
      { key: 'categorie', width: 20 },
      { key: 'description', width: 26 },
      { key: 'quantite', width: 10 },
      { key: 'prix_unitaire', width: 16 },
      { key: 'montant', width: 16 },
      { key: 'paiement', width: 14 },
      { key: 'gerante', width: 20 },
    ];

    // ---- Titre ----
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Rapport financier — ${shopName}`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF92400E' } };
    titleCell.alignment = { vertical: 'middle' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:I2');
    sheet.getCell('A2').value = `Période : ${dateFrom} au ${dateTo}`;
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF78716C' } };

    // ---- Résumé (Ventes / Dépenses / Bénéfice) ----
    const summaryRow = 4;
    const summaries = [
      { label: 'VENTES', value: totalSales, fill: COLORS.saleFill, font: COLORS.saleFont },
      { label: 'DÉPENSES', value: totalExpenses, fill: COLORS.expenseFill, font: COLORS.expenseFont },
      { label: 'BÉNÉFICE NET', value: totalSales - totalExpenses, fill: COLORS.summaryFill, font: 'FF92400E' },
    ];
    summaries.forEach((s, i) => {
      const colStart = 1 + i * 3; // A, D, G
      const startCell = sheet.getCell(summaryRow, colStart);
      sheet.mergeCells(summaryRow, colStart, summaryRow, colStart + 1);
      startCell.value = s.label;
      startCell.font = { bold: true, size: 10, color: { argb: s.font } };
      startCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.fill } };
      startCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const valCell = sheet.getCell(summaryRow + 1, colStart);
      sheet.mergeCells(summaryRow + 1, colStart, summaryRow + 1, colStart + 1);
      valCell.value = `${s.value.toLocaleString('fr-FR')} F`;
      valCell.font = { bold: true, size: 13, color: { argb: s.font } };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.fill } };
      valCell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // ---- En-têtes du tableau (colorées) ----
    const headerRowIndex = 6;
    const headers = ['Date', 'Type', 'Catégorie', 'Description', 'Quantité', 'Prix Unitaire', 'Montant (F)', 'Paiement', 'Gérante'];
    const headerRow = sheet.getRow(headerRowIndex);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: COLORS.headerFont } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerFill } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
      };
    });
    headerRow.height = 22;

    // ---- Lignes de données (couleur selon vente/dépense) ----
    rows.forEach((r) => {
      const isSale = r.type === 'vente';
      const paymentLabel = r.payment_mode === 'om' ? 'Orange Money' : (r.payment_mode === 'pending' ? 'En attente' : 'Cash');
      const row = sheet.addRow({
        date: new Date(r.transaction_date).toLocaleDateString('fr-FR'),
        type: isSale ? 'Vente' : 'Dépense',
        categorie: r.category,
        description: r.description || '',
        quantite: Number(r.quantity) || 0,
        prix_unitaire: Number(r.unit_price) || 0,
        montant: Number(r.total_amount) || 0,
        paiement: isSale ? paymentLabel : '—',
        gerante: r.gerante_name || '—',
      });

      const fill = isSale ? COLORS.saleFill : COLORS.expenseFill;
      const font = isSale ? COLORS.saleFont : COLORS.expenseFont;
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.font = { color: { argb: font } };
        cell.border = { bottom: { style: 'hair', color: { argb: COLORS.border } } };
      });
      row.getCell(6).numFmt = '#,##0 "F"';
      row.getCell(7).numFmt = '#,##0 "F"';
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(7).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'center' };
    });

    if (rows.length === 0) {
      sheet.addRow(['Aucune transaction sur cette période.']);
    }

    // ===== Envoi du fichier =====
    const filename = `Rapport_${shopName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateFrom}_au_${dateTo}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('EXPORT EXCEL ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
