# Persona - Project Timeline & Updates

This document tracks the evolution of the Persona extension, providing a history of major features and technical updates for contributors.

## v2.1.0 - The Productivity Update (2026-03-22)

This update focuses on rapid navigation and workflow efficiency by introducing a Raycast-inspired interface.

### New Features
- **Workspace Switcher (`Alt+Shift+D`)**: A centered modal for fuzzy-searching and switching between all user-created workspaces using arrow keys.
- **Command Palette (`Alt+Shift+S`)**: A global navigation hub that allows searching across all tabs in all active workspaces and executing quick actions.
- **Default Workspaces**: Users can now mark a workspace as "Default" (star icon).
- **Default Shortcut (`Alt+Shift+1`)**: Instantly opens the default workspace, or falls back to the first available workspace if no default is set.

### UX & DX Improvements
- **Modal Close (`Esc`)**: All popups (Dashboard, Switcher, Palette) now close immediately upon pressing the `Escape` key.
- **Centered Popups**: Improved the `openCenteredPopup` logic in `background.js` to ensure tools open in the center of the focused window.
- **Dashboard Fallback**: Implemented a fallback mechanism for opening the main dashboard from sub-popups when `chrome.action.openPopup` is restricted.
- **Dynamic Hints**: Updated the popup footer to dynamically show all configured keyboard shortcuts based on the state.

### Technical Changes
- **Shortcut Optimization**: Reduced the number of custom commands in `manifest.json` to 4 to comply with Chrome's absolute limit for extensions.
- **Storage Evolution**: Updated the `profiles` data structure to include an `isDefault` boolean property.
- **Message Protocol**: Added `TOGGLE_DEFAULT_PROFILE` and `OPEN_FOCUSED_POPUP` actions to the runtime message bus.

---

## v2.0.0 - Premium UI & System Rewrite
- Initial implementation of the Glassmorphic design system.
- Full rewrite of the session capture and restoration engine.
- Introduction of the Workspace (Profile) system.
