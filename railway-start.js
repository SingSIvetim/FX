#!/usr/bin/env node

// Simple Railway startup script
const { spawn } = require('child_process');

console.log('🚀 Starting ImageFX Generator on Railway...');
console.log('📦 Node version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'production');
console.log('🔌 Port:', process.env.PORT || 'not set');
console.log('🏠 Host:', process.env.HOST || '0.0.0.0');

// Start the TypeScript server directly
const server = spawn('npx', ['tsx', 'src/ui/server.ts'], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    PORT: process.env.PORT || 8080,
    NODE_ENV: process.env.NODE_ENV || 'production',
    HOST: process.env.HOST || '0.0.0.0'
  }
});

server.on('error', (error) => {
  console.error('❌ Server spawn error:', error.message);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.kill('SIGINT');
});
