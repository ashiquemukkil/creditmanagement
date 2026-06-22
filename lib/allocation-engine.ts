import { differenceInCalendarDays } from "date-fns";

export type BillPortion = "GOLD" | "DIAMOND";
export type PortionStatus = "NA" | "OPEN" | "PARTIALLY_PAID" | "PAID";
export type OverallStatus = "OPEN" | "PARTIALLY_PAID" | "PAID";

export type AllocationBill = {
  billDate: Date;
  billNumber?: string;
  diamondAmount: number;
  diamondAmountPaid: number;
  diamondDueDate: Date | null;
  diamondStatus: PortionStatus;
  goldAmount: number;
  goldAmountPaid: number;
  goldDueDate: Date | null;
  goldStatus: PortionStatus;
  id: string;
  overallStatus: OverallStatus;
};

export type PayableLine = {
  billDate: Date;
  billId: string;
  billNumber?: string;
  daysOverdue: number;
  dueDate: Date;
  portion: BillPortion;
  remaining: number;
  sortWasTieBreak: boolean;
};

export type AllocationResult = {
  amountAllocated: number;
  billId: string;
  daysOverdueAtAllocation: number;
  portion: BillPortion;
  wasTieBreak: boolean;
};

export type PaymentAllocationOutcome = {
  allocations: AllocationResult[];
  creditBalanceDelta: number;
  lines: PayableLine[];
  unallocatedAmount: number;
};

export type BillAfterReversal = {
  billId: string;
  diamondAmountPaid: number;
  diamondStatus: PortionStatus;
  goldAmountPaid: number;
  goldStatus: PortionStatus;
  overallStatus: OverallStatus;
};

export function derivePortionStatus(amount: number, paid: number): PortionStatus {
  if (amount <= 0) {
    return "NA";
  }

  if (paid <= 0) {
    return "OPEN";
  }

  return paid >= amount ? "PAID" : "PARTIALLY_PAID";
}

export function deriveOverallStatus(input: {
  diamondAmount: number;
  diamondAmountPaid: number;
  goldAmount: number;
  goldAmountPaid: number;
}): OverallStatus {
  const statuses = [
    derivePortionStatus(input.goldAmount, input.goldAmountPaid),
    derivePortionStatus(input.diamondAmount, input.diamondAmountPaid),
  ].filter((status) => status !== "NA");

  if (statuses.length > 0 && statuses.every((status) => status === "PAID")) {
    return "PAID";
  }

  if (statuses.length > 0 && statuses.every((status) => status === "OPEN")) {
    return "OPEN";
  }

  return "PARTIALLY_PAID";
}

export function flattenPayableLines(bills: AllocationBill[], paymentDate: Date): PayableLine[] {
  const lines = bills.flatMap((bill) => {
    const billLines: PayableLine[] = [];

    if (bill.goldAmount > 0 && bill.goldStatus !== "PAID" && bill.goldDueDate) {
      billLines.push({
        billDate: bill.billDate,
        billId: bill.id,
        billNumber: bill.billNumber,
        daysOverdue: differenceInCalendarDays(paymentDate, bill.goldDueDate),
        dueDate: bill.goldDueDate,
        portion: "GOLD",
        remaining: roundMoney(bill.goldAmount - bill.goldAmountPaid),
        sortWasTieBreak: false,
      });
    }

    if (bill.diamondAmount > 0 && bill.diamondStatus !== "PAID" && bill.diamondDueDate) {
      billLines.push({
        billDate: bill.billDate,
        billId: bill.id,
        billNumber: bill.billNumber,
        daysOverdue: differenceInCalendarDays(paymentDate, bill.diamondDueDate),
        dueDate: bill.diamondDueDate,
        portion: "DIAMOND",
        remaining: roundMoney(bill.diamondAmount - bill.diamondAmountPaid),
        sortWasTieBreak: false,
      });
    }

    return billLines.filter((line) => line.remaining > 0);
  });

  return sortPayableLines(lines);
}

