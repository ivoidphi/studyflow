# 📚 StudyFlow

A minimal, offline-first **Progressive Web App** for college students to manage tasks, notes, and deadlines. Works on iPhone (via Safari), Android, and desktop. Syncable between devices using a generated code.

---

## ✨ Features

- ✅ **Tasks & Notes** with title, URL link, checklist, deadline, priority, tags, and notes
- 🔗 **Clickable titles** — link to YouTube, Notion, Google Docs, etc.
- ✅ **Checklist subtasks** with progress bar
- ⏰ **Deadlines** with countdown (overdue / soon warnings)
- 🎯 **Priority levels** — High, Medium, Low
- 🏷️ **Custom tags** for organization
- 📴 **Offline-first** — everything works without internet
- 📲 **Installable on iPhone** via Safari Add to Home Screen
- 🔄 **Device sync** via generated code or QR

---

## 🚀 Quick Start (GitHub Pages)

### 1. Fork / Upload to GitHub

```bash
# Option A: Create a new repo and push
git init
git add .
git commit -m "Initial StudyFlow commit"
git remote add origin https://github.com/YOUR_USERNAME/studyflow.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** → **Pages**
3. Under "Source", select **Deploy from a branch**
4. Choose **main** branch, **/ (root)** folder
5. Click **Save**

Your app will be live at:
```
https://YOUR_USERNAME.github.io/studyflow/
```

> ⚠️ GitHub Pages requires HTTPS — which is needed for PWA/Service Worker to work. ✅

---

## 📱 Install on iPhone (Safari)

1. Open the GitHub Pages URL in **Safari** (not Chrome)
2. Tap the **Share** button (box with arrow up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add**

The app will appear as a standalone app icon — no browser chrome, no address bar.

---

## 🔄 Syncing Between Devices

StudyFlow sync works by exporting all tasks as a **base64-encoded code**. No server required.

### Export (PC → Phone)

1. Click the **⟳ Sync** button (top right)
2. Click **Generate Sync Code**
3. A QR code and text code will appear
4. Either:
   - **Scan the QR** with your phone's camera
   - Or **Copy Code** and paste it on your phone

### Import (Phone)

1. Open StudyFlow on your phone
2. Tap **⟳ Sync** → switch to **📥 Import** tab
3. Paste the sync code
4. Tap **Import Tasks**

> Tasks are **merged by ID** — existing tasks update if the incoming version is newer. New tasks are added. No tasks are deleted on import.

---

## 📁 File Structure

```
studyflow/
├── index.html      # Main app shell
├── style.css       # Dark minimal styles
├── app.js          # App logic (tasks, sync, filters)
├── sw.js           # Service worker (offline cache)
├── manifest.json   # PWA manifest
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## 🛠️ Local Development

No build tools required! Just serve the files:

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# Then open http://localhost:8080
```

> Service workers require HTTPS or `localhost`. Local dev works fine on `localhost`.

---

## 🧩 Task Data Schema

Tasks are stored in `localStorage` under the key `sf_tasks`:

```json
{
  "id": "abc123",
  "title": "Watch Lecture 5",
  "url": "https://youtube.com/...",
  "deadline": "2025-04-15T14:00:00.000Z",
  "priority": "high",
  "tags": ["math", "exam"],
  "checklist": [
    { "text": "Take notes", "done": false },
    { "text": "Summarize", "done": true }
  ],
  "notes": "Focus on chapter 3",
  "done": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## 🎨 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | Syne + JetBrains Mono (Google Fonts) |
| QR Code | [qrcodejs](https://github.com/davidshimjs/qrcodejs) |
| Storage | `localStorage` |
| PWA | Service Worker + Web App Manifest |
| Hosting | GitHub Pages |

---

## 🔒 Privacy

All data is stored **100% locally** in your browser. Nothing is sent to any server. Sync codes are self-contained — they contain your task data encoded as base64 and never leave your device unless you copy/share them yourself.

---

## 📝 License

MIT — free to use and modify.
