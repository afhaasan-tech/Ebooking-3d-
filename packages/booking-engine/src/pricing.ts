import { Fils, assertFils, percentOf, sumFils } from '@ebooking/shared';

export interface FeeConfig {
  /** Customer-facing service fee in basis points of the subtotal. */
  serviceFeeBps: number;
  /** Fixed customer service fee per ticket/admission, in fils. */
  serviceFeeFixedFils: number;
}

export interface PricedLine {
  ref: string;
  unitPriceFils: Fils;
  quantity: number;
}

export interface OrderPricing {
  lines: (PricedLine & { lineTotalFils: Fils })[];
  subtotalFils: Fils;
  serviceFeeFils: Fils;
  totalFils: Fils;
  ticketCount: number;
}

/** Server-authoritative pricing. Clients never submit totals. */
export function priceOrder(lines: PricedLine[], fees: FeeConfig): OrderPricing {
  const priced = lines.map((l) => {
    assertFils(l.unitPriceFils);
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error('invalid_quantity');
    const lineTotalFils = l.unitPriceFils * l.quantity;
    assertFils(lineTotalFils);
    return { ...l, lineTotalFils };
  });
  const subtotalFils = sumFils(priced.map((l) => l.lineTotalFils));
  const ticketCount = priced.reduce((a, l) => a + l.quantity, 0);
  // free events carry no service fee
  const serviceFeeFils = subtotalFils === 0 ? 0 : percentOf(subtotalFils, fees.serviceFeeBps) + fees.serviceFeeFixedFils * ticketCount;
  return { lines: priced, subtotalFils, serviceFeeFils, totalFils: sumFils([subtotalFils, serviceFeeFils]), ticketCount };
}

/** Organizer-side settlement figures (platform commission is per confirmed ticket revenue). */
export function organizerNet(grossFils: Fils, refundsFils: Fils, commissionBps: number): { commissionFils: Fils; netFils: Fils } {
  const base = Math.max(0, grossFils - refundsFils);
  const commissionFils = percentOf(base, commissionBps);
  return { commissionFils, netFils: base - commissionFils };
}
