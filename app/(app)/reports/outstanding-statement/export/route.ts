import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getOutstandingStatement, toCsv } from "@/lib/reports";

function formatAmount(value: number) {
  return value.toFixed(2);
}

function formatDueDays(days: number | null) {
  if (days === null) {
    return "-";
  }

  if (days > 0) {
    return `${days}d OD`;
  }

  if (days === 0) {
    return "Today";
  }

  return `${Math.abs(days)}d left`;
}

async function buildOutstandingStatementPdf(
  filters: { customerId?: string; customerLabel?: string; groupId?: string },
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
  drawText(`Company: ${filters.customerLabel ?? filters.customerId ?? "All companies"}`, 10, {
    color: { b: 0.3, g: 0.3, r: 0.3 },
  });
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
    { key: "goldOut", title: "G.Out", width: 46 },
    { key: "goldDue", title: "G.Due", width: 46 },
    { key: "goldDays", title: "G.Day", width: 44 },
    { key: "goldOver", title: "G.Over", width: 46 },
    { key: "diaOut", title: "D.Out", width: 46 },
    { key: "diaDue", title: "D.Due", width: 46 },
    { key: "diaDays", title: "D.Day", width: 44 },
    { key: "diaOver", title: "D.Over", width: 46 },
    { key: "total", title: "Total", width: 50 },
  ];

  const columnXByKey = new Map<string, number>();
  let x = margins.left;
  columns.forEach((column) => {
    columnXByKey.set(column.key, x);
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

  const columnX = (key: string) => columnXByKey.get(key) ?? margins.left;
  const showCustomerPerRow = !filters.customerId;

  rows.forEach((row) => {
    ensureSpace(showCustomerPerRow ? 22 : 14);
    drawText((row.entryType === "advance" ? "ADVANCE" : row.billNumber).slice(0, 14), 8, { x: columnX("invoice") });
    drawText(row.billDate, 8, { x: columnX("date") });
    drawText(formatAmount(row.goldOutstanding), 8, { x: columnX("goldOut") });
    drawText(formatAmount(row.goldDue), 8, { x: columnX("goldDue") });
    drawText(formatDueDays(row.goldDueDays), 8, { x: columnX("goldDays") });
    drawText(formatAmount(row.goldOverdue), 8, { x: columnX("goldOver") });
    drawText(formatAmount(row.diamondOutstanding), 8, { x: columnX("diaOut") });
    drawText(formatAmount(row.diamondDue), 8, { x: columnX("diaDue") });
    drawText(formatDueDays(row.diamondDueDays), 8, { x: columnX("diaDays") });
    drawText(formatAmount(row.diamondOverdue), 8, { x: columnX("diaOver") });
    drawText(formatAmount(row.amountOutstanding), 8, { x: columnX("total") });
    y -= 12;

    if (showCustomerPerRow) {
      drawText(`Customer: ${row.customerName}`.slice(0, 95), 8, {
        color: { b: 0.35, g: 0.35, r: 0.35 },
        x: margins.left,
      });
      y -= 10;
    } else {
      y -= 2;
    }
  });

  ensureSpace(220);
  y -= 8;
  drawText("Summary", 12, { bold: true });

  const panelWidth = pageSize.width - margins.left - margins.right;
  const panelHeight = 146;
  const panelTop = y - 10;
  const panelBottom = panelTop - panelHeight;
  const cardGap = 10;
  const cardWidth = (panelWidth - cardGap * 2 - 20) / 3;
  const cardHeight = 62;
  const cardsTop = panelTop - 12;
  const contentLeft = margins.left + 10;

  page.drawRectangle({
    borderColor: rgb(0.88, 0.88, 0.9),
    borderWidth: 1,
    color: rgb(0.985, 0.985, 0.99),
    height: panelHeight,
    width: panelWidth,
    x: margins.left,
    y: panelBottom,
  });

  const drawSummaryCard = (
    xPos: number,
    title: string,
    lines: string[],
    accent: { r: number; g: number; b: number },
  ) => {
    page.drawRectangle({
      borderColor: rgb(0.86, 0.86, 0.88),
      borderWidth: 1,
      color: rgb(1, 1, 1),
      height: cardHeight,
      width: cardWidth,
      x: xPos,
      y: cardsTop - cardHeight,
    });

    page.drawRectangle({
      color: rgb(accent.r, accent.g, accent.b),
      height: 3,
      width: cardWidth,
      x: xPos,
      y: cardsTop - 3,
    });

    page.drawText(title, {
      color: rgb(0.22, 0.22, 0.22),
      font: boldFont,
      size: 9,
      x: xPos + 8,
      y: cardsTop - 16,
    });

    lines.forEach((line, index) => {
      page.drawText(line, {
        color: rgb(0.3, 0.3, 0.3),
        font,
        size: 8,
        x: xPos + 8,
        y: cardsTop - 30 - index * 11,
      });
    });
  };

  drawSummaryCard(contentLeft, "Bills", [`Count: ${summary.billCount}`], { b: 0.18, g: 0.5, r: 0.75 });
  drawSummaryCard(
    contentLeft + cardWidth + cardGap,
    "Gold totals",
    [
      `Outstanding: ${formatAmount(summary.goldOutstanding)}`,
      `Due: ${formatAmount(summary.goldDue)}`,
      `Overdue: ${formatAmount(summary.goldOverdue)}`,
    ],
    { b: 0.24, g: 0.65, r: 0.87 },
  );
  drawSummaryCard(
    contentLeft + (cardWidth + cardGap) * 2,
    "Diamond totals",
    [
      `Outstanding: ${formatAmount(summary.diamondOutstanding)}`,
      `Due: ${formatAmount(summary.diamondDue)}`,
      `Overdue: ${formatAmount(summary.diamondOverdue)}`,
    ],
    { b: 0.78, g: 0.56, r: 0.25 },
  );

  const totalBarHeight = 44;
  const totalBarY = panelBottom + 12;
  page.drawRectangle({
    borderColor: rgb(0.8, 0.9, 0.84),
    borderWidth: 1,
    color: rgb(0.93, 0.98, 0.95),
    height: totalBarHeight,
    width: panelWidth - 20,
    x: contentLeft,
    y: totalBarY,
  });

  page.drawText("Grand Total", {
    color: rgb(0.15, 0.43, 0.24),
    font: boldFont,
    size: 11,
    x: contentLeft + 10,
    y: totalBarY + 16,
  });

  const totalValue = formatAmount(summary.totalOutstanding);
  const totalValueSize = 13;
  const totalValueWidth = boldFont.widthOfTextAtSize(totalValue, totalValueSize);
  page.drawText(totalValue, {
    color: rgb(0.11, 0.35, 0.2),
    font: boldFont,
    size: totalValueSize,
    x: contentLeft + (panelWidth - 20) - totalValueWidth - 10,
    y: totalBarY + 15,
  });

  y = panelBottom - 10;

  const bytes = await pdf.save();

  return bytes;
}

export async function GET(request: NextRequest) {
  await requireAuthenticatedUser();

  const customerId = request.nextUrl.searchParams.get("customer");
  const groupId = request.nextUrl.searchParams.get("group");
  const mode = request.nextUrl.searchParams.get("mode") === "pdf" ? "pdf" : "detailed";

  const rows = await getOutstandingStatement(customerId ?? undefined, groupId ?? undefined);
  const selectedCustomerName =
    customerId && rows.length > 0 ? rows.find((row) => row.customerName)?.customerName ?? customerId : undefined;
  const summary = rows.reduce(
    (acc, row) => ({
      billCount: acc.billCount + (row.entryType === "bill" ? 1 : 0),
      diamondDue: acc.diamondDue + row.diamondDue,
      diamondOutstanding: acc.diamondOutstanding + row.diamondOutstanding,
      diamondOverdue: acc.diamondOverdue + row.diamondOverdue,
      goldDue: acc.goldDue + row.goldDue,
      goldOutstanding: acc.goldOutstanding + row.goldOutstanding,
      goldOverdue: acc.goldOverdue + row.goldOverdue,
      totalOutstanding: acc.totalOutstanding + row.amountOutstanding,
    }),
    {
      billCount: 0,
      diamondDue: 0,
      diamondOutstanding: 0,
      diamondOverdue: 0,
      goldDue: 0,
      goldOutstanding: 0,
      goldOverdue: 0,
      totalOutstanding: 0,
    },
  );

  if (mode === "pdf") {
    const pdfBytes = await buildOutstandingStatementPdf(
      {
        customerId: customerId ?? undefined,
        customerLabel: selectedCustomerName,
        groupId: groupId ?? undefined,
      },
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
      "Gold Due Days",
      "Gold Overdue",
      "Diamond Outstanding",
      "Diamond Due",
      "Diamond Due Days",
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
      row.goldDueDays === null ? "" : row.goldDueDays.toString(),
      row.goldOverdue.toFixed(2),
      row.diamondOutstanding.toFixed(2),
      row.diamondDue.toFixed(2),
      row.diamondDueDays === null ? "" : row.diamondDueDays.toString(),
      row.diamondOverdue.toFixed(2),
      row.amountOutstanding.toFixed(2),
    ]),
    [],
    ["Summary"],
    ["Bills", summary.billCount.toString()],
    ["Gold totals"],
    ["Outstanding", summary.goldOutstanding.toFixed(2)],
    ["Due", summary.goldDue.toFixed(2)],
    ["Overdue", summary.goldOverdue.toFixed(2)],
    ["Diamond totals"],
    ["Outstanding", summary.diamondOutstanding.toFixed(2)],
    ["Due", summary.diamondDue.toFixed(2)],
    ["Overdue", summary.diamondOverdue.toFixed(2)],
    ["Grand Total", summary.totalOutstanding.toFixed(2)],
  ];

  return new NextResponse(toCsv(detailedRows), {
    headers: {
      "Content-Disposition": `attachment; filename="outstanding-statement-detailed-${customerId ? customerId : groupId ? `group-${groupId}` : "all"}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
