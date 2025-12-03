// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5', // Electric Indigo (메인)
        secondary: '#A3E635', // Lime (포인트/액션)
        dark: '#111827', // 깊은 네이비 (텍스트)
        gray: {
          50: '#F9FAFB', // 배경
          100: '#F3F4F6',
          200: '#E5E7EB',
          400: '#9CA3AF',
          500: '#6B7280', // 보조 텍스트
          800: '#1F2937',
        },
        danger: '#EF4444',
      },
    },
  },
};