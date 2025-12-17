import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

// 메뉴 데이터 (수정됨)
const MENU_ITEMS = [
  { id: 1, title: '시작하기', icon: 'play' },       // 시작 = 재생 버튼
  { id: 2, title: '팀 찾기', icon: 'search' },      // 찾기 = 돋보기
  { id: 3, title: '찜한 매치', icon: 'heart' },     // 찜 = 하트
  { id: 4, title: '9인제 매치', icon: 'users' },    // 9인제 = 여러 사람
];

export default function MenuGrid() {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-4 mb-8">
      {MENU_ITEMS.map((item) => (
        <TouchableOpacity 
          key={item.id}
          activeOpacity={0.7}
          className="w-[48%] aspect-square bg-secondary rounded-base justify-center items-center"
        >
          {/* 아이콘 (색상은 글씨와 동일한 #333333) */}
          <FontAwesome5 
            name={item.icon} 
            size={32} 
            color="#333333" 
            style={{ marginBottom: 12 }} 
          />
          
          <Text className="text-darkGray font-pretendard-medium text-[18px]">
            {item.title}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}