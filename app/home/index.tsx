import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl, 
  StatusBar, 
  FlatList, // [Change] SectionList -> FlatList
  Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// [디자인 상수]
const TEAM_COLOR = '#4F46E5'; // Indigo
const GUEST_COLOR = '#EA580C'; // Orange

// [타입 정의]
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

// [게스트 데이터 타입]
type GuestData = {
    id: string;
    teamName: string; 
    time: string;
    loc: string;
    gender: 'male' | 'female' | 'mixed';
    positions: string; 
    targetLevel: string;     
    status: string;
    isDeleted?: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  
  // 상태 관리
  const [activeTab, setActiveTab] = useState<'match' | 'guest'>('match');
  const [items, setItems] = useState<any[]>([]); // [Change] sections -> items (단일 배열)
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // [Logic] 데이터 Fetching
  const fetchData = async () => {
      setLoading(true);
      
      try {
          const collectionName = activeTab === 'match' ? 'matches' : 'guest_posts';
          const nowISO = new Date().toISOString();

          // [Query] 경기 시간(time) 순으로 정렬
          const q = query(
              collection(db, collectionName), 
              where("status", "==", "recruiting"),
              where("time", ">=", nowISO), // 지난 경기는 제외
              orderBy("time", "asc"), // 가까운 경기부터
              limit(50) 
          );

          const snapshot = await getDocs(q);
          const rawItems: any[] = [];
          
          snapshot.forEach(d => {
              const data = d.data();
              if (!data.isDeleted) rawItems.push({ id: d.id, ...data });
          });

          setItems(rawItems); // [Change] 그룹핑 없이 바로 저장

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

  // [UI] 리스트 아이템
  const renderItem = ({ item }: { item: any }) => {
    let dateStr = "";
    let timeStr = "";
    
    // [Change] 날짜와 시간 모두 파싱
    try {
        const d = new Date(item.time);
        
        // 날짜 (12.18 수)
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const day = days[d.getDay()];
        dateStr = `${month}.${date} (${day})`;

        // 시간 (19:00)
        const hour = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        timeStr = `${hour}:${min}`;
    } catch(e) { 
        dateStr = "-.- (-)";
        timeStr = "00:00"; 
    }

    const isMatch = activeTab === 'match';
    const mainColor = isMatch ? 'text-blue-600' : 'text-orange-600';
    const bgColor = isMatch ? 'bg-blue-50' : 'bg-orange-50';

    const title = isMatch ? item.team : item.teamName;
    const info = isMatch 
        ? `${item.loc} · ${item.gender === 'male' ? '남' : item.gender === 'female' ? '여' : '혼성'}${item.type === '6man' ? '6' : '9'}`
        : `${item.loc} · ${item.positions || '포지션 무관'} 구함`;

    return (
      <TouchableOpacity 
        onPress={() => router.push(isMatch ? `/match/${item.id}` : `/guest/${item.id}`)}
        activeOpacity={0.7}
        className="flex-row items-center py-4 px-5 border-b border-gray-100 bg-white"
      >
        {/* 1. 날짜 & 시간 (좌측 영역) - [Change] 날짜와 시간을 함께 표시 */}
        <View className="w-[72px] mr-3 items-start justify-center">
            <Text className="text-[12px] font-medium text-gray-500 mb-0.5">{dateStr}</Text>
            <Text className="text-[16px] font-bold text-gray-900 tracking-tight">{timeStr}</Text>
        </View>

        {/* 2. 정보 (중앙 영역) */}
        <View className="flex-1 justify-center pr-2">
            <Text className="text-[16px] font-bold text-gray-900 mb-0.5" numberOfLines={1}>
                {title}
            </Text>
            <Text className={`text-[13px] font-medium ${isMatch ? 'text-gray-500' : 'text-gray-600'}`} numberOfLines={1}>
                {info}
            </Text>
        </View>

        {/* 3. 상태 태그 (우측 영역) */}
        <View className="ml-1 shrink-0">
            <View className={`${bgColor} px-2.5 py-1.5 rounded-lg`}>
                <Text className={`${mainColor} text-[11px] font-bold`}>
                    {isMatch ? '신청가능' : '구인중'}
                </Text>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* 1. Header & Tabs */}
      <View className="bg-white px-5 pt-2 pb-0">
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

      {/* 3. Simple List (FlatList) [Change] */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-24">
                    <Text className="text-gray-300 font-bold text-[14px] mb-1">
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