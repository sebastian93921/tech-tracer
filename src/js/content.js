// Content script runs in the context of web pages
// Used for capturing information that might not be available through the webRequest API

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get-dom-info') {
    // Collect basic DOM information
    const info = {
      title: document.title,
      scripts: countScripts(),
      links: countLinks(),
      images: countImages(),
      iframes: countIframes(),
    };
    
    sendResponse({ info });
    return true;
  }
});

// Count scripts in the page
function countScripts() {
  return document.scripts.length;
}

// Count links in the page
function countLinks() {
  return document.links.length;
}

// Count images in the page
function countImages() {
  return document.images.length;
}

// Count iframes in the page
function countIframes() {
  return document.querySelectorAll('iframe').length;
}

// Monitor for AJAX requests made by the page
// This helps catch fetch/XHR that might be missed by the webRequest API
(function() {
  // Override XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    this.addEventListener('load', function() {
      // Notify background about this XHR request
      chrome.runtime.sendMessage({
        action: 'xhr-completed',
        url: this._url,
        method: this._method,
        status: this.status,
        responseType: this.responseType
      });
    });
    
    // Store url and method for later
    this._url = arguments[1];
    this._method = arguments[0];
    
    // Call original function
    return originalXhrOpen.apply(this, arguments);
  };
  
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = function() {
    const url = arguments[0];
    let method = 'GET';
    
    // Check if second arg exists and has method
    if (arguments[1] && arguments[1].method) {
      method = arguments[1].method;
    }
    
    // Process the fetch request
    const fetchPromise = originalFetch.apply(this, arguments);
    
    // Clone the response to avoid consuming it
    fetchPromise.then(response => {
      chrome.runtime.sendMessage({
        action: 'fetch-completed',
        url: typeof url === 'string' ? url : url.url,
        method: method,
        status: response.status
      });
    }).catch(error => {
      chrome.runtime.sendMessage({
        action: 'fetch-error',
        url: typeof url === 'string' ? url : url.url,
        method: method,
        error: error.toString()
      });
    });
    
    return fetchPromise;
  };
})(); 