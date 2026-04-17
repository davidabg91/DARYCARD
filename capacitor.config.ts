import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.darycommerce.app',
  appName: 'Dary Card',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
