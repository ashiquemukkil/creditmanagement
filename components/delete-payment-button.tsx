"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deletePaymentAction } from "@/app/(app)/payments/actions";
import { useToast } from "@/components/toast-provider";

type DeletePaymentButtonProps = {
  paymentId: string;
};

export function DeletePaymentButton({ paymentId }: DeletePaymentButtonProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("Delete this payment? This cannot be undone.")) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("paymentId", paymentId);

      const result = await deletePaymentAction(formData);

      if (!result.ok) {
        showError(result.message);
        return;
      }

      showSuccess(result.message);

      if (result.redirectTo) {
        router.push(result.redirectTo);
      }

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
