import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import generateImage from '../index';
import { exec } from 'child_process';
import fsSync from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
// Minimal CORS to allow UI opened from other origins (file://, live-server, etc.)
app.use((req: Request, res: Response, next: NextFunction): void => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
app.use(express.static(path.join(__dirname)));

// Serve the main HTML file at root
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

interface GenerateRequest {
    prompt: string;
    folderName?: string;
    authToken?: string;
    authFile?: string;
    generationCount: number;
    imageCount: number;
    aspectRatio: string;
    outputDir: string;
    proxy?: string;
    seed?: number | null;
    model?: 'best' | 'quality';
    noFallback?: boolean;
}

// Map UI aspect ratios to API aspect ratios
const aspectRatioMap: Record<string, 'IMAGE_ASPECT_RATIO_LANDSCAPE' | 'IMAGE_ASPECT_RATIO_PORTRAIT' | 'IMAGE_ASPECT_RATIO_SQUARE'> = {
    'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
    'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'square': 'IMAGE_ASPECT_RATIO_SQUARE',
    'mobile_portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
    'mobile_landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE'
};

// Ensure/update a single gallery.html file in the output directory with aggregated metadata
function upsertGallery(outputDir: string, newEntries: any[]) {
    const galleryPath = path.join(outputDir, 'gallery.html');
    let data: any[] = [];
    if (fsSync.existsSync(galleryPath)) {
        try {
            const content = fsSync.readFileSync(galleryPath, 'utf-8');
            const match = content.match(/<script id="gallery-data" type="application\/json">([\s\S]*?)<\/script>/);
            if (match) {
                data = JSON.parse(match[1]);
            }
        } catch {}
    }
    // Merge by fileName (most recent wins)
    const map = new Map<string, any>();
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
  card.innerHTML = '\n'
    + '    <img class="thumb" src="' + item.fileName + '" alt="' + item.fileName + '">\n'
    + '    <div class="meta">Seed: ' + (item.seed ?? '') + '</div>\n'
    + '    <table>\n'
    + '      <tr><td>Prompt</td><td>' + String(item.prompt||'').replace(/</g,'&lt;') + '</td></tr>\n'
    + '      <tr><td>Saved</td><td>' + item.savedAt + '</td></tr>\n'
    + '      <tr><td>Aspect Ratio</td><td>' + item.aspectRatio + '</td></tr>\n'
    + '      <tr><td>Generation</td><td>' + item.generationNumber + '</td></tr>\n'
    + '      <tr><td>Image #</td><td>' + item.imageNumber + '</td></tr>\n'
    + '      <tr><td>Media ID</td><td>' + (item.mediaGenerationId||'') + '</td></tr>\n'
    + '    </table>';
  grid.appendChild(card);
}
</script>
</div></body></html>`;
    fsSync.writeFileSync(galleryPath, html, { encoding: 'utf-8' });
}

// Preview endpoint - returns the latest image in the folder instead of generating
app.post('/preview', async (req: Request<{}, {}, { path: string }>, res: Response) => {
    console.log('[POST] /preview (folder)');
    try {
        const targetPath = req.body?.path;
        if (!targetPath) throw new Error('Path is required');
        if (!fsSync.existsSync(targetPath)) throw new Error('Path does not exist');
        const stat = fsSync.statSync(targetPath);
        if (!stat.isDirectory()) throw new Error('Path is not a directory');

        const files = fsSync.readdirSync(targetPath)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .map((name) => {
                const full = path.join(targetPath, name);
                const s = fsSync.statSync(full);
                return { name, full, mtimeMs: s.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        if (!files.length) throw new Error('No images found');

        const latest = files[0];
        const buf = fsSync.readFileSync(latest.full);
        const ext = latest.name.split('.').pop()?.toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

        // Try to load adjacent JSON metadata
        let meta: any = null;
        const jsonPath = latest.full.replace(/\.(png|jpe?g|webp)$/i, '.json');
        if (fsSync.existsSync(jsonPath)) {
            try { meta = JSON.parse(fsSync.readFileSync(jsonPath, 'utf-8')); } catch {}
        }

        res.json({
            fileName: latest.name,
            image: `data:${mime};base64,${buf.toString('base64')}`,
            meta,
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: errorMessage });
    }
});

// Open folder endpoint - opens the provided path in OS file explorer
app.post('/open-folder', async (req: Request<{}, {}, { path: string }>, res: Response) => {
    console.log('[POST] /open-folder', { path: req.body?.path });
    try {
        const targetPath = req.body?.path;
        if (!targetPath) throw new Error('Path is required');
        const fs = await import('fs');
        if (!fs.existsSync(targetPath)) throw new Error('Path does not exist');
        const stat = fs.statSync(targetPath);
        if (!stat.isDirectory()) throw new Error('Path is not a directory');

        const platform = process.platform; // 'win32' | 'darwin' | 'linux'
        let command: string;
        if (platform === 'win32') {
            // Use cmd start to open Explorer reliably
            const quoted = targetPath.replace(/"/g, '""');
            command = `cmd /c start "" "${quoted}"`;
        } else if (platform === 'darwin') {
            command = `open "${targetPath}"`;
        } else {
            command = `xdg-open "${targetPath}"`;
        }
        exec(command, (err) => {
            if (err) {
                res.status(500).json({ error: 'Failed to open folder' });
            } else {
                res.json({ status: 'ok' });
            }
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: errorMessage });
    }
});

app.post('/generate', async (req: Request<{}, {}, GenerateRequest>, res: Response) => {
    const { prompt, folderName, authToken, authFile, generationCount, imageCount, aspectRatio, outputDir, proxy, seed, model, noFallback } = req.body;
    console.log('Folder name received:', JSON.stringify(folderName), 'Length:', folderName?.length);

    try {
        // Get auth token from file or direct input
        let finalAuthToken: string;
        if (authFile) {
            const fs = await import('fs');
            finalAuthToken = fs.readFileSync(authFile, { encoding: 'utf-8' }).trim();
        } else if (authToken) {
            finalAuthToken = authToken;
        } else {
            throw new Error('No auth token or auth file provided');
        }

        // Parse proxy config if provided
        let proxyConfig;
        if (proxy) {
            const proxyUrl = new URL(proxy);
            proxyConfig = {
                host: proxyUrl.hostname,
                port: parseInt(proxyUrl.port),
                username: proxyUrl.username || undefined,
                password: proxyUrl.password || undefined
            };
        }

        // Create output directory if it doesn't exist
        const fs = await import('fs');
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
            let selectedModel: 'IMAGEN_4_0' | 'IMAGEN_3_1' = model === 'best' ? 'IMAGEN_4_0' : 'IMAGEN_3_1';
            let selectedTool: 'IMAGE_FX' = 'IMAGE_FX';
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
                    proxy: proxyConfig
                });
            } catch (e: any) {
                console.log(`[SERVER] First attempt with ${selectedModel} failed:`, e?.message || e);
                if (selectedModel === 'IMAGEN_4_0' && !noFallback) {
                    selectedModel = 'IMAGEN_3_1';
                    res.write(JSON.stringify({ type: 'progress', data: 'Falling back to Imagen 3 (quality)...' }) + '\n');
                    response = await generateImage({
                        prompt,
                        authorization: finalAuthToken,
                        imageCount: imageCount,
                        seed: typeof seed === 'number' ? seed : null,
                        aspectRatio: aspectRatioMap[aspectRatio],
                        modelNameType: selectedModel,
                        tool: selectedTool,
                        proxy: proxyConfig
                    });
                } else {
                    if (selectedModel === 'IMAGEN_4_0' && noFallback) {
                        res.write(JSON.stringify({ type: 'progress', data: `Force no-fallback: Imagen 4 failed: ${e?.message || e}` }) + '\n');
                    }
                    throw e;
                }
            }

            // Save images and metadata
            const { saveImage, saveFile } = await import('../utils/filemanager');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            // Create folder-specific output directory
            const finalOutputDir = folderName && folderName.trim() !== '' 
                ? path.join(outputDir, folderName.trim()) 
                : outputDir;

            let imageNumber = 1;
            for (const panel of response.imagePanels) {
                for (const image of panel.generatedImages) {
                    const currentNum = imageNumber;
                    const imageName = `${timestamp}-generation-${gen + 1}-${currentNum}-${aspectRatio}.png`;
                    imageNumber++;
                    if (saveImage(imageName, image.encodedImage, finalOutputDir)) {
                        const meta = {
                            fileName: imageName,
                            savedAt: new Date().toISOString(),
                            prompt,
                            seed: image.seed,
                            aspectRatio,
                            generationNumber: gen + 1,
                            imageNumber: currentNum,
                            mediaGenerationId: image.mediaGenerationId,
                            model: selectedModel === 'IMAGEN_4_0' ? 'Powered by Imagen 4 (Best Quality)' : 'Powered by Imagen 3 (Quality)',
                        };
                        // Update gallery in the specific folder
                        try { upsertGallery(finalOutputDir, [meta]); } catch {}
                        res.write(JSON.stringify({ 
                            type: 'progress', 
                            data: `Saved: ${imageName}` 
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
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.write(JSON.stringify({ type: 'error', data: errorMessage }) + '\n');
        res.end();
    }
});

// Health endpoint to verify routes are loaded
app.get('/health', (_req: Request, res: Response) => {
    console.log('🏥 Health check requested');
    res.json({ 
        ok: true, 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        routes: ['preview', 'open-folder', 'list-images', 'generate'],
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 8080,
        host: process.env.HOST || '0.0.0.0'
    });
});



// List images in a given directory with optional limit; returns count and thumbnails
app.post('/list-images', async (req: Request<{}, {}, { path: string; limit?: number }>, res: Response) => {
    console.log('[POST] /list-images', { path: req.body?.path, limit: req.body?.limit });
    try {
        const targetPath = req.body?.path;
        const limit = Math.max(1, Math.min(50, Number(req.body?.limit ?? 24)));
        if (!targetPath) throw new Error('Path is required');
        if (!fsSync.existsSync(targetPath)) throw new Error('Path does not exist');
        const stat = fsSync.statSync(targetPath);
        if (!stat.isDirectory()) throw new Error('Path is not a directory');

        // Load gallery metadata if available for fallback
        const galleryPath = path.join(targetPath, 'gallery.html');
        const galleryMap = new Map<string, any>();
        if (fsSync.existsSync(galleryPath)) {
            try {
                const content = fsSync.readFileSync(galleryPath, 'utf-8');
                const m = content.match(/<script id=\"gallery-data\" type=\"application\/json\">([\s\S]*?)<\/script>/);
                if (m) {
                    const arr = JSON.parse(m[1]);
                    if (Array.isArray(arr)) {
                        for (const it of arr) {
                            if (it && it.fileName) galleryMap.set(String(it.fileName), it);
                        }
                    }
                }
            } catch {}
        }

        const files = fsSync.readdirSync(targetPath)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .map((name) => {
                const full = path.join(targetPath, name);
                const s = fsSync.statSync(full);
                // Load companion HTML metadata if available (parse the embedded JSON)
                let meta: any = null;
                const htmlMeta = full.replace(/\.(png|jpe?g|webp)$/i, '.html');
                if (fsSync.existsSync(htmlMeta)) {
                    try {
                        const content = fsSync.readFileSync(htmlMeta, 'utf-8');
                        const match = content.match(/<script id=\"meta\" type=\"application\/json\">([\s\S]*?)<\/script>/);
                        if (match) meta = JSON.parse(match[1]);
                    } catch {}
                }
                // Fallback to gallery data
                if (!meta && galleryMap.has(name)) meta = galleryMap.get(name);
                return { name, full, size: s.size, mtimeMs: s.mtimeMs, meta };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

        const total = files.length;
        const pick = files.slice(0, limit);
        const items = await Promise.all(pick.map(async (f) => {
            const buf = fsSync.readFileSync(f.full);
            const ext = f.name.split('.').pop()?.toLowerCase();
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            return {
                name: f.name,
                size: f.size,
                mtime: new Date(f.mtimeMs).toISOString(),
                dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
                meta: f.meta || null,
            };
        }));

        res.json({ count: total, items });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: errorMessage });
    }
});

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all interfaces for Railway

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running at http://${HOST}:${PORT}`);
    console.log(`📊 Health check available at http://${HOST}:${PORT}/health`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 Railway PORT: ${process.env.PORT || 'not set'}`);
}); 