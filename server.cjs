const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'src/ui')));

// Serve the main HTML file at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/ui/index.html'));
});

// Health endpoint
app.get('/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.status(200).json({ 
        ok: true, 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 8080,
        host: process.env.HOST || '0.0.0.0'
    });
});

// Token validation endpoint
app.post('/validate-token', async (req, res) => {
    console.log('🔐 Token validation requested');
    try {
        const { authToken } = req.body;
        
        if (!authToken) {
            return res.status(400).json({ 
                valid: false, 
                error: 'No auth token provided',
                type: 'none'
            });
        }
        
        const tokenType = authToken.startsWith('AIza') ? 'API_KEY' : 'OAUTH_TOKEN';
        console.log('[DEBUG] Token type:', tokenType);
        console.log('[DEBUG] Token length:', authToken.length);
        console.log('[DEBUG] Token preview:', authToken.substring(0, 20) + '...');
        
        // Test the token with a simple API call
        let testResponse;
        try {
            if (tokenType === 'API_KEY') {
                testResponse = await makeRequest({
                    reqURL: 'https://generativelanguage.googleapis.com/v1beta/models',
                    authorization: authToken,
                    method: 'GET'
                });
            } else {
                testResponse = await makeRequest({
                    reqURL: 'https://aisandbox-pa.googleapis.com/v1:runImageFx',
                    authorization: authToken,
                    method: 'POST',
                    body: JSON.stringify({
                        prompt: 'test',
                        imageCount: 1,
                        aspectRatio: 'IMAGE_ASPECT_RATIO_SQUARE',
                        modelNameType: 'IMAGEN_3_1',
                        tool: 'IMAGE_FX'
                    })
                });
            }
            
            console.log('[DEBUG] Token test response:', {
                hasResponse: !!testResponse,
                hasError: !!(testResponse && testResponse.error),
                errorCode: testResponse?.error?.code,
                errorMessage: testResponse?.error?.message
            });
            
            if (testResponse && testResponse.error) {
                return res.json({
                    valid: false,
                    error: testResponse.error.message,
                    code: testResponse.error.code,
                    type: tokenType
                });
            } else {
                return res.json({
                    valid: true,
                    type: tokenType,
                    message: 'Token is valid'
                });
            }
        } catch (error) {
            console.error('[DEBUG] Token validation error:', error);
            return res.json({
                valid: false,
                error: error.message,
                type: tokenType
            });
        }
    } catch (error) {
        console.error('[DEBUG] Token validation endpoint error:', error);
        res.status(500).json({ 
            valid: false, 
            error: error.message 
        });
    }
});

// Test file writing endpoint
app.post('/test-file-write', async (req, res) => {
    console.log('🧪 Test file write requested');
    try {
        const testDir = './test-output';
        const testFile = path.join(testDir, 'test.txt');
        
        console.log('[DEBUG] Test directory:', testDir);
        console.log('[DEBUG] Test file:', testFile);
        console.log('[DEBUG] Current working directory:', process.cwd());
        
        // Check if directory exists
        console.log('[DEBUG] Directory exists:', fs.existsSync(testDir));
        
        // Try to create directory
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
            console.log('[DEBUG] Directory created');
        }
        
        // Try to write a test file
        const testContent = `Test file created at ${new Date().toISOString()}`;
        fs.writeFileSync(testFile, testContent, 'utf8');
        console.log('[DEBUG] Test file written');
        
        // Check if file exists
        const fileExists = fs.existsSync(testFile);
        console.log('[DEBUG] File exists after writing:', fileExists);
        
        // Try to read the file
        if (fileExists) {
            const readContent = fs.readFileSync(testFile, 'utf8');
            console.log('[DEBUG] File content read:', readContent);
        }
        
        res.json({ 
            success: true, 
            message: 'File write test completed',
            directoryExists: fs.existsSync(testDir),
            fileExists: fileExists,
            workingDirectory: process.cwd()
        });
    } catch (error) {
        console.error('[DEBUG] Test file write error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            workingDirectory: process.cwd()
        });
    }
});

// Simple ping endpoint
app.get('/ping', (req, res) => {
    console.log('🏓 Ping requested');
    res.status(200).send('pong');
});

