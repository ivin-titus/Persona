// switcher.js - Logic for Raycast-style Workspace Switcher

let allProfiles = [];
let filteredProfiles = [];
let selectedIndex = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('switcher-search');
  searchInput.focus();

  // Load profiles
  await loadProfiles();

  // Handle Input
  searchInput.addEventListener('input', (e) => {
    filterProfiles(e.target.value);
  });

  // Handle Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredProfiles.length;
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredProfiles.length) % filteredProfiles.length;
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProfiles[selectedIndex]) {
        openSelectedProfile(filteredProfiles[selectedIndex].id);
      }
    }
  });
});

async function loadProfiles() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "GET_PROFILES" });
    if (response && response.success) {
      allProfiles = response.profiles;
      filteredProfiles = [...allProfiles];
      renderList();
    }
  } catch (error) {
    console.error("Failed to load profiles:", error);
  }
}

function filterProfiles(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    filteredProfiles = [...allProfiles];
  } else {
    // Simple fuzzy match
    filteredProfiles = allProfiles.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.email && p.email.toLowerCase().includes(q))
    );
  }
  selectedIndex = 0;
  renderList();
}

function renderList() {
  const listEl = document.getElementById('switcher-list');
  listEl.innerHTML = '';

  if (filteredProfiles.length === 0) {
    listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No workspaces found</div>';
    return;
  }

  filteredProfiles.forEach((profile, index) => {
    const el = document.createElement('div');
    el.className = `switcher-item ${index === selectedIndex ? 'selected' : ''}`;
    
    // Auto-scroll selected item into view
    if (index === selectedIndex) {
      setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
    }

    const icon = document.createElement('div');
    icon.className = `profile-icon ${profile.isHibernated ? 'hibernated' : ''}`;
    icon.textContent = profile.name.charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'profile-info';

    const nameContainer = document.createElement('div');
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'profile-name';
    nameSpan.textContent = profile.name;
    nameContainer.appendChild(nameSpan);

    if (profile.isDefault) {
      const tag = document.createElement('span');
      tag.className = 'profile-tag tag-default';
      tag.textContent = 'Default';
      nameContainer.appendChild(tag);
    }

    if (!profile.isHibernated) {
      const tag = document.createElement('span');
      tag.className = 'profile-tag tag-active';
      tag.textContent = 'Active';
      nameContainer.appendChild(tag);
    }

    const meta = document.createElement('div');
    meta.className = 'profile-meta';
    meta.textContent = `${profile.tabs.length} tabs • Last used ${formatTime(profile.lastOpened)}`;

    info.appendChild(nameContainer);
    info.appendChild(meta);

    el.appendChild(icon);
    el.appendChild(info);

    el.addEventListener('click', () => openSelectedProfile(profile.id));
    listEl.appendChild(el);
  });
}

function formatTime(ts) {
  if (!ts) return 'Never';
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

async function openSelectedProfile(id) {
  try {
    await chrome.runtime.sendMessage({
      action: "OPEN_PROFILE",
      payload: { profileId: id }
    });
    window.close();
  } catch (error) {
    console.error("Failed to open profile:", error);
  }
}
