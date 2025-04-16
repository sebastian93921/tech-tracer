// DOM Elements
const certificateUrl = document.getElementById('certificate-url');
const subjectCn = document.getElementById('subject-cn');
const subjectO = document.getElementById('subject-o');
const subjectOu = document.getElementById('subject-ou');
const issuerCn = document.getElementById('issuer-cn');
const issuerO = document.getElementById('issuer-o');
const issuerOu = document.getElementById('issuer-ou');
const validFrom = document.getElementById('valid-from');
const validTo = document.getElementById('valid-to');
const fingerprint = document.getElementById('fingerprint');
const pubkeyFingerprint = document.getElementById('pubkey-fingerprint');
const certificateJson = document.getElementById('certificate-json');

// Format date to readable string
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const date = new Date(timestamp);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();
  
  // Add time with leading zeros for hours, minutes, seconds
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${dayName} ${day} ${monthName} ${year} at ${hours}:${minutes}:${seconds}`;
}

// Format JSON for display
function formatJSON(json) {
  if (!json) return '';
  try {
    // Handle circular references and complex objects
    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      };
    };
    
    // If it's already a string, try to parse it
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json);
      } catch (e) {
        // If parsing fails, return the string as is
        return json;
      }
    }
    
    // Convert to formatted JSON with circular reference handling
    return JSON.stringify(json, getCircularReplacer(), 2);
  } catch (e) {
    console.error('Error formatting JSON:', e);
    // Last resort fallback - convert to string but handle [object Object]
    const str = String(json);
    if (str === '[object Object]') {
      // Try another approach to list properties
      try {
        return Object.entries(json)
          .map(([key, value]) => `"${key}": ${typeof value === 'object' ? JSON.stringify(value) : `"${value}"`}`)
          .join(',\n');
      } catch (err) {
        return 'Unable to format certificate data';
      }
    }
    return str;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Syntax highlight JSON
function syntaxHighlightJSON(json) {
  if (typeof json !== 'string') {
    try {
      json = JSON.stringify(json, null, 2);
    } catch (e) {
      return String(json);
    }
  }
  
  // Safeguard against null or undefined
  if (!json) return '';
  
  try {
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
  } catch (e) {
    console.error('Error in syntax highlighting:', e);
    return json; // Return plain text if highlighting fails
  }
}

// Display certificate details
function displayCertificateDetails(data) {
  if (!data || !data.certificate) {
    console.error('No certificate data received');
    return;
  }
  
  const { certificate, url } = data;
  
  // Set document title
  document.title = `Certificate: ${url ? (new URL(url)).hostname : 'Unknown Site'}`;
  
  // Set header
  certificateUrl.textContent = `Certificate ${url || ''}`;
  
  // Set subject information
  subjectCn.textContent = certificate.rawDetails.subject?.CN || certificate.subject?.commonName || '<Not part of certificate>';
  subjectO.textContent = certificate.rawDetails.subject?.O || certificate.subject?.organization || '<Not part of certificate>';
  subjectOu.textContent = certificate.rawDetails.subject?.OU || certificate.subject?.organizationalUnit || '<Not part of certificate>';
  
  // Set issuer information
  issuerCn.textContent = certificate.rawDetails.issuer?.CN || certificate.issuer?.commonName || '<Not part of certificate>';
  issuerO.textContent = certificate.rawDetails.issuer?.O || certificate.issuer?.organization || '<Not part of certificate>';
  issuerOu.textContent = certificate.rawDetails.issuer?.OU || certificate.issuer?.organizationalUnit || '<Not part of certificate>';
  
  // Set validity period
  validFrom.textContent = formatDate(certificate.rawDetails.valid_from || certificate.validFrom);
  validTo.textContent = formatDate(certificate.rawDetails.valid_to || certificate.validTo);
  
  // Set fingerprints
  fingerprint.textContent = certificate.rawDetails.fingerprint256 || certificate.fingerprint256 || 'Unknown';
  pubkeyFingerprint.textContent = certificate.rawDetails.pubKeyFingerprint || certificate.pubKeyFingerprint || 'Unknown';
  
  // Set full certificate JSON view
  const rawDetails = certificate.rawDetails || certificate;
  const formattedJson = formatJSON(rawDetails);
  
  // Make sure we have a string before applying syntax highlighting
  if (typeof formattedJson === 'string') {
    certificateJson.innerHTML = syntaxHighlightJSON(formattedJson);
  } else {
    certificateJson.textContent = JSON.stringify(formattedJson, null, 2);
  }
}

// Initialize tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Deactivate all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // Activate clicked tab
    tab.classList.add('active');
    
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    // Show corresponding tab pane
    const targetId = tab.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');
  });
});

// Listen for certificate details
window.certificateAPI.onCertificateDetails(data => {
  displayCertificateDetails(data);
}); 