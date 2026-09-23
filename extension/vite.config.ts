/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export default defineConfig({
  base: "./",
  test: {
    environment: "happy-dom",
  },
  plugins: [
    react(),
    {
      name: "copy-manifest",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(distDir, "manifest.json")
        );

        // 处理生成的各个 HTML 页面并提升到 dist 根目录，修正相对资源引用
        const pages = ["sidepanel.html", "workbench.html", "index.html"];
        for (const page of pages) {
          const srcHtml = resolve(distDir, "src/ui", page);
          if (existsSync(srcHtml)) {
            const content = readFileSync(srcHtml, "utf-8");
            const adjusted = content
              .replace(/\.\.\/\.\.\/assets\//g, "./assets/")
              .replace(/(["'])\/assets\//g, "$1./assets/");
            writeFileSync(resolve(distDir, page), adjusted, "utf-8");
          }
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/ui/sidepanel.html"),
        workbench: resolve(__dirname, "src/ui/workbench.html"),
        index: resolve(__dirname, "src/ui/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
