"use server";

import { revalidatePath } from "next/cache";

import { requireTeamMember } from "@/lib/auth";
import {
  createBillFromEntry,
  createPaymentFromEntry,
  parseBillEntryInput,
  parsePaymentEntryInput,
} from "@/lib/entry-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type BulkBillCommitRow = {
  billDate: string;
  billNumber: string;
  customerId: string;
  diamondAmount: number;
  goldAmount: number;
  rowNumber: number;
};

type BulkPaymentCommitRow = {
  amount: number;
  customerId: string;
  notes: string | null;
  paymentDate: string;
  rowNumber: number;
};

export async function commitBulkBillsAction(rows: BulkBillCommitRow[]) {
  const user = await requireTeamMember();
  const supabase = await createSupabaseServerClient();
  const created: Array<{ billId: string; billNumber: string; customerId: string; rowNumber: number }> = [];
  const skipped: Array<{ reason: string; rowNumber: number }> = [];

  for (const row of rows) {
    try {
      const payload = parseBillEntryInput({
        billDate: row.billDate,
        billNumber: row.billNumber,
        customerId: row.customerId,
        diamondAmount: row.diamondAmount,
        goldAmount: row.goldAmount,
      });
      const result = await createBillFromEntry(payload, user.id, supabase);
      created.push({ ...result, rowNumber: row.rowNumber });
    } catch (error) {
      skipped.push({
        reason: error instanceof Error ? error.message : "Unknown error",
        rowNumber: row.rowNumber,
      });
    }
  }

  revalidatePath("/bills");
  revalidatePath("/customers");

  return {
    created,
    createdCount: created.length,
    skipped,
    skippedCount: skipped.length,
  };
}

export async function commitBulkPaymentsAction(rows: BulkPaymentCommitRow[]) {
  const user = await requireTeamMember();
  const supabase = await createSupabaseServerClient();
  const created: Array<{ customerId: string; paymentId: string; rowNumber: number }> = [];
  const skipped: Array<{ reason: string; rowNumber: number }> = [];

  for (const row of rows) {
    try {
      const payload = parsePaymentEntryInput({
        amount: row.amount,
        customerId: row.customerId,
        notes: row.notes,
        paymentDate: row.paymentDate,
      });
      const result = await createPaymentFromEntry(payload, user.id, supabase);
      created.push({ ...result, rowNumber: row.rowNumber });
    } catch (error) {
      skipped.push({
        reason: error instanceof Error ? error.message : "Unknown error",
        rowNumber: row.rowNumber,
      });
    }
  }

  revalidatePath("/payments");
  revalidatePath("/bills");
  revalidatePath("/customers");

  return {
    created,
    createdCount: created.length,
    skipped,
    skippedCount: skipped.length,
  };
}