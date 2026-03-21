// background.js - Core logic for cookie management using built-in chrome.storage

/**
 * Extract the main domain from a URL (e.g., mail.google.com -> google.com)
 */
function getDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'chrome-extension:') return 'google.com'; // Default for internal pages

    const hostname = parsed.hostname;
    const parts = hostname.split('.');

    // Handle country codes (e.g. google.co.uk)
    if (parts.length > 2) {
      const last = parts[parts.length - 1];
      const secondLast = parts[parts.length - 2];
      if (last.length === 2 && secondLast.length <= 3) return parts.slice(-3).join('.');
    }

    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch (e) {
    return 'google.com'; // Fallback
  }
}

/**
 * Common logic to inject a set of cookies into the browser.
 * Ensures security flags (Secure, HttpOnly, SameSite) and forces session persistence.
 */
async function injectCookies(cookies, domain) {
  for (const c of cookies) {
    // Determine the precise URL for this specific cookie's domain and path
    const protocol = c.secure ? "https:" : "http:";
    const cleanDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
    const url = `${protocol}//${cleanDomain}${c.path}`;

    const isSecureUrl = protocol === "https:";
    const lowerName = c.name.toLowerCase();
    // Keywords that suggest a sensitive authentication/session cookie
    const isSensitive = lowerName.includes('session') || 
                        lowerName.includes('token') || 
                        lowerName.includes('sid') || 
                        lowerName.includes('auth') || 
                        lowerName.includes('jwt') ||
                        lowerName.includes('sid');

    const newCookie = {
      url: url,
      name: c.name,
      value: c.value,
      path: c.path,
      // Hardening: Force Secure on HTTPS, and Force HttpOnly for potential session tokens
      // This protects them from being stolen by malicious scripts (XSS).
      secure: c.secure || isSecureUrl,
      httpOnly: c.httpOnly || isSensitive,
      // If sameSite is not specified, default to Lax for CSRF protection
      sameSite: (c.sameSite && c.sameSite !== 'unspecified') ? c.sameSite : 'lax',
      // If it's a session cookie (no expiration), force it to persist for 1 year
      // This ensures sessions survive browser restarts/shutdowns.
      expirationDate: (c.expirationDate) ? c.expirationDate : (Date.now() / 1000) + (60 * 60 * 24 * 365),
    };


    if (!c.hostOnly) {
      newCookie.domain = c.domain;
    }

    // Wait for each cookie to be set safely
    await chrome.cookies.set(newCookie).catch(err => {
      console.warn(`Failed to set cookie ${c.name} for ${domain}:`, err);
    });
  }
}

/**
 * Restores all active sessions on browser startup.
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log("Browser startup detected. Restoring active Persona sessions...");
  try {
    const data = await chrome.storage.local.get(["globalAccounts", "activeSessions"]);
    const accounts = data.globalAccounts || [];
    const activeSessions = data.activeSessions || {};

    for (const [domain, accountId] of Object.entries(activeSessions)) {
      const activeAccount = accounts.find(acc => acc.id === accountId);
      if (activeAccount && activeAccount.cookies) {
        console.log(`Restoring session for ${domain} (${activeAccount.email})...`);
        await injectCookies(activeAccount.cookies, domain);
      }
    }
  } catch (error) {
    console.error("Failed to restore sessions on startup:", error);
  }
});


// Listen for messages from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SAVE_SESSION") {
    handleSaveSession(request.payload, sendResponse);
    return true; 
  }
  
  if (request.action === "SWITCH_SESSION") {
    handleSwitchSession(request.payload, sendResponse);
    return true;
  }

  if (request.action === "GET_ACCOUNTS") {
    handleGetAccounts(request.payload, sendResponse);
    return true;
  }

  if (request.action === "REMOVE_ACCOUNT") {
    handleRemoveAccount(request.payload, sendResponse);
    return true;
  }

  if (request.action === "GET_CURRENT_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const domain = getDomainFromUrl(tabs[0].url);
        sendResponse({ tab: tabs[0], domain: domain, title: tabs[0].title });
      } else {
        sendResponse({ error: "No active tab" });
      }
    });
    return true;
  }

  if (request.action === "CLEAR_DOMAIN_COOKIES") {
    handleClearCookies(request.payload.domain, sendResponse);
    return true;
  }
});

async function handleClearCookies(domain, sendResponse) {
  try {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    const removalPromises = cookies.map(c => {
      const protocol = c.secure ? "https:" : "http:";
      const cleanDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
      const url = `${protocol}//${cleanDomain}${c.path}`;
      return chrome.cookies.remove({ url, name: c.name, storeId: c.storeId });
    });
    await Promise.all(removalPromises);
    
    // Reload tabs for this domain
    const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
    tabs.forEach(tab => chrome.tabs.reload(tab.id));
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Captures cookies for the current domain and stores them in a GLOBAL list.
 */
