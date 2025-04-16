// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  "TechTracer", // Panel title
  "../assets/icons/icon16.png", // Panel icon
  "html/panel.html", // Panel page
  panel => {
    // Panel created callback
    console.log("TechTracer DevTools panel created");
  }
); 