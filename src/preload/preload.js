const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Load a URL in the browser view
  loadUrl: (url) => ipcRenderer.invoke('load-url', url),
  // Listen for navigation updates
  onNavigationUpdate: (callback) => ipcRenderer.on('navigation-update', (_, url) => callback(url)),
  // Listen for network activity
  onNetworkActivity: (callback) => ipcRenderer.on('network-activity', (_, data) => callback(data)),
  // Listen for network activity updates
  onNetworkActivityUpdate: (callback) => ipcRenderer.on('network-activity-update', (_, data) => callback(data)),
  // Listen for network reset
  onNetworkReset: (callback) => ipcRenderer.on('network-reset', () => callback()),
  // Listen for initial URL from command line
  onInitialUrl: (callback) => ipcRenderer.on('set-initial-url', (_, url) => callback(url)),
  // Get detailed request/response info
  getRequestDetails: (id) => ipcRenderer.invoke('get-request-details', id),
  // Open details window
  openDetailsWindow: (id) => ipcRenderer.invoke('open-details-window', id),
  // Open diagram window
  openDiagramWindow: () => ipcRenderer.invoke('open-diagram-window'),
  // Reset network data
  resetNetworkData: () => ipcRenderer.invoke('reset-network-data'),
  // Proxy settings functions
  getProxySettings: () => ipcRenderer.invoke('get-proxy-settings'),
  saveProxySettings: (settings) => ipcRenderer.invoke('save-proxy-settings', settings),
  testProxyConnection: (settings) => ipcRenderer.invoke('test-proxy-connection', settings),
  // Screenshot settings functions
  getScreenshotSettings: () => ipcRenderer.invoke('get-screenshot-settings'),
  saveScreenshotSettings: (settings) => ipcRenderer.invoke('save-screenshot-settings', settings),
  // Browser view visibility controls
  hideBrowserView: () => ipcRenderer.invoke('hide-browser-view'),
  showBrowserView: () => ipcRenderer.invoke('show-browser-view'),
  // Capture screenshot of the browser view
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  
  // Technology scan functions
  scanTechnologies: () => ipcRenderer.invoke('scan-technologies'),
  getTechnologyCategories: () => ipcRenderer.invoke('get-technology-categories'),
  onTechScanResults: (callback) => ipcRenderer.on('tech-scan-results', (_, data) => callback(data)),

  // Developer tools
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),

  // Tab management
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  removeTab: (index) => ipcRenderer.invoke('remove-tab', index),
  switchTab: (index) => ipcRenderer.invoke('switch-tab', index),
  getTabInfo: () => ipcRenderer.invoke('get-tab-info'),
  // Tab events
  onTabCreated: (callback) => ipcRenderer.on('tab-created', (_, data) => callback(data)),
  onTabRemoved: (callback) => ipcRenderer.on('tab-removed', (_, data) => callback(data)),
  onTabActivated: (callback) => ipcRenderer.on('tab-activated', (_, data) => callback(data)),
  onTabTitleUpdated: (callback) => ipcRenderer.on('tab-title-updated', (_, data) => callback(data))
}); 