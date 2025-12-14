import React from 'react';
import { View, ViewProps, TouchableOpacity } from 'react-native';
import { COLORS } from '../configs/theme';

interface CardProps extends ViewProps {
  onPress?: () => void;
  variant?: 'default' | 'primary';
}

export const Card = ({ children, style, onPress, variant = 'default', ...props }: CardProps) => {
  // [NativeWind] 조건부 클래스 문자열 생성
  const bgClass = variant === 'primary' ? `bg-[${COLORS.primary}]` : 'bg-white';
  const borderClass = variant === 'primary' ? 'border-transparent' : `border border-[${COLORS.border}]`;
  const shadowClass = variant === 'primary' ? 'shadow-lg shadow-indigo-200' : 'shadow-sm';

  // 모든 클래스 합치기
  const cardClassName = `${bgClass} rounded-2xl ${borderClass} ${shadowClass} p-5`;

  if (onPress) {
    return (
      <TouchableOpacity 
        onPress={onPress} 
        activeOpacity={0.9} 
        className={cardClassName}
        style={style} 
        // [Fix] ViewProps와 TouchableOpacityProps 간의 타입 충돌 해결
        {...(props as any)}
      >
        {children}
      </TouchableOpacity>
    );
  }
  
  return (
    <View className={cardClassName} style={style} {...props}>
      {children}
    </View>
  );
};