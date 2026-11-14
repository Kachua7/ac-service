import type { Coupon, PriceSnapshot, RepairQuote, ServicePackage } from '../shared/types.js';

export const GST_RATE_PCT = 18;

export function calculatePriceSnapshot(params: {
  service: ServicePackage;
  quantity: number;
  coupon?: Coupon;
  approvedQuote?: RepairQuote;
}): PriceSnapshot {
  const { service, quantity, coupon, approvedQuote } = params;
  const safeQty = Math.max(1, Math.min(10, Math.floor(quantity)));
  const baseUnit = service.basePriceInr;

  const firstUnitPrice = baseUnit;
  const extraUnits = safeQty - 1;
  const discountPerExtraUnit = Math.round((baseUnit * service.additionalUnitDiscountPct) / 100);
  const extraUnitPrice = baseUnit - discountPerExtraUnit;

  const grossBeforeMulti = baseUnit * safeQty;
  const subtotalInr = firstUnitPrice + extraUnits * extraUnitPrice;
  const multiUnitSavingsInr = grossBeforeMulti - subtotalInr;

  let discountInr = 0;
  let appliedCode: string | undefined;

  if (coupon && coupon.active && subtotalInr >= coupon.minOrderInr) {
    appliedCode = coupon.code;
    if (coupon.discountType === 'FLAT') {
      discountInr = Math.min(coupon.value, subtotalInr);
    } else {
      const pctDiscount = Math.round((subtotalInr * coupon.value) / 100);
      discountInr = Math.min(pctDiscount, coupon.maxDiscountInr, subtotalInr);
    }
  }

  const taxableAmountInr = Math.max(0, subtotalInr - discountInr);
  const gstAmountInr = Math.round((taxableAmountInr * GST_RATE_PCT) / 100);
  const totalPayableInr = taxableAmountInr + gstAmountInr;
  const approvedQuoteTotalInr =
    approvedQuote && approvedQuote.status === 'APPROVED' ? approvedQuote.totalInr : 0;

  return {
    serviceId: service.id,
    serviceName: service.name,
    priceVersion: service.priceVersion,
    unitCount: safeQty,
    baseUnitPriceInr: baseUnit,
    subtotalInr,
    multiUnitSavingsInr,
    couponCode: appliedCode,
    discountInr,
    taxableAmountInr,
    gstRatePct: GST_RATE_PCT,
    gstAmountInr,
    totalPayableInr,
    approvedQuoteTotalInr,
    grandTotalInr: totalPayableInr + approvedQuoteTotalInr,
  };
}

export function calculateQuoteTotals(
  items: Array<{ quantity: number; unitPriceInr: number; labourInr: number }>,
): { subtotalInr: number; gstAmountInr: number; totalInr: number } {
  const subtotalInr = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceInr + item.labourInr,
    0,
  );
  const gstAmountInr = Math.round((subtotalInr * GST_RATE_PCT) / 100);
  return {
    subtotalInr,
    gstAmountInr,
    totalInr: subtotalInr + gstAmountInr,
  };
}
