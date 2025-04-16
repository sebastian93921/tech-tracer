const fs = require('fs');
const path = require('path');

// Simple icon data as base64
const iconData = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3498db" />
      <stop offset="100%" stop-color="#2c3e50" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="url(#gradient)" />
  <path d="M30 40 L98 40 L98 88 L30 88 Z" fill="none" stroke="white" stroke-width="4" />
  <path d="M44 30 L44 98" stroke="white" stroke-width="4" stroke-dasharray="4" />
  <path d="M64 30 L64 98" stroke="white" stroke-width="4" stroke-dasharray="4" />
  <path d="M84 30 L84 98" stroke="white" stroke-width="4" stroke-dasharray="4" />
  <path d="M30 54 L98 54" stroke="white" stroke-width="4" stroke-dasharray="4" />
  <path d="M30 68 L98 68" stroke="white" stroke-width="4" stroke-dasharray="4" />
  <circle cx="44" cy="54" r="6" fill="white" />
  <circle cx="64" cy="68" r="6" fill="white" />
  <circle cx="84" cy="54" r="6" fill="white" />
  <path d="M44 54 L64 68 L84 54" fill="none" stroke="white" stroke-width="2" />
</svg>
`;

// Function to convert SVG to PNG (simulation)
function createIconPNG(size) {
  const svgWithSize = iconData
    .replace('width="128"', `width="${size}"`)
    .replace('height="128"', `height="${size}"`)
    .replace('viewBox="0 0 128 128"', `viewBox="0 0 128 128"`);
  
  // Write SVG file as a placeholder
  // In a real app, you'd use a library to convert SVG to PNG
  fs.writeFileSync(path.join(__dirname, 'assets', 'icons', `icon${size}.svg`), svgWithSize);
  
  // Create a very basic PNG file for demo purposes
  const buffer = Buffer.from(
    `89504E470D0A1A0A0000000D4948445200000${size.toString(16).padStart(2, '0')}00000${size.toString(16).padStart(2, '0')}0806000000`,
    'hex'
  );
  
  fs.writeFileSync(path.join(__dirname, 'assets', 'icons', `icon${size}.png`), buffer);
}

// Make sure src/assets/icons directory exists
const iconsDir = path.join(__dirname, 'assets', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create icons of different sizes
createIconPNG(16);
createIconPNG(32);
createIconPNG(48);
createIconPNG(128);

console.log('Icons created successfully in src/assets/icons directory'); 