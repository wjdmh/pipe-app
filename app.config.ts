// app.config.ts
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  // GitHub Pages 배포를 위한 Base URL 설정
  // 로컬 개발(npx expo start)시에는 자동으로 무시되므로 안전하게 설정 가능
  const baseUrl = '/pipe-app'; 

  return {
    ...config,
    name: "Pipe",
    slug: "pipe-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "pipeapp",
    userInterfaceStyle: "light",
    splash: {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      "supportsTablet": true
    },
    android: {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.wjdmh.pipeapp"
    },
    web: {
      "favicon": "./assets/favicon.png",
      "bundler": "metro",
      "output": "static",
      "name": "Pipe - 배구 매칭 플랫폼",
      "display": "standalone",
      "backgroundColor": "#ffffff",
      "lang": "ko"
    },
    plugins: [
      "expo-router"
    ],
    experiments: {
      "typedRoutes": true,
      // 👇 GitHub Pages 서브 경로 배포를 위해 필수 설정
      "baseUrl": baseUrl 
    }
  };
};