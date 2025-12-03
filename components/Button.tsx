import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, TextStyle } from 'react-native';
import tw from 'twrnc';
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

  switch (variant) {
    case 'primary': bgClass = `bg-[${COLORS.primary}]`; textClass = 'text-white'; break;
    case 'secondary': bgClass = 'bg-white border border-gray-200'; textClass = `text-[${COLORS.textSub}]`; break;
    case 'danger': bgClass = `bg-[${COLORS.danger}]/10 border border-[${COLORS.danger}]/20`; textClass = `text-[${COLORS.danger}]`; break;
    case 'ghost': bgClass = 'bg-transparent'; textClass = `text-[${COLORS.textSub}]`; break;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      style={[
        tw`flex-row justify-center items-center shadow-sm active:opacity-80 ${bgClass} ${SIZES[size]}`,
        disabled && tw`bg-gray-200 border-gray-200 opacity-50`,
        style
      ]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? 'white' : COLORS.textSub} />
      ) : (
        <Text style={[tw`font-bold text-center ${textClass} ${TEXT_SIZES[size]}`, textStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};