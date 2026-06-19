import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/auth";
import { getAgingReport, toCsv } from "@/lib/reports";

const buckets = ["current", "1-15", "16-30", "31-60", "60+"] as const;

export async function GET() {
  await requireAuthenticatedUser();

  const report = await getAgingReport();
  const rows = [
    [
      "Customer",
      ...buckets.map((bucket) => `${bucket} Gold`),
      ...buckets.map((bucket) => `${bucket} Diamond`),
      "Total Outstanding",
    ],
    ...report.rows.map((row) => [
      row.customerName,
      ...buckets.map((bucket) => row.buckets[bucket].gold.toFixed(2)),
      ...buckets.map((bucket) => row.buckets[bucket].diamond.toFixed(2)),
      row.totalOutstanding.toFixed(2),
    ]),
  ];

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Disposition": 'attachment; filename="aging-report.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}