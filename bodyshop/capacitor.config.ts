import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.techwheels.bodyshop',
  appName: 'Techwheels Bodyshop',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