// Map UI aspect ratios to API aspect ratios
const aspectRatioMap = {
    'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'square': 'IMAGE_ASPECT_RATIO_SQUARE',
    'mobile_portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'mobile_landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE'
};

// File management functions
const saveFile = (fileName, fileContent, encoding = "utf-8", filePath = ".") => {
    const fullPath = path.join(filePath, fileName);
    const parsedPath = path.parse(fullPath);

    if (parsedPath.dir && !fs.existsSync(parsedPath.dir) && parsedPath.dir != ".") {
        try {
            fs.mkdirSync(parsedPath.dir, { recursive: true });
        } catch (error) {
            console.log(`[!] Failed to create directory: ${parsedPath.dir}`);
            console.log(error);
            return false;
        }
    }

    try {
        fs.writeFileSync(fullPath, fileContent, { encoding });
    } catch (error) {
        console.log(`[!] Failed to write into file.`);
        console.log(error);
        return false;
    }

    return true;
};

const saveImage = (fileName, imageContent, filePath = ".") => {
    console.log('[DEBUG] saveImage called with:', {
        fileName,
        filePath,
        imageContentLength: imageContent?.length || 0
    });
    
    try {
        const result = saveFile(fileName, imageContent, "base64", filePath);
        console.log('[DEBUG] saveFile result:', result);
        return result;
    } catch (error) {
        console.error('[DEBUG] saveImage error:', error);
        return false;
    }
};

// Request function for API calls
const makeRequest = async (options, customHeaders = {}) => {
    console.log('[DEBUG] makeRequest called with URL:', options.reqURL);
    
    let defaultHeaders;
    
    if (options.authorization.startsWith('AIza')) {
        // API key - use X-goog-api-key header
        defaultHeaders = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'x-goog-api-key': options.authorization,
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            ...customHeaders
        };
    } else {
        // OAuth token - use Authorization header
        defaultHeaders = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'authorization': options.authorization.startsWith('Bearer') ? options.authorization : `Bearer ${options.authorization}`,
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            ...customHeaders
        };
    }

    console.log('[DEBUG] Headers:', {
        'content-type': defaultHeaders['content-type'],
        'authorization': defaultHeaders['authorization']?.substring(0, 20) + '...',
        'x-goog-api-key': defaultHeaders['x-goog-api-key']?.substring(0, 20) + '...',
        'origin': defaultHeaders['origin'],
        'referer': defaultHeaders['referer']
    });

    const fetchOptions = {
        method: options.method,
        headers: defaultHeaders,
        body: options.body
    };

    return new Promise((resolve, reject) => {
        const url = new URL(options.reqURL);
        const client = url.protocol === 'https:' ? https : http;
        
        console.log('[DEBUG] Making request to:', url.toString());
        
        const req = client.request(url, fetchOptions, (res) => {
            console.log('[DEBUG] Response status:', res.statusCode);
            console.log('[DEBUG] Response headers:', res.headers);
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('[DEBUG] Response data length:', data.length);
                console.log('[DEBUG] Response data preview:', data.substring(0, 200) + '...');
                
                try {
                    const jsonData = JSON.parse(data);
                    console.log('[DEBUG] Parsed JSON successfully');
                    resolve(jsonData);
                } catch (error) {
                    console.error('[DEBUG] Failed to parse JSON:', error);
                    console.log('[DEBUG] Raw response:', data);
                    resolve(data);
                }
            });
        });

        req.on('error', (error) => {
            console.error('[DEBUG] Request error:', error);
            reject(error);
        });

        if (options.body) {
            console.log('[DEBUG] Request body length:', options.body.length);
            req.write(options.body);
        }
        req.end();
    });
};

