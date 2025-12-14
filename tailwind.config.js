/** @type {import('tailwindcss').Config} */
module.exports = {
  // 1. 스타일을 적용할 파일 경로 설정 (app 폴더와 components 폴더 감시)
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}