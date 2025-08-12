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

// Get available profiles endpoint
app.get('/railway-profiles', (req, res) => {
    console.log('👥 Railway profiles requested');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.json([]);
        }
        
        // Read gallery data
        const content = fs.readFileSync(galleryPath, 'utf-8');
        const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (!match) {
            return res.json([]);
        }
        
        const data = JSON.parse(match[1]);
        
        // Extract unique profile names
        const profiles = [...new Set(data.map(item => item.profileName).filter(Boolean))];
        
        res.json(profiles);
        
    } catch (error) {
        console.error('[DEBUG] Railway profiles error:', error);
        res.json([]);
    }
});

// Download gallery endpoint
app.get('/download-gallery', (req, res) => {
    console.log('📄 Download gallery requested');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.status(404).json({ error: 'No gallery found. Generate some images first!' });
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', 'attachment; filename="gallery.html"');
        
        const galleryContent = fs.readFileSync(galleryPath, 'utf-8');
        res.send(galleryContent);
        
    } catch (error) {
        console.error('[DEBUG] Download gallery error:', error);
        res.status(500).json({ error: 'Failed to download gallery' });
    }
});

// Railway gallery data endpoint (JSON) - with profile filtering
app.get('/railway-gallery-data/:profileName?', (req, res) => {
    console.log('📊 Railway gallery data requested for profile:', req.params.profileName || 'all');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.json([]);
        }
        
        // Read gallery data
        const content = fs.readFileSync(galleryPath, 'utf-8');
        const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (!match) {
            return res.json([]);
        }
        
        let data = JSON.parse(match[1]);
        
        // Filter by profile name if specified
        if (req.params.profileName && req.params.profileName !== 'public') {
            data = data.filter(item => item.profileName === req.params.profileName);
        }
        
        res.json(data);
        
    } catch (error) {
        console.error('[DEBUG] Railway gallery data error:', error);
        res.json([]);
    }
});

// Railway gallery data endpoint (JSON) - legacy endpoint for all photos
app.get('/railway-gallery-data', (req, res) => {
    console.log('📊 Railway gallery data requested (all photos)');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.json([]);
        }
        
        // Read gallery data
        const content = fs.readFileSync(galleryPath, 'utf-8');
        const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (!match) {
            return res.json([]);
        }
        
        const data = JSON.parse(match[1]);
        res.json(data);
        
    } catch (error) {
        console.error('[DEBUG] Railway gallery data error:', error);
        res.json([]);
    }
});

// Bulk download endpoint for Railway
app.get('/bulk-download', (req, res) => {
    console.log('📦 Bulk download requested');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.status(404).json({ error: 'No gallery found. Generate some images first!' });
        }
        
        // Read gallery data
        const content = fs.readFileSync(galleryPath, 'utf-8');
        const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (!match) {
            return res.status(404).json({ error: 'No gallery data found' });
        }
        
        const data = JSON.parse(match[1]);
        
        // Try to use archiver, fallback to individual downloads
        try {
            const archiver = require('archiver');
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            res.attachment('imagefx-gallery.zip');
            archive.pipe(res);
            
            // Add all images to ZIP
            data.forEach(item => {
                if (item.encodedImage) {
                    const buffer = Buffer.from(item.encodedImage, 'base64');
                    archive.append(buffer, { name: item.fileName });
                }
            });
            
            // Add gallery.html to ZIP
            if (fs.existsSync(galleryPath)) {
                const galleryContent = fs.readFileSync(galleryPath, 'utf-8');
                archive.append(galleryContent, { name: 'gallery.html' });
            }
            
            archive.finalize();
        } catch (archiverError) {
            console.error('[DEBUG] Archiver not available, redirecting to gallery:', archiverError);
            // Fallback: redirect to gallery where individual downloads are available
            res.redirect('/railway-gallery');
        }
        
    } catch (error) {
        console.error('[DEBUG] Bulk download error:', error);
        res.status(500).json({ error: 'Failed to create bulk download' });
    }
});

