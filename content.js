// content.js - Extracts user info from the page

(function() {
  // Heuristics to find user avatar and name
  // focused on Google/YouTube structure but extensible
  
  let avatarUrl = "";
  let userName = "";
  let userEmail = "";

  // 1. Try generic OpenGraph
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) avatarUrl = ogImage.content;

  // 2. Try Google specific header selector
  const googleAvatar = document.querySelector('header img, #gb img.gb_Ad, .gb_d[aria-label*="@"] img'); 
  if (googleAvatar && !avatarUrl) avatarUrl = googleAvatar.src;

  // 3. Try to find email (common in aria-labels or specific elements)
  const emailElem = document.querySelector('[aria-label*="@"], .user-email, #profile-email');
  if (emailElem) {
    const label = emailElem.getAttribute('aria-label') || emailElem.textContent;
    const match = label.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (match) userEmail = match[0];
  }

  // 4. Fallback to Title
  userName = document.title.split('-')[0].split('|')[0].trim();

  // Listen for request from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_PROFILE_DATA") {
      sendResponse({ avatar: avatarUrl, name: userName, email: userEmail });
    }
  });
})();