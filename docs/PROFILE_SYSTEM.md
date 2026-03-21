# Persona Profile Workspace System

## Overview

The Profile Workspace System extends Persona's account switching capabilities with a powerful multi-session/workspace management feature. Each profile is a distinct workspace with its own window and tab memory, wrapped in a premium glassmorphic interface.

## Key Features

### 1. Profile Creation
- Create custom profiles with names like "Dev", "Work", "Personal"
- Associate each profile with a specific account
- Optionally save current window tabs when creating a profile

### 2. Profile Environment
- Each profile is a workspace with its own set of tabs
- Profiles are tied to the account active during creation
- Open profiles in new windows with all saved tabs restored

### 3. Tab Management
- Add/remove tabs to profiles
- Save current window tabs to a profile
- Each tab stores:
  - URL
  - Title
  - Favicon

### 4. Profile Switching
- View all profiles in the popup
- Click to open a profile in a new window
- Keyboard shortcuts for quick switching (Alt+Shift+1-5)

### 5. Hibernation
- Inactive profiles don't consume memory
- Tabs are suspended when profile is hibernated
- State is saved and restored when profile is reopened

### 6. Persistence
- Profiles persist after browser restart
- Profiles persist after system shutdown
- Uses chrome.storage.local for reliable storage

## Storage Structure

```json
{
  "profiles": [
    {
      "id": "profile_1234567890_abc123",
      "name": "Dev",
      "accountId": "acc1",
      "tabs": [
        {
          "url": "https://github.com",
          "title": "GitHub",
          "favIconUrl": "https://github.com/favicon.ico"
        }
      ],
      "createdAt": 1234567890,
      "lastOpened": 1234567890,
      "windowId": null,
      "isHibernated": true
    }
  ]
}
```

## API Reference

### Profile Management Functions

#### `CREATE_PROFILE`
Create a new profile with tabs.

**Payload:**
```javascript
{
  name: "Dev",           // Profile name
  accountId: "acc1",     // Associated account ID
  tabs: [                // Optional: tabs to save
    { url: "https://github.com", title: "GitHub", favIconUrl: "..." }
  ]
}
```

**Response:**
```javascript
{
  success: true,
  profile: { /* profile object */ }
}
```

#### `GET_PROFILES`
Retrieve all profiles.

**Response:**
```javascript
{
  success: true,
  profiles: [ /* array of profile objects */ ]
}
```

#### `OPEN_PROFILE`
Open a profile in a new window.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123"
}
```

**Response:**
```javascript
{
  success: true,
  windowId: 12345
}
```

#### `SAVE_TABS_TO_PROFILE`
Save current window tabs to a profile.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123",
  windowId: 12345
}
```

**Response:**
```javascript
{
  success: true,
  tabs: [ /* array of tab objects */ ]
}
```

#### `ADD_TAB_TO_PROFILE`
Add a single tab to a profile.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123",
  url: "https://github.com",
  title: "GitHub",
  favIconUrl: "https://github.com/favicon.ico"
}
```

**Response:**
```javascript
{
  success: true,
  tabs: [ /* updated array of tab objects */ ]
}
```

#### `REMOVE_TAB_FROM_PROFILE`
Remove a tab from a profile.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123",
  tabIndex: 0
}
```

**Response:**
```javascript
{
  success: true,
  tabs: [ /* updated array of tab objects */ ]
}
```

#### `DELETE_PROFILE`
Delete a profile and close its window if open.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123"
}
```

**Response:**
```javascript
{
  success: true
}
```

#### `RENAME_PROFILE`
Rename a profile.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123",
  newName: "Development"
}
```

**Response:**
```javascript
{
  success: true,
  profile: { /* updated profile object */ }
}
```

#### `HIBERNATE_PROFILE`
Hibernate a profile (close window, save state).

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123"
}
```

**Response:**
```javascript
{
  success: true
}
```

#### `UPDATE_PROFILE_ACCOUNT`
Update the account associated with a profile.

**Payload:**
```javascript
{
  profileId: "profile_1234567890_abc123",
  accountId: "acc2"
}
```

**Response:**
```javascript
{
  success: true,
  profile: { /* updated profile object */ }
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+Shift+1 | Open Profile 1 |
| Alt+Shift+2 | Open Profile 2 |
| Alt+Shift+3 | Open Profile 3 |
| Alt+Shift+4 | Open Profile 4 |
| Alt+Shift+5 | Open Profile 5 |

## Usage Examples

### Creating a Profile

1. Click the Persona extension icon
2. Click the "+" button next to "Workspaces"
3. Enter a name (e.g., "Dev")
4. Select an account from the dropdown
5. Check "Save current window tabs" if desired
6. Click "Create Workspace"

### Opening a Profile

1. Click the Persona extension icon
2. Click on a profile in the "Workspaces" section
3. Click "Open Workspace"
4. A new window will open with all saved tabs

### Adding Tabs to a Profile

1. Click on a profile to open its details
2. Click the "+" button next to "Tabs"
3. Enter the URL and optional title
4. Click "Add Tab"

### Saving Current Tabs

1. Open a profile window
2. Navigate to desired tabs
3. Click the Persona extension icon
4. Click on the profile
5. Click "Save Current Tabs"

### Hibernating a Profile

1. Click on a profile to open its details
2. Click the "Hibernate" button (top right icon)
3. The profile window will close
4. State is saved for later restoration

## Architecture

### Decoupled Design

The profile system is designed to be **decoupled from account switching**:

- **Profiles** = Workspace/session layer
- **Accounts** = Identity layer

This separation allows:
- Profiles to be linked to accounts without being dependent on them
- Account switching to work independently of profiles
- Profiles to be managed separately from account sessions

### Hibernation System

When a profile is hibernated:
1. Current tab state is saved to storage
2. Profile window is closed
3. `isHibernated` flag is set to `true`
4. `windowId` is cleared

When a profile is opened:
1. New window is created with saved tabs
2. `isHibernated` flag is set to `false`
3. `windowId` is updated
4. Account session is restored if available

### Auto-Hibernation

Profiles are automatically hibernated when:
- User closes the profile window
- Browser is restarted
- System is shutdown

The `chrome.windows.onRemoved` listener detects window closures and updates profile state accordingly.

## Best Practices

1. **Organize by Purpose**: Create profiles for different workflows (Dev, Work, Personal)
2. **Save Tabs Regularly**: Use "Save Current Tabs" to keep profiles updated
3. **Hibernate Inactive Profiles**: Hibernation saves memory and resources
4. **Use Keyboard Shortcuts**: Quick-switch between profiles with Alt+Shift+1-5
5. **Link to Accounts**: Associate profiles with specific accounts for session management

## Troubleshooting

### Profile Won't Open
- Check if the profile window is already open (it will be focused instead)
- Verify the associated account still exists
- Try hibernating and reopening the profile

### Tabs Not Saving
- Ensure you're clicking "Save Current Tabs" from the profile details view
- Check that the tabs are not chrome:// or chrome-extension:// URLs
- Verify you have sufficient storage space

### Keyboard Shortcuts Not Working
- Check Chrome's extension shortcuts settings (chrome://extensions/shortcuts)
- Ensure no conflicts with other extensions
- Try restarting the browser

## Future Enhancements

- [ ] Auto-hibernate inactive profiles after timeout
- [ ] Lazy load tabs (open inactive tabs in background)
- [ ] Profile import/export
- [ ] Profile templates
- [ ] Profile sharing between devices
- [ ] Profile analytics and usage tracking
