import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: '水路运输船员值班管理系统',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

ipcMain.handle('save-file', async (_event, data: { fileName: string; content: string }) => {
  const result = await dialog.showSaveDialog({
    title: '保存文件',
    defaultPath: data.fileName,
    filters: [
      { name: 'Excel 文件', extensions: ['xlsx'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  if (!result.canceled && result.filePath) {
    const buffer = Buffer.from(data.content, 'base64')
    fs.writeFileSync(result.filePath, buffer)
    return { success: true, path: result.filePath }
  }
  return { success: false }
})

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择图片',
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif'] }
    ],
    properties: ['openFile']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const ext = path.extname(filePath).slice(1)
    return {
      success: true,
      dataUrl: `data:image/${ext};base64,${base64}`,
      fileName: path.basename(filePath)
    }
  }
  return { success: false }
})

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData')
})
