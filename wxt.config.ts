import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    envPrefix: 'SUPABASE_',
  }),
  manifest: ({ browser }) => ({
    name: "Don't Let YouTube Track You",
    description:
      'Privately track your YouTube browsing history and sync across devices without Google tracking',
    permissions: [
      'storage',
      'unlimitedStorage',
      // offscreen API is Chrome-only; Firefox/Safari don't have or need it
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: ['https://*.supabase.co/*'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // Firefox MV3 requires background.scripts (not service_worker).
    // WXT handles this automatically based on target browser.
    // browser_specific_settings is only relevant for Firefox (Gecko)
    ...(browser === 'firefox'
      ? {
        browser_specific_settings: {
          gecko: {
            id: 'dont-let-youtube-track-you@lynicis',
            strict_min_version: '140.0',
            data_collection_permissions: {
              required: ['browsingActivity'],
              optional: ['technicalAndInteraction'],
            },
          },
        },
      }
      : {}),
  }),
});
