/**
 * Builds the Chromium footer template for the Exposé PDF.
 *
 * The PDF renderer (`expose-service`) prints the frontend print route with
 * Playwright and passes `displayHeaderFooter` + this footer template to
 * `page.pdf()`. Chromium then draws the template into the bottom page margin
 * of every page and replaces the `pageNumber` / `totalPages` placeholders
 * with the real final page count.
 *
 * The template must be fully self-contained: Chromium ignores external
 * stylesheets inside header/footer templates, so all styling is inline and
 * mirrors the Exposé palette (`--expose-line`, `--expose-ink-soft`) and
 * typography (Arial). Makler data is user-controlled and is HTML-escaped.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function pageFooterTemplate({
  maklerName,
  maklerCompany,
  poweredBy,
}: {
  maklerName?: string | null;
  maklerCompany?: string | null;
  /** Localized "Powered by Vista" branding label. */
  poweredBy: string;
}): string {
  const identity = [maklerName?.trim(), maklerCompany?.trim()]
    .filter((value): value is string => Boolean(value))
    .map(escapeHtml)
    .join('<br/>');
  const pageIndicator =
    '<span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span>';
  return [
    '<div style="box-sizing:border-box;width:100%;height:100%;background:#ffffff;display:flex;flex-direction:column;justify-content:flex-end;padding:0 56px;border-top:1px solid #e2e7e2;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.5;color:#57625a;">',
    '<table style="width:100%;border-collapse:collapse;">',
    '<tr>',
    `<td style="text-align:left;vertical-align:middle;">${identity}</td>`,
    `<td style="text-align:center;vertical-align:middle;">${escapeHtml(poweredBy)}</td>`,
    `<td style="text-align:right;vertical-align:middle;">${pageIndicator}</td>`,
    '</tr>',
    '</table>',
    '</div>',
  ].join('');
}