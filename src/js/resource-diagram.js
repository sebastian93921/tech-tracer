// Initialize the diagram page
let zoomLevel = 100;
let treeData = null;
let currentFilter = 'all';
let deduplicatedResources = new Map(); // Map to store deduplicated resources
let diagramBackgroundPort = null;

document.addEventListener('DOMContentLoaded', () => {
  // Establish a persistent connection with the background script
  connectToBackground();
  
  // Add event listeners for diagram controls
  document.getElementById('refreshDiagramBtn').addEventListener('click', loadResourceData);
  document.getElementById('resetDiagramBtn').addEventListener('click', resetView);
  document.getElementById('zoomInBtn').addEventListener('click', () => changeZoom(10));
  document.getElementById('zoomOutBtn').addEventListener('click', () => changeZoom(-10));
  
  // Add filter button event listeners
  const filterButtons = document.querySelectorAll('.filter-button');
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Update active button
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Apply filter
      currentFilter = button.dataset.filter;
      if (treeData) {
        generateResourceTree(treeData.domainTree);
      }
    });
  });
  
  // Initially we don't need to load diagram data as it might not be visible
  // It will be loaded when user clicks on the diagram tab
});

// Establish a persistent connection with the background script
function connectToBackground() {
  try {
    // Create a unique connection ID
    const connectionId = 'diagram_' + Date.now();
    
    // Connect to the background script
    diagramBackgroundPort = chrome.runtime.connect({ name: connectionId });
    
    // Listen for messages from the background
    diagramBackgroundPort.onMessage.addListener(handleBackgroundMessage);
    
    // Handle disconnection
    diagramBackgroundPort.onDisconnect.addListener(() => {
      console.log('Connection to background lost, attempting to reconnect...');
      diagramBackgroundPort = null;
      
      // Attempt to reconnect after a short delay
      setTimeout(connectToBackground, 1000);
    });
    
    // Register with the background script
    chrome.runtime.sendMessage({ action: 'register-client' }, response => {
      if (chrome.runtime.lastError) {
        console.log('Failed to register with background:', chrome.runtime.lastError.message);
      } else if (response && response.registered) {
        console.log('Successfully registered with background script');
      }
    });
  } catch (error) {
    console.error('Error connecting to background:', error);
    diagramBackgroundPort = null;
  }
}

// Handle messages from the background script
function handleBackgroundMessage(message) {
  if (message.action === 'resource-data') {
    treeData = message.resourceData;
    generateResourceTree(treeData.domainTree);
  }
}

// Check if the background connection is available
async function checkBackgroundConnection() {
  try {
    // Ping the background page with a simple message
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'ping' }, response => {
        if (chrome.runtime.lastError) {
          console.error('Background connection check failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
      
      // Set a timeout in case the message doesn't get a response
      setTimeout(() => {
        resolve(false);
      }, 1000);
    });
  } catch (error) {
    console.error('Error checking background connection:', error);
    return false;
  }
}

