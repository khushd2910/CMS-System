import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development the React app (port 5173) calls "/api/..." and Vite forwards
// those requests to the Express backend, so we never hard-code a server URL
// in the source code and we avoid CORS problems.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_PROXY_TARGET || "http://localhost:3000";

  return {
    plugins: [react()],
    server: {
      port: 5173, // matches CLIENT_URL in backend/.env.example
      strictPort: true,
      proxy: {
        "/api": { target: backendUrl, changeOrigin: true },
      },
    },
  };
});
