"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, getActionErrorMessage } from "@/lib/action-result";
import { requireTeamMember } from "@/lib/auth";
import { createPaymentFromEntry, parsePaymentEntryInput } from "@/lib/entry-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createPaymentAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireTeamMember();
    const payload = parsePaymentEntryInput({
      amount: String(formData.get("amount") || 0),
      customerId: String(formData.get("customer_id") || ""),
      notes: String(formData.get("notes") || ""),
      paymentDate: String(formData.get("payment_date") || ""),
    });
    const supabase = await createSupabaseServerClient();
    await createPaymentFromEntry(payload, supabase);

    revalidatePath("/payments");
    revalidatePath(`/customers/${payload.customerId}`);
    revalidatePath("/bills");
    revalidatePath("/customers");

    return {
      message: "Payment created and allocated.",
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