// Generate image function
const generateImage = async (params) => {
    const {
        prompt,
        authorization,
        imageCount = 1,
        seed = null,
        aspectRatio = 'IMAGE_ASPECT_RATIO_SQUARE',
        modelNameType = 'IMAGEN_3_1',
        tool = 'IMAGE_FX',
        proxy
    } = params;

    console.log('[DEBUG] generateImage called with params:', {
        prompt: prompt?.substring(0, 50) + '...',
        imageCount,
        seed,
        aspectRatio,
        modelNameType,
        tool,
        authLength: authorization?.length
    });

    // Use Google Generative AI API for image generation
    let requestBody;
    let apiUrl;
    
    if (authorization.startsWith('AIza')) {
        // API key - use Google Generative AI API
        apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4:generateContent';
        requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.4,
                topK: 32,
                topP: 1,
                maxOutputTokens: 2048,
            }
        };
    } else {
        // OAuth token - try multiple endpoints and formats
        console.log('[DEBUG] Using OAuth token, trying multiple API endpoints...');
        
        // Try Google Generative AI API first with OAuth
        apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3:generateContent';
        requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.4,
                topK: 32,
                topP: 1,
                maxOutputTokens: 2048,
            }
        };
        
        // If this fails, we'll try the original ImageFX API as fallback
        console.log('[DEBUG] Will try ImageFX API as fallback if this fails');
    }

    console.log('[DEBUG] Using API URL:', apiUrl);
    console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await makeRequest({
            reqURL: apiUrl,
            authorization,
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        console.log('[DEBUG] API Response received:', {
            hasResponse: !!response,
            responseType: typeof response,
            hasImagePanels: !!(response && response.imagePanels),
            imagePanelsCount: response?.imagePanels?.length || 0,
            error: response?.error || null
        });

        if (response && response.error) {
            console.error('[DEBUG] API Error:', response.error);
            
            // If it's an authentication error and we're using OAuth, try ImageFX API as fallback
            if (response.error.code === 401 && !authorization.startsWith('AIza')) {
                console.log('[DEBUG] Authentication failed, trying ImageFX API as fallback...');
                
                try {
                    const imageFxResponse = await makeRequest({
                        reqURL: 'https://aisandbox-pa.googleapis.com/v1:runImageFx',
                        authorization,
                        method: 'POST',
                        body: JSON.stringify({
                            prompt: prompt,
                            imageCount: imageCount,
                            aspectRatio: aspectRatio,
                            modelNameType: modelNameType,
                            tool: tool,
                            ...(seed !== null && { seed: seed })
                        })
                    });
                    
                    console.log('[DEBUG] ImageFX API response:', {
                        hasResponse: !!imageFxResponse,
                        hasError: !!(imageFxResponse && imageFxResponse.error),
                        hasImagePanels: !!(imageFxResponse && imageFxResponse.imagePanels)
                    });
                    
                    if (imageFxResponse && !imageFxResponse.error && imageFxResponse.imagePanels) {
                        console.log('[DEBUG] ImageFX API fallback successful');
                        return imageFxResponse;
                    } else if (imageFxResponse && imageFxResponse.error) {
                        console.error('[DEBUG] ImageFX API also failed:', imageFxResponse.error);
                        throw new Error(`Both APIs failed. Google AI: ${response.error.message}. ImageFX: ${imageFxResponse.error.message}`);
                    }
                } catch (fallbackError) {
                    console.error('[DEBUG] ImageFX API fallback also failed:', fallbackError);
                    throw new Error(`Both APIs failed. Google AI: ${response.error.message}. ImageFX: ${fallbackError.message}`);
                }
            }
            
            throw new Error(`API Error: ${response.error.message || response.error}`);
        }

        // Handle different response formats
        if (response && response.candidates && response.candidates[0] && response.candidates[0].content) {
            // Google Generative AI format
            const parts = response.candidates[0].content.parts;
            const images = parts.filter(part => part.inlineData && part.inlineData.mimeType.startsWith('image/'));
            
            if (images.length > 0) {
                // Convert to our expected format
                return {
                    imagePanels: [{
                        generatedImages: images.map(img => ({
                            encodedImage: img.inlineData.data,
                            mediaGenerationId: null
                        }))
                    }]
                };
            }
        }

        if (!response || !response.imagePanels) {
            console.error('[DEBUG] Invalid response structure:', response);
            throw new Error('Invalid response from API - no image panels');
        }

        return response;
    } catch (error) {
        console.error('[DEBUG] generateImage error:', error);
        throw error;
    }
};

