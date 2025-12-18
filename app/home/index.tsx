// app/home/index.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth'; 
import { collection, query, orderBy, where, limit, startAfter, getDocs, doc, getDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// [디자인 상수]
const BRAND_COLOR = '#007AFF'; // Apple Style Blue
const BG_COLOR = '#F2F2F7'; // Apple System Gray 6

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
    <View className={`items-center justify-center mr-3 ${selected ? 'w-[68px] h-[76px] rounded-[18px] bg-[#007AFF] shadow-sm shadow-blue-300' : 'w-[68px] h-[76px] bg-white rounded-[18px] border border-gray-100'}`}>
        <Text className={selected ? "text-white/80 font-semibold text-[13px] text-center mb-0.5" : "text-gray-400 font-medium text-[13px] text-center mb-0.5"}>
            {label.split(' ')[0]}
        </Text>
        <Text className={selected ? "text-white font-bold text-[17px] text-center" : "text-gray-800 font-bold text-[17px] text-center"}>
            {label.split(' ')[1]}
        </Text>
    </View>
);

// [UI Component] 퀵 메뉴 아이템 (심플 & 클린)
const QuickMenuItem = ({ label, icon, onPress, isActive = false }: { label: string, icon: string, onPress?: () => void, isActive?: boolean }) => (
    <TouchableOpacity 
        onPress={onPress} 
        activeOpacity={0.6}
        className="w-[22%] aspect-square items-center justify-center mb-2"
    >
       <View className={`w-[56px] h-[56px] rounded-[18px] items-center justify-center mb-2 shadow-sm ${isActive ? 'bg-blue-50' : 'bg-white'}`}>
           <FontAwesome5 name={icon} size={20} color={isActive ? BRAND_COLOR : '#333'} solid={isActive} />
       </View>
       <Text className="text-gray-600 font-medium text-[12px] tracking-tight text-center">{label}</Text>
    </TouchableOpacity>
);

