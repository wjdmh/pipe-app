import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl, 
  StatusBar, 
  FlatList, 
  Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// ✅ [Step 2 & 3] 공통 컴포넌트 및 타입 가져오기
import GuestCard from '../../components/GuestCard';
import { GuestPost } from '../../hooks/useGuest';

// [디자인 상수]
const TEAM_COLOR = '#4F46E5'; // Indigo
const GUEST_COLOR = '#EA580C'; // Orange

// [팀 매치 데이터 타입] - 기존 유지
type MatchData = { 
  id: string; 
  team: string; 
  type: '6man' | '9man'; 
  gender: 'male' | 'female' | 'mixed'; 
  time: string; 
  loc: string; 
  status: string; 
  isDeleted?: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  
  // 상태 관리
  const [activeTab, setActiveTab] = useState<'match' | 'guest'>('match');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // [Logic] 데이터 Fetching
  const fetchData = async () => {
      setLoading(true);
      
      try {
          const collectionName = activeTab === 'match' ? 'matches' : 'guest_posts';
          const nowISO = new Date().toISOString();

          // [Query] 
          // Step 1에서 'time' 필드로 표준화했으므로, 여기서도 'time' 기준으로 쿼리합니다.
          const q = query(
              collection(db, collectionName), 
              where("status", "==", "recruiting"), // 모집중인 글만
              where("time", ">=", nowISO),         // 지난 경기는 제외
              orderBy("time", "asc"),              // 가까운 경기부터
              limit(50) 
          );

          const snapshot = await getDocs(q);
          const rawItems: any[] = [];
          
          snapshot.forEach(d => {
              const data = d.data();
              if (!data.isDeleted) {
                  // GuestPost의 경우 Step 1의 표준화 로직을 여기서도 가볍게 적용
                  const time = data.time || data.matchDate || nowISO;
                  rawItems.push({ id: d.id, ...data, time });
              }
          });

          setItems(rawItems);

      } catch (e) {
          console.error("Fetch Error:", e);
      } finally {
          setLoading(false);
          setRefreshing(false);
      }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // [UI] 리스트 아이템 렌더링
  const renderItem = ({ item }: { item: any }) => {
    const isMatch = activeTab === 'match';

    // ✅ [Case 1] 게스트 모집 탭일 경우 -> GuestCard 사용 (통일된 디자인)
    if (!isMatch) {
        return (
            <GuestCard 
                item={item as GuestPost} 
                onPress={() => router.push(`/guest/${item.id}` as any)}
                variant="simple" 
            />
        );
    }

    // ✅ [Case 2] 팀 매치 탭일 경우 -> 기존 디자인 유지 (약간 다듬음)
    // 팀 매치는 데이터 구조가 다르므로 GuestCard를 쓰지 않고 전용 UI 유지
    let dateStr = "";
    let timeStr = "";
    try {
        const d = new Date(item.time);
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const day = days[d.getDay()];
        dateStr = `${month}.${date} (${day})`;
        const hour = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        timeStr = `${hour}:${min}`;
    } catch(e) { dateStr = "-"; timeStr = "-"; }

    return (
      <TouchableOpacity 
        onPress={() => router.push(`/match/${item.id}` as any)}
        activeOpacity={0.7}
        className="flex-row items-center py-4 px-5 border-b border-gray-100 bg-white mb-1"
      >
        {/* 날짜 & 시간 */}
        <View className="w-[72px] mr-3 items-start justify-center">
            <Text className="text-[12px] font-medium text-gray-500 mb-0.5">{dateStr}</Text>
            <Text className="text-[16px] font-bold text-gray-900 tracking-tight">{timeStr}</Text>
        </View>

        {/* 팀 정보 */}
        <View className="flex-1 justify-center pr-2">
            <Text className="text-[16px] font-bold text-gray-900 mb-1" numberOfLines={1}>
                {item.team}
            </Text>
            <Text className="text-[13px] font-medium text-gray-500" numberOfLines={1}>
                {item.loc} · {item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '혼성'} · {item.type === '6man' ? '6인제' : '9인제'}
            </Text>
        </View>

        {/* 매치 상태 태그 */}
        <View className="ml-1 shrink-0">
            <View className="bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100">
                <Text className="text-blue-600 text-[11px] font-bold">신청가능</Text>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* 1. Header & Tabs */}
      <View className="bg-white px-5 pt-2 pb-0 z-10">
        <Text className="text-xl font-extrabold text-gray-900 italic tracking-tighter mb-4">PIPE</Text>
        
        <View className="flex-row gap-6 mb-2">
            <TouchableOpacity 
                onPress={() => setActiveTab('match')}
                activeOpacity={0.8}
                className="pb-2"
                style={{ borderBottomWidth: 2, borderBottomColor: activeTab === 'match' ? '#111827' : 'transparent' }}
            >
                <Text className={`text-[17px] font-bold ${activeTab === 'match' ? 'text-gray-900' : 'text-gray-400'}`}>팀 매치</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => setActiveTab('guest')}
                activeOpacity={0.8}
                className="pb-2"
                style={{ borderBottomWidth: 2, borderBottomColor: activeTab === 'guest' ? '#111827' : 'transparent' }}
            >
                <Text className={`text-[17px] font-bold ${activeTab === 'guest' ? 'text-gray-900' : 'text-gray-400'}`}>게스트</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* 2. Banner */}
      <TouchableOpacity 
            onPress={() => router.push('/home/ranking')}
            className="mx-5 mb-2 mt-2 bg-gray-900 rounded-xl px-4 py-3 flex-row justify-between items-center shadow-sm"
            activeOpacity={0.9}
        >
            <View>
                <Text className="text-white font-bold text-[14px]">2026-1 시즌 랭킹</Text>
                <Text className="text-gray-400 text-[11px]">우리 팀 순위를 확인해보세요</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={12} color="white" />
      </TouchableOpacity>

      {/* 3. Content List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: activeTab === 'guest' ? 20 : 0, paddingTop: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-24">
                    <FontAwesome5 name={activeTab === 'match' ? "volleyball-ball" : "user-friends"} size={48} color="#E5E7EB" style={{marginBottom: 16}} />
                    <Text className="text-gray-400 font-bold text-[14px] mb-1">
                        {activeTab === 'match' ? '예정된 매치가 없어요' : '모집 중인 게스트 공고가 없어요'}
                    </Text>
                </View>
            ) : (
                <View className="py-20"><ActivityIndicator color={activeTab === 'match' ? TEAM_COLOR : GUEST_COLOR} /></View>
            )
        }
      />
      
      {/* Floating Write Button */}
      <TouchableOpacity 
        onPress={() => router.push(activeTab === 'match' ? '/match/write' : '/guest/write')}
        className="absolute bottom-6 right-5 w-14 h-14 bg-gray-900 rounded-full items-center justify-center shadow-lg shadow-gray-400/50"
        activeOpacity={0.8}
      >
        <FontAwesome5 name={activeTab === 'match' ? "plus" : "pen"} size={20} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}