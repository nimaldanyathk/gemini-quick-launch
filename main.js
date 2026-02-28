const { app, BrowserWindow, BrowserView, globalShortcut, Tray, Menu, screen, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let view = null;
let tray = null;
let isQuitting = false;
let opacityInterval = null;
let targetOpacity = 1.0;

const APP_URL = 'https://gemini.google.com';

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

    mainWindow.loadFile('index.html');

    view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    mainWindow.setBrowserView(view);
    const bounds = mainWindow.getBounds();

    // Create space offset for the 24px draggable titlebar defined in index.html
    view.setBounds({ x: 0, y: 24, width: bounds.width, height: bounds.height - 24 });
    view.setAutoResize({ width: true, height: true });

    view.webContents.loadURL(APP_URL);

    mainWindow.on('blur', () => {
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

    // Handle escape in both contexts
    mainWindow.webContents.on('before-input-event', handleEscape);
    view.webContents.on('before-input-event', handleEscape);

    view.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith('https://gemini.google.com') && !url.includes('accounts.google.com')) {
            require('electron').shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    createTray();
}

ipcMain.on('set-opacity', (event, value) => {
    targetOpacity = value;
    if (mainWindow && mainWindow.isVisible()) {
        mainWindow.setOpacity(targetOpacity);
    }
});

function createTray() {
    const { nativeImage } = require('electron');
    const emptyImg = nativeImage.createFromBuffer(Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
        0x0B, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0x60, 0x00, 0x02, 0x00,
        0x00, 0x05, 0x00, 0x01, 0x24, 0x14, 0x80, 0x7E, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]));

    tray = new Tray(emptyImg);
    tray.setToolTip('Gemini Quick Launcher');

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Gemini', click: () => showWindow() },
        {
            label: 'Toggle Transparency', click: () => {
                targetOpacity = targetOpacity === 1.0 ? 0.75 : 1.0;
                if (mainWindow && mainWindow.isVisible()) mainWindow.setOpacity(targetOpacity);
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

    // Only center on the very first open so that if the user drags it somewhere else,
    // we respect their placement on future toggles.
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
    mainWindow.focus();

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
