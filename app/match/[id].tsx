import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

type MatchDetail = {
  id: string;
  hostId: string; // Team ID
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

  // 호스트(주장)의 UID 찾기 헬퍼
  const findCaptainUid = async (teamId: string) => {
      const tSnap = await getDoc(doc(db, "teams", teamId));
      return tSnap.exists() ? tSnap.data().captainId : null;
  };

  // 알림 발송 헬퍼
  const sendNotification = async (targetUid: string, type: string, title: string, msg: string) => {
      try {
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type,
              title,
              message: msg,
              link: `/home/locker`, // 라커룸으로 이동
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
                Alert.alert('삭제됨', '공고가 삭제되었습니다.');
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
                
                // [알림 발송] 호스트 주장에게 알림
                const hostUid = await findCaptainUid(match.hostId);
                if (hostUid) {
                    await sendNotification(
                        hostUid, 
                        'applicant', 
                        '새로운 매칭 신청!', 
                        '새로운 팀이 경기를 신청했습니다. 라커룸에서 확인하세요.'
                    );
                }

                Alert.alert('성공', '신청되었습니다! 호스트가 수락하면 알림이 옵니다.');
                loadMatchAndUser();
            } catch (e) {
                Alert.alert('실패', '신청 중 오류가 발생했습니다.');
            } finally {
                setIsProcessing(false);
            }
        }
      }
    ]);
  };

    const handleCancelApply = async () => {
        if (!userTeamId || !match?.id) return;
        Alert.alert('취소 확인', '신청을 취소하시겠습니까?', [
          { text: '아니오', style: 'cancel' },
          {
            text: '네, 취소합니다',
            onPress: async () => {
                setIsProcessing(true);
                try {
                    await updateDoc(doc(db, "matches", match.id), {
                        applicants: arrayRemove(userTeamId)
                    });
                    Alert.alert('취소됨', '신청이 취소되었습니다.');
                    loadMatchAndUser();
                } catch (e) { Alert.alert('오류', '취소 실패'); } finally { setIsProcessing(false); }
            }
          }
        ]);
      };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;
  if (!match) return <View style={tw`flex-1 justify-center items-center`}><Text>정보 없음</Text></View>;

  const isMyPost = userTeamId === match.hostId;
  const isApplied = userTeamId && match.applicants?.includes(userTeamId);

  return (
    <SafeAreaView style={tw`flex-1 bg-white relative`}>
      <View style={tw`h-64 bg-slate-900 w-full absolute top-0 left-0 z-0`}>
        <View style={tw`absolute inset-0 bg-indigo-900 opacity-50`} />
      </View>

      <View style={tw`px-6 py-4 flex-row items-center z-10`}>
        <TouchableOpacity onPress={() => router.back()} style={tw`w-10 h-10 rounded-full bg-white/20 items-center justify-center`}>
            <FontAwesome name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={tw`pt-4 pb-32 px-6`} showsVerticalScrollIndicator={false}>
        <View style={tw`mb-8 mt-4`}>
            <View style={tw`flex-row gap-2 mb-3`}>
                <View style={tw`bg-indigo-500 px-3 py-1 rounded-full`}>
                    <Text style={tw`text-white text-xs font-bold`}>{match.type === '9man' ? '9인제' : '6인제'}</Text>
                </View>
                <View style={tw`bg-white/20 px-3 py-1 rounded-full`}>
                    <Text style={tw`text-white text-xs font-bold`}>{match.gender === 'male' ? '남자' : match.gender === 'female' ? '여자' : '혼성'}</Text>
                </View>
                {match.level && (
                     <View style={tw`bg-white/20 px-3 py-1 rounded-full`}>
                        <Text style={tw`text-white text-xs font-bold`}>{match.level}급</Text>
                    </View>
                )}
            </View>
            <Text style={tw`text-3xl font-extrabold text-white mb-1`}>{match.team}</Text>
            <Text style={tw`text-indigo-200 text-lg`}>{match.affiliation || '소속 정보 없음'}</Text>
        </View>

        <View style={tw`bg-white rounded-3xl p-6 shadow-xl border border-slate-100 mb-6`}>
            <Text style={tw`text-xs font-bold text-slate-400 mb-4 ml-1`}>MATCH INFO</Text>
            
            <View style={tw`flex-row items-center mb-5`}>
                <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 items-center justify-center mr-4`}>
                    <FontAwesome name="clock-o" size={24} color="#4f46e5" />
                </View>
                <View>
                    <Text style={tw`text-xs text-slate-400 font-bold`}>일시</Text>
                    <Text style={tw`text-slate-800 font-bold text-base`}>{match.time}</Text>
                </View>
            </View>

            <View style={tw`flex-row items-center mb-5`}>
                <View style={tw`w-12 h-12 rounded-2xl bg-pink-50 items-center justify-center mr-4`}>
                    <FontAwesome name="map-marker" size={24} color="#db2777" />
                </View>
                <View>
                    <Text style={tw`text-xs text-slate-400 font-bold`}>장소</Text>
                    <Text style={tw`text-slate-800 font-bold text-base`}>{match.loc}</Text>
                </View>
            </View>

            <View style={tw`bg-slate-50 p-4 rounded-xl`}>
                <Text style={tw`text-xs text-slate-400 font-bold mb-2`}>특이사항</Text>
                <Text style={tw`text-slate-600 leading-5`}>{match.note}</Text>
            </View>
        </View>

      </ScrollView>

      <View style={tw`absolute bottom-0 w-full bg-white px-6 pt-4 pb-10 border-t border-slate-100`}>
        {isMyPost ? (
            <View style={tw`flex-row gap-3`}>
                <TouchableOpacity 
                    onPress={() => router.push({ pathname: '/match/edit', params: { id: match.id } })}
                    style={tw`flex-1 bg-slate-100 py-4 rounded-xl items-center`}
                >
                    <Text style={tw`text-slate-700 font-bold text-lg`}>수정</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    onPress={handleDelete}
                    disabled={isProcessing}
                    style={tw`flex-1 bg-red-50 py-4 rounded-xl items-center border border-red-100`}
                >
                    <Text style={tw`text-red-600 font-bold text-lg`}>삭제</Text>
                </TouchableOpacity>
            </View>
        ) : isApplied ? (
            <TouchableOpacity 
                onPress={handleCancelApply}
                disabled={isProcessing}
                style={tw`w-full bg-slate-200 py-4 rounded-xl items-center`}
            >
                <Text style={tw`text-slate-500 font-bold text-lg`}>신청 완료 (취소하기)</Text>
            </TouchableOpacity>
        ) : (
            <TouchableOpacity 
                onPress={handleApply}
                disabled={isProcessing}
                style={tw`w-full bg-indigo-600 py-4 rounded-xl items-center shadow-lg shadow-indigo-500/30`}
            >
                {isProcessing ? (
                    <ActivityIndicator color="white" />
                ) : (
                    <Text style={tw`text-white font-bold text-lg`}>매칭 신청하기</Text>
                )}
            </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}