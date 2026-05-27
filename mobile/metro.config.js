/**
 * Metro Configuration for Techwheels Mobile App
 * Handles path aliases and optimizations
 */

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Configure path aliases for Metro
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
}

// Add alias resolution for @ imports
const path = require('path')
config.resolver.sourceExts = [
  'tsx',
  'ts',
  'jsx',
  'js',
  'json',
  'native',
]

// Map @ to ./src
config.projectRoot = __dirname
config.watchFolders = [__dirname]

module.exports = config
