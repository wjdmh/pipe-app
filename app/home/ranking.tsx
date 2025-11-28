import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

// --- [Data] KUSF 초기 데이터 (백업용 및 검색용) ---
export const KUSF_TEAMS = [
  // 남자부
  { id: 'm1', name: '서울대학교 배구부', affiliation: '서울대학교', gender: 'male', stats: { wins: 8, losses: 1, points: 25, total: 9 } },
  { id: 'm2', name: '이리', affiliation: '대구가톨릭대', gender: 'male', stats: { wins: 7, losses: 2, points: 23, total: 9 } },
  { id: 'm3', name: 'SIV', affiliation: '서원대학교', gender: 'male', stats: { wins: 6, losses: 1, points: 19, total: 7 } },
  { id: 'm4', name: '플라잉', affiliation: '진주교육대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm5', name: 'A-Quick', affiliation: '전북대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm6', name: 'GVS', affiliation: '광주대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm7', name: '비상(한신)', affiliation: '한신대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm8', name: '창공(BLUES)', affiliation: '단국대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm9', name: '미르(용인)', affiliation: '용인대학교', gender: 'male', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  { id: 'm10', name: '빽어택', affiliation: '경인교육대학교', gender: 'male', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  // ... (중략: 엑셀의 모든 남자 팀 추가 가능)
  // 여자부
  { id: 'f1', name: 'KUV', affiliation: '한국체육대학교', gender: 'female', stats: { wins: 9, losses: 0, points: 27, total: 9 } },
  { id: 'f2', name: '백호', affiliation: '동아대학교', gender: 'female', stats: { wins: 7, losses: 2, points: 23, total: 9 } },
  { id: 'f3', name: 'VOG', affiliation: '경상국립대학교', gender: 'female', stats: { wins: 6, losses: 2, points: 20, total: 8 } },
  { id: 'f4', name: 'EAVC', affiliation: '이화여자대학교', gender: 'female', stats: { wins: 5, losses: 3, points: 18, total: 8 } },
  { id: 'f5', name: 'LEVO(여)', affiliation: '계명대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f6', name: '스파르타(여)', affiliation: '가천대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f7', name: '창공(BLUES)', affiliation: '단국대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f8', name: '서울대학교 여자', affiliation: '서울대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
];

const COLORS = {
  background: '#F2F4F6',
  surface: '#FFFFFF',
  primary: '#3182F6',
  textMain: '#191F28',
  textSub: '#4E5968',
  textCaption: '#8B95A1',
  border: '#E5E8EB',
  male: '#3182F6',
  female: '#FF6B6B',
};

export default function RankingScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'male' | 'female'>('male');
  const [dbTeams, setDbTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // DB에서 최신 랭킹 가져오기
  useEffect(() => {
    const q = query(collection(db, "teams"), orderBy("stats.points", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(d => {
            const data = d.data();
            // DB에 등록된 팀 정보 수집
            list.push({ id: d.id, ...data });
        });
        setDbTeams(list);
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 화면에 보여줄 데이터 병합 (DB 팀 + KUSF 미등록 팀)
  // 실제로는 DB 팀만 보여주는 것이 맞으나, 초기에는 KUSF 전체 리스트를 보여주되
  // DB에 있는 팀은 DB 점수(업데이트된 점수)를, 없는 팀은 KUSF 초기 점수를 보여줌
  const getRankingData = () => {
    // 1. KUSF 전체 리스트 복사
    let combined = [...KUSF_TEAMS].filter(t => 
        activeTab === 'male' ? t.gender !== 'female' : t.gender === 'female'
    );

    // 2. DB에 있는 팀 정보로 덮어쓰기 (앱 내 경기 결과 반영)
    dbTeams.forEach(dbTeam => {
        // kusfId가 일치하거나 이름이 일치하면 업데이트
        const index = combined.findIndex(t => t.id === dbTeam.kusfId || t.name === dbTeam.name);
        if (index !== -1) {
            combined[index] = { ...combined[index], ...dbTeam, stats: dbTeam.stats };
        } else {
            // KUSF 목록에 없는 신규 팀이라면 리스트에 추가 (성별 필터링 필요)
            // 여기선 편의상 KUSF 리스트 위주로 보여줌
        }
    });

    // 3. 승점 순 정렬
    return combined.sort((a, b) => b.stats.points - a.stats.points);
  };

  const data = getRankingData();
  const themeColor = activeTab === 'male' ? COLORS.male : COLORS.female;

  const renderRankItem = ({ item, index }: { item: any, index: number }) => {
    const rank = index + 1;
    let rankColor = COLORS.textSub;
    let icon = null;

    if (rank === 1) {
        rankColor = '#FFD700';
        icon = <FontAwesome5 name="crown" size={14} color="#FFD700" style={tw`mb-1`} />;
    } else if (rank === 2) { rankColor = '#C0C0C0'; } 
    else if (rank === 3) { rankColor = '#CD7F32'; }

    return (
      <View style={tw`p-5 rounded-[24px] mb-3 flex-row items-center justify-between bg-white shadow-sm border border-[${COLORS.border}]`}>
        <View style={tw`flex-row items-center flex-1`}>
            <View style={tw`w-10 items-center justify-center mr-3`}>
                {icon}
                <Text style={[tw`font-black text-xl italic`, { color: rankColor }]}>{rank}</Text>
            </View>
            <View style={tw`flex-1`}>
                <Text style={tw`font-bold text-lg text-[${COLORS.textMain}] mb-0.5`} numberOfLines={1}>{item.name}</Text>
                <Text style={tw`text-sm text-[${COLORS.textCaption}]`}>{item.affiliation}</Text>
            </View>
        </View>
        <View style={tw`items-end`}>
            <Text style={[tw`font-extrabold text-xl`, { color: themeColor }]}>{item.stats.points}점</Text>
            <Text style={tw`text-xs text-[${COLORS.textCaption}] font-medium`}>{item.stats.wins}승 {item.stats.losses}패</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[tw`flex-1`, { backgroundColor: COLORS.background }]} edges={['top']}>
      <View style={tw`px-5 py-3 flex-row items-center bg-[${COLORS.background}]`}>
         <TouchableOpacity onPress={() => router.back()} style={tw`p-3 -ml-3 rounded-full`} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
             <FontAwesome5 name="arrow-left" size={20} color={COLORS.textMain} />
         </TouchableOpacity>
         <Text style={tw`text-xl font-extrabold text-[${COLORS.textMain}] ml-2`}>전체 순위</Text>
      </View>

      <View style={tw`px-5 mb-2`}>
          <View style={tw`flex-row bg-gray-200 p-1 rounded-2xl mb-4`}>
              <TouchableOpacity onPress={() => setActiveTab('male')} style={tw`flex-1 py-3 rounded-xl items-center ${activeTab === 'male' ? 'bg-white shadow-sm' : ''}`}>
                  <Text style={tw`font-bold ${activeTab === 'male' ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>남자부</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveTab('female')} style={tw`flex-1 py-3 rounded-xl items-center ${activeTab === 'female' ? 'bg-white shadow-sm' : ''}`}>
                  <Text style={tw`font-bold ${activeTab === 'female' ? 'text-[#FF6B6B]' : 'text-[#8B95A1]'}`}>여자부</Text>
              </TouchableOpacity>
          </View>
          <View style={[tw`p-5 rounded-[24px] shadow-md shadow-gray-200`, { backgroundColor: themeColor }]}>
              <Text style={tw`text-white font-bold text-lg mb-1`}>매칭을 잡고 랭킹을 올려보세요 🏐</Text>
              <Text style={tw`text-white/80 text-xs mb-3`}>경기 승리시 3점, 패배시 1점이 추가돼요.</Text>
              <View style={tw`bg-black/20 self-start px-2 py-1 rounded`}>
                  <Text style={tw`text-white/90 text-[10px] font-bold`}>2025 KUSF + 실시간 경기 반영</Text>
              </View>
          </View>
      </View>

      <FlatList
        data={data}
        renderItem={renderRankItem}
        keyExtractor={item => item.id}
        contentContainerStyle={tw`px-5 pb-10`}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}