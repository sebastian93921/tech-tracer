// DOM Elements
const diagramContainer = document.getElementById('diagramContainer');
const zoomInButton = document.getElementById('zoomIn');
const zoomOutButton = document.getElementById('zoomOut');
const zoomResetButton = document.getElementById('zoomReset');
const zoomLevelDisplay = document.getElementById('zoomLevel');
const resetButton = document.getElementById('resetButton');

// Zoom and positioning variables
let zoomLevel = 1;
let isDragging = false;
let startX, startY, scrollLeft, scrollTop;
const ZOOM_STEP = 0.1;
const MAX_ZOOM = 2.0;
const MIN_ZOOM = 0.5;

// Apply zoom transformation
function applyZoom() {
  diagramContainer.style.transform = `scale(${zoomLevel})`;
  diagramContainer.style.transformOrigin = 'top left';
  zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
}

// Initialize drag to scroll functionality
function initDragScroll() {
  const containerWrapper = document.querySelector('.diagram-container-wrapper');
  
  containerWrapper.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left mouse button
    
    isDragging = true;
    containerWrapper.style.cursor = 'grabbing';
    startX = e.pageX - containerWrapper.offsetLeft;
    startY = e.pageY - containerWrapper.offsetTop;
    scrollLeft = containerWrapper.scrollLeft;
    scrollTop = containerWrapper.scrollTop;
  });
  
  containerWrapper.addEventListener('mouseleave', () => {
    isDragging = false;
    containerWrapper.style.cursor = 'default';
  });
  
  containerWrapper.addEventListener('mouseup', () => {
    isDragging = false;
    containerWrapper.style.cursor = 'default';
  });
  
  containerWrapper.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    e.preventDefault();
    const x = e.pageX - containerWrapper.offsetLeft;
    const y = e.pageY - containerWrapper.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    
    containerWrapper.scrollLeft = scrollLeft - walkX;
    containerWrapper.scrollTop = scrollTop - walkY;
  });
  
  // Add mouse wheel zoom support
  containerWrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      updateZoom(zoomLevel + delta);
    }
  }, { passive: false });
}

// Update zoom level
function updateZoom(newZoom) {
  newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
  zoomLevel = newZoom;
  applyZoom();
}

// Initialize zoom controls
function initZoomControls() {
  zoomInButton.addEventListener('click', () => {
    updateZoom(zoomLevel + ZOOM_STEP);
  });
  
  zoomOutButton.addEventListener('click', () => {
    updateZoom(zoomLevel - ZOOM_STEP);
  });
  
  zoomResetButton.addEventListener('click', () => {
    updateZoom(1.0);
  });
  
  // Initial zoom application
  applyZoom();
}

