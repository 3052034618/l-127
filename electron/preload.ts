import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (data: { fileName: string; content: string }) =>
    ipcRenderer.invoke('save-file', data),
  selectImage: () => ipcRenderer.invoke('select-image'),
  getAppPath: () => ipcRenderer.invoke('get-app-path')
})

declare global {
  interface Window {
    electronAPI: {
      saveFile: (data: { fileName: string; content: string }) => Promise<{ success: boolean; path?: string }>
      selectImage: () => Promise<{ success: boolean; dataUrl?: string; fileName?: string }>
      getAppPath: () => Promise<string>
    }
  }
}
