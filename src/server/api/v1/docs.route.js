/**
 * OpenAPI v1 Documentation Routes
 * Serves OpenAPI specification and Swagger UI
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache spec at module load time
const specPath = path.join(__dirname, '../../../../docs/openapi-v1.yaml');
let cachedSpec = null;

function getSpec() {
  if (!cachedSpec || process.env.NODE_ENV === 'development') {
    cachedSpec = fs.readFileSync(specPath, 'utf8');
  }
  return cachedSpec;
}

/**
 * Serve OpenAPI specification as YAML
 * GET /api/v1/docs/openapi.yaml
 */
export function getOpenAPISpec(req, res, next) {
  try {
    const spec = getSpec();
    
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(spec);
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
    const swaggerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BliKVM API v1 Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-standalone-preset.js"></script>
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