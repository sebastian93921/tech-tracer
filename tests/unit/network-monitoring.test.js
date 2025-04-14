const { expect } = require('chai');
const sinon = require('sinon');
const { URL } = require('url');

// Create mock objects and maps
const pendingRequests = new Map();
const scriptApiMap = new Map();

// Mock functions for network monitoring
const mockNetworkFunctions = {
  addNetworkRequest: (details) => {
    pendingRequests.set(details.id, {
      id: details.id,
      method: details.method,
      url: details.url,
      referrer: details.referrer || '',
      timestamp: Date.now(),
      requestHeaders: details.requestHeaders || {},
      uploadData: details.uploadData,
      protocol: 'HTTP/1.1'
    });
    
    return pendingRequests.get(details.id);
  },
  
  updateNetworkRequest: (details) => {
    if (pendingRequests.has(details.id)) {
      const request = pendingRequests.get(details.id);
      pendingRequests.set(details.id, {
        ...request,
        ...details,
        responseHeaders: details.responseHeaders || {},
        statusCode: details.statusCode || 0,
        statusLine: details.statusLine || '',
        responseTime: Date.now()
      });
      
      return pendingRequests.get(details.id);
    }
    return null;
  },
  
  completeNetworkRequest: (details) => {
    if (pendingRequests.has(details.id)) {
      const request = pendingRequests.get(details.id);
      pendingRequests.set(details.id, {
        ...request,
        ...details,
        endTime: Date.now(),
        completed: true
      });
      
      return pendingRequests.get(details.id);
    }
    return null;
  },
  
  resetNetworkData: () => {
    pendingRequests.clear();
    scriptApiMap.clear();
  },
  
  buildDomainResourceTree: () => {
    const domains = new Map();
    
    // Process each request and organize by domain
    pendingRequests.forEach(request => {
      try {
        const url = new URL(request.url);
        const domain = url.hostname;
        
        if (!domains.has(domain)) {
          domains.set(domain, {
            domain,
            resources: []
          });
        }
        
        domains.get(domain).resources.push({
          id: request.id,
          url: request.url,
          method: request.method,
          type: guessResourceType(url.pathname),
          statusCode: request.statusCode || 0
        });
      } catch (e) {
        // Skip invalid URLs
        console.error('Error processing URL:', e);
      }
    });
    
    return Array.from(domains.values());
  },
  
  trackScriptApi: (requestDetails) => {
    if (requestDetails.referrer) {
      try {
        const referrerUrl = new URL(requestDetails.referrer);
        const referrerPath = referrerUrl.pathname;
        const referrerExt = referrerPath.split('.').pop().toLowerCase();
        
        const requestUrl = new URL(requestDetails.url);
        const requestPath = requestUrl.pathname;
        
        // If referrer is a script and request looks like an API call
        if (
          (referrerExt === 'js' || referrerExt === 'mjs') && 
          (requestPath.includes('/api/') || requestPath.includes('/service/'))
        ) {
          if (!scriptApiMap.has(requestDetails.referrer)) {
            scriptApiMap.set(requestDetails.referrer, []);
          }
          
          // Add to the map if not already tracked
          const apiCalls = scriptApiMap.get(requestDetails.referrer);
          if (!apiCalls.includes(requestDetails.url)) {
            apiCalls.push(requestDetails.url);
          }
        }
      } catch (e) {
        // Skip invalid URLs
        console.error('Error tracking script-API relationship:', e);
      }
    }
  },
  
  prepareNetworkFlowData: () => {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();
    
    // First, add all script nodes
    scriptApiMap.forEach((apiCalls, scriptUrl) => {
      try {
        const scriptUrlObj = new URL(scriptUrl);
        const scriptNode = {
          id: scriptUrl,
          label: scriptUrlObj.pathname,
          type: 'script'
        };
        
        if (!nodeMap.has(scriptUrl)) {
          nodeMap.set(scriptUrl, nodes.length);
          nodes.push(scriptNode);
        }
        
        // Add API nodes and connections
        apiCalls.forEach(apiUrl => {
          try {
            const apiUrlObj = new URL(apiUrl);
            const apiNode = {
              id: apiUrl,
              label: apiUrlObj.pathname,
              type: 'api'
            };
            
            if (!nodeMap.has(apiUrl)) {
              nodeMap.set(apiUrl, nodes.length);
              nodes.push(apiNode);
            }
            
            // Add edge from script to API
            edges.push({
              from: nodeMap.get(scriptUrl),
              to: nodeMap.get(apiUrl)
            });
          } catch (e) {
            console.error('Error processing API URL:', e);
          }
        });
      } catch (e) {
        console.error('Error processing script URL:', e);
      }
    });
    
    return { nodes, edges };
  }
};

// Helper function to guess resource type
function guessResourceType(path) {
  const ext = path.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js':
      return 'script';
    case 'css':
      return 'stylesheet';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return 'image';
    case 'html':
    case 'htm':
      return 'document';
    case 'json':
      return 'json';
    case 'xml':
      return 'xhr';
    default:
      return 'other';
  }
}

