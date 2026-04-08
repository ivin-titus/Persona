# Feature Improvements — Persona

> Engineering notes on planned features, feasibility assessments, and implementation strategy.  
> This document lives alongside the roadmap but goes deeper on the *how*.

---

## Table of Contents

1. [Google Account Switching — Fix Mass Logout](#1-google-account-switching--fix-mass-logout)
2. [Sub-groups Inside a Workspace](#2-sub-groups-inside-a-workspace)
3. [Import Chrome Tab Groups as Workspace](#3-import-chrome-tab-groups-as-workspace)
4. [Move / Copy Tab into Workspace](#4-move--copy-tab-into-workspace)

---

## 1. Google Account Switching — Fix Mass Logout

**Status:** Bug — fix before any new features  
**Severity:** Critical — currently breaks all Google sessions on switch  
**Feasibility:** ✅ Straightforward once root cause is understood

### What's Happening

Google cryptographically cross-validates a cluster of cookies on every authenticated request:

```
APISID, SAPISID, HSID     ← cross-validated against each other server-side
SID, LSID                 ← primary session identifiers
__Secure-1PSID            ← Chrome-specific secure variant
__Secure-3PSID            ← third-party context variant
```

When Persona injects a saved `SID` from Account B while Account A's `APISID`/`SAPISID` remain in the cookie store, Google's backend receives a **mismatched cookie set**. It interprets this as a session hijack attempt and invalidates all sessions on that cookie store simultaneously — logging out every Google account at once.

The "temporarily worked" window (1–3 seconds) is the propagation delay before Google's next authenticated request catches the mismatch.

The current "merge not replace" strategy in `background.js` makes this worse, not better — injecting a new `SID` while leaving old `APISID`/`SAPISID` in place is exactly the pattern Google's abuse detection flags.

### The Fix — Never Touch Google Cookies

Google already ships multi-account support natively via `authuser` indices. The correct strategy for all Google-owned domains is a **redirect, not a cookie swap**.

```typescript
// src/background/strategies/google-multilogin.ts

const GOOGLE_DOMAINS = [
  'google.com', 'gmail.com', 'youtube.com',
  'docs.google.com', 'drive.google.com', 'meet.google.com'
];

class GoogleMultiLoginStrategy implements SwitchStrategy {
  async execute(account: Account): Promise<SwitchResult> {

    if (account.authuser != null) {
      // Best case — we have the authuser index, direct redirect
      chrome.windows.create({
        url: `https://www.google.com/webhp?authuser=${account.authuser}`,
        focused: true
      });
      return { success: true, method: 'authuser-redirect' };
    }

    if (account.email) {
      // Fallback — open Google's own AccountChooser
      const url = `https://accounts.google.com/AccountChooser` +
                  `?Email=${encodeURIComponent(account.email)}` +
                  `&continue=${encodeURIComponent('https://www.google.com')}`;
      chrome.windows.create({ url, focused: true });
      return { success: true, method: 'account-chooser' };
    }

    // Last resort — open Google sign-in
    chrome.windows.create({ url: 'https://accounts.google.com', focused: true });
    return { success: false, method: 'manual', reason: 'no-authuser-or-email' };
  }
}
```

**Zero cookie manipulation for any Google domain. No logout risk.**

### Immediate Hotfix (Before Strategy Refactor)

Add a domain guard at the top of `handleSwitchSession` in `background.js`:

```js
async function handleSwitchSession(payload, sendResponse) {
  const { accountId } = payload;
  const data = await chrome.storage.local.get("globalAccounts");
  const target = data.globalAccounts.find(a => a.id === accountId);

  const GOOGLE_DOMAINS = ['google.com', 'gmail.com', 'youtube.com'];
  if (GOOGLE_DOMAINS.includes(target.domain)) {
    const url = target.authuser != null
      ? `https://www.google.com/webhp?authuser=${target.authuser}`
      : `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(target.email)}`;
    chrome.windows.create({ url, focused: true });
    sendResponse({ success: true });
    return; // never reaches cookie swap
  }

  // ... existing cookie swap logic for non-Google domains
}
```

### Constraint — Only Works for Already Signed-In Accounts

`authuser` redirects only work if that Google account is already active in the browser's current session. For a Google account not yet signed in:

| Scenario | Behavior |
|---|---|
| Account is signed in at `authuser=1` | Direct redirect — one click |
| Account is not currently signed in | AccountChooser opens — user signs in manually |
| No email saved, no authuser | Falls back to accounts.google.com |

This is not a limitation of Persona — it is Google's session model. Document it clearly in the UI rather than making it look like a failure.

---

## 2. Sub-groups Inside a Workspace

**Status:** Planned — Phase 3  
**Feasibility:** ✅ No API dependency — pure data model + Chrome Tab Groups for visual rendering  
**API used:** `chrome.tabGroups` (MV3, available Brave + all Chromium 89+)

### Concept

A workspace can contain named sub-groups. Each sub-group maps 1:1 to a **Chrome native tab group** (the colored groupings already in the browser UI). Users see familiar colored tab groups in the tab bar — Persona just manages what goes in them.

```
Workspace: "Work"
├── Sub-group: "Frontend"   → Chrome tab group (red)  → github.com/org/ui, localhost:3000
├── Sub-group: "Backend"    → Chrome tab group (blue)  → github.com/org/api, localhost:8080
└── Sub-group: "Infra"      → Chrome tab group (green) → aws.amazon.com/console, grafana.internal
```

### Data Model

```typescript
interface Workspace {
  id: string;
  name: string;
  color: string;
  windowId: number | null;
  accounts: AccountRef[];
  subGroups: SubGroup[];       // ← new
  ungroupedUrls: string[];     // tabs not belonging to any subgroup
}

