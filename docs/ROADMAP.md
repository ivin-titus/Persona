# Persona — Roadmap

> From a working prototype to the identity layer the browser never shipped.

This document describes how Persona evolves from its current state to the long-term vision. It is a living document — updated as we learn, not a fixed commitment.

**Current status:** Early prototype. Cookie snapshot/restore working. Core switching loop functional for Google. Security hardening in progress.

---

## How to Read This

Each phase has a **goal** (what it unlocks), **scope** (what we build), and **success signal** (how we know it's done). Phases are sequential by intent but can overlap in practice. We don't move to the next phase until the current one's success signal is met.

---

## Phase 0 — Stabilize (Current)
**Goal:** Make what exists actually reliable and safe before anyone else uses it.

This phase is not glamorous. It is mandatory. Shipping a buggy or insecure session manager does lasting reputation damage that no future feature can undo.

### Scope

**Security fixes (blocking):**
- Replace all `innerHTML` usage in popup with DOM API — current code has XSS exposure via scraped avatar URLs
- Scope `host_permissions` away from `<all_urls>` — enumerate supported domains explicitly, use `chrome.permissions.request()` for user-added sites
- Add `content_security_policy` to manifest — `script-src 'self'; object-src 'none'`
- Encrypt cookie blobs before writing to `chrome.storage.local` — AES-GCM via Web Crypto API, key in `chrome.storage.session`
- Validate and sanitize all data returned from `content.js` before use in UI or storage

**Bug fixes (blocking):**
- Guard against duplicate `content.js` injection — add page-level sentinel variable
- Fix `getDomainFromUrl` returning `"google.com"` for `chrome://` internal pages — return `null` and gate all logic on it
- Scope `signOutAll` to specific storage keys — `chrome.storage.local.clear()` is too broad
- Replace `setTimeout(1000)` propagation delay with cookie verification polling

**Code quality (non-blocking but in this phase):**
- Replace module-level mutable state (`activeAuthuser`) with fresh reads at event handler call time
- Add eTLD+1 resolution via `tldts` — current heuristic breaks on `co.in`, `.io` subdomains, GitHub Pages
- Use `!= null` instead of `!== null` where both `null` and `undefined` are possible

### Success Signal
Zero known XSS surfaces. Encrypted storage shipped. All blocking bugs resolved. Two developers can use it daily without hitting crashes or data loss.

---

## Phase 1 — Foundation
**Goal:** A correctly architected codebase that can grow without accumulating debt.

### Scope

**Migrate to TypeScript + Vite + CRXJS:**
The current codebase is plain JS. As complexity grows — strategy pattern, detectors, crypto layer — untyped code becomes a liability. Migrate early, not after the codebase is large.

```
Stack:
  TypeScript       strict mode, no any
  Vite + CRXJS     hot reload, MV3 correct bundling
  Zod              runtime validation on all storage reads
  Vitest           unit tests for routing, crypto, domain parsing
```

**Typed storage with schema versioning:**
Storage schemas drift. Without versioning, a bad read silently corrupts state. Add a `schemaVersion` field and a migration runner that executes on extension startup.

**Proper error boundaries in popup:**
Every async operation in the popup (`renderAccounts`, `switchAccount`, `saveAccount`) needs a visible error state — not a silent `console.error`. Users need to know when something fails.

**Unit test coverage for core logic:**
- `domain.ts` — eTLD+1 parsing, edge cases
- `crypto.ts` — encrypt/decrypt round-trip, key rotation
- `vault-manager.ts` — CRUD operations, schema migration
- `routing-engine.ts` — domain → vault matching

### Success Signal
TypeScript strict passing. Zod validation on every storage read. Core logic has >80% unit test coverage. A new contributor can run `npm test` and understand what's being tested.

---

## Phase 2 — Strategy Layer
**Goal:** Switching works reliably across the target site list, with graceful fallback when it can't.

### Context
The biggest limitation of the current approach: cookie switching silently fails for `SameSite=Strict` cookies (GitHub, AWS), and there's no verification that a switch landed. Users get a blank stare instead of an error.

The fix is a **strategy pattern** — the extension picks the right switching mechanism per domain, verifies the result, and falls back with an explicit error if it fails.

### Scope

**Strategy registry:**
```
SwitchStrategy (interface)
├── CookieSwapStrategy        — current approach, enhanced with verification
├── GoogleMultiLoginStrategy  — authuser redirect + ListAccounts API
├── WindowFocusStrategy       — for SameSite=Strict sites; manage window, not cookies
└── ManualStrategy            — open login page, instruct user
```

**Post-switch verification:**
After switching, inject a lightweight content script that reads a known auth signal (current email in DOM, username meta tag) and reports success/failure back to the background. Surface the result to the user.

**Site detectors (Phase 2 target list):**
| Site | Method | Signal |
|---|---|---|
| google.com | `ListAccounts` API | Signed-in email list |
| github.com | `user_session` cookie + meta tag | `meta[name=user-login]` |
| gitlab.com | `_gitlab_session` cookie | `meta[name=current-user]` |
| facebook.com | `c_user` cookie | `aria-label` on account button |

**Generic fallback detector:**
For unlisted sites — try `meta[name=author]`, `og:title`, visible email patterns in DOM. Degrade gracefully rather than erroring.

### Success Signal
Switching GitHub, Google, GitLab, Facebook accounts works reliably. Failed switches show a clear error message, not a silent failure. Post-switch verification is wired up for all Phase 2 target sites.

---

## Phase 3 — Account Groups
**Goal:** One action switches an entire work context, not one account at a time.

### Context
OAuth-dependent sites (Vercel, Linear, Netlify, Jira) do not inherit session state from GitHub. Each has its own independent session cookie. "Follow the OAuth chain" is not technically achievable. The right model is **user-declared account groups**.

### Scope

**Group data model:**
```typescript
interface AccountGroup {
  id: string;
  name: string;          // "Work", "Personal", "Client A"
  color: string;
  icon?: string;
  accounts: {
    domain: string;
    accountId: string;
    order: number;       // switch sequence — GitHub before Vercel
  }[];
}
```

**Group switching:**
Sequential switch with configurable stagger (default 400ms between sites). GitHub switches first; dependent sites switch after. User sees a progress indicator per account.

**Group management UI:**
- Create/rename/delete groups
- Drag accounts into groups
- Set switch order within a group
- Keyboard shortcut per group (e.g., `Alt+1` for Work, `Alt+2` for Personal)

**Smart suggestions:**
When saving a new account on a domain already represented in a group, suggest adding to that group automatically.

### Success Signal
A user can define a "Work" group containing GitHub (work), Linear, Vercel, and Gmail (work) and switch all four with one action. Switch completes in under 3 seconds on a normal connection.

---

## Phase 4 — Session Health
**Goal:** Users know when saved sessions are stale before they try to use them.

### Context
Saved cookies expire. Sites rotate session tokens on password change, suspicious activity, or inactivity. Currently, users discover this only when a switch fails silently.

### Scope

**Health metadata per account:**
```typescript
interface AccountHealth {
  lastVerified: number;         // timestamp
  status: 'healthy' | 'stale' | 'expired' | 'unknown';
  verifiedCookieCount: number;  // if current count diverges, flag it
}
```

**Passive health check on popup open:**
On popup open, compare saved cookie names against what currently exists in the browser for that domain. If the session cookie (`user_session`, `SSID`, etc.) is missing, mark as stale without making a network request.

**UI health indicators:**
Small status dot on each account card. Green = verified recently. Yellow = unverified > 7 days. Red = known stale. Grey = unknown.

**Re-save prompt:**
When a stale account is clicked, offer "Update saved session" before attempting switch.

### Success Signal
Stale sessions are surfaced in the UI before the user tries to switch. Zero silent "I switched but I'm not logged in" experiences.

---

## Phase 5 — Site Intelligence Registry
**Goal:** The community maintains switching strategies, not just the core team.

### Context
There are thousands of sites people want to switch accounts on. Two developers cannot maintain site-specific detectors for all of them. The solution is to make the strategy registry a community artifact.

### Scope

**Registry format (JSON, versioned, shipped with extension):**
```json
{
  "version": "2.0.0",
  "sites": {
    "github.com": {
      "strategy": "cookie-swap",
      "sessionCookies": ["user_session", "__Host-user_session-two_factor"],
      "sameSite": "Lax",
      "authSignal": "meta[name=user-login]",
      "notes": "Two-factor session cookie must be included"
    }
  }
}
```

**Community contribution process:**
- Submit a PR to add or update a site entry
- Automated test suite validates the schema
- Maintainer review for correctness
- Ships in next extension update

**User-contributed overrides:**
Power users can add local site overrides in extension settings, without waiting for a registry update.

### Success Signal
Registry covers 50+ sites. At least 10 community contributors. PRs reviewed and merged within 72 hours on average.

---

## Phase 6 — The Workspace Layer
**Goal:** Persona manages not just account switching but entire browsing contexts.

### Context
This is the long-term differentiator. Once account switching is reliable, the next layer is **workspace management** — named contexts with their own window, tab memory, and account set. Think of it as Alfred/Raycast for your browser identity.

### Scope

**Named workspaces:**
- Work, Personal, Client A — each is a named window with associated accounts
- Switching workspace = focusing that window + switching all accounts in that group
- Tab memory per workspace — restore open URLs when a workspace is reopened

**Command palette:**
- `Alt+Space` → Persona command palette
- "Switch to Work", "Open github.com in Work", "Move this tab to Personal"
- Fuzzy search across all workspaces and accounts

**Sidebar panel (Chrome Side Panel API):**
- Always-visible workspace list
- Current workspace highlighted
- One-click workspace and account switching without opening popup

**Window auto-routing:**
New tabs opened from known domains auto-assigned to the correct workspace (configurable per domain).

### Success Signal
A developer can define Work and Personal workspaces, use a keyboard shortcut to switch between them entirely, and never manually manage which window contains which accounts.

---

## What We're Not Roadmapping

The following are explicitly out of scope, and will remain so:

- **Cloud sync of sessions** — security risk, out of threat model
- **Mobile browsers** — Chrome Android has no extension API
- **Firefox** — Firefox has native Containers; we'd add no value there
- **Session sharing between users** — team features are group export/import only, never live sync
- **Automated login / credential storage** — use a password manager

---

## Contributing to the Roadmap

This roadmap is public and open to discussion. If you have strong opinions about prioritization, open an issue with the `roadmap` label. We read everything.

If you want to work on a specific phase, check the issue tracker for issues tagged with the phase number.

**→ [Open Issues](https://github.com/aswanidev-vs/persona/issues)** · **→ [Discussions](https://github.com/aswanidev-vs/persona/discussions)** · **→ [Contributing Guide].(./CONTRIBUTING.md)**
