"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { requireTeamMember } from "@/lib/auth";
import { createBillFromEntry, parseBillEntryInput } from "@/lib/entry-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBillById } from "@/lib/bills";

export async function createBillAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireTeamMember();
    const payload = parseBillEntryInput({
      billDate: String(formData.get("bill_date") || ""),
      billNumber: String(formData.get("bill_number") || ""),
      customerId: String(formData.get("customer_id") || ""),
      diamondAmount: String(formData.get("diamond_amount") || 0),
      goldAmount: String(formData.get("gold_amount") || 0),
    });
    const supabase = await createSupabaseServerClient();
    const data = await createBillFromEntry(payload, user.id, supabase);

    revalidatePath("/bills");
    revalidatePath(`/customers/${data.customerId}`);
    revalidatePath("/customers");

    return {
      message: `Bill ${data.billNumber} created.`,
      ok: true,
      redirectTo: `/customers/${data.customerId}`,
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}

export async function updateBillAction(billId: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();

    if (!billId) {
      throw new Error("Bill ID is required.");
    }

    const payload = parseBillEntryInput({
      billDate: String(formData.get("bill_date") || ""),
      billNumber: String(formData.get("bill_number") || ""),
      customerId: String(formData.get("customer_id") || ""),
      diamondAmount: String(formData.get("diamond_amount") || 0),
      goldAmount: String(formData.get("gold_amount") || 0),
    });

    const supabase = await createSupabaseServerClient();
    const existing = await getBillById(billId);

    if (!existing) {
      throw new Error("Bill not found.");
    }

    // Check bill_number uniqueness only if it changed
    if (payload.billNumber !== existing.bill_number) {
      const { data: duplicate } = await supabase
        .from("bills")
        .select("id")
        .eq("bill_number", payload.billNumber)
        .maybeSingle();

      if (duplicate) {
        throw new Error("Bill number already exists.");
      }
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, gold_credit_days, diamond_credit_days")
      .eq("id", payload.customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) throw new Error("Selected customer was not found.");

    const billDateValue = new Date(`${payload.billDate}T00:00:00`);
    const buildDueDate = (creditDays: number) => {
      const d = new Date(billDateValue);
      d.setDate(d.getDate() + creditDays);
      return d.toISOString().slice(0, 10);
    };
    const goldDueDate = payload.goldAmount > 0 ? buildDueDate(customer.gold_credit_days) : null;
    const diamondDueDate = payload.diamondAmount > 0 ? buildDueDate(customer.diamond_credit_days) : null;
    const dueDate =
      goldDueDate && diamondDueDate
        ? goldDueDate > diamondDueDate ? goldDueDate : diamondDueDate
        : goldDueDate ?? diamondDueDate;

    if (!dueDate) throw new Error("Unable to compute bill due date.");

    const { error } = await supabase
      .from("bills")
      .update({
        bill_date: payload.billDate,
        bill_number: payload.billNumber,
        customer_id: payload.customerId,
        diamond_amount: payload.diamondAmount,
        diamond_due_date: diamondDueDate,
        due_date: dueDate,
        gold_amount: payload.goldAmount,
        gold_due_date: goldDueDate,
      })
      .eq("id", billId);

    if (error) throw error;

    revalidatePath("/bills");
    revalidatePath(`/customers/${payload.customerId}`);
    revalidatePath("/customers");

    return {
      message: `Bill ${payload.billNumber} updated.`,
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

export async function deleteBillAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();
    const billId = String(formData.get("billId") || "").trim();

    if (!billId) {
      throw new Error("Bill ID is required.");
    }

    const supabase = await createSupabaseServerClient();
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select("id, bill_number, customer_id, amount_paid_gold, amount_paid_diamond")
      .eq("id", billId)
      .maybeSingle();

    if (billError) {
      throw billError;
    }

    if (!bill) {
      throw new Error("Bill not found.");
    }

    if (Number(bill.amount_paid_gold) > 0 || Number(bill.amount_paid_diamond) > 0) {
      throw new Error("Delete blocked. Bills with applied payments cannot be deleted.");
    }

    const allocationResult = await supabase
      .from("payment_allocations")
      .select("id", { count: "exact", head: true })
      .eq("bill_id", billId);

    if (allocationResult.error) {
      throw allocationResult.error;
    }

    if ((allocationResult.count ?? 0) > 0) {
      throw new Error("Delete blocked. Bills with payment allocations cannot be deleted.");
    }

    const { error } = await supabase.from("bills").delete().eq("id", billId);

    if (error) {
      throw error;
    }

    revalidatePath("/bills");
    revalidatePath(`/customers/${bill.customer_id}`);
    revalidatePath("/customers");

    return {
      message: `Bill ${bill.bill_number} deleted.`,
      ok: true,
    };
  } catch (error) {
    return {
      message: getActionErrorMessage(error),
      ok: false,
    };
  }
}