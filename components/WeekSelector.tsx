import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';

export default function WeekSelector() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [weeks, setWeeks] = useState<string[]>([]);

  // [Logic] 오늘부터 8주(약 2개월) 간의 주차 계산
  useEffect(() => {
    const generateWeeks = () => {
      const result = [];
      const today = new Date();
      
      for (let i = 0; i < 8; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i * 7);
        
        const month = d.getMonth() + 1;
        // 간단한 주차 계산 로직 (날짜를 7로 나눈 몫 대략적 사용)
        const weekNum = Math.ceil(d.getDate() / 7); 
        
        result.push(`${month}월 ${weekNum}주`);
      }
      setWeeks(result);
    };
    
    generateWeeks();
  }, []);

  return (
    <View className="mb-8">
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }} // 버튼 사이 간격
        className="flex-row"
      >
        {weeks.map((week, index) => {
          const isSelected = selectedIndex === index;
          
          return (
            <TouchableOpacity
              key={index}
              onPress={() => setSelectedIndex(index)}
              activeOpacity={0.8}
              className={`px-5 py-2.5 rounded-pill border flex-row items-center justify-center ${
                isSelected 
                  ? 'bg-primary border-primary'  // 선택됨: 파란 배경 + 파란 테두리
                  : 'bg-transparent border-transparent' // 선택안됨: 투명 배경
              }`}
            >
              <Text 
                className={`text-[16px] font-pretendard-bold ${
                  isSelected 
                    ? 'text-white'      // 선택됨: 흰색 글씨 (#FFFFFF)
                    : 'text-darkGray'   // 선택안됨: 진회색 글씨 (#333333)
                }`}
              >
                {week}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}