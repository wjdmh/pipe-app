import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar, Pressable, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';
import { KUSF_TEAMS } from './ranking';

// --- [Design System] ---
const COLORS = {
  background: '#F2F4F6', surface: '#FFFFFF', primary: '#3182F6', textMain: '#191F28', textSub: '#4E5968', textCaption: '#8B95A1',
  border: '#E5E8EB', badgeBlueBg: '#E8F3FF', badgeBlueText: '#1B64DA', badgeGrayBg: '#F2F4F6', badgeGrayText: '#4E5968',
  male: '#3182F6', female: '#FF6B6B',
};

type MatchData = { id: string; team: string; affiliation?: string; type: '6man' | '9man'; gender: 'male' | 'female' | 'mixed'; time: string; loc: string; status: string; level?: string; };

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

const RankingCard = ({ onPress, dbTeams }: { onPress: () => void, dbTeams: any[] }) => {
  const [tab, setTab] = useState<'male' | 'female'>('male');
  const getTop3 = () => {
      let combined = [...KUSF_TEAMS].filter(t => (tab === 'male' ? t.gender !== 'female' : t.gender === 'female'));
      dbTeams.forEach(dbTeam => {
          const index = combined.findIndex(t => t.id === dbTeam.kusfId || t.name === dbTeam.name);
          if (index !== -1) combined[index] = { ...combined[index], ...dbTeam, stats: dbTeam.stats };
      });
      return combined.sort((a, b) => b.stats.points - a.stats.points).slice(0, 3);
  };
  const top3 = getTop3();

  return (
    <AnimatedCard onPress={onPress} style={[tw`p-6 rounded-[24px] mb-8 shadow-sm`, { backgroundColor: COLORS.surface }]}>
        <View style={tw`flex-row justify-between items-start mb-4`}>
            <View><Text style={[tw`text-xl font-extrabold mb-1`, { color: COLORS.textMain }]}>실시간 순위 🔥</Text><Text style={[tw`text-sm font-medium`, { color: COLORS.textSub }]}>매칭을 잡고 순위를 올려보세요!</Text></View>
            <FontAwesome5 name="chevron-right" size={14} color={COLORS.textCaption} style={tw`mt-1`} />
        </View>
        <View style={tw`flex-row bg-[#F2F4F6] p-1 rounded-xl mb-4 self-start`}>
            <TouchableOpacity onPress={() => setTab('male')} style={tw`px-3 py-1.5 rounded-lg ${tab === 'male' ? 'bg-white shadow-sm' : ''}`}><Text style={[tw`text-xs font-bold`, { color: tab === 'male' ? COLORS.male : COLORS.textCaption }]}>남자부</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('female')} style={tw`px-3 py-1.5 rounded-lg ${tab === 'female' ? 'bg-white shadow-sm' : ''}`}><Text style={[tw`text-xs font-bold`, { color: tab === 'female' ? COLORS.female : COLORS.textCaption }]}>여자부</Text></TouchableOpacity>
        </View>
        <View style={tw`gap-4`}>
            {top3.map((team, index) => {
                const badgeColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';
                return (
                    <View key={team.id} style={tw`flex-row items-center justify-between`}>
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
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dbTeams, setDbTeams] = useState<any[]>([]);

  const fetchData = () => {
    const qMatch = query(collection(db, "matches"), where("status", "==", "recruiting"), orderBy("createdAt", "desc"));
    const unsubMatch = onSnapshot(qMatch, (s) => {
      setMatches(s.docs.map(d => ({ id: d.id, ...d.data() } as MatchData)));
      setLoading(false); setRefreshing(false);
    });
    const qTeam = query(collection(db, "teams"));
    const unsubTeam = onSnapshot(qTeam, (s) => {
        setDbTeams(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubMatch(); unsubTeam(); };
  };

  useEffect(() => { const unsub = fetchData(); return () => { if(unsub) unsub(); }; }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const filteredMatches = matches.filter(m => {
    if (filter === 'all') return true;
    if (['6man', '9man'].includes(filter)) return m.type === filter;
    if (filter === 'mixed') return m.gender === 'mixed';
    if (filter === 'male') return m.gender === 'male';
    if (filter === 'female') return m.gender === 'female';
    return true;
  });

  const renderItem = ({ item }: { item: MatchData }) => {
    // [Date Format Logic] ISO String 호환 및 기존 문자열 호환
    let displayDate = item.time;
    let displayTime = '';
    
    // 1. ISO 포맷인지 확인 (Date 객체로 변환 가능한지)
    const d = new Date(item.time);
    if (!isNaN(d.getTime()) && item.time.includes('T')) {
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const hour = d.getHours().toString().padStart(2, '0');
        const min = d.getMinutes().toString().padStart(2, '0');
        displayDate = `${month}/${date}`;
        displayTime = `${hour}:${min}`;
    } else {
        // 2. 기존 포맷 ("12/25 14:00") 처리
        const parts = item.time.split(' ');
        displayDate = parts[0] || item.time;
        displayTime = parts[1] ? parts[1].substring(0, 5) : '';
    }

    return (
      <AnimatedCard style={[tw`p-6 rounded-[24px] mb-4 shadow-sm`, { backgroundColor: COLORS.surface }]} onPress={() => router.push(`/match/${item.id}`)}>
        <View style={tw`flex-row items-center justify-between mb-4`}>
            <View style={tw`flex-row gap-2`}>
                <View style={[tw`px-2.5 py-1.5 rounded-[8px]`, { backgroundColor: item.type === '6man' ? COLORS.badgeBlueBg : '#FFF5E6' }]}><Text style={[tw`text-xs font-bold`, { color: item.type === '6man' ? COLORS.badgeBlueText : '#FF8C00' }]}>{item.type === '6man' ? '6인제' : '9인제'}</Text></View>
                <View style={[tw`px-2.5 py-1.5 rounded-[8px]`, { backgroundColor: COLORS.badgeGrayBg }]}><Text style={[tw`text-xs font-bold`, { color: COLORS.badgeGrayText }]}>{item.gender === 'male' ? '남자부' : item.gender === 'female' ? '여자부' : '혼성'}</Text></View>
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

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: COLORS.background }]} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={tw`px-6 pt-3 pb-2 flex-row justify-between items-center bg-[#F2F4F6]`}>
        <View><Text style={[tw`text-sm font-bold mb-0.5`, { color: COLORS.textCaption }]}>오늘의 매칭</Text><Text style={[tw`text-[26px] font-extrabold`, { color: COLORS.textMain }]}>어떤 경기를 찾으세요?</Text></View>
        <TouchableOpacity onPress={() => router.push('/home/notification')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7} style={[tw`p-2.5 rounded-full bg-white shadow-sm border border-gray-100`]}><FontAwesome5 name="bell" size={18} color={COLORS.textMain} /><View style={tw`absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-red-500`} /></TouchableOpacity>
      </View>
      <FlatList data={filteredMatches} renderItem={renderItem} keyExtractor={item => item.id} contentContainerStyle={tw`px-5 pb-32 pt-4`} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />} ListHeaderComponent={<><RankingCard onPress={() => router.push('/home/ranking')} dbTeams={dbTeams} /><View style={tw`mb-6`}><FlatList horizontal showsHorizontalScrollIndicator={false} data={[{ id: 'all', label: '전체' }, { id: '6man', label: '6인제' }, { id: '9man', label: '9인제' }, { id: 'mixed', label: '혼성' }, { id: 'male', label: '남자부' }, { id: 'female', label: '여자부' }]} keyExtractor={(item) => item.id} renderItem={({ item }) => <FilterChip label={item.label} active={filter === item.id} onPress={() => setFilter(item.id)} />} /></View></>} ListEmptyComponent={!loading ? <View style={tw`items-center justify-center py-20`}><View style={[tw`w-20 h-20 rounded-full items-center justify-center mb-6`, { backgroundColor: '#E5E8EB' }]}><FontAwesome5 name="search" size={32} color="#8B95A1" /></View><Text style={[tw`text-lg font-bold mb-2`, { color: COLORS.textMain }]}>아직 열린 경기가 없어요</Text><Text style={[tw`text-sm text-center leading-relaxed`, { color: COLORS.textCaption }]}>필터를 바꿔보거나,{'\n'}직접 매칭을 만들어보세요.</Text></View> : <View style={tw`py-20`}><ActivityIndicator size="large" color={COLORS.primary} /></View>} />
      <AnimatedCard onPress={() => router.push('/match/write')} style={[tw`absolute bottom-8 right-6 px-6 py-4 rounded-full flex-row items-center shadow-lg`, { backgroundColor: COLORS.primary, shadowColor: '#3182F6', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }]}><FontAwesome5 name="pen" size={14} color="white" style={tw`mr-2`} /><Text style={tw`text-white font-bold text-base`}>매칭 만들기</Text></AnimatedCard>
    </SafeAreaView>
  );
}