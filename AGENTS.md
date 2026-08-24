# Guidelines for AI agents and contributors

## Internationalization (i18n) — required

The frontend is bilingual (`en` default, `de`) and must remain fully localized.
**Every string that can be displayed to the user must come from the i18n
translation resources.** Never hard-code user-facing text.

- Translation resources:
  `frontend/lib/i18n/resources/en.ts` and `frontend/lib/i18n/resources/de.ts`
- All UI code (React components, pages, helpers, hooks, error handling) must use
  the existing i18n mechanism — `t()` (`useI18n`) or `tr.t()` (`Translator`) —
  with a semantic translation **key**, never a literal English or German string.
- When adding a key:
  1. Add it to `en.ts` (English) and `de.ts` (German); `de.ts` is typed against
     `en.ts`, so both must stay in sync or `tsc --noEmit` will fail.
  2. Use a semantic nested key (e.g. `samplePage.loadFailed`), preserving the
     existing resource structure.

### What must be localized
- Visible JSX text, `aria-label`, `title`, `alt`, `placeholder`, tooltips
- Toasts / notifications (`toast.error`, `toast.success`, …)
- Validation and error messages (`setError`, `throw new Error`, `new Error`)
- Loading, empty, success, warning, confirmation and status messages
- Label/status mapping functions that render display values
- String returned from services/hooks/helpers that eventually reaches the UI

### What must NOT be translated
- API URLs, route paths, IDs/UUIDs, internal error codes, event names,
  NATS subjects, CSS class names, test identifiers, developer-only log messages
- Domain/business values that must stay stable internally (e.g. `planned`,
  `sold`, `draft`, `grundriss`, enum keys). Only their **displayed labels** are
  translated.
- Brand names that are identical in both locales (e.g. `Vista`).

### Error handling
When an error can reach the UI, keep internal/technical details (codes, messages)
separate from the localized user-facing message. Map backend error values to
translation keys instead of rendering raw backend strings in the UI.

See `frontend/lib/i18n/` for the implementation (`core.ts`, `index.tsx`,
`config.ts`, `resources/*`).
