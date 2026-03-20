let currentDomain = null;
let detectedAvatar = null;
let detectedEmail = null;
let detectedAuthuser = null;

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
      chrome.tabs.create({ url: 'https://myaccount.google.com/' });
    });
    document.getElementById('btn-google-add')?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://accounts.google.com/AddSession' });
    });
    document.getElementById('btn-close')?.addEventListener('click', () => window.close());
    
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
      document.getElementById('active-email').textContent = activeAccount.email || 'Signed in';
      document.getElementById('active-name').textContent = `Hi, ${activeAccount.name}!`;
      document.getElementById('active-avatar').src = activeAccount.avatar || 'persona.png';
    } else if (accounts.length > 0) {
      // Fallback: Show the most recent global account as "Available" if none active for this domain
      const recent = accounts[0];
      document.getElementById('active-name').textContent = "Not Active on this Site";
      document.getElementById('active-email').textContent = `Recently used: ${recent.email || recent.name}`;
      document.getElementById('active-avatar').src = recent.avatar || 'persona.png';
    } else {
      document.getElementById('active-name').textContent = "No Accounts Saved";
      document.getElementById('active-email').textContent = "Sign in to a website to begin";
      document.getElementById('active-avatar').src = 'persona.png';
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
        
        const avatarSrc = acc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(acc.name)}&background=random&size=32`;

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

