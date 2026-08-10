const { app, BrowserWindow, BrowserView, globalShortcut, Tray, Menu, screen, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let view = null;
let tray = null;
let isQuitting = false;
let opacityInterval = null;
let targetOpacity = 1.0;
let currentService = null;
let suppressBlurUntil = 0;

// Height of the draggable titlebar defined in index.html.
const TITLEBAR_HEIGHT = 40;

// ---------------------------------------------------------------------------
// Service catalog. Each entry is a chat assistant the launcher can host.
// `allow` lists the domain suffixes that are permitted to open inside the app
// (the service itself plus its auth/login providers). Anything else opens in
// the user's default browser.
// ---------------------------------------------------------------------------
const SERVICES = {
    gemini: {
        name: 'Gemini',
        url: 'https://gemini.google.com',
        accent: '#8ab4f8',
        allow: ['gemini.google.com', 'accounts.google.com', 'google.com', 'gstatic.com']
    },
    chatgpt: {
        name: 'ChatGPT',
        url: 'https://chatgpt.com',
        accent: '#19c37d',
        allow: ['chatgpt.com', 'openai.com', 'auth.openai.com', 'auth0.openai.com', 'oaistatic.com', 'oaiusercontent.com']
    },
    claude: {
        name: 'Claude',
        url: 'https://claude.ai',
        accent: '#d97757',
        letter: 'A',
        allow: ['claude.ai', 'anthropic.com', 'google.com', 'accounts.google.com']
    }
};

// Give the web services single-letter badges too.
SERVICES.gemini.letter = 'G';
SERVICES.chatgpt.letter = 'C';

// Domains that are always allowed to open in-app regardless of active service
// (covers logins that hop across providers).
const GLOBAL_ALLOW = Object.values(SERVICES).flatMap(s => s.allow || []);

// ---------------------------------------------------------------------------
// Lightweight settings persistence (last used service + opacity).
// ---------------------------------------------------------------------------
function settingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
    try {
        return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveSettings(patch) {
    try {
        const merged = Object.assign(loadSettings(), patch);
        fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2));
    } catch (e) {
        console.error('Failed to save settings', e);
    }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (!mainWindow.isVisible()) {
                showWindow();
            } else {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
            }
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 650,
        show: false,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        fullscreenable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Ensures it can show up over full screen apps and across desktops
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    mainWindow.loadFile('index.html');

    mainWindow.on('blur', () => {
        // Skip auto-hide briefly while an auth/login popup is grabbing focus.
        if (Date.now() < suppressBlurUntil) return;
        hideWindow();
    });

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            hideWindow();
        }
        return false;
    });

    const handleEscape = (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown') {
            hideWindow();
        }
    };
    mainWindow.webContents.on('before-input-event', handleEscape);

    // Restore the last used service automatically so returning users land
    // straight in their assistant; first-time users see the chooser.
    mainWindow.webContents.once('did-finish-load', () => {
        // Tell the renderer which assistants to show.
        const keys = Object.keys(SERVICES);
        mainWindow.webContents.send('init-config', keys.map((key) => ({
            key,
            name: SERVICES[key].name,
            accent: SERVICES[key].accent,
            letter: SERVICES[key].letter
        })));

        const savedOpacity = loadSettings().opacity;
        if (typeof savedOpacity === 'number') {
            targetOpacity = savedOpacity;
            mainWindow.webContents.send('init-opacity', savedOpacity);
        }
        // Always start on the chooser so the user picks their assistant on open.
    });

    createTray();
}

