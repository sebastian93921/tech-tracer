const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const proxyquire = require('proxyquire');

// Create mocks for the required modules
const mockFs = {
  existsSync: sinon.stub(),
  readFileSync: sinon.stub(),
  writeFileSync: sinon.stub()
};

const mockElectron = {
  app: {
    getPath: sinon.stub().returns('/mock/path')
  },
  session: {
    defaultSession: {
      setProxy: sinon.stub().resolves()
    }
  },
  net: {
    request: sinon.stub()
  }
};

const mockStore = {
  get: sinon.stub(),
  set: sinon.stub()
};

// Mock the Store constructor
function MockStore() {
  return mockStore;
}

// Mock the require function
function mockRequires() {
  // Save the original require
  const originalRequire = require;
  
  // Create our custom require function
  const mockedRequire = function(moduleName) {
    if (moduleName === 'fs') {
      return mockFs;
    } else if (moduleName === 'electron') {
      return mockElectron;
    } else if (moduleName === 'path') {
      return path;
    } else if (moduleName === 'electron-store') {
      return MockStore;
    }
    return originalRequire(moduleName);
  };
  
  // Replace global.require
  global.require = mockedRequire;
}

describe('Settings Service', () => {
  let settingsService;
  
  beforeEach(() => {
    // Reset all stubs
    sinon.restore();
    
    // Setup new stubs
    mockFs.existsSync = sinon.stub();
    mockFs.readFileSync = sinon.stub();
    mockFs.writeFileSync = sinon.stub();
    
    mockElectron.app.getPath = sinon.stub().returns('/mock/path');
    mockElectron.session.defaultSession = { 
      setProxy: sinon.stub().resolves() 
    };
    mockElectron.net.request = sinon.stub();
    
    // Set default store values
    mockStore.get = sinon.stub();
    mockStore.set = sinon.stub();
    
    mockStore.get.withArgs('proxy').returns({
      enabled: false,
      type: 'http',
      host: 'localhost',
      port: 8080,
      username: '',
      password: '',
      bypassList: ''
    });
    
    mockStore.get.withArgs('screenshot').returns({
      showUrl: true
    });
    
    // Setup the mocks
    mockRequires();
    
    // Load the settings service with mocked dependencies
    settingsService = proxyquire('../../src/main/settings-service', {
      'fs': mockFs,
      'electron': mockElectron,
      'path': path,
      'electron-store': MockStore
    });
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('Proxy Settings', () => {
    it('should return proxy settings', () => {
      // Arrange
      const expectedSettings = {
        enabled: false,
        type: 'http',
        host: 'localhost',
        port: 8080,
        username: '',
        password: '',
        bypassList: ''
      };
      
      // Act
      const settings = settingsService.getProxySettings();
      
      // Assert
      expect(settings).to.deep.equal(expectedSettings);
    });
    
    it('should save proxy settings', () => {
      // Arrange
      const newSettings = {
        enabled: true,
        type: 'http',
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'pass',
        bypassList: 'localhost'
      };
      
      // Act
      const result = settingsService.saveProxySettings(newSettings);
      
      // Assert
      expect(result.success).to.be.true;
      expect(mockStore.set.calledWith('proxy', newSettings)).to.be.true;
    });
    
    it('should configure proxy when enabled', () => {
      // Arrange
      settingsService.settings.proxy = {
        enabled: true,
        type: 'http',
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'pass',
        bypassList: 'localhost, 127.0.0.1'
      };
      
      const mockSession = {
        setProxy: sinon.stub().resolves()
      };
      
      // Act
      settingsService.configureProxy(mockSession);
      
      // Assert
      expect(mockSession.setProxy.called).to.be.true;
      const args = mockSession.setProxy.firstCall.args[0];
      expect(args.mode).to.equal('fixed_servers');
      expect(args.proxyRules).to.include('proxy.example.com:8080');
      expect(args.bypassList).to.deep.equal(['localhost', '127.0.0.1']);
    });
    
    it('should disable proxy when not enabled', () => {
      // Arrange
      settingsService.settings.proxy = {
        enabled: false,
        type: 'http',
        host: 'proxy.example.com',
        port: 8080
      };
      
      const mockSession = {
        setProxy: sinon.stub().resolves()
      };
      
      // Act
      settingsService.configureProxy(mockSession);
      
      // Assert
      expect(mockSession.setProxy.called).to.be.true;
      const args = mockSession.setProxy.firstCall.args[0];
      expect(args.mode).to.equal('direct');
    });
    
    it('should test proxy connection successfully', async () => {
      // Arrange
      const settings = {
        enabled: true,
        type: 'http',
        host: 'proxy.example.com',
        port: 8080
      };
      
      // Set up mock request and response
      const mockResponse = {
        statusCode: 200,
        on: (event, callback) => {
          if (event === 'data') callback(Buffer.from('test response'));
          if (event === 'end') callback();
          return mockResponse;
        }
      };
      
      const mockRequest = {
        on: (event, callback) => {
          if (event === 'response') callback(mockResponse);
          return mockRequest;
        },
        end: sinon.stub()
      };
      
      mockElectron.net.request.returns(mockRequest);
      
      // Act
      const result = await settingsService.testProxyConnection(settings);
      
      // Assert
      expect(result.success).to.be.true;
    });
    
    it('should handle proxy connection failure', async () => {
      // Arrange
      const settings = {
        enabled: true,
        type: 'http',
        host: 'proxy.example.com',
        port: 8080
      };
      
      // Set up mock error
      const mockRequest = {
        on: (event, callback) => {
          if (event === 'error') callback(new Error('Connection failed'));
          return mockRequest;
        },
        end: sinon.stub()
      };
      
      mockElectron.net.request.returns(mockRequest);
      
      // Act
      const result = await settingsService.testProxyConnection(settings);
      
      // Assert
      expect(result.success).to.be.false;
      expect(result.error).to.equal('Connection failed');
    });
  });
  
  describe('Screenshot Settings', () => {
    it('should return screenshot settings', () => {
      // Arrange
      const expectedSettings = {
        showUrl: true
      };
      
      // Act
      const settings = settingsService.getScreenshotSettings();
      
      // Assert
      expect(settings).to.deep.equal(expectedSettings);
    });
    
    it('should save screenshot settings', () => {
      // Arrange
      const newSettings = {
        showUrl: false
      };
      
      // Act
      const result = settingsService.saveScreenshotSettings(newSettings);
      
      // Assert
      expect(result.success).to.be.true;
      expect(mockStore.set.calledWith('screenshot', newSettings)).to.be.true;
    });
  });
  
  describe('IPC Handlers', () => {
    it('should set up IPC handlers', () => {
      // Arrange
      const mockIpcMain = {
        handle: sinon.stub()
      };
      
      // Act
      settingsService.setupHandlers(mockIpcMain);
      
      // Assert
      expect(mockIpcMain.handle.callCount).to.equal(5);
      expect(mockIpcMain.handle.calledWith('get-proxy-settings')).to.be.true;
      expect(mockIpcMain.handle.calledWith('save-proxy-settings')).to.be.true;
      expect(mockIpcMain.handle.calledWith('test-proxy-connection')).to.be.true;
      expect(mockIpcMain.handle.calledWith('get-screenshot-settings')).to.be.true;
      expect(mockIpcMain.handle.calledWith('save-screenshot-settings')).to.be.true;
    });
  });
}); 