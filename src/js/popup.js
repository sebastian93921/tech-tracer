// Store reference to the selected request
let selectedRequestId = null;
let requestsList = [];
let backgroundPort = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Establish a persistent connection with the background script
  connectToBackground();
  
  // Add event listeners
  document.getElementById('clearBtn').addEventListener('click', clearRequests);
  document.getElementById('requestFilter').addEventListener('input', filterRequests);
  
  // Setup tab functionality for request details
  setupDetailsTabs();
  
  // Setup main tab navigation
  setupMainTabs();
  
  // Load initial data
  loadRequests();
  
  // Setup periodic updates
  setInterval(loadRequests, 2000);
});

// Establish a persistent connection with the background script
function connectToBackground() {
  try {
    // Create a unique connection ID
    const connectionId = 'popup_' + Date.now();
    
    // Connect to the background script
    backgroundPort = chrome.runtime.connect({ name: connectionId });
    
    // Listen for messages from the background
    backgroundPort.onMessage.addListener(handleBackgroundMessage);
    
    // Handle disconnection
    backgroundPort.onDisconnect.addListener(() => {
      console.log('Connection to background lost, attempting to reconnect...');
      
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
  }
}

// Handle messages from the background script
function handleBackgroundMessage(message) {
  if (message.action === 'requests-data') {
    requestsList = message.requests;
    updateRequestList(requestsList);
  } else if (message.action === 'requests-cleared') {
    requestsList = [];
    updateRequestList(requestsList);
  } else if (message.action === 'request-details') {
    if (message.request) {
      showRequestDetails(message.request);
    }
  } else if (message.action === 'resource-data') {
    // Handle resource diagram data if needed
  }
}

// Setup main tab navigation
function setupMainTabs() {
  const requestsTabBtn = document.getElementById('requestsTabBtn');
  const diagramTabBtn = document.getElementById('diagramTabBtn');
  const requestsTab = document.getElementById('requestsTab');
  const diagramTab = document.getElementById('diagramTab');
  
  requestsTabBtn.addEventListener('click', () => {
    requestsTabBtn.classList.add('active');
    diagramTabBtn.classList.remove('active');
    requestsTab.classList.add('active');
    diagramTab.classList.remove('active');
  });
  
  diagramTabBtn.addEventListener('click', () => {
    diagramTabBtn.classList.add('active');
    requestsTabBtn.classList.remove('active');
    diagramTab.classList.add('active');
    requestsTab.classList.remove('active');
    
    // Load fresh diagram data when switching to the tab
    if (typeof loadResourceData === 'function') {
      loadResourceData();
    }
  });
}

// Setup tabs functionality for request details
function setupDetailsTabs() {
  const tabs = document.querySelectorAll('.tabs .tab-button');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Hide all tab content
      const tabContents = document.querySelectorAll('.details-panel .tab-content');
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Show content for selected tab
      const tabId = tab.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });
}

// Load requests from background page
function loadRequests() {
  try {
    if (backgroundPort) {
      // Use the persistent connection if available
      backgroundPort.postMessage({ action: 'get-requests' });
    } else {
      // Fall back to one-time messages with error handling
      chrome.runtime.sendMessage({ action: 'get-requests' }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error loading requests:', chrome.runtime.lastError.message);
          
          // Try to reconnect
          connectToBackground();
        } else if (response && response.requests) {
          requestsList = response.requests;
          updateRequestList(requestsList);
        }
      });
    }
  } catch (error) {
    console.error('Error in loadRequests:', error);
  }
}

