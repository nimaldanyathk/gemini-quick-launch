# AI Quick Launcher

A cross-platform desktop quick launcher for **Gemini, ChatGPT, and Claude** built with Electron.

## Features
- **Choose your assistant:** On launch, pick between Gemini, ChatGPT, or Claude. Your choice is remembered for next time.
- **Native Claude app support:** If the [Claude desktop app](https://claude.ai/download) is installed, an extra **Claude App** option appears that opens the native app directly instead of the web view.
- **Switch on the fly:** Swap assistants anytime from the title-bar pills, or jump straight to one with a shortcut — no reload of the whole app.
- **Global Shortcut:** `Option+Space` (macOS) / `Ctrl+Space` (Windows/Linux) toggles the launcher.
- **Quick-switch shortcuts:** `⌘/Ctrl+Shift+1/2/3` open Gemini/ChatGPT/Claude directly; `⌘/Ctrl+Shift+0` returns to the chooser.
- **Adjustable Transparency:** Live opacity slider in the title bar; the value is saved between sessions.
- **Frameless Window:** Centered around the active cursor display.
- **Smart Focus:** Auto-hides when Escape is pressed or window loses focus (blur), with a grace period so logins don't get dismissed.
- **Session Preserved:** Login context for each service persists between launches.
- **Tray Menu:** Show the launcher, jump to any assistant, toggle transparency, or quit.
- **Single Instance:** Prevents multiple windows from being opened simultaneously.

## Step-by-Step Setup Instructions

### 1. Requirements
- Node.js installed (v16.0.0 or higher recommended)
- `npm` installed

### 2. Installations
Go to the project folder where the code resides, or open a terminal there and run:
```bash
npm install
```

### 3. Running the App
To start the application locally:
```bash
npm start
```
The app will launch in the background. Press `Option+Space` (macOS) or `Ctrl+Space` (Windows/Linux) to bring up the window, then choose Gemini, ChatGPT, or Claude. 

### 4. Packaging the App (Production)
You can package the application using the integrated `electron-builder` configuration for different platforms:

#### macOS
```bash
npm run dist -- --mac
```
An executable `.dmg` or `.app` will be generated in the `dist` folder.

#### Windows
```bash
npm run dist -- --win
```
A `.exe` installer will be generated in the `dist` folder.

#### Linux
```bash
npm run dist -- --linux
```
An `.AppImage` will be generated in the `dist` folder.

### 5. To Note
The application creates a frameless transparent window. Any links navigating outside the active assistant or its sign-in provider will open natively in your default OS browser to ensure security.
