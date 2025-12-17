import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons'; 

export default function RankingCard() {
  const router = useRouter();

  return (
    <TouchableOpacity 
      onPress={() => router.push('/home/ranking')}
      activeOpacity={0.8}
      className="w-full bg-secondary rounded-base p-6 flex-row justify-between items-center mb-6"
    >
      <View>
        <Text className="text-darkGray font-pretendard-bold text-[30px] leading-[40px]">
          이번 주{'\n'}랭킹 확인하기
        </Text>
        <Text className="text-primary mt-2 font-pretendard-medium text-base">
          지금 바로 경쟁에 참여하세요!
        </Text>
      </View>
      
      {/* [이미지 교체 가이드]
        나중에 이미지가 준비되면 아래 FontAwesome 부분을 지우고 
        <Image source={require('../assets/images/ranking.png')} className="w-[50px] h-[50px]" /> 
        형태로 교체하시면 됩니다.
      */}
      <FontAwesome name="trophy" size={54} color="#FFD700" style={{ opacity: 0.9 }} />
    </TouchableOpacity>
  );
}