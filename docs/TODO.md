# Persona — TODO

Short-term tasks, active bugs, and current sprint work.  
This file is updated frequently and reflects what's actually being worked on right now.

> **Legend:** 🔴 Blocking · 🟡 Important · 🟢 Nice to have · 🔵 In progress · ✅ Done

---

## 🚨 Security Fixes — Ship Nothing Else Until These Are Done

These are not improvements. They are bugs that make the extension unsafe to distribute publicly.

| # | Task | File | Severity | Owner |
|---|------|------|----------|-------|
| S-1 | Replace all `innerHTML` in popup with DOM API — avatar URL from page content is unsanitized | `popup.js` | 🔴 | — |
| S-2 | Add `sanitizeUrl()` — reject `data:`, `javascript:`, non-https avatar URLs before render | `popup.js` | 🔴 | — |
| S-3 | Add `content_security_policy` to manifest — `script-src 'self'; object-src 'none'; base-uri 'none'` | `manifest.json` | 🔴 | — |
| S-4 | Encrypt cookie blobs with AES-GCM before writing to storage — key in `chrome.storage.session` | `background.js` | 🔴 | — |
| S-5 | Scope `host_permissions` — remove `<all_urls>`, enumerate domains, use `chrome.permissions.request()` for user additions | `manifest.json` | 🔴 | — |
| S-6 | Validate all data from `content.js` before use — treat it as untrusted input | `popup.js`, `background.js` | 🔴 | — |

**Reference:** See [`SECURITY.md`](./SECURITY.md) for full threat model.

---

## 🐛 Bug Fixes — Phase 0

### Active Fixes
- [ ] 🔴 **Account Switch Bug Fix** (New window opens with wrong account after switch)
  - _Root Causes_: Cookie set URL path mismatch, domain mismatch, timing issues (window.create before propagation), no verification post-set.
  - _Plan_: 
    1. Fix cookie set: Use saved `c.domain`/`c.path`.
    2. Sequential set + delay 2s.
    3. Verify cookies set before window.
    4. Better logging, update `activeSessions`.
  - _File: `background.js` → `handleSwitchSession()`_

### Critical

- [ ] 🔴 **`getDomainFromUrl` returns `"google.com"` for `chrome://` pages**  
  Return `null` for internal pages. Gate `autoCaptureProfile()` and all storage writes on `currentDomain !== null`.  
  _File: `background.js` → `getDomainFromUrl()`_

- [ ] 🔴 **`content.js` injected twice on double popup open**  
  Add page-level sentinel: `if (window.__personaContentLoaded) return; window.__personaContentLoaded = true;`  
  _File: `content.js`_

- [ ] 🔴 **`chrome.storage.local.clear()` in `signOutAll` nukes all extension storage**  
  Replace with `chrome.storage.local.remove(['globalAccounts', 'activeSessions'])`.  
  _File: `popup.js` → `signOutAll()`_

### Important

- [ ] 🟡 **`setTimeout(1000)` propagation delay is a guess**  
  Replace with polling: after `cookies.set()`, verify sentinel cookie landed before proceeding. Cap at 3s.  
  _File: `background.js` → `handleSwitchSession()`_

- [ ] 🟡 **`SameSite=Strict` cookies silently fail on `cookies.set()`**  
  Log which cookies failed to set. Surface a warning in the switch result if session cookies were among them.  
  _File: `background.js` → `handleSwitchSession()`_

- [ ] 🟡 **Domain parser breaks on `co.in`, `.io` subdomains, GitHub Pages**  
  Install `tldts`. Replace custom `getDomainFromUrl` heuristic entirely.  
  _File: `background.js`_

### Minor (from recent code review)

- [ ] 🟢 **`activeAuthuser` module-level mutation inside `renderAccounts()`**  
  Move state read to the `btn-manage` click handler — read fresh from storage at click time, not from a variable set during last render.  
  _File: `popup.js`_

- [ ] 🟢 **`!== null` should be `!= null` where `undefined` is also possible**  
  Specifically: `activeAuthuser !== null` in the manage button handler.  
  _File: `popup.js`_

---

## 🔧 In Progress

- [ ] 🔵 **`activeAuthuser`-aware "Manage Account" URL** _(PR open, review in progress)_  
  Change reviewed — logic is correct, state management issue flagged. See code review notes.

---

## 📋 Upcoming — Phase 1 Prep

Not blocking current work, but queued for the next sprint.

- [ ] 🟡 **Migrate to TypeScript** — set up Vite + CRXJS build pipeline, `tsconfig.json` with `strict: true`
- [ ] 🟡 **Add Zod schemas for storage** — validate every `chrome.storage.local.get()` read at runtime
- [ ] 🟡 **Add `schemaVersion` to storage** — write migration runner for future schema changes
- [ ] 🟡 **Write unit tests for `getDomainFromUrl`** — cover: subdomains, country TLDs, `chrome://`, invalid URLs, empty string
- [ ] 🟡 **Visible error states in popup** — `renderAccounts`, `switchAccount`, `saveAccount` all need UI-level error display, not just `console.error`
- [ ] 🟢 **Add `SECURITY.md`** — threat model, what we protect against, what we don't, disclosure process
- [ ] 🟢 **Add `CONTRIBUTING.md`** — dev setup, extension loading, test commands, PR expectations

---

## ✅ Recently Completed

- ✅ Cookie merge strategy (non-destructive switch) — avoids logging out Google multi-login sessions
- ✅ `authuser` index detection from URL params and `/u/N` path patterns
- ✅ `autoCaptureProfile` — deduplication by email before auto-save
- ✅ `escapeHtml()` on name and email fields in account list render
- ✅ Authuser-aware "Manage Account" link (`/u/${authuser}/`) — pending review cleanup

---

## 🗂️ Decisions Log

Short rationale for non-obvious choices, so new contributors don't re-litigate them.

| Decision | Rationale |
|---|---|
| Cookie merge, not replace | Google multi-login (`APISID`, `SAPISID`) breaks if you clear before injecting. Merge preserves co-existing accounts. |
| No `<all_urls>` long-term | `<all_urls>` + `scripting` + `cookies` = maximum attack surface. Scope permissions explicitly; add domains via `chrome.permissions.request()`. |
| AES-GCM, not AES-CBC | GCM is authenticated encryption — detects tampering. CBC is not. No reason to use CBC for new code. |
| Key in `chrome.storage.session` | Session storage is cleared when browser closes. Encrypted blobs on disk are useless without the key. Trade-off: re-login on browser restart. Acceptable for now. |
| No cloud sync | Any server handling session cookies is a high-value target. Local-only is a feature, not a limitation. |
| `tldts` over custom parser | PSL has 9,000+ entries. Custom heuristics will always be wrong for edge cases. Don't maintain what you can depend on. |

---

## 🤝 How to Contribute

1. Pick any unassigned item above
2. Comment on the linked issue (or open one if none exists) so work isn't duplicated
3. For security fixes — assign yourself and open a draft PR early

**→ [Full contributing guide](../CONTRIBUTING.md)**  
**→ [Issue tracker](https://github.com/aswanidev-vs/persona/issues)**

---

*Last updated: manually — update this file when tasks change state.*
