import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getOutstandingStatement, toCsv } from "@/lib/reports";

function formatAmount(value: number) {
  return value.toFixed(2);
}

async function buildOutstandingStatementPdf(
  filters: { customerId?: string; groupId?: string },
  rows: Awaited<ReturnType<typeof getOutstandingStatement>>,
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageSize = {
    height: 842,
    width: 595,
  };
  const margins = {
    bottom: 40,
    left: 32,
    right: 32,
    top: 40,
  };

  let page = pdf.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - margins.top;

  const drawText = (
    text: string,
    size = 10,
    options?: { bold?: boolean; color?: { r: number; g: number; b: number }; x?: number },
  ) => {
    page.drawText(text, {
      color: options?.color ? rgb(options.color.r, options.color.g, options.color.b) : rgb(0.12, 0.12, 0.12),
      font: options?.bold ? boldFont : font,
      size,
      x: options?.x ?? margins.left,
      y,
    });
  };

  const ensureSpace = (needed = 14) => {
    if (y - needed < margins.bottom) {
      page = pdf.addPage([pageSize.width, pageSize.height]);
      y = pageSize.height - margins.top;
    }
  };

  const summary = rows.reduce(
    (acc, row) => ({
      advanceBalance:
        acc.advanceBalance + (row.entryType === "advance" ? Math.abs(row.amountOutstanding) : 0),
      billCount: acc.billCount + (row.entryType === "bill" ? 1 : 0),
      diamondDue: acc.diamondDue + row.diamondDue,
      diamondOutstanding: acc.diamondOutstanding + row.diamondOutstanding,
      diamondOverdue: acc.diamondOverdue + row.diamondOverdue,
      grossOutstanding:
        acc.grossOutstanding + (row.entryType === "bill" ? row.amountOutstanding : 0),
      goldDue: acc.goldDue + row.goldDue,
      goldOutstanding: acc.goldOutstanding + row.goldOutstanding,
      goldOverdue: acc.goldOverdue + row.goldOverdue,
      totalOutstanding: acc.totalOutstanding + row.amountOutstanding,
    }),
    {
      advanceBalance: 0,
      billCount: 0,
      diamondDue: 0,
      diamondOutstanding: 0,
      diamondOverdue: 0,
      grossOutstanding: 0,
      goldDue: 0,
      goldOutstanding: 0,
      goldOverdue: 0,
      totalOutstanding: 0,
    },
  );

  drawText("Outstanding Statement", 16, { bold: true });
  y -= 20;
  drawText(`Customer: ${filters.customerId ?? "All customers"}`, 10, { color: { b: 0.3, g: 0.3, r: 0.3 } });
  y -= 14;
  drawText(`Group: ${filters.groupId ?? "All groups"}`, 10, { color: { b: 0.3, g: 0.3, r: 0.3 } });
  y -= 14;
  drawText(`Generated on: ${new Date().toISOString().slice(0, 10)}`, 10, {
    color: { b: 0.3, g: 0.3, r: 0.3 },
  });
  y -= 20;

  drawText("Detailed Bills", 12, { bold: true });
  y -= 16;

  const columns: Array<{ key: string; title: string; width: number }> = [
    { key: "invoice", title: "Invoice", width: 56 },
    { key: "date", title: "Date", width: 54 },
    { key: "goldOut", title: "G.Out", width: 50 },
    { key: "goldDue", title: "G.Due", width: 50 },
    { key: "goldOver", title: "G.Over", width: 50 },
    { key: "diaOut", title: "D.Out", width: 50 },
    { key: "diaDue", title: "D.Due", width: 50 },
    { key: "diaOver", title: "D.Over", width: 50 },
    { key: "total", title: "Total", width: 50 },
  ];

  let x = margins.left;
  columns.forEach((column) => {
    page.drawRectangle({
      color: rgb(0.95, 0.95, 0.95),
      height: 14,
      width: column.width,
      x,
      y: y - 2,
    });
    page.drawText(column.title, { font: boldFont, size: 8, x: x + 2, y });
    x += column.width;
  });
  y -= 16;

  rows.forEach((row) => {
    ensureSpace(22);
    drawText((row.entryType === "advance" ? "ADVANCE" : row.billNumber).slice(0, 14), 8, { x: margins.left });
    drawText(row.billDate, 8, { x: margins.left + 56 });
    drawText(formatAmount(row.goldOutstanding), 8, { x: margins.left + 110 });
    drawText(formatAmount(row.goldDue), 8, { x: margins.left + 160 });
    drawText(formatAmount(row.goldOverdue), 8, { x: margins.left + 210 });
    drawText(formatAmount(row.diamondOutstanding), 8, { x: margins.left + 260 });
    drawText(formatAmount(row.diamondDue), 8, { x: margins.left + 310 });
    drawText(formatAmount(row.diamondOverdue), 8, { x: margins.left + 360 });
    drawText(formatAmount(row.amountOutstanding), 8, { x: margins.left + 410 });
    y -= 12;

    drawText(`Customer: ${row.customerName}`.slice(0, 95), 8, {
      color: { b: 0.35, g: 0.35, r: 0.35 },
      x: margins.left,
    });
    y -= 10;
  });

  ensureSpace(90);
  y -= 8;
  drawText("Summary", 12, { bold: true });
  y -= 16;
  drawText(`Bills: ${summary.billCount}`, 10);
  y -= 14;
  drawText(`Gold Outstanding: ${formatAmount(summary.goldOutstanding)}`, 10);
  y -= 12;
  drawText(`Gold Due: ${formatAmount(summary.goldDue)}`, 10);
  y -= 12;
  drawText(`Gold Overdue: ${formatAmount(summary.goldOverdue)}`, 10);
  y -= 14;
  drawText(`Diamond Outstanding: ${formatAmount(summary.diamondOutstanding)}`, 10);
  y -= 12;
  drawText(`Diamond Due: ${formatAmount(summary.diamondDue)}`, 10);
  y -= 12;
  drawText(`Diamond Overdue: ${formatAmount(summary.diamondOverdue)}`, 10);
  y -= 14;
  drawText(`Advance Balance: ${formatAmount(summary.advanceBalance)}`, 10);
  y -= 12;
  drawText(`Gross Outstanding: ${formatAmount(summary.grossOutstanding)}`, 10);
  y -= 16;
  drawText(`Net Outstanding: ${formatAmount(summary.totalOutstanding)}`, 11, { bold: true });

  const bytes = await pdf.save();

  return bytes;
}

