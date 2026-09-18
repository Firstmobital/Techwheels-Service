/**
 * Babel Configuration for Techwheels Mobile App
 */

module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
    plugins: [
      'babel-plugin-transform-import-meta',
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
            '@/assets': './assets',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  }
}
