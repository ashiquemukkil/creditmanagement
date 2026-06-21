"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  type AllocatableBillLine,
  createPaymentAction,
  listAllocatableBillLinesAction,
} from "@/app/(app)/payments/actions";
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
  const [selectedCustomerId, setSelectedCustomerId] = useState(defaultCustomerId ?? "");
  const [allocationMode, setAllocationMode] = useState<"automatic" | "manual">("automatic");
  const [allocatableLines, setAllocatableLines] = useState<AllocatableBillLine[]>([]);
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [isLoadingAllocations, setIsLoadingAllocations] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadAllocatableLines() {
      if (!selectedCustomerId) {
        if (isActive) {
          setAllocatableLines([]);
          setManualAmounts({});
        }
        return;
      }

      setIsLoadingAllocations(true);

      try {
        const lines = await listAllocatableBillLinesAction(selectedCustomerId);

        if (!isActive) {
          return;
        }

        setAllocatableLines(lines);
        setManualAmounts((previous) => {
          const allowedKeys = new Set(lines.map((line) => line.key));
          const next: Record<string, string> = {};

          for (const [key, value] of Object.entries(previous)) {
            if (allowedKeys.has(key)) {
              next[key] = value;
            }
          }

          return next;
        });
      } catch {
        if (isActive) {
          showError("Unable to load open bills for manual allocation.");
          setAllocatableLines([]);
          setManualAmounts({});
        }
      } finally {
        if (isActive) {
          setIsLoadingAllocations(false);
        }
      }
    }

    void loadAllocatableLines();

    return () => {
      isActive = false;
    };
  }, [selectedCustomerId, showError]);

  const manualAllocationPayload = useMemo(
    () =>
      allocatableLines
        .map((line) => {
          const amount = Number(manualAmounts[line.key] || 0);

          if (!Number.isFinite(amount) || amount <= 0) {
            return null;
          }

          return {
            allocatedTo: line.allocatedTo,
            amount: Number(amount.toFixed(2)),
            billId: line.billId,
          };
        })
        .filter(
          (entry): entry is { allocatedTo: "gold" | "diamond"; amount: number; billId: string } =>
            Boolean(entry),
        ),
    [allocatableLines, manualAmounts],
  );

  const manualAllocatedTotal = useMemo(
    () =>
      manualAllocationPayload.reduce((sum, entry) => {
        return sum + entry.amount;
      }, 0),
    [manualAllocationPayload],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    formData.set("allocation_mode", allocationMode);
    formData.set(
      "manual_allocations",
      allocationMode === "manual" ? JSON.stringify(manualAllocationPayload) : "[]",
    );

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
          Record a payment and choose automatic overdue allocation or manual bill-wise allocation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Customer</span>
          <CustomerPicker
            customers={customers}
            defaultCustomerId={defaultCustomerId}
            onSelectedIdChange={setSelectedCustomerId}
          />
        </label>

        <fieldset className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <legend className="px-1 text-sm font-medium text-stone-700">Allocation type</legend>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              checked={allocationMode === "automatic"}
              name="allocation-mode"
              onChange={() => setAllocationMode("automatic")}
              type="radio"
              value="automatic"
            />
            Automatic allocation (oldest overdue portions first)
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              checked={allocationMode === "manual"}
              name="allocation-mode"
              onChange={() => setAllocationMode("manual")}
              type="radio"
              value="manual"
            />
            Manual allocation (only selected bills/portions)
          </label>
        </fieldset>

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

        {allocationMode === "manual" ? (
          <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-800">Manual bill allocation</p>
              <p className="text-xs text-stone-600">
                Allocated from this payment: {manualAllocatedTotal.toFixed(2)}
              </p>
            </div>

            {!selectedCustomerId ? (
              <p className="text-sm text-stone-600">Select a customer to load open bill portions.</p>
            ) : isLoadingAllocations ? (
              <p className="text-sm text-stone-600">Loading open bills...</p>
            ) : allocatableLines.length === 0 ? (
              <p className="text-sm text-stone-600">No open bill portions found for this customer.</p>
            ) : (
              <div className="space-y-3">
                {allocatableLines.map((line) => (
                  <div
                    key={line.key}
                    className="grid gap-3 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_180px]"
                  >
                    <div className="space-y-1 text-sm text-stone-700">
                      <p className="font-medium text-stone-900">
                        {line.billNumber} - {line.allocatedTo === "gold" ? "Gold" : "Diamond"}
                      </p>
                      <p className="text-xs text-stone-600">
                        Due: {line.dueDate ?? "N/A"} | Overdue: {line.daysOverdue} days | Outstanding: {" "}
                        {line.outstandingAmount.toFixed(2)}
                      </p>
                    </div>
                    <label className="block space-y-1 text-sm font-medium text-stone-700">
                      <span>Allocate amount</span>
                      <input
                        max={line.outstandingAmount}
                        min="0"
                        onChange={(event) => {
                          setManualAmounts((previous) => ({
                            ...previous,
                            [line.key]: event.target.value,
                          }));
                        }}
                        step="0.01"
                        type="number"
                        value={manualAmounts[line.key] ?? ""}
                        className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-950 outline-none transition focus:border-amber-600"
                        placeholder="0.00"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

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
