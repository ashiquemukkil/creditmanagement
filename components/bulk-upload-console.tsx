"use client";

import Link from "next/link";
import * as XLSX from "xlsx";
import { useMemo, useState, useTransition } from "react";

import { commitBulkBillsAction, commitBulkPaymentsAction } from "@/app/(app)/bulk-upload/actions";
import { useToast } from "@/components/toast-provider";

type BulkUploadTab = "bills" | "payments";

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type BillPreviewRow = {
  billDate: string | null;
  billNumber: string;
  customerId: string | null;
  customerName: string;
  diamondAmount: number | null;
  errors: string[];
  goldAmount: number | null;
  rowNumber: number;
  valid: boolean;
};

type PaymentPreviewRow = {
  amount: number | null;
  customerId: string | null;
  customerName: string;
  errors: string[];
  notes: string;
  paymentDate: string | null;
  rowNumber: number;
  valid: boolean;
};

type BulkUploadConsoleProps = {
  customers: CustomerOption[];
  existingBillNumbers: string[];
};

const billTemplateColumns = ["customer_name", "bill_number", "bill_date", "gold_amount", "diamond_amount"];
const paymentTemplateColumns = ["customer_name", "payment_date", "amount", "notes"];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return date.toISOString().slice(0, 10);
  }

  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const parsed = new Date(text.includes("T") ? text : `${text}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parsePositiveAmount(value: unknown) {
  const amount = Number(String(value ?? "").trim());
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null;
}

function parseNonNegativeAmount(value: unknown) {
  const text = String(value ?? "").trim();

  if (!text) {
    return 0;
  }

  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

export function BulkUploadConsole({ customers, existingBillNumbers }: BulkUploadConsoleProps) {
  const [activeTab, setActiveTab] = useState<BulkUploadTab>("bills");
  const [isParsing, setIsParsing] = useState(false);
  const [previewRows, setPreviewRows] = useState<Array<BillPreviewRow | PaymentPreviewRow>>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<null | {
    createdBills?: Array<{ billId: string; billNumber: string; customerId: string; rowNumber: number }>;
    createdCount: number;
    createdPayments?: Array<{ customerId: string; paymentId: string; rowNumber: number }>;
    skipped: Array<{ reason: string; rowNumber: number }>;
    skippedCount: number;
    tab: BulkUploadTab;
  }>(null);
  const [isPending, startTransition] = useTransition();
  const { showError, showSuccess } = useToast();

  const customerMatches = useMemo(() => {
    const map = new Map<string, CustomerOption[]>();

    customers.forEach((customer) => {
      const key = normalizeText(customer.name);
      map.set(key, [...(map.get(key) ?? []), customer]);
    });

    return map;
  }, [customers]);

  const existingBillNumbersSet = useMemo(
    () => new Set(existingBillNumbers.map((value) => normalizeText(value))),
    [existingBillNumbers],
  );

  const validRows = previewRows.filter((row) => row.valid);
  const invalidRows = previewRows.filter((row) => !row.valid);

  function downloadTemplate(tab: BulkUploadTab) {
    const workbook = XLSX.utils.book_new();
    const headers = tab === "bills" ? billTemplateColumns : paymentTemplateColumns;
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(workbook, worksheet, tab === "bills" ? "Bills" : "Payments");
    XLSX.writeFileXLSX(workbook, tab === "bills" ? "bills-template.xlsx" : "payments-template.xlsx");
  }

  function resetPreview() {
    setPreviewRows([]);
    setUploadError(null);
    setCommitSummary(null);
  }

  function validateBillRows(rows: unknown[][]) {
    const seenBillNumbers = new Set<string>();

    return rows
      .map((values, index) => {
        const rowNumber = index + 2;
        const customerName = String(values[0] ?? "").trim();
        const billNumber = String(values[1] ?? "").trim();
        const billDate = toIsoDate(values[2]);
        const goldAmount = parseNonNegativeAmount(values[3]);
        const diamondAmount = parseNonNegativeAmount(values[4]);
        const errors: string[] = [];
        const customerOptions = customerMatches.get(normalizeText(customerName)) ?? [];
        const normalizedBillNumber = normalizeText(billNumber);

        if (customerOptions.length === 0) {
          errors.push("customer not found");
        }

        if (customerOptions.length > 1) {
          errors.push("multiple customers match name");
        }

        if (!billNumber) {
          errors.push("bill number required");
        }

        if (existingBillNumbersSet.has(normalizedBillNumber)) {
          errors.push("bill number already exists");
        }

        if (seenBillNumbers.has(normalizedBillNumber)) {
          errors.push("bill number duplicated in sheet");
        }

        if (billNumber) {
          seenBillNumbers.add(normalizedBillNumber);
        }

        if (!billDate) {
          errors.push("invalid bill_date");
        }

        if (goldAmount === null) {
          errors.push("invalid gold_amount");
        }

        if (diamondAmount === null) {
          errors.push("invalid diamond_amount");
        }

        if ((goldAmount ?? 0) <= 0 && (diamondAmount ?? 0) <= 0) {
          errors.push("at least one bill amount must be greater than zero");
        }

        return {
          billDate,
          billNumber,
          customerId: customerOptions.length === 1 ? customerOptions[0].id : null,
          customerName,
          diamondAmount,
          errors,
          goldAmount,
          rowNumber,
          valid: errors.length === 0,
        } satisfies BillPreviewRow;
      })
      .filter(
        (row) =>
          row.customerName ||
          row.billNumber ||
          row.billDate ||
          row.goldAmount !== null ||
          row.diamondAmount !== null,
      );
  }

  function validatePaymentRows(rows: unknown[][]) {
    return rows
      .map((values, index) => {
        const rowNumber = index + 2;
        const customerName = String(values[0] ?? "").trim();
        const paymentDate = toIsoDate(values[1]);
        const amount = parsePositiveAmount(values[2]);
        const notes = String(values[3] ?? "").trim();
        const errors: string[] = [];
        const customerOptions = customerMatches.get(normalizeText(customerName)) ?? [];

        if (customerOptions.length === 0) {
          errors.push("customer not found");
        }

        if (customerOptions.length > 1) {
          errors.push("multiple customers match name");
        }

        if (!paymentDate) {
          errors.push("invalid payment_date");
        }

        if (amount === null) {
          errors.push("invalid amount");
        }

        return {
          amount,
          customerId: customerOptions.length === 1 ? customerOptions[0].id : null,
          customerName,
          errors,
          notes,
          paymentDate,
          rowNumber,
          valid: errors.length === 0,
        } satisfies PaymentPreviewRow;
      })
      .filter((row) => row.customerName || row.paymentDate || row.amount !== null || row.notes);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    resetPreview();
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        defval: "",
        header: 1,
        raw: true,
      });

      if (rows.length === 0) {
        setUploadError("The uploaded file is empty.");
        return;
      }

      const headerRow = (rows[0] ?? []).map((value) => String(value).trim());
      const expectedHeaders = activeTab === "bills" ? billTemplateColumns : paymentTemplateColumns;

      if (
        headerRow.length !== expectedHeaders.length ||
        headerRow.some((header, index) => header !== expectedHeaders[index])
      ) {
        setUploadError(`Invalid columns. Expected: ${expectedHeaders.join(", ")}`);
        return;
      }

      const dataRows = rows.slice(1);
      const preview = activeTab === "bills" ? validateBillRows(dataRows) : validatePaymentRows(dataRows);
      setPreviewRows(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse the workbook.";
      setUploadError(message);
      showError(message);
    } finally {
      setIsParsing(false);
    }
  }

  function commitValidRows() {
    setCommitSummary(null);

    startTransition(async () => {
      if (activeTab === "bills") {
        const rows = validRows as BillPreviewRow[];
        const result = await commitBulkBillsAction(
          rows.map((row) => ({
            billDate: row.billDate ?? "",
            billNumber: row.billNumber,
            customerId: row.customerId ?? "",
            diamondAmount: row.diamondAmount ?? 0,
            goldAmount: row.goldAmount ?? 0,
            rowNumber: row.rowNumber,
          })),
        );

        setCommitSummary({
          createdBills: result.created,
          createdCount: result.createdCount,
          skipped: [...invalidRows.map((row) => ({ reason: row.errors.join(", "), rowNumber: row.rowNumber })), ...result.skipped],
          skippedCount: invalidRows.length + result.skippedCount,
          tab: "bills",
        });
        showSuccess(`Created ${result.createdCount} bills. Skipped ${invalidRows.length + result.skippedCount} rows.`);
        return;
      }

      const rows = validRows as PaymentPreviewRow[];
      const result = await commitBulkPaymentsAction(
        rows.map((row) => ({
          amount: row.amount ?? 0,
          customerId: row.customerId ?? "",
          notes: row.notes || null,
          paymentDate: row.paymentDate ?? "",
          rowNumber: row.rowNumber,
        })),
      );

      setCommitSummary({
        createdCount: result.createdCount,
        createdPayments: result.created,
        skipped: [...invalidRows.map((row) => ({ reason: row.errors.join(", "), rowNumber: row.rowNumber })), ...result.skipped],
        skippedCount: invalidRows.length + result.skippedCount,
        tab: "payments",
      });
      showSuccess(`Created ${result.createdCount} payments. Skipped ${invalidRows.length + result.skippedCount} rows.`);
    });
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">Bulk Upload</p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Spreadsheet import</h2>
        <p className="max-w-3xl text-sm leading-7 text-stone-600">
          Download the template, fill it in, preview every row with validation, and commit only the valid rows.
        </p>
      </div>

      <div className="flex gap-3">
        {(["bills", "payments"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              resetPreview();
            }}
            className={`rounded-2xl px-5 py-3 text-sm font-medium transition ${
              activeTab === tab ? "bg-stone-950 text-white" : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
            }`}
          >
            {tab === "bills" ? "Bills" : "Payments"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-[auto_1fr] md:items-end">
        <button
          type="button"
          onClick={() => downloadTemplate(activeTab)}
          className="rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-950 transition hover:bg-stone-50"
        >
          Download template
        </button>

        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Upload .xlsx file</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={isParsing || isPending}
            onChange={handleFileChange}
            className="block w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950"
          />
          <span className="block text-xs font-normal text-stone-500">
            {isParsing ? "Parsing workbook..." : "The first row must match the template headers exactly."}
          </span>
        </label>
      </div>

      {uploadError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{uploadError}</div>
      ) : null}

      {previewRows.length > 0 ? (
        <>
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm text-sm text-stone-700">
            <span className="font-medium text-stone-950">{validRows.length} valid rows</span>, {invalidRows.length} rows with errors
          </div>

          <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                <tr>
                  <th className="px-5 py-4">Row</th>
                  <th className="px-5 py-4">Customer</th>
                  {activeTab === "bills" ? <th className="px-5 py-4">Bill #</th> : null}
                  <th className="px-5 py-4">Date</th>
                  {activeTab === "bills" ? <th className="px-5 py-4">Gold</th> : null}
                  {activeTab === "bills" ? <th className="px-5 py-4">Diamond</th> : <th className="px-5 py-4">Amount</th>}
                  {activeTab === "payments" ? <th className="px-5 py-4">Notes</th> : null}
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {previewRows.map((row) => (
                  <tr key={row.rowNumber} className={row.valid ? "bg-white" : "bg-rose-50/50"}>
                    <td className="px-5 py-4 font-medium text-stone-950">{row.rowNumber}</td>
                    <td className="px-5 py-4">{row.customerName}</td>
                    {"billNumber" in row ? <td className="px-5 py-4">{row.billNumber}</td> : null}
                    <td className="px-5 py-4">{"billDate" in row ? row.billDate || "-" : row.paymentDate || "-"}</td>
                    {"goldAmount" in row ? <td className="px-5 py-4">{row.goldAmount ?? "-"}</td> : null}
                    <td className="px-5 py-4">{"diamondAmount" in row ? row.diamondAmount ?? "-" : row.amount ?? "-"}</td>
                    {"notes" in row ? <td className="px-5 py-4">{row.notes || "-"}</td> : null}
                    <td className="px-5 py-4">
                      {row.valid ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
                          valid
                        </span>
                      ) : (
                        <div className="space-y-1 text-xs text-rose-700">
                          {row.errors.map((error) => (
                            <div key={`${row.rowNumber}-${error}`}>{error}</div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invalidRows.length > 0 ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-stone-950">Skipped rows</h3>
              <div className="mt-4 space-y-2 text-sm text-stone-700">
                {invalidRows.map((row) => (
                  <div key={`skipped-${row.rowNumber}`}>
                    Row {row.rowNumber}: {row.errors.join(", ")}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <button
              type="button"
              disabled={validRows.length === 0 || isPending}
              onClick={commitValidRows}
              className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isPending ? "Committing..." : `Commit ${validRows.length} valid rows`}
            </button>
          </div>
        </>
      ) : null}

      {commitSummary ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-stone-950">Commit results</h3>
          <p className="text-sm text-stone-700">
            Created {commitSummary.createdCount} {commitSummary.tab}, skipped {commitSummary.skippedCount} rows.
          </p>

          {commitSummary.createdPayments?.length ? (
            <div className="space-y-2 text-sm text-stone-700">
              <p className="font-medium text-stone-950">Payment allocation links</p>
              {commitSummary.createdPayments.map((payment) => (
                <Link
                  key={payment.paymentId}
                  href={`/reports/payment-allocation?payment=${payment.paymentId}`}
                  className="block text-amber-700 hover:text-amber-800"
                >
                  Row {payment.rowNumber}: View allocation for payment {payment.paymentId}
                </Link>
              ))}
            </div>
          ) : null}

          {commitSummary.skipped.length ? (
            <div className="space-y-2 text-sm text-stone-700">
              <p className="font-medium text-stone-950">Skipped on commit</p>
              {commitSummary.skipped.map((row) => (
                <div key={`commit-skip-${row.rowNumber}-${row.reason}`}>
                  Row {row.rowNumber}: {row.reason}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}