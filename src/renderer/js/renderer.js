// DOM Elements
const urlInput = document.getElementById('urlInput');
const urlProtocol = document.querySelector('.url-protocol');
const urlDomain = document.querySelector('.url-domain');
const launchButton = document.getElementById('launchButton');
const reloadButton = document.querySelector('.reload-button');
const backButton = document.querySelector('.back-button');
const forwardButton = document.querySelector('.forward-button');
const networkPanel = document.getElementById('networkPanel');
const networkSearchFilter = document.getElementById('networkSearchFilter');
const clearNetworkFilter = document.getElementById('clearNetworkFilter');
const settingsPanel = document.getElementById('settingsPanel');
const technologyPanel = document.getElementById('technologyPanel');
const scanResults = document.getElementById('scanResults');
const detailsPanel = document.getElementById('detailsPanel');
const detailsClose = document.getElementById('detailsClose');
const panelTabs = document.querySelectorAll('.panel-tab');
const resetButton = document.getElementById('resetButton');
const screenshotButton = document.getElementById('screenshotButton');
const tabBar = document.querySelector('.tab-bar');
const newTabButton = document.querySelector('.new-tab-button');

// URL history management
let currentUrl = 'about:blank';
let urlHistory = [];
let historyIndex = 0;

// Network request tracking
const networkRequests = new Map();
// We'll keep track of the flow in the main process now
// const requestFlow = new Map(); // Tracks relationships between requests

// Tab management state
const tabs = [];
let activeTabIndex = 0;

// Create a new tab element
function createTabElement(tabInfo) {
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.dataset.index = tabInfo.index;
  
  if (tabInfo.index === activeTabIndex) {
    tabElement.classList.add('active');
  }
  
  const tabTitle = document.createElement('span');
  tabTitle.className = 'tab-title';
  tabTitle.textContent = tabInfo.title || 'New Tab';
  
  const closeButton = document.createElement('button');
  closeButton.className = 'tab-close';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    removeTab(parseInt(tabElement.dataset.index));
  });
  
  tabElement.appendChild(tabTitle);
  tabElement.appendChild(closeButton);
  
  // Click handler to switch tabs
  tabElement.addEventListener('click', () => {
    switchTab(parseInt(tabElement.dataset.index));
  });
  
  return tabElement;
}

// Add a new tab
async function addTab(url) {
  try {
    const result = await window.electronAPI.createTab(url);
    if (result.success) {
      return result.index;
    }
  } catch (error) {
    console.error('Error creating tab:', error);
  }
  return -1;
}

// Remove a tab
async function removeTab(index) {
  try {
    const result = await window.electronAPI.removeTab(index);
    return result.success;
  } catch (error) {
    console.error('Error removing tab:', error);
    return false;
  }
}

