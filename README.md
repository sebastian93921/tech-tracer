# TechTracer

A Chrome extension for monitoring and analyzing network traffic with detailed resource visualization.

<img width="799" alt="image" src="https://github.com/user-attachments/assets/a47585ac-a1bb-4b1e-81fe-0e63e3b52485" />
<img width="805" alt="image" src="https://github.com/user-attachments/assets/bb9822a1-96c4-4f78-9c4d-5949990fe3b5" />


## Installation

### Development Mode

1. Clone the repository
2. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the root directory of this project

## Usage

### Popup Interface

1. Click the TechTracer icon in your browser toolbar to open the popup
2. View the list of captured network requests in the "Network Requests" tab
3. Click on any request to see detailed information about headers and responses
4. Switch to the "Resource Diagram" tab to visualize the relationships between resources

### Resource Diagram

The resource diagram provides a visual representation of all network requests:
- Resources are organized by domain
- Color-coded by request method (GET, POST, etc.)
- Filter by resource type (API, Script, HTML, CSS, etc.)
- Hover over resources to see detailed information
- Zoom in/out to explore complex request patterns

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
