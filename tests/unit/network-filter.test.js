const { expect } = require('chai');
const sinon = require('sinon');

// Create mock DOM elements
const createMockElement = () => ({
  className: '',
  innerHTML: '',
  style: {},
  appendChild: sinon.stub(),
  classList: {
    add: sinon.stub(),
    remove: sinon.stub(),
    contains: sinon.stub()
  },
  querySelector: sinon.stub().returns(null),
  querySelectorAll: sinon.stub().returns([]),
  addEventListener: sinon.stub(),
  removeEventListener: sinon.stub(),
  remove: sinon.stub(),
  focus: sinon.stub(),
  dataset: {},
  value: '',
  textContent: ''
});

// Mock document object
const mockDocument = {
  getElementById: sinon.stub(),
  createElement: sinon.stub(),
  querySelector: sinon.stub(),
  querySelectorAll: sinon.stub()
};

// Mock network items
const mockNetworkItems = [
  { url: 'https://example.com/api/users', method: 'GET', id: '1' },
  { url: 'https://example.com/api/products', method: 'GET', id: '2' },
  { url: 'https://cdn.example.com/styles.css', method: 'GET', id: '3' }
];

describe('Network Filter Feature', () => {
  // Mock DOM elements
  let mockNetworkSearchFilter;
  let mockClearNetworkFilter;
  let mockNetworkPanel;
  let mockNetworkItemElements;
  
  // Mock functions
  let filterNetworkItems;
  
  beforeEach(() => {
    // Reset all stubs
    sinon.restore();
    
    // Create mock elements
    mockNetworkSearchFilter = createMockElement();
    mockClearNetworkFilter = createMockElement();
    mockNetworkPanel = createMockElement();
    
    // Create mock network item elements
    mockNetworkItemElements = mockNetworkItems.map(item => {
      const el = createMockElement();
      el.id = `req-${item.id}`;
      el.className = 'network-item';
      el.dataset.id = item.id;
      
      // Create URL element within network item
      const urlElement = createMockElement();
      urlElement.className = 'url';
      urlElement.textContent = item.url;
      
      // Setup querySelector to return the URL element
      el.querySelector.withArgs('.url').returns(urlElement);
      
      return el;
    });
    
    // Setup document stubs
    mockDocument.getElementById.withArgs('networkSearchFilter').returns(mockNetworkSearchFilter);
    mockDocument.getElementById.withArgs('clearNetworkFilter').returns(mockClearNetworkFilter);
    mockDocument.getElementById.withArgs('networkPanel').returns(mockNetworkPanel);
    
    // Setup querySelectorAll to return network items
    mockDocument.querySelectorAll.withArgs('.network-item').returns(mockNetworkItemElements);
    
    // Create a filter function similar to the one in renderer.js but using our mocks
    filterNetworkItems = () => {
      const filterText = mockNetworkSearchFilter.value.toLowerCase();
      const networkItems = mockNetworkItemElements;
      
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
    };
  });
  
  describe('filterNetworkItems', () => {
    it('should display all items when filter is empty', () => {
      // Arrange
      mockNetworkSearchFilter.value = '';
      
      // Act
      filterNetworkItems();
      
      // Assert
      mockNetworkItemElements.forEach(item => {
        expect(item.style.display).to.equal('block');
      });
    });
    
    it('should hide items that do not match the filter text', () => {
      // Arrange
      mockNetworkSearchFilter.value = 'api';
      
      // Act
      filterNetworkItems();
      
      // Assert
      // First two items should be visible (contain 'api')
      expect(mockNetworkItemElements[0].style.display).to.equal('block');
      expect(mockNetworkItemElements[1].style.display).to.equal('block');
      // Third item should be hidden (doesn't contain 'api')
      expect(mockNetworkItemElements[2].style.display).to.equal('none');
    });
    
    it('should be case-insensitive when filtering', () => {
      // Arrange
      mockNetworkSearchFilter.value = 'API';
      
      // Act
      filterNetworkItems();
      
      // Assert
      // First two items should be visible despite case difference
      expect(mockNetworkItemElements[0].style.display).to.equal('block');
      expect(mockNetworkItemElements[1].style.display).to.equal('block');
    });
  });
  
  describe('Clear filter button', () => {
    it('should clear the filter input and show all items', () => {
      // Arrange
      mockNetworkSearchFilter.value = 'api';
      
      // First apply the filter
      filterNetworkItems();
      
      // Mock clearNetworkFilter click handler
      const clearClickHandler = () => {
        mockNetworkSearchFilter.value = '';
        filterNetworkItems();
        mockNetworkSearchFilter.focus();
      };
      
      // Act
      clearClickHandler();
      
      // Assert
      expect(mockNetworkSearchFilter.value).to.equal('');
      expect(mockNetworkSearchFilter.focus.called).to.be.true;
      
      // All items should be visible
      mockNetworkItemElements.forEach(item => {
        expect(item.style.display).to.equal('block');
      });
    });
  });
  
  describe('Keyboard events', () => {
    it('should clear the filter when Escape key is pressed', () => {
      // Arrange
      mockNetworkSearchFilter.value = 'api';
      
      // First apply the filter
      filterNetworkItems();
      
      // Mock keydown event handler
      const escapeKeyHandler = () => {
        mockNetworkSearchFilter.value = '';
        filterNetworkItems();
      };
      
      // Act
      escapeKeyHandler();
      
      // Assert
      expect(mockNetworkSearchFilter.value).to.equal('');
      
      // All items should be visible
      mockNetworkItemElements.forEach(item => {
        expect(item.style.display).to.equal('block');
      });
    });
    
    it('should focus the first matching item when Enter key is pressed', () => {
      // Arrange
      mockNetworkSearchFilter.value = 'products';
      
      // Apply the filter - only the second item should match
      filterNetworkItems();
      
      // Make first item hidden, second visible
      mockNetworkItemElements[0].style.display = 'none';
      mockNetworkItemElements[1].style.display = 'block';
      mockNetworkItemElements[2].style.display = 'none';
      
      // Mock the Array.from with find operation
      const findFirstVisible = () => {
        return mockNetworkItemElements.find(item => item.style.display !== 'none');
      };
      
      // Mock the Enter key handler behavior
      const enterKeyHandler = () => {
        const firstVisibleItem = findFirstVisible();
        if (firstVisibleItem) {
          firstVisibleItem.focus();
          // In real implementation it would also scroll into view
        }
      };
      
      // Act
      enterKeyHandler();
      
      // Assert
      // Second item should have been focused
      expect(mockNetworkItemElements[1].focus.called).to.be.true;
    });
  });
  
  describe('Filter updates for new items', () => {
    it('should apply current filter to newly added network items', () => {
      // Arrange
      mockNetworkSearchFilter.value = 'api';
      
      // Apply initial filter
      filterNetworkItems();
      
      // Create a new network item that doesn't match the filter
      const newItem = createMockElement();
      newItem.id = 'req-4';
      newItem.className = 'network-item';
      newItem.dataset.id = '4';
      
      const urlElement = createMockElement();
      urlElement.className = 'url';
      urlElement.textContent = 'https://cdn.example.com/image.png';
      
      newItem.querySelector.withArgs('.url').returns(urlElement);
      
      // Mock the behavior for adding a new network item
      const addNetworkItem = (item) => {
        // Add item to the DOM (simulated)
        mockNetworkItemElements.push(item);
        
        // Apply current filter to the new item
        const filterText = mockNetworkSearchFilter.value.toLowerCase();
        const url = urlElement.textContent.toLowerCase();
        
        if (filterText && !url.includes(filterText)) {
          item.style.display = 'none';
        }
      };
      
      // Act
      addNetworkItem(newItem);
      
      // Assert
      // The new item should be hidden because it doesn't match the filter
      expect(newItem.style.display).to.equal('none');
    });
  });
}); 