// Switch to a tab
async function switchTab(index) {
  try {
    const result = await window.electronAPI.switchTab(index);
    if (result.success) {
      // Update active tab in UI
      document.querySelectorAll('.tab').forEach(tab => {
        if (parseInt(tab.dataset.index) === index) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
      activeTabIndex = index;
    }
    return result.success;
  } catch (error) {
    console.error('Error switching tab:', error);
    return false;
  }
}

// Update tab UI from tab info
function updateTabsUI(tabsInfo) {
  // Clear existing tabs except the new tab button
  while (tabBar.firstChild && tabBar.firstChild !== newTabButton) {
    tabBar.removeChild(tabBar.firstChild);
  }
  
  // Add tab elements
  tabsInfo.tabs.forEach(tab => {
    const tabElement = createTabElement(tab);
    tabBar.insertBefore(tabElement, newTabButton);
  });
  
  activeTabIndex = tabsInfo.activeIndex;
}

// Event listeners for tab events
window.electronAPI.onTabCreated(data => {
  tabs[data.index] = {
    url: data.url,
    title: data.title,
    index: data.index
  };
  
  // Update UI
  const tabElement = createTabElement(data);
  tabBar.insertBefore(tabElement, newTabButton);
  
  // Switch to the new tab
  switchTab(data.index);
});

window.electronAPI.onTabRemoved(data => {
  // Remove from our local array
  tabs.splice(data.index, 1);
  
  // Refresh the UI
  window.electronAPI.getTabInfo().then(updateTabsUI);
});

window.electronAPI.onTabActivated(data => {
  activeTabIndex = data.index;
  
  // Update UI
  document.querySelectorAll('.tab').forEach(tab => {
    if (parseInt(tab.dataset.index) === data.index) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
});

// Listen for tab title updates
window.electronAPI.onTabTitleUpdated(data => {
  // Update our local data
  if (tabs[data.index]) {
    tabs[data.index].title = data.title;
  }
  
  // Update UI - find the tab element and update its title
  const tabElement = findTabElementByIndex(data.index);
  if (tabElement) {
    const titleElement = tabElement.querySelector('.tab-title');
    if (titleElement) {
      titleElement.textContent = data.title || 'New Tab';
    }
  }
});

// Helper function to find tab element by index
function findTabElementByIndex(index) {
  return Array.from(document.querySelectorAll('.tab')).find(
    tab => parseInt(tab.dataset.index) === index
  );
}

// New tab button
newTabButton.addEventListener('click', () => {
  addTab('about:blank');
});

// Network flow tracking no longer needed in renderer
// Function trackRequestFlow() removed
// Function generateFlowDiagram() removed

// Add network request to panel
function addNetworkActivity(data) {
  // We no longer need to track request flow in the renderer
  // trackRequestFlow(data);
  
  if (data.type === 'request') {
    // Store request timing
    networkRequests.set(data.url, {
      id: data.id,
      method: data.method,
      startTime: data.timestamp
    });
    
    // Create request element
    const requestEl = document.createElement('div');
    requestEl.className = 'network-item';
    requestEl.id = `req-${data.id}`;
    requestEl.dataset.id = data.id;
    requestEl.innerHTML = `
      <span class="method">${data.method}</span>
      <span class="url">${data.url}</span>
    `;
    
    // Add click handler to open new window
    requestEl.addEventListener('click', () => {
      window.electronAPI.openDetailsWindow(data.id);
    });
    
    networkPanel.appendChild(requestEl);
    
    // Apply current filter to the new item
    if (networkSearchFilter.value) {
      const filterText = networkSearchFilter.value.toLowerCase();
      const url = data.url.toLowerCase();
      if (!url.includes(filterText)) {
        requestEl.style.display = 'none';
      }
    }
  } else if (data.type === 'response') {
    // Get request timing
    const request = networkRequests.get(data.url);
    if (request) {
      const duration = data.timestamp - request.startTime;
      
      // Update request element
      const requestEl = document.getElementById(`req-${data.id}`);
      if (requestEl) {
        requestEl.innerHTML = `
          <span class="method">${request.method}</span>
          <span class="status">${data.statusCode}</span>
          <span class="duration">${duration}ms</span>
          <span class="url">${data.url}</span>
        `;
        
        // Re-apply current filter after updating content
        if (networkSearchFilter.value) {
          const filterText = networkSearchFilter.value.toLowerCase();
          const url = data.url.toLowerCase();
          if (!url.includes(filterText)) {
            requestEl.style.display = 'none';
          } else {
            requestEl.style.display = 'block';
          }
        }
      }
      
      // Clean up request tracking
      networkRequests.delete(data.url);
    }
  }
  
  // Auto-scroll to bottom
  networkPanel.scrollTop = networkPanel.scrollHeight;
}

// Close details panel
detailsClose.addEventListener('click', () => {
  detailsPanel.classList.remove('visible');
});

// Technology scanner
function renderTechnologyResults(data) {
  scanResults.innerHTML = '';
  
  if (data.error) {
    scanResults.innerHTML = `<div class="scan-error">Error: ${data.error}</div>`;
    return;
  }
  
  if (!data.results || !data.results.technologies || Object.keys(data.results.technologies).length === 0) {
    scanResults.innerHTML = '<div class="scan-placeholder">No technologies detected on this page.</div>';
    return;
  }
  
  const url = data.results.url;
  const domain = data.results.domain;

  // Total count of technologies scanned
  let totalTechCount = 0;
  Object.values(data.results.technologies).forEach(techs => {
    totalTechCount += techs.length;
  });
  
  // Add domain info
  const domainInfo = document.createElement('div');
  domainInfo.className = 'domain-info';
  domainInfo.innerHTML = `
    <h3>Technology Scan (${totalTechCount})</h3>
    <p class="scan-url">${url}</p>
    ${data.automatic ? '<p class="scan-auto-note">Auto-detected when page loaded</p>' : ''}
  `;
  scanResults.appendChild(domainInfo);
  
  // Add technologies by category
  for (const [category, technologies] of Object.entries(data.results.technologies)) {
    const categoryElement = document.createElement('div');
    categoryElement.className = 'tech-category';
    
    const categoryTitle = document.createElement('div');
    categoryTitle.className = 'tech-category-title';
    categoryTitle.textContent = category;
    categoryElement.appendChild(categoryTitle);
    
    // Sort technologies alphabetically
    technologies.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const tech of technologies) {
      const techElement = document.createElement('div');
      techElement.className = 'tech-item';
      
      // Create icon
      const iconElement = document.createElement('div');
      iconElement.className = 'tech-icon';
      
      // Use first letter as fallback
      const firstLetter = tech.name.charAt(0).toUpperCase();
      iconElement.textContent = firstLetter;
      
      // Add name and version together
      const nameElement = document.createElement('div');
      nameElement.className = 'tech-name';
      
      if (tech.version) {
        // Display with version
        nameElement.innerHTML = `${tech.name} <span class="tech-version-inline">${tech.version}</span>`;
      } else {
        nameElement.textContent = tech.name;
      }
      
      techElement.appendChild(iconElement);
      techElement.appendChild(nameElement);
      
      categoryElement.appendChild(techElement);
    }
    
    scanResults.appendChild(categoryElement);
  }
}

// Tab switching for panel tabs
panelTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    // Deactivate all tabs
    panelTabs.forEach(t => t.classList.remove('active'));
    
    // Activate the clicked tab
    tab.classList.add('active');
    
    // Hide panels
    settingsPanel.classList.remove('active');
    
    // Show the corresponding panel
    if (index === 0) {
      // Network tab
      networkPanel.classList.add('active');
      technologyPanel.classList.remove('active');
      // Show the browser view
      window.electronAPI.showBrowserView();
    } else if (index === 1) {
      // Diagram tab - open diagram window
      window.electronAPI.openDiagramWindow();
    } else if (index === 2) {
      // Technology scan tab
      technologyPanel.classList.add('active');
      networkPanel.classList.remove('active');
      // Show the browser view
      window.electronAPI.showBrowserView();
    } else if (index === 3) {
      // Settings tab
      settingsPanel.classList.add('active');
      // Hide the browser view when settings tab is active
      window.electronAPI.hideBrowserView();
      loadProxySettings(); // Load current settings when tab is selected
    }
  });
});

