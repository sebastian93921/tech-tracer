// DOM Elements
const requestUrl = document.getElementById('requestUrl');
const requestPretty = document.getElementById('request-pretty');
const requestRaw = document.getElementById('request-raw');
const responsePretty = document.getElementById('response-pretty');
const responseRaw = document.getElementById('response-raw');

// Format JSON for display
function formatJSON(json) {
  if (!json) return '';
  try {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    return JSON.stringify(json, null, 2);
  } catch (e) {
    return String(json);
  }
}

// Syntax highlight JSON
function syntaxHighlightJSON(json) {
  if (!json) return '';
  
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, 
    function (match) {
      let cls = 'number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'key';
          match = match.replace(/"/g, '').replace(/:$/, '');
          return `<span class="${cls}">"${match}"</span>:`;
        } else {
          cls = 'string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'boolean';
      } else if (/null/.test(match)) {
        cls = 'null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

// Format headers for display
function formatHeaders(headers) {
  if (!headers) return '';
  
  let result = '';
  Object.entries(headers).forEach(([key, value], i) => {
    result += `<div class="code-line">
      <span class="line-number">${i+1}</span>
      <span class="line-content">
        <span class="header-name">${key}</span>: <span class="header-value">${value}</span>
      </span>
    </div>`;
  });
  
  return result;
}

// Format HTTP request for display
function formatHTTPRequest(request) {
  if (!request) return '';
  
  let result = '';
  let lineCount = 1;
  
  // Get protocol version or use a fallback
  const protocolVersion = request.protocol || (request.httpVersion ? `HTTP/${request.httpVersion}` : 'HTTP/1.1');
  
  // Request line with HTTP version
  result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content"><span class="http-method">${request.method}</span> <span class="url">${request.url}</span> <span class="http-version">${protocolVersion}</span></span>
  </div>`;
  
  // Headers
  if (request.requestHeaders) {
    Object.entries(request.requestHeaders).forEach(([key, value]) => {
      result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content"><span class="header-name">${key}</span>: <span class="header-value">${value}</span></span>
  </div>`;
    });
  }
  
  // Body
  if (request.uploadData && request.uploadData.length > 0) {
    result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content"></span>
  </div>`;
    
    const data = request.uploadData[0].bytes || request.uploadData[0].data;
    if (data) {
      try {
        let body = data.toString();
        if (body.startsWith('{') || body.startsWith('[')) {
          // Try to parse as JSON
          const jsonObj = JSON.parse(body);
          const formatted = formatJSON(jsonObj);
          const lines = formatted.split('\n');
          
          lines.forEach(line => {
            result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content">${syntaxHighlightJSON(line)}</span>
  </div>`;
          });
        } else {
          result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content">${body}</span>
  </div>`;
        }
      } catch (e) {
        result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content">${data}</span>
  </div>`;
      }
    }
  }
  
  return result;
}

// Format HTTP response for display
function formatHTTPResponse(response) {
  if (!response) return '';
  
  let result = '';
  let lineCount = 1;

  if(!response.statusCode){
    return '<div class="code-line"><span class="line-number">1</span><span class="line-content">[No Response]</span></div>';
  }
  
  // Get protocol version or use a fallback
  const protocolVersion = response.responseProtocol || response.protocol || (response.httpVersion ? `HTTP/${response.httpVersion}` : 'HTTP/1.1');
  
  // Status line
  result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content"><span class="http-version">${protocolVersion}</span> <span class="http-status">${response.statusCode}</span></span>
  </div>`;
  
  // Headers
  if (response.responseHeaders) {
    Object.entries(response.responseHeaders).forEach(([key, value]) => {
      result += `<div class="code-line">
    <span class="line-number">${lineCount++}</span>
    <span class="line-content"><span class="header-name">${key}</span>: <span class="header-value">${value}</span></span>
  </div>`;
    });
  }
  
  return result;
}

// Format raw request
function formatRawRequest(details) {
  if (!details) return '';
  
  // Get protocol version or use a fallback
  const protocolVersion = details.protocol || (details.httpVersion ? `HTTP/${details.httpVersion}` : 'HTTP/1.1');
  
  let raw = `${details.method} ${details.url} ${protocolVersion}\n`;
  
  if (details.requestHeaders) {
    Object.entries(details.requestHeaders).forEach(([key, value]) => {
      raw += `${key}: ${value}\n`;
    });
  }
  
  raw += '\n';
  
  if (details.uploadData && details.uploadData.length > 0) {
    const data = details.uploadData[0].bytes || details.uploadData[0].data;
    if (data) {
      raw += data.toString();
    }
  }
  
  return raw;
}

// Format raw response
function formatRawResponse(details) {
  if (!details) return '';

  if(!details.statusCode){
    return '[No Response]';
  }
  
  // Get protocol version or use a fallback
  const protocolVersion = details.responseProtocol || details.protocol || (details.httpVersion ? `HTTP/${details.httpVersion}` : 'HTTP/1.1');
  
  let raw = `${protocolVersion} ${details.statusCode}\n`;
  
  if (details.responseHeaders) {
    Object.entries(details.responseHeaders).forEach(([key, value]) => {
      raw += `${key}: ${value}\n`;
    });
  }
  
  return raw;
}

// Display request details
function displayRequestDetails(details) {
  // Check if we received valid details
  if (!details || !details.url) {
    console.error('Invalid request details received:', details);
    requestUrl.textContent = 'Error: Invalid request details';
    return;
  }
  
  console.log('Displaying details for:', details.url);
  
  // Clear existing content
  requestPretty.innerHTML = '';
  requestRaw.textContent = '';
  responsePretty.innerHTML = '';
  responseRaw.textContent = '';
  
  // Set header
  requestUrl.textContent = details.url;

  // Set request content
  requestPretty.innerHTML = formatHTTPRequest(details);
  requestRaw.textContent = formatRawRequest(details);
  
  // Set response content
  responsePretty.innerHTML = formatHTTPResponse(details);
  responseRaw.textContent = formatRawResponse(details);
}

// Tab switching
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

// Listen for request details from the main process
window.detailsAPI.onRequestDetails(displayRequestDetails); 