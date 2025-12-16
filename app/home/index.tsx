// app/home/index.tsx
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
import { KUSF_TEAMS } from './ranking';

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

const RankingCard = ({ onPress }: { onPress: () => void }) => {
  const [topTeams, setTopTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'male'|'female'>('male');

  useEffect(() => {
      const fetchTopTeams = async () => {
          try {
              const q = query(collection(db, "teams"));
              const snap = await getDocs(q);
              
              const dbTeams = snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
              
              let combined = KUSF_TEAMS.filter(t => t.gender === tab);

              dbTeams.forEach(dbTeam => {
                  if(dbTeam.gender !== tab) return;

                  const idx = combined.findIndex(t => t.id === dbTeam.kusfId || t.name === dbTeam.name);
                  if (idx !== -1) {
                      combined[idx] = { 
                          ...combined[idx], 
                          ...dbTeam, 
                          stats: dbTeam.stats || combined[idx].stats 
                      };
                  } else {
                      combined.push({
                          id: dbTeam.id, 
                          name: dbTeam.name, 
                          affiliation: dbTeam.affiliation, 
                          gender: dbTeam.gender, 
                          stats: dbTeam.stats || { wins: 0, losses: 0, points: 0, total: 0 }
                      });
                  }
              });
              
              const finalTop3 = combined.sort((a, b) => b.stats.points - a.stats.points).slice(0, 3);
              setTopTeams(finalTop3);
          } catch (e) {
              console.error("Ranking Fetch Error:", e);
          } finally {
              setLoading(false);
          }
      };
      fetchTopTeams();
  }, [tab]);

  return (
    <AnimatedCard onPress={onPress} className="p-6 rounded-[24px] mb-8 shadow-sm" style={{ backgroundColor: COLORS.surface }}>
        <View className="flex-row justify-between items-start mb-4">
            <View>
                <Text className="text-xl font-extrabold mb-1" style={{ color: COLORS.textMain }}>실시간 순위</Text>
                <Text className="text-sm font-medium" style={{ color: COLORS.textSub }}>앱으로 경기를 잡고 순위를 올려봐요</Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color={COLORS.textCaption} className="mt-1" />
        </View>
        
        <View className="flex-row bg-[#F2F4F6] p-1 rounded-xl mb-4 self-start">
            <TouchableOpacity onPress={() => setTab('male')} className={`px-3 py-1.5 rounded-lg ${tab === 'male' ? 'bg-white shadow-sm' : ''}`}><Text className="text-xs font-bold" style={{ color: tab === 'male' ? COLORS.primary : COLORS.textCaption }}>남자부</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('female')} className={`px-3 py-1.5 rounded-lg ${tab === 'female' ? 'bg-white shadow-sm' : ''}`}><Text className="text-xs font-bold" style={{ color: tab === 'female' ? '#FF6B6B' : COLORS.textCaption }}>여자부</Text></TouchableOpacity>
        </View>

        <View className="gap-4">
            {loading ? <ActivityIndicator color={COLORS.primary} /> : topTeams.map((team, index) => {
                const badgeColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';
                return (
                    <View key={team.id || index} className="flex-row items-center justify-between">
                        <View className="flex-row items-center flex-1 mr-4">
                            <View className="w-7 h-7 items-center justify-center rounded-full mr-3" style={{ backgroundColor: index === 0 ? '#FFF9E5' : 'transparent' }}><Text className="font-black text-base" style={{ color: badgeColor }}>{index + 1}</Text></View>
                            <Text className="text-base font-bold flex-1" style={{ color: COLORS.textMain }} numberOfLines={1} ellipsizeMode="tail">{team.name}</Text>
                            {index === 0 && <FontAwesome5 name="crown" size={12} color={badgeColor} className="ml-1" />}
                        </View>
                        <Text className="text-sm font-bold" style={{ color: COLORS.textSub }}>{team.stats.points}점</Text>
                    </View>
                );
            })}
        </View>
    </AnimatedCard>
  );
};

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
    <SafeAreaView className="flex-1" style={{ backgroundColor: COLORS.background }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View className="px-6 pt-3 pb-2 flex-row justify-between items-center bg-[#F2F4F6]">
        <View><Text className="text-[26px] font-extrabold" style={{ color: COLORS.textMain }}>매칭 찾기</Text></View>
        <TouchableOpacity onPress={() => router.push('/home/notification')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7} className="p-2.5 rounded-full bg-white shadow-sm border border-gray-100"><FontAwesome5 name="bell" size={18} color={COLORS.textMain} /><View className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-red-500" /></TouchableOpacity>
      </View>
      
      <FlatList 
        data={matches} 
        renderItem={renderItem} 
        keyExtractor={item => item.id} 
        contentContainerClassName="px-5 pb-32 pt-4" 
        showsVerticalScrollIndicator={false}
        onEndReached={() => fetchMatches(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={COLORS.primary} /> : <View className="h-8" />}
        ListHeaderComponent={
            <>
                <RankingCard onPress={() => router.push('/home/ranking')} />
                
                <View className="flex-row gap-3 mb-6">
                    <TouchableOpacity onPress={() => router.push('/guest/list')} className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex-row items-center">
                        <View className="w-10 h-10 bg-orange-50 rounded-full items-center justify-center mr-3">
                            <FontAwesome5 name="running" size={16} color="#F97316" />
                        </View>
                        <View>
                            <Text className="font-bold text-gray-900">게스트 참여</Text>
                            <Text className="text-xs text-gray-500">팀 없이 참여해요</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/guest/write')} className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex-row items-center">
                        <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mr-3">
                            <FontAwesome5 name="user-plus" size={16} color="#4F46E5" />
                        </View>
                        <View>
                            <Text className="font-bold text-gray-900">게스트 모집</Text>

                        </View>
                    </TouchableOpacity>
                </View>

                <View className="mb-6">
                    <FlatList 
                        horizontal 
                        showsHorizontalScrollIndicator={false} 
                        data={[{ id: 'all', label: '전체' }, { id: '6man', label: '6인제' }, { id: '9man', label: '9인제' }, { id: 'mixed', label: '혼성' }, { id: 'male', label: '남자부' }, { id: 'female', label: '여자부' }]} 
                        keyExtractor={(item) => item.id} 
                        renderItem={({ item }) => <FilterChip label={item.label} active={filter === item.id} onPress={() => setFilter(item.id)} />} 
                    />
                </View>
            </>
        } 
        ListEmptyComponent={!loading ? <View className="items-center justify-center py-20"><View className="w-20 h-20 rounded-full items-center justify-center mb-6" style={{ backgroundColor: '#E5E8EB' }}><FontAwesome5 name="search" size={32} color="#8B95A1" /></View><Text className="text-lg font-bold mb-2" style={{ color: COLORS.textMain }}>모집 중인 경기가 없어요</Text><Text className="text-sm text-center leading-relaxed" style={{ color: COLORS.textCaption }}>필터를 바꿔보거나,{'\n'}직접 매칭을 만들어보세요.</Text></View> : <View className="py-20"><ActivityIndicator size="large" color={COLORS.primary} /></View>} 
      />
      <AnimatedCard onPress={() => router.push('/match/write')} className="absolute bottom-8 right-6 px-6 py-4 rounded-full flex-row items-center shadow-lg" style={{ backgroundColor: COLORS.primary, shadowColor: '#3182F6', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }}><FontAwesome5 name="pen" size={14} color="white" className="mr-2" /><Text className="text-white font-bold text-base">매칭 만들기</Text></AnimatedCard>
    </SafeAreaView>
  );
}