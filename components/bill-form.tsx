"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

import { createBillAction, updateBillAction } from "@/app/(app)/bills/actions";
import { CustomerPicker } from "@/components/customer-picker";
import { useToast } from "@/components/toast-provider";

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type BillFormProps = {
  billId?: string;
  customers: CustomerOption[];
  defaultBillDate: string;
  defaultCustomerId?: string;
  initialValues?: {
    billDate: string;
    billNumber: string;
    customerId: string;
    diamondAmount: number;
    goldAmount: number;
  };
  submitLabel?: string;
  title?: string;
};

export function BillForm({
  billId,
  customers,
  defaultBillDate,
  defaultCustomerId,
  initialValues,
  submitLabel,
  title,
}: BillFormProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();
  const isSubmittingRef = useRef(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const result = billId
          ? await updateBillAction(billId, formData)
          : await createBillAction(formData);

        if (!result.ok) {
          showError(result.message);
          return;
        }

        showSuccess(result.message);

        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } finally {
        isSubmittingRef.current = false;
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
          Bills
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">{title ?? "Add bill"}</h2>
        <p className="max-w-2xl text-sm leading-7 text-stone-600">
          Gold and diamond due dates are computed on the server from the selected customer’s credit terms.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <CustomerPicker customers={customers} defaultCustomerId={initialValues?.customerId ?? defaultCustomerId} />
        </label>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Bill number</span>
          <input
            defaultValue={initialValues?.billNumber}
            required
            name="bill_number"
            type="text"
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            placeholder="INV-2026-001"
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Bill date</span>
            <input
              required
              name="bill_date"
              type="date"
              defaultValue={initialValues?.billDate ?? defaultBillDate}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Gold amount</span>
            <input
              min="0"
              step="0.01"
              name="gold_amount"
              type="number"
              defaultValue={initialValues?.goldAmount ?? 0}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
              placeholder="0.00"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Diamond amount</span>
            <input
              min="0"
              step="0.01"
              name="diamond_amount"
              type="number"
              defaultValue={initialValues?.diamondAmount ?? 0}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
              placeholder="0.00"
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            {isPending ? "Saving..." : (submitLabel ?? "Create bill")}
          </button>
        </div>
      </form>
    </section>
  );
}