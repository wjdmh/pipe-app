import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, addDoc, collection, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
import { sendPushNotification } from '../../utils/notificationHelper';
import { useUser } from '../context/UserContext'; // ✅ 내 정보(연락처) 가져오기

type TeamInfo = {
  id: string;
  name: string;
  level: string;
  affiliation: string;
  stats: { wins: number; total: number };
  captainId: string;
};

export default function MatchApplicantManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // matchId
  const matchId = Array.isArray(id) ? id[0] : id; // 파라미터 안전 처리
  
  const { user } = useUser(); // ✅ 호스트(나) 정보
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState<TeamInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (matchId) loadApplicants();
  }, [matchId]);

  const loadApplicants = async () => {
    if (!matchId) return;
    try {
      const matchSnap = await getDoc(doc(db, "matches", matchId));
      if (!matchSnap.exists()) {
        Alert.alert('오류', '존재하지 않는 게시글입니다.');
        router.back();
        return;
      }

      const matchData = matchSnap.data();
      if (matchData.status !== 'recruiting') {
        Alert.alert('알림', '이미 마감된 모집입니다.');
        router.back();
        return;
      }

      const applicantIds = matchData.applicants || [];
      const teams: TeamInfo[] = [];
      
      for (const teamId of applicantIds) {
        const teamSnap = await getDoc(doc(db, "teams", teamId));
        if (teamSnap.exists()) {
          const tData = teamSnap.data();
          teams.push({ 
            id: teamSnap.id, 
            name: tData.name,
            level: tData.level,
            affiliation: tData.affiliation,
            stats: tData.stats,
            captainId: tData.captainId
          });
        }
      }
      setApplicants(teams);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '신청자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 알림 전송 헬퍼
  const sendNotification = async (targetUid: string, type: string, title: string, msg: string, link: string = '/home/locker') => {
      if (!targetUid) return;
      try {
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type, 
              title, 
              message: msg,
              link, 
              createdAt: new Date().toISOString(),
              isRead: false
          });

          const userSnap = await getDoc(doc(db, "users", targetUid));
          if (userSnap.exists()) {
              const token = userSnap.data().pushToken;
              if (token) {
                  await sendPushNotification(token, title, msg, { link });
              }
          }
      } catch (e) { console.warn("알림 전송 실패:", e); }
  };

  const handleAccept = async (team: TeamInfo) => {
    if (isProcessing) return;
    if (!user) return Alert.alert("오류", "사용자 정보를 불러올 수 없습니다.");

    Alert.alert('매칭 수락', `'${team.name}' 팀과 매칭을 확정하시겠습니까?\n상대 팀에게 내 연락처가 공개됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확정하기',
        onPress: async () => {
          if (!matchId) return;
          setIsProcessing(true);

          try {
            // 1. 상대방(게스트) 주장 연락처 조회
            const guestCaptainSnap = await getDoc(doc(db, "users", team.captainId));
            const guestPhone = guestCaptainSnap.data()?.phoneNumber || "연락처 미등록";
            const myPhone = user.phoneNumber || "연락처 미등록";

            // 2. 트랜잭션 실행 (상태 변경 + 연락처 박제)
            await runTransaction(db, async (transaction) => {
              const matchRef = doc(db, "matches", matchId);
              const matchDoc = await transaction.get(matchRef);

              if (!matchDoc.exists()) throw "존재하지 않는 게시글입니다.";
              const data = matchDoc.data();
              if (data.status !== 'recruiting') throw "이미 마감된 경기입니다.";

              transaction.update(matchRef, {
                status: 'matched',
                guestId: team.id,
                applicants: [], // 신청자 목록 초기화
                
                // ✅ 연락처 스냅샷 저장 (핵심)
                hostContact: myPhone,
                guestContact: guestPhone,
                matchedAt: serverTimestamp()
              });
            });

            // 3. 알림 발송
            // 승리팀(게스트)에게: 내 번호 전송
            await sendNotification(
                team.captainId,
                'match_confirmed', // 라커룸 이동용 타입
                '매칭 성사! 🎉',
                `경기 매칭이 확정되었습니다.\n상대 주장 연락처: ${myPhone}\n라커룸에서 확인하세요.`
            );

            // 탈락팀들에게: 위로 문자
            const rejectedTeams = applicants.filter(t => t.id !== team.id);
            const notifyPromises = rejectedTeams.map(rejected => 
                sendNotification(
                    rejected.captainId,
                    'normal',
                    '매칭 마감 안내',
                    `아쉽게도 신청하신 경기가 다른 팀과 매칭되어 마감되었습니다.`
                )
            );
            await Promise.all(notifyPromises);

            Alert.alert('매칭 확정', `매칭이 성공적으로 성사되었습니다!\n상대 주장 연락처: ${guestPhone}`);
            router.back(); 

          } catch (e: any) {
            console.error("Match Accept Error:", e);
            Alert.alert('오류', typeof e === 'string' ? e : '수락 처리 중 오류가 발생했습니다.');
            loadApplicants(); // 상태 동기화
          } finally {
            setIsProcessing(false);
          }
        }
      }
    ]);
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator color="#3182F6" /></View>;

  return (
    <View className="flex-1 bg-white">
      {isProcessing && (
        <View className="absolute inset-0 bg-black/30 z-50 justify-center items-center">
            <ActivityIndicator size="large" color="#ffffff" />
            <Text className="text-white font-bold mt-4">매칭 확정 및 연락처 교환 중...</Text>
        </View>
      )}

      <View className="px-6 pt-14 pb-4 border-b border-slate-100 flex-row items-center bg-white">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-1">
          <FontAwesome name="arrow-left" size={20} color="#64748b" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-slate-800">신청자 목록 ({applicants.length})</Text>
      </View>

      <FlatList
        data={applicants}
        keyExtractor={item => item.id}
        contentContainerClassName="p-6 pb-20"
        ListEmptyComponent={
            <View className="items-center mt-20">
                <FontAwesome name="inbox" size={48} color="#E2E8F0" />
                <Text className="text-center text-slate-400 mt-4">아직 신청한 팀이 없습니다.</Text>
            </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-4 flex-row justify-between items-center">
            <View className="flex-1 mr-4">
              <View className="flex-row items-center mb-1.5">
                <Text className="font-bold text-lg text-slate-800 mr-2">{item.name}</Text>
                <View className="bg-slate-100 px-2 py-0.5 rounded text-xs">
                    <Text className="text-slate-500 text-xs font-bold">{item.level}급</Text>
                </View>
              </View>
              <Text className="text-slate-500 text-sm mb-1">{item.affiliation}</Text>
              <View className="flex-row items-center">
                  <Text className="text-xs text-slate-400 mr-2">전적</Text>
                  <Text className="text-indigo-500 text-xs font-bold">
                    {item.stats?.total > 0 
                        ? `${item.stats.wins}승 ${item.stats.total - item.stats.wins}패 (${Math.round((item.stats.wins/item.stats.total)*100)}%)` 
                        : '기록 없음'}
                  </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => handleAccept(item)}
              disabled={isProcessing}
              className="bg-indigo-600 px-5 py-3 rounded-xl shadow-sm active:scale-95"
            >
              <Text className="text-white font-bold text-sm">수락</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}