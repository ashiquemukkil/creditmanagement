import { notFound, redirect } from "next/navigation";

import { PaymentForm } from "@/components/payment-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { listCustomerOptions } from "@/lib/customers";
import { getPaymentById } from "@/lib/payments";

type EditPaymentPageProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

export default async function EditPaymentPage({ params }: EditPaymentPageProps) {
  const [{ paymentId }, role] = await Promise.all([params, getCurrentUserRole()]);

  if (!canManageData(role)) {
    redirect("/payments");
  }

  const [payment, customers] = await Promise.all([getPaymentById(paymentId), listCustomerOptions()]);

  if (!payment) {
    notFound();
  }

  return (
    <PaymentForm
      paymentId={paymentId}
      customers={customers}
      defaultCustomerId={payment.customer_id}
      defaultPaymentDate={payment.payment_date}
      initialValues={{
        amount: Number(payment.amount),
        customerId: payment.customer_id,
        notes: payment.notes,
        paymentDate: payment.payment_date,
      }}
      submitLabel="Save changes"
      title="Edit payment"
    />
  );
}
