import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The home screen icon goes inside the page itself (as a data: address), so an iPhone never has to fetch it.
 * When iOS cannot fetch the icon it shows a grey letter instead. public/apple-touch-icon.png stays the source,
 * and is still served at the site root as a fallback.
 */
function inlineTouchIcon(): Plugin {
  return {
    name: 'inline-touch-icon',
    transformIndexHtml(html) {
      const png = readFileSync(new URL('./public/apple-touch-icon.png', import.meta.url)).toString('base64');
      return html.replace(/href="\/apple-touch-icon\.png[^"]*"/, `href="data:image/png;base64,${png}"`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineTouchIcon()],
  build: {
    rollupOptions: {
      // the app, and the page Microsoft sends an Outlook sign-in back to
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        outlook: fileURLToPath(new URL('./outlook-redirect.html', import.meta.url)),
      },
    },
  },
});
