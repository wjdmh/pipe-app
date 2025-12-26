import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  // [Vercel Fix] SPA 모드 설정을 위해 output을 'single'로 변경했습니다.
  // 이제 새로고침 시 404 에러 없이 index.html이 로드되어 라우팅을 처리합니다.
  
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
      "output": "single", // 👈 [핵심 변경] static -> single (SPA 모드)
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
    }
  };
};