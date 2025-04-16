const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('certificateAPI', {
  // Receive certificate details
  onCertificateDetails: (callback) => {
    // Remove any existing listeners to prevent duplicates
    ipcRenderer.removeAllListeners('certificate-details');
    
    // Set up the new listener
    ipcRenderer.on('certificate-details', (_, data) => {
      if (!data) {
        console.error('No data received in certificate window');
        return;
      }
      callback(data);
    });
  }
}); 