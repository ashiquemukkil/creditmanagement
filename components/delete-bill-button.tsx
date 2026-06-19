"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deleteBillAction } from "@/app/(app)/bills/actions";
import { useToast } from "@/components/toast-provider";

type DeleteBillButtonProps = {
  billId: string;
  billNumber: string;
};

export function DeleteBillButton({ billId, billNumber }: DeleteBillButtonProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete bill ${billNumber}? This cannot be undone.`)) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("billId", billId);

      const result = await deleteBillAction(formData);

      if (!result.ok) {
        showError(result.message);
        return;
      }

      showSuccess(result.message);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDelete}
      className="text-sm font-medium text-rose-700 hover:text-rose-800 disabled:cursor-not-allowed disabled:text-rose-300"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}