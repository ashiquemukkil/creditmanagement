"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { requireTeamMember } from "@/lib/auth";
import { createBillFromEntry, parseBillEntryInput } from "@/lib/entry-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createBillAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireTeamMember();
    const payload = parseBillEntryInput({
      amount: String(formData.get("amount") || 0),
      billDate: String(formData.get("bill_date") || ""),
      billNumber: String(formData.get("bill_number") || ""),
      customerId: String(formData.get("customer_id") || ""),
      itemType: String(formData.get("item_type") || ""),
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
      .select("id, bill_number, customer_id, amount_paid")
      .eq("id", billId)
      .maybeSingle();

    if (billError) {
      throw billError;
    }

    if (!bill) {
      throw new Error("Bill not found.");
    }

    if (Number(bill.amount_paid) > 0) {
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