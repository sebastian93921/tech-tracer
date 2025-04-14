// Proxy settings elements
const enableProxyCheckbox = document.getElementById('enableProxy');
const proxyTypeSelect = document.getElementById('proxyType');
const proxyHostInput = document.getElementById('proxyHost');
const proxyPortInput = document.getElementById('proxyPort');
const proxyUsernameInput = document.getElementById('proxyUsername');
const proxyPasswordInput = document.getElementById('proxyPassword');
const bypassListInput = document.getElementById('bypassList');
const saveProxySettingsButton = document.getElementById('saveProxySettings');
const testConnectionButton = document.getElementById('testConnection');

// Screenshot settings elements
const showUrlInScreenshotCheckbox = document.getElementById('showUrlInScreenshot');

// Developer settings elements
const openDevToolsButton = document.getElementById('openDevTools');

// Load saved proxy settings from main process
async function loadProxySettings() {
  try {
    const settings = await window.electronAPI.getProxySettings();
    if (settings) {
      enableProxyCheckbox.checked = settings.enabled;
      proxyTypeSelect.value = settings.type || 'http';
      proxyHostInput.value = settings.host || '';
      proxyPortInput.value = settings.port || '';
      proxyUsernameInput.value = settings.username || '';
      proxyPasswordInput.value = settings.password || '';
      bypassListInput.value = settings.bypassList || '';
      
      // Update UI state based on whether proxy is enabled
      toggleProxyInputsState(settings.enabled);
    }
  } catch (error) {
    console.error('Error loading proxy settings:', error);
  }
}

// Save proxy settings to main process
async function saveProxySettings() {
  try {
    const settings = {
      enabled: enableProxyCheckbox.checked,
      type: proxyTypeSelect.value,
      host: proxyHostInput.value,
      port: parseInt(proxyPortInput.value, 10),
      username: proxyUsernameInput.value,
      password: proxyPasswordInput.value,
      bypassList: bypassListInput.value
    };
    
    const result = await window.electronAPI.saveProxySettings(settings);
    if (result.success) {
      alert('Proxy settings saved successfully! Changes will take effect on next page load.');
    } else {
      alert(`Error saving proxy settings: ${result.error}`);
    }
  } catch (error) {
    console.error('Error saving proxy settings:', error);
    alert(`Error saving proxy settings: ${error.message}`);
  }
}

// Toggle input fields based on proxy enabled state
function toggleProxyInputsState(enabled) {
  const inputs = [
    proxyTypeSelect,
    proxyHostInput,
    proxyPortInput,
    proxyUsernameInput,
    proxyPasswordInput,
    bypassListInput
  ];
  
  inputs.forEach(input => {
    input.disabled = !enabled;
  });
  
  testConnectionButton.disabled = !enabled;
}

// Test proxy connection
async function testProxyConnection() {
  try {
    const settings = {
      enabled: enableProxyCheckbox.checked,
      type: proxyTypeSelect.value,
      host: proxyHostInput.value,
      port: parseInt(proxyPortInput.value, 10),
      username: proxyUsernameInput.value,
      password: proxyPasswordInput.value
    };
    
    // Only test if we have host and port
    if (!settings.host || !settings.port) {
      alert('Please enter proxy host and port before testing');
      return;
    }
    
    testConnectionButton.textContent = 'Testing...';
    testConnectionButton.disabled = true;
    
    const result = await window.electronAPI.testProxyConnection(settings);
    
    if (result.success) {
      alert('Proxy connection successful!');
    } else {
      alert(`Proxy connection failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error testing proxy connection:', error);
    alert(`Error testing proxy connection: ${error.message}`);
  } finally {
    testConnectionButton.textContent = 'Test Connection';
    testConnectionButton.disabled = false;
  }
}

// Load screenshot settings
async function loadScreenshotSettings() {
  try {
    const settings = await window.electronAPI.getScreenshotSettings();
    if (settings) {
      showUrlInScreenshotCheckbox.checked = settings.showUrl !== false; // Default to true if not specified
    }
  } catch (error) {
    console.error('Error loading screenshot settings:', error);
  }
}

// Save screenshot settings
async function saveScreenshotSettings() {
  try {
    const settings = {
      showUrl: showUrlInScreenshotCheckbox.checked
    };
    
    const result = await window.electronAPI.saveScreenshotSettings(settings);
    if (result && result.success) {
      console.log('Screenshot settings saved successfully');
    }
  } catch (error) {
    console.error('Error saving screenshot settings:', error);
  }
}

// Initialize settings module
function initSettingsModule() {
  // Add event listeners for proxy settings
  enableProxyCheckbox.addEventListener('change', () => {
    toggleProxyInputsState(enableProxyCheckbox.checked);
  });

  saveProxySettingsButton.addEventListener('click', saveProxySettings);
  testConnectionButton.addEventListener('click', testProxyConnection);

  // Add event listener for screenshot settings
  showUrlInScreenshotCheckbox.addEventListener('change', saveScreenshotSettings);
  
  // Add event listener for dev tools button
  openDevToolsButton.addEventListener('click', () => {
    window.electronAPI.openDevTools();
  });

  // Initial state setup for proxy inputs
  toggleProxyInputsState(enableProxyCheckbox.checked);

  // Load settings
  loadProxySettings();
  loadScreenshotSettings();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initSettingsModule();
}); 