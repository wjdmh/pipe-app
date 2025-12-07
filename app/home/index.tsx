import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Pressable, Animated, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, where, limit, startAfter, getDocs, doc, getDoc, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { COLORS, TYPOGRAPHY } from '../../configs/theme';
import { Card } from '../../components/Card';
import { KUSF_TEAMS } from './ranking';

// [Fix] 타입 정의 추가 (TypeScript 에러 방지)
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
  isDeleted?: boolean; // 삭제 여부 필드 추가
};

const AnimatedCard = ({ children, onPress, style }: { children: React.ReactNode, onPress: () => void, style?: any }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  return (
    <Pressable onPressIn={() => Animated.spring(scaleValue, { toValue: 0.98, useNativeDriver: true, speed: 20 }).start()} 
               onPressOut={() => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, speed: 20 }).start()} 
               onPress={onPress} style={{ width: '100%' }}>
      <Animated.View style={[style, { transform: [{ scale: scaleValue }] }]}>{children}</Animated.View>
    </Pressable>
  );
};

const FilterChip = ({ label, active, onPress }: { label: string, active: boolean, onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[tw`px-4 py-2.5 rounded-full mr-2 border flex-row items-center`, { backgroundColor: active ? COLORS.textMain : COLORS.surface, borderColor: active ? COLORS.textMain : COLORS.surface, shadowColor: "#000", shadowOpacity: active ? 0 : 0.05, shadowRadius: 2, elevation: active ? 0 : 1 }]}>
    <Text style={[tw`text-sm font-bold`, { color: active ? '#FFFFFF' : COLORS.textSub }]}>{label}</Text>
  </TouchableOpacity>
);

