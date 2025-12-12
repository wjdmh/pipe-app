// app.config.ts
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  // 💡 핵심 전략: 환경 변수(IS_DEV)가 없으면 배포 모드로 간주하고 baseUrl 적용
  const isDev = process.env.NODE_ENV === 'development';
  const baseUrl = isDev ? '' : '/pipe-app'; 

  return {
    ...config, // 기존 설정 상속
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
      // 👇 환경에 따라 자동으로 경로 설정 (수동 수정 불필요!)
      "baseUrl": baseUrl 
    }
  };
};