// shim.js
import { Platform } from 'react-native';

// 1. Node.js 환경 변수 폴리필
if (typeof __dirname === 'undefined') global.__dirname = '/';
if (typeof __filename === 'undefined') global.__filename = '';

// process 객체 폴리필
if (typeof process === 'undefined') {
  global.process = require('process');
} else {
  const bProcess = require('process');
  for (var p in bProcess) {
    if (!(p in process)) {
      process[p] = bProcess[p];
    }
  }
}

// 2. localStorage 폴리필 (가장 중요)
// 이미 존재하더라도 getItem 함수가 없으면 강제로 덮어씌웁니다.
const mockLocalStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
};

if (typeof global !== 'undefined') {
  if (!global.localStorage || typeof global.localStorage.getItem !== 'function') {
    global.localStorage = mockLocalStorage;
  }
}

// 3. TextEncoder/TextDecoder 폴리필
if (Platform.OS === 'web') {
  if (typeof TextEncoder === 'undefined') {
    const TextEncodingPolyfill = require('text-encoding');
    global.TextEncoder = TextEncodingPolyfill.TextEncoder;
    global.TextDecoder = TextEncodingPolyfill.TextDecoder;
  }
}