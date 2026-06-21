"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { requireTeamMember } from "@/lib/auth";
import { createPaymentFromEntry, parsePaymentEntryInput } from "@/lib/entry-operations";
import {
  billOutstandingDiamondAmount,
  billOutstandingGoldAmount,
  calculateDaysOverdue,
} from "@/lib/bills";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ManualAllocationInput = {
  allocatedTo: "gold" | "diamond";
  amount: number;
  billId: string;
};

type AllocationMode = "automatic" | "manual";

export type AllocatableBillLine = {
  allocatedTo: "gold" | "diamond";
  billDate: string;
  billId: string;
  billNumber: string;
  daysOverdue: number;
  dueDate: string | null;
  key: string;
  outstandingAmount: number;
};

function parseAllocationMode(value: FormDataEntryValue | null): AllocationMode {
  return value === "manual" ? "manual" : "automatic";
}

function parseManualAllocations(formData: FormData): ManualAllocationInput[] {
  const raw = String(formData.get("manual_allocations") || "[]");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Manual allocations are invalid.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Manual allocations are invalid.");
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Manual allocations are invalid.");
    }

    const billId = String((entry as { billId?: unknown }).billId || "").trim();
    const allocatedTo = String((entry as { allocatedTo?: unknown }).allocatedTo || "").trim();
    const amount = Number((entry as { amount?: unknown }).amount || 0);

    if (!billId) {
      throw new Error("Manual allocation requires a bill.");
    }

    if (allocatedTo !== "gold" && allocatedTo !== "diamond") {
      throw new Error("Manual allocation type is invalid.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Manual allocation amount must be greater than zero.");
    }

    return {
      allocatedTo,
      amount: Number(amount.toFixed(2)),
      billId,
    };
  });
}

export async function createPaymentAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireTeamMember();
    const allocationMode = parseAllocationMode(formData.get("allocation_mode"));
    const manualAllocations =
      allocationMode === "manual" ? parseManualAllocations(formData) : undefined;
    const payload = parsePaymentEntryInput({
      amount: String(formData.get("amount") || 0),
      customerId: String(formData.get("customer_id") || ""),
      notes: String(formData.get("notes") || ""),
      paymentDate: String(formData.get("payment_date") || ""),
    });
    const supabase = await createSupabaseServerClient();
    await createPaymentFromEntry(payload, user.id, supabase, {
      manualAllocations,
    });

    revalidatePath("/payments");
    revalidatePath(`/customers/${payload.customerId}`);
    revalidatePath("/bills");
    revalidatePath("/customers");

    return {
      message: "Payment created.",
      ok: true,
      redirectTo: `/customers/${payload.customerId}`,
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}

export async function listAllocatableBillLinesAction(
  customerId: string,
): Promise<AllocatableBillLine[]> {
  await requireTeamMember();

  const trimmedCustomerId = customerId.trim();
  if (!trimmedCustomerId) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, bill_number, bill_date, gold_due_date, diamond_due_date, gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond, status",
    )
    .eq("customer_id", trimmedCustomerId)
    .in("status", ["open", "partial"])
    .order("bill_date", { ascending: true });

  if (error) {
    throw error;
  }

  const billRows =
    (data as Array<{
      amount_paid_diamond: number;
      amount_paid_gold: number;
      bill_date: string;
      bill_number: string;
      diamond_amount: number;
      diamond_due_date: string | null;
      gold_amount: number;
      gold_due_date: string | null;
      id: string;
    }> | null) ?? [];

  return billRows
    .flatMap((bill) => {
      const lines: AllocatableBillLine[] = [];
      const outstandingGoldAmount = billOutstandingGoldAmount(bill);
      const outstandingDiamondAmount = billOutstandingDiamondAmount(bill);

      if (outstandingGoldAmount > 0) {
        lines.push({
          allocatedTo: "gold",
          billDate: bill.bill_date,
          billId: bill.id,
          billNumber: bill.bill_number,
          daysOverdue: calculateDaysOverdue(bill.gold_due_date),
          dueDate: bill.gold_due_date,
          key: `${bill.id}:gold`,
          outstandingAmount: Number(outstandingGoldAmount.toFixed(2)),
        });
      }

      if (outstandingDiamondAmount > 0) {
        lines.push({
          allocatedTo: "diamond",
          billDate: bill.bill_date,
          billId: bill.id,
          billNumber: bill.bill_number,
          daysOverdue: calculateDaysOverdue(bill.diamond_due_date),
          dueDate: bill.diamond_due_date,
          key: `${bill.id}:diamond`,
          outstandingAmount: Number(outstandingDiamondAmount.toFixed(2)),
        });
      }

      return lines;
    })
    .sort((left, right) => {
      if (left.daysOverdue !== right.daysOverdue) {
        return right.daysOverdue - left.daysOverdue;
      }

      if (left.allocatedTo !== right.allocatedTo) {
        return left.allocatedTo === "gold" ? -1 : 1;
      }

      if (left.billDate !== right.billDate) {
        return left.billDate.localeCompare(right.billDate);
      }

      return left.billId.localeCompare(right.billId);
    });
}