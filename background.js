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
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch (e) {
    return 'google.com'; // Fallback
  }
}

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
  const { name, domain, avatar, email } = payload;
  
  try {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    const accountId = crypto.randomUUID();
    const accountData = {
      id: accountId,
      name: name,
      domain: domain,
      avatar: avatar || null,
      email: email || null,
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

    // 1. Clear CURRENT cookies for THAT domain
    const currentCookies = await chrome.cookies.getAll({ domain: domain });
    const removalPromises = currentCookies.map(c => {
      const protocol = c.secure ? "https:" : "http:";
      const cleanDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
      const url = `${protocol}//${cleanDomain}${c.path}`;
      return chrome.cookies.remove({ url, name: c.name, storeId: c.storeId });
    });
    await Promise.all(removalPromises);

    // 2. Inject SAVED cookies
    const injectionPromises = targetAccount.cookies.map(c => {
      const protocol = c.secure ? "https:" : "http:";
      const cleanDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
      const url = `${protocol}//${cleanDomain}${c.path}`;

      const newCookie = {
        url: url,
        name: c.name,
        value: c.value,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
        storeId: c.storeId
      };

      if (!c.hostOnly) {
        newCookie.domain = c.domain;
      }

      return chrome.cookies.set(newCookie).catch(err => console.warn(`Failed to set cookie ${c.name}:`, err));
    });

    await Promise.all(injectionPromises);

    // 3. Reload active tabs for that domain and open a new window
    const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
    tabs.forEach(tab => chrome.tabs.reload(tab.id));

    chrome.windows.create({
      url: `https://www.${domain}`,
      focused: true
    });

    // 4. Update active state
    const storage = await chrome.storage.local.get("activeSessions");
    const activeSessions = storage.activeSessions || {};
    activeSessions[domain] = accountId;
    await chrome.storage.local.set({ activeSessions });

    sendResponse({ success: true });

  } catch (error) {
    console.error("Switch failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}