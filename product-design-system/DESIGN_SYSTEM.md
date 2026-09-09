# Aleron MD Product Design System

**Current machine bundle:** v0.5.0, 17 Jul 2026 — as recorded in [`manifest.json`](./manifest.json), which is the authoritative version. If this line and the manifest ever disagree again, the manifest wins.

The human reference is [`index.html`](./index.html). Agents start with [`manifest.json`](./manifest.json) and follow [`AGENTS.md`](./AGENTS.md). Tokens, component contracts, and acceptance tests are separately structured so the reference page and prototypes share one implementation contract.

## Canonical assets

- [`tokens.json`](./tokens.json): primitive and semantic source
- [`tokens.css`](./tokens.css): generated web variables
- [`components.json`](./components.json): component registry
- [`components.css`](./components.css): reusable web implementations
- [`acceptance.json`](./acceptance.json): T1 through T7 test contract
- [`prototype-starter.html`](./prototype-starter.html): minimal register-aware prototype
- [`air-audit.js`](./air-audit.js): rendered air audit
- [`copy-audit.js`](./copy-audit.js): rendered copy audit
- [`icons.json`](./icons.json) and [`icons/`](./icons/): the closed icon set. Never redraw a codified icon
- [`AleronDesignTokens.swift`](./AleronDesignTokens.swift): generated iOS tokens, produced from `tokens.json` by [`build-swiftui-tokens.py`](./build-swiftui-tokens.py)
- [`validate-agent-kit.py`](./validate-agent-kit.py): existence-checks every path in the manifest's `files` inventory. Run it before building
- [`build-agent-kit.py`](./build-agent-kit.py): regenerates the machine bundle

The member Cabin register in [`register.html`](./register.html) is ratified. The physician register in [`physician-register.html`](./physician-register.html) remains provisional.
