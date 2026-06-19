import { redirect } from "next/navigation";

import { PaymentForm } from "@/components/payment-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listCustomerOptions } from "@/lib/customers";

type NewPaymentPageProps = {
  searchParams: Promise<{
    customerId?: string;
  }>;
};

export default async function NewPaymentPage({ searchParams }: NewPaymentPageProps) {
  const [role, customers, { customerId }] = await Promise.all([
    getCurrentUserRole(),
    listCustomerOptions(),
    searchParams,
  ]);

  if (!canManageData(role)) {
    redirect("/payments");
  }

  const defaultPaymentDate = new Date().toISOString().slice(0, 10);

  return (
    <PaymentForm
      customers={customers}
      defaultCustomerId={customerId}
      defaultPaymentDate={defaultPaymentDate}
    />
  );
}