// Tab switching for details panel
document.querySelectorAll('.section-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Deactivate all tabs in this section
    const section = tab.closest('.section-tabs');
    section.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    
    // Activate this tab
    tab.classList.add('active');
    
    // Show the corresponding view
    const target = tab.dataset.target;
    const content = section.closest('.request-section, .response-section').querySelector('.section-content');
    content.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
    document.getElementById(target).classList.add('active');
  });
});

// Listen for network activity
window.electronAPI.onNetworkActivity(addNetworkActivity);

// Listen for initial URL from command line arguments
window.electronAPI.onInitialUrl((url) => {
  if (url) {
    // Update URL input
    urlInput.value = url;
    // Update URL display
    updateUrlDisplay(url);
    // Update history
    currentUrl = url;
    urlHistory = [url];
    historyIndex = 0;
    updateNavigationButtons();
  }
});

// Network activity updates are now handled in the main process
// window.electronAPI.onNetworkActivityUpdate((data) => { ... });

// Initialize the UI
async function initializeUI() {
  try {
    // Initialize tabs
    const tabInfo = await window.electronAPI.getTabInfo();
    updateTabsUI(tabInfo);
    
    // Focus on the URL input
    urlInput.focus();
    urlInput.select();
    updateNavigationButtons();
  } catch (error) {
    console.error('Error initializing UI:', error);
  }
}