// Generate the flow diagram with domain view only
function generateFlowDiagram(requestFlow) {
  diagramContainer.innerHTML = '';
  
  if (!requestFlow || !Object.keys(requestFlow).length) {
    diagramContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No network activity detected yet. Browse the web to see the flow diagram.</div>';
    return;
  }
  
  try {
    
    // Generate domain-based view
    if (requestFlow && Object.keys(requestFlow).length) {
      generateDomainView(diagramContainer, requestFlow);
    } else {
      diagramContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No domain-based flow data available.</div>';
    }
    
    // Add some container padding after generating content for better scrolling
    adjustContainerPadding();
  } catch (error) {
    console.error('Error generating flow diagram:', error);
    diagramContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">
      Error generating diagram: ${error.message}
    </div>`;
  }
}

// Function to generate the domain-based view (original implementation)
function generateDomainView(container, requestFlow) {
  // Convert the Map structure to regular objects
  for (const [domain, data] of Object.entries(requestFlow)) {
    if (!data) continue; // Skip if domain data is undefined
    
    const domainTree = document.createElement('div');
    domainTree.className = 'domain-tree';
    
    // Create domain node
    const domainNode = document.createElement('div');
    domainNode.className = 'domain-node';
    
    // Make the domain name clickable
    const domainLink = document.createElement('a');
    domainLink.href = `https://${domain}`;
    domainLink.target = '_blank';
    domainLink.className = 'domain-link';
    domainLink.textContent = domain;
    
    domainNode.appendChild(domainLink);
    domainTree.appendChild(domainNode);
    
    // Process resources directly under the domain
    if (data.resources && Object.keys(data.resources).length > 0) {
      const resourceTree = document.createElement('div');
      resourceTree.className = 'resource-tree';
      
      let prevResource = null;
      let resourceChain = [];
      
      for (const [path, resource] of Object.entries(data.resources)) {
        if (!resource) continue; // Skip if resource is undefined
        
        const resourceNode = document.createElement('div');
        resourceNode.className = 'resource-node';
        
        const resourceItem = document.createElement('div');
        resourceItem.className = 'resource-item';
        
        // Always add arrow for consistent visual style
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.textContent = '→';
        resourceItem.appendChild(arrow);
        
        const resourceSpan = document.createElement('span');
        resourceSpan.className = `resource ${resource.type || 'api'}`;
        
        // Add method inside the resource box if available
        if (resource.method) {
          const methodSpan = document.createElement('span');
          methodSpan.className = `resource-method-inline ${resource.method.toLowerCase()}`;
          methodSpan.textContent = resource.method;
          resourceSpan.appendChild(methodSpan);
        }
        
        // Make resource path clickable
        const resourceLink = document.createElement('a');
        resourceLink.href = `https://${domain}${path}`;
        resourceLink.target = '_blank';
        resourceLink.className = 'resource-link';
        resourceLink.textContent = path;
        resourceLink.title = `Open ${domain}${path} in new tab`;
        
        resourceSpan.appendChild(resourceLink);
        resourceItem.appendChild(resourceSpan);
        
        resourceNode.appendChild(resourceItem);
        resourceTree.appendChild(resourceNode);
        
        prevResource = resource;
        resourceChain.push({ path, type: resource.type || 'api' });
      }
      
      domainTree.appendChild(resourceTree);
    }
    
    // Process child domains (subdomains or related domains)
    if (data.children && Object.keys(data.children).length > 0) {
      const subdomainTree = document.createElement('div');
      subdomainTree.className = 'subdomain-tree';
      
      for (const [childDomain, childData] of Object.entries(data.children)) {
        if (!childData) continue; // Skip if child data is undefined
        
        const subdomainBranch = document.createElement('div');
        subdomainBranch.className = 'subdomain-branch';
        
        // Connection marker
        const connectionMarker = document.createElement('div');
        connectionMarker.className = 'connection-marker';
        connectionMarker.textContent = 'Connection to:';
        subdomainBranch.appendChild(connectionMarker);
        
        // Child domain node
        const childDomainNode = document.createElement('div');
        childDomainNode.className = 'domain-node';
        
        // Child domain as link for cross-domain navigation
        const childDomainLink = document.createElement('a');
        childDomainLink.href = `https://${childDomain}`;
        childDomainLink.target = '_blank';
        childDomainLink.className = 'domain-link';
        childDomainLink.textContent = childDomain;
        
        
        childDomainNode.appendChild(childDomainLink);
        subdomainBranch.appendChild(childDomainNode);
        
        // Process resources under the child domain
        if (childData.resources && Object.keys(childData.resources).length > 0) {
          const childResourceTree = document.createElement('div');
          childResourceTree.className = 'resource-tree';
          
          let prevChildResource = null;
          
          for (const [path, resource] of Object.entries(childData.resources)) {
            if (!resource) continue; // Skip if resource is undefined
            
            const resourceNode = document.createElement('div');
            resourceNode.className = 'resource-node';
            
            const resourceItem = document.createElement('div');
            resourceItem.className = 'resource-item';
            
            // Always add arrow for consistent visual style
            const arrow = document.createElement('span');
            arrow.className = 'arrow';
            arrow.textContent = '→';
            resourceItem.appendChild(arrow);
            
            const resourceSpan = document.createElement('span');
            resourceSpan.className = `resource ${resource.type || 'api'}`;
            
            // Add method inside the resource box if available
            if (resource.method) {
              const methodSpan = document.createElement('span');
              methodSpan.className = `resource-method-inline ${resource.method.toLowerCase()}`;
              methodSpan.textContent = resource.method;
              resourceSpan.appendChild(methodSpan);
            }
            
            // Make resource path clickable
            const resourceLink = document.createElement('a');
            resourceLink.href = `https://${childDomain}${path}`;
            resourceLink.target = '_blank';
            resourceLink.className = 'resource-link';
            resourceLink.textContent = path;
            resourceLink.title = `Open ${childDomain}${path} in new tab`;
          
            
            resourceSpan.appendChild(resourceLink);
            resourceItem.appendChild(resourceSpan);
            
            resourceNode.appendChild(resourceItem);
            childResourceTree.appendChild(resourceNode);
            
            prevChildResource = resource;
          }
          
          subdomainBranch.appendChild(childResourceTree);
        }
        
        subdomainTree.appendChild(subdomainBranch);
      }
      
      domainTree.appendChild(subdomainTree);
    }
    
    container.appendChild(domainTree);
  }
}