interface SubGroup {
  id: string;
  name: string;
  color: TabGroupColor;        // chrome.tabGroups.Color enum
  collapsed: boolean;
  pinnedUrls: string[];
  chromeGroupId: number | null; // live reference, null when workspace is closed
}

// chrome.tabGroups.Color options:
type TabGroupColor =
  | 'grey' | 'blue' | 'red' | 'yellow'
  | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';
```

### Creating a Sub-group from Scratch

```typescript
async function createSubGroup(workspaceId: string, name: string, color: TabGroupColor) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace.windowId) return; // workspace window not open

  // Create a Chrome tab group in the workspace window
  const tab = await chrome.tabs.create({ windowId: workspace.windowId, url: 'about:blank' });
  const chromeGroupId = await chrome.tabs.group({ tabIds: [tab.id!], windowId: workspace.windowId });

  await chrome.tabGroups.update(chromeGroupId, { title: name, color, collapsed: false });

  const subGroup: SubGroup = {
    id: crypto.randomUUID(),
    name,
    color,
    collapsed: false,
    pinnedUrls: [],
    chromeGroupId
  };

  workspace.subGroups.push(subGroup);
  await saveWorkspace(workspace);
}
```

### Restoring Sub-groups When Workspace Opens

```typescript
async function restoreSubGroups(workspace: Workspace) {
  for (const subGroup of workspace.subGroups) {
    if (subGroup.pinnedUrls.length === 0) continue;

    // Open all tabs for this subgroup
    const tabIds = await Promise.all(
      subGroup.pinnedUrls.map(url =>
        chrome.tabs.create({ windowId: workspace.windowId!, url, active: false })
          .then(tab => tab.id!)
      )
    );

    // Group them in Chrome
    const chromeGroupId = await chrome.tabs.group({
      tabIds,
      windowId: workspace.windowId!
    });

    await chrome.tabGroups.update(chromeGroupId, {
      title: subGroup.name,
      color: subGroup.color,
      collapsed: subGroup.collapsed
    });

    // Update live reference
    subGroup.chromeGroupId = chromeGroupId;
  }

  await saveWorkspace(workspace);
}
```

### Sync Sub-group State on Window Close

When a workspace window closes, persist current tab URLs per group before destroying:

```typescript
chrome.windows.onRemoved.addListener(async (windowId) => {
  const workspace = await getWorkspaceByWindowId(windowId);
  if (!workspace) return;

  for (const subGroup of workspace.subGroups) {
    if (!subGroup.chromeGroupId) continue;

    const tabs = await chrome.tabs.query({ groupId: subGroup.chromeGroupId });
    subGroup.pinnedUrls = tabs
      .map(t => t.url!)
      .filter(url => url && !url.startsWith('chrome') && !url.startsWith('about'));
    subGroup.chromeGroupId = null; // window gone, reference is stale
  }

  await saveWorkspace(workspace);
});
```

---

## 3. Import Chrome Tab Groups as Workspace

**Status:** Planned — Phase 3  
**Feasibility:** ✅ `chrome.tabGroups` API covers everything needed  
**API used:** `chrome.tabGroups.query()`, `chrome.tabs.query({ groupId })`

### Flow

```
User opens Persona popup → clicks "Import Tab Groups"
  ↓
Query current window for all tab groups
  ↓
Show list with group name, color, tab count
  ↓
User selects: "New Workspace" or "Add to Existing Workspace [▾]"
  ↓
For each selected group:
  → chrome.tabs.query({ groupId }) → get URLs
  → Create SubGroup from group metadata
  → Save to target workspace
  ↓
Ask: "What about ungrouped tabs?" → [Import as 'General'] [Skip]
```

### Implementation

```typescript
interface TabGroupPreview {
  chromeGroupId: number;
  title: string;
  color: TabGroupColor;
  tabCount: number;
  urls: string[];
}

