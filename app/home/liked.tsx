// app/home/liked.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// [디자인 상수] Apple Style Colors
const BRAND_COLOR = '#007AFF';
const DANGER_COLOR = '#FF3B30';
const BG_COLOR = '#F2F2F7'; // System Gray 6

// [데이터 타입 정의]
type MatchData = { 
  id: string; 
  team: string; 
  type: '6man' | '9man'; 
  gender: 'male' | 'female' | 'mixed'; 
  time: string; 
  loc: string; 
  status: string; 
};

export default function LikedMatchScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);

  // 로직: 찜한 매치 불러오기 (Mock Logic)
  // 실제 구현 시: user.likes 배열에 있는 ID로 쿼리하거나, 로컬 저장소에서 가져와야 합니다.
  // 현재는 UI 구현을 위해 '모집중'인 최신 매치를 불러옵니다.
  useEffect(() => {
    const fetchLikedMatches = async () => {
        try {
            const q = query(
                collection(db, "matches"), 
                orderBy("createdAt", "desc"),
                limit(5) // 임시로 5개만 가져옴
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MatchData));
            setMatches(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    fetchLikedMatches();
  }, []);

  // 로직: 찜 해제 핸들러
  const handleUnlike = (id: string) => {
    Alert.alert("찜 해제", "이 매치를 찜 목록에서 삭제할까요?", [
        { text: "취소", style: "cancel" },
        { 
            text: "삭제", 
            style: "destructive", 
            onPress: () => {
                // UI에서 즉시 제거 (Optimistic Update)
                setMatches(prev => prev.filter(m => m.id !== id));
            } 
        }
    ]);
  };

  // [UI Component] 찜한 매치 카드
  const renderItem = ({ item }: { item: MatchData }) => {
    // 날짜 포맷팅
    let displayDate = item.time;
    try {
        const d = new Date(item.time);
        if (!isNaN(d.getTime())) {
            const month = d.getMonth() + 1;
            const date = d.getDate();
            const hour = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            displayDate = `${month}월 ${date}일 ${hour}:${min}`;
        }
    } catch(e) {}

    return (
      <TouchableOpacity 
        className="bg-white p-5 mb-4 rounded-[24px] shadow-sm border border-gray-100/80 active:bg-gray-50"
        onPress={() => router.push(`/match/${item.id}`)}
        activeOpacity={0.8}
      >
        {/* 상단: 뱃지 및 삭제 버튼 */}
        <View className="flex-row justify-between items-start mb-3">
            <View className="bg-gray-100 px-2.5 py-1 rounded-[8px]">
                <Text className="text-gray-500 text-[11px] font-bold tracking-tight">
                    {item.gender === 'male' ? '남자부' : item.gender === 'female' ? '여자부' : '혼성'} · {item.type === '6man' ? '6인제' : '9인제'}
                </Text>
            </View>
            <TouchableOpacity 
                onPress={() => handleUnlike(item.id)}
                hitSlop={{top:10, bottom:10, left:10, right:10}}
            >
                <FontAwesome5 name="heart" size={18} solid color={DANGER_COLOR} />
            </TouchableOpacity>
        </View>

        {/* 메인 정보 */}
        <View className="mb-4">
            <Text className="text-[20px] font-black text-gray-900 leading-tight mb-1" numberOfLines={1}>{item.team}</Text>
            <Text className="text-[14px] text-gray-500 font-medium tracking-tight">
                {displayDate}
            </Text>
        </View>

        {/* 하단: 장소 */}
        <View className="flex-row items-center">
            <FontAwesome5 name="map-marker-alt" size={12} color="#8E8E93" style={{marginRight: 6}} />
            <Text className="text-gray-500 text-[13px] font-medium flex-1 tracking-tight" numberOfLines={1}>
                {item.loc || '장소 미정'}
            </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F2F2F7]" edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* 1. Header Area */}
      <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
          <TouchableOpacity 
            onPress={() => router.back()}
            className="w-10 h-10 bg-white rounded-full items-center justify-center shadow-sm border border-gray-100"
            activeOpacity={0.7}
          >
              <FontAwesome5 name="chevron-left" size={16} color="#1C1C1E" />
          </TouchableOpacity>
          <Text className="text-[17px] font-bold text-black">찜한 매치</Text>
          <View className="w-10" /> 
      </View>

      {/* 2. Main Title (iOS Style) */}
      <View className="px-6 pb-4">
        <Text className="text-[34px] font-black text-black tracking-tight">Saved{'\n'}Matches</Text>
      </View>

      {/* 3. Match List */}
      <FlatList 
        data={matches} 
        renderItem={renderItem} 
        keyExtractor={item => item.id} 
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-32 opacity-60">
                    <View className="w-20 h-20 bg-gray-200 rounded-full items-center justify-center mb-4">
                        <FontAwesome5 name="heart-broken" size={32} color="#9CA3AF" />
                    </View>
                    <Text className="text-gray-500 font-bold text-[16px]">아직 찜한 경기가 없어요</Text>
                    <Text className="text-gray-400 text-[13px] mt-1">마음에 드는 매치를 찾아보세요!</Text>
                </View>
            ) : (
                <View className="py-20"><ActivityIndicator size="large" color={BRAND_COLOR} /></View>
            )
        } 
      />
    </SafeAreaView>
  );
}