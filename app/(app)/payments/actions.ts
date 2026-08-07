"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { requireTeamMember } from "@/lib/auth";
import { createPaymentFromEntry, parsePaymentEntryInput } from "@/lib/entry-operations";
import {
  billOutstandingDiamondAmount,
  billOutstandingGoldAmount,
  calculateDaysOverdue,
} from "@/lib/bills";
import { getPaymentById } from "@/lib/payments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ManualAllocationInput = {
  allocatedTo: "gold" | "diamond";
  amount: number;
  billId: string;
};

type AllocationMode = "automatic" | "manual";

type BillStatus = "closed" | "open" | "partial";

type PaymentAllocationRow = {
  allocated_to: "gold" | "diamond";
  amount_allocated: number;
  bill_id: string;
};

type BillAllocationCandidate = {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  bill_date: string;
  bill_number: string;
  diamond_amount: number;
  diamond_due_date: string | null;
  gold_amount: number;
  gold_due_date: string | null;
  id: string;
};

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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function getBillStatus(bill: {
  amount_paid_diamond: number;
  amount_paid_gold: number;
  diamond_amount: number;
  gold_amount: number;
}): BillStatus {
  const outstandingGold = Math.max(Number(bill.gold_amount) - Number(bill.amount_paid_gold), 0);
  const outstandingDiamond = Math.max(
    Number(bill.diamond_amount) - Number(bill.amount_paid_diamond),
    0,
  );

  if (outstandingGold === 0 && outstandingDiamond === 0) {
    return "closed";
  }

  if (Number(bill.amount_paid_gold) > 0 || Number(bill.amount_paid_diamond) > 0) {
    return "partial";
  }

  return "open";
}

async function syncBillStatuses(supabase: SupabaseClient, billIds: string[]) {
  if (billIds.length === 0) {
    return;
  }

  const { data: bills, error } = await supabase
    .from("bills")
    .select("id, gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond")
    .in("id", billIds);

  if (error) {
    throw error;
  }

  for (const bill of
    (bills as Array<{
      amount_paid_diamond: number;
      amount_paid_gold: number;
      diamond_amount: number;
      gold_amount: number;
      id: string;
    }> | null) ?? []) {
    const nextGoldPaid = Math.min(
      Math.max(roundMoney(Number(bill.amount_paid_gold)), 0),
      roundMoney(Number(bill.gold_amount)),
    );
    const nextDiamondPaid = Math.min(
      Math.max(roundMoney(Number(bill.amount_paid_diamond)), 0),
      roundMoney(Number(bill.diamond_amount)),
    );

    const { error: updateError } = await supabase
      .from("bills")
      .update({
        amount_paid_diamond: nextDiamondPaid,
        amount_paid_gold: nextGoldPaid,
        status: getBillStatus({
          amount_paid_diamond: nextDiamondPaid,
          amount_paid_gold: nextGoldPaid,
          diamond_amount: Number(bill.diamond_amount),
          gold_amount: Number(bill.gold_amount),
        }),
      })
      .eq("id", bill.id);

    if (updateError) {
      throw updateError;
    }
  }
}

async function syncCustomerAdvanceAmount(supabase: SupabaseClient, customerId: string) {
  const { data: payments, error } = await supabase
    .from("payments")
    .select("amount, payment_allocations(amount_allocated)")
    .eq("customer_id", customerId);

  if (error) {
    throw error;
  }

  const advanceAmount = ((payments ?? []) as Array<{
    amount: number;
    payment_allocations:
      | Array<{
          amount_allocated: number;
        }>
      | null;
  }>).reduce((sum, payment) => {
    const allocated = (payment.payment_allocations ?? []).reduce((innerSum, allocation) => {
      return innerSum + Number(allocation.amount_allocated);
    }, 0);

    return sum + Math.max(Number(payment.amount) - allocated, 0);
  }, 0);

  const { error: updateError } = await supabase
    .from("customers")
    .update({ advance_amount: roundMoney(advanceAmount) })
    .eq("id", customerId);

  if (updateError) {
    throw updateError;
  }
}

