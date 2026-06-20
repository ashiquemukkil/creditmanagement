"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions";
import { useToast } from "@/components/toast-provider";

type CustomerFormValues = {
  address?: string | null;
  diamond_credit_days?: number;
  gold_credit_days?: number;
  name?: string;
  phone?: string | null;
};

type CustomerFormProps = {
  customerId?: string;
  initialValues?: CustomerFormValues;
  submitLabel: string;
  title: string;
};

export function CustomerForm({
  customerId,
  initialValues,
  submitLabel,
  title,
}: CustomerFormProps) {
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

    if (customerId) {
      formData.set("customerId", customerId);
    }

    startTransition(async () => {
      try {
        const result = customerId
          ? await updateCustomerAction(formData)
          : await createCustomerAction(formData);

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
          Customers
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">{title}</h2>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Name</span>
          <input
            required
            name="name"
            type="text"
            defaultValue={initialValues?.name ?? ""}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Phone</span>
          <input
            name="phone"
            type="text"
            defaultValue={initialValues?.phone ?? ""}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Address</span>
          <textarea
            name="address"
            rows={4}
            defaultValue={initialValues?.address ?? ""}
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Gold credit days</span>
            <input
              required
              min={0}
              name="gold_credit_days"
              type="number"
              defaultValue={initialValues?.gold_credit_days ?? 0}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Diamond credit days</span>
            <input
              required
              min={0}
              name="diamond_credit_days"
              type="number"
              defaultValue={initialValues?.diamond_credit_days ?? 0}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            {isPending ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}