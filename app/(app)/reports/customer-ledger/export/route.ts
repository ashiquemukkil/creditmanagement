import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getCustomerLedger, toCsv } from "@/lib/reports";

export async function GET(request: NextRequest) {
  await requireAuthenticatedUser();

  const customerId = request.nextUrl.searchParams.get("customer");

  if (!customerId) {
    return new NextResponse("Missing customer query parameter.", { status: 400 });
  }

  const ledger = await getCustomerLedger(customerId);

  if (!ledger) {
    return new NextResponse("Customer not found.", { status: 404 });
  }

  const rows = [
    ["Date", "Reference", "Type", "Description", "Debit", "Credit", "Running Balance"],
    ...ledger.entries.map((entry) => [
      entry.date,
      entry.reference,
      entry.entryType,
      entry.description,
      entry.debit ? entry.debit.toFixed(2) : "",
      entry.credit ? entry.credit.toFixed(2) : "",
      entry.balance.toFixed(2),
    ]),
  ];

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Disposition": `attachment; filename="customer-ledger-${ledger.customerId}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}