# Persona - Multi-Account Switcher

**Persona** is a browser extension that allows you to save and switch between multiple user accounts on websites (like Google, YouTube, etc.) with a single click. It is primarily built for the Brave browser, as it lacks the direct profile switching feature found in Chrome, but it works on Chrome as well.

It works by capturing the current session cookies and storing them locally. When you switch accounts, it clears the current browser cookies and injects the saved session cookies, effectively logging you into the selected account instantly.

## 🚀 Features

- **Multi-Account Management**: Save multiple profiles for the same website (e.g., "Personal", "Work", "Dev").
- **One-Click Switching**: Swap between accounts instantly without entering passwords again.
- **Auto-Detection**: Automatically detects user details (Name, Email, Avatar) from the current page to label accounts easily.
- **Add Account Flow**: Integrated button to open Google's "Add Session" page to easily sign in to new accounts.
- **Privacy Focused**: All data (cookies and tokens) is stored locally on your machine via `chrome.storage.local`. Nothing is sent to external servers.
- **Material Design**: Clean, user-friendly interface inspired by Google's design system.

## 🛠️ Installation

Since this is a developer extension, you need to load it manually:

1.  Download or clone this repository to a folder on your computer.
2.  Open your browser and navigate to the extensions page:
    *   **Chrome**: Enter `chrome://extensions/` in the address bar.
    *   **Brave**: Enter `brave://extensions/` in the address bar.
3.  Toggle **Developer mode** in the top-right corner.
4.  Click the **Load unpacked** button in the top-left.
5.  Select the folder where you saved the extension files.
6.  The extension icon should appear in your toolbar.
7.  Pin the extension icon so you can use it.

## 📖 How to Use

### 1. Saving an Account
1.  Log in to a website (e.g., Gmail).
2.  Click the **Persona** extension icon.
3.  The extension will attempt to auto-detect your profile.
4.  If it's your first time, it might auto-save. Otherwise, click **"Add another account"** -> **"Save Account"** to save the current session.

### 2. Adding a New Account
1.  Open the extension.
2.  Click **"Add another account"**.
3.  Click **"Open Google Sign In"** at the bottom.
4.  Sign in with your new credentials in the new tab.
5.  Open the extension again; it will detect the new account and allow you to save it.

### 3. Switching Accounts
1.  Open the extension.
2.  Click on any account in the list.
3.  The page will reload, and you will be logged in as that user.

## 🔒 Permissions Explained


This extension requires specific permissions to function:

- **`cookies`**: Essential for reading the current session to save it and injecting saved cookies to switch accounts.
- **`storage`**: Used to save your account lists and active session IDs locally.
- **`tabs` & `activeTab`**: Required to detect the current website domain and reload the page after switching accounts.
- **`scripting`**: Used to safely inject a script into the page to scrape the user's name and avatar for the UI.
- **`<all_urls>`**: **HIGH RISK** - Narrow to specific domains (see doc/refactored/manifest.json).

## 📂 Project Structure

- **`manifest.json`**: Configuration file defining permissions and entry points.
- **`background.js`**: Service worker that handles the heavy lifting—saving cookies, clearing cookies, and swapping sessions.
- **`popup.html` / `popup.js` / `popup.css`**: The user interface.
- **`content.js`**: Script that runs on the web page to extract profile info (Avatar, Name, Email).



## ⚠️ Disclaimer

This tool is for educational and productivity purposes. Since it manipulates session cookies:
1.  **Security**: Treat the computer where you save these sessions securely. Anyone with access to your browser can switch to your saved accounts.
2.  **Session Expiry**: If a website invalidates your session (e.g., you change your password or the cookie expires), you will need to log in again and update the saved account in Persona.

---


