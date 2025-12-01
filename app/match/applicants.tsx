import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadApplicants();
  }, [matchId]);

  const loadApplicants = async () => {
    if (typeof matchId !== 'string') return;
    try {
      const matchSnap = await getDoc(doc(db, "matches", matchId));
      if (!matchSnap.exists()) return;

      const applicantIds = matchSnap.data().applicants || [];
      
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

  const findCaptainUid = async (teamId: string) => {
      try {
        const tSnap = await getDoc(doc(db, "teams", teamId));
        return tSnap.exists() ? tSnap.data().captainId : null;
      } catch { return null; }
  };

  const sendNotification = async (targetUid: string, type: string, title: string, msg: string) => {
      try {
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type, title, message: msg,
              link: `/home/locker`,
              createdAt: new Date().toISOString(),
              isRead: false
          });
      } catch (e) { console.error("알림 전송 실패", e); }
  };

  const handleAccept = async (team: TeamInfo) => {
    if (isProcessing) return;
    
    Alert.alert('매칭 수락', `'${team.name}' 팀과 매칭을 확정하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확정하기',
        onPress: async () => {
          if (typeof matchId !== 'string') return;
          setIsProcessing(true);
          try {
            // 1. 매칭 상태 확정
            await updateDoc(doc(db, "matches", matchId), {
              status: 'matched',
              guestId: team.id,
              applicants: [] // 목록 비우기
            });

            // 2. [UX Fix] 나머지 신청자(탈락자)에게 알림 발송
            // 현재 화면의 applicants 목록에서 수락된 팀을 제외한 모두에게 발송
            const rejectedTeams = applicants.filter(t => t.id !== team.id);
            for (const rejected of rejectedTeams) {
                const captainId = await findCaptainUid(rejected.id);
                if (captainId) {
                    await sendNotification(
                        captainId,
                        'normal',
                        '매칭 마감 안내',
                        `신청하신 경기가 '${team.name}' 팀과 매칭되어 마감되었습니다.`
                    );
                }
            }

            Alert.alert('매칭 성사', '매칭이 확정되었습니다! 연락처가 공개됩니다.');
            router.back(); // 라커룸으로 복귀
          } catch (e) {
            Alert.alert('오류', '수락 처리 중 문제가 발생했습니다.');
          } finally {
            setIsProcessing(false);
          }
        }
      }
    ]);
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  return (
    <View style={tw`flex-1 bg-white`}>
      {isProcessing && <View style={tw`absolute inset-0 bg-black/20 z-50 justify-center items-center`}><ActivityIndicator /></View>}
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
              disabled={isProcessing}
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