export async function GET(request: NextRequest) {
  await requireAuthenticatedUser();

  const customerId = request.nextUrl.searchParams.get("customer");
  const groupId = request.nextUrl.searchParams.get("group");
  const mode = request.nextUrl.searchParams.get("mode") === "pdf" ? "pdf" : "detailed";

  const rows = await getOutstandingStatement(customerId ?? undefined, groupId ?? undefined);

  if (mode === "pdf") {
    const pdfBytes = await buildOutstandingStatementPdf(
      { customerId: customerId ?? undefined, groupId: groupId ?? undefined },
      rows,
    );
    const normalizedPdfBytes = Uint8Array.from(pdfBytes);
    const pdfBody = new Blob([normalizedPdfBytes], { type: "application/pdf" });

    const fileNameSuffix = customerId ? customerId : groupId ? `group-${groupId}` : "all";

    return new NextResponse(pdfBody, {
      headers: {
        "Content-Disposition": `attachment; filename="outstanding-statement-${fileNameSuffix}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  }

  const detailedRows = [
    [
      "Entry Type",
      "Customer",
      "Invoice Number",
      "Date",
      "Gold Outstanding",
      "Gold Due",
      "Gold Overdue",
      "Diamond Outstanding",
      "Diamond Due",
      "Diamond Overdue",
      "Total Outstanding",
    ],
    ...rows.map((row) => [
      row.entryType,
      row.customerName,
      row.entryType === "advance" ? "ADVANCE PAYMENT" : row.billNumber,
      row.billDate,
      row.goldOutstanding.toFixed(2),
      row.goldDue.toFixed(2),
      row.goldOverdue.toFixed(2),
      row.diamondOutstanding.toFixed(2),
      row.diamondDue.toFixed(2),
      row.diamondOverdue.toFixed(2),
      row.amountOutstanding.toFixed(2),
    ]),
  ];

  return new NextResponse(toCsv(detailedRows), {
    headers: {
      "Content-Disposition": `attachment; filename="outstanding-statement-detailed-${customerId ? customerId : groupId ? `group-${groupId}` : "all"}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
