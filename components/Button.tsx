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

  // Tailwind Class 문자열 생성
  switch (variant) {
    case 'primary': 
      bgClass = `bg-[${COLORS.primary}]`; 
      textClass = 'text-white'; 
      break;
    case 'secondary': 
      bgClass = 'bg-white border border-gray-200'; 
      textClass = `text-[${COLORS.textSub}]`; 
      break;
    case 'danger': 
      // NativeWind에서 투명도 적용: /10, /20
      bgClass = `bg-[${COLORS.danger}]/10 border border-[${COLORS.danger}]/20`; 
      textClass = `text-[${COLORS.danger}]`; 
      break;
    case 'ghost': 
      bgClass = 'bg-transparent'; 
      textClass = `text-[${COLORS.textSub}]`; 
      break;
  }

  // disabled 상태일 때 스타일 덮어쓰기
  if (disabled) {
    bgClass = 'bg-gray-200 border-gray-200 opacity-50';
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      // className 조합: 기본 레이아웃 + 배경색 + 사이즈 + (외부 style은 style prop으로 전달)
      className={`flex-row justify-center items-center shadow-sm active:opacity-80 ${bgClass} ${SIZES[size]}`}
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