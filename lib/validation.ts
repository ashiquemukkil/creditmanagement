import { addDays, isValid, parseISO } from "date-fns";
import { z } from "zod";

const decimalInput = z.coerce.number().finite().min(0);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required."),
  phone: z.string().trim().min(1, "Phone is required."),
  address: z.string().trim().optional().nullable(),
  goldCreditDays: z.coerce.number().int().min(0),
  diamondCreditDays: z.coerce.number().int().min(0),
  notes: z.string().trim().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export const billSchema = z
  .object({
    billNumber: z.string().trim().min(1, "Bill number is required."),
    customerId: z.string().uuid(),
    billDate: z.coerce.date(),
    description: z.string().trim().optional().nullable(),
    goldAmount: decimalInput.default(0),
    diamondAmount: decimalInput.default(0),
  })
  .refine((value) => value.goldAmount > 0 || value.diamondAmount > 0, {
    message: "At least one of gold amount or diamond amount must be greater than 0.",
    path: ["goldAmount"],
  });

export const paymentSchema = z.object({
  customerId: z.string().uuid(),
  paymentDate: z.coerce.date(),
  amount: z.coerce.number().finite().positive(),
  mode: z.enum(["CASH", "UPI", "CHEQUE", "BANK_TRANSFER", "OTHER"]).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "COLLABORATOR", "VIEWER"]),
});

export function computeDueDates(input: {
  billDate: Date;
  diamondAmount: number;
  diamondCreditDays: number;
  goldAmount: number;
  goldCreditDays: number;
}) {
  return {
    diamondDueDate:
      input.diamondAmount > 0 ? addDays(input.billDate, input.diamondCreditDays) : null,
    goldDueDate: input.goldAmount > 0 ? addDays(input.billDate, input.goldCreditDays) : null,
  };
}

export function parseTemplateDate(value: unknown) {
  if (value instanceof Date && isValid(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}