const RankingCard = ({ onPress }: { onPress: () => void }) => {
  const [topTeams, setTopTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'male'|'female'>('male'); // [New] 성별 탭 추가

  useEffect(() => {
      const fetchTopTeams = async () => {
          try {
              // [Correction] 정확한 순위 계산을 위해 limit 제거 (전체 로드 후 병합)
              const q = query(collection(db, "teams"));
              const snap = await getDocs(q);
              
              // DB 데이터를 Team 타입으로 캐스팅하여 가져옴
              const dbTeams = snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
              
              // KUSF 데이터와 병합 로직
              // 1. 현재 탭(성별)에 맞는 KUSF 데이터만 필터링
              let combined = KUSF_TEAMS.filter(t => t.gender === tab);

              dbTeams.forEach(dbTeam => {
                  // 성별 불일치 시 스킵
                  if(dbTeam.gender !== tab) return;

                  const idx = combined.findIndex(t => t.id === dbTeam.kusfId || t.name === dbTeam.name);
                  if (idx !== -1) {
                      // 기존 KUSF 팀 정보 업데이트 (DB 정보가 최신)
                      combined[idx] = { 
                          ...combined[idx], 
                          ...dbTeam, 
                          stats: dbTeam.stats || combined[idx].stats 
                      };
                  } else {
                      // KUSF 리스트에 없는 신규 팀 추가
                      combined.push({
                          id: dbTeam.id, 
                          name: dbTeam.name, 
                          affiliation: dbTeam.affiliation, 
                          gender: dbTeam.gender, 
                          stats: dbTeam.stats || { wins: 0, losses: 0, points: 0, total: 0 }
                      });
                  }
              });
              
              // 포인트 내림차순 정렬 후 상위 3개만 표시
              const finalTop3 = combined.sort((a, b) => b.stats.points - a.stats.points).slice(0, 3);
              setTopTeams(finalTop3);
          } catch (e) {
              console.error("Ranking Fetch Error:", e);
          } finally {
              setLoading(false);
          }
      };
      fetchTopTeams();
  }, [tab]); // 탭 변경 시 재실행

  return (
    <AnimatedCard onPress={onPress} style={[tw`p-6 rounded-[24px] mb-8 shadow-sm`, { backgroundColor: COLORS.surface }]}>
        <View style={tw`flex-row justify-between items-start mb-4`}>
            <View><Text style={[tw`text-xl font-extrabold mb-1`, { color: COLORS.textMain }]}>실시간 순위 🔥</Text><Text style={[tw`text-sm font-medium`, { color: COLORS.textSub }]}>매칭을 잡고 순위를 올려보세요!</Text></View>
            <FontAwesome5 name="chevron-right" size={14} color={COLORS.textCaption} style={tw`mt-1`} />
        </View>
        
        {/* 성별 탭 */}
        <View style={tw`flex-row bg-[#F2F4F6] p-1 rounded-xl mb-4 self-start`}>
            <TouchableOpacity onPress={() => setTab('male')} style={tw`px-3 py-1.5 rounded-lg ${tab === 'male' ? 'bg-white shadow-sm' : ''}`}><Text style={[tw`text-xs font-bold`, { color: tab === 'male' ? COLORS.primary : COLORS.textCaption }]}>남자부</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('female')} style={tw`px-3 py-1.5 rounded-lg ${tab === 'female' ? 'bg-white shadow-sm' : ''}`}><Text style={[tw`text-xs font-bold`, { color: tab === 'female' ? '#FF6B6B' : COLORS.textCaption }]}>여자부</Text></TouchableOpacity>
        </View>

        <View style={tw`gap-4`}>
            {loading ? <ActivityIndicator color={COLORS.primary} /> : topTeams.map((team, index) => {
                const badgeColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';
                return (
                    <View key={team.id || index} style={tw`flex-row items-center justify-between`}>
                        <View style={tw`flex-row items-center flex-1 mr-4`}>
                            <View style={[tw`w-7 h-7 items-center justify-center rounded-full mr-3`, { backgroundColor: index === 0 ? '#FFF9E5' : 'transparent' }]}><Text style={[tw`font-black text-base`, { color: badgeColor }]}>{index + 1}</Text></View>
                            <Text style={[tw`text-base font-bold flex-1`, { color: COLORS.textMain }]} numberOfLines={1} ellipsizeMode="tail">{team.name}</Text>
                            {index === 0 && <FontAwesome5 name="crown" size={12} color={badgeColor} style={tw`ml-1`} />}
                        </View>
                        <Text style={[tw`text-sm font-bold`, { color: COLORS.textSub }]}>{team.stats.points}점</Text>
                    </View>
                );
            })}
        </View>
    </AnimatedCard>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  
  // Data States
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  // UI States
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // User Info
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');

  // 1. 유저 정보 확인
  useEffect(() => {
    const checkUserTeam = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
            const uSnap = await getDoc(doc(db, "users", user.uid));
            if (uSnap.exists()) {
              const data = uSnap.data();
              setUserTeamId(data.teamId || null);
              setUserName(data.nickname || data.name || '회원');
            }
        } catch(e) { console.log(e); }
      }
      // 유저 정보 로드 후 매칭 데이터 로드 시작
      fetchMatches(true);
    };
    checkUserTeam();
  }, []);

  // 2. 필터 변경 시 데이터 리셋 및 재호출
  useEffect(() => {
      fetchMatches(true);
  }, [filter]);

  // [Core Logic] 매칭 데이터 페칭 (Pagination + Filtering)
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

          // 필터 적용 (DB Query Level)
          if (filter === '6man') q = query(q, where("type", "==", "6man"));
          else if (filter === '9man') q = query(q, where("type", "==", "9man"));
          else if (filter === 'mixed') q = query(q, where("gender", "==", "mixed"));
          else if (filter === 'male') q = query(q, where("gender", "==", "male"));
          else if (filter === 'female') q = query(q, where("gender", "==", "female"));

          // 페이지네이션 커서 적용
          if (!isRefresh && lastDoc) {
              q = query(q, startAfter(lastDoc));
          }

          const snapshot = await getDocs(q);
          const newMatches: MatchData[] = [];
          
          snapshot.forEach(d => {
              const data = d.data();
              if (!data.isDeleted) newMatches.push({ id: d.id, ...data } as MatchData);
          });

          // 상태 업데이트 [Critical Fix: 중복 데이터 방어]
          if (isRefresh) {
              setMatches(newMatches);
          } else {
              setMatches(prev => {
                  // 기존 ID들을 Set으로 만들어 중복 체크 (O(1))
                  const existingIds = new Set(prev.map(m => m.id));
                  // 중복되지 않은 새 데이터만 필터링
                  const uniqueNewMatches = newMatches.filter(m => !existingIds.has(m.id));
                  return [...prev, ...uniqueNewMatches];
              });
          }

          // 다음 페이지 존재 여부 확인
          if (snapshot.docs.length < 10) setHasMore(false);
          else {
              setHasMore(true);
              setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          }

      } catch (e: any) {
          console.error("Match Fetch Error:", e);
          if (e.message && e.message.includes("index")) {
              Alert.alert("개발자 알림", "필터링을 위한 색인(Index)이 필요합니다. 콘솔 링크를 확인하세요.");
          }
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
    
    // 날짜 파싱 안전장치
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
      <AnimatedCard style={[tw`p-6 rounded-[24px] mb-4 shadow-sm`, { backgroundColor: COLORS.surface }]} onPress={() => router.push(`/match/${item.id}`)}>
        <View style={tw`flex-row items-center justify-between mb-4`}>
            <View style={tw`flex-row gap-2`}>
                <View style={[tw`px-2.5 py-1.5 rounded-[8px]`, { backgroundColor: item.type === '6man' ? '#E8F3FF' : '#FFF5E6' }]}><Text style={[tw`text-xs font-bold`, { color: item.type === '6man' ? '#1B64DA' : '#FF8C00' }]}>{item.type === '6man' ? '6인제' : '9인제'}</Text></View>
                <View style={[tw`px-2.5 py-1.5 rounded-[8px]`, { backgroundColor: COLORS.background }]}><Text style={[tw`text-xs font-bold`, { color: COLORS.textSub }]}>{item.gender === 'male' ? '남자부' : item.gender === 'female' ? '여자부' : '혼성'}</Text></View>
            </View>
            <View style={[tw`px-2.5 py-1 rounded-full`, { backgroundColor: '#E6F8EB' }]}><Text style={[tw`text-xs font-bold text-[#26A96C]`]}>신청 가능</Text></View>
        </View>
        <View style={tw`mb-5`}>
            <Text style={[tw`text-[20px] font-bold mb-1.5 leading-tight`, { color: COLORS.textMain }]} numberOfLines={2} ellipsizeMode="tail">{item.team}</Text>
            <Text style={[tw`text-sm font-medium`, { color: COLORS.textCaption }]} numberOfLines={1}>{item.affiliation || '소속 미정'} {item.level ? `· ${item.level}급` : ''}</Text>
        </View>
        <View style={[tw`pt-4 border-t flex-row items-center`, { borderColor: COLORS.background }]}>
            <View style={tw`flex-row items-center mr-6 flex-shrink-0`}><FontAwesome5 name="clock" size={13} color={COLORS.textSub} style={tw`mr-1.5`} /><Text style={[tw`text-sm font-bold`, { color: COLORS.textSub }]}>{displayDate} <Text style={{ color: COLORS.primary }}>{displayTime}</Text></Text></View>
            <View style={tw`flex-row items-center flex-1 overflow-hidden`}><FontAwesome5 name="map-marker-alt" size={13} color={COLORS.textSub} style={tw`mr-1.5`} /><Text style={[tw`text-sm font-medium flex-1`, { color: COLORS.textSub }]} numberOfLines={1}>{item.loc}</Text></View>
        </View>
      </AnimatedCard>
    );
  };

  // --- [Guest Mode View] ---
  if (!loading && !userTeamId) {
    return (
      <SafeAreaView style={tw`flex-1 bg-[#F8FAFC] px-6 justify-center`}>
        <StatusBar barStyle="dark-content" />
        <View style={tw`mb-10`}>
          <Text style={tw`text-4xl mb-2`}>👋</Text>
          <Text style={tw`${TYPOGRAPHY.h1} mb-2`}>반가워요, {userName}님!</Text>
          <Text style={tw`${TYPOGRAPHY.body2} leading-6`}>
            아직 소속된 팀이 없으시네요.{'\n'}팀과 함께라면 배구가 더 즐거워요!
          </Text>
        </View>

        <View style={tw`gap-4`}>
          <Card onPress={() => router.push('/team/register?mode=search')}>
            <View style={tw`flex-row items-center`}>
              <View style={tw`w-12 h-12 bg-indigo-50 rounded-full items-center justify-center mr-4`}>
                <FontAwesome5 name="search" size={20} color={COLORS.primary} />
              </View>
              <View>
                <Text style={tw`${TYPOGRAPHY.h3}`}>이미 활동 중인 팀이 있나요?</Text>
                <Text style={tw`${TYPOGRAPHY.body2}`}>우리 팀 검색하고 합류하기</Text>
              </View>
            </View>
          </Card>

          <Card onPress={() => router.push('/team/register?mode=create')} variant="primary">
            <View style={tw`flex-row items-center`}>
              <View style={tw`w-12 h-12 bg-white/20 rounded-full items-center justify-center mr-4`}>
                <FontAwesome5 name="flag" size={18} color="white" />
              </View>
              <View>
                <Text style={tw`text-lg font-bold text-white`}>새로운 팀을 만드나요?</Text>
                <Text style={tw`text-sm text-indigo-100`}>팀을 등록하고 매칭 시작하기</Text>
              </View>
            </View>
          </Card>

          <Card onPress={() => router.push('/guest/list')}>
            <View style={tw`flex-row items-center`}>
              <View style={tw`w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4`}>
                <FontAwesome5 name="running" size={20} color="#F97316" />
              </View>
              <View>
                <Text style={tw`${TYPOGRAPHY.h3}`}>배구가 하고 싶으신가요?</Text>
                <Text style={tw`${TYPOGRAPHY.body2}`}>용병으로 참여할 팀 찾기</Text>
              </View>
            </View>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // --- [Member Mode View] ---
  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: COLORS.background }]} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={tw`px-6 pt-3 pb-2 flex-row justify-between items-center bg-[#F2F4F6]`}>
        <View><Text style={[tw`text-sm font-bold mb-0.5`, { color: COLORS.textCaption }]}>오늘의 매칭</Text><Text style={[tw`text-[26px] font-extrabold`, { color: COLORS.textMain }]}>어떤 경기를 찾으세요?</Text></View>
        <TouchableOpacity onPress={() => router.push('/home/notification')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7} style={[tw`p-2.5 rounded-full bg-white shadow-sm border border-gray-100`]}><FontAwesome5 name="bell" size={18} color={COLORS.textMain} /><View style={tw`absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-red-500`} /></TouchableOpacity>
      </View>
      
      <FlatList 
        data={matches} 
        renderItem={renderItem} 
        keyExtractor={item => item.id} 
        contentContainerStyle={tw`px-5 pb-32 pt-4`} 
        showsVerticalScrollIndicator={false}
        onEndReached={() => fetchMatches(false)}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={tw`py-4`} color={COLORS.primary} /> : <View style={tw`h-8`} />}
        ListHeaderComponent={
            <>
                {/* 랭킹 카드 */}
                <RankingCard onPress={() => router.push('/home/ranking')} />
                
                {/* 용병 버튼 영역 */}
                <View style={tw`flex-row gap-3 mb-6`}>
                    <TouchableOpacity onPress={() => router.push('/guest/list')} style={tw`flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex-row items-center`}>
                        <View style={tw`w-10 h-10 bg-orange-50 rounded-full items-center justify-center mr-3`}>
                            <FontAwesome5 name="running" size={16} color="#F97316" />
                        </View>
                        <View>
                            <Text style={tw`font-bold text-gray-900`}>용병 찾기</Text>
                            <Text style={tw`text-xs text-gray-500`}>개인 참가</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/guest/write')} style={tw`flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex-row items-center`}>
                        <View style={tw`w-10 h-10 bg-indigo-50 rounded-full items-center justify-center mr-3`}>
                            <FontAwesome5 name="user-plus" size={16} color="#4F46E5" />
                        </View>
                        <View>
                            <Text style={tw`font-bold text-gray-900`}>용병 모집</Text>
                            <Text style={tw`text-xs text-gray-500`}>부족한 포지션</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* 필터 칩 */}
                <View style={tw`mb-6`}>
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
        ListEmptyComponent={!loading ? <View style={tw`items-center justify-center py-20`}><View style={[tw`w-20 h-20 rounded-full items-center justify-center mb-6`, { backgroundColor: '#E5E8EB' }]}><FontAwesome5 name="search" size={32} color="#8B95A1" /></View><Text style={[tw`text-lg font-bold mb-2`, { color: COLORS.textMain }]}>아직 열린 경기가 없어요</Text><Text style={[tw`text-sm text-center leading-relaxed`, { color: COLORS.textCaption }]}>필터를 바꿔보거나,{'\n'}직접 매칭을 만들어보세요.</Text></View> : <View style={tw`py-20`}><ActivityIndicator size="large" color={COLORS.primary} /></View>} 
      />
      <AnimatedCard onPress={() => router.push('/match/write')} style={[tw`absolute bottom-8 right-6 px-6 py-4 rounded-full flex-row items-center shadow-lg`, { backgroundColor: COLORS.primary, shadowColor: '#3182F6', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }]}><FontAwesome5 name="pen" size={14} color="white" style={tw`mr-2`} /><Text style={tw`text-white font-bold text-base`}>매칭 만들기</Text></AnimatedCard>
    </SafeAreaView>
  );
}