// Adjust container padding to ensure the content is properly scrollable with zoom
function adjustContainerPadding() {
  // Add bottom padding to ensure scrollable content
  const contentHeight = diagramContainer.scrollHeight;
  const containerHeight = document.querySelector('.diagram-container-wrapper').clientHeight;
  
  if (contentHeight < containerHeight) {
    diagramContainer.style.paddingBottom = `${containerHeight - contentHeight + 100}px`;
  } else {
    diagramContainer.style.paddingBottom = '50px';
  }
}

// Update the diagram data handler to pass both data structures
window.diagramAPI.onDiagramData((data) => {
  try {
    if (data) {
      generateFlowDiagram(data.requestFlow);
    } else if (data && data.error) {
      console.error('Error receiving diagram data:', data.error);
      diagramContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">Error loading diagram data: ${data.error}</div>`;
    }
  } catch (error) {
    console.error('Error processing diagram data:', error);
    diagramContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Error processing diagram data.</div>';
  }
});

// Initialize UI and event listeners
function initUI() {
  initZoomControls();
  initDragScroll();
}

// Request initial data when the window loads
document.addEventListener('DOMContentLoaded', () => {
  try {
    initUI();
    
    window.diagramAPI.requestUpdate()
      .catch(error => {
        console.error('Error requesting diagram update:', error);
        diagramContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Error connecting to main process.</div>';
      });
  } catch (error) {
    console.error('Error in DOMContentLoaded event:', error);
  }
});

// Auto-refresh the diagram data every 5 seconds
const refreshInterval = setInterval(() => {
  try {
    if (document.visibilityState === 'visible') {
      window.diagramAPI.requestUpdate()
        .catch(error => {
          console.error('Error in auto-refresh:', error);
          // If there's a persistent error, stop the interval
          if (error && (error.includes('destroyed') || error.includes('not available'))) {
            clearInterval(refreshInterval);
          }
        });
    }
  } catch (error) {
    console.error('Error in refresh interval:', error);
    // If we hit an exception, stop trying to refresh
    clearInterval(refreshInterval);
  }
}, 5000);

// Reset button click handler
resetButton.addEventListener('click', async () => {
  // Confirm before resetting
  if (confirm('Are you sure you want to clear all network data?')) {
    try {
      await window.diagramAPI.resetNetworkData();
      // Clear the diagram container immediately (don't wait for update event)
      diagramContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Network data has been reset. No activity to display.</div>';
    } catch (error) {
      console.error('Error resetting network data:', error);
    }
  }
}); 