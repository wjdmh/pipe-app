import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

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
          setMatch({ id: matchDoc.id, ...matchDoc.data() } as MatchDetail);
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
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type, title, message: msg,
              link: `/home/locker`,
              createdAt: new Date().toISOString(),
              isRead: false
          });
      } catch (e) { console.error("알림 전송 실패", e); }
  };

  const handleDelete = async () => {
    Alert.alert('삭제 확인', '정말 이 공고를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
            if (!match?.id) return;
            setIsProcessing(true);
            try {
                await deleteDoc(doc(db, "matches", match.id));
                router.back();
            } catch (e) { Alert.alert('오류', '삭제 실패'); } finally { setIsProcessing(false); }
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

  if (loading) return <View style={tw`flex-1 justify-center items-center bg-[${COLORS.bg}]`}><ActivityIndicator /></View>;
  if (!match) return <View style={tw`flex-1 justify-center items-center`}><Text>정보 없음</Text></View>;

  const isMyPost = userTeamId === match.hostId;
  const isApplied = userTeamId && match.applicants?.includes(userTeamId);

  return (
    <SafeAreaView style={tw`flex-1 bg-[${COLORS.bg}]`} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={tw`px-5 py-3 flex-row items-center justify-between bg-[${COLORS.bg}]`}>
        <TouchableOpacity onPress={() => router.back()} style={tw`p-2 -ml-2 rounded-full`}>
            <FontAwesome5 name="arrow-left" size={20} color={COLORS.textMain} />
        </TouchableOpacity>
        <Text style={tw`text-lg font-bold text-[${COLORS.textMain}]`}>매칭 상세</Text>
        <View style={tw`w-8`} />
      </View>

      <ScrollView contentContainerStyle={tw`px-5 pt-2 pb-32`}>
        <View style={tw`bg-white p-6 rounded-[24px] shadow-sm mb-4`}>
            <View style={tw`flex-row gap-2 mb-4`}>
                <View style={tw`bg-blue-50 px-2.5 py-1.5 rounded-lg`}>
                    <Text style={tw`text-blue-600 text-xs font-bold`}>{match.type === '9man' ? '9인제' : '6인제'}</Text>
                </View>
                <View style={tw`bg-gray-100 px-2.5 py-1.5 rounded-lg`}>
                    <Text style={tw`text-gray-600 text-xs font-bold`}>{match.gender === 'male' ? '남자부' : match.gender === 'female' ? '여자부' : '혼성'}</Text>
                </View>
                {match.level && (
                     <View style={tw`bg-orange-50 px-2.5 py-1.5 rounded-lg`}>
                        <Text style={tw`text-orange-600 text-xs font-bold`}>{match.level}급</Text>
                    </View>
                )}
            </View>
            <Text style={tw`text-[26px] font-extrabold text-[${COLORS.textMain}] mb-1 leading-tight`}>{match.team}</Text>
            <Text style={tw`text-base text-[${COLORS.textGray}]`}>{match.affiliation || '소속 정보 없음'}</Text>
        </View>

        <View style={tw`bg-white p-6 rounded-[24px] shadow-sm mb-4`}>
            <Text style={tw`text-sm font-bold text-[${COLORS.textGray}] mb-5`}>MATCH INFO</Text>
            <View style={tw`flex-row items-start mb-6`}>
                <View style={tw`w-10 h-10 rounded-full bg-blue-50 items-center justify-center mr-4`}>
                    <FontAwesome5 name="calendar-alt" size={18} color={COLORS.primary} />
                </View>
                <View style={tw`flex-1`}>
                    <Text style={tw`text-xs text-[${COLORS.textGray}] mb-1`}>일시</Text>
                    <Text style={tw`text-lg font-bold text-[${COLORS.textMain}]`}>{match.time}</Text>
                </View>
            </View>
            <View style={tw`flex-row items-start`}>
                <View style={tw`w-10 h-10 rounded-full bg-pink-50 items-center justify-center mr-4`}>
                    <FontAwesome5 name="map-marker-alt" size={18} color="#E91E63" />
                </View>
                <View style={tw`flex-1`}>
                    <Text style={tw`text-xs text-[${COLORS.textGray}] mb-1`}>장소</Text>
                    <Text style={tw`text-lg font-bold text-[${COLORS.textMain}]`}>{match.loc}</Text>
                </View>
            </View>
        </View>

        <View style={tw`bg-white p-6 rounded-[24px] shadow-sm`}>
            <Text style={tw`text-sm font-bold text-[${COLORS.textGray}] mb-3`}>특이사항</Text>
            <Text style={tw`text-base text-[${COLORS.textSub}] leading-6`}>{match.note || '특이사항이 없습니다.'}</Text>
        </View>
      </ScrollView>

      <View style={tw`absolute bottom-0 w-full bg-white px-5 pt-4 pb-8 border-t border-gray-100`}>
        {isMyPost ? (
            <View style={tw`flex-row gap-3`}>
                <TouchableOpacity onPress={() => router.push({ pathname: '/match/edit', params: { id: match.id } })} style={tw`flex-1 bg-[#F2F4F6] py-4 rounded-xl items-center`}>
                    <Text style={tw`text-[${COLORS.textSub}] font-bold text-lg`}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} disabled={isProcessing} style={tw`flex-1 bg-red-50 py-4 rounded-xl items-center`}>
                    <Text style={tw`text-red-500 font-bold text-lg`}>삭제</Text>
                </TouchableOpacity>
            </View>
        ) : isApplied ? (
            <TouchableOpacity onPress={handleCancelApply} disabled={isProcessing} style={tw`w-full bg-[#F2F4F6] py-4 rounded-2xl items-center`}>
                <Text style={tw`text-[${COLORS.textSub}] font-bold text-lg`}>신청 취소하기</Text>
            </TouchableOpacity>
        ) : (
            <TouchableOpacity onPress={handleApply} disabled={isProcessing} style={tw`w-full bg-[${COLORS.primary}] py-4 rounded-2xl items-center shadow-lg shadow-blue-200`}>
                {isProcessing ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>매칭 신청하기</Text>}
            </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}