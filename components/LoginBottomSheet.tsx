import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';

export default function LoginBottomSheet() {
  const { isLoginModalVisible, hideLoginModal } = useUser();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(isLoginModalVisible);
  }, [isLoginModalVisible]);

  const handleLogin = () => {
    hideLoginModal();
    router.push('/auth/login');
  };

  if (!isVisible) return null;

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="slide"
      onRequestClose={hideLoginModal}
    >
      <View className="flex-1 justify-end bg-black/50">
        {/* Backdrop Tap to Close */}
        <TouchableOpacity 
          className="absolute inset-0" 
          activeOpacity={1} 
          onPress={hideLoginModal}
        />
        
        {/* Bottom Sheet Content */}
        <View className="bg-white rounded-t-3xl p-6 pb-10 items-center shadow-2xl">
          <View className="w-12 h-1.5 bg-gray-300 rounded-full mb-6" />
          
          <View className="bg-indigo-100 p-4 rounded-full mb-4">
            <Ionicons name="lock-closed" size={32} color="#4f46e5" />
          </View>

          <Text className="text-xl font-bold text-gray-900 mb-2">
            로그인이 필요한 기능입니다
          </Text>
          <Text className="text-gray-500 text-center mb-8 leading-6">
            간편하게 가입하고{'\n'}매치 신청, 용병 모집 등 모든 기능을 이용해보세요!
          </Text>

          <TouchableOpacity 
            onPress={handleLogin}
            className="w-full bg-indigo-600 py-4 rounded-xl items-center mb-3 active:bg-indigo-700"
          >
            <Text className="text-white font-bold text-lg">이메일로 로그인 / 가입</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={hideLoginModal}
            className="w-full py-4 rounded-xl items-center"
          >
            <Text className="text-gray-500 font-medium">나중에 하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