async function getImportableGroups(windowId: number): Promise<TabGroupPreview[]> {
  const groups = await chrome.tabGroups.query({ windowId });

  return Promise.all(groups.map(async (group) => {
    const tabs = await chrome.tabs.query({ groupId: group.id, windowId });
    return {
      chromeGroupId: group.id,
      title: group.title || 'Unnamed Group',
      color: group.color,
      tabCount: tabs.length,
      urls: tabs.map(t => t.url!).filter(Boolean)
    };
  }));
}

async function importGroupsAsWorkspace(
  groups: TabGroupPreview[],
  workspaceName: string,
  ungroupedUrls: string[] = []
): Promise<void> {
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: workspaceName,
    color: 'blue',
    windowId: null,
    accounts: [],
    subGroups: groups.map(g => ({
      id: crypto.randomUUID(),
      name: g.title,
      color: g.color,
      collapsed: false,
      pinnedUrls: g.urls,
      chromeGroupId: null
    })),
    ungroupedUrls
  };

  await saveWorkspace(workspace);
}
```

### Edge Cases to Handle

| Scenario | Handling |
|---|---|
| Tab group with no title | Default to `"Group {color}"` |
| Tabs with `chrome://` or `about:` URLs | Filter out — cannot be restored |
| Duplicate group names | Allow — groups are identified by `id`, not name |
| Empty tab groups | Import with zero `pinnedUrls`, still create the SubGroup |
| Ungrouped tabs | Prompt user — import as `"General"` subgroup or skip |

---

## 4. Move / Copy Tab into Workspace

**Status:** Planned — Phase 3 (context menu), Phase 6 (sidebar drag)  
**Feasibility:** ✅ Context menu approach is straightforward. Sidebar drag requires Side Panel API.

### Path A — Right-click Context Menu (Ship First)

```typescript
// Register on extension install / startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'persona-move-tab',
    title: 'Move Tab to Workspace',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'persona-copy-tab',
    title: 'Copy Tab to Workspace',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !tab.url) return;
  if (info.menuItemId !== 'persona-move-tab' && info.menuItemId !== 'persona-copy-tab') return;

  const isCopy = info.menuItemId === 'persona-copy-tab';

  // Store pending action — popup reads this on open
  await chrome.storage.session.set({
    pendingTabAction: {
      type: isCopy ? 'copy' : 'move',
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    }
  });

  // Open popup to let user choose target workspace + subgroup
  chrome.action.openPopup();
});
```

**Move vs Copy difference:**

```typescript
async function executeTabAction(
  action: 'move' | 'copy',
  tabId: number,
  url: string,
  targetWorkspaceId: string,
  targetSubGroupId?: string
) {
  const workspace = await getWorkspace(targetWorkspaceId);

  if (targetSubGroupId) {
    const subGroup = workspace.subGroups.find(g => g.id === targetSubGroupId);
    subGroup?.pinnedUrls.push(url);
  } else {
    workspace.ungroupedUrls.push(url);
  }

  await saveWorkspace(workspace);

  if (action === 'move') {
    await chrome.tabs.remove(tabId); // close source tab
  }
  // copy: source tab stays open
}
```

### Context Menu Nesting Limitation

Chrome context menus support **one level of submenus only**. This means:

```
Right-click → "Move Tab to Workspace" → [Work] [Personal] [Client A]
                                                ↑
                              Can't nest subgroups here
```

After the user picks a workspace from the context menu submenu, open the popup to let them pick the subgroup. This is a two-step UX but avoids the nesting limit cleanly.

Alternatively, skip the submenu entirely and always open the popup with the pending action pre-filled.

### Path B — Sidebar Drag (Phase 6)

Using the Chrome Side Panel API (`chrome.sidePanel`), Persona can show a persistent panel with a workspace/subgroup tree. The "drag" interaction is approximated:

- User opens Side Panel
- Clicks a tab in the browser → "Send to Persona" button appears in sidebar (via `tabs.onActivated`)
- User clicks target workspace/subgroup in sidebar → tab URL is saved there
- If "move" → tab closes

True drag-and-drop from the tab strip into an HTML panel is not supported by any Chrome extension API. The button-based approach is the honest approximation.

---

## Implementation Priority

| Feature | Blocks Other Features | Complexity | Priority |
|---|---|---|---|
| Google mass logout fix | Nothing ships cleanly without this | Low | **Now** |
| Sub-groups data model | Tab group import and move/copy both depend on it | Medium | Phase 3 start |
| Tab group import | Needs sub-groups model | Low-Medium | Phase 3 |
| Move/copy tab (context menu) | Needs sub-groups model | Low | Phase 3 |
| Move/copy tab (sidebar) | Needs Side Panel API integration | High | Phase 6 |

---

*This document is updated as implementation progresses. Implementation notes supersede this spec if they conflict.*
