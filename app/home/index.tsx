import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Pressable, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth'; 
import { collection, query, orderBy, where, limit, startAfter, getDocs, doc, getDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY } from '../../configs/theme';
import { Card } from '../../components/Card';

// [New Design] 새로 만든 컴포넌트 임포트
import RankingCard from '../../components/RankingCard';
import WeekSelector from '../../components/WeekSelector';
import MenuGrid from '../../components/MenuGrid';

// [Architect's Fix] 전역 상수로 애니메이션 드라이버 설정 (성능 최적화)
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface Team {
  id: string;
  name: string;
  kusfId?: string;
  affiliation: string;
  gender: 'male' | 'female';
  stats: { wins: number; losses: number; points: number; total: number };
}

type MatchData = { 
  id: string; 
  team: string; 
  affiliation?: string; 
  type: '6man' | '9man'; 
  gender: 'male' | 'female' | 'mixed'; 
  time: string; 
  loc: string; 
  status: string; 
  level?: string; 
  isDeleted?: boolean;
};

// [Architect's Fix] AnimatedCard 컴포넌트 안정화
const AnimatedCard = ({ children, onPress, className, style }: { children: React.ReactNode, onPress: () => void, className?: string, style?: any }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleValue, { 
      toValue: 0.98, 
      useNativeDriver: USE_NATIVE_DRIVER, 
      speed: 20 
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleValue, { 
      toValue: 1, 
      useNativeDriver: USE_NATIVE_DRIVER, 
      speed: 20 
    }).start();
  };

  return (
    <Pressable 
      onPressIn={onPressIn} 
      onPressOut={onPressOut} 
      onPress={onPress} 
      style={{ width: '100%' }}
    >
      <Animated.View className={className} style={[style, { transform: [{ scale: scaleValue }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const FilterChip = ({ label, active, onPress }: { label: string, active: boolean, onPress: () => void }) => (
  <TouchableOpacity 
    onPress={onPress} 
    activeOpacity={0.7} 
    className="px-4 py-2.5 rounded-full mr-2 border flex-row items-center"
    style={{ 
        backgroundColor: active ? COLORS.textMain : COLORS.surface, 
        borderColor: active ? COLORS.textMain : COLORS.surface, 
        shadowColor: "#000", 
        shadowOpacity: active ? 0 : 0.05, 
        shadowRadius: 2, 
        elevation: active ? 0 : 1 
    }}
  >
    <Text className="text-sm font-bold" style={{ color: active ? '#FFFFFF' : COLORS.textSub }}>{label}</Text>
  </TouchableOpacity>
);

export default function HomeScreen() {
  const router = useRouter();
  
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
            const uSnap = await getDoc(doc(db, "users", user.uid));
            if (uSnap.exists()) {
              const data = uSnap.data();
              setUserTeamId(data.teamId || null);
              setUserName(data.nickname || data.name || '회원');
            }
        } catch(e) { console.log(e); }
      } else {
        setUserTeamId(null);
        setUserName('');
      }
      fetchMatches(true);
    });

    return () => unsubscribe();
  }, []); 

  useEffect(() => {
      fetchMatches(true);
  }, [filter]);

  const fetchMatches = async (isRefresh = false) => {
      if (isRefresh) {
          setLoading(true);
          setLastDoc(null);
      } else {
          if (!hasMore || loadingMore) return;
          setLoadingMore(true);
      }

      try {
          let q = query(
              collection(db, "matches"), 
              where("status", "==", "recruiting"), 
              orderBy("createdAt", "desc"),
              limit(10)
          );

          if (filter === '6man') q = query(q, where("type", "==", "6man"));
          else if (filter === '9man') q = query(q, where("type", "==", "9man"));
          else if (filter === 'mixed') q = query(q, where("gender", "==", "mixed"));
          else if (filter === 'male') q = query(q, where("gender", "==", "male"));
          else if (filter === 'female') q = query(q, where("gender", "==", "female"));

          if (!isRefresh && lastDoc) {
              q = query(q, startAfter(lastDoc));
          }

          const snapshot = await getDocs(q);
          const newMatches: MatchData[] = [];
          
          snapshot.forEach(d => {
              const data = d.data();
              if (!data.isDeleted) newMatches.push({ id: d.id, ...data } as MatchData);
          });

          if (isRefresh) {
              setMatches(newMatches);
          } else {
              setMatches(prev => {
                  const existingIds = new Set(prev.map(m => m.id));
                  const uniqueNewMatches = newMatches.filter(m => !existingIds.has(m.id));
                  return [...prev, ...uniqueNewMatches];
              });
          }

          if (snapshot.docs.length < 10) setHasMore(false);
          else {
              setHasMore(true);
              setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          }

      } catch (e: any) {
          console.error("Match Fetch Error:", e);
      } finally {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
      }
  };

  const onRefresh = () => {
      setRefreshing(true);
      fetchMatches(true);
  };

  const renderItem = ({ item }: { item: MatchData }) => {
    let displayDate = item.time;
    let displayTime = '';
    
    try {
        const d = new Date(item.time);
        if (!isNaN(d.getTime()) && item.time.includes('T')) {
            const month = d.getMonth() + 1;
            const date = d.getDate();
            const hour = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            displayDate = `${month}/${date}`;
            displayTime = `${hour}:${min}`;
        } else {
            const parts = item.time.split(' ');
            displayDate = parts[0] || item.time;
            displayTime = parts[1] ? parts[1].substring(0, 5) : '';
        }
    } catch(e) {
        displayDate = item.time;
    }

    return (
      <AnimatedCard className="p-6 rounded-[24px] mb-4 shadow-sm" style={{ backgroundColor: COLORS.surface }} onPress={() => router.push(`/match/${item.id}`)}>
        <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row gap-2">
                <View className="px-2.5 py-1.5 rounded-[8px]" style={{ backgroundColor: item.type === '6man' ? '#E8F3FF' : '#FFF5E6' }}><Text className="text-xs font-bold" style={{ color: item.type === '6man' ? '#1B64DA' : '#FF8C00' }}>{item.type === '6man' ? '6인제' : '9인제'}</Text></View>
                <View className="px-2.5 py-1.5 rounded-[8px]" style={{ backgroundColor: COLORS.background }}><Text className="text-xs font-bold" style={{ color: COLORS.textSub }}>{item.gender === 'male' ? '남자부' : item.gender === 'female' ? '여자부' : '혼성'}</Text></View>
            </View>
            <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E6F8EB' }}><Text className="text-xs font-bold text-[#26A96C]">신청 가능</Text></View>
        </View>
        <View className="mb-5">
            <Text className="text-[20px] font-bold mb-1.5 leading-tight" style={{ color: COLORS.textMain }} numberOfLines={2} ellipsizeMode="tail">{item.team}</Text>
            <Text className="text-sm font-medium" style={{ color: COLORS.textCaption }} numberOfLines={1}>{item.affiliation || '소속 미정'} {item.level ? `· ${item.level}급` : ''}</Text>
        </View>
        <View className="pt-4 border-t flex-row items-center" style={{ borderColor: COLORS.background }}>
            <View className="flex-row items-center mr-6 flex-shrink-0"><FontAwesome5 name="clock" size={13} color={COLORS.textSub} className="mr-1.5" /><Text className="text-sm font-bold" style={{ color: COLORS.textSub }}>{displayDate} <Text style={{ color: COLORS.primary }}>{displayTime}</Text></Text></View>
            <View className="flex-row items-center flex-1 overflow-hidden"><FontAwesome5 name="map-marker-alt" size={13} color={COLORS.textSub} className="mr-1.5" /><Text className="text-sm font-medium flex-1" style={{ color: COLORS.textSub }} numberOfLines={1}>{item.loc}</Text></View>
        </View>
      </AnimatedCard>
    );
  };

  if (!loading && !userTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-[#F8FAFC] px-6 justify-center">
        <StatusBar barStyle="dark-content" />
        <View className="mb-10">
          <Text className="text-4xl mb-2">👋</Text>
          <Text className={`${TYPOGRAPHY.h1} mb-2`}>{userName || '회원'}님</Text>
          <Text className={`${TYPOGRAPHY.body2} leading-6`}>
            아직 소속된 팀이 없어요.{'\n'}팀에 가입하거나 용병으로 활동해보세요.
          </Text>
        </View>

        <View className="gap-4">
          <Card onPress={() => router.push('/team/register?mode=search')}>
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-indigo-50 rounded-full items-center justify-center mr-4">
                <FontAwesome5 name="search" size={20} color={COLORS.primary} />
              </View>
              <View>
                <Text className={TYPOGRAPHY.h3}>팀 찾기</Text>
                <Text className={TYPOGRAPHY.body2}>이미 만들어진 팀에 들어가요</Text>
              </View>
            </View>
          </Card>

          <Card onPress={() => router.push('/team/register?mode=create')} variant="primary">
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-white/20 rounded-full items-center justify-center mr-4">
                <FontAwesome5 name="flag" size={18} color="white" />
              </View>
              <View>
                <Text className="text-lg font-bold text-white">팀 만들기</Text>
                <Text className="text-sm text-indigo-100">새로운 팀을 등록해요</Text>
              </View>
            </View>
          </Card>

          <Card onPress={() => router.push('/guest/list')}>
            <View className="flex-row items-center">
              <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4">
                <FontAwesome5 name="running" size={20} color="#F97316" />
              </View>
              <View>
                <Text className={TYPOGRAPHY.h3}>용병으로 참가하기</Text>
                <Text className={TYPOGRAPHY.body2}>팀 없이 경기에 참여해요</Text>
              </View>
            </View>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* [Design Change] 기존 헤더 제거됨 
         새로운 디자인에서는 알림 아이콘 등을 메뉴 그리드나 다른 곳으로 통합하거나, 
         필요하다면 상단에 별도로 배치할 수 있습니다. 
         일단 깔끔하게 새로운 UI(주차 선택 등)가 맨 위에 오도록 했습니다.
      */}
      
      <FlatList 
        data={matches} 
        renderItem={renderItem} 
        keyExtractor={item => item.id} 
        contentContainerClassName="pb-32" 
        showsVerticalScrollIndicator={false}
        onEndReached={() => fetchMatches(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={COLORS.primary} /> : <View className="h-8" />}
        
        /* [핵심 변경 사항] ListHeaderComponent
          기존의 복잡한 랭킹/버튼들을 지우고, 우리가 만든 깔끔한 3단 UI를 넣었습니다.
        */
        ListHeaderComponent={
          <View className="bg-white">
            {/* 1. 상단 새로운 UI 영역 (좌우 40px) */}
            <View className="px-[40px] pt-6">
                {/* 주차 선택 */}
                <WeekSelector />
                
                {/* 랭킹 카드 */}
                <RankingCard />
                
                {/* 메뉴 그리드 (시작하기, 팀찾기 등) */}
                <MenuGrid />
            </View>

            {/* 2. 매치 리스트 필터 및 타이틀 (기존 기능 보존을 위해 남겨둠) */}
            <View className="pl-[20px] mb-4 mt-2">
                <Text className="text-lg font-bold mb-3 text-darkGray px-[20px]">매칭 리스트</Text>
                <FlatList 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                    data={[{ id: 'all', label: '전체' }, { id: '6man', label: '6인제' }, { id: '9man', label: '9인제' }, { id: 'mixed', label: '혼성' }, { id: 'male', label: '남자부' }, { id: 'female', label: '여자부' }]} 
                    keyExtractor={(item) => item.id} 
                    renderItem={({ item }) => <FilterChip label={item.label} active={filter === item.id} onPress={() => setFilter(item.id)} />} 
                />
            </View>
          </View>
        } 
        
        ListEmptyComponent={!loading ? <View className="items-center justify-center py-20"><View className="w-20 h-20 rounded-full items-center justify-center mb-6" style={{ backgroundColor: '#E5E8EB' }}><FontAwesome5 name="search" size={32} color="#8B95A1" /></View><Text className="text-lg font-bold mb-2" style={{ color: COLORS.textMain }}>모집 중인 경기가 없어요</Text><Text className="text-sm text-center leading-relaxed" style={{ color: COLORS.textCaption }}>필터를 바꿔보거나,{'\n'}직접 매칭을 만들어보세요.</Text></View> : <View className="py-20"><ActivityIndicator size="large" color={COLORS.primary} /></View>} 
      />
      
      <AnimatedCard onPress={() => router.push('/match/write')} className="absolute bottom-8 right-6 px-6 py-4 rounded-full flex-row items-center shadow-lg" style={{ backgroundColor: COLORS.primary, shadowColor: '#3182F6', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }}><FontAwesome5 name="pen" size={14} color="white" className="mr-2" /><Text className="text-white font-bold text-base">매칭 만들기</Text></AnimatedCard>
    </SafeAreaView>
  );
}