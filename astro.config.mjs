// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';

import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  session: {
    ttl: 8 * 60 * 60,
    ...(process.argv.includes('dev') ? { driver: sessionDrivers.fs({ base: '.astro/sessions' }) } : {}),
  },
  integrations: [tailwind(), react()],

  adapter: netlify({
    devFeatures: {
      images: true,
      environmentVariables: false,
      edgeFunctions: false
    }
  })
});
