"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { createBillAction } from "@/app/(app)/bills/actions";
import { CustomerPicker } from "@/components/customer-picker";
import { useToast } from "@/components/toast-provider";
import type { BillItemType } from "@/lib/bills";

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type BillFormProps = {
  customers: CustomerOption[];
  defaultBillDate: string;
  defaultCustomerId?: string;
  defaultItemType?: BillItemType;
};

export function BillForm({
  customers,
  defaultBillDate,
  defaultCustomerId,
  defaultItemType = "gold",
}: BillFormProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createBillAction(formData);

      if (!result.ok) {
        showError(result.message);
        return;
      }

      showSuccess(result.message);

      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
          Bills
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Add bill</h2>
        <p className="max-w-2xl text-sm leading-7 text-stone-600">
          Due date is computed on the server from the selected customer’s credit terms.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <CustomerPicker customers={customers} defaultCustomerId={defaultCustomerId} />
        </label>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Bill number</span>
          <input
            required
            name="bill_number"
            type="text"
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            placeholder="INV-2026-001"
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-stone-700">Item type</legend>
          <div className="flex gap-3">
            {(["gold", "diamond"] as const).map((itemType) => (
              <label
                key={itemType}
                className="inline-flex items-center gap-3 rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-800"
              >
                <input
                  type="radio"
                  name="item_type"
                  value={itemType}
                  defaultChecked={defaultItemType === itemType}
                />
                <span className="capitalize">{itemType}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Bill date</span>
            <input
              required
              name="bill_date"
              type="date"
              defaultValue={defaultBillDate}
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

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            {isPending ? "Creating..." : "Create bill"}
          </button>
        </div>
      </form>
    </section>
  );
}