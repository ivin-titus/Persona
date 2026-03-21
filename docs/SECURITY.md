# Security Policy — Persona

> We handle session cookies for GitHub, Google, and other high-value accounts.  
> This document explains exactly what we protect against, what we don't, and how to report issues.

---

## Threat Model

### What Persona Protects

**1. Saved session data at rest**  
Cookie snapshots are encrypted with AES-256-GCM before being written to disk via `chrome.storage.local`. The encryption key lives exclusively in `chrome.storage.session` — which Chrome clears when the browser closes. Encrypted blobs on disk are useless without the key.

**2. Popup UI against XSS**  
All dynamic content rendered in the popup (account names, emails, avatar URLs, domain labels) is inserted via DOM API — never `innerHTML`. Avatar URLs are validated to reject `data:`, `javascript:`, and non-HTTPS schemes before render. A compromised page cannot inject script into the Persona popup by crafting a malicious page title, avatar, or `og:image`.

**3. Content script data treated as untrusted**  
Everything returned by `content.js` — name, email, avatar, authuser — is treated as attacker-controlled input. It is validated and sanitized before being stored or rendered, regardless of what site it came from.

**4. Minimal permission surface**  
Persona does not request `<all_urls>`. Host permissions are scoped to supported domains only. Additional domains are added explicitly via `chrome.permissions.request()` — with user consent, one domain at a time. This limits blast radius if the extension is ever compromised.

**5. No external data transmission**  
No analytics. No telemetry. No error reporting to remote servers. No CDN-loaded scripts. The extension makes no outbound network requests except to the target sites you're actively switching to. This is enforced by the Content Security Policy in `manifest.json`.

---

### What Persona Does Not Protect Against

Being honest about limitations is part of our security model.

**Physical access to your machine**  
If someone has filesystem access to your browser profile directory, they can extract `chrome.storage.local` blobs. The AES-GCM encryption protects these at rest — but if the browser is open and the session key is in `chrome.storage.session`, a sufficiently privileged local process could read it. This is a browser-level threat, not something an extension can fully mitigate.

**A compromised Chrome/Brave browser binary**  
If the browser itself is malicious or has been tampered with, all bets are off. We operate within the browser's security model; we cannot secure you against it.

**Sites that store auth in localStorage or IndexedDB**  
Persona manages cookies. Some sites (notably SPAs using token-based auth stored in `localStorage`) do not use cookies for session state. Switching on these sites will not transfer the session. We document this per-site in the [Site Intelligence Registry](./registry/README.md).

**SameSite=Strict cookies**  
Chrome enforces `SameSite=Strict` at the browser level. Extensions cannot set these cookies cross-context. For affected sites (GitHub uses this for some cookies), we log which cookies failed and surface a warning. We do not silently proceed with a partial switch.

**Session tokens that have already expired**  
Saved sessions become stale when a site invalidates them (password change, suspicious login, inactivity timeout). Persona shows health indicators for saved accounts but cannot prevent expiry. See the [session health documentation](./docs/session-health.md).

**Other malicious browser extensions**  
A malicious extension with `storage` permission can read `chrome.storage.local`. Our AES-GCM encryption protects the cookie blobs specifically against this — an attacker reading storage sees ciphertext, not session tokens. However, a malicious extension with `cookies` permission can read cookies directly from the browser cookie store regardless of what Persona does.

---

## Permissions — Justification

Every permission Persona requests is documented here. If you see a permission in `manifest.json` that isn't listed below, that is a bug — please report it.

| Permission | Why it's needed | What we don't use it for |
|---|---|---|
| `cookies` | Read current session to save it; write saved cookies to switch accounts | We do not read cookies from domains outside the active switch operation |
| `storage` | Persist vault metadata and encrypted session blobs locally | We do not write analytics, identifiers, or any data not directly related to your saved accounts |
| `tabs` | Detect current domain; reload affected tabs after a switch | We do not track browsing history, tab titles, or URL patterns beyond the active tab's domain |
| `activeTab` | Access the currently focused tab to extract domain and trigger profile detection | We do not access background tabs without explicit user action |
| `scripting` | Inject `content.js` into the active tab to extract profile info (name, email, avatar) | We only inject on explicit user action (opening popup or clicking Save). We do not run persistent background scripts on pages. |

