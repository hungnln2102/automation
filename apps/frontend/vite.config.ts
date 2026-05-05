import type { UserConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  let build: UserConfig["build"],
    esbuild: UserConfig["esbuild"],
    define: UserConfig["define"];

  const frontendPath = resolve(dirname(fileURLToPath(import.meta.url)));
  /** Luôn đọc .env* trong apps/frontend dù cwd khi chạy CLI khác. */
  const env = loadEnv(mode, frontendPath, "");
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    process.env.VITE_API_PROXY_TARGET ||
    "http://localhost:6000";
  const rootPath = resolve(frontendPath, "..");
  const sharedPath = resolve(rootPath, "shared");

  if (mode === "development") {
    build = {
      minify: false,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    };

    esbuild = {
      jsxDev: true,
      keepNames: true,
      minifyIdentifiers: false,
    };

    define = {
      "process.env.NODE_ENV": '"development"',
      __DEV__: "true",
    };
  } else {
    // Production configuration
    build = {
      minify: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    };

    define = {
      "process.env.NODE_ENV": '"production"',
      __DEV__: "false",
    };
  }

  return {
    // Base path for assets - critical for production deployment
    base: '/',
    envDir: frontendPath,
    plugins: [react()],
    build,
    esbuild,
    define,
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 300,
      },
      fs: {
        allow: [frontendPath, rootPath, sharedPath],
      },
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          /** Một số API Playwright (renew/check) có thể chạy lâu — tránh proxy đóng sớm. */
          timeout: 900_000,
          proxyTimeout: 900_000,
        },
        "/image": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/image_product": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
        "/image_variant": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: {
        "@": resolve(frontendPath, "src"),
        "@/app": resolve(frontendPath, "src/app"),
        "@/features": resolve(frontendPath, "src/features"),
        "@/shared": resolve(frontendPath, "src/shared"),
        "@/services": resolve(frontendPath, "src/services"),
        "@/assets": resolve(frontendPath, "src/assets"),
        "@/styles": resolve(frontendPath, "src/styles"),
        "@/lib": resolve(frontendPath, "src/lib"),
        "@shared": sharedPath,
      },
    },
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/setupTests.ts",
    },
  };
});
