import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { ProxyOptions } from 'vite'

// Arc Coder is a client-side SPA. The model providers block direct browser calls
// (NVIDIA NIM's CORS preflight omits Access-Control-Allow-Headers, and the
// Authorization header forces a preflight; Z.ai is the same). So we route model
// traffic through these dev/preview proxies, which perform the request server-side.
// In production the equivalent lives in vercel.json `rewrites`.
//
// NOTE: API keys are hardcoded client-side (src/config/keys.ts) by design — the
// proxy is purely a CORS workaround, and the underlying providers/models are never
// surfaced in the UI (they appear as "Arc3Mini" / "Arc3Ultra").
const proxy: Record<string, ProxyOptions> = {
  // Arc3Ultra → MiniMax-M3 via NVIDIA NIM.
  '/nvapi': {
    target: 'https://integrate.api.nvidia.com',
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/nvapi/, ''),
  },
  // Arc3Mini → GLM-4.7-Flash via Z.ai (Zhipu).
  '/zai': {
    target: 'https://api.z.ai',
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/zai/, ''),
  },
  // DuckDuckGo Instant Answer API (quick facts; Wikipedia provides broad results,
  // CORS-enabled directly so it needs no proxy). DDG's html/lite scrape endpoints
  // hard-block datacenter IPs (403), so we don't use them.
  '/ddg': {
    target: 'https://api.duckduckgo.com',
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/ddg/, ''),
  },
}

// WebContainers require the page to be cross-origin isolated.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolation, proxy },
  preview: { headers: crossOriginIsolation, proxy },
  worker: { format: 'es' },
  optimizeDeps: {
    // Monaco ships its own workers; let Vite pre-bundle the editor core.
    include: ['@monaco-editor/react', 'monaco-editor'],
  },
})