describe('Network Monitoring Tests', () => {
  beforeEach(() => {
    // Clear maps before each test
    pendingRequests.clear();
    scriptApiMap.clear();
  });
  
  describe('addNetworkRequest', () => {
    it('should add a network request to the pending requests map', () => {
      // Arrange
      const requestDetails = {
        id: '12345',
        method: 'GET',
        url: 'https://example.com/api/data',
        referrer: 'https://example.com'
      };
      
      // Act
      const result = mockNetworkFunctions.addNetworkRequest(requestDetails);
      
      // Assert
      expect(pendingRequests.has('12345')).to.be.true;
      expect(result.id).to.equal('12345');
      expect(result.method).to.equal('GET');
      expect(result.url).to.equal('https://example.com/api/data');
    });
  });
  
  describe('updateNetworkRequest', () => {
    it('should update an existing network request', () => {
      // Arrange
      const requestDetails = {
        id: '12345',
        method: 'GET',
        url: 'https://example.com/api/data'
      };
      mockNetworkFunctions.addNetworkRequest(requestDetails);
      
      const updateDetails = {
        id: '12345',
        statusCode: 200,
        statusLine: 'HTTP/1.1 200 OK',
        responseHeaders: { 'Content-Type': 'application/json' }
      };
      
      // Act
      const result = mockNetworkFunctions.updateNetworkRequest(updateDetails);
      
      // Assert
      expect(result.statusCode).to.equal(200);
      expect(result.responseHeaders['Content-Type']).to.equal('application/json');
    });
    
    it('should return null if the request does not exist', () => {
      // Arrange
      const updateDetails = {
        id: 'nonexistent',
        statusCode: 200
      };
      
      // Act
      const result = mockNetworkFunctions.updateNetworkRequest(updateDetails);
      
      // Assert
      expect(result).to.be.null;
    });
  });
  
  describe('completeNetworkRequest', () => {
    it('should mark a request as completed', () => {
      // Arrange
      const requestDetails = {
        id: '12345',
        method: 'GET',
        url: 'https://example.com/api/data'
      };
      mockNetworkFunctions.addNetworkRequest(requestDetails);
      
      const completeDetails = {
        id: '12345',
        statusCode: 200
      };
      
      // Act
      const result = mockNetworkFunctions.completeNetworkRequest(completeDetails);
      
      // Assert
      expect(result.completed).to.be.true;
      expect(result.endTime).to.exist;
    });
  });
  
  describe('resetNetworkData', () => {
    it('should clear all network data', () => {
      // Arrange
      mockNetworkFunctions.addNetworkRequest({
        id: '12345',
        method: 'GET',
        url: 'https://example.com/api/data'
      });
      
      // Act
      mockNetworkFunctions.resetNetworkData();
      
      // Assert
      expect(pendingRequests.size).to.equal(0);
      expect(scriptApiMap.size).to.equal(0);
    });
  });
  
  describe('buildDomainResourceTree', () => {
    it('should group resources by domain', () => {
      // Arrange
      mockNetworkFunctions.addNetworkRequest({
        id: '1',
        method: 'GET',
        url: 'https://example.com/index.html'
      });
      
      mockNetworkFunctions.addNetworkRequest({
        id: '2',
        method: 'GET',
        url: 'https://example.com/styles.css'
      });
      
      mockNetworkFunctions.addNetworkRequest({
        id: '3',
        method: 'GET',
        url: 'https://cdn.example.com/script.js'
      });
      
      // Act
      const result = mockNetworkFunctions.buildDomainResourceTree();
      
      // Assert
      expect(result.length).to.equal(2); // Two domains
      
      // Find the example.com domain
      const exampleDomain = result.find(d => d.domain === 'example.com');
      expect(exampleDomain).to.exist;
      expect(exampleDomain.resources.length).to.equal(2);
      
      // Find the cdn.example.com domain
      const cdnDomain = result.find(d => d.domain === 'cdn.example.com');
      expect(cdnDomain).to.exist;
      expect(cdnDomain.resources.length).to.equal(1);
    });
  });
  
  describe('trackScriptApi', () => {
    it('should track relationships between scripts and API calls', () => {
      // Arrange
      const requestDetails = {
        id: '12345',
        method: 'GET',
        url: 'https://example.com/api/data',
        referrer: 'https://example.com/script.js'
      };
      
      // Act
      mockNetworkFunctions.trackScriptApi(requestDetails);
      
      // Assert
      expect(scriptApiMap.has('https://example.com/script.js')).to.be.true;
      expect(scriptApiMap.get('https://example.com/script.js')).to.include('https://example.com/api/data');
    });
    
    it('should not track non-script referrers', () => {
      // Arrange
      const requestDetails = {
        id: '12345',
        method: 'GET',
        url: 'https://example.com/api/data',
        referrer: 'https://example.com/page.html'
      };
      
      // Act
      mockNetworkFunctions.trackScriptApi(requestDetails);
      
      // Assert
      expect(scriptApiMap.has('https://example.com/page.html')).to.be.false;
    });
  });
  
  describe('prepareNetworkFlowData', () => {
    it('should prepare node and edge data for network flow visualization', () => {
      // Arrange
      scriptApiMap.set('https://example.com/script1.js', [
        'https://example.com/api/data1',
        'https://example.com/api/data2'
      ]);
      
      scriptApiMap.set('https://example.com/script2.js', [
        'https://example.com/api/data3'
      ]);
      
      // Act
      const result = mockNetworkFunctions.prepareNetworkFlowData();
      
      // Assert
      expect(result.nodes.length).to.equal(5); // 2 scripts + 3 APIs
      expect(result.edges.length).to.equal(3); // 3 connections
    });
  });
}); 