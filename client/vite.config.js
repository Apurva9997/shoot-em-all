import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3091",
        ws: true,
      },
      "/dev": {
        target: "http://localhost:3091",
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
