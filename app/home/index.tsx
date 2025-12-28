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
import GuestCard from '../../components/GuestCard';
import { GuestPost } from '../../hooks/useGuest';

const TEAM_COLOR = '#4F46E5'; 
const GUEST_COLOR = '#EA580C'; 

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
  const [activeTab, setActiveTab] = useState<'match' | 'guest'>('match');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const fetchData = async () => {
      setLoading(true);
      
      try {
          const collectionName = activeTab === 'match' ? 'matches' : 'guest_posts';
          const nowISO = new Date().toISOString();

          const q = query(
              collection(db, collectionName), 
              where("status", "==", "recruiting"), 
              where("time", ">=", nowISO),         
              orderBy("time", "asc"),              
              limit(50) 
          );

          const snapshot = await getDocs(q);
          const rawItems: any[] = [];
          
          snapshot.forEach(d => {
              const data = d.data();
              if (!data.isDeleted) {
                  // [Fix] 홈 화면에서도 포지션/시간 데이터 정제
                  const time = data.time || data.matchDate || nowISO;
                  
                  let safePositions: string[] = [];
                  if (activeTab === 'guest') {
                      if (Array.isArray(data.positions)) {
                          safePositions = data.positions;
                      } else if (typeof data.positions === 'string') {
                          safePositions = data.positions.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                      }
                  }

                  rawItems.push({ 
                      id: d.id, 
                      ...data, 
                      time,
                      positions: safePositions, // 정제된 배열 주입
                      applicants: data.applicants || []
                  });
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

  const renderItem = ({ item }: { item: any }) => {
    const isMatch = activeTab === 'match';

    if (!isMatch) {
        return (
            <GuestCard 
                item={item as GuestPost} 
                onPress={() => router.push(`/guest/${item.id}` as any)}
                variant="simple" 
            />
        );
    }

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
        <View className="w-[72px] mr-3 items-start justify-center">
            <Text className="text-[12px] font-medium text-gray-500 mb-0.5">{dateStr}</Text>
            <Text className="text-[16px] font-bold text-gray-900 tracking-tight">{timeStr}</Text>
        </View>

        <View className="flex-1 justify-center pr-2">
            <Text className="text-[16px] font-bold text-gray-900 mb-1" numberOfLines={1}>
                {item.team}
            </Text>
            <Text className="text-[13px] font-medium text-gray-500" numberOfLines={1}>
                {item.loc} · {item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '혼성'} · {item.type === '6man' ? '6인제' : '9인제'}
            </Text>
        </View>

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