// Generate endpoint with real functionality
app.post('/generate', async (req, res) => {
    console.log('🖼️ Generate requested');
    const { prompt, folderName, authToken, authFile, generationCount, imageCount, aspectRatio, outputDir, proxy, seed, model, noFallback } = req.body;
    
    try {
        // Get auth token from file or direct input
        let finalAuthToken;
        if (authFile) {
            finalAuthToken = fs.readFileSync(authFile, { encoding: 'utf-8' }).trim();
        } else if (authToken) {
            finalAuthToken = authToken;
        } else {
            throw new Error('No auth token or auth file provided');
        }

        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Send initial progress
        res.write(JSON.stringify({ type: 'progress', data: 'Starting generation...' }) + '\n');

        // Generate images for each generation count
        for (let gen = 0; gen < generationCount; gen++) {
            res.write(JSON.stringify({ 
                type: 'progress', 
                data: `Starting generation ${gen + 1} of ${generationCount}...` 
            }) + '\n');

            // Generate images with model fallback if needed
            let selectedModel = model === 'best' ? 'IMAGEN_4_0' : 'IMAGEN_3_1';
            let selectedTool = 'IMAGE_FX';
            let response;
            
            try {
                console.log(`[SERVER] Attempting generation with model ${selectedModel} and tool ${selectedTool}`);
                res.write(JSON.stringify({ type: 'progress', data: `Using model: ${selectedModel === 'IMAGEN_4_0' ? 'Best (Imagen 4)' : 'Quality (Imagen 3)'}` }) + '\n');
                
                response = await generateImage({
                    prompt,
                    authorization: finalAuthToken,
                    imageCount: imageCount,
                    seed: typeof seed === 'number' ? seed : null,
                    aspectRatio: aspectRatioMap[aspectRatio],
                    modelNameType: selectedModel,
                    tool: selectedTool,
                    proxy: proxy
                });
                
                console.log('[SERVER] generateImage completed successfully');
            } catch (e) {
                console.error('[SERVER] Generation error details:', {
                    message: e?.message,
                    stack: e?.stack,
                    name: e?.name
                });
                
                console.log(`[SERVER] First attempt with ${selectedModel} failed:`, e?.message || e);
                if (selectedModel === 'IMAGEN_4_0' && !noFallback) {
                    selectedModel = 'IMAGEN_3_1';
                    res.write(JSON.stringify({ type: 'progress', data: 'Falling back to Imagen 3 (quality)...' }) + '\n');
                    
                    try {
                        response = await generateImage({
                            prompt,
                            authorization: finalAuthToken,
                            imageCount: imageCount,
                            seed: typeof seed === 'number' ? seed : null,
                            aspectRatio: aspectRatioMap[aspectRatio],
                            modelNameType: selectedModel,
                            tool: selectedTool,
                            proxy: proxy
                        });
                        console.log('[SERVER] Fallback generation completed successfully');
                    } catch (fallbackError) {
                        console.error('[SERVER] Fallback generation also failed:', fallbackError);
                        throw fallbackError;
                    }
                } else {
                    if (selectedModel === 'IMAGEN_4_0' && noFallback) {
                        res.write(JSON.stringify({ type: 'progress', data: `Force no-fallback: Imagen 4 failed: ${e?.message || e}` }) + '\n');
                    }
                    throw e;
                }
            }

            // Save images and metadata
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // Create folder-specific output directory
            const finalOutputDir = folderName && folderName.trim() !== '' 
                ? path.join(outputDir, folderName.trim()) 
                : outputDir;

            console.log('[DEBUG] Final output directory:', finalOutputDir);
            console.log('[DEBUG] Directory exists before creation:', fs.existsSync(finalOutputDir));

            if (!fs.existsSync(finalOutputDir)) {
                try {
                    fs.mkdirSync(finalOutputDir, { recursive: true });
                    console.log('[DEBUG] Directory created successfully');
                } catch (error) {
                    console.error('[DEBUG] Failed to create directory:', error);
                    res.write(JSON.stringify({ type: 'error', data: `Failed to create output directory: ${error.message}` }) + '\n');
                    res.end();
                    return;
                }
            }

            console.log('[DEBUG] Directory exists after creation:', fs.existsSync(finalOutputDir));
            console.log('[DEBUG] Directory is writable:', fs.accessSync ? 'checking...' : 'unknown');

            let imageNumber = 1;
            const newEntries = [];

            if (response.imagePanels) {
                console.log('[DEBUG] Processing image panels:', response.imagePanels.length);
                for (const panel of response.imagePanels) {
                    console.log('[DEBUG] Panel has generated images:', panel.generatedImages?.length || 0);
                    for (const image of panel.generatedImages) {
                        const currentNum = imageNumber;
                        const imageName = `${timestamp}-generation-${gen + 1}-${currentNum}-${aspectRatio}.png`;
                        imageNumber++;
                        
                        console.log('[DEBUG] Attempting to save image:', imageName);
                        console.log('[DEBUG] Image data length:', image.encodedImage?.length || 0);
                        
                        try {
                            if (saveImage(imageName, image.encodedImage, finalOutputDir)) {
                                console.log('[DEBUG] Image saved successfully:', imageName);
                                const meta = {
                                    fileName: imageName,
                                    prompt: prompt,
                                    seed: seed,
                                    aspectRatio: aspectRatio,
                                    generationNumber: gen + 1,
                                    imageNumber: currentNum,
                                    savedAt: new Date().toISOString(),
                                    mediaGenerationId: image.mediaGenerationId || null,
                                    model: selectedModel === 'IMAGEN_4_0' ? 'Best (Imagen 4)' : 'Quality (Imagen 3)'
                                };
                                newEntries.push(meta);
                                
                                res.write(JSON.stringify({ 
                                    type: 'progress', 
                                    data: `Saved image ${currentNum}: ${imageName}` 
                                }) + '\n');
                            } else {
                                console.error('[DEBUG] Failed to save image:', imageName);
                                res.write(JSON.stringify({ 
                                    type: 'error', 
                                    data: `Failed to save image ${currentNum}: ${imageName}` 
                                }) + '\n');
                            }
                        } catch (error) {
                            console.error('[DEBUG] Error saving image:', error);
                            res.write(JSON.stringify({ 
                                type: 'error', 
                                data: `Error saving image ${currentNum}: ${error.message}` 
                            }) + '\n');
                        }
                    }
                }
            } else {
                console.log('[DEBUG] No image panels in response');
                res.write(JSON.stringify({ type: 'error', data: 'No images generated - no image panels in response' }) + '\n');
            }

            // Update gallery.html with new entries
            if (newEntries.length > 0) {
                const galleryPath = path.join(finalOutputDir, 'gallery.html');
                let data = [];
                
                if (fs.existsSync(galleryPath)) {
                    try {
                        const content = fs.readFileSync(galleryPath, 'utf-8');
                        const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
                        if (match) {
                            data = JSON.parse(match[1]);
                        }
                    } catch (error) {
                        console.log('Error reading existing gallery:', error);
                    }
                }
                
                // Merge by fileName (most recent wins)
                const map = new Map();
                for (const item of data) map.set(item.fileName, item);
                for (const item of newEntries) map.set(item.fileName, item);
                const merged = Array.from(map.values()).sort((a, b) => (a.savedAt > b.savedAt ? -1 : 1));

                const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ImageFX Gallery</title>
<style>
:root{--bg:#0b0f19;--card:#111827;--text:#e5e7eb;--muted:#94a3b8;--border:#1f2937}
body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto}
.app{max-width:1200px;margin:0 auto;padding:20px}
h1{margin:0 0 10px;font-size:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px}
.thumb{width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:#0b1220}
.meta{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4}
.count{color:var(--muted);margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}
td{border-top:1px solid var(--border);padding:4px 6px;vertical-align:top}
</style>
</head><body><div class="app">
<h1>ImageFX Gallery</h1>
<div class="count" id="count"></div>
<div class="grid" id="grid"></div>
<script id="gallery-data" type="application/json">${JSON.stringify(merged)}</script>
<script>
const data = JSON.parse(document.getElementById('gallery-data').textContent || '[]');
document.getElementById('count').textContent = 'Total images: ' + data.length;
const grid = document.getElementById('grid');
for (const item of data){
  const card = document.createElement('div');
  card.className='card';
  card.innerHTML = '\\n'
    + '    <img class="thumb" src="' + item.fileName + '" alt="' + item.fileName + '">\\n'
    + '    <div class="meta">Seed: ' + (item.seed ?? '') + '</div>\\n'
    + '    <table>\\n'
    + '      <tr><td>Prompt</td><td>' + String(item.prompt||'').replace(/</g,'&lt;') + '</td></tr>\\n'
    + '      <tr><td>Saved</td><td>' + item.savedAt + '</td></tr>\\n'
    + '      <tr><td>Aspect Ratio</td><td>' + item.aspectRatio + '</td></tr>\\n'
    + '      <tr><td>Generation</td><td>' + item.generationNumber + '</td></tr>\\n'
    + '      <tr><td>Image #</td><td>' + item.imageNumber + '</td></tr>\\n'
    + '      <tr><td>Media ID</td><td>' + (item.mediaGenerationId||'') + '</td></tr>\\n'
    + '    </table>';
  grid.appendChild(card);
}
</script>
</div></body></html>`;
                
                fs.writeFileSync(galleryPath, html, { encoding: 'utf-8' });
                res.write(JSON.stringify({ type: 'progress', data: 'Updated gallery.html' }) + '\n');
            }
        }

        res.write(JSON.stringify({ type: 'complete', data: 'All generations completed successfully!' }) + '\n');
        res.end();
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Generation error:', error);
        res.write(JSON.stringify({ type: 'error', data: errorMessage }) + '\n');
        res.end();
    }
});

// List images endpoint
app.post('/list-images', async (req, res) => {
    console.log('📁 List images requested');
    try {
        const targetPath = req.body?.path;
        const limit = Math.max(1, Math.min(50, Number(req.body?.limit ?? 24)));
        
        if (!targetPath) throw new Error('Path is required');
        if (!fs.existsSync(targetPath)) throw new Error('Path does not exist');
        
        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) throw new Error('Path is not a directory');

        const files = fs.readdirSync(targetPath)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .map((name) => {
                const full = path.join(targetPath, name);
                const s = fs.statSync(full);
                return { name, full, size: s.size, mtimeMs: s.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

        const total = files.length;
        const pick = files.slice(0, limit);
        const items = pick.map((f) => {
            const buf = fs.readFileSync(f.full);
            const ext = f.name.split('.').pop()?.toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            return {
                name: f.name,
                size: f.size,
                mtime: new Date(f.mtimeMs).toISOString(),
                dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
                meta: null,
            };
        });

        res.json({ count: total, items });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: errorMessage });
    }
});

// Open folder endpoint
app.post('/open-folder', async (req, res) => {
    console.log('📂 Open folder requested');
    try {
        const targetPath = req.body?.path;
        if (!targetPath) throw new Error('Path is required');
        if (!fs.existsSync(targetPath)) throw new Error('Path does not exist');
        
        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) throw new Error('Path is not a directory');

        res.json({ status: 'ok', message: 'Folder path validated' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: errorMessage });
    }
});

// Preview endpoint
app.post('/preview', async (req, res) => {
    console.log('👁️ Preview requested');
    try {
        const targetPath = req.body?.path;
        if (!targetPath) throw new Error('Path is required');
        if (!fs.existsSync(targetPath)) throw new Error('Path does not exist');
        
        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) throw new Error('Path is not a directory');

        const files = fs.readdirSync(targetPath)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .map((name) => {
                const full = path.join(targetPath, name);
                const s = fs.statSync(full);
                return { name, full, mtimeMs: s.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
            
        if (!files.length) throw new Error('No images found');

        const latest = files[0];
        const buf = fs.readFileSync(latest.full);
        const ext = latest.name.split('.').pop()?.toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

        res.json({
            fileName: latest.name,
            image: `data:${mime};base64,${buf.toString('base64')}`,
            meta: null,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: errorMessage });
    }
});

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running at http://${HOST}:${PORT}`);
    console.log(`📊 Health check available at http://${HOST}:${PORT}/health`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 Railway PORT: ${process.env.PORT || 'not set'}`);
});
