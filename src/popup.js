let currentDomain = null;
let detectedAvatar = null;
let detectedEmail = null;
let detectedAuthuser = null;
let activeAuthuser = null;
let currentProfileId = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Popup loaded, detecting current tab...");
  
  const tabDetectionTimeout = setTimeout(() => {
    showDetectionError("Tab detection timed out. Please try refreshing the page.");
  }, 3000);

  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_CURRENT_TAB" });
    clearTimeout(tabDetectionTimeout);
    
    if (!response || response.error) {
      showDetectionError(response?.error || "Could not detect current tab.");
      return;
    }

    currentDomain = response.domain;
    const isInternal = !response.tab.url || response.tab.url.startsWith('chrome') || response.tab.url.startsWith('about:');
    
    document.getElementById('current-domain').textContent = isInternal ? "Global Account Manager" : `Site: ${currentDomain}`;

    // Initial render
    await renderAccounts();

    // Auto-Capture: Only if on a real website
    if (!isInternal) {
      await autoCaptureProfile();
    }

    // Bind UI events
    document.getElementById('btn-add-view')?.addEventListener('click', openAddView);
    document.getElementById('btn-cancel')?.addEventListener('click', showMainView);
    document.getElementById('btn-save')?.addEventListener('click', saveAccount);
    document.getElementById('btn-signout')?.addEventListener('click', signOutAll);
    document.getElementById('btn-manage')?.addEventListener('click', () => {
      const url = activeAuthuser !== null ? `https://myaccount.google.com/u/${activeAuthuser}/` : 'https://myaccount.google.com/u/';
      chrome.tabs.create({ url });
    });
    document.getElementById('btn-google-add')?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://accounts.google.com/AddSession' });
    });
    document.getElementById('btn-close')?.addEventListener('click', () => window.close());
    
    // Add Esc key listener to close popup
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.close();
    });

    // Check for creation mode from palette/fallback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'create') {
      setTimeout(openCreateProfileView, 100);
    }
    
  } catch (error) {
    clearTimeout(tabDetectionTimeout);
    console.error("Tab detection failed:", error);
    showDetectionError("Could not connect to extension background.");
  }
});

function showDetectionError(msg) {
  const container = document.querySelector('.app-container');
  if (container) {
    container.textContent = ''; // Safe clear
    const errorDiv = document.createElement('div');
    errorDiv.style.padding = '60px 20px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.display = 'flex';
    errorDiv.style.flexDirection = 'column';
    errorDiv.style.gap = '20px';
    errorDiv.style.alignItems = 'center';

    const icon = document.createElement('div');
    icon.style.fontSize = '48px';
    icon.textContent = '🌐';
    
    const text = document.createElement('div');
    text.style.color = 'var(--text-secondary)';
    text.style.lineHeight = '1.6';
    text.textContent = msg;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn outline';
    retryBtn.style.width = 'auto';
    retryBtn.textContent = 'Retry';
    retryBtn.onclick = () => window.location.reload();

    errorDiv.appendChild(icon);
    errorDiv.appendChild(text);
    errorDiv.appendChild(retryBtn);
    container.appendChild(errorDiv);
  }
}