// Load resource data from background
function loadResourceData() {
  try {
    if (diagramBackgroundPort) {
      // Use persistent connection
      diagramBackgroundPort.postMessage({ action: 'get-resource-diagram-data' });
    } else {
      // Attempt to reconnect first
      connectToBackground();
      
      // Fall back to one-time message with error handling
      chrome.runtime.sendMessage({ action: 'get-resource-diagram-data' }, response => {
        if (chrome.runtime.lastError) {
          console.error('Connection error:', chrome.runtime.lastError.message);
          showErrorMessage('Could not connect to background page. Please refresh the extension.');
          return;
        }
        
        if (response && response.resourceData) {
          treeData = response.resourceData;
          generateResourceTree(treeData.domainTree);
        } else {
          showErrorMessage('No resource data available. Try browsing some websites first.');
        }
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    showErrorMessage('Connection error. Please try refreshing the page.');
  }
}

// Reset view
function resetView() {
  zoomLevel = 100;
  currentFilter = 'all';
  
  // Reset filter buttons
  const filterButtons = document.querySelectorAll('.filter-button');
  filterButtons.forEach(btn => btn.classList.remove('active'));
  document.getElementById('filterAll').classList.add('active');
  
  updateZoomDisplay();
  
  // Clear the tree display if no data or refresh with current data
  if (treeData) {
    generateResourceTree(treeData.domainTree);
  } else {
    const resourceTree = document.getElementById('resourceTree');
    resourceTree.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">No resource data available</div>';
  }
}

// Change zoom level
function changeZoom(change) {
  zoomLevel += change;
  
  // Limit zoom between 30% and 200%
  zoomLevel = Math.max(30, Math.min(200, zoomLevel));
  
  updateZoomDisplay();
}

// Update zoom display
function updateZoomDisplay() {
  document.getElementById('zoomLevel').textContent = `${zoomLevel}%`;
  document.getElementById('resourceTree').style.transform = `scale(${zoomLevel / 100})`;
  document.getElementById('resourceTree').style.transformOrigin = 'top left';
}

// Determine resource type based on URL and content-type
function determineResourceType(request) {
  const url = request.url.toLowerCase();
  const contentType = request.responseHeaders && request.responseHeaders['content-type'] 
    ? request.responseHeaders['content-type'].toLowerCase() 
    : '';
  
  // Check if it's an API request
  if (
    url.includes('/api/') || 
    url.includes('graphql') || 
    url.includes('/rest/') || 
    url.includes('/v1/') || 
    url.includes('/v2/') ||
    (request.type === 'xmlhttprequest') ||
    url.includes('/cdn-cgi/') ||
    contentType.includes('application/json') ||
    contentType.includes('application/xml')
  ) {
    return 'api';
  }
  
  // Check if it's a script
  if (
    url.endsWith('.js') || 
    url.endsWith('.jsx') || 
    url.endsWith('.ts') || 
    url.endsWith('.tsx') ||
    contentType.includes('javascript') ||
    request.type === 'script'
  ) {
    return 'script';
  }
  
  // Check if it's HTML
  if (
    url.endsWith('.html') || 
    url.endsWith('.htm') ||
    contentType.includes('text/html') ||
    request.type === 'document'
  ) {
    return 'html';
  }
  
  // Check if it's CSS
  if (
    url.endsWith('.css') ||
    contentType.includes('text/css') ||
    request.type === 'stylesheet'
  ) {
    return 'css';
  }
  
  // Check if it's an image
  if (
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg') ||
    url.endsWith('.png') ||
    url.endsWith('.gif') ||
    url.endsWith('.svg') ||
    url.endsWith('.webp') ||
    url.endsWith('.ico') ||
    contentType.includes('image/') ||
    request.type === 'image'
  ) {
    return 'image';
  }
  
  // Otherwise, it's other
  return 'other';
}

// Generate the resource tree visualization
function generateResourceTree(treeData) {
  // Clear previous tree
  const resourceTree = document.getElementById('resourceTree');
  resourceTree.innerHTML = '';
  
  // If there's no data, show a message
  if (!treeData || !treeData.children || treeData.children.length === 0) {
    resourceTree.innerHTML = '<div style="text-align: center; padding: 50px; color: #888;">No resource data available</div>';
    return;
  }
  
  // Sort domains for consistency
  const domains = [...treeData.children].sort((a, b) => a.name.localeCompare(b.name));
  
  // Create tooltip element or use existing one
  let tooltip = document.querySelector('.tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }
  
  // First, deduplicate the resources across all domains
  deduplicatedResources = new Map();
  
  domains.forEach(domain => {
    if (domain.children && domain.children.length > 0) {
      domain.children.forEach(typeNode => {
        if (typeNode.children && typeNode.children.length > 0) {
          typeNode.children.forEach(resource => {
            if (resource.request) {
              const request = resource.request;
              const key = `${request.method}-${request.url}`;
              
              if (!deduplicatedResources.has(key)) {
                // Add resource type
                request.resourceType = determineResourceType(request);
                deduplicatedResources.set(key, request);
              }
            }
          });
        }
      });
    }
  });
  
  // Process each domain with deduplicated resources
  domains.forEach(domain => {
    const domainResources = [];
    
    // Collect resources for this domain
    for (const request of deduplicatedResources.values()) {
      try {
        const url = new URL(request.url);
        if (url.hostname === domain.name) {
          // Only add if it matches the current filter
          if (currentFilter === 'all' || request.resourceType === currentFilter) {
            domainResources.push(request);
          }
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
    
    // Skip domains with no resources after filtering
    if (domainResources.length === 0) {
      return;
    }
    
    // Create domain element
    const domainEl = document.createElement('div');
    domainEl.className = 'domain-item';
    
    const domainHeader = document.createElement('div');
    domainHeader.className = 'domain-header';
    domainHeader.textContent = `${domain.name} `;
    
    // Add resource count
    const countSpan = document.createElement('span');
    countSpan.className = 'resource-count';
    countSpan.textContent = `(${domainResources.length} resources)`;
    domainHeader.appendChild(countSpan);
    
    domainEl.appendChild(domainHeader);
    
    // Create container for resources
    const resourcesContainer = document.createElement('div');
    resourcesContainer.className = 'resources-container';
    
    // Sort resources by URL for better organization
    domainResources.sort((a, b) => a.url.localeCompare(b.url));
    
    // Create tree items for each resource
    domainResources.forEach(request => {
      const resourceItem = createResourceItem(request);
      resourcesContainer.appendChild(resourceItem);
    });
    
    domainEl.appendChild(resourcesContainer);
    resourceTree.appendChild(domainEl);
  });
  
  // Apply zoom after generating the tree
  updateZoomDisplay();
}

// Create a resource item element
function createResourceItem(request) {
  const resourceItem = document.createElement('div');
  resourceItem.className = `resource-item resource-type-${request.resourceType}`;
  
  // Create method tag
  const methodTag = document.createElement('span');
  methodTag.className = `method-tag method-${request.method.toLowerCase()}`;
  methodTag.textContent = request.method;
  resourceItem.appendChild(methodTag);
  
  // Get path from URL
  let path = '';
  try {
    const url = new URL(request.url);
    path = url.pathname + url.search;
  } catch (e) {
    path = request.url;
  }
  
  // Create path text
  const pathText = document.createElement('span');
  pathText.className = 'path-text';
  pathText.textContent = path;
  pathText.title = "Click to open URL in new tab";
  
  // Add click handler to open the URL
  pathText.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent any parent handlers from being executed
    window.open(request.url, '_blank');
  });
  
  resourceItem.appendChild(pathText);
  
  // Add resource type indicator
  const typeIndicator = document.createElement('span');
  typeIndicator.className = 'resource-count';
  typeIndicator.textContent = `[${request.resourceType}]`;
  resourceItem.appendChild(typeIndicator);
  
  // Add a "link" indicator
  const linkIndicator = document.createElement('span');
  linkIndicator.innerHTML = ' <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
  linkIndicator.style.color = '#3498db';
  linkIndicator.style.marginLeft = '5px';
  linkIndicator.style.opacity = '0.7';
  resourceItem.appendChild(linkIndicator);
  
  // Add hover effect with tooltip
  resourceItem.addEventListener('mouseover', e => {
    resourceItem.style.backgroundColor = 'rgba(100, 100, 100, 0.2)';
    
    const tooltip = document.querySelector('.tooltip');
    tooltip.innerHTML = `
      <div class="tooltip-row">
        <div class="tooltip-label">URL:</div>
        <div class="tooltip-value">${request.url}</div>
      </div>
      <div class="tooltip-row">
        <div class="tooltip-label">Method:</div>
        <div class="tooltip-value">${request.method}</div>
      </div>
      <div class="tooltip-row">
        <div class="tooltip-label">Status:</div>
        <div class="tooltip-value">${request.statusCode || '-'}</div>
      </div>
      <div class="tooltip-row">
        <div class="tooltip-label">Type:</div>
        <div class="tooltip-value">${request.type || 'unknown'}</div>
      </div>
      <div class="tooltip-row">
        <div class="tooltip-label">Resource Type:</div>
        <div class="tooltip-value">${request.resourceType}</div>
      </div>
      <div class="tooltip-row">
        <div class="tooltip-label">Time:</div>
        <div class="tooltip-value">${request.timing.duration ? Math.round(request.timing.duration) + 'ms' : '-'}</div>
      </div>
      <div class="tooltip-row">
        <div class="tooltip-label">Initiator:</div>
        <div class="tooltip-value">${request.initiator || 'Unknown'}</div>
      </div>
    `;
    
    tooltip.style.display = 'block';
    document.addEventListener('mousemove', positionTooltip);
  });
  
  resourceItem.addEventListener('mouseout', () => {
    resourceItem.style.backgroundColor = 'transparent';
    
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
      document.removeEventListener('mousemove', positionTooltip);
    }
  });
  
  return resourceItem;
}

// Position tooltip near the mouse
function positionTooltip(e) {
  const tooltip = document.querySelector('.tooltip');
  if (!tooltip) return;
  
  const x = e.clientX + 15;
  const y = e.clientY + 15;
  
  // Keep tooltip on screen
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Adjust position to keep tooltip on screen
  const posX = Math.min(x, windowWidth - tooltipWidth - 10);
  const posY = Math.min(y, windowHeight - tooltipHeight - 10);
  
  tooltip.style.left = posX + 'px';
  tooltip.style.top = posY + 'px';
}

// Show error message in the tree area
function showErrorMessage(message) {
  const resourceTree = document.getElementById('resourceTree');
  resourceTree.innerHTML = `
    <div style="text-align: center; padding: 50px; color: #888;">
      <div style="margin-bottom: 15px;">${message}</div>
      <button id="retryBtn" class="button">Retry Connection</button>
    </div>
  `;
  
  // Add retry button functionality
  document.getElementById('retryBtn').addEventListener('click', loadResourceData);
} 