// Ensure URL has a protocol
function ensureProtocol(url) {
  if (!url) return '';
  
  if (!/^[a-zA-Z]+:\/\//.test(url)) {
    return 'https://' + url;
  }
  
  return url;
}

// Update the state of navigation buttons
function updateNavigationButtons() {
  backButton.style.opacity = historyIndex > 0 ? '1' : '0.5';
  forwardButton.style.opacity = historyIndex < urlHistory.length - 1 ? '1' : '0.5';
}

// Add URL to history
function addToHistory(url) {
  // If we're not at the end of history, truncate the future URLs
  if (historyIndex < urlHistory.length - 1) {
    urlHistory = urlHistory.slice(0, historyIndex + 1);
  }
  
  // Add the new URL and update index
  urlHistory.push(url);
  historyIndex = urlHistory.length - 1;
  currentUrl = url;
  
  updateNavigationButtons();
}

// Function to update the URL display with colored protocol
function updateUrlDisplay(url) {
  if (!url) {
    urlProtocol.textContent = '';
    urlDomain.textContent = '';
    return;
  }
  
  // Parse URL to separate protocol and domain
  let protocol = '';
  let domain = url;
  
  if (url.match(/^[a-zA-Z]+:\/\//)) {
    const parts = url.split('://');
    protocol = parts[0] + '://';
    domain = parts[1];
  } else {
    protocol = '';
  }
  
  urlProtocol.textContent = protocol;
  urlDomain.textContent = domain;
}

// Load a URL in the browser view
async function loadUrl(url) {
  if (!url) return;
  
  try {
    const fullUrl = ensureProtocol(url);
    await window.electronAPI.loadUrl(fullUrl);
    
    // Add to history if it's a new URL
    if (fullUrl !== currentUrl) {
      addToHistory(fullUrl);
    }
    
    // Update UI
    urlInput.value = fullUrl;
    updateUrlDisplay(fullUrl);
  } catch (error) {
    console.error('Error loading URL:', error);
  }
}

// Navigate back in history
async function goBack() {
  if (historyIndex > 0) {
    historyIndex--;
    currentUrl = urlHistory[historyIndex];
    await window.electronAPI.loadUrl(currentUrl);
    urlInput.value = currentUrl;
    updateUrlDisplay(currentUrl);
    updateNavigationButtons();
  }
}

// Navigate forward in history
async function goForward() {
  if (historyIndex < urlHistory.length - 1) {
    historyIndex++;
    currentUrl = urlHistory[historyIndex];
    await window.electronAPI.loadUrl(currentUrl);
    urlInput.value = currentUrl;
    updateUrlDisplay(currentUrl);
    updateNavigationButtons();
  }
}

// Add click event listener to launch button
launchButton.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  
  // Validate URL
  if (!url) {
    alert('Please enter a valid URL');
    return;
  }
  
  await loadUrl(url);
});

// Add click event listener to reload button
reloadButton.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (url) {
    await loadUrl(ensureProtocol(url));
  }
});

// Add click event listener to back button
backButton.addEventListener('click', async () => {
  await goBack();
});

// Add click event listener to forward button
forwardButton.addEventListener('click', async () => {
  await goForward();
});

// Focus styling for URL input
urlInput.addEventListener('focus', () => {
  urlInput.select(); // Select all text when focused
});

// Update URL display when input loses focus
urlInput.addEventListener('blur', () => {
  const url = urlInput.value;
  updateUrlDisplay(url);
});

// Listen for keydown events on the URL input field
urlInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    // For Enter key, ensure protocol before navigating
    const fullUrl = ensureProtocol(urlInput.value.trim());
    urlInput.value = fullUrl;
    updateUrlDisplay(fullUrl);
    launchButton.click();
  }
});

// Add input event to update the URL display while typing
urlInput.addEventListener('input', () => {
  const url = urlInput.value;
  if (document.activeElement !== urlInput) {
    updateUrlDisplay(url);
  }
});

// Reset button click handler
resetButton.addEventListener('click', async () => {
  // Confirm before resetting
  if (confirm('Are you sure you want to clear all network data?')) {
    await window.electronAPI.resetNetworkData();
  }
});

