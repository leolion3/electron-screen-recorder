const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let win;

// Create a window with no frame and transparent background
function createWindow() {
    win = new BrowserWindow({
        width: 400,
        height: 800,
        frame: false,  // Disable the default window frame for custom design
        transparent: true,  // For the transparent background
        resizable: false,
        webPreferences: {
            nodeIntegration: true,  // Allow nodeIntegration for renderer
            contextIsolation: false, // Allow renderer to access Electron's node modules
        }
    });

    win.loadFile('index.html');  // Load the HTML page
    win.on('closed', () => {
        win = null;
    });
}

// Handle IPC request to get screen and window sources
ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    return sources;  // Return the available sources (screens, windows)
});

// Handle the save dialog and write the file
ipcMain.handle('save-dialog', async (event, buffer) => {
    const { filePath } = await dialog.showSaveDialog(win, {
        buttonLabel: 'Save video',
        defaultPath: `vid-${Date.now()}.webm`,
        filters: [
            { name: 'WebM Videos', extensions: ['webm'] }
        ]
    });

    if (filePath) {
        // Write the buffer to the file path
        fs.writeFile(filePath, buffer, (err) => {
            if (err) {
                console.error('Error saving video:', err);
            } else {
                console.log('Video saved successfully!');
            }
        });
    }

    return { filePath };  // Return the file path to renderer
});

// Quit the app when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Initialize the app
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