export function sortPayableLines(lines: PayableLine[]) {
  const billPriority = new Map<
    string,
    {
      billDate: Date;
      earliestDueDate: Date;
      maxDaysOverdue: number;
    }
  >();

  for (const line of lines) {
    const existing = billPriority.get(line.billId);

    if (!existing) {
      billPriority.set(line.billId, {
        billDate: line.billDate,
        earliestDueDate: line.dueDate,
        maxDaysOverdue: line.daysOverdue,
      });
      continue;
    }

    billPriority.set(line.billId, {
      billDate: existing.billDate.getTime() <= line.billDate.getTime() ? existing.billDate : line.billDate,
      earliestDueDate:
        existing.earliestDueDate.getTime() <= line.dueDate.getTime()
          ? existing.earliestDueDate
          : line.dueDate,
      maxDaysOverdue: Math.max(existing.maxDaysOverdue, line.daysOverdue),
    });
  }

  const sorted = lines
    .map((line) => ({ ...line, sortWasTieBreak: false }))
    .sort((left, right) => {
      const leftBillPriority = billPriority.get(left.billId);
      const rightBillPriority = billPriority.get(right.billId);

      if (leftBillPriority && rightBillPriority) {
        if (leftBillPriority.maxDaysOverdue !== rightBillPriority.maxDaysOverdue) {
          return rightBillPriority.maxDaysOverdue - leftBillPriority.maxDaysOverdue;
        }

        const dueDateDiff =
          leftBillPriority.earliestDueDate.getTime() - rightBillPriority.earliestDueDate.getTime();
        if (dueDateDiff !== 0) {
          return dueDateDiff;
        }

        const billDateDiff = leftBillPriority.billDate.getTime() - rightBillPriority.billDate.getTime();
        if (billDateDiff !== 0) {
          return billDateDiff;
        }
      }

      if (left.billId !== right.billId) {
        return left.billId.localeCompare(right.billId);
      }

      if (left.daysOverdue !== right.daysOverdue) {
        return right.daysOverdue - left.daysOverdue;
      }

      if (left.dueDate.getTime() !== right.dueDate.getTime()) {
        return left.dueDate.getTime() - right.dueDate.getTime();
      }

      if (left.portion !== right.portion) {
        return left.portion === "GOLD" ? -1 : 1;
      }

      return left.billId.localeCompare(right.billId);
    });

  return sorted.map((line, index) => ({
    ...line,
    sortWasTieBreak:
      line.portion === "GOLD" &&
      sorted.some(
        (other, otherIndex) =>
          otherIndex > index &&
          other.billId === line.billId &&
          other.daysOverdue === line.daysOverdue &&
          other.portion === "DIAMOND",
      ),
  }));
}

export function allocatePaymentPure(input: {
  bills: AllocationBill[];
  paymentAmount: number;
  paymentDate: Date;
}): PaymentAllocationOutcome {
  let remainingPaymentAmount = roundMoney(input.paymentAmount);
  const allocations: AllocationResult[] = [];
  const lines = flattenPayableLines(input.bills, input.paymentDate);

  for (const line of lines) {
    if (remainingPaymentAmount <= 0) {
      break;
    }

    const amountAllocated = Math.min(line.remaining, remainingPaymentAmount);
    allocations.push({
      amountAllocated: roundMoney(amountAllocated),
      billId: line.billId,
      daysOverdueAtAllocation: line.daysOverdue,
      portion: line.portion,
      wasTieBreak: line.sortWasTieBreak,
    });
    remainingPaymentAmount = roundMoney(remainingPaymentAmount - amountAllocated);
  }

  return {
    allocations,
    creditBalanceDelta: remainingPaymentAmount,
    lines,
    unallocatedAmount: remainingPaymentAmount,
  };
}

export function reversePaymentPure(input: {
  allocations: AllocationResult[];
  bills: AllocationBill[];
  originalUnallocatedAmount: number;
}) {
  const billsById = new Map(input.bills.map((bill) => [bill.id, { ...bill }]));

  for (const allocation of input.allocations) {
    const bill = billsById.get(allocation.billId);
    if (!bill) {
      continue;
    }

    if (allocation.portion === "GOLD") {
      bill.goldAmountPaid = Math.max(0, roundMoney(bill.goldAmountPaid - allocation.amountAllocated));
    } else {
      bill.diamondAmountPaid = Math.max(
        0,
        roundMoney(bill.diamondAmountPaid - allocation.amountAllocated),
      );
    }

    bill.goldStatus = derivePortionStatus(bill.goldAmount, bill.goldAmountPaid);
    bill.diamondStatus = derivePortionStatus(bill.diamondAmount, bill.diamondAmountPaid);
    bill.overallStatus = deriveOverallStatus(bill);
  }

  return {
    bills: Array.from(billsById.values()).map(
      (bill): BillAfterReversal => ({
        billId: bill.id,
        diamondAmountPaid: bill.diamondAmountPaid,
        diamondStatus: bill.diamondStatus,
        goldAmountPaid: bill.goldAmountPaid,
        goldStatus: bill.goldStatus,
        overallStatus: bill.overallStatus,
      }),
    ),
    creditBalanceDelta: -roundMoney(input.originalUnallocatedAmount),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