// Screenshot button click handler
screenshotButton.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.captureScreenshot();
    if (result.success) {
      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'notification';
      notification.textContent = 'Screenshot copied to clipboard';
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 500);
      }, 3000);
    } else {
      console.error('Error capturing screenshot:', result.error);
      alert(`Failed to capture screenshot: ${result.error}`);
    }
  } catch (error) {
    console.error('Screenshot error:', error);
    alert('Failed to capture screenshot. See console for details.');
  }
});

// Listen for network reset events
window.electronAPI.onNetworkReset(() => {
  // Clear the network panel
  networkPanel.innerHTML = '';
  
  // Clear the network requests map
  networkRequests.clear();
  
  console.log('Network data has been reset');
});

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  
  // Initial URL display update
  updateUrlDisplay(urlInput.value);
});

// Listen for navigation updates from the main process
window.electronAPI.onNavigationUpdate(url => {
  // Normalize URLs for comparison (in case of trailing slashes, protocol differences, etc)
  const normalizedCurrentUrl = normalizeUrl(currentUrl);
  const normalizedNewUrl = normalizeUrl(url);
  
  // Add to history if it's a new URL
  if (normalizedNewUrl !== normalizedCurrentUrl) {
    addToHistory(url);
    urlInput.value = url;
    updateUrlDisplay(url);
    updateNavigationButtons();
    console.log('Navigation updated to:', url);
    
    // Show "Scanning..." in the technology panel when navigation happens
    if (!technologyPanel.classList.contains('active')) {
      // Add a small indicator that scanning is happening in the background
      const scanIndicator = document.createElement('div');
      scanIndicator.className = 'scan-indicator';
      scanIndicator.textContent = 'Scanning...';
      panelTabs[2].appendChild(scanIndicator);
      
      // Remove after scanning completes or times out
      setTimeout(() => {
        const indicator = panelTabs[2].querySelector('.scan-indicator');
        if (indicator) indicator.remove();
      }, 5000);
    } else {
      // If the tech panel is visible, show the loading indicator
      scanResults.innerHTML = `
        <div class="loading-indicator">
          <div class="loading-spinner"></div>
          <div>Scanning technologies...</div>
        </div>
      `;
    }
  }
});

// Listen for automatic technology scan results
window.electronAPI.onTechScanResults(response => {
  // Update the technology panel with results
  renderTechnologyResults(response);
  
  // Remove any scan indicator from the tab
  const indicator = panelTabs[2].querySelector('.scan-indicator');
  if (indicator) indicator.remove();
});

function normalizeUrl(url) {
  if (!url) return '';
  try {
    // If URL starts with data:
    if (url.startsWith('https://data:') || 
        url.startsWith('http://data:') || 
        url.startsWith('data:')) {
      return url;
    }
    // Create URL object to standardize format
    const urlObj = new URL(ensureProtocol(url));
    // Return hostname + pathname (ignoring hash and query for now)
    return urlObj.hostname + urlObj.pathname;
  } catch (e) {
    // If URL is not valid, return empty string
    console.error('Error normalizing URL:', e);
    return url;
  }
}

// Load proxy settings code has been moved to settings-renderer.js 

// Function to filter network items
function filterNetworkItems() {
  const filterText = networkSearchFilter.value.toLowerCase();
  const networkItems = document.querySelectorAll('.network-item');
  
  networkItems.forEach(item => {
    const urlElement = item.querySelector('.url');
    if (!urlElement) return;
    
    const url = urlElement.textContent.toLowerCase();
    
    if (filterText === '' || url.includes(filterText)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

// Network filter input event
networkSearchFilter.addEventListener('input', filterNetworkItems);

// Clear filter button
clearNetworkFilter.addEventListener('click', () => {
  networkSearchFilter.value = '';
  filterNetworkItems();
  networkSearchFilter.focus();
});

// Keyboard support for network filter
networkSearchFilter.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    // Clear filter on Escape key
    networkSearchFilter.value = '';
    filterNetworkItems();
  } else if (event.key === 'Enter') {
    // Focus first visible item on Enter key
    const firstVisibleItem = Array.from(document.querySelectorAll('.network-item'))
      .find(item => item.style.display !== 'none');
    
    if (firstVisibleItem) {
      firstVisibleItem.focus();
      firstVisibleItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}); 