// Update the request list UI
function updateRequestList(requests) {
  const requestList = document.getElementById('requestList');
  const filter = document.getElementById('requestFilter').value.toLowerCase();
  
  // Clear existing rows
  requestList.innerHTML = '';
  
  // Sort by timestamp (newest first)
  requests.sort((a, b) => b.timeStamp - a.timeStamp);
  
  // Filter and create table rows
  requests.forEach(request => {
    // Apply filtering
    const url = request.url.toLowerCase();
    if (filter && !url.includes(filter)) {
      return;
    }
    
    const row = document.createElement('tr');
    row.className = 'request-row';
    row.dataset.requestId = request.id;
    
    // Highlight selected row
    if (selectedRequestId === request.id) {
      row.classList.add('selected');
    }
    
    // Status color coding
    let statusClass = 'status-pending';
    if (request.status === 'complete') {
      if (request.statusCode >= 200 && request.statusCode < 300) {
        statusClass = 'status-success';
      } else if (request.statusCode >= 400) {
        statusClass = 'status-error';
      } else {
        statusClass = 'status-warning';
      }
    } else if (request.status === 'error') {
      statusClass = 'status-error';
    }
    
    // Create table cells
    row.innerHTML = `
      <td>${request.method}</td>
      <td class="${statusClass}">${request.statusCode || '-'}</td>
      <td>${request.type || 'unknown'}</td>
      <td class="url-cell">${formatUrl(request.url)}</td>
      <td>${request.timing.duration ? Math.round(request.timing.duration) + 'ms' : '-'}</td>
    `;
    
    // Add click handler
    row.addEventListener('click', () => {
      // Deselect previous row
      const previouslySelected = document.querySelector('.request-row.selected');
      if (previouslySelected) {
        previouslySelected.classList.remove('selected');
      }
      
      // Select this row
      row.classList.add('selected');
      selectedRequestId = request.id;
      
      // Show request details
      showRequestDetails(request);
    });
    
    requestList.appendChild(row);
  });
}

// Show request details in the details panel
function showRequestDetails(request) {
  // Update general info
  const generalInfo = document.getElementById('generalInfo');
  generalInfo.innerHTML = `
    <tr><td>URL:</td><td>${request.url}</td></tr>
    <tr><td>Method:</td><td>${request.method}</td></tr>
    <tr><td>Status:</td><td>${request.statusCode || '-'}</td></tr>
    <tr><td>Type:</td><td>${request.type || 'unknown'}</td></tr>
    <tr><td>Time:</td><td>${request.timing.duration ? Math.round(request.timing.duration) + 'ms' : '-'}</td></tr>
    <tr><td>Initiator:</td><td>${request.initiator || 'Unknown'}</td></tr>
  `;
  
  // Update request headers
  const requestHeadersTable = document.getElementById('requestHeadersTable');
  requestHeadersTable.innerHTML = '';
  
  if (request.requestHeaders) {
    Object.entries(request.requestHeaders).forEach(([key, value]) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${key}</td><td>${value}</td>`;
      requestHeadersTable.appendChild(row);
    });
  }
  
  // Update response headers
  const responseHeadersTable = document.getElementById('responseHeadersTable');
  responseHeadersTable.innerHTML = '';
  
  if (request.responseHeaders) {
    Object.entries(request.responseHeaders).forEach(([key, value]) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${key}</td><td>${value}</td>`;
      responseHeadersTable.appendChild(row);
    });
  }
}

// Format URL for display
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    // Truncate URL if it's too long
    const path = urlObj.pathname.length > 30 ? 
      urlObj.pathname.substring(0, 27) + '...' : 
      urlObj.pathname;
    return `${urlObj.hostname}${path}`;
  } catch (e) {
    return url;
  }
}

// Filter requests based on user input
function filterRequests() {
  updateRequestList(requestsList);
}

// Clear all requests
function clearRequests() {
  try {
    if (backgroundPort) {
      // Use persistent connection
      backgroundPort.postMessage({ action: 'clear-requests' });
    } else {
      // Fall back to one-time message with error handling
      chrome.runtime.sendMessage({ action: 'clear-requests' }, response => {
        if (chrome.runtime.lastError) {
          console.log('Error clearing requests:', chrome.runtime.lastError.message);
          connectToBackground();
        } else if (response && response.success) {
          requestsList = [];
          updateRequestList(requestsList);
          selectedRequestId = null;
          
          // Clear details
          document.getElementById('generalInfo').innerHTML = '';
          document.getElementById('requestHeadersTable').innerHTML = '';
          document.getElementById('responseHeadersTable').innerHTML = '';
          
          // Also clear resource diagram data
          if (typeof resetView === 'function') {
            resetView();
          }
        }
      });
    }
  } catch (error) {
    console.error('Error in clearRequests:', error);
  }
}