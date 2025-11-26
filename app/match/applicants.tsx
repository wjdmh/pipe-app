import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
import tw from 'twrnc';

type TeamInfo = {
  id: string;
  name: string;
  level: string;
  affiliation: string;
  stats: { wins: number; total: number };
};

export default function ApplicantManageScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState<TeamInfo[]>([]);

  useEffect(() => {
    loadApplicants();
  }, [matchId]);

  const loadApplicants = async () => {
    if (typeof matchId !== 'string') return;
    try {
      const matchSnap = await getDoc(doc(db, "matches", matchId));
      if (!matchSnap.exists()) return;

      const applicantIds = matchSnap.data().applicants || [];
      
      // 신청한 팀들의 정보를 하나씩 가져옴
      const teams: TeamInfo[] = [];
      for (const teamId of applicantIds) {
        const teamSnap = await getDoc(doc(db, "teams", teamId));
        if (teamSnap.exists()) {
          teams.push({ id: teamSnap.id, ...teamSnap.data() } as TeamInfo);
        }
      }
      setApplicants(teams);
    } catch (e) {
      Alert.alert('오류', '신청자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (team: TeamInfo) => {
    Alert.alert('매칭 수락', `'${team.name}' 팀과 매칭을 확정하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확정하기',
        onPress: async () => {
          if (typeof matchId !== 'string') return;
          try {
            // 매칭 확정 로직: 상태 변경 + 게스트 ID 등록
            await updateDoc(doc(db, "matches", matchId), {
              status: 'matched',
              guestId: team.id,
              // matchedAt: new Date().toISOString() // 필요시 추가
            });
            Alert.alert('매칭 성사', '매칭이 확정되었습니다! 연락처가 공개됩니다.');
            router.back(); // 라커룸으로 복귀
          } catch (e) {
            Alert.alert('오류', '수락 처리 중 문제가 발생했습니다.');
          }
        }
      }
    ]);
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  return (
    <View style={tw`flex-1 bg-white`}>
      <View style={tw`px-6 pt-14 pb-4 border-b border-slate-100 flex-row items-center bg-white`}>
        <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
          <FontAwesome name="arrow-left" size={20} color="#64748b" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-bold text-slate-800`}>신청자 목록</Text>
      </View>

      <FlatList
        data={applicants}
        keyExtractor={item => item.id}
        contentContainerStyle={tw`p-6`}
        ListEmptyComponent={<Text style={tw`text-center text-slate-400 mt-10`}>아직 신청한 팀이 없습니다.</Text>}
        renderItem={({ item }) => (
          <View style={tw`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-4 flex-row justify-between items-center`}>
            <View>
              <View style={tw`flex-row items-center mb-1`}>
                <Text style={tw`font-bold text-lg text-slate-800 mr-2`}>{item.name}</Text>
                <View style={tw`bg-slate-100 px-2 py-0.5 rounded text-xs`}>
                    <Text style={tw`text-slate-500 text-xs font-bold`}>{item.level}급</Text>
                </View>
              </View>
              <Text style={tw`text-slate-500 text-sm mb-1`}>{item.affiliation}</Text>
              <Text style={tw`text-indigo-500 text-xs font-bold`}>
                {item.stats?.total > 0 ? `승률 ${Math.round((item.stats.wins/item.stats.total)*100)}%` : '전적 없음'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => handleAccept(item)}
              style={tw`bg-indigo-600 px-4 py-2 rounded-xl`}
            >
              <Text style={tw`text-white font-bold text-sm`}>수락</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}