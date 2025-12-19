import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  // [Vercel Fix] Vercel 배포는 루트 경로(/)를 사용하므로 baseUrl을 비워둡니다.
  // GitHub Pages용 설정('/pipe-app/')은 삭제했습니다.
  
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
      // baseUrl 설정을 삭제하거나 주석 처리하여 기본값(/)을 사용하게 합니다.
      // "baseUrl": "/pipe-app/"  <-- 이 줄이 문제였습니다.
    }
  };
};