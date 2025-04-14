const path = require('path');
const fs = require('fs');
const { app, net } = require('electron');
const https = require('https');
const os = require('os');

// Load technology categories from JSON file
let technologyCategories = {};
try {
  const categoriesPath = path.join(__dirname, 'tech-db', 'categories.json');
  const categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
  
  // Convert categories format
  for (const [id, category] of Object.entries(categoriesData)) {
    technologyCategories[id] = category.name;
  }
} catch (error) {
  console.error("Error loading categories.json:", error);
}

// Cache for technology data
let technologiesCache = null;

class TechnologyService {
  
  async scanCurrentPage(webViews, activeWebViewIndex) {
    if (!webViews[activeWebViewIndex] || !webViews[activeWebViewIndex].webContents) {
      return { error: "No active web view" };
    }

    try {
      const technologies = await this.fetchTechnologyData();
      const webContents = webViews[activeWebViewIndex].webContents;
      if (!webContents) {
        return { error: "No active web view" };
      }
      const url = webContents.getURL();
      const domain = new URL(url).hostname;
      
      // Get page HTML
      const html = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        document.documentElement.outerHTML;
      `);
      
      // Get page headers using executeJavaScript to capture headers from the client side
      const headers = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        // Create an object to store headers
        const headers = {};
        
        // Try to get response headers if available through performance API
        try {
          const entries = performance.getEntriesByType('navigation');
          if (entries && entries.length > 0 && entries[0].responseHeaders) {
            const respHeaders = entries[0].responseHeaders;
            for (const [key, value] of Object.entries(respHeaders)) {
              headers[key.toLowerCase()] = value;
            }
          }
        } catch (e) {
          // Performance API might not be available
        }
        
        headers;
      `);
      
      // Get meta tags
      const meta = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('meta')).map(meta => {
          return {
            name: meta.getAttribute('name'),
            content: meta.getAttribute('content')
          };
        });
      `);
      
      // Get scripts
      const scripts = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('script')).map(script => script.src);
      `);
      
      // Get JS variables
      const jsVars = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        const result = {};
        for (const key in window) {
          try {
            if (typeof window[key] !== 'function' && typeof window[key] !== 'object') {
              result[key] = window[key];
            } else if (typeof window[key] === 'object' && window[key] !== null) {
              result[key] = true;
            }
          } catch (e) {}
        }
        result;
      `);
      
      // Get cookies
      const cookies = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        try{
          document.cookie.split(';').reduce((acc, cookie) => {
            const [name, value] = cookie.trim().split('=');
            if (name) acc[name] = value || '';
            return acc;
          }, {});
        }catch(e){
          {};
        }
      `);
      
      // Get DOM elements
      const dom = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('*')).map(el => el.tagName.toLowerCase()).reduce((acc, tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
          return acc;
        }, {});
      `);
      
      // Get CSS
      const css = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
        Array.from(document.styleSheets).map(sheet => {
          try {
            return sheet.href || '';
          } catch (e) {
            return '';
          }
        }).filter(href => href);
      `);
      
      // Get robots.txt content if available
      let robotsTxt = '';
      try {
        const robotsUrl = new URL('/robots.txt', url).href;
        const response = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
          fetch('${robotsUrl}').then(r => r.ok ? r.text() : '').catch(() => '');
        `);
        robotsTxt = response;
      } catch (e) {
        // Failed to fetch robots.txt
      }
      
      // Detect technologies
      const detectedTechnologies = await this.detectTechnologies(technologies, {
        html,
        url,
        domain,
        headers,
        meta,
        scripts,
        jsVars,
        cookies,
        dom,
        css,
        robotsTxt
      }, webViews, activeWebViewIndex);
      
      // Organize by category
      const categorizedResults = this.organizeTechnologiesByCategory(detectedTechnologies, technologies);
      
      return {
        url,
        domain,
        technologies: categorizedResults
      };
    } catch (error) {
      console.error("Error scanning page:", error);
      return { error: error.message };
    }
  }

  async detectTechnologies(technologies, pageData, webViews, activeWebViewIndex) {
    const detected = [];
    
    // Helper function to process wappalyzer patterns
    const processPattern = (pattern) => {
      let versionIndex = 1; // Default to first capture group
      
      // Extract version information if present
      if (pattern.includes('\\;version:')) {
        const parts = pattern.split('\\;version:');
        pattern = parts[0]; // Get the actual regex pattern
        versionIndex = parseInt(parts[1]) || 1; // Get the capture group index for version
      }
      
      return { pattern, versionIndex };
    };
    
    for (const [techName, techData] of Object.entries(technologies)) {
      let match = false;
      let version = null;
      
      // Check HTML patterns
      if (techData.html) {
        const patterns = Array.isArray(techData.html) ? techData.html : [techData.html];
        for (const originalPattern of patterns) {
          try {
            const { pattern, versionIndex } = processPattern(originalPattern);
            const regex = new RegExp(pattern, 'i');
            const matches = regex.exec(pageData.html);
            if (matches) {
              match = true;
              // Extract version using the specified capture group
              if (matches.length > versionIndex && matches[versionIndex]) {
                version = matches[versionIndex];
              }
              continue;
            }
          } catch (e) {
            // Skip invalid regex
          }
        }
      }
      
      // Check meta tags
      if ((!match || !version) && techData.meta) {
        for (const metaTag of pageData.meta) {
          if (!metaTag.name || !metaTag.content) continue;
          
          for (const [metaName, metaPattern] of Object.entries(techData.meta)) {
            if (metaTag.name.toLowerCase() === metaName.toLowerCase()) {
              const patterns = Array.isArray(metaPattern) ? metaPattern : [metaPattern];
              
              for (const originalPattern of patterns) {
                try {
                  const { pattern, versionIndex } = processPattern(originalPattern);
                  const regex = new RegExp(pattern, 'i');
                  const matches = regex.exec(metaTag.content);
                  if (matches) {
                    match = true;
                    // Extract version using the specified capture group
                    if (matches.length > versionIndex && matches[versionIndex]) {
                      version = matches[versionIndex];
                    }
                    continue;
                  }
                } catch (e) {
                  // Skip invalid regex
                }
              }
            }
          }
          
          if (match) break;
        }
      }
      
      // Check script sources
      if ((!match || !version) && techData.scriptSrc) {
        const patterns = Array.isArray(techData.scriptSrc) ? techData.scriptSrc : [techData.scriptSrc];
        
        for (const script of pageData.scripts) {
          if (!script) continue;
          
          for (const originalPattern of patterns) {
            try {
              const { pattern, versionIndex } = processPattern(originalPattern);
              const regex = new RegExp(pattern, 'i');
              const matches = regex.exec(script);
              if (matches) {
                match = true;
                // Extract version using the specified capture group
                if (matches.length > versionIndex && matches[versionIndex]) {
                  version = matches[versionIndex];
                }
                continue;
              }
            } catch (e) {
              // Skip invalid regex
            }
          }
          
          if (version) break;
        }
      }
      
      // Check headers if available
      if ((!match || !version) && techData.headers && pageData.headers) {
        for (const [headerName, headerPattern] of Object.entries(techData.headers)) {
          const headerValue = pageData.headers[headerName.toLowerCase()];
          if (!headerValue) continue;
          
          const patterns = Array.isArray(headerPattern) ? headerPattern : [headerPattern];
          
          for (const originalPattern of patterns) {
            try {
              const { pattern, versionIndex } = processPattern(originalPattern);
              const regex = new RegExp(pattern, 'i');
              const matches = regex.exec(headerValue);
              if (matches) {
                match = true;
                // Extract version using the specified capture group
                if (matches.length > versionIndex && matches[versionIndex]) {
                  version = matches[versionIndex];
                }
                continue;
              }
            } catch (e) {
              // Skip invalid regex
            }
          }
          
          if (match) break;
        }
      }
      
      // Check JS variables
      if ((!match || !version) && techData.js) {
        const blackListCharacter = [':', '/', '?', '#', '=', '&', '|', '!', '*', '\'', '\"', ',', ' ', '\n', '\r', '\t'];
        for (const [jsVar, jsPattern] of Object.entries(techData.js)) {
          if (jsVar.includes('.') && 
            !jsVar.match(/\.\d+/) &&
            !blackListCharacter.some(char => jsVar.includes(char))
            ) {
            try {
              // Evaluate the JavaScript expression directly
              const varValueResult = await webViews[activeWebViewIndex].webContents.executeJavaScript(`
                function getVersion() {
                  try {
                    const value = ${jsVar};
                    if (value !== undefined) {
                      return value;
                    }
                    return null;
                  } catch (e) {
                    return null;
                  }
                }
                getVersion();
              `);

              if (varValueResult !== null) {
                if (typeof jsPattern === 'string') {
                  const { pattern, versionIndex } = processPattern(jsPattern);
                  const regex = new RegExp(pattern, 'i');
                  const matches = regex.exec(varValueResult);
                  
                  if (matches) {
                    match = true;
                    // Extract version using the specified capture group
                    if (matches.length > versionIndex && matches[versionIndex]) {
                      version = matches[versionIndex];
                    }
                    continue;
                  }
                }
              }
            } catch (e) {
              // Skip if evaluation fails
            }
          } else if (pageData.jsVars[jsVar] !== undefined) {
            try {
              if (typeof jsPattern === 'string') {
                const { pattern, versionIndex } = processPattern(jsPattern);
                const regex = new RegExp(pattern, 'i');
                const varValue = String(pageData.jsVars[jsVar]);
                const matches = regex.exec(varValue);
                
                if (matches) {
                  match = true;
                  // Extract version using the specified capture group
                  if (matches.length > versionIndex && matches[versionIndex]) {
                    version = matches[versionIndex];
                  }
                  continue;
                }
              }
            } catch (e) {
              // Skip invalid regex
            }
          }

          if (version) break;
        }
      }
      
      // Check cookies
      if ((!match || !version) && techData.cookies && pageData.cookies) {
        for (const [cookieName, cookiePattern] of Object.entries(techData.cookies)) {
          const cookieValue = pageData.cookies[cookieName];
          if (!cookieValue) continue;
          
          const patterns = Array.isArray(cookiePattern) ? cookiePattern : [cookiePattern];
          
          for (const originalPattern of patterns) {
            try {
              const { pattern, versionIndex } = processPattern(originalPattern);
              const regex = new RegExp(pattern, 'i');
              const matches = regex.exec(cookieValue);
              if (matches) {
                match = true;
                if (matches.length > versionIndex && matches[versionIndex]) {
                  version = matches[versionIndex];
                }
                continue;
              }
            } catch (e) {
              // Skip invalid regex
            }
          }
          
          if (version) break;
        }
      }
      
      // Check DOM elements
      if ((!match || !version) && techData.dom && pageData.dom) {
        for (const [domSelector, domPattern] of Object.entries(techData.dom)) {
          // For DOM we need to check specific elements
          // For simplicity, we're just checking tag existence in this implementation
          const tagName = domSelector.split('.')[0].split('#')[0].toLowerCase();
          if (pageData.dom[tagName]) {
            if (typeof domPattern === 'string') {
              try {
                const { pattern, versionIndex } = processPattern(domPattern);
                // For this simplified implementation, we'll just mark as matched
                match = true;
                continue;
              } catch (e) {
                // Skip invalid pattern
              }
            }
          }

          if (version) break;
        }
      }
      
      // Check URL patterns
      if ((!match || !version) && techData.url && pageData.url) {
        const patterns = Array.isArray(techData.url) ? techData.url : [techData.url];
        
        for (const originalPattern of patterns) {
          try {
            const { pattern, versionIndex } = processPattern(originalPattern);
            const regex = new RegExp(pattern, 'i');
            const matches = regex.exec(pageData.url);
            if (matches) {
              match = true;
              if (matches.length > versionIndex && matches[versionIndex]) {
                version = matches[versionIndex];
              }
              continue;
            }
          } catch (e) {
            // Skip invalid regex
          }

          if (version) break;
        }
      }
      
      // Check CSS
      if ((!match || !version) && techData.css && pageData.css) {
        const patterns = Array.isArray(techData.css) ? techData.css : [techData.css];
        
        for (const cssUrl of pageData.css) {
          for (const originalPattern of patterns) {
            try {
              const { pattern, versionIndex } = processPattern(originalPattern);
              const regex = new RegExp(pattern, 'i');
              const matches = regex.exec(cssUrl);
              if (matches) {
                match = true;
                if (matches.length > versionIndex && matches[versionIndex]) {
                  version = matches[versionIndex];
                }
                continue;
              }
            } catch (e) {
              // Skip invalid regex
            }
          }
          
          if (version) break;
        }
      }
      
      // Check robots.txt
      if ((!match || !version) && techData.robots && pageData.robotsTxt) {
        const patterns = Array.isArray(techData.robots) ? techData.robots : [techData.robots];
        
        for (const originalPattern of patterns) {
          try {
            const { pattern, versionIndex } = processPattern(originalPattern);
            const regex = new RegExp(pattern, 'i');
            const matches = regex.exec(pageData.robotsTxt);
            if (matches) {
              match = true;
              if (matches.length > versionIndex && matches[versionIndex]) {
                version = matches[versionIndex];
              }
              continue;
            }
          } catch (e) {
            // Skip invalid regex
          }
        }
      }
      
      if (match) {
        // Check if already detected to avoid duplicates
        if (!detected.some(t => t.name === techName)) {
          detected.push({
            name: techName,
            version: version,
            categories: techData.cats || []
          });
        }else{
          // if already detected, check if they have the version number
          const detectedTech = detected.find(t => t.name === techName);
          if (!detectedTech.version) {
            detectedTech.version = version;
          }
        }

        if (techData.requires) {
          for (const requiredTech of techData.requires) {
            if (!detected.some(t => t.name === requiredTech)) {
              detected.push({
                name: requiredTech,
                categories: technologies[requiredTech] ? technologies[requiredTech].cats || [] : []
              });
            }
          }
        }
        
        // Add implied technologies
        if (techData.implies) {
          const implied = Array.isArray(techData.implies) ? techData.implies : [techData.implies];
          for (const impliedTech of implied) {
            // Check if already detected to avoid duplicates
            if (!detected.some(t => t.name === impliedTech)) {
              detected.push({
                name: impliedTech,
                categories: technologies[impliedTech] ? technologies[impliedTech].cats || [] : []
              });
            }
          }
        }
      }
    }
    
    return detected;
  }

  organizeTechnologiesByCategory(detectedTechnologies, technologiesData) {
    const categorized = {};
    
    for (const tech of detectedTechnologies) {
      const categories = tech.categories;
      
      for (const catId of categories) {
        const categoryName = technologyCategories[catId] || `Category ${catId}`;
        
        if (!categorized[categoryName]) {
          categorized[categoryName] = [];
        }
        
        // Add technology if not already in this category
        if (!categorized[categoryName].some(t => t.name === tech.name)) {
          categorized[categoryName].push({
            name: tech.name,
            version: tech.version,
            icon: technologiesData[tech.name]?.icon || null
          });
        }
      }
      
      // If no categories, add to Miscellaneous
      if (!categories || categories.length === 0) {
        const miscCategory = technologyCategories["19"] || "Miscellaneous"; // 19 is Miscellaneous in standard Wappalyzer
        
        if (!categorized[miscCategory]) {
          categorized[miscCategory] = [];
        }
        
        if (!categorized[miscCategory].some(t => t.name === tech.name)) {
          categorized[miscCategory].push({
            name: tech.name,
            version: tech.version,
            icon: technologiesData[tech.name]?.icon || null
          });
        }
      }
    }
    
    return categorized;
  }


  // Technology scanner functions
  async fetchTechnologyData() {
    if (technologiesCache) {
      return technologiesCache;
    }

    const technologies = {};
    const baseURL = "https://raw.githubusercontent.com/enthec/webappanalyzer/main/src/technologies/";
    const tmpDir = path.join(os.tmpdir(), 'tech-tracer-tech');
    const localDBDir = path.join(__dirname, 'tech-db');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Loop through all possible technology files (_,a-z)
    for (let c of ['_', ...Array.from({length: 26}, (_, i) => String.fromCharCode(97 + i))]) {
      const fileName = `${c}.json`;
      const filePath = path.join(tmpDir, fileName);
      const localFilePath = path.join(localDBDir, fileName);
      let fileData;
      
      try {
        try {
          console.log(`Downloading technology file ${fileName} from online source`);
          fileData = await this.downloadFile(`${baseURL}${fileName}`, filePath);
        } catch (downloadError) {
          console.error(`Error downloading ${fileName}, falling back to local database:`, downloadError.message);
          
          // Fallback to local database file
          if (fs.existsSync(localFilePath)) {
            console.log(`Loading technology file ${fileName} from local database`);
            fileData = fs.readFileSync(localFilePath, 'utf8');
          } else {
            console.error(`Local database file ${fileName} not found`);
            continue; // Skip this file and move to next
          }
        }
        
        // Parse the JSON data
        const techData = JSON.parse(fileData);
        Object.assign(technologies, techData);
      } catch (error) {
        console.error(`Error loading technology data for ${fileName}:`, error);
      }
    }
    
    technologiesCache = technologies;
    return technologies;
  }

  downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            fs.writeFileSync(filePath, data);
            resolve(data);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  setupHandlers(ipcMain) {
    // Get technology categories
    ipcMain.handle('get-technology-categories', () => {
      return { success: true, categories: technologyCategories };
    }); 
  }
}

// Create and export a singleton instance
const technologyService = new TechnologyService();
module.exports = technologyService; 