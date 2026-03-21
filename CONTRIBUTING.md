# Contributing to Persona

First off, thank you for considering contributing to Persona. 

Persona isn't just another browser extension; it's a high-impact, privacy-first solution designed to return control to the user. We are building a tool that seamlessly solves the real-world friction of multi-account management—without ever compromising on security or leaking user data to external servers. We believe in building software that is secure by default, respectful of user privacy, and robust against modern web threats. By contributing, you are helping build a safer, more productive web for everyone.

## The Core Contributor Rule: Security & Privacy First

We have a strict baseline for security, but we don't want bureaucracy to slow you down. We ask that every contribution honors our **"Zero-Trust Local"** policy:

*   **Zero External Calls:** The extension must never phone home, use external telemetry, or load remote scripts. All processing and data storage must remain strictly local on the user's machine.
*   **Defensive UI:** User input and external data (like website avatars and names) are fundamentally untrusted. Avoid `innerHTML`, adhere to the strict Content Security Policy, and aggressively sanitize inputs.
*   **Cookie Integrity:** Manipulating active session tokens is a high-privilege action. Code that touches cookies must be transparent, strictly necessary, and securely implemented.

As long as your code respects this policy, we will review and merge your PRs as quickly as possible.

## General Guidelines

1. **Understand the Architecture**: Read through [docs/VISION.md](./docs/VISION.md) and [docs/ROADMAP.md](./docs/ROADMAP.md) to understand where the project is heading.
2. **Focus on Security**: Please review [docs/SECURITY.md](./docs/SECURITY.md) before writing any code to understand our threat model.
3. **Pick an Issue**: Check [docs/TODO.md](./docs/TODO.md) for a list of active bugs and short-term tasks. For bugs marked 🔴 **Critical**, please comment before working on them to avoid duplicated efforts.

## Local Development Setup

To test your changes locally, you must load Persona as an unpacked extension:

1. Clone your fork of the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/persona.git
   cd persona
   ```
2. Open your browser's extension page:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
3. Toggle **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `src/` directory in this repository.
5. Your changes will reflect once you reload the extension via the refresh button in the extensions tray. Note that for UI (`popup.html`/`popup.css`/`popup.js`) changes you don't need to refresh, just reopen the popup. For `background.js` or `content.js` changes, you must hit the refresh icon.

## Pull Request Process

1. **Branching**: Create a separate branch for each bug fix or feature (`git checkout -b fix-auth-bug` or `git checkout -b feature-dark-mode`).
2. **Commits**: Write clear, descriptive commit messages.
3. **Reviews**: Your code will be reviewed by a maintainer. Be open to feedback and iterate on your code if requested. All checks (if any) must pass before a merge.
4. **Docs Updates**: If you add a new feature or change existing functionality, ensure you update any relevant documentation in `docs/` or `README.md`.

## Reporting Bugs

If you find a bug, but don't know how to fix it yourself, please check the [Issue tracker](https://github.com/aswanidev-vs/persona/issues) if it has been reported. If not, open a new issue describing:
- What happened (the bug).
- What you expected to happen.
- Steps to reproduce the issue.
- Your browser and version.

Again, thank you for improving Persona!
