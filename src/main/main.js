const { app, BrowserWindow, ipcMain, WebContentsView, nativeImage, clipboard } = require('electron');
const path = require('path');
const { URL } = require('url');
const settingsService = require('./settings-service');
const technologyService = require('./technology-service');

// Parse command line arguments
let initialUrl = 'about:blank'; // Default URL

// Handle command line arguments differently depending on whether app is packaged
function processCommandLineArgs() {
  // Get the arguments
  let args;
  if (app.isPackaged) {
    // For packaged app on macOS, arguments start from index 1
    args = process.argv.slice(1);
  } else {
    // In development, arguments start from index 2
    args = process.argv.slice(2);
  }

  console.log('Command line arguments:', args);

  // Look for --url parameter
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      initialUrl = args[i + 1];
      console.log('Setting initial URL to:', initialUrl);
      break;
    }
  }
}

// Process arguments on startup
processCommandLineArgs();

let mainWindow;
// Store multiple web views for tabbed browsing
let webViews = [];
let activeWebViewIndex = 0;
// Global map for tracking network requests
const pendingRequests = new Map();
// Map to track script-initiated requests
const scriptApiMap = new Map();
// Map to correlate webRequest IDs with debugger requestIds
const requestIdMap = new Map();

function getDefaultViewBound(bounds){
  const browserToolHeight = 82;
  return { 
    x: 300, 
    y: browserToolHeight, 
    width: bounds.width - 300, 
    height: bounds.height - browserToolHeight 
  }
}

// Disable SSL certificate verification
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch ("disable-http-cache");


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'html', 'index.html'));
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  // Send initial URL to renderer when it's ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('set-initial-url', initialUrl);
  });
}

