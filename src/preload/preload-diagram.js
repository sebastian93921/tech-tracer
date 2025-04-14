const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('diagramAPI', {
  // Listen for diagram data
  onDiagramData: (callback) => ipcRenderer.on('diagram-data', (_, data) => callback(data)),
  // Listen for diagram reset
  onDiagramReset: (callback) => ipcRenderer.on('diagram-data-reset', () => callback()),
  // Request latest diagram data
  requestUpdate: () => {
    ipcRenderer.send('request-diagram-update');
    return Promise.resolve(); // Return a promise for backward compatibility
  },
  // Reset network data
  resetNetworkData: () => {
    ipcRenderer.send('reset-diagram-data');
    return Promise.resolve(); // Return a promise for backward compatibility
  }
}); 