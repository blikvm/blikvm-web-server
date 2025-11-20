/**
 * OpenAPI v1 Documentation Routes
 * Serves OpenAPI specification and Swagger UI
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isAirGapFeatureEnabled } from '../system/airgap.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Serve OpenAPI specification as YAML
 * GET /api/v1/docs/openapi.yaml
 */
export function getOpenAPISpec(req, res, next) {
  try {
    const specPath = path.join(__dirname, '../../../../docs/openapi-v1.yaml');
    const spec = fs.readFileSync(specPath, 'utf8');
    
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(spec);
  } catch (error) {
    next(error);
  }
}

/**
 * Serve OpenAPI specification as JSON
 * GET /api/v1/docs/openapi.json
 */
export function getOpenAPISpecJSON(req, res, next) {
  try {
    const specPath = path.join(__dirname, '../../../../docs/openapi-v1.yaml');
    const yamlSpec = fs.readFileSync(specPath, 'utf8');
    
    // For now, serve YAML content with JSON content-type
    // In production, you'd want to parse YAML and convert to JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Simple response indicating YAML-to-JSON conversion needed
    res.json({
      message: "YAML spec available at /api/v1/docs/openapi.yaml",
      yaml_content: yamlSpec
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Serve basic Swagger UI HTML
 * GET /api/v1/docs
 */
export function getSwaggerUI(req, res, next) {
  try {
    const useLocalAssets = isAirGapFeatureEnabled('externalAssets');
    
    const swaggerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BliKVM API v1 Documentation</title>
  ${useLocalAssets 
    ? '<link rel="stylesheet" type="text/css" href="/api/v1/docs/assets/swagger-ui.css" />'
    : '<link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />'
  }
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
    ${useLocalAssets ? '.air-gap-notice { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 10px; margin: 10px; border-radius: 4px; }' : ''}
  </style>
</head>
<body>
  ${useLocalAssets ? '<div class="air-gap-notice">📡 Air-gap mode active - Using local assets</div>' : ''}
  <div id="swagger-ui"></div>
  ${useLocalAssets 
    ? '<script src="/api/v1/docs/assets/swagger-ui-bundle.js"></script><script src="/api/v1/docs/assets/swagger-ui-standalone-preset.js"></script>'
    : '<script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script><script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-standalone-preset.js"></script>'
  }
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/v1/docs/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(swaggerHTML);
  } catch (error) {
    next(error);
  }
}

/**
 * Serve local Swagger UI assets
 * GET /api/v1/docs/assets/:filename
 */
export function getSwaggerUIAsset(req, res, next) {
  try {
    const { filename } = req.params;
    const allowedFiles = ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js'];
    
    if (!allowedFiles.includes(filename)) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const assetPath = path.join(__dirname, '../../../../docs/swagger-ui', filename);
    
    if (!fs.existsSync(assetPath)) {
      return res.status(404).json({ error: 'Asset file not found on disk' });
    }

    // Set appropriate content type
    const contentTypes = {
      'swagger-ui.css': 'text/css',
      'swagger-ui-bundle.js': 'application/javascript',
      'swagger-ui-standalone-preset.js': 'application/javascript'
    };

    res.setHeader('Content-Type', contentTypes[filename]);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    
    const asset = fs.readFileSync(assetPath);
    res.send(asset);
  } catch (error) {
    next(error);
  }
}