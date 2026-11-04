/** Canvas helpers shared by the deck display modules. */

/** Rounded rectangle path; falls back to a square corner where roundRect is missing. */
export function roundedRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
