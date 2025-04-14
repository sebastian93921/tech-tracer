const path = require('path');
const fs = require('fs');
const { app, net } = require('electron');
const Store = require('electron-store');

// Initialize Electron Store for settings
const store = new Store({
  name: 'app-settings',
  defaults: {
    proxy: {
      enabled: false,
      type: 'http',
      host: '',
      port: 0,
      username: '',
      password: '',
      bypassList: ''
    },
    screenshot: {
      showUrl: true
    }
  }
});

// Settings service for managing all application settings
class SettingsService {
  constructor() {
    // Load settings from store
    this.settings = {
      proxy: store.get('proxy'),
      screenshot: store.get('screenshot')
    };
  }

  // PROXY SETTINGS METHODS

  getProxySettings() {
    return { ...this.settings.proxy };
  }

  saveProxySettings(settings) {
    try {
      // Update memory and persistent store
      this.settings.proxy = { ...settings };
      store.set('proxy', settings);

      // If proxy is disabled, clear it
      const session = require('electron').session.defaultSession;
      if (!settings.enabled) {
        session.setProxy({ mode: 'direct' });
      }else{
        this.configureProxy(session, settings);
      }

      console.log('Proxy settings saved successfully');
      return { success: true };
    } catch (error) {
      console.error('Error saving proxy settings:', error);
      return { success: false, error: error.message };
    }
  }

  configureProxy(session) {
    const proxySettings = this.settings.proxy;

    if (!proxySettings.enabled || !proxySettings.host || !proxySettings.port) {
      // Clear proxy if disabled or incomplete settings
      console.log('Disabling proxy');
      session.setProxy({ mode: 'direct' })
        .then(() => console.log('Proxy disabled'))
        .catch(err => console.error('Error disabling proxy:', err));
      return;
    }

    let proxyUrl = '';
    
    // Format the proxy URL based on type
    switch (proxySettings.type) {
      case 'http':
        proxyUrl = `http://${proxySettings.host}:${proxySettings.port}`;
        break;
      case 'https':
        proxyUrl = `https://${proxySettings.host}:${proxySettings.port}`;
        break;
      case 'socks4':
        proxyUrl = `socks4://${proxySettings.host}:${proxySettings.port}`;
        break;
      case 'socks5':
        proxyUrl = `socks5://${proxySettings.host}:${proxySettings.port}`;
        break;
      default:
        proxyUrl = `http://${proxySettings.host}:${proxySettings.port}`;
    }
    
    // Add authentication if provided
    if (proxySettings.username && proxySettings.password) {
      // Insert credentials before the host in the URL
      const urlParts = proxyUrl.split('://');
      proxyUrl = `${urlParts[0]}://${proxySettings.username}:${proxySettings.password}@${urlParts[1]}`;
    }
    
    // Configure session with proxy
    const config = {
      mode: 'fixed_servers',
      proxyRules: proxyUrl
    };
    
    // Add bypass list if provided
    if (proxySettings.bypassList) {
      config.bypassList = proxySettings.bypassList.split(',').map(item => item.trim());
    }
    
    console.log('Configuring proxy:', proxyUrl);
    
    session.setProxy(config)
      .then(() => console.log('Proxy configured successfully'))
      .catch(err => console.error('Error configuring proxy:', err));
  }

  async testProxyConnection(settings) {
    return new Promise((resolve) => {
      try {
        // Get the default session
        const session = require('electron').session.defaultSession;
        
        // Temporarily set the proxy for this test
        let proxyUrl = '';
        
        switch (settings.type) {
          case 'http':
            proxyUrl = `http://${settings.host}:${settings.port}`;
            break;
          case 'https':
            proxyUrl = `https://${settings.host}:${settings.port}`;
            break;
          case 'socks4':
            proxyUrl = `socks4://${settings.host}:${settings.port}`;
            break;
          case 'socks5':
            proxyUrl = `socks5://${settings.host}:${settings.port}`;
            break;
          default:
            proxyUrl = `http://${settings.host}:${settings.port}`;
        }
        
        // Add authentication if provided
        if (settings.username && settings.password) {
          const urlParts = proxyUrl.split('://');
          proxyUrl = `${urlParts[0]}://${settings.username}:${settings.password}@${urlParts[1]}`;
        }
        
        const config = {
          mode: 'fixed_servers',
          proxyRules: proxyUrl
        };
        
        // Set the proxy for this test
        session.setProxy(config)
          .then(() => {
            console.log('Test proxy configured');
            
            // Create the request with the configured session
            const request = net.request({
              url: 'https://www.example.com',
              session: session
            });
            
            // Set timeout for the request
            const timeout = setTimeout(() => {
              request.abort();
              resolve({ success: false, error: 'Connection timed out' });
            }, 10000);
            
            request.on('response', (response) => {
              clearTimeout(timeout);
              console.log('Proxy test response:', response.statusCode);
              
              // Reset proxy settings to previous state
              if (this.settings.proxy.enabled) {
                this.configureProxy(session);
              } else {
                session.setProxy({ mode: 'direct' });
              }
              
              let responseBody = '';
              response.on('data', (chunk) => {
                responseBody += chunk.toString();
              });
              
              response.on('end', () => {
                if (response.statusCode >= 200 && response.statusCode < 400) {
                  resolve({ success: true });
                } else {
                  resolve({ success: false, error: `Received status code: ${response.statusCode}` });
                }
              });
            });
            
            request.on('error', (error) => {
              clearTimeout(timeout);
              console.error('Proxy test error:', error);
              
              // Reset proxy settings to previous state
              if (this.settings.proxy.enabled) {
                this.configureProxy(session);
              } else {
                session.setProxy({ mode: 'direct' });
              }
              
              resolve({ success: false, error: error.message });
            });
            
            request.end();
          })
          .catch(err => {
            console.error('Error configuring test proxy:', err);
            resolve({ success: false, error: err.message });
          });
      } catch (error) {
        console.error('Error testing proxy connection:', error);
        resolve({ success: false, error: error.message });
      }
    });
  }


  // SCREENSHOT SETTINGS METHODS

  getScreenshotSettings() {
    return { ...this.settings.screenshot };
  }

  saveScreenshotSettings(settings) {
    try {
      // Update memory and persistent store
      this.settings.screenshot = { ...settings };
      store.set('screenshot', settings);
      console.log('Screenshot settings saved successfully');
      return { success: true };
    } catch (error) {
      console.error('Error saving screenshot settings:', error);
      return { success: false, error: error.message };
    }
  }

  // IPC SETUP

  setupHandlers(ipcMain) {
    // Proxy settings handlers
    ipcMain.handle('get-proxy-settings', () => {
      return this.getProxySettings();
    });

    ipcMain.handle('save-proxy-settings', (_, settings) => {
      return this.saveProxySettings(settings);
    });

    ipcMain.handle('test-proxy-connection', (_, settings) => {
      return this.testProxyConnection(settings);
    });

    // Screenshot settings handlers
    ipcMain.handle('get-screenshot-settings', () => {
      return this.getScreenshotSettings();
    });

    ipcMain.handle('save-screenshot-settings', (_, settings) => {
      return this.saveScreenshotSettings(settings);
    });
  }
}

// Create and export a singleton instance
const settingsService = new SettingsService();
module.exports = settingsService; 