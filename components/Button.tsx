import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, TextStyle } from 'react-native';

import { COLORS } from '../configs/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  textStyle?: TextStyle;
}

const SIZES = {
  sm: 'py-2 px-3 rounded-lg',
  md: 'py-3.5 px-4 rounded-xl',
  lg: 'py-4 px-6 rounded-2xl',
};

const TEXT_SIZES = {
  sm: 'text-xs',
  md: 'text-base',
  lg: 'text-lg',
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  style,
  textStyle,
  ...props
}: ButtonProps) => {
  let bgClass = '';
  let textClass = '';
  let hoverClass = '';

  // Tailwind Class 문자열 생성
  switch (variant) {
    case 'primary': 
      bgClass = `bg-[${COLORS.primary}]`; 
      textClass = 'text-white'; 
      // [Web Fix] 마우스 호버 시 약간 투명하게
      hoverClass = 'hover:opacity-90';
      break;
    case 'secondary': 
      bgClass = 'bg-white border border-gray-200'; 
      textClass = `text-[${COLORS.textSub}]`; 
      // [Web Fix] 마우스 호버 시 연한 회색 배경
      hoverClass = 'hover:bg-gray-50';
      break;
    case 'danger': 
      bgClass = `bg-[${COLORS.danger}]/10 border border-[${COLORS.danger}]/20`; 
      textClass = `text-[${COLORS.danger}]`; 
      // [Web Fix] 마우스 호버 시 붉은 배경 조금 더 진하게
      hoverClass = 'hover:bg-red-100';
      break;
    case 'ghost': 
      bgClass = 'bg-transparent'; 
      textClass = `text-[${COLORS.textSub}]`; 
      // [Web Fix] 마우스 호버 시 버튼 영역 표시
      hoverClass = 'hover:bg-gray-100';
      break;
  }

  // disabled 상태일 때 스타일 덮어쓰기 및 호버 제거
  if (disabled) {
    bgClass = 'bg-gray-200 border-gray-200 opacity-50';
    hoverClass = ''; 
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      // className 조합: 기본 레이아웃 + 배경색 + 호버 효과 + 사이즈 + (외부 style)
      // active:opacity-80은 모바일 터치감 유지를 위해 남겨둠
      className={`flex-row justify-center items-center shadow-sm active:opacity-80 ${bgClass} ${hoverClass} ${SIZES[size]}`}
      style={style}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? 'white' : COLORS.textSub} />
      ) : (
        <Text 
            className={`font-bold text-center ${textClass} ${TEXT_SIZES[size]}`} 
            style={textStyle}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};