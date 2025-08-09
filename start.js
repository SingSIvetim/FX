// Simple startup script for Railway
const { spawn } = require('child_process');

console.log('Starting ImageFX Generator...');

const server = spawn('npx', ['tsx', 'src/ui/server.ts'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || 3000 }
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
