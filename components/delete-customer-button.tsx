"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deleteCustomerAction } from "@/app/(app)/customers/actions";
import { useToast } from "@/components/toast-provider";

type DeleteCustomerButtonProps = {
  customerId: string;
  customerName: string;
};

export function DeleteCustomerButton({ customerId, customerName }: DeleteCustomerButtonProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete customer ${customerName}? This cannot be undone.`)) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId);

      const result = await deleteCustomerAction(formData);

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