// Global map for tracking network requests
const pendingRequests = new Map();
// Map to track script-initiated requests
const scriptApiMap = new Map();
const requestIdMap = new Map();

// Store request data
chrome.webRequest.onBeforeRequest.addListener(
  details => {
    // Skip extension's own requests
    if (details.url.startsWith('chrome-extension://')) {
      return;
    }
    
    // Create a new entry for this request
    pendingRequests.set(details.requestId, {
      id: details.requestId,
      url: details.url,
      method: details.method,
      type: details.type,
      timeStamp: details.timeStamp,
      fromCache: false,
      status: 'pending',
      statusCode: 0,
      initiator: details.initiator || 'Unknown',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: details.requestBody || null,
      responseBody: null,
      timing: {
        startTime: details.timeStamp,
        endTime: 0,
        duration: 0
      }
    });
    
    // Broadcast the request to any open DevTools panels
    chrome.runtime.sendMessage({
      action: 'request-started',
      requestData: pendingRequests.get(details.requestId)
    });
    
    // Update request count
    updateRequestCount();
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Capture request headers
chrome.webRequest.onSendHeaders.addListener(
  details => {
    const request = pendingRequests.get(details.requestId);
    if (request) {
      request.requestHeaders = formatHeaders(details.requestHeaders);
      
      // Update the request in the map
      pendingRequests.set(details.requestId, request);
      
      // Send updated data
      chrome.runtime.sendMessage({
        action: 'request-headers',
        requestId: details.requestId,
        headers: request.requestHeaders
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// Capture response headers
chrome.webRequest.onHeadersReceived.addListener(
  details => {
    const request = pendingRequests.get(details.requestId);
    if (request) {
      request.responseHeaders = formatHeaders(details.responseHeaders);
      request.statusCode = details.statusCode;
      request.status = 'received';
      
      // Update the request in the map
      pendingRequests.set(details.requestId, request);
      
      // Send updated data
      chrome.runtime.sendMessage({
        action: 'response-headers',
        requestId: details.requestId,
        headers: request.responseHeaders,
        statusCode: details.statusCode
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Track completed requests
chrome.webRequest.onCompleted.addListener(
  details => {
    const request = pendingRequests.get(details.requestId);
    if (request) {
      request.status = 'complete';
      request.timing.endTime = details.timeStamp;
      request.timing.duration = details.timeStamp - request.timing.startTime;
      request.fromCache = details.fromCache || false;
      
      // Update the request in the map
      pendingRequests.set(details.requestId, request);
      
      // Send updated data
      chrome.runtime.sendMessage({
        action: 'request-completed',
        requestId: details.requestId,
        requestData: request
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Track failed requests
chrome.webRequest.onErrorOccurred.addListener(
  details => {
    const request = pendingRequests.get(details.requestId);
    if (request) {
      request.status = 'error';
      request.error = details.error;
      request.timing.endTime = details.timeStamp;
      request.timing.duration = details.timeStamp - request.timing.startTime;
      
      // Update the request in the map
      pendingRequests.set(details.requestId, request);
      
      // Send updated data
      chrome.runtime.sendMessage({
        action: 'request-error',
        requestId: details.requestId,
        error: details.error
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Format headers to a more usable object format
function formatHeaders(headers) {
  const result = {};
  if (headers) {
    headers.forEach(header => {
      result[header.name] = header.value;
    });
  }
  return result;
}

// Send network data to popup or devtools when requested
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-requests') {
    // Convert map to array for easier processing
    const requests = Array.from(pendingRequests.values());
    sendResponse({ requests });
    return true;
  } else if (message.action === 'clear-requests') {
    pendingRequests.clear();
    updateRequestCount();
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'get-resource-diagram-data') {
    const resourceData = prepareNetworkFlowData();
    sendResponse({ resourceData });
    return true;
  } else if (message.action === 'get-request-details') {
    const request = pendingRequests.get(message.requestId);
    sendResponse({ request });
    return true;
  } else if (message.action === 'ping') {
    // Simple ping-pong to check if background is available
    sendResponse({ status: 'ok' });
    return true;
  }
  return false; // For unhandled messages
});

// Update badge with request count
function updateRequestCount() {
  chrome.action.setBadgeText({
    text: pendingRequests.size.toString()
  });
  chrome.action.setBadgeBackgroundColor({ color: '#4688F1' });
}

// Build domain resource tree for visualization
function buildDomainResourceTree() {
  const domains = new Map();
  const requests = Array.from(pendingRequests.values());
  
  requests.forEach(request => {
    try {
      // Parse the URL to get domain
      const url = new URL(request.url);
      const domain = url.hostname;
      
      // Skip empty domains
      if (!domain) return;
      
      // Initialize domain if it doesn't exist
      if (!domains.has(domain)) {
        domains.set(domain, {
          name: domain,
          children: [],
          size: 0
        });
      }
      
      // Add request to domain
      const domainNode = domains.get(domain);
      
      // Categorize by file type
      let type = request.type || 'other';
      
      // Find or create the type node
      let typeNode = domainNode.children.find(node => node.name === type);
      if (!typeNode) {
        typeNode = {
          name: type,
          children: [],
          size: 0
        };
        domainNode.children.push(typeNode);
      }
      
      // Add the request as a leaf node
      typeNode.children.push({
        name: request.url.split('/').pop() || request.url,
        size: 1,
        request: request
      });
      
      // Update sizes
      typeNode.size += 1;
      domainNode.size += 1;
    } catch (error) {
      console.error('Error processing URL for domain tree:', error);
    }
  });
  
  // Convert map to array for the tree visualization
  return {
    name: 'root',
    children: Array.from(domains.values())
  };
}

// Prepare network flow data for visualization
function prepareNetworkFlowData() {
  const domainTree = buildDomainResourceTree();
  const requests = Array.from(pendingRequests.values());
  
  return {
    domainTree,
    requests,
    timestamp: Date.now()
  };
}

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('TechTracer extension installed');
  updateRequestCount();
}); 