// Railway gallery endpoint
app.get('/railway-gallery', (req, res) => {
    console.log('🖼️ Railway gallery requested');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.status(404).json({ error: 'No gallery found. Generate some images first!' });
        }
        
        const galleryContent = fs.readFileSync(galleryPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html');
        res.send(galleryContent);
    } catch (error) {
        console.error('[DEBUG] Railway gallery error:', error);
        res.status(500).json({ error: 'Failed to load gallery' });
    }
});

// Download image endpoint
app.get('/download/:path(*)', (req, res) => {
    console.log('💾 Download requested for:', req.params.path);
    try {
        const decodedPath = decodeURIComponent(req.params.path);
        
        if (!fs.existsSync(decodedPath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const stat = fs.statSync(decodedPath);
        if (!stat.isFile()) {
            return res.status(400).json({ error: 'Not a file' });
        }
        
        const fileName = path.basename(decodedPath);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        const fileStream = fs.createReadStream(decodedPath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('[DEBUG] Download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Gallery endpoint to serve gallery.html files
app.get('/gallery/:path(*)', (req, res) => {
    console.log('🖼️ Gallery requested for path:', req.params.path);
    try {
        const decodedPath = decodeURIComponent(req.params.path);
        const galleryPath = path.join(decodedPath, 'gallery.html');
        
        if (!fs.existsSync(galleryPath)) {
            return res.status(404).json({ error: 'Gallery not found' });
        }
        
        const galleryContent = fs.readFileSync(galleryPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html');
        res.send(galleryContent);
    } catch (error) {
        console.error('[DEBUG] Gallery error:', error);
        res.status(500).json({ error: 'Failed to load gallery' });
    }
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

    // Check if this is an API key (starts with AIza) or access token
    const isApiKey = authorization.startsWith('AIza');
    
    return new Promise((resolve, reject) => {
        console.log(`[DEBUG] Making request with ${isApiKey ? 'API Key' : 'Access Token'}`);
        console.log(`[DEBUG] Authorization: ${isApiKey ? `Bearer ${authorization.substring(0, 20)}...` : authorization.substring(0, 20) + '...'}`);
        console.log(`[DEBUG] Tool: ${tool}, Model: ${modelNameType}`);
        
        if (isApiKey) {
            // Use Google's Generative AI Images API for API keys
            const modelPath = modelNameType === 'IMAGEN_4_0'
                ? 'models/imagen-4.0-generate-preview-06-06'
                : 'models/imagen-3.0-generate-002';

            const body = {
                prompt: { text: prompt },
                imageGenerationConfig: { numberOfImages: imageCount },
            };

            const doPost = async (url, payload) => {
                console.log(`[DEBUG] POST ${url}`);
                console.log(`[DEBUG] Body:`, JSON.stringify(payload, null, 2));
                
                const response = await makeRequest({
                    reqURL: url,
                    authorization,
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                
                console.log(`[DEBUG] Response:`, JSON.stringify(response, null, 2));
                if (response.error) throw response;
                return response;
            };

            (async () => {
                try {
                    // 1) models/{model}:generateImages
                    const url1 = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateImages`;
                    const data1 = await doPost(url1, body);
                    const images1 = (data1.images || data1.generatedImages || []);
                    if (images1.length > 0) {
                        const converted = {
                            imagePanels: [{
                                prompt,
                                generatedImages: images1.map((img, index) => ({
                                    encodedImage: img?.image?.imageBytes || img?.image?.image_bytes || img?.inlineData?.data || '',
                                    seed: seed || Math.floor(Math.random() * 1000000),
                                    mediaGenerationId: `genai-${Date.now()}-${index}`,
                                    isMaskEditedImage: false,
                                    modelNameType: modelNameType,
                                    workflowId: 'generative-ai-images',
                                    fingerprintLogRecordId: 'genai-images',
                                })),
                            }],
                        };
                        resolve(converted);
                        return;
                    }
                    console.log('[DEBUG] No images in generateImages; trying images:generate ...');
                    // 2) images:generate
                    const url2 = `https://generativelanguage.googleapis.com/v1beta/images:generate`;
                    const data2 = await doPost(url2, { ...body, model: modelPath });
                    const images2 = (data2.images || data2.generatedImages || []);
                    if (images2.length === 0) throw { error: { code: 500, message: 'Images API returned no images', status: 'NO_IMAGES' } };
                    const converted2 = {
                        imagePanels: [{
                            prompt,
                            generatedImages: images2.map((img, index) => ({
                                encodedImage: img?.image?.imageBytes || img?.image?.image_bytes || img?.inlineData?.data || '',
                                seed: seed || Math.floor(Math.random() * 1000000),
                                mediaGenerationId: `genai-${Date.now()}-${index}`,
                                isMaskEditedImage: false,
                                modelNameType: modelNameType,
                                workflowId: 'generative-ai-images',
                                fingerprintLogRecordId: 'genai-images',
                            })),
                        }],
                    };
                    resolve(converted2);
                } catch (err) {
                    console.log('[DEBUG] Images API attempts failed:', err);
                    reject(err);
                }
            })();
        } else {
            // Use ImageFX API for access tokens - CORRECT FORMAT
            const requestBody = {
                userInput: {
                    candidatesCount: imageCount,
                    prompts: [prompt],
                    seed: seed,
                },
                clientContext: {
                    sessionId: ";1740656431200",
                    tool: tool,
                },
                modelInput: {
                    modelNameType: modelNameType,
                },
                aspectRatio: aspectRatio,
            };

            console.log('[DEBUG] Using ImageFX API with OAuth token');
            console.log('[DEBUG] Request body:', JSON.stringify(requestBody, null, 2));

            makeRequest({
                reqURL: "https://aisandbox-pa.googleapis.com/v1:runImageFx",
                authorization,
                method: "POST",
                body: JSON.stringify(requestBody)
            })
            .then((response) => {
                console.log(`[DEBUG] ImageFX Response received:`, JSON.stringify(response, null, 2));
                if (response.error) {
                    console.log(`[DEBUG] Error in response:`, response.error);
                    reject(response);
                } else {
                    console.log(`[DEBUG] ImageFX Success response`);
                    resolve(response);
                }
            })
            .catch((error) => {
                console.log(`[DEBUG] ImageFX Request failed:`, error);
                reject(error);
            });
        }
    });
};

// Generate endpoint with real functionality
app.post('/generate', async (req, res) => {
    console.log('🖼️ Generate requested');
    const { prompt, folderName, authToken, authFile, generationCount, imageCount, aspectRatio, outputDir, proxy, seed, model, noFallback, profileName } = req.body;
    
    // Check if we're on Railway (ephemeral file system)
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
    
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

        // Create output directory if it doesn't exist (for local development)
        if (!isRailway && !fs.existsSync(outputDir)) {
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
            
            // Create folder-specific output directory (for local development)
            const finalOutputDir = folderName && folderName.trim() !== '' 
                ? path.join(outputDir, folderName.trim()) 
                : outputDir;

            console.log('[DEBUG] Final output directory:', finalOutputDir);
            
            if (!isRailway) {
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
            }

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
                        
                        console.log('[DEBUG] Processing image:', imageName);
                        console.log('[DEBUG] Image data length:', image.encodedImage?.length || 0);
                        
                        try {
                            if (isRailway) {
                                // On Railway: Save temporarily and provide download link
                                const tempDir = path.join(process.cwd(), 'temp_images');
                                if (!fs.existsSync(tempDir)) {
                                    fs.mkdirSync(tempDir, { recursive: true });
                                }
                                
                                const tempPath = path.join(tempDir, imageName);
                                if (saveImage(imageName, image.encodedImage, tempDir)) {
                                    console.log('[DEBUG] Image saved temporarily for download:', imageName);
                                    
                                    const downloadUrl = `/download/${encodeURIComponent(tempPath)}`;
                                    const meta = {
                                        fileName: imageName,
                                        prompt: prompt,
                                        seed: seed,
                                        aspectRatio: aspectRatio,
                                        generationNumber: gen + 1,
                                        imageNumber: currentNum,
                                        savedAt: new Date().toISOString(),
                                        mediaGenerationId: image.mediaGenerationId || null,
                                        model: selectedModel === 'IMAGEN_4_0' ? 'Best (Imagen 4)' : 'Quality (Imagen 3)',
                                        downloadUrl: downloadUrl,
                                        encodedImage: image.encodedImage, // Include the image data for gallery display
                                        profileName: profileName || 'anonymous', // Add profile name
                                        isRailway: true
                                    };
                                    newEntries.push(meta);
                                    
                                    res.write(JSON.stringify({ 
                                        type: 'progress', 
                                        data: `Generated image ${currentNum}: ${imageName} (Click to download)` 
                                    }) + '\n');
                                }
                            } else {
                                // Local development: Save to file system
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
                                        model: selectedModel === 'IMAGEN_4_0' ? 'Best (Imagen 4)' : 'Quality (Imagen 3)',
                                        isRailway: false
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
                            }
                        } catch (error) {
                            console.error('[DEBUG] Error processing image:', error);
                            res.write(JSON.stringify({ 
                                type: 'error', 
                                data: `Error processing image ${currentNum}: ${error.message}` 
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
                if (isRailway) {
                    // On Railway: Create profile-based gallery
                    const tempDir = path.join(process.cwd(), 'temp_images');
                    const galleryPath = path.join(tempDir, 'gallery.html');
                    let data = [];
                    
                    if (fs.existsSync(galleryPath)) {
                        try {
                            const content = fs.readFileSync(galleryPath, 'utf-8');
                            const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
                            if (match) {
                                data = JSON.parse(match[1]);
                            }
                        } catch (error) {
                            console.error('[DEBUG] Error reading existing gallery:', error);
                        }
                    }
                    
                    data = [...data, ...newEntries];
                    
                    // Create the gallery HTML (same as before)
                    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ImageFX Gallery - Railway</title>
    <style>
        :root {
            --bg: #0b0f19;
            --card: #111827;
            --text: #e5e7eb;
            --muted: #94a3b8;
            --border: #1f2937;
            --btn-green: #10b981;
            --btn-green-hover: #059669;
            --border-green: #10b981;
            --green: #10b981;
            --btn-purple: #8b5cf6;
            --btn-purple-hover: #7c3aed;
            --border-purple: #8b5cf6;
            --purple: #8b5cf6;
            --btn-red: #ef4444;
            --btn-red-hover: #dc2626;
            --border-red: #ef4444;
            --red: #ef4444;
            --red-2: #fecaca;
            --input: #1f2937;
            --bg-elev: #1f2937;
        }
        
        body { 
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; 
            margin: 0; 
            background: var(--bg); 
            color: var(--text);
            line-height: 1.5;
        }
        
        .app { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        .header { 
            text-align: center; 
            margin-bottom: 30px; 
            padding: 20px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
        }
        
        .header h1 { margin: 0 0 10px; font-size: 24px; font-weight: 600; }
        
        .railway-note { 
            background: #ff9800; 
            color: #000; 
            padding: 12px; 
            border-radius: 8px; 
            margin-bottom: 20px; 
            text-align: center;
            font-weight: 500;
        }
        
        .bulk-controls { 
            background: var(--card); 
            padding: 16px; 
            border-radius: 12px; 
            margin-bottom: 20px;
            border: 1px solid var(--border);
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            background: var(--btn-green);
            color: var(--green);
            border: 1px solid var(--border-green);
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            text-decoration: none;
            display: inline-block;
        }
        
        .btn:hover { background: var(--btn-green-hover); }
        
        .btn-purple { 
            background: var(--btn-purple); 
            color: var(--purple); 
            border-color: var(--border-purple); 
        }
        
        .btn-purple:hover { background: var(--btn-purple-hover); }
        
        .btn-blue { 
            background: #2196F3; 
            color: white; 
            border-color: #2196F3; 
        }
        
        .btn-blue:hover { background: #1976D2; }
        
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); 
            gap: 16px; 
        }
        
        .card { 
            background: var(--card); 
            border: 1px solid var(--border); 
            border-radius: 12px; 
            padding: 12px;
            transition: all 0.2s ease;
            cursor: pointer;
            position: relative;
        }
        
        .card:hover { 
            border-color: var(--border-green);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        }
        
        .card.selected {
            border-color: var(--btn-purple);
            background: color-mix(in oklab, var(--card) 90%, var(--purple) 10%);
        }
        
        .card img { 
            width: 100%; 
            height: 200px; 
            object-fit: cover; 
            border-radius: 8px; 
            margin-bottom: 12px;
            border: 1px solid var(--border);
        }
        
        .meta { 
            font-size: 13px; 
            color: var(--muted); 
            margin-bottom: 12px;
            line-height: 1.4;
        }
        
        .meta strong { color: var(--text); display: block; margin-bottom: 4px; }
        
        .download-btn { 
            background: var(--btn-green); 
            color: var(--green); 
            border: 1px solid var(--border-green); 
            padding: 8px 16px; 
            border-radius: 6px; 
            cursor: pointer; 
            text-decoration: none; 
            display: inline-block; 
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        
        .download-btn:hover { background: var(--btn-green-hover); }
        
        .checkbox { 
            position: absolute; 
            top: 8px; 
            left: 8px; 
            width: 20px; 
            height: 20px; 
            cursor: pointer;
            z-index: 10;
        }
        
        .selection-info {
            background: var(--card);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            border: 1px solid var(--border);
            text-align: center;
            color: var(--muted);
        }
        
        @media (max-width: 768px) {
            .grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
            .bulk-controls { flex-direction: column; align-items: center; }
        }
    </style>
</head>
<body>
    <div class="app">
        <div class="header">
            <h1>ImageFX Gallery</h1>
            <div class="railway-note">⚠️ Railway Environment: Images are temporary. Download them before they expire!</div>
        </div>
        
        <div class="selection-info" id="selectionInfo">
            Click images to select them. Use Ctrl/Cmd+Click for multiple selection.
        </div>
        
        <div class="bulk-controls">
            <button class="btn btn-blue" onclick="selectAll()">Select All</button>
            <button class="btn" onclick="downloadAll()">Download All (${data.length})</button>
            <button class="btn btn-purple" onclick="downloadSelected()">Download Selected</button>
            <button class="btn btn-purple" onclick="downloadZip()">Download ZIP</button>
            <button class="btn" onclick="downloadGallery()">Download Gallery.html</button>
        </div>
        
        <div class="grid">
            ${data.map((item, index) => `
                <div class="card" data-index="${index}" onclick="toggleSelection(event, ${index})">
                    <input type="checkbox" class="checkbox" id="img-${index}" data-url="${item.downloadUrl}" data-filename="${item.fileName}" onclick="event.stopPropagation()">
                    <img src="data:image/png;base64,${item.encodedImage || ''}" alt="${item.fileName}" onerror="this.style.display='none'">
                    <div class="meta">
                        <strong>${item.fileName}</strong>
                        Prompt: ${item.prompt}<br>
                        Seed: ${item.seed || 'Random'}<br>
                        Model: ${item.model}<br>
                        Generated: ${new Date(item.savedAt).toLocaleString()}
                    </div>
                    <a href="${item.downloadUrl}" class="download-btn" download="${item.fileName}" onclick="event.stopPropagation()">Download Image</a>
                </div>
            `).join('')}
        </div>
    </div>
    
    <script>
        let selectedItems = new Set();
        
        function updateSelectionInfo() {
            const info = document.getElementById('selectionInfo');
            if (selectedItems.size === 0) {
                info.textContent = 'Click images to select them. Use Ctrl/Cmd+Click for multiple selection.';
            } else {
                info.textContent = \`\${selectedItems.size} image(s) selected. Use Ctrl/Cmd+Click for multiple selection.\`;
            }
        }
        
        function toggleSelection(event, index) {
            const card = event.currentTarget;
            const checkbox = document.getElementById(\`img-\${index}\`);
            
            if (event.ctrlKey || event.metaKey) {
                // Multi-select mode
                if (selectedItems.has(index)) {
                    selectedItems.delete(index);
                    card.classList.remove('selected');
                    checkbox.checked = false;
                } else {
                    selectedItems.add(index);
                    card.classList.add('selected');
                    checkbox.checked = true;
                }
            } else {
                // Single select mode
                selectedItems.clear();
                document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                document.querySelectorAll('.checkbox').forEach(c => c.checked = false);
                
                selectedItems.add(index);
                card.classList.add('selected');
                checkbox.checked = true;
            }
            
            updateSelectionInfo();
        }
        
        function selectAll() {
            const checkboxes = document.querySelectorAll('.checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            
            selectedItems.clear();
            document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
            
            checkboxes.forEach((cb, index) => {
                cb.checked = !allChecked;
                if (!allChecked) {
                    selectedItems.add(index);
                    cb.closest('.card').classList.add('selected');
                }
            });
            
            updateSelectionInfo();
        }
        
        function downloadAll() {
            const items = ${JSON.stringify(data)};
            items.forEach(item => {
                const link = document.createElement('a');
                link.href = item.downloadUrl;
                link.download = item.fileName;
                link.click();
            });
        }
        
        function downloadSelected() {
            const items = ${JSON.stringify(data)};
            selectedItems.forEach(index => {
                const item = items[index];
                const link = document.createElement('a');
                link.href = item.downloadUrl;
                link.download = item.fileName;
                link.click();
            });
        }
        
        function downloadZip() {
            window.location.href = '/bulk-download';
        }
        
        function downloadGallery() {
            const link = document.createElement('a');
            link.href = window.location.href;
            link.download = 'imagefx-gallery.html';
            link.click();
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                selectAll();
            }
            if (e.key === 'Escape') {
                selectedItems.clear();
                document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                document.querySelectorAll('.checkbox').forEach(c => c.checked = false);
                updateSelectionInfo();
            }
        });
        
        updateSelectionInfo();
    </script>
    
    <script id="gallery-data" type="application/json">${JSON.stringify(data)}</script>
</body>
</html>`;
                    
                    fs.writeFileSync(galleryPath, html, { encoding: 'utf-8' });
                    res.write(JSON.stringify({ type: 'progress', data: 'Updated gallery.html (Railway)' }) + '\n');
                } else {
                    // Local development: Update existing gallery
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
                            console.error('[DEBUG] Error reading existing gallery:', error);
                        }
                    }
                    
                    data = [...data, ...newEntries];
                    
                    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ImageFX Gallery</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: #fff; }
        .header { text-align: center; margin-bottom: 30px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #2a2a2a; border-radius: 10px; padding: 15px; border: 1px solid #333; }
        .card img { width: 100%; height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 10px; }
        .meta { font-size: 12px; color: #ccc; margin-bottom: 10px; }
        .download-btn { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 10px; }
        .download-btn:hover { background: #45a049; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ImageFX Gallery</h1>
    </div>
    <div class="grid">
        ${data.map(item => `
            <div class="card">
                <img src="data:image/png;base64,${item.encodedImage || ''}" alt="${item.fileName}" onerror="this.style.display='none'">
                <div class="meta">
                    <strong>${item.fileName}</strong><br>
                    Prompt: ${item.prompt}<br>
                    Seed: ${item.seed || 'Random'}<br>
                    Model: ${item.model}<br>
                    Generated: ${new Date(item.savedAt).toLocaleString()}
                </div>
                <a href="/download/${encodeURIComponent(path.join(finalOutputDir, item.fileName))}" class="download-btn" download="${item.fileName}">Download Image</a>
            </div>
        `).join('')}
    </div>
    <script id="gallery-data" type="application/json">${JSON.stringify(data)}</script>
</body>
</html>`;
                    
                    fs.writeFileSync(galleryPath, html, { encoding: 'utf-8' });
                    res.write(JSON.stringify({ type: 'progress', data: 'Updated gallery.html' }) + '\n');
                }
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

        // Get folder contents for display
        const files = fs.readdirSync(targetPath)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .map((name) => {
                const full = path.join(targetPath, name);
                const s = fs.statSync(full);
                return { 
                    name, 
                    size: s.size, 
                    mtime: new Date(s.mtimeMs).toISOString(),
                    path: full
                };
            })
            .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

        // Check if gallery.html exists
        const galleryPath = path.join(targetPath, 'gallery.html');
        const hasGallery = fs.existsSync(galleryPath);

        res.json({ 
            status: 'ok', 
            message: 'Folder opened successfully',
            path: targetPath,
            fileCount: files.length,
            files: files.slice(0, 10), // Show first 10 files
            hasGallery: hasGallery,
            galleryUrl: hasGallery ? `/gallery/${encodeURIComponent(targetPath)}` : null,
            note: 'In containerized environments, folders are accessed via the web interface. Use "Scan Folder" to view contents.'
        });
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
