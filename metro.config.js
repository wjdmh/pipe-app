// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase 등 최신 웹 라이브러리 호환을 위해 'mjs' 확장자 처리 추가
config.resolver.sourceExts.push('mjs');

module.exports = config;