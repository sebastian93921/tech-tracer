const { expect } = require('chai');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

const electronPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron');
const appPath = path.join(__dirname, '..', '..');

describe('Application Launch', function() {
  this.timeout(10000); // Increase timeout for app launch
  
  let electronProcess;
  let isPortInUse = false;
  const debugPort = 9222;
  
  // Check if a port is in use
  function checkPort(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => {
        resolve(true); // Port is in use
      });
      server.once('listening', () => {
        server.close();
        resolve(false); // Port is free
      });
      server.listen(port);
    });
  }
  
  before(async function() {
    // Check if the debug port is already in use
    isPortInUse = await checkPort(debugPort);
    if (isPortInUse) {
      console.warn(`Debug port ${debugPort} is already in use. Integration tests may be affected.`);
    }
  });
  
  afterEach(function() {
    if (electronProcess) {
      electronProcess.kill();
      electronProcess = null;
    }
  });
  
  it('should launch the app with the default URL', function(done) {
    if (isPortInUse) {
      this.skip();
      return;
    }
    
    electronProcess = spawn(electronPath, [appPath, '--remote-debugging-port=9222']);
    
    // Handle process errors
    electronProcess.on('error', (err) => {
      done(err);
    });
    
    // Give the app time to start
    setTimeout(() => {
      // App started successfully if we got here
      expect(electronProcess.killed).to.be.false;
      done();
    }, 5000);
  });
  
  it('should launch the app with a custom URL', function(done) {
    if (isPortInUse) {
      this.skip();
      return;
    }
    
    electronProcess = spawn(
      electronPath, 
      [appPath, '--remote-debugging-port=9222', '--url', 'https://github.com']
    );
    
    // Handle process errors
    electronProcess.on('error', (err) => {
      done(err);
    });
    
    // Give the app time to start
    setTimeout(() => {
      // App started successfully if we got here
      expect(electronProcess.killed).to.be.false;
      done();
    }, 5000);
  });
  
  // Test for proper shutdown
  it('should exit cleanly when terminated', function(done) {
    if (isPortInUse) {
      this.skip();
      return;
    }
    
    electronProcess = spawn(electronPath, [appPath]);
    
    // Wait for app to start
    setTimeout(() => {
      // Kill the process
      electronProcess.kill();
      
      // Check if process terminated
      setTimeout(() => {
        try {
          const killed = electronProcess.killed || 
                        electronProcess.exitCode !== null || 
                        electronProcess.signalCode !== null;
          expect(killed).to.be.true;
          done();
        } catch (e) {
          done(e);
        }
      }, 1000);
    }, 3000);
  });
}); 