// app/home/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth'; 
import { collection, query, orderBy, where, limit, startAfter, getDocs, doc, getDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// [디자인 상수] 브랜드 컬러
const BRAND_COLOR = '#2962FF';

// [데이터 타입 정의]
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

// [UI Component] 주차별 캘린더 아이템
const WeekItem = ({ label, selected }: { label: string, selected: boolean }) => (
    <View className={`items-center justify-center mr-3 ${selected ? 'w-[74px] h-[74px] rounded-full bg-[#2962FF]' : 'w-[74px] h-[74px]'}`}>
        <Text className={selected ? "text-white font-black text-[15px] text-center leading-tight" : "text-gray-400 font-bold text-[15px] text-center leading-tight"}>
            {label.replace(' ', '\n')}
        </Text>
    </View>
);

// [UI Component] 퀵 메뉴 아이템
const QuickMenuItem = ({ label, onPress }: { label: string, onPress?: () => void }) => (
    <TouchableOpacity 
        onPress={onPress} 
        activeOpacity={0.7}
        className="w-[23%] aspect-square bg-gray-100 rounded-[22px] items-center justify-center mb-4"
    >
       <Text className="text-gray-800 font-bold text-[13px] text-center leading-4">{label.replace(' ', '\n')}</Text>
    </TouchableOpacity>
);

// [UI Component] 필터 버튼 (오류 수정됨: onPress 추가)
const FilterButton = ({ label, active, hasIcon = true, onPress }: { label: string, active?: boolean, hasIcon?: boolean, onPress?: () => void }) => (
    <TouchableOpacity 
        onPress={onPress}
        className={`flex-row items-center px-4 py-2 rounded-full border mr-2 ${active ? 'border-[#2962FF]' : 'border-gray-200 bg-white'}`}
    >
        <Text className={`text-[13px] font-bold mr-1 ${active ? 'text-[#2962FF]' : 'text-gray-500'}`}>{label}</Text>
        {hasIcon && <FontAwesome5 name="chevron-down" size={10} color={active ? '#2962FF' : '#999'} />}
    </TouchableOpacity>
);

export default function HomeScreen() {
  const router = useRouter();
  
  // 상태 관리
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 유저 정보
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');

  // UI 탭 상태 (팀매치/게스트)
  const [matchTab, setMatchTab] = useState<'team' | 'guest'>('team'); 
  
  // 초기 실행: 유저 정보 확인 및 매치 로드
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

  // 필터 변경 시 매치 목록 재로드
  useEffect(() => { fetchMatches(true); }, [filter]);

  // 매치 데이터 불러오기 (Firebase Query)
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

          // 필터 조건 적용
          if (filter === '6man') q = query(q, where("type", "==", "6man"));
          else if (filter === '9man') q = query(q, where("type", "==", "9man"));
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

  // 리스트 아이템 렌더링
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
            if(parts[0].includes('-')) {
                const dates = parts[0].split('-');
                displayDate = `${parseInt(dates[1])}/${parseInt(dates[2])}`;
            } else {
                displayDate = parts[0];
            }
            displayTime = parts[1] ? parts[1].substring(0, 5) : '';
        }
    } catch(e) { displayDate = item.time; }

    return (
      <TouchableOpacity 
        className="flex-row py-6 border-b border-gray-100 bg-white" 
        onPress={() => router.push(`/match/${item.id}`)}
        activeOpacity={0.7}
      >
        <View className="w-[52px] mr-3 items-center pt-1">
            <Text className="text-[20px] font-black text-black mb-1 leading-none">{displayDate}</Text>
            <Text className="text-[14px] font-bold text-gray-800">{displayTime}</Text>
        </View>

        <View className="flex-1 pr-2 justify-center">
            <View className="flex-row items-center mb-1.5">
                <FontAwesome5 name="map-marker-alt" size={11} color="#9CA3AF" style={{marginRight: 4}} />
                <Text className="text-[12px] text-gray-400 font-medium" numberOfLines={1}>{item.loc || '장소 미정'}</Text>
            </View>
            <View className="flex-row items-baseline mb-1">
                <Text className="text-[13px] text-gray-400 mr-1.5 font-bold">VS</Text>
                <Text className="text-[18px] font-black text-black tracking-tight" numberOfLines={1}>{item.team}</Text>
            </View>
            <Text className="text-[12px] text-gray-400 font-medium">
                {item.gender === 'male' ? '남자부' : item.gender === 'female' ? '여자부' : '혼성'} · {item.type === '6man' ? '6인제' : '9인제'}
            </Text>
        </View>

        <View className="justify-center pl-2">
            <FontAwesome5 name="heart" solid={false} size={20} color="#FF6B6B" style={{ opacity: 0.5 }} />
        </View>
      </TouchableOpacity>
    );
  };

  // [헤더 컴포넌트]
  const ListHeader = () => (
      <View className="bg-white pt-2">
          {/* 1. 로고 */}
          <View className="pb-5">
              <Text className="text-[30px] font-black text-black tracking-tighter">PIPE</Text>
          </View>

          {/* 2. 메인 배너 */}
          <TouchableOpacity 
            onPress={() => router.push('/home/ranking')}
            className="w-full rounded-[20px] px-6 py-6 mb-8 justify-center shadow-sm relative overflow-hidden"
            style={{ backgroundColor: BRAND_COLOR }}
          >
              <Text className="text-white text-[20px] font-black mb-1.5 leading-snug tracking-tight">2026-1 시즌이 시작됐어요</Text>
              <View className="border-b-2 border-white self-start">
                <Text className="text-white text-[20px] font-black leading-snug tracking-tight pb-0.5">실시간 랭킹을 확인해보세요!</Text>
              </View>
          </TouchableOpacity>

          {/* 3. 퀵 메뉴 (4번째: 매치 생성) */}
          <View className="flex-row flex-wrap justify-between mb-6">
              <QuickMenuItem label="시작하기" onPress={() => {}} />
              <QuickMenuItem label="팀찾기" onPress={() => router.push('/team/register?mode=search')} />
              <QuickMenuItem label="찜한 매치" onPress={() => {}} />
              <QuickMenuItem label="매치 생성" onPress={() => router.push('/match/write')} />
          </View>

          {/* 4. 주차별 캘린더 */}
          <View className="mb-8">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight: 20}}>
                  <WeekItem label="12월 1주차" selected={true} />
                  <WeekItem label="12월 2주차" selected={false} />
                  <WeekItem label="12월 3주차" selected={false} />
                  <WeekItem label="12월 4주차" selected={false} />
                  <WeekItem label="1월 1주차" selected={false} />
              </ScrollView>
          </View>

          {/* 5. 필터 섹션 */}
          <View className="mb-2">
              <View className="flex-row items-center justify-center mb-5">
                  <View className="flex-row bg-gray-100 p-1.5 rounded-full">
                    <TouchableOpacity 
                        onPress={() => setMatchTab('team')}
                        className={`px-8 py-2.5 rounded-full ${matchTab === 'team' ? 'bg-black shadow-sm' : ''}`}
                    >
                        <Text className={`font-bold text-[15px] ${matchTab === 'team' ? 'text-white' : 'text-gray-400'}`}>팀 매치</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setMatchTab('guest')}
                        className={`px-8 py-2.5 rounded-full ${matchTab === 'guest' ? 'bg-black shadow-sm' : ''}`}
                    >
                        <Text className={`font-bold text-[15px] ${matchTab === 'guest' ? 'text-white' : 'text-gray-400'}`}>게스트</Text>
                    </TouchableOpacity>
                  </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2" contentContainerStyle={{paddingRight: 20}}>
                  <FilterButton label="서울" active />
                  <FilterButton label="마감 가리기" hasIcon={false} /> 
                  <FilterButton label="성별" />
                  <FilterButton label="6인제" active={filter === '6man'} onPress={() => setFilter(filter === '6man' ? 'all' : '6man')} />
              </ScrollView>
          </View>
      </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <FlatList 
        data={matches} 
        renderItem={renderItem} 
        keyExtractor={item => item.id} 
        contentContainerClassName="px-5 pb-32" 
        showsVerticalScrollIndicator={false}
        onEndReached={() => fetchMatches(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND_COLOR]} />}
        ListHeaderComponent={<ListHeader />}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={BRAND_COLOR} /> : <View className="h-8" />}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-20">
                    <Text className="text-gray-300 text-center font-bold">조건에 맞는 경기가 없어요.</Text>
                </View>
            ) : (
                <View className="py-20"><ActivityIndicator size="large" color={BRAND_COLOR} /></View>
            )
        } 
      />
    </SafeAreaView>
  );
}