// [UI Component] 필터 버튼 (Apple Chips 스타일)
const FilterButton = ({ label, active, hasIcon = true, onPress }: { label: string, active?: boolean, hasIcon?: boolean, onPress?: () => void }) => (
    <TouchableOpacity 
        onPress={onPress}
        className={`flex-row items-center px-3.5 py-2 rounded-full mr-2 border ${active ? 'bg-[#007AFF] border-[#007AFF]' : 'bg-white border-gray-200'}`}
        activeOpacity={0.7}
    >
        <Text className={`text-[13px] font-semibold mr-1 ${active ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
        {hasIcon && <FontAwesome5 name="chevron-down" size={9} color={active ? '#FFF' : '#8E8E93'} />}
    </TouchableOpacity>
);

export default function HomeScreen() {
  const router = useRouter();
  
  // 상태 관리 (로직 보존)
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [matchTab, setMatchTab] = useState<'team' | 'guest'>('team'); 

  // [New] 찜하기 로컬 상태 (UI 즉각 반응용 - 하트 색상만 변경)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // 찜하기 토글 함수
  const toggleLike = (id: string) => {
    setLikedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };
  
  // 로직: 초기 데이터 로드
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

  // 로직: 필터 변경 감지
  useEffect(() => { fetchMatches(true); }, [filter]);

  // 로직: Firebase Fetch 함수
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

  // [UI] 매치 카드 렌더링
  const renderItem = ({ item }: { item: MatchData }) => {
    let displayDate = item.time;
    let displayTime = '';
    let dayOfWeek = '';
    
    // 날짜 파싱 로직 (보존)
    try {
        const d = new Date(item.time);
        if (!isNaN(d.getTime()) && item.time.includes('T')) {
            const month = d.getMonth() + 1;
            const date = d.getDate();
            const hour = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            dayOfWeek = days[d.getDay()];
            displayDate = `${month}.${date}`;
            displayTime = `${hour}:${min}`;
        } else {
            const parts = item.time.split(' ');
            if(parts[0].includes('-')) {
                const dates = parts[0].split('-');
                displayDate = `${parseInt(dates[1])}.${parseInt(dates[2])}`;
            } else {
                displayDate = parts[0];
            }
            displayTime = parts[1] ? parts[1].substring(0, 5) : '';
        }
    } catch(e) { displayDate = item.time; }

    const isLiked = likedIds.has(item.id);

    return (
      <TouchableOpacity 
        className="bg-white p-5 mb-3.5 rounded-[22px] shadow-sm border border-gray-100/80 active:bg-gray-50" 
        onPress={() => router.push(`/match/${item.id}`)}
        activeOpacity={0.8}
      >
        {/* Header: Status & Time */}
        <View className="flex-row justify-between items-start mb-3">
            <View className="flex-row items-center">
                <View className="bg-blue-50 px-2.5 py-1 rounded-[8px] mr-2">
                    <Text className="text-[#007AFF] text-[11px] font-bold tracking-tight">모집중</Text>
                </View>
                <Text className="text-gray-500 text-[13px] font-medium tracking-tight">
                    {displayDate} ({dayOfWeek || '·'}) <Text className="text-gray-800 font-semibold">{displayTime}</Text>
                </Text>
            </View>
            {/* Heart Button */}
            <TouchableOpacity 
                onPress={() => toggleLike(item.id)}
                hitSlop={{top:15, bottom:15, left:15, right:15}}
            >
                <FontAwesome5 
                    name="heart" 
                    size={18} 
                    solid={isLiked} 
                    color={isLiked ? "#FF3B30" : "#D1D1D6"} 
                />
            </TouchableOpacity>
        </View>

        {/* Content: Team & Type */}
        <View className="flex-row items-center justify-between mb-4">
            <View className="flex-1 mr-4">
                <Text className="text-[19px] font-bold text-gray-900 leading-tight mb-1" numberOfLines={1}>{item.team}</Text>
                <Text className="text-[13px] text-gray-500 font-medium">
                    {item.gender === 'male' ? '남자부' : item.gender === 'female' ? '여자부' : '혼성'} · {item.type === '6man' ? '6인제' : '9인제'}
                </Text>
            </View>
            {/* VS Badge */}
            <View className="w-[42px] h-[42px] rounded-full bg-gray-50 items-center justify-center border border-gray-100">
                <Text className="text-gray-400 font-black text-[11px] italic">VS</Text>
            </View>
        </View>

        {/* Footer: Location */}
        <View className="flex-row items-center">
            <FontAwesome5 name="map-marker-alt" size={12} color="#8E8E93" style={{marginRight: 6}} />
            <Text className="text-gray-500 text-[13px] font-medium flex-1 tracking-tight" numberOfLines={1}>
                {item.loc || '장소 미정'}
            </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // [헤더 컴포넌트]
  const ListHeader = () => (
      <View className="mb-4">
          {/* 1. Top Bar */}
          <View className="flex-row justify-between items-center px-5 py-3 bg-white mb-2">
              <Text className="text-[28px] font-extrabold text-black tracking-tighter">PIPE</Text>
              <TouchableOpacity 
                className="w-10 h-10 bg-gray-50 rounded-full items-center justify-center"
                activeOpacity={0.7}
              >
                  <FontAwesome5 name="bell" size={18} color="#1C1C1E" />
              </TouchableOpacity>
          </View>

          <View className="bg-white rounded-b-[32px] shadow-sm pb-8 px-5 mb-6 border-b border-gray-100">
              {/* 2. Banner */}
              <TouchableOpacity 
                onPress={() => router.push('/home/ranking')}
                className="w-full rounded-[24px] px-6 py-7 mb-8 justify-between relative overflow-hidden shadow-lg shadow-blue-200/40"
                style={{ backgroundColor: BRAND_COLOR }}
                activeOpacity={0.9}
              >
                  <View className="z-10">
                    <View className="bg-white/20 self-start px-2 py-0.5 rounded-[6px] mb-2">
                        <Text className="text-white text-[11px] font-bold">New Season</Text>
                    </View>
                    <Text className="text-white text-[22px] font-black leading-snug tracking-tight">2026-1 시즌이{'\n'}시작됐어요!</Text>
                  </View>
                  <View className="absolute right-[-15] bottom-[-15] opacity-20 transform rotate-12">
                    <FontAwesome5 name="trophy" size={110} color="white" />
                  </View>
              </TouchableOpacity>

              {/* 3. Quick Menu (수정: 찜한 매치는 그대로 두되, 이동 기능만 제거) */}
              <View className="flex-row justify-between px-1">
                  <QuickMenuItem label="시작하기" icon="flag" onPress={() => {}} />
                  <QuickMenuItem label="팀찾기" icon="search" onPress={() => router.push('/team/register?mode=search')} />
                  <QuickMenuItem label="매치생성" icon="pen" onPress={() => router.push('/match/write')} />
                  {/* 여기 이동 로직(onPress)을 비워두었습니다 */}
                  <QuickMenuItem label="찜한 매치" icon="heart" onPress={() => {}} />
              </View>
          </View>

          {/* 4. Calendar & Filter */}
          <View className="px-5">
            <View className="flex-row justify-between items-end mb-5">
                <Text className="text-[22px] font-bold text-gray-900 tracking-tight">이번주 매치</Text>
                <TouchableOpacity activeOpacity={0.6}>
                    <Text className="text-[#007AFF] text-[14px] font-semibold">전체보기</Text>
                </TouchableOpacity>
            </View>

            {/* Toggle Switch */}
            <View className="flex-row bg-[#E5E5EA] p-[4px] rounded-[14px] mb-6 self-start w-[180px]">
                <TouchableOpacity 
                    onPress={() => setMatchTab('team')}
                    className={`flex-1 py-1.5 rounded-[11px] items-center justify-center ${matchTab === 'team' ? 'bg-white shadow-sm' : ''}`}
                    activeOpacity={0.8}
                >
                    <Text className={`font-semibold text-[13px] ${matchTab === 'team' ? 'text-black' : 'text-gray-400'}`}>팀 매치</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setMatchTab('guest')}
                    className={`flex-1 py-1.5 rounded-[11px] items-center justify-center ${matchTab === 'guest' ? 'bg-white shadow-sm' : ''}`}
                    activeOpacity={0.8}
                >
                    <Text className={`font-semibold text-[13px] ${matchTab === 'guest' ? 'text-black' : 'text-gray-400'}`}>게스트</Text>
                </TouchableOpacity>
            </View>

            {/* Calendar */}
            <View className="mb-6">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight: 20}}>
                    <WeekItem label="12월 1주" selected={true} />
                    <WeekItem label="12월 2주" selected={false} />
                    <WeekItem label="12월 3주" selected={false} />
                    <WeekItem label="12월 4주" selected={false} />
                    <WeekItem label="1월 1주" selected={false} />
                </ScrollView>
            </View>

            {/* Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2" contentContainerStyle={{paddingRight: 20}}>
                <FilterButton label="서울 전체" active hasIcon />
                <FilterButton label="성별" />
                <FilterButton label="6인제" active={filter === '6man'} onPress={() => setFilter(filter === '6man' ? 'all' : '6man')} />
                <FilterButton label="마감 제외" hasIcon={false} /> 
            </ScrollView>
          </View>
      </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F2F2F7]" edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <FlatList 
        data={matches} 
        renderItem={renderItem} 
        keyExtractor={item => item.id} 
        contentContainerClassName="pb-32"
        style={{ paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
        onEndReached={() => fetchMatches(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND_COLOR]} />}
        ListHeaderComponent={<ListHeader />}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={BRAND_COLOR} /> : <View className="h-8" />}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-20 bg-white mx-1 rounded-[20px] border border-gray-200 border-dashed">
                    <FontAwesome5 name="volleyball-ball" size={32} color="#D1D1D6" style={{marginBottom: 12}} />
                    <Text className="text-gray-400 text-center font-bold text-[15px]">조건에 맞는 경기가 없어요.</Text>
                </View>
            ) : (
                <View className="py-20"><ActivityIndicator size="large" color={BRAND_COLOR} /></View>
            )
        } 
      />
    </SafeAreaView>
  );
}