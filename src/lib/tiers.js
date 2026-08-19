// Central place for what each tier is allowed to show. Both the public
// page (render.js) and the PDF (pdf.js) import this, so they can never
// disagree about what a given tier displays — that would either leak
// paid-only info to free visitors, or short-change a paying customer.
//
// Customers can type as many lines as they want into any tier's intake
// form (it's just a text box) — everything is always saved. This is what
// actually enforces "free gets 1, Essential gets 2, Ultimate gets
// everything," and it's also the upsell: extra lines they already typed
// are sitting there, ready to appear the moment they upgrade.
export const TIER_LINE_LIMITS = {
  free: { emergency_contacts: 1, doctors: 1, medications: 1 },
  essential: { emergency_contacts: 2, doctors: 2, medications: 2 },
  ultimate: {
    emergency_contacts: Infinity,
    doctors: Infinity,
    medications: Infinity,
  },
};

export function linesOf(text) {
  return String(text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Returns { shown, hiddenCount } for one field ("emergency_contacts" |
// "doctors" | "medications") under a given tier. Unknown/missing tiers
// fall back to free's (more restrictive) limits.
export function visibleLines(text, tier, field) {
  const limits = TIER_LINE_LIMITS[tier] || TIER_LINE_LIMITS.free;
  const limit = limits[field] ?? TIER_LINE_LIMITS.free[field];
  const all = linesOf(text);
  const shown = all.slice(0, limit);
  return { shown, hiddenCount: all.length - shown.length };
}