async function clearPaymentAllocations(
  supabase: SupabaseClient,
  paymentId: string,
): Promise<string[]> {
  const { data: allocations, error: allocationsError } = await supabase
    .from("payment_allocations")
    .select("bill_id, allocated_to, amount_allocated")
    .eq("payment_id", paymentId);

  if (allocationsError) {
    throw allocationsError;
  }

  const deltaByBill = new Map<string, { diamond: number; gold: number }>();

  for (const allocation of (allocations ?? []) as PaymentAllocationRow[]) {
    const existing = deltaByBill.get(allocation.bill_id) ?? { diamond: 0, gold: 0 };

    if (allocation.allocated_to === "gold") {
      existing.gold = roundMoney(existing.gold + Number(allocation.amount_allocated));
    } else {
      existing.diamond = roundMoney(existing.diamond + Number(allocation.amount_allocated));
    }

    deltaByBill.set(allocation.bill_id, existing);
  }

  const billIds = [...deltaByBill.keys()];

  if (billIds.length > 0) {
    const { data: bills, error: billsError } = await supabase
      .from("bills")
      .select("id, gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond")
      .in("id", billIds);

    if (billsError) {
      throw billsError;
    }

    for (const bill of
      (bills as Array<{
        amount_paid_diamond: number;
        amount_paid_gold: number;
        diamond_amount: number;
        gold_amount: number;
        id: string;
      }> | null) ?? []) {
      const delta = deltaByBill.get(bill.id) ?? { diamond: 0, gold: 0 };
      const nextGoldPaid = Math.max(roundMoney(Number(bill.amount_paid_gold) - delta.gold), 0);
      const nextDiamondPaid = Math.max(
        roundMoney(Number(bill.amount_paid_diamond) - delta.diamond),
        0,
      );

      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid_diamond: nextDiamondPaid,
          amount_paid_gold: nextGoldPaid,
        })
        .eq("id", bill.id);

      if (updateError) {
        throw updateError;
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("payment_allocations")
    .delete()
    .eq("payment_id", paymentId);

  if (deleteError) {
    throw deleteError;
  }

  await syncBillStatuses(supabase, billIds);

  return billIds;
}

function toAllocatableLines(bills: BillAllocationCandidate[]): AllocatableBillLine[] {
  const lines = bills.flatMap((bill) => {
    const entries: AllocatableBillLine[] = [];
    const outstandingGoldAmount = billOutstandingGoldAmount(bill);
    const outstandingDiamondAmount = billOutstandingDiamondAmount(bill);

    if (outstandingGoldAmount > 0) {
      entries.push({
        allocatedTo: "gold",
        billDate: bill.bill_date,
        billId: bill.id,
        billNumber: bill.bill_number,
        daysOverdue: calculateDaysOverdue(bill.gold_due_date),
        dueDate: bill.gold_due_date,
        key: `${bill.id}:gold`,
        outstandingAmount: roundMoney(outstandingGoldAmount),
      });
    }

    if (outstandingDiamondAmount > 0) {
      entries.push({
        allocatedTo: "diamond",
        billDate: bill.bill_date,
        billId: bill.id,
        billNumber: bill.bill_number,
        daysOverdue: calculateDaysOverdue(bill.diamond_due_date),
        dueDate: bill.diamond_due_date,
        key: `${bill.id}:diamond`,
        outstandingAmount: roundMoney(outstandingDiamondAmount),
      });
    }

    return entries;
  });

  const billPriority = new Map<
    string,
    {
      billDate: string;
      earliestDueDate: string | null;
      maxDaysOverdue: number;
    }
  >();

  for (const line of lines) {
    const existing = billPriority.get(line.billId);

    if (!existing) {
      billPriority.set(line.billId, {
        billDate: line.billDate,
        earliestDueDate: line.dueDate,
        maxDaysOverdue: line.daysOverdue,
      });
      continue;
    }

    billPriority.set(line.billId, {
      billDate: existing.billDate <= line.billDate ? existing.billDate : line.billDate,
      earliestDueDate:
        existing.earliestDueDate === null
          ? line.dueDate
          : line.dueDate === null
            ? existing.earliestDueDate
            : existing.earliestDueDate <= line.dueDate
              ? existing.earliestDueDate
              : line.dueDate,
      maxDaysOverdue: Math.max(existing.maxDaysOverdue, line.daysOverdue),
    });
  }

  return lines.sort((left, right) => {
    const leftBill = billPriority.get(left.billId);
    const rightBill = billPriority.get(right.billId);

    if (leftBill && rightBill) {
      if (leftBill.maxDaysOverdue !== rightBill.maxDaysOverdue) {
        return rightBill.maxDaysOverdue - leftBill.maxDaysOverdue;
      }

      if (leftBill.earliestDueDate !== rightBill.earliestDueDate) {
        if (leftBill.earliestDueDate === null) {
          return 1;
        }

        if (rightBill.earliestDueDate === null) {
          return -1;
        }

        return leftBill.earliestDueDate.localeCompare(rightBill.earliestDueDate);
      }

      if (leftBill.billDate !== rightBill.billDate) {
        return leftBill.billDate.localeCompare(rightBill.billDate);
      }
    }

    if (left.billId !== right.billId) {
      return left.billId.localeCompare(right.billId);
    }

    if (left.daysOverdue !== right.daysOverdue) {
      return right.daysOverdue - left.daysOverdue;
    }

    if (left.dueDate !== right.dueDate) {
      if (left.dueDate === null) {
        return 1;
      }

      if (right.dueDate === null) {
        return -1;
      }

      return left.dueDate.localeCompare(right.dueDate);
    }

    if (left.allocatedTo !== right.allocatedTo) {
      return left.allocatedTo === "gold" ? -1 : 1;
    }

    return 0;
  });
}

async function applyAllocationsToPayment(
  supabase: SupabaseClient,
  input: {
    amount: number;
    customerId: string;
    manualAllocations?: ManualAllocationInput[];
    paymentId: string;
  },
) {
  const { data: bills, error } = await supabase
    .from("bills")
    .select(
      "id, bill_number, bill_date, gold_due_date, diamond_due_date, gold_amount, diamond_amount, amount_paid_gold, amount_paid_diamond",
    )
    .eq("customer_id", input.customerId);

  if (error) {
    throw error;
  }

  const billCandidates = (bills ?? []) as BillAllocationCandidate[];
  const allocatableLines = toAllocatableLines(billCandidates);

  let allocations: ManualAllocationInput[];

  if (input.manualAllocations !== undefined) {
    const availableByKey = new Map(allocatableLines.map((line) => [line.key, line.outstandingAmount]));
    const requestedByKey = new Map<string, number>();
    let requestedTotal = 0;

    for (const allocation of input.manualAllocations) {
      const key = `${allocation.billId}:${allocation.allocatedTo}`;
      const available = availableByKey.get(key);

      if (available === undefined) {
        throw new Error("Manual allocation bill was not found for the selected customer.");
      }

      const nextRequested = roundMoney((requestedByKey.get(key) ?? 0) + allocation.amount);

      if (nextRequested > available) {
        throw new Error("Manual allocation exceeds outstanding amount for a bill portion.");
      }

      requestedByKey.set(key, nextRequested);
      requestedTotal = roundMoney(requestedTotal + allocation.amount);
    }

    if (requestedTotal > input.amount) {
      throw new Error("Manual allocation total exceeds payment amount.");
    }

    allocations = input.manualAllocations;
  } else {
    let remaining = input.amount;
    allocations = [];

    for (const line of allocatableLines) {
      if (remaining <= 0) {
        break;
      }

      const allocationAmount = roundMoney(Math.min(remaining, line.outstandingAmount));

      if (allocationAmount <= 0) {
        continue;
      }

      allocations.push({
        allocatedTo: line.allocatedTo,
        amount: allocationAmount,
        billId: line.billId,
      });

      remaining = roundMoney(remaining - allocationAmount);
    }
  }

  const affectedBillIds = new Set<string>();

  for (const allocation of allocations) {
    const amount = roundMoney(allocation.amount);

    if (amount <= 0) {
      continue;
    }

    affectedBillIds.add(allocation.billId);

    const { error: insertError } = await supabase.from("payment_allocations").insert({
      allocated_to: allocation.allocatedTo,
      amount_allocated: amount,
      bill_id: allocation.billId,
      payment_id: input.paymentId,
    });

    if (insertError) {
      throw insertError;
    }

    if (allocation.allocatedTo === "gold") {
      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid_gold: roundMoney(
            Number(
              (
                billCandidates.find((entry) => entry.id === allocation.billId)?.amount_paid_gold ?? 0
              ) + amount,
            ),
          ),
        })
        .eq("id", allocation.billId);

      if (updateError) {
        throw updateError;
      }

      const matchedBill = billCandidates.find((entry) => entry.id === allocation.billId);
      if (matchedBill) {
        matchedBill.amount_paid_gold = roundMoney(Number(matchedBill.amount_paid_gold) + amount);
      }
    } else {
      const { error: updateError } = await supabase
        .from("bills")
        .update({
          amount_paid_diamond: roundMoney(
            Number(
              (
                billCandidates.find((entry) => entry.id === allocation.billId)?.amount_paid_diamond ?? 0
              ) + amount,
            ),
          ),
        })
        .eq("id", allocation.billId);

      if (updateError) {
        throw updateError;
      }

      const matchedBill = billCandidates.find((entry) => entry.id === allocation.billId);
      if (matchedBill) {
        matchedBill.amount_paid_diamond = roundMoney(
          Number(matchedBill.amount_paid_diamond) + amount,
        );
      }
    }
  }

  await syncBillStatuses(supabase, [...affectedBillIds]);
}

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

