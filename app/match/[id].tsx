import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPushNotification } from '../../utils/notificationHelper';

const COLORS = {
  bg: '#F2F4F6',
  white: '#FFFFFF',
  primary: '#3182F6',
  textMain: '#191F28',
  textSub: '#4E5968',
  textGray: '#8B95A1',
  danger: '#FF3B30',
};

type MatchDetail = {
  id: string;
  hostId: string;
  team: string;
  affiliation?: string;
  type: string;
  gender: string;
  time: string;
  loc: string;
  note: string;
  status: string;
  applicants: string[];
  level?: string;
  isDeleted?: boolean;
};

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userTeamId, setUserTeamId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadMatchAndUser();
  }, [id]);

  const loadMatchAndUser = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        setUserTeamId(userDoc.data()?.teamId || null);
      }

      if (typeof id === 'string') {
        const matchDoc = await getDoc(doc(db, "matches", id));
        if (matchDoc.exists()) {
          const data = matchDoc.data();
          if (data.status === 'deleted' || data.isDeleted === true) {
             Alert.alert('알림', '삭제된 게시물입니다.', [{ text: '확인', onPress: () => router.back() }]);
             return;
          }
          setMatch({ id: matchDoc.id, ...data } as MatchDetail);
        } else {
          Alert.alert('오류', '존재하지 않거나 삭제된 게시물입니다.');
          router.back();
        }
      }
    } catch (e) {
      Alert.alert('오류', '정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const findCaptainUid = async (teamId: string) => {
      const tSnap = await getDoc(doc(db, "teams", teamId));
      return tSnap.exists() ? tSnap.data().captainId : null;
  };

  const sendNotification = async (targetUid: string, type: string, title: string, msg: string) => {
      try {
          // DB 알림
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type, title, message: msg,
              link: `/home/locker`,
              createdAt: new Date().toISOString(),
              isRead: false
          });

          // 푸시 알림 (New)
          const userSnap = await getDoc(doc(db, "users", targetUid));
          if (userSnap.exists() && userSnap.data().pushToken) {
              await sendPushNotification(userSnap.data().pushToken, title, msg, { link: '/home/locker' });
          }
      } catch (e) { console.error("알림 전송 실패", e); }
  };

  const handleDelete = async () => {
    Alert.alert('삭제 확인', '정말 이 공고를 삭제하시겠습니까?\n(신청자들에게는 삭제된 공고로 표시됩니다)', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
            if (!match?.id) return;
            setIsProcessing(true);
            try {
                await updateDoc(doc(db, "matches", match.id), {
                    status: 'deleted',
                    isDeleted: true,
                    deletedAt: new Date().toISOString()
                });
                Alert.alert('삭제 완료', '게시물이 삭제되었습니다.', [{ text: '확인', onPress: () => router.back() }]);
            } catch (e) { Alert.alert('오류', '삭제 처리에 실패했습니다.'); } finally { setIsProcessing(false); }
        }
      }
    ]);
  };

  const handleApply = async () => {
    if (!userTeamId) return Alert.alert('오류', '팀 정보가 없습니다.');
    if (userTeamId === match?.hostId) return;

    Alert.alert('신청 확인', '이 경기에 매칭을 신청하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '신청하기',
        onPress: async () => {
            if (!match?.id) return;
            setIsProcessing(true);
            try {
                await updateDoc(doc(db, "matches", match.id), {
                    applicants: arrayUnion(userTeamId)
                });
                const hostUid = await findCaptainUid(match.hostId);
                if (hostUid) {
                    await sendNotification(hostUid, 'applicant', '새로운 매칭 신청!', '새로운 팀이 경기를 신청했습니다. 라커룸에서 확인하세요.');
                }
                Alert.alert('성공', '신청되었습니다! 호스트가 수락하면 알림이 옵니다.');
                loadMatchAndUser();
            } catch (e) { Alert.alert('실패', '신청 중 오류가 발생했습니다.'); } finally { setIsProcessing(false); }
        }
      }
    ]);
  };

  const handleCancelApply = async () => {
      if (!userTeamId || !match?.id) return;
      Alert.alert('취소 확인', '신청을 취소하시겠습니까?', [
        { text: '아니오', style: 'cancel' },
        { text: '네, 취소합니다', onPress: async () => {
            setIsProcessing(true);
            try {
                await updateDoc(doc(db, "matches", match.id), { applicants: arrayRemove(userTeamId) });
                Alert.alert('취소됨', '신청이 취소되었습니다.');
                loadMatchAndUser();
            } catch (e) { Alert.alert('오류', '취소 실패'); } finally { setIsProcessing(false); }
        }}
      ]);
  };

  const getFormattedDate = (timeStr: string) => {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime()) && timeStr.includes('T')) {
          const days = ['일', '월', '화', '수', '목', '금', '토'];
          const month = d.getMonth() + 1;
          const date = d.getDate();
          const day = days[d.getDay()];
          const hour = d.getHours();
          const min = d.getMinutes();
          const ampm = hour >= 12 ? '오후' : '오전';
          const formatHour = hour % 12 || 12;
          const formatMin = min > 0 ? `${min}분` : '';
          return `${month}월 ${date}일 (${day}) ${ampm} ${formatHour}시 ${formatMin}`;
      }
      return timeStr;
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-[#F2F4F6]"><ActivityIndicator /></View>;
  if (!match) return <View className="flex-1 justify-center items-center"><Text>정보 없음</Text></View>;

  const isMyPost = userTeamId === match.hostId;
  const isApplied = userTeamId && match.applicants?.includes(userTeamId);

  return (
    <SafeAreaView className="flex-1 bg-[#F2F4F6]" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View className="px-5 py-3 flex-row items-center justify-between bg-[#F2F4F6]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full">
            <FontAwesome5 name="arrow-left" size={20} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-[#191F28]">매칭 상세</Text>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerClassName="px-5 pt-2 pb-32">
        <View className="bg-white p-6 rounded-[24px] shadow-sm mb-4">
            <View className="flex-row gap-2 mb-4">
                <View className="bg-blue-50 px-2.5 py-1.5 rounded-lg">
                    <Text className="text-blue-600 text-xs font-bold">{match.type === '9man' ? '9인제' : '6인제'}</Text>
                </View>
                <View className="bg-gray-100 px-2.5 py-1.5 rounded-lg">
                    <Text className="text-gray-600 text-xs font-bold">{match.gender === 'male' ? '남자부' : match.gender === 'female' ? '여자부' : '혼성'}</Text>
                </View>
                {match.level && (
                     <View className="bg-orange-50 px-2.5 py-1.5 rounded-lg">
                        <Text className="text-orange-600 text-xs font-bold">{match.level}급</Text>
                    </View>
                )}
            </View>
            <Text className="text-[26px] font-extrabold text-[#191F28] mb-1 leading-tight">{match.team}</Text>
            <Text className="text-base text-[#8B95A1]">{match.affiliation || '소속 정보 없음'}</Text>
        </View>

        <View className="bg-white p-6 rounded-[24px] shadow-sm mb-4">
            <Text className="text-sm font-bold text-[#8B95A1] mb-5">MATCH INFO</Text>
            <View className="flex-row items-start mb-6">
                <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center mr-4">
                    <FontAwesome5 name="calendar-alt" size={18} color={COLORS.primary} />
                </View>
                <View className="flex-1">
                    <Text className="text-xs text-[#8B95A1] mb-1">일시</Text>
                    <Text className="text-lg font-bold text-[#191F28]">{getFormattedDate(match.time)}</Text>
                </View>
            </View>
            <View className="flex-row items-start">
                <View className="w-10 h-10 rounded-full bg-pink-50 items-center justify-center mr-4">
                    <FontAwesome5 name="map-marker-alt" size={18} color="#E91E63" />
                </View>
                <View className="flex-1">
                    <Text className="text-xs text-[#8B95A1] mb-1">장소</Text>
                    <Text className="text-lg font-bold text-[#191F28]">{match.loc}</Text>
                </View>
            </View>
        </View>

        <View className="bg-white p-6 rounded-[24px] shadow-sm">
            <Text className="text-sm font-bold text-[#8B95A1] mb-3">특이사항</Text>
            <Text className="text-base text-[#4E5968] leading-6">{match.note || '특이사항이 없습니다.'}</Text>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 w-full bg-white px-5 pt-4 pb-8 border-t border-gray-100">
        {isMyPost ? (
            <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => router.push({ pathname: '/match/edit', params: { id: match.id } })} className="flex-1 bg-[#F2F4F6] py-4 rounded-xl items-center">
                    <Text className="text-[#4E5968] font-bold text-lg">수정</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} disabled={isProcessing} className="flex-1 bg-red-50 py-4 rounded-xl items-center">
                    <Text className="text-red-500 font-bold text-lg">삭제</Text>
                </TouchableOpacity>
            </View>
        ) : isApplied ? (
            <TouchableOpacity onPress={handleCancelApply} disabled={isProcessing} className="w-full bg-[#F2F4F6] py-4 rounded-2xl items-center">
                <Text className="text-[#4E5968] font-bold text-lg">신청 취소하기</Text>
            </TouchableOpacity>
        ) : (
            <TouchableOpacity onPress={handleApply} disabled={isProcessing} className="w-full bg-[#3182F6] py-4 rounded-2xl items-center shadow-lg shadow-blue-200">
                {isProcessing ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">매칭 신청하기</Text>}
            </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}