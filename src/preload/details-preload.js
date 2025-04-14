const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('detailsAPI', {
  // Receive request details
  onRequestDetails: (callback) => {
    // Remove any existing listeners to prevent duplicates
    ipcRenderer.removeAllListeners('request-details');
    
    // Set up the new listener
    ipcRenderer.on('request-details', (_, data) => {
      if (!data) {
        console.error('No data received in details window');
        return;
      }
      callback(data);
    });
  }
}); 