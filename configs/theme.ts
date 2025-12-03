// configs/theme.ts

export const COLORS = {
  primary: '#4F46E5',   // Indigo-600: 메인 브랜드 컬러
  secondary: '#64748B', // Slate-500: 보조
  background: '#F8FAFC',// Slate-50: 배경
  surface: '#FFFFFF',   // White: 카드, 모달
  danger: '#EF4444',    // Red-500: 경고/삭제
  success: '#10B981',   // Emerald-500: 성공
  
  textMain: '#0F172A',  // Slate-900
  textSub: '#64748B',   // Slate-500
  textCaption: '#94A3B8', // Slate-400
  border: '#E2E8F0',    // Slate-200
};

export const TYPOGRAPHY = {
  h1: 'text-2xl font-extrabold text-[#0F172A]',
  h2: 'text-xl font-bold text-[#0F172A]',
  h3: 'text-lg font-bold text-[#0F172A]',
  body1: 'text-base font-medium text-[#0F172A]',
  body2: 'text-sm text-[#64748B]',
  caption: 'text-xs font-bold text-[#94A3B8]',
};

export const LAYOUT = {
  container: 'flex-1 bg-[#F8FAFC] px-6',
  card: 'bg-white p-5 rounded-2xl shadow-sm border border-[#E2E8F0]',
  center: 'items-center justify-center',
};