async function renderAccounts() {
  const listEl = document.getElementById('account-list');
  if (!listEl) return;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_ACCOUNTS" });

    if (!response || !response.success) {
      console.error("Failed to fetch accounts:", response?.error);
      return;
    }

    const { accounts, activeSessions } = response;
    const activeId = activeSessions[currentDomain] || null;

    // Find active account for the current domain
    let activeAccount = accounts.find(acc => acc.id === activeId);
    
    if (activeAccount) {
      activeAuthuser = activeAccount.authuser;
      document.getElementById('active-email').textContent = activeAccount.email || 'Signed in';
      document.getElementById('active-name').textContent = `Hi, ${activeAccount.name}!`;
      document.getElementById('active-avatar').src = activeAccount.avatar || 'assets/persona.png';
    } else {
      activeAuthuser = null; // Reset if no active session for this domain
      if (accounts.length > 0) {
        // Fallback: Show the most recent global account as "Available" if none active for this domain
        const recent = accounts[0];
        document.getElementById('active-name').textContent = "Not Active on this Site";
        document.getElementById('active-email').textContent = `Recently used: ${recent.email || recent.name}`;
        document.getElementById('active-avatar').src = recent.avatar || 'assets/persona.png';
      } else {
        document.getElementById('active-name').textContent = "No Accounts Saved";
        document.getElementById('active-email').textContent = "Sign in to a website to begin";
        document.getElementById('active-avatar').src = 'assets/persona.png';
      }
    }

    // List ALL global accounts consistently
    const otherAccounts = accounts.filter(acc => acc.id !== activeId);
    listEl.textContent = ''; // Safe clear

    if (otherAccounts.length === 0 && !activeAccount) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '24px';
      emptyMsg.style.fontSize = '13px';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.textContent = 'Your global account list is empty.';
      listEl.appendChild(emptyMsg);
    } else {
      otherAccounts.forEach(acc => {
        const el = document.createElement('div');
        el.className = 'account-item';
        
        const avatarSrc = acc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(acc.name)}&background=random&size=64`;

        const img = document.createElement('img');
        img.src = avatarSrc;
        img.className = 'avatar-small';
        img.alt = '';

        const info = document.createElement('div');
        info.className = 'item-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'item-name';
        nameDiv.textContent = acc.name;

        const emailDiv = document.createElement('div');
        emailDiv.className = 'item-email';
        emailDiv.textContent = acc.email || acc.domain;

        info.appendChild(nameDiv);
        info.appendChild(emailDiv);

        const domainDiv = document.createElement('div');
        domainDiv.style.fontSize = '10px';
        domainDiv.style.color = 'var(--text-secondary)';
        domainDiv.style.marginLeft = 'auto';
        domainDiv.textContent = acc.domain;

        el.appendChild(img);
        el.appendChild(info);
        el.appendChild(domainDiv);

        el.addEventListener('click', () => switchAccount(acc.id));
        listEl.appendChild(el);
      });
    }

  } catch (err) {
    console.error("Error rendering accounts:", err);
  }
}

async function autoCaptureProfile() {
  try {
    const tabResp = await chrome.runtime.sendMessage({ action: "GET_CURRENT_TAB" });
    if (tabResp && tabResp.tab && tabResp.tab.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tabResp.tab.id },
        files: ['content.js']
      }).catch(e => console.log("Scripting failed", e));

      const data = await chrome.tabs.sendMessage(tabResp.tab.id, { action: "EXTRACT_PROFILE_DATA" }).catch(e => null);
      
      // Only auto-capture if we have an email (unique ID) and it's not already saved
      if (data && data.email) {
        const accResp = await chrome.runtime.sendMessage({ action: "GET_ACCOUNTS" });
        const existing = accResp.accounts?.find(acc => acc.email === data.email);

        if (!existing) {
          console.log("Auto-captured new profile:", data);
          await chrome.runtime.sendMessage({
            action: "SAVE_SESSION",
            payload: { 
              name: data.name || "New Account", 
              domain: currentDomain, 
              avatar: data.avatar, 
              email: data.email,
              authuser: data.authuser
            }
          });
          await renderAccounts();
        }
      }
    }
  } catch (e) {
    console.log("Auto-capture failed", e);
  }
}

async function openAddView() {
  toggleMainHeader(false);
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('add-view').classList.remove('hidden');

  try {
    const tabResp = await chrome.runtime.sendMessage({ action: "GET_CURRENT_TAB" });
    if (tabResp && tabResp.tab && tabResp.tab.id) {
      const data = await chrome.tabs.sendMessage(tabResp.tab.id, { action: "EXTRACT_PROFILE_DATA" }).catch(e => null);
      if (data) {
        detectedAvatar = data.avatar;
        detectedEmail = data.email;
        detectedAuthuser = data.authuser;
        if (data.name) document.getElementById('input-name').value = data.name;
        if (detectedAvatar || detectedEmail) {
          const previewInfo = document.getElementById('preview-info');
          previewInfo.textContent = ''; // Safe clear
          
          const previewContainer = document.createElement('div');
          previewContainer.style.display = 'flex';
          previewContainer.style.flexDirection = 'column';
          previewContainer.style.alignItems = 'center';
          previewContainer.style.gap = '12px';
          previewContainer.style.marginTop = '16px';

          if (detectedAvatar) {
            const img = document.createElement('img');
            img.src = detectedAvatar;
            img.style.width = '64px';
            img.style.height = '64px';
            img.style.borderRadius = '50%';
            img.style.border = '2px solid var(--google-blue)';
            previewContainer.appendChild(img);
          }

          if (detectedEmail) {
            const emailDiv = document.createElement('div');
            emailDiv.style.fontSize = '13px';
            emailDiv.style.color = 'var(--text-secondary)';
            emailDiv.style.fontWeight = '500';
            emailDiv.textContent = detectedEmail;
            previewContainer.appendChild(emailDiv);
          }

          previewInfo.appendChild(previewContainer);
        }

      }
    }
  } catch (e) {
    console.log("Profile extraction failed", e);
  }
}

function showMainView() {
  toggleMainHeader(true);
  document.getElementById('add-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  document.getElementById('input-name').value = '';
  document.getElementById('preview-info').textContent = '';
}

async function saveAccount() {
  const name = document.getElementById('input-name').value || "Untitled";
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await chrome.runtime.sendMessage({
      action: "SAVE_SESSION",
      payload: { 
        name, 
        domain: currentDomain, 
        avatar: detectedAvatar, 
        email: detectedEmail,
        authuser: detectedAuthuser 
      }
    });
    showMainView();
    await renderAccounts();
  } catch (err) {
    console.error("Save error:", err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Account';
  }
}

async function switchAccount(id) {
  document.body.style.opacity = '0.6';
  document.body.style.pointerEvents = 'none';
  
  try {
    await chrome.runtime.sendMessage({
      action: "SWITCH_SESSION",
      payload: { accountId: id }
    });
    window.close();
  } catch (err) {
    console.error("Switch error:", err);
    document.body.style.opacity = '1';
    document.body.style.pointerEvents = 'auto';
  }
}

async function signOutAll() {
  if (!confirm("Remove all saved accounts from the extension? (You will remain logged in on websites)")) return;
  
  await chrome.storage.local.clear();
  window.close();
}

// ============================================================================
// PROFILE WORKSPACE SYSTEM
// ============================================================================

/**
 * Render all profiles in the popup
 */
async function renderProfiles() {
  const listEl = document.getElementById('profile-list');
  if (!listEl) return;

  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_PROFILES" });

    if (!response || !response.success) {
      console.error("Failed to fetch profiles:", response?.error);
      return;
    }

    const profiles = response.profiles;
    listEl.textContent = '';

    if (profiles.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-state';
      emptyMsg.textContent = 'No workspaces yet. Create one to get started!';
      listEl.appendChild(emptyMsg);
      return;
    }

    profiles.forEach((profile, index) => {
      const el = document.createElement('div');
      el.className = 'profile-item';

      const icon = document.createElement('div');
      icon.className = `profile-icon ${profile.isHibernated ? 'hibernated' : 'active'}`;
      icon.textContent = profile.name.charAt(0).toUpperCase();

      const info = document.createElement('div');
      info.className = 'profile-info';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'profile-name';
      nameDiv.textContent = profile.name;

      const metaDiv = document.createElement('div');
      metaDiv.className = 'profile-meta';
      metaDiv.textContent = `${profile.tabs.length} tab${profile.tabs.length !== 1 ? 's' : ''}`;

      info.appendChild(nameDiv);
      info.appendChild(metaDiv);

      const statusBadge = document.createElement('div');
      statusBadge.className = `profile-status-badge ${profile.isHibernated ? 'hibernated' : 'active'}`;
      statusBadge.textContent = profile.isHibernated ? 'Hibernated' : 'Active';

      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      controls.style.marginLeft = 'auto';

      const defaultBtn = document.createElement('button');
      defaultBtn.className = `profile-action-btn ${profile.isDefault ? 'is-default' : ''}`;
      defaultBtn.innerHTML = profile.isDefault ? '★' : '☆';
      defaultBtn.title = profile.isDefault ? 'Default Workspace' : 'Set as Default';
      defaultBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDefaultProfile(profile.id);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'profile-delete-btn';
      deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>';
      deleteBtn.title = 'Delete workspace';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        quickDeleteProfile(profile.id, profile.name);
      });

      el.appendChild(icon);
      el.appendChild(info);
      el.appendChild(statusBadge);
      el.appendChild(controls);
      controls.appendChild(defaultBtn);
      controls.appendChild(deleteBtn);

      el.addEventListener('click', () => openProfileDetails(profile.id));
      listEl.appendChild(el);
    });

    // Add keyboard shortcut hint
    if (profiles.length > 0) {
      const shortcutHint = document.createElement('div');
      shortcutHint.className = 'shortcut-hint';
      shortcutHint.innerHTML = `Tip: Default: <kbd>Alt+Shift+1</kbd> | Switcher: <kbd>Alt+Shift+D</kbd> | Palette: <kbd>Alt+Shift+S</kbd> | Hibernate: <kbd>Alt+C</kbd>`;
      listEl.appendChild(shortcutHint);
    }

  } catch (err) {
    console.error("Error rendering profiles:", err);
  }
}

/**
 * Open create profile view
 */
async function openCreateProfileView() {
  toggleMainHeader(false);
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('create-profile-view').classList.remove('hidden');

  // Populate account dropdown
  const accountSelect = document.getElementById('profile-account');
  accountSelect.innerHTML = '<option value="">Select an account...</option>';

  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_ACCOUNTS" });
    if (response && response.success && response.accounts) {
      response.accounts.forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.id;
        option.textContent = `${acc.name} (${acc.email || acc.domain})`;
        accountSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Failed to load accounts:", err);
  }
}

/**
 * Close create profile view
 */
function closeCreateProfileView() {
  toggleMainHeader(true);
  document.getElementById('create-profile-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  document.getElementById('profile-name').value = '';
  document.getElementById('profile-account').value = '';
  document.getElementById('save-current-tabs').checked = true;
}

/**
 * Save new profile
 */
async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const accountId = document.getElementById('profile-account').value;
  const saveTabs = document.getElementById('save-current-tabs').checked;

  if (!name) {
    alert('Please enter a workspace name');
    return;
  }

  if (!accountId) {
    alert('Please select an account');
    return;
  }

  const btn = document.getElementById('btn-save-profile');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    let tabs = [];
    
    if (saveTabs) {
      // Get current window tabs
      const windows = await chrome.windows.getAll({ populate: true });
      if (windows.length > 0) {
        const currentWindow = windows[0];
        tabs = currentWindow.tabs
          .filter(tab => tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
          .map(tab => ({
            url: tab.url,
            title: tab.title || 'Untitled',
            favIconUrl: tab.favIconUrl || null
          }));
      }
    }

    const response = await chrome.runtime.sendMessage({
      action: "CREATE_PROFILE",
      payload: { name, accountId, tabs }
    });

    if (response && response.success) {
      closeCreateProfileView();
      await renderProfiles();
    } else {
      alert('Failed to create workspace: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Create profile error:", err);
    alert('Failed to create workspace');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Workspace';
  }
}

/**
 * Open profile details view
 */
async function openProfileDetails(profileId) {
  currentProfileId = profileId;
  toggleMainHeader(false);
  document.getElementById('main-view').classList.add('hidden');
  document.getElementById('profile-details-view').classList.remove('hidden');

  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_PROFILES" });
    if (!response || !response.success) return;

    const profile = response.profiles.find(p => p.id === profileId);
    if (!profile) return;

    // Update title
    document.getElementById('profile-details-title').textContent = profile.name;

    // Update status
    const statusEl = document.getElementById('profile-status');
    statusEl.textContent = profile.isHibernated ? 'Hibernated' : 'Active';

    // Update account info
    const accountInfoEl = document.getElementById('profile-account-info');
    const accountsResponse = await chrome.runtime.sendMessage({ action: "GET_ACCOUNTS" });
    if (accountsResponse && accountsResponse.success) {
      const account = accountsResponse.accounts.find(acc => acc.id === profile.accountId);
      accountInfoEl.textContent = account ? `Account: ${account.name} (${account.email || account.domain})` : 'Account: Unknown';
    }

    // Render tabs
    renderProfileTabs(profile.tabs);

  } catch (err) {
    console.error("Error opening profile details:", err);
  }
}

/**
 * Render profile tabs
 */
function renderProfileTabs(tabs) {
  const listEl = document.getElementById('profile-tabs-list');
  listEl.textContent = '';

  if (tabs.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = 'No tabs in this workspace';
    listEl.appendChild(emptyMsg);
    return;
  }

  tabs.forEach((tab, index) => {
    const el = document.createElement('div');
    el.className = 'profile-tab-item';

    if (tab.favIconUrl) {
      const favicon = document.createElement('img');
      favicon.src = tab.favIconUrl;
      favicon.className = 'tab-favicon';
      favicon.onerror = () => {
        favicon.style.display = 'none';
        const placeholder = document.createElement('div');
        placeholder.className = 'tab-favicon-placeholder';
        placeholder.textContent = '🌐';
        el.insertBefore(placeholder, el.firstChild);
      };
      el.appendChild(favicon);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'tab-favicon-placeholder';
      placeholder.textContent = '🌐';
      el.appendChild(placeholder);
    }

    const info = document.createElement('div');
    info.className = 'tab-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'tab-title';
    titleDiv.textContent = tab.title || 'Untitled';

    const urlDiv = document.createElement('div');
    urlDiv.className = 'tab-url';
    urlDiv.textContent = tab.url;

    info.appendChild(titleDiv);
    info.appendChild(urlDiv);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tab-remove-btn';
    removeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>';
    removeBtn.title = 'Remove tab';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTabFromProfile(index);
    });

    el.appendChild(info);
    el.appendChild(removeBtn);

    listEl.appendChild(el);
  });
}

/**
 * Close profile details view
 */
function closeProfileDetailsView() {
  toggleMainHeader(true);
  document.getElementById('profile-details-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  currentProfileId = null;
}

/**
 * Open profile in new window
 */
async function openProfile() {
  if (!currentProfileId) return;

  const btn = document.getElementById('btn-open-profile');
  btn.disabled = true;
  btn.textContent = 'Opening...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: "OPEN_PROFILE",
      payload: { profileId: currentProfileId }
    });

    if (response && response.success) {
      window.close();
    } else {
      alert('Failed to open workspace: ' + (response?.error || 'Unknown error'));
      btn.disabled = false;
      btn.textContent = 'Open Workspace';
    }
  } catch (err) {
    console.error("Open profile error:", err);
    alert('Failed to open workspace');
    btn.disabled = false;
    btn.textContent = 'Open Workspace';
  }
}

/**
 * Save current tabs to profile
 */
async function saveTabsToProfile() {
  if (!currentProfileId) return;

  const btn = document.getElementById('btn-save-tabs');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Get current window ID
    const windows = await chrome.windows.getAll({ populate: true });
    if (windows.length === 0) {
      throw new Error('No window found');
    }

    const currentWindow = windows[0];
    
    const response = await chrome.runtime.sendMessage({
      action: "SAVE_TABS_TO_PROFILE",
      payload: { profileId: currentProfileId, windowId: currentWindow.id }
    });

    if (response && response.success) {
      // Refresh profile details
      await openProfileDetails(currentProfileId);
    } else {
      alert('Failed to save tabs: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Save tabs error:", err);
    alert('Failed to save tabs');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Current Tabs';
  }
}

/**
 * Hibernate profile
 */
async function hibernateProfile() {
  if (!currentProfileId) return;

  const btn = document.getElementById('btn-hibernate-profile');
  btn.disabled = true;
  btn.textContent = 'Hibernating...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: "HIBERNATE_PROFILE",
      payload: { profileId: currentProfileId }
    });

    if (response && response.success) {
      await openProfileDetails(currentProfileId);
    } else {
      alert('Failed to hibernate workspace: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Hibernate profile error:", err);
    alert('Failed to hibernate workspace');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Hibernate';
  }
}

/**
 * Delete profile
 */
async function deleteProfile() {
  if (!currentProfileId) return;

  if (!confirm('Are you sure you want to delete this workspace? This action cannot be undone.')) {
    return;
  }

  const btn = document.getElementById('btn-delete-profile');
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "DELETE_PROFILE",
      payload: { profileId: currentProfileId }
    });

    if (response && response.success) {
      closeProfileDetailsView();
      await renderProfiles();
    } else {
      alert('Failed to delete workspace: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Delete profile error:", err);
    alert('Failed to delete workspace');
  } finally {
    btn.disabled = false;
  }
}

/**
 * Open add tab view
 */
function openAddTabView() {
  document.getElementById('profile-details-view').classList.add('hidden');
  document.getElementById('add-tab-view').classList.remove('hidden');
  document.getElementById('tab-url').value = '';
  document.getElementById('tab-title').value = '';
}

/**
 * Close add tab view
 */
function closeAddTabView() {
  document.getElementById('add-tab-view').classList.add('hidden');
  document.getElementById('profile-details-view').classList.remove('hidden');
}

function toggleMainHeader(show) {
  const header = document.querySelector('.app-header');
  if (header) {
    header.style.display = show ? 'flex' : 'none';
  }
}

/**
 * Save tab to profile
 */
async function saveTabToProfile() {
  if (!currentProfileId) return;

  const url = document.getElementById('tab-url').value.trim();
  const title = document.getElementById('tab-title').value.trim();

  if (!url) {
    alert('Please enter a URL');
    return;
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    alert('Please enter a valid URL');
    return;
  }

  const btn = document.getElementById('btn-save-tab');
  btn.disabled = true;
  btn.textContent = 'Adding...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: "ADD_TAB_TO_PROFILE",
      payload: { profileId: currentProfileId, url, title: title || 'Untitled' }
    });

    if (response && response.success) {
      closeAddTabView();
      await openProfileDetails(currentProfileId);
    } else {
      alert('Failed to add tab: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Add tab error:", err);
    alert('Failed to add tab');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Tab';
  }
}

/**
 * Remove tab from profile
 */
async function removeTabFromProfile(tabIndex) {
  if (!currentProfileId) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "REMOVE_TAB_FROM_PROFILE",
      payload: { profileId: currentProfileId, tabIndex }
    });

    if (response && response.success) {
      await openProfileDetails(currentProfileId);
    } else {
      alert('Failed to remove tab: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Remove tab error:", err);
    alert('Failed to remove tab');
  }
}

/**
 * Toggle default status for a profile
 */
async function toggleDefaultProfile(profileId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "TOGGLE_DEFAULT_PROFILE",
      payload: { profileId }
    });

    if (response && response.success) {
      await renderProfiles();
    } else {
      console.error("Failed to toggle default profile:", response?.error);
    }
  } catch (err) {
    console.error("Toggle default error:", err);
  }
}

/**
 * Quick delete profile from list (without opening details)
 */
async function quickDeleteProfile(profileId, profileName) {
  if (!confirm(`Delete workspace "${profileName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: "DELETE_PROFILE",
      payload: { profileId }
    });

    if (response && response.success) {
      await renderProfiles();
    } else {
      alert('Failed to delete workspace: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    console.error("Quick delete error:", err);
    alert('Failed to delete workspace');
  }
}

// Initialize profile event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Profile creation
  document.getElementById('btn-create-profile')?.addEventListener('click', openCreateProfileView);
  document.getElementById('btn-cancel-create-profile')?.addEventListener('click', closeCreateProfileView);
  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfile);

  // Profile details
  document.getElementById('btn-back-profile')?.addEventListener('click', closeProfileDetailsView);
  document.getElementById('btn-delete-profile')?.addEventListener('click', deleteProfile);
  document.getElementById('btn-open-profile')?.addEventListener('click', openProfile);
  document.getElementById('btn-save-tabs')?.addEventListener('click', saveTabsToProfile);
  document.getElementById('btn-hibernate-profile')?.addEventListener('click', hibernateProfile);

  // Add tab
  document.getElementById('btn-add-tab')?.addEventListener('click', openAddTabView);
  document.getElementById('btn-cancel-add-tab')?.addEventListener('click', closeAddTabView);
  document.getElementById('btn-save-tab')?.addEventListener('click', saveTabToProfile);

  // Render profiles on load
  renderProfiles();
});

