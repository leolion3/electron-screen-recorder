const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let win;

// Create a window with no frame and transparent background
function createWindow() {
    win = new BrowserWindow({
        width: 400,
        height: 800,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    win.loadFile('index.html');
    win.on('closed', () => {
        win = null;
    });
}

ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    return sources;
});

ipcMain.handle('save-dialog', async (event, buffer) => {
    const { filePath } = await dialog.showSaveDialog(win, {
        buttonLabel: 'Save video',
        defaultPath: `vid-${Date.now()}.webm`,
        filters: [
            { name: 'WebM Videos', extensions: ['webm'] }
        ]
    });

    if (filePath) {
        fs.writeFile(filePath, buffer, (err) => {
            if (err) {
                console.error('Error saving video:', err);
            } else {
                console.log('Video saved successfully!');
            }
        });
    }

    return { filePath };
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
