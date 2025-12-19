import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'; // [수정] SafeAreaView 제거
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../configs/firebaseConfig';
// import { SafeAreaView } from 'react-native-safe-area-context'; // [삭제] 웹 호환성 문제로 제거

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        router.replace('/home');
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    // [수정] SafeAreaView -> View 변경, style={{ flex: 1 }} 추가로 높이 강제 확보
    <View style={{ flex: 1 }} className="bg-indigo-600 justify-between px-6 pb-10 pt-20">
      <View>
        <Text className="text-indigo-200 text-lg font-bold mb-2">
          아마추어 배구 매칭의{'\n'}새로운 시작
        </Text>
        <Text className="text-5xl font-extrabold text-white leading-tight">
          배구인을 위한{'\n'}단 하나의 어플{'\n'}PIPE
        </Text>
      </View>
      
      <View className="gap-4">
        <View className="bg-indigo-500/30 p-4 rounded-2xl mb-2">
            <Text className="text-white text-center font-medium">⚡️팀 단위 매치부터 게스트 모집까지</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/auth/login')}
          className="w-full bg-white py-5 rounded-2xl items-center shadow-lg active:scale-95"
        >
          <Text className="text-indigo-600 font-bold text-lg">바로 시작하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}