// Function to create a blank page with "No response" message
function createNoResponsePage() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
          color: #333;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          overflow: hidden;
        }
        .no-response {
          font-size: 24px;
          color: #888;
          text-align: center;
        }
        .check-proxy {
          font-size: 14px;
          margin-top: 10px;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="no-response">
        Hi! This is a blank page
        <div class="check-proxy">Please check your proxy settings if you keep getting this message</div>
      </div>      
    </body>
    </html>
  `;
}

function createWebContentsView(url) {
  // If there's an existing view, we need to clean it up
  if (webViews[activeWebViewIndex]) {
    try {
      // The proper way to dispose WebContentsView
      webViews[activeWebViewIndex].webContents.close();
    } catch (e) {
      console.error('Error closing previous view:', e);
    }
  }
  
  // Create a new WebContentsView
  webViews[activeWebViewIndex] = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      v8CacheOptions: 'none',
      devTools: true
    }
  });
  
  // Configure session to ignore certificate errors
  webViews[activeWebViewIndex].webContents.session.setCertificateVerifyProc((request, callback) => {
    callback(0); // 0 means success, trust the certificate
  });
  
  // Apply proxy settings to the session
  settingsService.configureProxy(webViews[activeWebViewIndex].webContents.session);
  
  // Add the view to the window - following the official migration guide
  mainWindow.contentView.addChildView(webViews[activeWebViewIndex]);
  
  // Calculate position to account for left panel (300px) and top bar (48px)
  const bounds = mainWindow.getBounds();
  webViews[activeWebViewIndex].setBounds(getDefaultViewBound(bounds));
  
  // Make the view resize with the window
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    webViews[activeWebViewIndex].setBounds(getDefaultViewBound(bounds));
  });
  
  // Add error handler to display "No response" message
  webViews[activeWebViewIndex].webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    // Don't show error for aborted loads (happens during navigation)
    if (errorCode !== -3) {
      webViews[activeWebViewIndex].webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(createNoResponsePage()));
    }
  });
  
  // Navigate to URL or show "No response" if URL is empty/invalid
  if (url && url.trim() !== '' && url !== 'about:blank') {
    webViews[activeWebViewIndex].webContents.loadURL(url);
  } else {
    webViews[activeWebViewIndex].webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(createNoResponsePage()));
  }
  
  // Send the initial URL to the renderer when the page finishes loading
  webViews[activeWebViewIndex].webContents.on('did-finish-load', () => {
    const currentUrl = webViews[activeWebViewIndex].webContents.getURL();
    if (currentUrl) {
      mainWindow.webContents.send('navigation-update', currentUrl);
      
      // Automatically perform technology scan when page finishes loading
      technologyService.scanCurrentPage(webViews, activeWebViewIndex).then(results => {
        mainWindow.webContents.send('tech-scan-results', { 
          success: true, 
          results,
          automatic: true
        });
      }).catch(error => {
        console.error('Error during automatic page scan:', error);
      });
    }
  });
  
  // Listen for page title updates
  webViews[activeWebViewIndex].webContents.on('page-title-updated', (event, title) => {
    // Send title update to renderer
    mainWindow.webContents.send('tab-title-updated', {
      index: activeWebViewIndex,
      title: title
    });
  });
  
  // Handle new window creation (when links are clicked with target="_blank")
  webViews[activeWebViewIndex].webContents.setWindowOpenHandler(({ url }) => {
    // Create a new tab with the URL instead of using current tab
    createNewTab(url);
    return { action: 'deny' };
  });
  
  // Handle regular link navigation
  webViews[activeWebViewIndex].webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    webViews[activeWebViewIndex].webContents.loadURL(url);
    mainWindow.webContents.send('navigation-update', url);
  });

  // Handle redirects and successful navigation
  webViews[activeWebViewIndex].webContents.on('did-navigate', (event, url) => {
    mainWindow.webContents.send('navigation-update', url);
  });

  // Handle in-page navigation (like hash changes)
  webViews[activeWebViewIndex].webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
    if (isMainFrame) {
      mainWindow.webContents.send('navigation-update', url);
    }
  });

  // Monitor network requests
  webViews[activeWebViewIndex].webContents.session.webRequest.onBeforeRequest((details, callback) => {
    // Skip local file URLs
    if (details.url.startsWith('file://') || details.url.startsWith('devtools://')) {
      callback({ cancel: false });
      return;
    }
    
    // Get referer header if available
    let referer = '';
    if (details.requestHeaders && details.requestHeaders.Referer) {
      referer = details.requestHeaders.Referer;
    } else if (details.headers && details.headers.Referer) {
      referer = details.headers.Referer;
    }
    
    // Store the request details
    pendingRequests.set(details.id, {
      id: details.id,
      method: details.method,
      url: details.url,
      referrer: referer,
      timestamp: Date.now(),
      requestHeaders: details.requestHeaders || {},
      uploadData: details.uploadData
    });

    // Track relationships between scripts and APIs
    if (referer) {
      try {
        const referrerUrl = new URL(referer);
        const referrerPath = referrerUrl.pathname;
        const referrerExt = referrerPath.split('.').pop().toLowerCase();
        
        const requestUrl = new URL(details.url);
        const requestPath = requestUrl.pathname;
        const requestExt = requestPath.split('.').pop().toLowerCase();
        
        // If the referrer is a JavaScript file and the request appears to be an API call
        const isScript = ['js', 'jsx'].includes(referrerExt);
        const isApi = !['js', 'jsx', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'html', 'htm'].includes(requestExt);
        
        if (isScript) {
          // Store relationship: script -> destination
          const scriptKey = `${referrerUrl.hostname}${referrerPath}`;
          if (!scriptApiMap.has(scriptKey)) {
            scriptApiMap.set(scriptKey, new Set());
          }
          scriptApiMap.get(scriptKey).add(`${requestUrl.hostname}${requestPath}`);
        }
      } catch (e) {
        console.error('Error tracking script-API relationship:', e);
      }
    }

    // Send basic info to renderer
    try{
        mainWindow.webContents.send('network-activity', {
        id: details.id,
        type: 'request',
        method: details.method,
        url: details.url,
        referrer: referer,
        timestamp: Date.now()
        });
        callback({ cancel: false });
    } catch (error) {
      // Check if the window is still open
      if (mainWindow && !mainWindow.isDestroyed()) {
        throw error;
      }
    }
  });

  webViews[activeWebViewIndex].webContents.session.webRequest.onSendHeaders((details) => {
    // Skip local file URLs
    if (details.url.startsWith('file://') || details.url.startsWith('devtools://')) {
      return;
    }
    
    // Update with final headers
    if (pendingRequests.has(details.id)) {
      const request = pendingRequests.get(details.id);
      request.requestHeaders = details.requestHeaders;
      
      // Update referrer if available
      if (details.requestHeaders && details.requestHeaders.Referer) {
        request.referrer = details.requestHeaders.Referer;
        
        // Also update the renderer
        mainWindow.webContents.send('network-activity-update', {
          id: details.id,
          referrer: details.requestHeaders.Referer
        });
      }
      
      pendingRequests.set(details.id, request);
    }
  });

  webViews[activeWebViewIndex].webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Skip local file URLs
    if (details.url.startsWith('file://') || details.url.startsWith('devtools://')) {
      callback({ cancel: false });
      return;
    }
    
    if (pendingRequests.has(details.id)) {
      const request = pendingRequests.get(details.id);
      request.responseHeaders = details.responseHeaders;
      request.statusCode = details.statusCode;
      request.statusLine = details.statusLine;
      
      pendingRequests.set(details.id, request);
    }
    callback({ cancel: false });
  });

  webViews[activeWebViewIndex].webContents.session.webRequest.onCompleted((details) => {
    // Skip local file URLs
    if (details.url.startsWith('file://') || details.url.startsWith('devtools://')) {
      return;
    }
    
    if (pendingRequests.has(details.id)) {
      const request = pendingRequests.get(details.id);
      // Add response details
      request.responseHeaders = details.responseHeaders;
      request.statusCode = details.statusCode;
      request.statusLine = details.statusLine;
      request.responseEndTime = Date.now();
      request.duration = request.responseEndTime - request.timestamp;

      // Send basic completed info to renderer
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('network-activity', {
          id: details.id,
          type: 'response',
          url: details.url,
          statusCode: details.statusCode,
          timestamp: Date.now()
        });
      }
    }
  });

  webViews[activeWebViewIndex].webContents.session.webRequest.onErrorOccurred((details) => {
    // Skip local file URLs
    if (details.url.startsWith('file://') || details.url.startsWith('devtools://')) {
      return;
    }
    
    if (pendingRequests.has(details.id)) {
      const request = pendingRequests.get(details.id);
      request.error = details.error;
      
      mainWindow.webContents.send('network-activity', {
        id: details.id,
        type: 'error',
        method: details.method,
        url: details.url,
        error: details.error,
        timestamp: Date.now()
      });
      
      pendingRequests.set(details.id, request);
    }
  });

  // Use debugger API to capture request and response bodies
  try {
    webViews[activeWebViewIndex].webContents.debugger.attach();
    console.log('Debugger attached successfully');
  } catch (err) {
    console.log('Debugger attach failed:', err);
  }

  webViews[activeWebViewIndex].webContents.debugger.on('detach', (event, reason) => {
    console.log('Debugger detached due to:', reason);
  });

  webViews[activeWebViewIndex].webContents.debugger.on('message', (event, method, params) => {
    if (method === 'Network.requestWillBeSent') {
      // Store a mapping between the URL and requestId for later correlation
      if (params.request && params.request.url) {
        // Use the URL + timestamp as a key to match with webRequest IDs
        const urlKey = params.request.url + ':' + Date.now();
        requestIdMap.set(urlKey, params.requestId);
        
        // Try to find matching webRequest in pendingRequests by URL
        for (const [webRequestId, request] of pendingRequests.entries()) {
          if (request.url === params.request.url && !request.debuggerRequestId) {
            // Found a match, link the two IDs
            request.debuggerRequestId = params.requestId;
            pendingRequests.set(webRequestId, request);
            break;
          }
        }
        
        // Store request data if it exists
        if (params.request.postData) {
          // We'll check for matching requests when response is received
          // For now store the request body with the debugger ID
          pendingRequests.forEach(request => {
            if (request.url === params.request.url && !request.requestBody) {
              request.requestBody = params.request.postData;
            }
          });
        }
      }
    }
    
    if (method === 'Network.responseReceived') {
      const requestId = params.requestId;
      const responseUrl = params.response && params.response.url;
      
      // Try to find the corresponding webRequest
      let matchingWebRequestId = null;
      for (const [webRequestId, request] of pendingRequests.entries()) {
        if (request.debuggerRequestId === requestId || 
            (responseUrl && request.url === responseUrl)) {
          matchingWebRequestId = webRequestId;
          break;
        }
      }
      
      if (matchingWebRequestId) {
        // Get the corresponding request
        webViews[activeWebViewIndex].webContents.debugger.sendCommand('Network.getResponseBody', { requestId })
          .then(response => {
            if (pendingRequests.has(matchingWebRequestId)) {
              const request = pendingRequests.get(matchingWebRequestId);
              request.responseBody = response.body;
              request.responseBodyBase64Encoded = response.base64Encoded;
              pendingRequests.set(matchingWebRequestId, request);
            }
          })
          .catch(error => {
            // Don't log for common errors (no response body available)
            if (!error.message.includes('No resource with given identifier found') && 
                !error.message.includes('No data found for resource with given identifier')) {
              console.error('Error getting response body:', error);
            }
            
            // Still mark that we attempted to fetch the body
            if (pendingRequests.has(matchingWebRequestId)) {
              const request = pendingRequests.get(matchingWebRequestId);
              if (!request.responseBody) {
                request.responseBody = '[Response body not available]';
              }
              pendingRequests.set(matchingWebRequestId, request);
            }
          });
      }
    }
    
    // Also listen for Network.loadingFinished to retry getting response body
    if (method === 'Network.loadingFinished') {
      const requestId = params.requestId;
      
      // Try to find the corresponding webRequest
      let matchingWebRequestId = null;
      for (const [webRequestId, request] of pendingRequests.entries()) {
        if (request.debuggerRequestId === requestId) {
          matchingWebRequestId = webRequestId;
          break;
        }
      }
      
      if (matchingWebRequestId) {
        // Get the corresponding request
        webViews[activeWebViewIndex].webContents.debugger.sendCommand('Network.getResponseBody', { requestId })
          .then(response => {
            if (pendingRequests.has(matchingWebRequestId)) {
              const request = pendingRequests.get(matchingWebRequestId);
              request.responseBody = response.body;
              request.responseBodyBase64Encoded = response.base64Encoded;
              pendingRequests.set(matchingWebRequestId, request);
            }
          })
          .catch(error => {
            // Don't log for common errors (no response body available)
            if (!error.message.includes('No resource with given identifier found') && 
                !error.message.includes('No data found for resource with given identifier')) {
              console.error('Error getting response body on loading finished:', error);
            }
          });
      }
    }
  });

  // Enable network debugging
  webViews[activeWebViewIndex].webContents.debugger.sendCommand('Network.enable');
  
  return webViews[activeWebViewIndex];
}

// Handle getting full request/response details - moved outside of createWebContentsView
// to prevent duplicate handler registration
ipcMain.handle('get-request-details', (_, id) => {
  if (pendingRequests.has(id)) {
    return pendingRequests.get(id);
  }
  return null;
});

app.whenReady().then(async () => {
  // Clear cookies, cache, and storage before starting the app
  console.log('Clearing browsing data before startup...');
  const session = require('electron').session.defaultSession;
  
  try {
    // Clear all cookies
    await session.clearStorageData({
      storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'cachestorage'],
      quotas: ['temporary', 'persistent', 'syncable']
    });
    
    // Clear HTTP cache
    await session.clearCache();
    
    // Clear host resolver cache
    await session.clearHostResolverCache();
    
    console.log('Successfully cleared all browsing data');
  } catch (error) {
    console.error('Error clearing browsing data:', error);
  }
  
  // Set up settings service IPC handlers
  settingsService.setupHandlers(ipcMain);
  technologyService.setupHandlers(ipcMain);
  
  createWindow();
  
  // Create the first tab with the initial URL
  createNewTab(initialUrl);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle IPC messages from renderer
ipcMain.handle('load-url', (event, url) => {
  if (webViews[activeWebViewIndex] && webViews[activeWebViewIndex].webContents && !webViews[activeWebViewIndex].webContents.isDestroyed()) {
    try {
      if (url && url.trim() !== '') {
        webViews[activeWebViewIndex].webContents.loadURL(url);
      } else {
        webViews[activeWebViewIndex].webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(createNoResponsePage()));
      }
      return { success: true };
    } catch (error) {
      console.error('Error loading URL:', error);
      webViews[activeWebViewIndex].webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(createNoResponsePage()));
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'No active web view' };
});

// Get certificate information for active web view
ipcMain.handle('get-certificate', async () => {
  try {
    if (webViews[activeWebViewIndex] && webViews[activeWebViewIndex].webContents && !webViews[activeWebViewIndex].webContents.isDestroyed()) {
      const url = webViews[activeWebViewIndex].webContents.getURL();
      
      // Skip checking for certificate on non-https URLs
      if (!url || !url.startsWith('https://')) {
        return { success: true, hasCertificate: false };
      }
      
      // For HTTPS URLs, return that a certificate exists
      return { success: true, hasCertificate: true, url };
    }
    return { success: false, error: 'No active web view' };
  } catch (error) {
    console.error('Error getting certificate:', error);
    return { success: false, error: error.message };
  }
});

// Handle SSL certificate viewer window
let certificateWindow = null;

// Function to open certificate viewer window
function createCertificateWindow(certificate, url) {
  // Close existing certificate window if it exists
  if (certificateWindow && !certificateWindow.isDestroyed()) {
    certificateWindow.close();
    certificateWindow = null;
  }
  
  // Create new window
  certificateWindow = new BrowserWindow({
    width: 600,
    height: 700,
    title: 'Certificate Viewer',
    backgroundColor: '#f8f8f8',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'certificate-preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    parent: mainWindow,
    modal: false
  });
  
  // Load certificate page
  certificateWindow.loadFile(path.join(__dirname, '..', 'renderer', 'html', 'certificate.html'));
  
  // Pass certificate details when page is loaded
  certificateWindow.webContents.on('did-finish-load', () => {
    // Check if the window still exists before sending data
    if (certificateWindow && !certificateWindow.isDestroyed()) {
      certificateWindow.webContents.send('certificate-details', { certificate, url });
    }
  });
  
  // Clean up reference
  certificateWindow.on('closed', () => {
    certificateWindow = null;
  });
  
  return certificateWindow;
}

// IPC handler to open certificate viewer window
ipcMain.handle('open-certificate-window', async () => {
  try {
    if (webViews[activeWebViewIndex] && webViews[activeWebViewIndex].webContents && !webViews[activeWebViewIndex].webContents.isDestroyed()) {
      const url = webViews[activeWebViewIndex].webContents.getURL();
      
      if (!url || !url.startsWith('https://')) {
        return { success: false, error: 'Not an HTTPS site' };
      }
      
      const parsedUrl = new URL(url);
      
      // Use a direct HTTPS request to get certificate info
      const getCertificateInfo = () => {
        return new Promise((resolve) => {
          try {
            // Use Node's https module to get certificate information
            const https = require('https');
            const options = {
              hostname: parsedUrl.hostname,
              port: parsedUrl.port || 443,
              path: parsedUrl.pathname + parsedUrl.search,
              method: 'HEAD',
              rejectUnauthorized: false,
              timeout: 5000
            };
            
            const req = https.request(options, (res) => {
              try {
                const cert = res.socket.getPeerCertificate(true);
                resolve(cert);
              } catch (err) {
                console.error('Error getting peer certificate:', err);
                resolve(null);
              }
            });
            
            req.on('error', (e) => {
              console.error('HTTPS request error:', e);
              resolve(null);
            });
            
            req.on('timeout', () => {
              console.error('HTTPS request timeout');
              req.destroy();
              resolve(null);
            });
            
            req.end();
          } catch (error) {
            console.error('Error in certificate request:', error);
            resolve(null);
          }
        });
      };
      
      // Get the certificate info
      const certInfo = await getCertificateInfo();
      
      // Format the certificate data
      const formatCertificateData = (cert) => {
        if (!cert) return null;
        
        try {
          // Parse subject and issuer fields
          const parseNameFields = (name) => {
            if (!name) return {};
            
            // Handle different formats of certificate info
            if (typeof name === 'object') return name;
            
            // Typically comes in format: CN=example.com,O=Example Inc,OU=Web
            const fields = {};
            name.split(',').forEach(part => {
              const [key, value] = part.trim().split('=');
              if (key && value) {
                // Map keys to full names
                switch (key.toUpperCase()) {
                  case 'CN': fields.commonName = value; break;
                  case 'O': fields.organization = value; break;
                  case 'OU': fields.organizationalUnit = value; break;
                  default: fields[key] = value;
                }
              }
            });
            return fields;
          };
          
          const subject = typeof cert.subject === 'string' 
            ? parseNameFields(cert.subject) 
            : cert.subject || {};
            
          const issuer = typeof cert.issuer === 'string'
            ? parseNameFields(cert.issuer)
            : cert.issuer || {};
          
          return {
            subject: {
              commonName: subject.commonName || parsedUrl.hostname,
              organization: subject.organization || subject.O || '<Not part of certificate>',
              organizationalUnit: subject.organizationalUnit || subject.OU || '<Not part of certificate>'
            },
            issuer: {
              commonName: issuer.commonName || issuer.CN || '<Unknown>',
              organization: issuer.organization || issuer.O || '<Unknown>',
              organizationalUnit: issuer.organizationalUnit || issuer.OU || '<Unknown>'
            },
            validFrom: cert.validFrom ? new Date(cert.validFrom).getTime() : Date.now(),
            validTo: cert.validTo ? new Date(cert.validTo).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
            fingerprint: cert.fingerprint || 'Unknown',
            serialNumber: cert.serialNumber || 'Unknown',
            pubKeyFingerprint: cert.pubKeyFingerprint || cert.fingerprint || 'Unknown',
            rawDetails: cert
          };
        } catch (error) {
          console.error('Error formatting certificate data:', error);
          return null;
        }
      };
      
      // Format the certificate
      const certificate = formatCertificateData(certInfo) || {
        subject: {
          commonName: parsedUrl.hostname,
          organization: '<Not part of certificate>',
          organizationalUnit: '<Not part of certificate>'
        },
        issuer: {
          commonName: '<Unknown>',
          organization: '<Unknown>',
          organizationalUnit: '<Unknown>'
        },
        validFrom: Date.now(),
        validTo: Date.now() + 365 * 24 * 60 * 60 * 1000,
        fingerprint: 'Unknown',
        serialNumber: 'Unknown',
        pubKeyFingerprint: 'Unknown',
        rawDetails: { note: 'Could not retrieve certificate details' }
      };
      
      createCertificateWindow(certificate, url);
      return { success: true };
    }
    return { success: false, error: 'No active web view' };
  } catch (error) {
    console.error('Error opening certificate window:', error);
    return { success: false, error: error.message };
  }
});

// Handle request details window
let detailsWindow = null;
// Handle diagram window
let diagramWindow = null;

function createDetailsWindow(requestDetails) {
  // Close all existing windows first
  if (diagramWindow && !diagramWindow.isDestroyed()) {
    diagramWindow.close();
    diagramWindow = null;
  }
  
  // Close existing details window if it exists
  if (detailsWindow && !detailsWindow.isDestroyed()) {
    detailsWindow.close();
    detailsWindow = null;
  }
  
  // Wait for any existing window to be properly closed
  setTimeout(() => {
    // Create new window
    detailsWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Network Request Details',
      backgroundColor: '#1e1e1e',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'details-preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      },
      parent: mainWindow,
      modal: false
    });
    
    // Load details page
    detailsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'html', 'details.html'));
    
    // Pass request details when page is loaded
    detailsWindow.webContents.on('did-finish-load', () => {
      // Check if the window still exists before sending data
      if (detailsWindow && !detailsWindow.isDestroyed()) {
        // Make sure we're sending valid data
        if (requestDetails && requestDetails.url) {
          console.log('Sending details to window for: ', requestDetails.url);
          detailsWindow.webContents.send('request-details', requestDetails);
        } else {
          console.error('Invalid request details:', requestDetails);
        }
      }
    });
    
    // Clean up reference
    detailsWindow.on('closed', () => {
      detailsWindow = null;
    });
  }, 100); // Short delay to ensure previous windows are closed
  
  return detailsWindow;
}

function createDiagramWindow() {
  // Create a unique ID for the diagram window to avoid duplicates
  const windowId = 'diagram-window';
  
  // Check if the window already exists
  const existingWindow = BrowserWindow.getAllWindows().find(w => w.id === windowId);
  if (existingWindow) {
    if (!existingWindow.isDestroyed()) {
      existingWindow.focus();
      return;
    }
  }
  
  // Create new diagram window
  let diagramWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Resource Diagram',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload-diagram.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#1e1e1e',
  });
  
  // Track the window by ID
  diagramWindow.id = windowId;
  
  diagramWindow.loadFile(path.join(__dirname, '..', 'renderer', 'html', 'diagram.html'));
  
  // Remove default menu
  diagramWindow.setMenuBarVisibility(false);
  
  // When window is closed, clear the reference
  diagramWindow.on('closed', () => {
    diagramWindow = null;
  });
  
  // Prepare the flow diagram data
  ipcMain.on('request-diagram-update', (event) => {
    try {
      if (!diagramWindow || diagramWindow.isDestroyed()) {
        return;
      }
      
      // Generate the diagram data
      const diagramData = prepareNetworkFlowData();
      
      // Send combined flow data to the diagram window
      event.sender.send('diagram-data', diagramData);
    } catch (error) {
      console.error('Error sending diagram data:', error);
      if (diagramWindow && !diagramWindow.isDestroyed()) {
        diagramWindow.webContents.send('diagram-data', { error: error.message });
      }
    }
  });
  
  // Reset network data
  ipcMain.on('reset-diagram-data', async (event) => {
    try {
      await resetNetworkData();
      event.sender.send('diagram-data-reset');
    } catch (error) {
      console.error('Error resetting diagram data:', error);
    }
  });
}

// Function to build the domain-resource tree for visualization
function buildDomainResourceTree() {
  const requestFlowObj = {};
  
  pendingRequests.forEach((request) => {
    if (request.referrer) {
      try {
        // Get domains from URLs
        const requestUrl = new URL(request.url);
        const requestDomain = requestUrl.hostname;
        const requestPath = requestUrl.pathname;
        
        const referrerUrl = new URL(request.referrer);
        const referrerDomain = referrerUrl.hostname;
        
        // Get file extension to determine resource type
        const fileExt = requestPath.split('.').pop().toLowerCase();
        
        // Determine resource type
        let resourceType = 'api';
        if (['js', 'jsx', 'ts', 'tsx'].includes(fileExt)) {
          resourceType = 'script';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(fileExt)) {
          resourceType = 'image';
        } else if (['css', 'scss', 'less'].includes(fileExt)) {
          resourceType = 'style';
        } else if (['html', 'htm'].includes(fileExt)) {
          resourceType = 'html';
        }
        
        // Build the request flow data structure - ensure all necessary objects exist
        if (!requestFlowObj[referrerDomain]) {
          requestFlowObj[referrerDomain] = { children: {}, resources: {} };
        }
        
        // Ensure children object exists
        if (!requestFlowObj[referrerDomain].children) {
          requestFlowObj[referrerDomain].children = {};
        }
        
        if (requestDomain !== referrerDomain) {
          // Different domain - track as child
          if (!requestFlowObj[referrerDomain].children[requestDomain]) {
            requestFlowObj[referrerDomain].children[requestDomain] = { resources: {} };
          }
          
          // Ensure resources object exists for this child domain
          if (!requestFlowObj[referrerDomain].children[requestDomain].resources) {
            requestFlowObj[referrerDomain].children[requestDomain].resources = {};
          }
          
          requestFlowObj[referrerDomain].children[requestDomain].resources[requestPath] = {
            id: request.id,
            type: resourceType,
            method: request.method
          };
        } else {
          // Same domain - track as resource
          // Ensure resources object exists
          if (!requestFlowObj[requestDomain].resources) {
            requestFlowObj[requestDomain].resources = {};
          }
          
          requestFlowObj[requestDomain].resources[requestPath] = {
            id: request.id,
            type: resourceType,
            method: request.method
          };
        }
      } catch (e) {
        console.error('Error processing request for diagram:', e);
      }
    } else {
      // No referrer - add as root node
      try {
        const requestUrl = new URL(request.url);
        const requestDomain = requestUrl.hostname;
        const requestPath = requestUrl.pathname;
        
        // Get file extension to determine resource type
        const fileExt = requestPath.split('.').pop().toLowerCase();
        
        // Determine resource type
        let resourceType = 'api';
        if (['js', 'jsx', 'ts', 'tsx'].includes(fileExt)) {
          resourceType = 'script';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(fileExt)) {
          resourceType = 'image';
        } else if (['css', 'scss', 'less'].includes(fileExt)) {
          resourceType = 'style';
        } else if (['html', 'htm'].includes(fileExt)) {
          resourceType = 'html';
        }
        
        // Initialize with both children and resources objects
        if (!requestFlowObj[requestDomain]) {
          requestFlowObj[requestDomain] = { children: {}, resources: {} };
        }
        
        // Ensure resources object exists
        if (!requestFlowObj[requestDomain].resources) {
          requestFlowObj[requestDomain].resources = {};
        }
        
        requestFlowObj[requestDomain].resources[requestPath] = {
          id: request.id,
          type: resourceType,
          method: request.method
        };
      } catch (e) {
        console.error('Error processing root request for diagram:', e);
      }
    }
  });
  
  return requestFlowObj;
}

// Function to prepare network flow data for the diagram
function prepareNetworkFlowData() {
  try {
    // Build domain-resource tree
    const domainFlow = buildDomainResourceTree();
    
    return {
      requestFlow: domainFlow
    };
  } catch (error) {
    console.error('Error preparing network flow data:', error);
    return { error: error.message };
  }
}

// Reset all network data
function resetNetworkData() {
  return new Promise((resolve) => {
    // Clear all pending requests
    pendingRequests.clear();
    
    // Clear script-initiated requests
    scriptApiMap.clear();
    
    // Notify the main window that data has been reset
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('network-reset');
    }
    
    // Notify the diagram window if open
    if (diagramWindow && !diagramWindow.isDestroyed()) {
      diagramWindow.webContents.send('diagram-data', { requestFlow: {} });
    }
    
    console.log('Network data has been reset');
    resolve();
  });
}

// IPC handler to open details window
ipcMain.handle('open-details-window', (_, id) => {
  // Get request details
  let requestDetails = null;
  if (pendingRequests && pendingRequests.has(id)) {
    requestDetails = pendingRequests.get(id);
  }
  
  if (requestDetails) {
    // If we already have a details window, update it rather than recreating it
    if (detailsWindow && !detailsWindow.isDestroyed()) {
      // Send updated request details to the existing window
      detailsWindow.webContents.send('request-details', requestDetails);
      // Bring window to front
      detailsWindow.show();
      detailsWindow.focus();
      return { success: true };
    } else {
      // Create a new window
      createDetailsWindow(requestDetails);
      return { success: true };
    }
  }
  
  return { success: false, error: 'Request details not found' };
});

// IPC handler to open diagram window
ipcMain.handle('open-diagram-window', () => {
  createDiagramWindow();
  return { success: true };
});

// IPC handler for reset request
ipcMain.handle('reset-network-data', () => {
  return resetNetworkData();
});

// IPC handler to open developer tools
ipcMain.handle('open-dev-tools', () => {
  try {
    if (webViews[activeWebViewIndex] && webViews[activeWebViewIndex].webContents && !webViews[activeWebViewIndex].webContents.isDestroyed()) {
      webViews[activeWebViewIndex].webContents.openDevTools();
      return { success: true };
    }
    return { success: false, error: 'No active web view found' };
  } catch (error) {
    console.error('Error opening developer tools:', error);
    return { success: false, error: error.message };
  }
});

// Handle browser view visibility control
ipcMain.handle('hide-browser-view', () => {
  try {
    if (webViews[activeWebViewIndex] && webViews[activeWebViewIndex].webContents && !webViews[activeWebViewIndex].webContents.isDestroyed()) {
      // Hide the web view by moving it off-screen
      // We don't actually destroy it to preserve state
      const bounds = mainWindow.getBounds();
      webViews[activeWebViewIndex].setBounds({ 
        x: -2000, // Move far off-screen 
        y: -2000, 
        width: bounds.width, 
        height: bounds.height 
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error hiding browser view:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-browser-view', () => {
  try {
    if (webViews[activeWebViewIndex] && webViews[activeWebViewIndex].webContents && !webViews[activeWebViewIndex].webContents.isDestroyed()) {
      // Show the web view by restoring its position
      const bounds = mainWindow.getBounds();
      webViews[activeWebViewIndex].setBounds(getDefaultViewBound(bounds));
      
      // Check if there's any content (empty URL or about:blank)
      const currentUrl = webViews[activeWebViewIndex].webContents.getURL();
      if (!currentUrl || currentUrl === 'about:blank' || currentUrl.trim() === '') {
        webViews[activeWebViewIndex].webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(createNoResponsePage()));
      }
    }
    return { success: true };
  } catch (error) {
    console.error('Error showing browser view:', error);
    return { success: false, error: error.message };
  }
});

// Capture screenshot of the currently active web view
ipcMain.handle('capture-screenshot', async () => {
  try {
    if (activeWebViewIndex < 0 || activeWebViewIndex >= webViews.length) {
      return { success: false, error: 'No active web view found' };
    }
    
    // Capture the page as an image
    const image = await webViews[activeWebViewIndex].webContents.capturePage();
    
    // Copy to clipboard directly without adding watermark
    clipboard.writeImage(image);
    
    return { success: true, message: 'Screenshot copied to clipboard' };
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return { success: false, error: error.message };
  }
});

// Function to create a new tab
function createNewTab(url = initialUrl) {
  // Store current index before creating new tab
  const previousIndex = activeWebViewIndex;
  
  // Add a new slot in the webViews array
  activeWebViewIndex = webViews.length;
  
  // Create the new web contents view
  const newView = createWebContentsView(url);
  
  // Send tab info to renderer with initial title
  // We'll update this title once the page loads
  mainWindow.webContents.send('tab-created', {
    index: activeWebViewIndex,
    url: url,
    title: url.replace(/^https?:\/\//, '').split('/')[0] // Use domain as initial title
  });
  
  return newView;
}

// Function to remove a tab
function removeTab(index) {
  if (index < 0 || index >= webViews.length) {
    return false;
  }
  
  // Close the webview if it exists
  if (webViews[index] && webViews[index].webContents && !webViews[index].webContents.isDestroyed()) {
    try {
      webViews[index].webContents.close();
    } catch (e) {
      console.error('Error closing tab:', e);
    }
  }
  
  // Remove the tab from the array
  webViews.splice(index, 1);
  
  // Update active index if necessary
  if (webViews.length === 0) {
    // If no tabs left, create a new one
    createNewTab();
  } else if (index === activeWebViewIndex) {
    // If removing active tab, switch to the previous one or the first one
    activeWebViewIndex = Math.max(0, index - 1);
    showTab(activeWebViewIndex);
  } else if (index < activeWebViewIndex) {
    // If removing a tab before the active one, adjust the active index
    activeWebViewIndex--;
  }
  
  // Send tab removed event to renderer
  mainWindow.webContents.send('tab-removed', {
    index: index,
    activeIndex: activeWebViewIndex
  });
  
  return true;
}

// Function to switch to a specific tab
function showTab(index) {
  if (index < 0 || index >= webViews.length) {
    return false;
  }
  
  // Hide all tabs
  for (let i = 0; i < webViews.length; i++) {
    if (webViews[i] && webViews[i].webContents && !webViews[i].webContents.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      webViews[i].setBounds({ 
        x: -2000, 
        y: -2000, 
        width: bounds.width, 
        height: bounds.height 
      });
    }
  }
  
  // Show the selected tab
  if (webViews[index] && webViews[index].webContents && !webViews[index].webContents.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    webViews[index].setBounds(getDefaultViewBound(bounds));
    
    // Update the URL in renderer
    const currentUrl = webViews[index].webContents.getURL();
    if (currentUrl && currentUrl !== 'about:blank' && currentUrl.trim() !== '') {
      mainWindow.webContents.send('navigation-update', currentUrl);
    } else if (currentUrl === 'about:blank') {
      webViews[index].webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(createNoResponsePage()));
    }
  }
  
  // Update active index
  activeWebViewIndex = index;
  
  // Send tab activated event to renderer
  mainWindow.webContents.send('tab-activated', {
    index: activeWebViewIndex
  });
  
  return true;
}

// IPC handlers for tab operations
ipcMain.handle('create-tab', (_, url) => {
  createNewTab(url || initialUrl);
  return { success: true, index: activeWebViewIndex };
});

ipcMain.handle('remove-tab', (_, index) => {
  const success = removeTab(index);
  return { success };
});

ipcMain.handle('switch-tab', (_, index) => {
  const success = showTab(index);
  return { success };
});

ipcMain.handle('get-tab-info', () => {
  return {
    tabs: webViews.map((view, index) => {
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        return {
          url: view.webContents.getURL(),
          title: view.webContents.getTitle() || view.webContents.getURL().replace(/^https?:\/\//, '').split('/')[0] || 'New Tab',
          index: index
        };
      } else {
        return {
          url: 'about:blank',
          title: 'New Tab',
          index: index
        };
      }
    }),
    activeIndex: activeWebViewIndex
  };
});

// Handle technology scan
ipcMain.handle('scan-technologies', async () => {
  try {
    const results = await technologyService.scanCurrentPage(webViews, activeWebViewIndex);
    return { success: true, results };
  } catch (error) {
    console.error('Error scanning technologies:', error);
    return { success: false, error: error.message };
  }
});