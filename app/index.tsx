import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // [수정됨] 팀 정보 확인 로직 제거 -> 무조건 홈으로 이동
        // 홈 화면(index.tsx) 내부에서 팀 유무를 체크하여 Guest UI를 보여줍니다.
        router.replace('/home');
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-white`}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-indigo-600 justify-between px-6 pb-10 pt-20`}>
      <View>
        <Text style={tw`text-indigo-200 text-lg font-bold mb-2`}>아마추어 배구 매칭의{'\n'}새로운 시작</Text>
        <Text style={tw`text-5xl font-extrabold text-white leading-tight`}>
          배구인을 위한{'\n'}단 하나의 어플{'\n'}PIPE
        </Text>
      </View>
      
      <View style={tw`gap-4`}>
        <View style={tw`bg-indigo-500/30 p-4 rounded-2xl mb-2`}>
            <Text style={tw`text-white text-center font-medium`}>⚡️팀 단위 매치부터 게스트 모집까지</Text>
        </View>
        <TouchableOpacity 
          onPress={() => router.push('/auth/login')}
          style={tw`w-full bg-white py-5 rounded-2xl items-center shadow-lg active:scale-95`}
        >
          <Text style={tw`text-indigo-600 font-bold text-lg`}>바로 시작하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}