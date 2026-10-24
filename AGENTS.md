# Clear Pop Up

- Read [the Clear design system](ui/design-system.md) and [theme tokens](ui/clear-theme.css) before changing interfaces. These are committed copies of the shared extensions theme.
- Use Basecoat 1.1.0; choose components in [the popup stylesheet](ui/popup.css). Do not add a full JavaScript runtime for native controls.
- Edit theme/layout sources in `ui/`, then run `bun run ui`. Commit generated assets because `src/` is directly loadable in Chrome.
- Use English source catalogs and English developer documentation/diagnostics/test descriptions. Maintain complete English (`en`) and French (`fr`) catalogs only. Localize all visible UI and accessibility text through native i18n; read [the i18n guide](ui/i18n.md). Browser UI language selects translations, with English fallback; do not add a language selector.
- Keep permissions, local-only processing, trusted-click permission handling and generic blocking behavior intact. Never add site-specific test shortcuts.
- Run `bun run check`, `bun run test` and `bun run build` before delivery. Test installed Chrome separately; disposable Chromium tests are not proof of the user's installed state.
