const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());

// Map UI aspect ratios to API aspect ratios
const aspectRatioMap = {
    'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'square': 'IMAGE_ASPECT_RATIO_SQUARE',
    'mobile_portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'mobile_landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE'
};

// Make request function
function makeRequest({ reqURL, authorization, method, body }) {
    return new Promise((resolve, reject) => {
        const url = new URL(reqURL);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorization
            }
        };

        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    resolve({ error: 'Invalid JSON response', data: data });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

// Generate image function
const generateImage = async ({ prompt, authorization, imageCount, seed, aspectRatio, modelNameType, tool, proxy }) => {
    return new Promise((resolve, reject) => {
        console.log('[DEBUG] generateImage called with:', {
            prompt,
            imageCount,
            seed,
            aspectRatio,
            modelNameType,
            tool
        });

        // Check if it's an API key (starts with AIza)
        if (authorization.startsWith('AIza')) {
            console.log('[DEBUG] Using Google Generative AI API with API key');
            
            // Use Google Generative AI API
            const modelPath = modelNameType === 'IMAGEN_4_0' ? 'imagen-4' : 'imagen-3';
            const body = {
                prompt: prompt,
                candidatesCount: imageCount,
                aspectRatio: aspectRatio,
                seed: seed || Math.floor(Math.random() * 1000000)
            };

            // Try both API endpoints
            (async () => {
                try {
                    // 1) imagen-4:generateImages
                    const url1 = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateImages`;
                    const data1 = await makeRequest({
                        reqURL: url1,
                        authorization: `X-goog-api-key: ${authorization}`,
                        method: 'POST',
                        body: JSON.stringify(body)
                    });
                    
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
                    const data2 = await makeRequest({
                        reqURL: url2,
                        authorization: `X-goog-api-key: ${authorization}`,
                        method: 'POST',
                        body: JSON.stringify({ ...body, model: modelPath })
                    });
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
                authorization: `Bearer ${authorization}`,
                method: "POST",
                body: JSON.stringify(requestBody)
            })
            .then((response) => {
                console.log(`[DEBUG] ImageFX Response received:`, JSON.stringify(response, null, 2));
                if (response.error) {
                    console.log(`[DEBUG] Error in response:`, response.error);
                    
                    // Handle specific authentication errors
                    if (response.error.code === 401) {
                        console.log('[DEBUG] Authentication failed. Please check:');
                        console.log('[DEBUG] 1. Token is valid and not expired');
                        console.log('[DEBUG] 2. Token has proper ImageFX permissions');
                        console.log('[DEBUG] 3. Token format is correct');
                        reject(new Error(`Authentication failed: ${response.error.message}`));
                    } else {
                        reject(response);
                    }
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

// Generate endpoint
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

        // Debug auth token (show first 10 chars for security)
        console.log('[DEBUG] Auth token type:', finalAuthToken.startsWith('AIza') ? 'Google API Key' : 'OAuth Token');
        console.log('[DEBUG] Auth token preview:', finalAuthToken.substring(0, 10) + '...');
        console.log('[DEBUG] Auth token length:', finalAuthToken.length);

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
            
            // Create folder-specific output directory
            const finalOutputDir = folderName && folderName.trim() !== '' 
                ? path.join(outputDir, folderName.trim()) 
                : outputDir;

            let imageNumber = 1;
            const newEntries = [];
            
            for (const panel of response.imagePanels) {
                for (const image of panel.generatedImages) {
                    const currentNum = imageNumber;
                    const imageName = `${timestamp}-generation-${gen + 1}-${currentNum}-${aspectRatio}.png`;
                    imageNumber++;
                    
                    // Generate seed if not provided
                    const finalSeed = image.seed || seed || Math.floor(Math.random() * 1000000);
                    
                    if (isRailway) {
                        // On Railway: Save to temp_images directory
                        const tempDir = path.join(process.cwd(), 'temp_images');
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        
                        const imagePath = path.join(tempDir, imageName);
                        const imageBuffer = Buffer.from(image.encodedImage, 'base64');
                        fs.writeFileSync(imagePath, imageBuffer);
                        
                        const downloadUrl = `/download/${encodeURIComponent(imageName)}`;
                        
                        const meta = {
                            fileName: imageName,
                            prompt: prompt,
                            seed: finalSeed,
                            aspectRatio: aspectRatio,
                            generationNumber: gen + 1,
                            imageNumber: currentNum,
                            savedAt: new Date().toISOString(),
                            mediaGenerationId: image.mediaGenerationId || null,
                            model: selectedModel === 'IMAGEN_4_0' ? 'Best (Imagen 4)' : 'Quality (Imagen 3)',
                            downloadUrl: downloadUrl,
                            encodedImage: image.encodedImage,
                            isRailway: true,
                            profileName: profileName || 'default'
                        };
                        newEntries.push(meta);
                        
                        res.write(JSON.stringify({ 
                            type: 'progress', 
                            data: `Saved image ${currentNum}: ${imageName}` 
                        }) + '\n');
                    } else {
                        // Local development: Save to output directory
                        if (!fs.existsSync(finalOutputDir)) {
                            fs.mkdirSync(finalOutputDir, { recursive: true });
                        }
                        
                        const imagePath = path.join(finalOutputDir, imageName);
                        const imageBuffer = Buffer.from(image.encodedImage, 'base64');
                        fs.writeFileSync(imagePath, imageBuffer);
                        
                        const meta = {
                            fileName: imageName,
                            prompt: prompt,
                            seed: finalSeed,
                            aspectRatio: aspectRatio,
                            generationNumber: gen + 1,
                            imageNumber: currentNum,
                            savedAt: new Date().toISOString(),
                            mediaGenerationId: image.mediaGenerationId || null,
                            model: selectedModel === 'IMAGEN_4_0' ? 'Best (Imagen 4)' : 'Quality (Imagen 3)',
                            isRailway: false,
                            profileName: profileName || 'default'
                        };
                        newEntries.push(meta);
                        
                        res.write(JSON.stringify({ 
                            type: 'progress', 
                            data: `Saved image ${currentNum}: ${imageName}` 
                        }) + '\n');
                    }
                }
            }

            res.write(JSON.stringify({ 
                type: 'progress', 
                data: `Completed generation ${gen + 1} of ${generationCount}` 
            }) + '\n');
        }

        res.write(JSON.stringify({ type: 'complete', data: 'All generations completed successfully' }) + '\n');
        res.end();
        
    } catch (error) {
        console.error('[DEBUG] Generate error:', error);
        res.write(JSON.stringify({ type: 'error', data: error.message }) + '\n');
        res.end();
    }
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
    console.log('📥 Download requested:', req.params.filename);
    try {
        const filename = req.params.filename;
        const tempDir = path.join(process.cwd(), 'temp_images');
        const filePath = path.join(tempDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.download(filePath);
    } catch (error) {
        console.error('[DEBUG] Download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
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

// Start the server
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`🏥 Health check available at http://${HOST}:${PORT}/health`);
    console.log(`🖼️ Main app available at http://${HOST}:${PORT}/`);
});
