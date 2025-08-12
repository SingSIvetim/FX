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

// Profile photos endpoint
app.post('/profile-photos', (req, res) => {
    console.log('👤 Profile photos requested');
    try {
        const { profileName } = req.body;
        if (!profileName) {
            return res.status(400).json({ error: 'Profile name is required' });
        }
        
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
        
        // Filter by profile name - only show photos that match the requested profile
        const profilePhotos = data.filter(item => {
            // Check if the image was generated with this profile name
            // We'll use the fileName or metadata to determine the profile
            if (item.profileName) {
                return item.profileName.toLowerCase() === profileName.toLowerCase();
            }
            
            // Fallback: check if the fileName contains the profile name
            // This assumes the fileName format includes the profile name
            const fileName = item.fileName || '';
            return fileName.toLowerCase().includes(profileName.toLowerCase());
        });
        
        console.log(`[DEBUG] Profile "${profileName}" requested, found ${profilePhotos.length} photos out of ${data.length} total`);
        
        res.json(profilePhotos);
        
    } catch (error) {
        console.error('[DEBUG] Profile photos error:', error);
        res.json([]);
    }
});

// Public photos endpoint
app.get('/public-photos', (req, res) => {
    console.log('🌐 Public photos requested');
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
        
        // Return all photos as public
        res.json(data);
        
    } catch (error) {
        console.error('[DEBUG] Public photos error:', error);
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

// Railway gallery data endpoint
app.get('/railway-gallery-data', (req, res) => {
    console.log('📊 Railway gallery data requested');
    try {
        const tempDir = path.join(process.cwd(), 'temp_images');
        const galleryPath = path.join(tempDir, 'gallery.html');
        
        console.log('[DEBUG] Looking for gallery at:', galleryPath);
        console.log('[DEBUG] Gallery exists:', fs.existsSync(galleryPath));
        
        if (!fs.existsSync(galleryPath)) {
            console.log('[DEBUG] No gallery file found, returning empty array');
            return res.json([]);
        }
        
        // Read gallery data
        const content = fs.readFileSync(galleryPath, 'utf-8');
        console.log('[DEBUG] Gallery file size:', content.length);
        
        const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (!match) {
            console.log('[DEBUG] No gallery data script tag found');
            return res.json([]);
        }
        
        const data = JSON.parse(match[1]);
        console.log('[DEBUG] Found', data.length, 'images in gallery data');
        
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
                                        isRailway: true,
                                        profileName: profileName || 'default' // Add profile name to metadata
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
                                        isRailway: false,
                                        profileName: profileName || 'default' // Add profile name to local metadata
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
                    // On Railway: Create temporary gallery
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
                    
                    console.log('[DEBUG] Total images in gallery:', data.length);
                    console.log('[DEBUG] New entries added:', newEntries.length);
                    
                    // Read the template file
                    const templatePath = path.join(process.cwd(), 'railway-gallery-template.html');
                    let html = '';
                    
                    if (fs.existsSync(templatePath)) {
                        html = fs.readFileSync(templatePath, 'utf-8');
                        // Replace the empty gallery data with actual data
                        html = html.replace('<script id="gallery-data" type="application/json">[]</script>', 
                                           `<script id="gallery-data" type="application/json">${JSON.stringify(data)}</script>`);
                        console.log('[DEBUG] Template loaded and data injected');
                    } else {
                        console.log('[DEBUG] Template file not found, using fallback');
                        // Fallback to inline template if file doesn't exist
                        html = `<!DOCTYPE html>
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
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; 
            background: var(--bg); 
            color: var(--text);
            padding: 20px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            color: var(--text);
        }
        
        .profile-controls {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .profile-controls h3 {
            margin-bottom: 15px;
            color: var(--text);
        }
        
        .profile-input {
            display: flex;
            gap: 10px;
            justify-content: center;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .profile-input input {
            background: var(--input);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px 15px;
            color: var(--text);
            font-size: 14px;
            min-width: 200px;
        }
        
        .profile-input input:focus {
            outline: none;
            border-color: var(--btn-green);
        }
        
        .btn {
            background: var(--btn-green);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        
        .btn:hover {
            background: var(--btn-green-hover);
        }
        
        .btn-purple {
            background: var(--btn-purple);
        }
        
        .btn-purple:hover {
            background: var(--btn-purple-hover);
        }
        
        .btn-red {
            background: var(--btn-red);
        }
        
        .btn-red:hover {
            background: var(--btn-red-hover);
        }
        
        .gallery-controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .selection-info {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px 15px;
            font-size: 14px;
        }
        
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .gallery-item {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.2s;
            cursor: pointer;
            position: relative;
        }
        
        .gallery-item:hover {
            border-color: var(--btn-green);
            transform: translateY(-2px);
        }
        
        .gallery-item.selected {
            border-color: var(--btn-purple);
            box-shadow: 0 0 0 2px var(--btn-purple);
        }
        
        .gallery-item img {
            width: 100%;
            height: 200px;
            object-fit: cover;
            display: block;
        }
        
        .gallery-item-info {
            padding: 12px;
        }
        
        .gallery-item-title {
            font-size: 12px;
            color: var(--text);
            margin-bottom: 5px;
            font-weight: 500;
        }
        
        .gallery-item-meta {
            font-size: 11px;
            color: var(--muted);
            line-height: 1.4;
        }
        
        .no-photos {
            text-align: center;
            padding: 40px;
            color: var(--muted);
            font-size: 16px;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--muted);
        }
        
        @media (max-width: 768px) {
            .gallery-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 10px;
            }
            
            .gallery-controls {
                flex-direction: column;
                align-items: stretch;
            }
            
            .profile-input {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 ImageFX Gallery</h1>
        <p>View and download your generated images</p>
    </div>
    
    <div class="profile-controls">
        <h3>🔒 Profile Privacy Control</h3>
        <div class="profile-input">
            <input type="text" id="profileName" placeholder="Enter your profile name for privacy" />
            <button class="btn" onclick="loadProfilePhotos()">View My Photos</button>
            <button class="btn btn-purple" onclick="loadPublicPhotos()">View Public Photos</button>
        </div>
        <p style="font-size: 12px; color: var(--muted);">
            Enter your profile name to view only your photos, or click "Public Photos" to see all images.
        </p>
    </div>
    
    <div class="gallery-controls">
        <div class="selection-info" id="selectionInfo">
            No images selected
        </div>
        <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="selectAll()">Select All</button>
            <button class="btn btn-purple" onclick="downloadSelected()">Download Selected</button>
            <button class="btn btn-purple" onclick="downloadAll()">Download All</button>
            <button class="btn btn-red" onclick="clearSelection()">Clear Selection</button>
        </div>
    </div>
    
    <div id="galleryGrid" class="gallery-grid">
        <div class="loading">Enter your profile name or click "Public Photos" to view images</div>
    </div>
    
    <script>
        let allImages = [];
        let selectedItems = new Set();
        let currentView = 'none'; // 'profile' or 'public'
        
        async function loadProfilePhotos() {
            const profileName = document.getElementById('profileName').value.trim();
            if (!profileName) {
                alert('Please enter your profile name first.');
                return;
            }
            
            currentView = 'profile';
            await loadPhotos('/profile-photos', { profileName });
        }
        
        async function loadPublicPhotos() {
            currentView = 'public';
            await loadPhotos('/public-photos');
        }
        
        async function loadPhotos(endpoint, body = null) {
            const grid = document.getElementById('galleryGrid');
            grid.innerHTML = '<div class="loading">Loading images...</div>';
            
            try {
                const response = await fetch(endpoint, {
                    method: body ? 'POST' : 'GET',
                    headers: body ? { 'Content-Type': 'application/json' } : {},
                    body: body ? JSON.stringify(body) : null
                });
                
                if (!response.ok) {
                    throw new Error('Failed to load images');
                }
                
                allImages = await response.json();
                
                if (allImages.length === 0) {
                    grid.innerHTML = '<div class="no-photos">No images found</div>';
                    return;
                }
                
                displayImages(allImages);
                
            } catch (error) {
                console.error('Error loading images:', error);
                grid.innerHTML = '<div class="no-photos">Error loading images</div>';
            }
        }
        
        function displayImages(images) {
            const grid = document.getElementById('galleryGrid');
            grid.innerHTML = '';
            
            images.forEach((image, index) => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.onclick = () => toggleSelection(index);
                
                const img = document.createElement('img');
                img.src = image.encodedImage ? \`data:image/png;base64,\${image.encodedImage}\` : '';
                img.alt = image.fileName || 'Generated image';
                
                const info = document.createElement('div');
                info.className = 'gallery-item-info';
                
                const title = document.createElement('div');
                title.className = 'gallery-item-title';
                title.textContent = image.fileName || 'Generated Image';
                
                const meta = document.createElement('div');
                meta.className = 'gallery-item-meta';
                const prompt = image.prompt ? (image.prompt.length > 50 ? image.prompt.slice(0, 50) + '...' : image.prompt) : '';
                const seed = image.seed ? \`Seed: \${image.seed}\` : '';
                const profile = image.profileName ? \`Profile: \${image.profileName}\` : '';
                meta.textContent = [seed, profile, prompt].filter(Boolean).join(' • ');
                
                info.appendChild(title);
                info.appendChild(meta);
                item.appendChild(img);
                item.appendChild(info);
                grid.appendChild(item);
            });
            
            updateSelectionInfo();
        }
        
        function toggleSelection(index) {
            if (selectedItems.has(index)) {
                selectedItems.delete(index);
            } else {
                selectedItems.add(index);
            }
            
            updateSelectionDisplay();
            updateSelectionInfo();
        }
        
        function updateSelectionDisplay() {
            const items = document.querySelectorAll('.gallery-item');
            items.forEach((item, index) => {
                if (selectedItems.has(index)) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        }
        
        function updateSelectionInfo() {
            const info = document.getElementById('selectionInfo');
            if (selectedItems.size === 0) {
                info.textContent = 'No images selected';
            } else if (selectedItems.size === allImages.length) {
                info.textContent = \`All \${allImages.length} images selected\`;
            } else {
                info.textContent = \`\${selectedItems.size} of \${allImages.length} images selected\`;
            }
        }
        
        function selectAll() {
            selectedItems.clear();
            for (let i = 0; i < allImages.length; i++) {
                selectedItems.add(i);
            }
            updateSelectionDisplay();
            updateSelectionInfo();
        }
        
        function clearSelection() {
            selectedItems.clear();
            updateSelectionDisplay();
            updateSelectionInfo();
        }
        
        async function downloadSelected() {
            if (selectedItems.size === 0) {
                alert('Please select images to download');
                return;
            }
            
            const selectedImages = Array.from(selectedItems).map(index => allImages[index]);
            await downloadImages(selectedImages, 'selected-images');
        }
        
        async function downloadAll() {
            if (allImages.length === 0) {
                alert('No images to download');
                return;
            }
            
            await downloadImages(allImages, 'all-images');
        }
        
        async function downloadImages(images, filename) {
            try {
                const response = await fetch('/bulk-download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        images: images.map(img => ({
                            fileName: img.fileName,
                            downloadUrl: img.downloadUrl,
                            encodedImage: img.encodedImage
                        }))
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Download failed');
                }
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`\${filename}-\${new Date().toISOString().slice(0, 10)}.zip\`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
            } catch (error) {
                console.error('Download error:', error);
                alert('Error downloading images');
            }
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSelection();
            } else if (e.ctrlKey || e.metaKey) {
                if (e.key === 'a') {
                    e.preventDefault();
                    selectAll();
                }
            }
        });
        
        // Auto-load public photos on page load
        window.addEventListener('load', () => {
            loadPublicPhotos();
        });
    </script>
    
    <script id="gallery-data" type="application/json">${JSON.stringify(data)}</script>
</body>
</html>`;
                    }
                    
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
