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
      'tabs',
      // offscreen API is Chrome-only; Firefox/Safari don't have or need it
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: ['https://*.supabase.co/*'],
    // Firefox MV3 requires background.scripts (not service_worker).
    // WXT handles this automatically based on target browser.
    // browser_specific_settings is only relevant for Firefox (Gecko)
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'lynicis@protonmail.com',
              strict_min_version: '109.0',
            },
          },
        }
      : {}),
  }),
});
