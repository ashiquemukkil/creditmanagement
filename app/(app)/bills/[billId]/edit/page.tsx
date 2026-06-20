import { notFound, redirect } from "next/navigation";

import { BillForm } from "@/components/bill-form";
import { canManageData, getCurrentUserRole } from "@/lib/auth";
import { getBillById } from "@/lib/bills";
import { listCustomerOptions } from "@/lib/customers";

type EditBillPageProps = {
  params: Promise<{
    billId: string;
  }>;
};

export default async function EditBillPage({ params }: EditBillPageProps) {
  const [{ billId }, role] = await Promise.all([params, getCurrentUserRole()]);

  if (!canManageData(role)) {
    redirect("/bills");
  }

  const [bill, customers] = await Promise.all([getBillById(billId), listCustomerOptions()]);

  if (!bill) {
    notFound();
  }

  return (
    <BillForm
      billId={billId}
      customers={customers}
      defaultBillDate={bill.bill_date}
      initialValues={{
        billDate: bill.bill_date,
        billNumber: bill.bill_number,
        customerId: bill.customer_id,
        diamondAmount: Number(bill.diamond_amount),
        goldAmount: Number(bill.gold_amount),
      }}
      submitLabel="Save changes"
      title="Edit bill"
    />
  );
}