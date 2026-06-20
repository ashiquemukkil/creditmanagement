"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createPaymentAction } from "@/app/(app)/payments/actions";
import { CustomerPicker } from "@/components/customer-picker";
import { useToast } from "@/components/toast-provider";

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type PaymentFormProps = {
  customers: CustomerOption[];
  defaultCustomerId?: string;
  defaultPaymentDate: string;
};

export function PaymentForm({
  customers,
  defaultCustomerId,
  defaultPaymentDate,
}: PaymentFormProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const result = await createPaymentAction(formData);

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
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
          Payments
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Add payment</h2>
        <p className="max-w-2xl text-sm leading-7 text-stone-600">
          Record a payment and it will be allocated automatically across overdue bills.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <CustomerPicker customers={customers} defaultCustomerId={defaultCustomerId} />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Payment date</span>
            <input
              required
              name="payment_date"
              type="date"
              defaultValue={defaultPaymentDate}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Amount</span>
            <input
              required
              min="0.01"
              step="0.01"
              name="amount"
              type="number"
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
              placeholder="0.00"
            />
          </label>
        </div>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Notes</span>
          <textarea
            name="notes"
            rows={4}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            placeholder="Cheque number, UPI reference, or any other details"
          />
        </label>

        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            {isSubmitting ? "Creating..." : "Create payment"}
          </button>
        </div>
      </form>
    </section>
  );
}
