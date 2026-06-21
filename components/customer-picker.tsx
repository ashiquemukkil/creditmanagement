"use client";

import { useEffect, useId, useState } from "react";

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

type CustomerPickerProps = {
  customers: CustomerOption[];
  defaultCustomerId?: string;
  hiddenInputName?: string;
  onSelectedIdChange?: (customerId: string) => void;
};

function labelForCustomer(customer: CustomerOption) {
  return customer.phone ? `${customer.name} (${customer.phone})` : customer.name;
}

export function CustomerPicker({
  customers,
  defaultCustomerId,
  hiddenInputName = "customer_id",
  onSelectedIdChange,
}: CustomerPickerProps) {
  const listId = useId();
  const initialCustomer = customers.find((customer) => customer.id === defaultCustomerId);
  const [displayValue, setDisplayValue] = useState(initialCustomer ? labelForCustomer(initialCustomer) : "");
  const matchedCustomer = customers.find(
    (customer) => labelForCustomer(customer).toLowerCase() === displayValue.trim().toLowerCase(),
  );
  const selectedId = matchedCustomer?.id ?? "";

  useEffect(() => {
    onSelectedIdChange?.(selectedId);
  }, [onSelectedIdChange, selectedId]);

  return (
    <div className="space-y-2">
      <input
        required
        list={listId}
        value={displayValue}
        onChange={(event) => setDisplayValue(event.target.value)}
        placeholder="Search by customer name"
        className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
      />
      <datalist id={listId}>
        {customers.map((customer) => {
          const label = labelForCustomer(customer);

          return <option key={customer.id} value={label} />;
        })}
      </datalist>
      <input type="hidden" name={hiddenInputName} value={selectedId} />
      <p className="text-xs text-stone-500">
        Start typing a name and choose one of the matching customers.
      </p>
    </div>
  );
}