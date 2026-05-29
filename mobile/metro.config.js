/**
 * Metro Configuration for Techwheels Mobile App
 * Handles path aliases and optimizations
 */

const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Configure path aliases for Metro
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
}

// Add alias resolution for @ imports

// Map @ to ./src
config.projectRoot = __dirname
config.watchFolders = [
  __dirname,
  path.resolve(__dirname, '..'),
]

module.exports = withNativeWind(config, {
  input: './src/global.css',
})
