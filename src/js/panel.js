// Store reference to the selected request
let selectedRequestId = null;
let requestsList = [];
let backgroundPageConnection;

// Initialize DevTools panel
document.addEventListener('DOMContentLoaded', () => {
  // Create a connection to the background page
  backgroundPageConnection = chrome.runtime.connect({
    name: "techtracer-panel"
  });
  
  // Add event listeners
  document.getElementById('clearBtn').addEventListener('click', clearRequests);
  document.getElementById('diagramBtn').addEventListener('click', openResourceDiagram);
  document.getElementById('requestFilter').addEventListener('input', filterRequests);
  
  // Setup tab functionality
  setupTabs();
  
  // Load initial data
  loadRequests();
  
  // Listen for messages from the background page
  backgroundPageConnection.onMessage.addListener(message => {
    if (message.action === 'request-started' ||
        message.action === 'request-completed' ||
        message.action === 'request-error' ||
        message.action === 'xhr-completed' ||
        message.action === 'fetch-completed') {
      // Refresh the request list when a new request comes in
      loadRequests();
    }
  });
  
  // Setup periodic updates (as a fallback)
  setInterval(loadRequests, 2000);
});

// Load requests from background page
function loadRequests() {
  chrome.runtime.sendMessage({ action: 'get-requests' }, response => {
    if (response && response.requests) {
      requestsList = response.requests;
      updateRequestList(requestsList);
    }
  });
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
  chrome.runtime.sendMessage({ action: 'clear-requests' }, response => {
    if (response && response.success) {
      requestsList = [];
      updateRequestList(requestsList);
      selectedRequestId = null;
      
      // Clear details
      document.getElementById('generalInfo').innerHTML = '';
      document.getElementById('requestHeadersTable').innerHTML = '';
      document.getElementById('responseHeadersTable').innerHTML = '';
    }
  });
}

// Open the resource diagram in a new window
function openResourceDiagram() {
  chrome.runtime.sendMessage({ action: 'open-resource-diagram' });
}

// Setup tab functionality
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-button');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Hide all tab content
      const tabContents = document.querySelectorAll('.tab-content');
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Show content for selected tab
      const tabId = tab.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });
} 