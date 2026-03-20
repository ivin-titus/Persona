let currentDomain = null;
let detectedAvatar = null;
let detectedEmail = null;

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
    container.innerHTML = `
      <div style="padding:60px 20px; text-align:center; display:flex; flex-direction:column; gap:20px; align-items:center">
        <div style="font-size:48px">🌐</div>
        <div style="color:var(--text-secondary); line-height:1.6">${msg}</div>
        <button onclick="window.location.reload()" class="btn outline" style="width:auto">Retry</button>
      </div>
    `;
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
    listEl.innerHTML = '';

    if (otherAccounts.length === 0 && !activeAccount) {
      listEl.innerHTML = '<div style="padding:24px; font-size:13px; color:var(--text-secondary); text-align:center">Your global account list is empty.</div>';
    } else {
      otherAccounts.forEach(acc => {
        const el = document.createElement('div');
        el.className = 'account-item';
        
        const avatarSrc = acc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(acc.name)}&background=random&size=32`;

        el.innerHTML = `
          <img src="${avatarSrc}" class="avatar-small" alt="">
          <div class="item-info">
            <div class="item-name">${escapeHtml(acc.name)}</div>
            <div class="item-email">${escapeHtml(acc.email || acc.domain)}</div>
          </div>
          <div style="font-size:10px; color:var(--text-secondary); margin-left:auto">${acc.domain}</div>
        `;

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
              email: data.email 
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
        if (data.name) document.getElementById('input-name').value = data.name;
        if (detectedAvatar || detectedEmail) {
          document.getElementById('preview-info').innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:16px">
              ${detectedAvatar ? `<img src="${detectedAvatar}" style="width:64px; height:64px; border-radius:50%; border:2px solid var(--google-blue)">` : ''}
              <div style="font-size:13px; color:var(--text-secondary); font-weight:500">${detectedEmail || ''}</div>
            </div>
          `;
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
  document.getElementById('preview-info').innerHTML = '';
}

async function saveAccount() {
  const name = document.getElementById('input-name').value || "Untitled";
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await chrome.runtime.sendMessage({
      action: "SAVE_SESSION",
      payload: { name, domain: currentDomain, avatar: detectedAvatar, email: detectedEmail }
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

function escapeHtml(text) {
  if (!text) return text;
  return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}