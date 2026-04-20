// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://jerocor54.github.io',
  base: '/sql-data-modeler',
  integrations: [react()],
  devToolbar: {
    enabled: false,
  },

  vite: {
    plugins: [tailwindcss()]
  }
});