export async function updatePaymentAction(
  paymentId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireTeamMember();

    if (!paymentId) {
      throw new Error("Payment ID is required.");
    }

    const allocationMode = parseAllocationMode(formData.get("allocation_mode"));
    const manualAllocations =
      allocationMode === "manual" ? parseManualAllocations(formData) : undefined;
    const payload = parsePaymentEntryInput({
      amount: String(formData.get("amount") || 0),
      customerId: String(formData.get("customer_id") || ""),
      notes: String(formData.get("notes") || ""),
      paymentDate: String(formData.get("payment_date") || ""),
    });

    const existingPayment = await getPaymentById(paymentId);

    if (!existingPayment) {
      throw new Error("Payment not found.");
    }

    const supabase = await createSupabaseServerClient();
    const affectedBillIds = await clearPaymentAllocations(supabase, paymentId);

    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({
        amount: payload.amount,
        customer_id: payload.customerId,
        notes: payload.notes,
        payment_date: payload.paymentDate,
      })
      .eq("id", paymentId);

    if (updatePaymentError) {
      throw updatePaymentError;
    }

    await applyAllocationsToPayment(supabase, {
      amount: payload.amount,
      customerId: payload.customerId,
      manualAllocations,
      paymentId,
    });

    await syncBillStatuses(supabase, affectedBillIds);
    await syncCustomerAdvanceAmount(supabase, existingPayment.customer_id);

    if (existingPayment.customer_id !== payload.customerId) {
      await syncCustomerAdvanceAmount(supabase, payload.customerId);
    }

    revalidatePath("/payments");
    revalidatePath(`/customers/${existingPayment.customer_id}`);
    revalidatePath(`/customers/${payload.customerId}`);
    revalidatePath("/bills");
    revalidatePath("/customers");

    return {
      message: "Payment updated.",
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

export async function deletePaymentAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();

    const paymentId = String(formData.get("paymentId") || "").trim();

    if (!paymentId) {
      throw new Error("Payment ID is required.");
    }

    const existingPayment = await getPaymentById(paymentId);

    if (!existingPayment) {
      throw new Error("Payment not found.");
    }

    const supabase = await createSupabaseServerClient();
    await clearPaymentAllocations(supabase, paymentId);

    const { error: deleteError } = await supabase.from("payments").delete().eq("id", paymentId);

    if (deleteError) {
      throw deleteError;
    }

    await syncCustomerAdvanceAmount(supabase, existingPayment.customer_id);

    revalidatePath("/payments");
    revalidatePath(`/customers/${existingPayment.customer_id}`);
    revalidatePath("/bills");
    revalidatePath("/customers");

    return {
      message: "Payment deleted.",
      ok: true,
      redirectTo: `/customers/${existingPayment.customer_id}`,
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

  return toAllocatableLines(billRows);
}