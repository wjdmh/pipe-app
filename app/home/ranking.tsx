import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import tw from 'twrnc';

export default function RankingScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 실시간 업데이트로 변경 (승점이 바뀌면 즉시 반영)
    const q = query(collection(db, "teams"), orderBy("stats.points", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(d => {
            const data = d.data();
            // 승점이 0보다 큰 팀만 랭킹 반영
            if (data.stats && data.stats.points > 0) {
                list.push({ id: d.id, ...data });
            }
        });
        setTeams(list);
        setLoading(false);
    }, (e) => {
        console.error("랭킹 로드 에러", e);
        setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const renderRankItem = ({ item, index }: { item: any, index: number }) => {
    const rank = index + 1;
    let bgStyle = 'bg-white border-slate-100';
    let rankTextStyle = 'text-slate-400 text-lg';
    let icon = null;

    // 1~3위 디자인 차별화
    if (rank === 1) {
        bgStyle = 'bg-yellow-50 border-yellow-200 shadow-md shadow-yellow-100';
        rankTextStyle = 'text-yellow-500 text-4xl italic'; // 1등 아주 크게
        icon = <FontAwesome name="trophy" size={20} color="#eab308" style={tw`mb-1`} />;
    } else if (rank === 2) {
        bgStyle = 'bg-slate-100 border-slate-200';
        rankTextStyle = 'text-slate-500 text-3xl italic';
    } else if (rank === 3) {
        bgStyle = 'bg-orange-50 border-orange-200';
        rankTextStyle = 'text-orange-600 text-3xl italic';
    }

    return (
      <View style={tw`p-5 rounded-3xl mb-3 flex-row items-center justify-between border ${bgStyle}`}>
        <View style={tw`flex-row items-center flex-1`}>
            {/* 순위 표시 영역 */}
            <View style={tw`w-12 items-center justify-center mr-4`}>
                {icon}
                <Text style={tw`font-black ${rankTextStyle}`}>{rank}</Text>
                {rank <= 3 && <Text style={tw`text-[10px] font-bold text-slate-400`}>RANK</Text>}
            </View>
            
            {/* 팀 정보 */}
            <View>
                <Text style={tw`font-extrabold text-lg text-slate-800 mb-1`}>{item.name}</Text>
                <Text style={tw`text-xs font-bold text-slate-400 uppercase`}>{item.affiliation}</Text>
            </View>
        </View>

        {/* 승점 정보 */}
        <View style={tw`items-end`}>
            <Text style={tw`text-indigo-600 font-black text-2xl`}>{item.stats.points || 0}점</Text>
            <View style={tw`flex-row mt-1 bg-white/50 px-2 py-1 rounded-lg`}>
                <Text style={tw`text-xs text-slate-500 font-bold`}>{item.stats.wins}승 {item.stats.losses}패</Text>
            </View>
        </View>
      </View>
    );
  };

  return (
    <View style={tw`flex-1 bg-slate-50`}>
      <View style={tw`pt-14 px-5 pb-4 bg-white border-b border-slate-100 flex-row items-center shadow-sm z-10`}>
         <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
             <FontAwesome name="arrow-left" size={20} color="#334155" />
         </TouchableOpacity>
         <Text style={tw`text-xl font-extrabold text-slate-800`}>🏆 전체 랭킹</Text>
      </View>

      {/* 공지사항 박스 */}
      <View style={tw`px-5 mt-4 mb-2`}>
          <View style={tw`bg-slate-800 p-4 rounded-2xl`}>
              <Text style={tw`text-white font-bold text-center mb-1`}>🔥 실시간 승점 경쟁</Text>
              <Text style={tw`text-slate-400 text-xs text-center`}>승리 시 3점, 패배 시 1점이 부여됩니다.</Text>
          </View>
      </View>

      {loading ? <ActivityIndicator size="large" style={tw`mt-10`} /> : (
        <FlatList
          data={teams}
          renderItem={renderRankItem}
          keyExtractor={item => item.id}
          contentContainerStyle={tw`p-5 pb-10`}
          ListEmptyComponent={
            <View style={tw`items-center mt-20`}>
                <Text style={tw`text-slate-400 font-bold mb-1 text-lg`}>랭킹 데이터가 없습니다.</Text>
                <Text style={tw`text-slate-300 text-sm`}>첫 번째 승리의 주인공이 되어보세요!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}