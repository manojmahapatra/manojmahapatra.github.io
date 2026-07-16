// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { SITE } from "./src/config";

// https://astro.build/config
export default defineConfig({
  site: SITE.website,
  trailingSlash: "never",
  compressHTML: true,
  markdown: {
    // Shiki emits inline style attributes, which cannot be protected by
    // Astro's hash-based CSP. Plain code blocks remain fully readable.
    syntaxHighlight: false,
  },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "frame-src https://www.youtube-nocookie.com",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self' blob:",
        "upgrade-insecure-requests",
      ],
    },
  },
  integrations: [
    mdx(),
    sitemap(),
    react(),
  ],
  vite: {
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    plugins: [tailwindcss()],
  },
});
