import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: "Don't Let YouTube Track You",
    description:
      'Privately track your YouTube browsing history and sync across devices without Google tracking',
    permissions: ['storage', 'unlimitedStorage', 'offscreen', 'tabs'],
    host_permissions: ['https://*.supabase.co/*'],
  },
});
