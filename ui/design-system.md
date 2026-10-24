# Clear extension design system

Version 1.0.0. Shared theme for local-first browser extensions. Basecoat 1.1.0 is the selected component library; each extension chooses its own components and controllers.

## Source of truth

Read [the shared theme](clear-theme.css) before changing an extension interface. This file contains tokens and Basecoat variable mappings only, with no component catalogue, fonts, scripts or external requests.

Copy it unchanged into each independent repository as `ui/clear-theme.css`. Commit that copy so a public clone builds independently of this parent folder. Copy this guide into `ui/design-system.md`, updating relative links as needed. When the shared theme changes, deliberately update consuming repositories and test them; builds must not depend on an external parent checkout.

## Appearance

- Use system fonts, 14px body text, 12–13px supporting labels and 18–20px titles.
- Use 4, 8, 12, 16, 24 and 32px spacing; 4, 8 and 12px radii; controls at least 32px tall in compact interfaces.
- Use the indigo brand for primary actions and active protection; amber for site exceptions; neutral gray with a dashed border for disabled protection.
- Always pair state colors with explicit text. Never show an allowed site as protected.
- Use the provided light and dark palettes. The default follows `prefers-color-scheme`; set `data-theme="light"` or `data-theme="dark"` to force a mode. The same tokens support shadow-root hosts.
- Keep shadows restrained, layouts compact and labels readable. Retain visible keyboard focus and respect reduced-motion preferences.
- Every extension must provide complete English and French interfaces, selected automatically from the browser UI language with English fallback and no manual selector. Read [the i18n integration contract](i18n.md) for implementation and packaging. Keep developer documentation, diagnostics and test descriptions in English.
- Localize all labels, dynamic messages, notifications and accessibility names. Let translated text wrap without clipping or displacing controls; test both English and French layouts. Change locale/direction only on extension-owned interfaces, never on visited pages.

## Basecoat integration

Read [Basecoat installation](https://basecoatui.com/installation/) and [customization](https://basecoatui.com/customization/) before adding a component.

1. Compile Tailwind locally. Import Basecoat base tokens, the required component structures and one official style pack (Vega for Clear Pop Up).
2. Import the Clear theme after the style pack so Clear owns the final palette.
3. Add only the JavaScript controllers needed by the extension. Buttons, switches and checkboxes already have native HTML behavior; application actions still need explicit handlers.
4. Preserve upstream MIT notices in distributed assets. Never load scripts, styles, fonts or icons from a CDN at runtime.
5. Keep injected page UI inside closed shadow roots. Include only its required local tokens and styles. Do not inject the full Basecoat stylesheet into visited pages.

The stock Vega pack contains styles for more than the imported structures. Do not claim perfect CSS pruning without measuring the resulting build. Component selection and application layout stay in each extension repository; this shared folder defines only the theme.

## Validation

- Verify active, allowed, disabled, focused and disabled-control states.
- Check both OS themes and explicit theme overrides, keyboard navigation, overflow, native English/French selection and unsupported-language fallback.
- Re-run the extension's full functional suite, inspect the installed browser interface and keep permissions unchanged unless a feature requires otherwise.
- Measure shipped CSS/JS separately from compressed archive sizes. Do not infer RAM usage from gzip sizes.

## Consumer

Read [Clear Pop Up](../readme.md) for the first implementation. Safari packaging is separate; the theme uses standard CSS, but Safari extension behavior has not been validated yet.
