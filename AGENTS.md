# Clear Pop Up

- Read [the Clear design system](ui/design-system.md) and [theme tokens](ui/clear-theme.css) before changing interfaces. These are committed copies of the shared extensions theme.
- Use Basecoat 1.1.0; choose components in [the popup stylesheet](ui/popup.css). Do not add a full JavaScript runtime for native controls.
- Edit theme/layout sources in `ui/`, then run `bun run ui`. Commit generated assets because `src/` is directly loadable in Chrome.
- All authored text must be English, including UI, injected notifications, diagnostics, documentation and tests.
- Keep permissions, local-only processing, trusted-click permission handling and generic blocking behavior intact. Never add site-specific test shortcuts.
- Run `bun run check`, `bun run test` and `bun run build` before delivery. Test installed Chrome separately; disposable Chromium tests are not proof of the user's installed state.
