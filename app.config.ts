import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  // [Web Fix] GitHub Pages 배포를 위한 서브 경로 설정
  // 주의: 저장소 이름 뒤에 반드시 슬래시(/)를 붙여야 경로 오류를 방지할 수 있습니다.
  const baseUrl = '/pipe-app/'; 

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
      // 👇 GitHub Pages 하위 경로 배포 설정 (엑박 방지 핵심 코드)
      "baseUrl": baseUrl 
    }
  };
};