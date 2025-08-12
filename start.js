// Simple startup script for Railway
import { spawn } from 'child_process';

console.log('🚀 Starting ImageFX Generator...');
console.log('📦 Node version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('🔌 Port:', process.env.PORT || 8080);

const server = spawn('npx', ['tsx', 'src/ui/server.ts'], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    PORT: process.env.PORT || 8080,
    NODE_ENV: process.env.NODE_ENV || 'production'
  }
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  server.kill('SIGINT');
});