async function handleSaveSession(payload, sendResponse) {
  const { name, domain, avatar, email, authuser } = payload;
  
  try {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    const accountId = crypto.randomUUID();
    const accountData = {
      id: accountId,
      name: name,
      domain: domain,
      avatar: avatar || null,
      email: email || null,
      authuser: authuser || null,
      timestamp: Date.now(),
      cookies: cookies
    };

    // Store in globalAccounts list
    const data = await chrome.storage.local.get(["globalAccounts", "activeSessions"]);
    const accounts = data.globalAccounts || [];
    
    // Update if email exists, otherwise add new
    const existingIdx = accounts.findIndex(acc => acc.email === email && email !== null);
    if (existingIdx !== -1) {
      accounts[existingIdx] = accountData;
    } else {
      accounts.push(accountData);
    }
    
    const activeSessions = data.activeSessions || {};
    activeSessions[domain] = accountId;

    await chrome.storage.local.set({ globalAccounts: accounts, activeSessions });
    console.log("Account saved:", accountData); // ADDED
    sendResponse({ success: true, account: accountData });
    
  } catch (error) {
    console.error("Save failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetAccounts(payload, sendResponse) {
  try {
    // Return ALL accounts regardless of domain for Consistency
    const data = await chrome.storage.local.get(["globalAccounts", "activeSessions"]);
    const accounts = data.globalAccounts || [];
    const activeSessions = data.activeSessions || {};

    console.log("Accounts retrieved:", accounts); // ADDED
    sendResponse({ 
      success: true, 
      accounts: accounts.map(({ cookies, ...rest }) => rest),
      activeSessions: activeSessions // Send all active sessions to popup
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleRemoveAccount(payload, sendResponse) {
  const { accountId } = payload;
  try {
    const data = await chrome.storage.local.get(["globalAccounts", "activeSessions"]);
    let accounts = data.globalAccounts || [];
    
    accounts = accounts.filter(acc => acc.id !== accountId);
    
    // Also clean up activeSessions if this account was active
    const activeSessions = data.activeSessions || {};
    for (const [domain, id] of Object.entries(activeSessions)) {
      if (id === accountId) {
        delete activeSessions[domain];
      }
    }

    await chrome.storage.local.set({ globalAccounts: accounts, activeSessions });
    sendResponse({ success: true });
  } catch (error) {
    console.error("Remove failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Switch session using the domain associated with the saved account.
 */
async function handleSwitchSession(payload, sendResponse) {
  const { accountId } = payload;

  try {
    const data = await chrome.storage.local.get("globalAccounts");
    const accounts = data.globalAccounts || [];
    const targetAccount = accounts.find(acc => acc.id === accountId);

    if (!targetAccount) {
      throw new Error("Account not found");
    }

    const domain = targetAccount.domain;

    // 1. Inject SAVED cookies (Merging) using the hardened helper
    await injectCookies(targetAccount.cookies, domain);

    // 2. Propagation Delay: Wait for cookies to "settle" in the browser state
    await new Promise(resolve => setTimeout(resolve, 800));


    // 4. Reload active tabs for that domain and open a new window
    const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
    tabs.forEach(tab => chrome.tabs.reload(tab.id));

    // For Google domains, force the correct account using authuser index or Email hint
    // And redirect specifically to www.google.com/webhp as requested by user
    let targetUrl = `https://www.${domain}`;
    if (domain === 'google.com') {
      if (targetAccount.authuser !== null && targetAccount.authuser !== undefined) {
        targetUrl = `https://www.google.com/webhp?authuser=${targetAccount.authuser}`;
      } else if (targetAccount.email) {
        targetUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(targetAccount.email)}&continue=${encodeURIComponent('https://www.google.com/webhp')}`;
      } else {
        targetUrl = `https://www.google.com/webhp`;
      }
    }

    chrome.windows.create({
      url: targetUrl,
      focused: true
    });

    // 5. Update active state
    // Re-fetch in case it changed
    const finalStorage = await chrome.storage.local.get("activeSessions");
    const finalActiveSessions = finalStorage.activeSessions || {};
    finalActiveSessions[domain] = accountId;
    await chrome.storage.local.set({ activeSessions: finalActiveSessions });

    sendResponse({ success: true });

  } catch (error) {
    console.error("Switch failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// PROFILE WORKSPACE SYSTEM
// ============================================================================

/**
 * Generate a unique ID for profiles
 */
function generateProfileId() {
  return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get all profiles from storage
 */
async function getProfiles() {
  const data = await chrome.storage.local.get(['profiles']);
  return data.profiles || [];
}

/**
 * Save profiles to storage
 */
async function saveProfiles(profiles) {
  await chrome.storage.local.set({ profiles });
}

/**
 * Create a new profile with current tabs
 */
async function handleCreateProfile(payload, sendResponse) {
  try {
    const { name, accountId, tabs } = payload;
    
    if (!name || !accountId) {
      throw new Error('Profile name and account ID are required');
    }

    const profiles = await getProfiles();
    
    // Check if profile name already exists
    if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('A profile with this name already exists');
    }

    const profile = {
      id: generateProfileId(),
      name: name,
      accountId: accountId,
      tabs: tabs || [],
      createdAt: Date.now(),
      lastOpened: null,
      windowId: null,
      isHibernated: true
    };

    profiles.push(profile);
    await saveProfiles(profiles);

    console.log('Profile created:', profile);
    sendResponse({ success: true, profile });
  } catch (error) {
    console.error('Create profile failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Get all profiles
 */
async function handleGetProfiles(payload, sendResponse) {
  try {
    const profiles = await getProfiles();
    sendResponse({ success: true, profiles });
  } catch (error) {
    console.error('Get profiles failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Open a profile in a new window
 */
async function handleOpenProfile(payload, sendResponse) {
  try {
    const { profileId } = payload;
    const profiles = await getProfiles();
    const profile = profiles.find(p => p.id === profileId);

    if (!profile) {
      throw new Error('Profile not found');
    }

    // Check if profile window is already open
    if (profile.windowId) {
      try {
        const existingWindow = await chrome.windows.get(profile.windowId);
        if (existingWindow) {
          // Focus existing window
          await chrome.windows.update(profile.windowId, { focused: true });
          sendResponse({ success: true, windowId: profile.windowId, reused: true });
          return;
        }
      } catch (e) {
        // Window doesn't exist anymore, clear it
        profile.windowId = null;
      }
    }

    // Get account data for session restoration
    const data = await chrome.storage.local.get(['globalAccounts']);
    const accounts = data.globalAccounts || [];
    const account = accounts.find(acc => acc.id === profile.accountId);

    // Create new window with profile tabs
    const tabUrls = profile.tabs.map(tab => tab.url);
    const newWindow = await chrome.windows.create({
      url: tabUrls.length > 0 ? tabUrls : ['chrome://newtab'],
      focused: true
    });

    // Update profile with window ID and last opened time
    profile.windowId = newWindow.id;
    profile.lastOpened = Date.now();
    profile.isHibernated = false;
    await saveProfiles(profiles);

    // Restore account session if available
    if (account && account.cookies) {
      await injectCookies(account.cookies, account.domain);
    }

    console.log('Profile opened:', profile.name, 'Window ID:', newWindow.id);
    sendResponse({ success: true, windowId: newWindow.id });
  } catch (error) {
    console.error('Open profile failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Save current window tabs to a profile
 */
async function handleSaveTabsToProfile(payload, sendResponse) {
  try {
    const { profileId, windowId } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    // Get all tabs from the window
    const tabs = await chrome.tabs.query({ windowId: windowId });
    
    // Save tab data (URL, title, favicon)
    const tabData = tabs
      .filter(tab => tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
      .map(tab => ({
        url: tab.url,
        title: tab.title || 'Untitled',
        favIconUrl: tab.favIconUrl || null
      }));

    profiles[profileIndex].tabs = tabData;
    await saveProfiles(profiles);

    console.log('Tabs saved to profile:', profile.name, 'Tab count:', tabData.length);
    sendResponse({ success: true, tabs: tabData });
  } catch (error) {
    console.error('Save tabs failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Add a tab to a profile
 */
async function handleAddTabToProfile(payload, sendResponse) {
  try {
    const { profileId, url, title, favIconUrl } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    // Check if tab already exists
    if (profiles[profileIndex].tabs.some(tab => tab.url === url)) {
      throw new Error('Tab already exists in this profile');
    }

    profiles[profileIndex].tabs.push({
      url: url,
      title: title || 'Untitled',
      favIconUrl: favIconUrl || null
    });

    await saveProfiles(profiles);

    console.log('Tab added to profile:', profiles[profileIndex].name);
    sendResponse({ success: true, tabs: profiles[profileIndex].tabs });
  } catch (error) {
    console.error('Add tab failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Remove a tab from a profile
 */
async function handleRemoveTabFromProfile(payload, sendResponse) {
  try {
    const { profileId, tabIndex } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    if (tabIndex < 0 || tabIndex >= profiles[profileIndex].tabs.length) {
      throw new Error('Invalid tab index');
    }

    profiles[profileIndex].tabs.splice(tabIndex, 1);
    await saveProfiles(profiles);

    console.log('Tab removed from profile:', profiles[profileIndex].name);
    sendResponse({ success: true, tabs: profiles[profileIndex].tabs });
  } catch (error) {
    console.error('Remove tab failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Delete a profile
 */
async function handleDeleteProfile(payload, sendResponse) {
  try {
    const { profileId } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    const profile = profiles[profileIndex];

    // Close the profile window if it's open
    if (profile.windowId) {
      try {
        await chrome.windows.remove(profile.windowId);
      } catch (e) {
        // Window might already be closed
        console.log('Window already closed or not found');
      }
    }

    profiles.splice(profileIndex, 1);
    await saveProfiles(profiles);

    console.log('Profile deleted:', profile.name);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Delete profile failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Rename a profile
 */
async function handleRenameProfile(payload, sendResponse) {
  try {
    const { profileId, newName } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    // Check if name already exists
    if (profiles.some((p, idx) => idx !== profileIndex && p.name.toLowerCase() === newName.toLowerCase())) {
      throw new Error('A profile with this name already exists');
    }

    profiles[profileIndex].name = newName;
    await saveProfiles(profiles);

    console.log('Profile renamed:', newName);
    sendResponse({ success: true, profile: profiles[profileIndex] });
  } catch (error) {
    console.error('Rename profile failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Hibernate a profile (close window, save state)
 */
async function handleHibernateProfile(payload, sendResponse) {
  try {
    const { profileId } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    const profile = profiles[profileIndex];

    if (profile.windowId) {
      try {
        // Save tabs before closing
        const tabs = await chrome.tabs.query({ windowId: profile.windowId });
        const tabData = tabs
          .filter(tab => tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
          .map(tab => ({
            url: tab.url,
            title: tab.title || 'Untitled',
            favIconUrl: tab.favIconUrl || null
          }));

        profiles[profileIndex].tabs = tabData;
        
        // Close the window
        await chrome.windows.remove(profile.windowId);
        profiles[profileIndex].windowId = null;
        profiles[profileIndex].isHibernated = true;
        profiles[profileIndex].lastOpened = Date.now();

        await saveProfiles(profiles);

        console.log('Profile hibernated:', profile.name);
        sendResponse({ success: true });
      } catch (e) {
        // Window might already be closed
        profiles[profileIndex].windowId = null;
        profiles[profileIndex].isHibernated = true;
        await saveProfiles(profiles);
        sendResponse({ success: true });
      }
    } else {
      sendResponse({ success: true, message: 'Profile already hibernated' });
    }
  } catch (error) {
    console.error('Hibernate profile failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Update profile account association
 */
async function handleUpdateProfileAccount(payload, sendResponse) {
  try {
    const { profileId, accountId } = payload;
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.id === profileId);

    if (profileIndex === -1) {
      throw new Error('Profile not found');
    }

    profiles[profileIndex].accountId = accountId;
    await saveProfiles(profiles);

    console.log('Profile account updated:', profiles[profileIndex].name);
    sendResponse({ success: true, profile: profiles[profileIndex] });
  } catch (error) {
    console.error('Update profile account failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Listen for window close events to auto-hibernate profiles
chrome.windows.onRemoved.addListener(async (windowId) => {
  try {
    const profiles = await getProfiles();
    const profileIndex = profiles.findIndex(p => p.windowId === windowId);

    if (profileIndex !== -1) {
      profiles[profileIndex].windowId = null;
      profiles[profileIndex].isHibernated = true;
      profiles[profileIndex].lastOpened = Date.now();
      await saveProfiles(profiles);
      console.log('Profile auto-hibernated:', profiles[profileIndex].name);
    }
  } catch (error) {
    console.error('Auto-hibernate failed:', error);
  }
});

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command.startsWith('open-profile-')) {
    const profileIndex = parseInt(command.replace('open-profile-', '')) - 1;
    const profiles = await getProfiles();
    
    if (profileIndex >= 0 && profileIndex < profiles.length) {
      const profile = profiles[profileIndex];
      await handleOpenProfile({ profileId: profile.id }, (response) => {
        if (response.success) {
          console.log('Profile opened via shortcut:', profile.name);
        }
      });
    }
  }
});

// Add profile-related message handlers to existing listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Existing handlers...
  if (request.action === "SAVE_SESSION") {
    handleSaveSession(request.payload, sendResponse);
    return true;
  }
  
  if (request.action === "SWITCH_SESSION") {
    handleSwitchSession(request.payload, sendResponse);
    return true;
  }

  if (request.action === "GET_ACCOUNTS") {
    handleGetAccounts(request.payload, sendResponse);
    return true;
  }

  if (request.action === "REMOVE_ACCOUNT") {
    handleRemoveAccount(request.payload, sendResponse);
    return true;
  }

  if (request.action === "GET_CURRENT_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const domain = getDomainFromUrl(tabs[0].url);
        sendResponse({ tab: tabs[0], domain: domain, title: tabs[0].title });
      } else {
        sendResponse({ error: "No active tab" });
      }
    });
    return true;
  }

  if (request.action === "CLEAR_DOMAIN_COOKIES") {
    handleClearCookies(request.payload.domain, sendResponse);
    return true;
  }

  // Profile-related handlers
  if (request.action === "CREATE_PROFILE") {
    handleCreateProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "GET_PROFILES") {
    handleGetProfiles(request.payload, sendResponse);
    return true;
  }

  if (request.action === "OPEN_PROFILE") {
    handleOpenProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "SAVE_TABS_TO_PROFILE") {
    handleSaveTabsToProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "ADD_TAB_TO_PROFILE") {
    handleAddTabToProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "REMOVE_TAB_FROM_PROFILE") {
    handleRemoveTabFromProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "DELETE_PROFILE") {
    handleDeleteProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "RENAME_PROFILE") {
    handleRenameProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "HIBERNATE_PROFILE") {
    handleHibernateProfile(request.payload, sendResponse);
    return true;
  }

  if (request.action === "UPDATE_PROFILE_ACCOUNT") {
    handleUpdateProfileAccount(request.payload, sendResponse);
    return true;
  }
});