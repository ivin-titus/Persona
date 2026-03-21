# Persona — Vision

> *The identity layer the browser never shipped.*

---

## The Problem We're Solving

Every person online lives multiple lives. A developer juggles a work GitHub, a personal GitHub, a freelance client's AWS console, and three Google Workspace accounts. A journalist maintains separate identities for source protection. A small agency runs ten client accounts across Facebook, Google Ads, and LinkedIn simultaneously.

The browser was never designed for this. It assumes one person, one identity, one context.

The workarounds people use today are either **fragile** (cookie hacks that break on SameSite changes), **clunky** (launching separate browser instances per account), or **dangerous** (sharing sessions in ways that leak credentials across contexts).

**No one has solved this cleanly. Not Google. Not Mozilla. Not any extension on the store.**

The reason is that solving it properly requires honesty about what a browser *can* do — and building the best possible experience within those real constraints, rather than making promises the platform can't keep.

---

## What Persona Is

Persona is an **open-source, security-first identity management layer for Chromium browsers**.

It does not fake session isolation. It does not manipulate your cookies in ways that silently break. It does not require you to trust a closed-source extension with your GitHub tokens and Google session cookies.

Instead, it gives you:

- **Named identities** — discrete, labeled contexts that map to how you actually think about your accounts
- **Smart switching** — the right strategy per site, not a one-size-fits-all cookie injection
- **Account grouping** — switch your "Work" identity and have GitHub, Linear, Vercel, and Gmail all update together
- **Transparent security** — encrypted local storage, minimal permissions, auditable source code, no telemetry

Persona is the tool you'd build yourself if you had the time. We're building it for everyone.

---

## The Vision: An Open Identity Standard for the Browser

In three to five years, Persona should be to browser identity what **pass** is to password management or what **gpg** is to encryption — a trusted, composable primitive that the community builds on top of.

### What that looks like:

**For individual users:**  
One keyboard shortcut to switch your entire digital context. Work mode. Personal mode. Client mode. Each with its own set of active accounts, tab groups, and window arrangements. Your browser adapts to *you*, not the other way around.

**For developers:**  
A first-class tool in every developer's workflow. Switching between your personal GitHub and your work org should be as fast as switching a git remote. Persona becomes the standard way developers manage multi-account access — the thing you `brew install` on a new machine.

**For teams and agencies:**  
Shared account groups with encrypted export. Onboard a new hire by handing them a Persona vault. Offboard by revoking it. Client accounts never mix with internal ones.

**For the open-source ecosystem:**  
A published, versioned **Site Intelligence Registry** — a community-maintained database of how each major site handles sessions, what cookies matter, and the right switching strategy. Persona ships with it. Anyone can contribute to it.

**For the browser vendors:**  
Proof of demand. Firefox shipped Containers because the Multi-Account Containers extension proved the need. Persona's adoption is the argument for Chromium to ship a native identity API. We build the extension; we make the case.

---

## What Persona Is Not

We will never be:

- **A password manager.** We don't touch credentials. We manage sessions. These are different problems.
- **A VPN or proxy.** Network-level identity is out of scope. We operate at the session layer.
- **A session sync service.** No cloud storage. No servers. No accounts on our end. Everything stays on your machine, encrypted.
- **A closed product that holds your sessions hostage.** Your data is yours. Export it, audit it, delete it entirely at any time.

---

## Why Open Source

Because you shouldn't have to trust us.

An extension that handles GitHub session tokens and Google auth cookies for thousands of users is an extraordinarily high-value target. The only credible answer to "why should I trust this?" is: *"You don't have to. Read the code."*

Open source is not our distribution strategy. It's our security model.

We believe the right way to build reputation in security tooling is slowly, in public, with a track record. Every commit, every security fix, every documented trade-off is part of that record.

---

## Core Principles (Non-Negotiable)

**1. Honest about limitations.**  
We document what works, what doesn't, and why. No marketing language that overpromises isolation we can't deliver on Chromium.

**2. Minimal privilege.**  
We request only the permissions we need, scoped as tightly as possible. We explain every one of them in plain language.

**3. Encrypted by default.**  
Session data never touches disk in plaintext. AES-GCM encryption with ephemeral keys is not a premium feature — it's the baseline.

**4. No telemetry. Ever.**  
Not anonymized. Not aggregated. Not opt-in. Nothing leaves your machine.

**5. Reproducible and auditable.**  
Published builds match the source. Anyone can verify.

---

## The Opportunity

There are approximately 3.2 billion people using Chromium-based browsers. A meaningful fraction of them manage multiple accounts regularly. No credible, open-source, security-conscious solution exists for them today.

That's the gap Persona fills.

We're not building a feature. We're building the infrastructure for how people manage digital identity in the browser — and making it free, open, and trustworthy for everyone.

---

*Persona is built by developers who got tired of the workarounds.*  
*Contributions welcome. Trust earned, not assumed.*

**→ [GitHub](https://github.com/aswanidev-vs/persona)** · **→ [Contributing](../CONTRIBUTING.md)** · **→ [Security Policy](./SECURITY.md)**
