// app/+not-found.tsx
import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';
import tw from 'twrnc';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '페이지를 찾을 수 없음' }} />
      <View style={tw`flex-1 items-center justify-center bg-white p-5`}>
        <Text style={tw`text-xl font-bold text-gray-800 mb-4`}>
          해당 페이지가 존재하지 않습니다.
        </Text>
        <Link href="/" style={tw`py-3 px-6 bg-blue-500 rounded-lg`}>
          <Text style={tw`text-white font-bold`}>홈으로 돌아가기</Text>
        </Link>
      </View>
    </>
  );
}