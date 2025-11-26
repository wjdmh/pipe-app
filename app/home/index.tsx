import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot, where, limit } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

type MatchData = {
  id: string;
  team: string;
  affiliation?: string;
  type: string;
  gender: string;
  time: string;
  loc: string;
  status: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  
  const [topTeams, setTopTeams] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "matches"),
      where("status", "==", "recruiting"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: MatchData[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as MatchData);
      });
      setMatches(list);
      setLoading(false);
    }, (error) => {
      console.error("데이터 로드 실패:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qRank = query(collection(db, "teams"), orderBy("stats.points", "desc"));
    const unsubRank = onSnapshot(qRank, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.stats && data.stats.points > 0) {
                list.push({ id: d.id, ...data });
            }
        });
        setTopTeams(list.slice(0, 3));
    });
    return () => unsubRank();
  }, []);

  const filteredMatches = matches.filter(m => {
    if (filter === 'all') return true;
    if (['6man', '9man'].includes(filter)) return m.type === filter;
    if (['male', 'female', 'mixed'].includes(filter)) return m.gender === filter;
    return true;
  });

  const renderItem = ({ item }: { item: MatchData }) => (
    <TouchableOpacity 
      style={tw`bg-white p-5 rounded-3xl mb-4 border border-slate-100 shadow-sm active:bg-slate-50`}
      onPress={() => router.push(`/match/${item.id}`)}
    >
      <View style={tw`flex-row justify-between items-start mb-3`}>
        <View style={tw`flex-row gap-2`}>
            <View style={tw`bg-slate-100 px-2 py-1 rounded-lg`}>
                <Text style={tw`text-slate-600 text-[10px] font-bold`}>{item.type === '9man' ? '9인제' : '6인제'}</Text>
            </View>
            <View style={tw`bg-slate-100 px-2 py-1 rounded-lg`}>
                <Text style={tw`text-slate-600 text-[10px] font-bold`}>{item.gender === 'male' ? '남자' : item.gender === 'female' ? '여자' : '혼성'}</Text>
            </View>
        </View>
        <View style={tw`bg-indigo-100 px-2 py-1 rounded-full`}>
            <Text style={tw`text-indigo-600 text-[10px] font-bold`}>모집중</Text>
        </View>
      </View>

      <Text style={tw`font-bold text-lg text-slate-800 mb-1`}>{item.team}</Text>
      <Text style={tw`text-xs text-slate-400 mb-3`}>{item.affiliation || '소속 정보 없음'}</Text>

      <View style={tw`flex-row gap-3`}>
        <View style={tw`flex-row items-center`}>
            <FontAwesome name="clock-o" size={12} color="#94a3b8" />
            <Text style={tw`text-xs text-slate-500 ml-1`}>{item.time}</Text>
        </View>
        <View style={tw`flex-row items-center`}>
            <FontAwesome name="map-marker" size={12} color="#94a3b8" />
            <Text style={tw`text-xs text-slate-500 ml-1`}>{item.loc}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 px-5`}>
      <View style={tw`mb-4 flex-row justify-between items-end pt-2`}>
        <View>
            <Text style={tw`text-xs text-slate-500 mb-1`}>오늘 컨디션 어때요?</Text>
            <Text style={tw`text-2xl font-extrabold text-slate-800`}>매칭 찾기 🔥</Text>
        </View>
        {/* [수정됨] 알림 센터로 이동하도록 경로 변경 */}
        <TouchableOpacity onPress={() => router.push('/home/notification')}>
            <FontAwesome name="bell-o" size={20} color="#334155" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredMatches}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={tw`pb-24`}
        ListHeaderComponent={
          <>
            <TouchableOpacity 
              onPress={() => router.push('/home/ranking')}
              style={tw`bg-indigo-900 p-5 rounded-3xl mb-6 shadow-xl relative overflow-hidden`}
            >
              <View style={tw`absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl`} />
              
              <View style={tw`flex-row justify-between items-center mb-4`}>
                <View style={tw`flex-row items-center`}>
                   <Text style={tw`text-xl mr-2`}>🏆</Text>
                   <Text style={tw`text-white font-bold text-lg`}>실시간 랭킹 TOP 3</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color="#a5b4fc" />
              </View>
              
              <View style={tw`gap-2`}>
                {topTeams.length === 0 ? (
                    <Text style={tw`text-indigo-300 text-xs text-center py-2`}>아직 등록된 랭킹이 없습니다.</Text>
                ) : (
                    topTeams.map((team, index) => (
                    <View key={team.id} style={tw`flex-row justify-between items-center bg-white/10 p-3 rounded-xl`}>
                        <View style={tw`flex-row items-center`}>
                        <Text style={tw`font-black w-6 text-center text-lg ${index===0?'text-yellow-400':(index===1?'text-slate-300':'text-amber-600')}`}>
                            {index + 1}
                        </Text>
                        <Text style={tw`text-indigo-100 font-bold ml-2 text-base`}>{team.name}</Text>
                        </View>
                        <Text style={tw`text-sm font-bold text-white`}>{team.stats?.points || 0}점</Text>
                    </View>
                    ))
                )}
              </View>
            </TouchableOpacity>

            <View style={tw`mb-4`}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={['all', '6man', '9man', 'mixed', 'male', 'female']}
                    keyExtractor={(item) => item}
                    contentContainerStyle={tw`gap-2 pr-4`}
                    renderItem={({ item: f }) => (
                        <TouchableOpacity
                            onPress={() => setFilter(f)}
                            style={tw`px-4 py-2 rounded-full border ${
                                filter === f ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'
                            }`}
                        >
                            <Text style={tw`text-xs font-bold ${filter === f ? 'text-white' : 'text-slate-500'}`}>
                                {f === 'all' ? '전체' : 
                                 f === '6man' ? '6인제' : 
                                 f === '9man' ? '9인제' : 
                                 f === 'mixed' ? '혼성' : 
                                 f === 'male' ? '남자부' : '여자부'}
                            </Text>
                        </TouchableOpacity>
                    )}
                />
            </View>
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={tw`items-center mt-10`}>
                <Text style={tw`text-slate-400`}>현재 모집 중인 경기가 없어요.</Text>
            </View>
          ) : <ActivityIndicator style={tw`mt-10`} />
        }
      />

      <TouchableOpacity
        style={tw`absolute bottom-5 right-5 w-14 h-14 bg-slate-900 rounded-full items-center justify-center shadow-lg z-50`}
        onPress={() => router.push('/match/write')} 
      >
        <FontAwesome name="plus" size={24} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}