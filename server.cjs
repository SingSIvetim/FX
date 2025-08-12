const express = require('express');
const path = require('path');

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

// Simple ping endpoint
app.get('/ping', (req, res) => {
    console.log('🏓 Ping requested');
    res.status(200).send('pong');
});

// Basic generate endpoint (placeholder)
app.post('/generate', (req, res) => {
    console.log('🖼️ Generate requested');
    res.status(200).json({ 
        ok: true, 
        message: 'Generate endpoint ready',
        timestamp: new Date().toISOString()
    });
});

// Basic list-images endpoint (placeholder)
app.post('/list-images', (req, res) => {
    console.log('📁 List images requested');
    res.status(200).json({ 
        ok: true, 
        count: 0,
        items: [],
        message: 'List images endpoint ready'
    });
});

// Basic open-folder endpoint (placeholder)
app.post('/open-folder', (req, res) => {
    console.log('📂 Open folder requested');
    res.status(200).json({ 
        ok: true, 
        message: 'Open folder endpoint ready'
    });
});

// Basic preview endpoint (placeholder)
app.post('/preview', (req, res) => {
    console.log('👁️ Preview requested');
    res.status(200).json({ 
        ok: true, 
        message: 'Preview endpoint ready'
    });
});

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running at http://${HOST}:${PORT}`);
    console.log(`📊 Health check available at http://${HOST}:${PORT}/health`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 Railway PORT: ${process.env.PORT || 'not set'}`);
});
