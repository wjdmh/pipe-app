import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl, 
  StatusBar, 
  FlatList 
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '../../context/UserContext';

// ✅ [New] 컴포넌트 임포트
import GuestCard from '../../components/GuestCard';
import MatchCard, { MatchData } from '../../components/MatchCard'; 
import { GuestPost } from '../../hooks/useGuest';

const TEAM_COLOR = '#4F46E5'; 
const GUEST_COLOR = '#EA580C'; 

export default function HomeScreen() {
  const router = useRouter();
  const { requireAuth } = useUser();
  const [activeTab, setActiveTab] = useState<'match' | 'guest'>('match');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const fetchData = async () => {
      setLoading(true);
      
      try {
          const collectionName = activeTab === 'match' ? 'matches' : 'guest_posts';
          const nowISO = new Date().toISOString();

          // 모집중이고, 현재 시간 이후의 매치/게스트만 조회
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
                  // 시간 데이터 정제
                  const time = data.time || data.matchDate || nowISO;
                  
                  // 게스트 모집일 경우 포지션 데이터 정제
                  let safePositions: string[] = [];
                  if (activeTab === 'guest') {
                      if (Array.isArray(data.positions)) {
                          safePositions = data.positions;
                      } else if (typeof data.positions === 'string') {
                          safePositions = data.positions.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
                      }
                  }

                  // ✅ 데이터 병합 (teamName 필드도 여기서 자동으로 포함됨)
                  rawItems.push({ 
                      id: d.id, 
                      ...data, 
                      time,
                      positions: safePositions, 
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

    // 1. 게스트 모집 카드 렌더링
    if (!isMatch) {
        return (
            <GuestCard 
                item={item as GuestPost} 
                onPress={() => router.push(`/guest/${item.id}` as any)}
                variant="simple" 
            />
        );
    }

    // 2. [New] 매치 카드 렌더링 (교체 완료)
    // 기존의 복잡한 인라인 코드를 MatchCard 컴포넌트로 대체하여 가독성과 재사용성을 높였습니다.
    return (
      <MatchCard 
        item={item as MatchData}
        onPress={() => router.push(`/match/${item.id}` as any)}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header & Tabs */}
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

      {/* Ranking Banner */}
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

      {/* List Area */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 20, paddingTop: 10 }}
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
      
      {/* Floating Action Button (FAB) */}
      <TouchableOpacity 
        onPress={() => requireAuth(() => router.push(activeTab === 'match' ? '/match/write' : '/guest/write'))}
        className="absolute bottom-6 right-5 w-14 h-14 bg-gray-900 rounded-full items-center justify-center shadow-lg shadow-gray-400/50"
        activeOpacity={0.8}
      >
        <FontAwesome5 name={activeTab === 'match' ? "plus" : "pen"} size={20} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
