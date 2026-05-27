/**
 * Babel Configuration for Techwheels Mobile App
 */

module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
            '@/assets': './assets',
          },
        },
      ],
      'nativewind/babel',
      'react-native-reanimated/plugin',
    ],
  }
}
