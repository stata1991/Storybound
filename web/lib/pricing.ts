/**
 * Physical book: $35 flat, shipping included, one-time purchase.
 *
 * Basis (2026-08 figures): Prodigi unit $12.50 + Budget shipping ~$7.60
 * + Stripe fees ~$1.30 + GPU generation ~$2-4 → ~$9-11 net per book.
 */
export const PHYSICAL_BOOK_PRICE_USD = 35;

export const PHYSICAL_BOOK_PRICE_ID = () =>
  process.env.STRIPE_PRICE_PHYSICAL_BOOK!;

// Checkout shipping-address collection. Expansion is config, not code.
export const SHIPPING_COUNTRIES = ["US"];
