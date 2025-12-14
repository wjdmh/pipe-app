import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, addDoc, collection, runTransaction } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
import { sendPushNotification } from '../../utils/notificationHelper';

type TeamInfo = {
  id: string;
  name: string;
  level: string;
  affiliation: string;
  stats: { wins: number; total: number };
  captainId: string; // 알림 전송을 위해 captainId 포함
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
      if (!matchSnap.exists()) {
        Alert.alert('오류', '존재하지 않는 게시글입니다.');
        router.back();
        return;
      }

      const matchData = matchSnap.data();
      // 이미 매칭된 게시글인 경우 알림 후 뒤로가기
      if (matchData.status !== 'recruiting') {
        Alert.alert('알림', '이미 마감된 모집입니다.');
        router.back();
        return;
      }

      const applicantIds = matchData.applicants || [];
      const teams: TeamInfo[] = [];
      
      // 신청 팀 정보 조회
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

  // [Upgraded] DB 저장 + 푸시 발송 통합 함수
  const sendNotification = async (targetUid: string, type: string, title: string, msg: string) => {
      if (!targetUid) return;
      try {
          // 1. Firestore 내 알림 센터 저장
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type, 
              title, 
              message: msg,
              link: `/home/locker`,
              createdAt: new Date().toISOString(),
              isRead: false
          });

          // 2. 실제 푸시 알림 발송
          const userSnap = await getDoc(doc(db, "users", targetUid));
          if (userSnap.exists()) {
              const token = userSnap.data().pushToken;
              if (token) {
                  await sendPushNotification(token, title, msg, { link: '/home/locker' });
              }
          }
      } catch (e) { console.warn("알림 전송 실패 (Non-blocking):", e); }
  };

  // [Critical Fix] 매칭 수락 트랜잭션 적용
  const handleAccept = async (team: TeamInfo) => {
    if (isProcessing) return;
    
    Alert.alert('매칭 수락', `'${team.name}' 팀과 매칭을 확정하시겠습니까?\n확정 시 다른 신청자들은 자동 탈락 처리됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확정하기',
        onPress: async () => {
          if (typeof matchId !== 'string') return;
          setIsProcessing(true);

          try {
            await runTransaction(db, async (transaction) => {
              const matchRef = doc(db, "matches", matchId);
              const matchDoc = await transaction.get(matchRef);

              if (!matchDoc.exists()) {
                throw "존재하지 않는 게시글입니다.";
              }

              const data = matchDoc.data();
              // [Check] 동시성 방어: 이미 다른 사람이 수락했는지 확인
              if (data.status !== 'recruiting') {
                throw "이미 마감된 경기입니다.";
              }

              // 상태 업데이트: matched로 변경 및 guestId 지정, 신청자 목록 초기화
              transaction.update(matchRef, {
                status: 'matched',
                guestId: team.id,
                applicants: [] // DB상 신청자 목록 비우기 (클린업)
              });
            });

            // --- 트랜잭션 성공 후 알림 발송 ---
            
            // 1. 수락된 팀에게 알림 (성공)
            await sendNotification(
                team.captainId,
                'match_upcoming', // 아이콘 타입
                '매칭 성사! 🎉',
                `신청하신 경기가 매칭되었습니다! 상대 팀 연락처를 확인하세요.`
            );

            // 2. 탈락한 팀들에게 알림 (실패)
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

            Alert.alert('매칭 확정', '매칭이 성공적으로 성사되었습니다!');
            router.back(); // 라커룸으로 복귀

          } catch (e: any) {
            console.error("Match Accept Error:", e);
            const errorMsg = typeof e === 'string' ? e : '수락 처리 중 오류가 발생했습니다.';
            Alert.alert('오류', errorMsg);
            // 상태가 변경되었을 수 있으므로 목록 새로고침
            loadApplicants();
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
      {/* 로딩 오버레이 */}
      {isProcessing && (
        <View className="absolute inset-0 bg-black/30 z-50 justify-center items-center">
            <ActivityIndicator size="large" color="#ffffff" />
            <Text className="text-white font-bold mt-4">매칭 확정 중...</Text>
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
            <View>
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
              className="bg-indigo-600 px-5 py-2.5 rounded-xl shadow-sm active:scale-95"
            >
              <Text className="text-white font-bold text-sm">수락</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}