**Runtime-requested permissions (not in base manifest):**

| Permission | When requested | Why |
|---|---|---|
| `https://*.custom-domain.com/*` | When user adds a custom domain | Required to read/write cookies for that domain |

---

## Encryption Implementation

**Algorithm:** AES-256-GCM  
**Key generation:** `crypto.subtle.generateKey` — non-extractable after first import, 256-bit  
**IV:** 96-bit random, generated fresh per encryption operation via `crypto.getRandomValues`  
**Key storage:** `chrome.storage.session` (cleared on browser close, never written to disk)  
**Data storage:** `IndexedDB` within the extension origin (`chrome-extension://[id]/`), ciphertext only  

The IV is stored alongside the ciphertext (prepended, base64-encoded). Each encryption call uses a unique IV — no IV reuse.

GCM authentication tag detects any tampering with stored ciphertext. A modified blob will fail to decrypt and the account will be marked as corrupted, not silently loaded.

**What is not encrypted:**  
Vault metadata — account names, domain labels, email addresses, avatar URLs — is stored unencrypted in `chrome.storage.local`. This is intentional: this data is not sensitive enough to require encryption and keeping it unencrypted allows the popup to render account lists without requiring a key unlock step. If you consider email addresses sensitive in your threat model, do not use display names or real emails as account labels.

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

If you discover a vulnerability — especially one involving cookie exfiltration, XSS in the popup, or bypass of the encryption layer — please report it privately.

**Contact:** `ivintitus@proton.me`, `hello@ivin.site` 
**PGP key:** [keybase.io/persona-ext](https://keybase.io/persona-ext) *(optional but preferred for sensitive reports)*

### What to include

- Description of the vulnerability and affected component
- Steps to reproduce (a minimal proof of concept is ideal)
- Your assessment of severity and exploitability
- Whether you believe it is being actively exploited

### What to expect

| Timeframe | What happens |
|---|---|
| 48 hours | Acknowledgement of your report |
| 7 days | Initial assessment and severity classification |
| 30 days | Fix shipped or detailed timeline provided |
| 90 days | Public disclosure (coordinated with reporter) |

We will credit you in the release notes and `SECURITY.md` changelog unless you prefer to remain anonymous.

We do not have a bug bounty program at this time. We do have genuine gratitude and will say so publicly.

---

## What "Open Source" Means for Security Here

Publishing source code is not a security guarantee. It is a precondition for trust.

We make the following commitments to back it up:

**Reproducible builds.** The extension zip published to the Chrome Web Store is built from the tagged source on GitHub using the same `build.yml` workflow, publicly visible. You can verify the hash matches.

**No obfuscation.** We do not minify or obfuscate extension source in a way that makes review impossible. Build output is readable.

**Dependency audit.** We pin dependencies and run `npm audit` in CI. We do not include packages that access the network, the filesystem, or any browser API beyond what Persona itself uses.

**Extension ID pinning.** Our published extension ID is documented here and in the README. Forks are welcome — but if you see Persona-branded extensions with a different ID on the Web Store, treat them with suspicion and report them to us.

**Published extension ID:** `[published on first Web Store release]`

---

## Known Limitations We're Working On

| Limitation | Status | Tracking |
|---|---|---|
| SameSite=Strict cookies cannot be set by extensions | By design (Chromium) — we surface warnings | [#12](https://github.com/persona-ext/persona/issues/12) |
| Session key lost on browser close requires re-save | Accepted trade-off for security — evaluating passphrase unlock option | [#18](https://github.com/persona-ext/persona/issues/18) |
| No verification that switch landed (silent partial failure) | Post-switch verification via content script — in progress | [#9](https://github.com/persona-ext/persona/issues/9) |
| Avatar URL from page DOM is attacker-influenced | Sanitization in place — evaluating fallback to generated initials-only | [#21](https://github.com/persona-ext/persona/issues/21) |

---

## Changelog

| Version | Change |
|---|---|
| `0.1.0` | Initial security policy published |

---

*This document is updated with every security-relevant change to the codebase.*  
*Last reviewed by core team: see git blame.*
