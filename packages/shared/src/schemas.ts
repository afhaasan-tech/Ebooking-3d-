import { z } from 'zod';
import { normalizeKuwaitMobile } from './kuwait';

export const uuid = z.string().uuid();

export const kuwaitMobile = z
  .string()
  .max(20)
  .transform((v, ctx) => {
    const n = normalizeKuwaitMobile(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_kuwait_mobile' });
      return z.NEVER;
    }
    return n;
  });

const contact = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  mobile: kuwaitMobile,
});

export const HoldSeatsBody = z.object({
  performanceId: uuid,
  seatIds: z.array(z.string().min(1).max(64)).min(1).max(6),
});

export const HoldAdmissionBody = z.object({
  performanceId: uuid,
  quantity: z.number().int().min(1).max(10),
});

export const CheckoutBody = z.object({
  holdId: uuid,
  contact,
  method: z.enum(['knet', 'apple_pay', 'card']),
  /** Demo-only scenario selector; ignored by real providers. */
  demoScenario: z.enum(['success', 'fail', 'delayed', 'duplicate_webhook', 'confirm_after_timeout']).default('success'),
  idempotencyKey: z.string().min(16).max(100),
});

export const RecommendBody = z.object({
  performanceId: uuid,
  query: z.string().trim().min(1).max(300),
});

export const QuickEventRequestBody = z.object({
  companyName: z.string().trim().min(2).max(150),
  contactName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  mobile: kuwaitMobile,
  venueName: z.string().trim().min(2).max(150),
  eventType: z.string().trim().min(2).max(80),
  proposedDates: z.string().trim().min(2).max(200),
  expectedAttendance: z.number().int().min(1).max(1_000_000),
  admission: z.enum(['free', 'paid']),
  seatingMode: z.enum(['reserved', 'general_admission', 'exhibition_booths']),
  services: z.array(z.string().max(60)).max(20).default([]),
  notes: z.string().trim().max(2000).optional().default(''),
  venuePlanFileName: z.string().max(200).optional(),
});

export const QuoteBody = z.object({
  items: z
    .array(
      z.object({
        description: z.string().trim().min(2).max(200),
        amountFils: z.number().int().min(0).max(1_000_000_000),
        quantity: z.number().int().min(1).max(10000),
      }),
    )
    .min(1)
    .max(30),
  validDays: z.number().int().min(1).max(90).default(14),
  notes: z.string().max(2000).optional().default(''),
});

export const BoothRequestBody = z.object({
  exhibitionId: uuid,
  boothCode: z.string().min(1).max(64),
  companyName: z.string().trim().min(2).max(150),
  contactName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  mobile: kuwaitMobile,
  productCategory: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(2000).optional().default(''),
});

export const CategoryPriceBody = z.object({ priceFils: z.number().int().min(0).max(100_000_000) });

export const SupportMessageBody = z.object({
  message: z.string().trim().min(1).max(1000),
  orderRef: z.string().trim().max(40).optional(),
});

export const LoginBody = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(200),
});
