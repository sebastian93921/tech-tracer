// tests/setup.js
const chai = require('chai');
const sinon = require('sinon');

// Make chai and sinon available globally
global.expect = chai.expect;
global.sinon = sinon;

// Create a mock for electron
const mockElectron = {
  app: {
    getPath: sinon.stub().returns('/mock/path'),
    commandLine: {
      appendSwitch: sinon.stub()
    }
  },
  BrowserWindow: function() {
    return {
      loadFile: sinon.stub(),
      on: sinon.stub(),
      webContents: {
        on: sinon.stub(),
        send: sinon.stub(),
        openDevTools: sinon.stub(),
        session: {
          setCertificateVerifyProc: sinon.stub(),
          webRequest: {
            onBeforeRequest: sinon.stub(),
            onResponseStarted: sinon.stub(),
            onCompleted: sinon.stub(),
            onErrorOccurred: sinon.stub()
          }
        }
      },
      getBounds: sinon.stub().returns({ width: 1400, height: 900 }),
      contentView: {
        addChildView: sinon.stub()
      }
    };
  },
  ipcMain: {
    on: sinon.stub(),
    handle: sinon.stub()
  },
  WebContentsView: function() {
    return {
      webContents: {
        loadURL: sinon.stub(),
        on: sinon.stub(),
        session: {
          setCertificateVerifyProc: sinon.stub(),
          webRequest: {
            onBeforeRequest: sinon.stub(),
            onResponseStarted: sinon.stub(),
            onCompleted: sinon.stub(),
            onErrorOccurred: sinon.stub()
          }
        },
        setWindowOpenHandler: sinon.stub(),
        getURL: sinon.stub().returns('https://example.com'),
        close: sinon.stub()
      },
      setBackgroundColor: sinon.stub(),
      setBounds: sinon.stub()
    };
  },
  net: {
    request: sinon.stub().returns({
      on: sinon.stub(),
      end: sinon.stub()
    })
  }
};

global.mockElectron = mockElectron; 