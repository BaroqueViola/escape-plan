import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': 'http://localhost:3000',
      '/voice': 'http://localhost:3000', // voice clips made by the server
    },
  },
});
