# Privacy

Clear Pop Up 0.3.0 sends no data and contacts no servers.

The page DOM is examined locally to identify intrusive layers. The extension does not retain page text, conversations, purchases, full URLs, browsing history or tracking identifiers.

Local storage contains only boolean settings, explicitly allowed hostnames and explicitly saved CSS selectors. Counters and technical references used to restore elements across frames live temporarily in browser session storage. Hostnames and selectors can themselves be personal data; this extension does not transmit them.

Use **Clear exceptions and saved selections** to erase those choices. Uninstalling removes extension storage. There is no remote uninstall page, analytics or cloud synchronization. Basecoat styles, theme tokens and dependencies are bundled locally; no CDN, remote fonts or runtime downloads are used.

Interface translations are bundled locally. Browser UI language determines the displayed language; no language choice or translation request is stored or transmitted.
