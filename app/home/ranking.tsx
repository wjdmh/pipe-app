import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

export default function RankingScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "teams"), orderBy("stats.points", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.stats && data.stats.points > 0) {
                list.push({ id: d.id, ...data });
            }
        });
        setTeams(list);
        setLoading(false);
    }, (e) => setLoading(false));

    return () => unsubscribe();
  }, []);

  const renderRankItem = ({ item, index }: { item: any, index: number }) => {
    const rank = index + 1;
    let rankColor = '#4E5968';
    let icon = null;

    if (rank === 1) {
        rankColor = '#FFD700';
        icon = <FontAwesome5 name="crown" size={14} color="#FFD700" style={tw`mb-1`} />;
    } else if (rank === 2) {
        rankColor = '#C0C0C0';
    } else if (rank === 3) {
        rankColor = '#CD7F32';
    }

    return (
      <View style={tw`p-5 rounded-[24px] mb-3 flex-row items-center justify-between bg-white shadow-sm border border-[#F2F4F6]`}>
        <View style={tw`flex-row items-center flex-1`}>
            <View style={tw`w-10 items-center justify-center mr-3`}>
                {icon}
                <Text style={[tw`font-black text-xl italic`, { color: rankColor }]}>{rank}</Text>
            </View>
            <View>
                <Text style={tw`font-bold text-lg text-[#191F28] mb-0.5`}>{item.name}</Text>
                <Text style={tw`text-sm text-[#8B95A1]`}>{item.affiliation}</Text>
            </View>
        </View>
        <View style={tw`items-end`}>
            <Text style={tw`text-[#3182F6] font-extrabold text-xl`}>{item.stats.points || 0}점</Text>
            <Text style={tw`text-xs text-[#8B95A1] font-medium`}>{item.stats.wins}승 {item.stats.losses}패</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-[#F2F4F6]`} edges={['top']}>
      <View style={tw`px-5 py-3 flex-row items-center bg-[#F2F4F6]`}>
         <TouchableOpacity onPress={() => router.back()} style={tw`p-3 -ml-3 rounded-full`} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
             <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
         </TouchableOpacity>
         <Text style={tw`text-xl font-extrabold text-[#191F28] ml-2`}>전체 순위</Text>
      </View>
      <View style={tw`px-5 mt-2 mb-4`}>
          <View style={tw`bg-[#3182F6] p-5 rounded-[24px] shadow-md shadow-blue-200`}>
              <Text style={tw`text-white font-bold text-lg mb-1`}>🔥 승점을 모아보세요</Text>
              <Text style={tw`text-blue-100 text-sm`}>경기 승리 시 3점, 무승부/패배 시 1점</Text>
          </View>
      </View>
      {loading ? <ActivityIndicator size="large" style={tw`mt-10`} color="#3182F6" /> : (
        <FlatList
          data={teams}
          renderItem={renderRankItem}
          keyExtractor={item => item.id}
          contentContainerStyle={tw`px-5 pb-10`}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={tw`items-center mt-20`}>
                <Text style={tw`text-[#8B95A1] font-bold mb-1 text-lg`}>아직 랭킹이 없어요</Text>
                <Text style={tw`text-[#B0B8C1] text-sm`}>첫 번째 승리의 주인공이 되어보세요!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}