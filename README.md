# TickTrack – Chrome Extension for Jira Time Logging

TickTrack is a lightweight Chrome extension that lets you log time to Jira effortlessly — without switching tabs or navigating complex menus.

🔗 Try the extension: [Chrome Web Store link goes here]

---

## 🚀 Features

- 🕒 Quickly log work time to Jira issues
- 📡 Offline mode – syncs time logs once you reconnect
- 🔐 Secure Jira OAuth2 login via Chrome Identity API
- 🧠 Save and reuse recent work descriptions as presets
- ⚙️ Works with custom Jira instances via a secure backend

---

## 🧰 Tech Stack

- HTML + CSS + JavaScript (React)
- Chrome Extensions API (Manifest v3)
- Chrome Identity API for OAuth2 login
- Jira REST API for time tracking

---

## 🔒 Security and Privacy

- No personal data is stored or shared
- Access tokens are stored via `chrome.storage.sync` (encrypted and managed by Chrome)
- Offline logs are stored temporarily in local storage
- All authentication is handled securely using Atlassian OAuth2 standards via a backend proxy

📄 [Privacy Policy](link-to-privacy-policy.md or your Notion/GitHub page)

---

## 📦 Installation (Developer Mode)

> For testers or developers

1. Clone this repo or download the [latest release `.zip`](#)
2. Visit `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the extension's `build` or `dist` folder

---

## 🛠 Development (Optional)

> Only if you want to modify or build the extension from source

```bash
# Install dependencies
npm install

# Build the extension
npm run build
```
Have questions or feedback?
Reach out to the developer: **merihcibis@gmail.com**