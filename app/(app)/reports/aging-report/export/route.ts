import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/auth";
import { agingBucketLabels, DEFAULT_AGING_THRESHOLDS } from "@/lib/aging-buckets";
import { getAgingReport, toCsv } from "@/lib/reports";

function parseThresholds(raw: string | null): number[] {
  if (!raw) return DEFAULT_AGING_THRESHOLDS;
  const parsed = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? parsed : DEFAULT_AGING_THRESHOLDS;
}

export async function GET(request: NextRequest) {
  await requireAuthenticatedUser();

  const thresholds = parseThresholds(request.nextUrl.searchParams.get("thresholds"));
  const buckets = agingBucketLabels(thresholds);
  const report = await getAgingReport(undefined, thresholds);
  const rows = [
    [
      "Customer",
      ...buckets.map((bucket) => `${bucket} Gold`),
      ...buckets.map((bucket) => `${bucket} Diamond`),
      "Total Outstanding",
    ],
    ...report.rows.map((row) => [
      row.customerName,
      ...buckets.map((bucket) => (row.buckets[bucket]?.gold ?? 0).toFixed(2)),
      ...buckets.map((bucket) => (row.buckets[bucket]?.diamond ?? 0).toFixed(2)),
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