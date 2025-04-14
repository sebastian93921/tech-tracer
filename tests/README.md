# Network Detection Application Tests

This directory contains tests for the Network Detection application. The tests are organized into unit tests and integration tests.

## Test Structure

- `tests/unit/`: Contains unit tests for individual components and modules
- `tests/integration/`: Contains integration tests that test multiple components working together
- `tests/setup.js`: Common setup code used across tests

## Running Tests

You can run the tests using the following npm scripts:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

## Test
When adding new tests:

1. Place unit tests in the `tests/unit/` directory
2. Place integration tests in the `tests/integration/` directory
3. Follow the existing test pattern using Mocha and Chai
4. Use the global stubs and mock objects in `tests/setup.js` where appropriate

## Mock Objects

The tests use various mocks for Electron components:

- `mockElectron`: A mock for main Electron modules
- Specific mocks for BrowserWindow, WebContentsView, and other Electron components 