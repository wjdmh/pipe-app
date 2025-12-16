// app/match/[id].tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Platform, Share } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendPushNotification } from '../../utils/notificationHelper';

// [Architect's Fix] 웹용 Alert & Confirm 헬퍼
const safeAlert = (title: string, msg: string, onPress?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${msg}`);
    if (onPress) onPress();
  } else {
    Alert.alert(title, msg, onPress ? [{ text: '확인', onPress }] : undefined);
  }
};

// [Architect's Fix] 웹용 Confirm 헬퍼 (Promise 기반)
const safeConfirm = (title: string, msg: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      const result = window.confirm(`${title}\n\n${msg}`);
      resolve(result);
    } else {
      Alert.alert(title, msg, [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '확인', style: 'destructive', onPress: () => resolve(true) },
      ]);
    }
  });
};

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
             safeAlert('알림', '삭제된 게시물입니다.', () => router.back()); // Fix
             return;
          }
          setMatch({ id: matchDoc.id, ...data } as MatchDetail);
        } else {
          safeAlert('오류', '존재하지 않거나 삭제된 게시물입니다.', () => router.back()); // Fix
        }
      }
    } catch (e) {
      safeAlert('오류', '정보를 불러오지 못했습니다.');
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
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type, title, message: msg,
              link: `/home/locker`,
              createdAt: new Date().toISOString(),
              isRead: false
          });

          const userSnap = await getDoc(doc(db, "users", targetUid));
          if (userSnap.exists() && userSnap.data().pushToken) {
              await sendPushNotification(userSnap.data().pushToken, title, msg, { link: '/home/locker' });
          }
      } catch (e) { console.error("알림 전송 실패", e); }
  };

  const handleDelete = async () => {
    // [Fix] safeConfirm 사용
    const confirmed = await safeConfirm(
      '삭제 확인', 
      '정말 이 공고를 삭제하시겠습니까?\n(신청자들에게는 삭제된 공고로 표시됩니다)'
    );

    if (confirmed) {
        if (!match?.id) return;
        setIsProcessing(true);
        try {
            await updateDoc(doc(db, "matches", match.id), {
                status: 'deleted',
                isDeleted: true,
                deletedAt: new Date().toISOString()
            });
            safeAlert('삭제 완료', '게시물이 삭제되었습니다.', () => router.back());
        } catch (e) { safeAlert('오류', '삭제 처리에 실패했습니다.'); } finally { setIsProcessing(false); }
    }
  };

  const handleApply = async () => {
    if (!userTeamId) return safeAlert('오류', '팀 정보가 없습니다.');
    if (userTeamId === match?.hostId) return;

    // [Fix] safeConfirm 사용
    const confirmed = await safeConfirm('신청 확인', '이 경기에 매칭을 신청하시겠습니까?');

    if (confirmed) {
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
            safeAlert('성공', '신청되었습니다! 호스트가 수락하면 알림이 옵니다.');
            loadMatchAndUser();
        } catch (e) { safeAlert('실패', '신청 중 오류가 발생했습니다.'); } finally { setIsProcessing(false); }
    }
  };

  const handleCancelApply = async () => {
      if (!userTeamId || !match?.id) return;
      
      // [Fix] safeConfirm 사용
      const confirmed = await safeConfirm('취소 확인', '신청을 취소하시겠습니까?');

      if (confirmed) {
          setIsProcessing(true);
          try {
              await updateDoc(doc(db, "matches", match.id), { applicants: arrayRemove(userTeamId) });
              safeAlert('취소됨', '신청이 취소되었습니다.');
              loadMatchAndUser();
          } catch (e) { safeAlert('오류', '취소 실패'); } finally { setIsProcessing(false); }
      }
  };

  // [기능 추가] 공유하기 기능
  const handleShare = async () => {
    if (!match) return;
    const url = Platform.OS === 'web' ? window.location.href : `https://pipe-app.com/match/${match.id}`;
    
    if (Platform.OS === 'web') {
        try {
            await navigator.clipboard.writeText(url);
            safeAlert('복사 완료', '링크가 클립보드에 복사되었습니다.'); // Fix
        } catch (err) {
            safeAlert('오류', '링크 복사에 실패했습니다.');
        }
    } else {
        try {
            await Share.share({
                message: `[Pipe] ${match.team}팀 매치 신청하러 가기`,
                url: url,
            });
        } catch (error) {
            // ignore
        }
    }
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

  const pageTitle = `${match.team} - 매치 상세`;

  return (
    <SafeAreaView className="flex-1 bg-[#F2F4F6]" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <Stack.Screen options={{ title: pageTitle }} />

      <View className="px-5 py-3 flex-row items-center justify-between bg-[#F2F4F6]">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full">
            <FontAwesome5 name="arrow-left" size={20} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-[#191F28]">매칭 상세</Text>
        <TouchableOpacity onPress={handleShare} className="p-2 -mr-2 rounded-full">
            <FontAwesome5 name="share-alt" size={20} color={COLORS.textMain} />
        </TouchableOpacity>
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