// ---------------------------------------------------------------------------
// Attach / swap the hosted assistant.
// ---------------------------------------------------------------------------
function ensureView() {
    if (view) return view;

    view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // Named persistent partition => cookies, localStorage and login
            // sessions are written to disk and kept across restarts.
            partition: 'persist:assistants',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    view.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown') hideWindow();
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        let host = '';
        try { host = new URL(url).hostname; } catch (e) { /* noop */ }
        const allowed = GLOBAL_ALLOW.some(d => host === d || host.endsWith('.' + d));
        if (allowed) {
            // Give the login popup a moment to take focus without us auto-hiding.
            suppressBlurUntil = Date.now() + 20000;
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    return view;
}

function layoutView() {
    if (!mainWindow || !view) return;
    // Use the content size (not window bounds) so the view lines up exactly with
    // no rounding gap on the transparent edges.
    const [width, height] = mainWindow.getContentSize();
    view.setBounds({
        x: 0,
        y: TITLEBAR_HEIGHT,
        width: Math.round(width),
        height: Math.max(0, Math.round(height - TITLEBAR_HEIGHT))
    });
}

function loadService(key) {
    const service = SERVICES[key];
    if (!service) return;

    ensureView();
    if (currentService !== key) {
        view.webContents.loadURL(service.url);
    }
    currentService = key;

    mainWindow.setBrowserView(view);
    layoutView();

    saveSettings({ lastService: key });
    mainWindow.webContents.send('service-changed', { key, name: service.name, accent: service.accent });
}

function showChooser() {
    // Detach the hosted view so the picker HTML underneath is visible again.
    if (mainWindow && view) mainWindow.setBrowserView(null);
    if (mainWindow) mainWindow.webContents.send('show-chooser');
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.on('select-service', (event, key) => loadService(key));
ipcMain.on('open-chooser', () => showChooser());

ipcMain.on('set-opacity', (event, value) => {
    targetOpacity = value;
    if (mainWindow && mainWindow.isVisible()) {
        mainWindow.setOpacity(targetOpacity);
    }
    saveSettings({ opacity: value });
});

function createTray() {
    const emptyImg = nativeImage.createFromBuffer(Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0B, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0x60, 0x00, 0x02, 0x00,
        0x00, 0x05, 0x00, 0x01, 0x24, 0x14, 0x80, 0x7E, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]));

    tray = new Tray(emptyImg);
    tray.setToolTip('AI Quick Launcher');

    const serviceItems = Object.keys(SERVICES).map((key) => ({
        label: SERVICES[key].name,
        click: () => { showWindow(); loadService(key); }
    }));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Launcher', click: () => showWindow() },
        { type: 'separator' },
        ...serviceItems,
        { label: 'Choose Assistant…', click: () => { showWindow(); showChooser(); } },
        { type: 'separator' },
        {
            label: 'Toggle Transparency', click: () => {
                targetOpacity = targetOpacity === 1.0 ? 0.75 : 1.0;
                if (mainWindow && mainWindow.isVisible()) mainWindow.setOpacity(targetOpacity);
                saveSettings({ opacity: targetOpacity });
            }
        },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

function toggleWindow() {
    if (!mainWindow) return;

    if (mainWindow.isVisible()) {
        hideWindow();
    } else {
        showWindow();
    }
}

let hasBeenShownOnce = false;

function showWindow() {
    if (!mainWindow) return;

    // Only center on the very first open so that if the user drags it somewhere
    // else, we respect their placement on future toggles.
    if (!hasBeenShownOnce) {
        const point = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(point);
        const windowBounds = mainWindow.getBounds();
        const x = Math.round(display.bounds.x + (display.bounds.width - windowBounds.width) / 2);
        const y = Math.round(display.bounds.y + (display.bounds.height - windowBounds.height) / 2);
        mainWindow.setPosition(x, y);
        hasBeenShownOnce = true;
    }

    // Smooth fade-in to the target opacity
    mainWindow.setOpacity(0);
    mainWindow.show();
    if (app.dock) app.dock.show(); // Required on Mac sometimes to pull focus securely
    mainWindow.focus();
    mainWindow.moveTop();

    if (opacityInterval) clearInterval(opacityInterval);
    let opacity = 0;
    opacityInterval = setInterval(() => {
        opacity += 0.1;
        if (opacity >= targetOpacity) {
            clearInterval(opacityInterval);
            mainWindow.setOpacity(targetOpacity);
        } else {
            mainWindow.setOpacity(opacity);
        }
    }, 15);
}

function hideWindow() {
    if (!mainWindow) return;

    // Smooth fade-out
    if (opacityInterval) clearInterval(opacityInterval);
    let opacity = mainWindow.getOpacity();
    opacityInterval = setInterval(() => {
        opacity -= 0.1;
        if (opacity <= 0) {
            clearInterval(opacityInterval);
            mainWindow.hide();
            if (app.dock) app.dock.hide(); // Hide dock icon again
            mainWindow.setOpacity(targetOpacity); // Reset opacity for next display tracking
        } else {
            mainWindow.setOpacity(opacity);
        }
    }, 15);
}

function registerShortcut() {
    const shortcut = process.platform === 'darwin' ? 'Control+Space' : 'Control+Space';
    const ret = globalShortcut.register(shortcut, () => {
        toggleWindow();
    });
    if (!ret) {
        console.error('Registration failed for shortcut', shortcut);
    }
}

app.whenReady().then(() => {
    createWindow();
    registerShortcut();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            showWindow();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
