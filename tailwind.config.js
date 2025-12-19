/** @type {import('tailwindcss').Config} */
module.exports = {
  // 👇 여기에 "./utils/..." 를 꼭 추가해야 platformHelper.ts의 스타일이 먹힙니다!
  content: [
    "./app/**/*.{js,jsx,ts,tsx}", 
    "./components/**/*.{js,jsx,ts,tsx}",
    "./utils/**/*.{js,jsx,ts,tsx}" 
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}