# Gemini Quick Launcher

A cross-platform desktop quick launcher for Gemini built with Electron.

## Features
- **Global Shortcut:** `Control+Space` (macOS), `Ctrl+Space` (Windows/Linux)
- **Frameless Window:** Centered around the active cursor display.
- **Smart Focus:** Auto-hides when Escape is pressed or window loses focus (blur).
- **Session Preserved:** Google Login context persists between launches.
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
The app will launch in the background. Press `Control+Space` (macOS) or `Ctrl+Space` (Windows/Linux) to bring up the window. 

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
The application creates a frameless transparent window. Any links navigating outside Gemini or Google Sign-in will open natively in your default OS browser to ensure security.
