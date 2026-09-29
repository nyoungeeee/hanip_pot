import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 Nest(3000)로 /api, /uploads, /media 프록시
const backend = process.env.BACKEND_URL ?? 'http://localhost:3000';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // IPv4(127.0.0.1)·같은 Wi-Fi 휴대폰에서도 접속
    proxy: { '/api': backend, '/uploads': backend, '/media': backend },
  },
});
