import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Modal,
  Platform,
  Share // 👇 [New] 네이티브 공유 기능을 위해 추가
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { 
    doc, getDoc, runTransaction, serverTimestamp 
} from 'firebase/firestore';
// 👇 [Path Check] 기존 경로 유지
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';

type MatchData = {
  id: string;
  teamId: string;
  teamName: string;
  writerId: string;
  type: '6man' | '9man';
  gender: 'male' | 'female' | 'mixed';
  level: string;
  timeDisplay: string;
  time: string;
  loc: string;
  description: string;
  status: 'recruiting' | 'scheduled' | 'finished';
  opponentId?: string; 
  opponentName?: string; 
  winnerId?: string; 
};

export default function MatchDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useUser();
  const matchId = Array.isArray(id) ? id[0] : id;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 결과 입력 모달 상태
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (matchId) fetchMatchInfo();
  }, [matchId]);

  const fetchMatchInfo = async () => {
    try {
        const docSnap = await getDoc(doc(db, "matches", matchId));
        if (docSnap.exists()) {
            setMatch({ id: docSnap.id, ...docSnap.data() } as MatchData);
        } else {
            Alert.alert("오류", "매치 정보를 찾을 수 없습니다.");
            router.back();
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  // ✅ [Updated] 네이티브 공유 로직 적용 (v1.25)
  const handleShare = async () => {
      if (!match) return;

      const typeText = `${match.type === '6man' ? '6인제' : '9인제'} | ${match.gender === 'male' ? '남자부' : match.gender === 'female' ? '여자부' : '혼성'} | ${match.level}`;
      // 앱/웹 공통으로 사용할 수 있는 배포 URL
      const shareUrl = `https://pipe-app.vercel.app/match/${match.id}`;

      // 공유 텍스트 포맷팅
      const shareMessage = `🏐 [PIPE 매치 초청] 상대 팀을 찾습니다!

📅 ${match.timeDisplay}
📍 ${match.loc}
🔥 ${typeText}
${match.description ? `📢 비고: ${match.description}` : ''}

👇 매치 신청하러 가기
${shareUrl}`;

      // 플랫폼별 분기 처리
      if (Platform.OS !== 'web') {
          // [App] 네이티브 공유 시트 호출 (카카오톡, 문자 등 선택 가능)
          try {
              await Share.share({
                  message: shareMessage,
                  // iOS는 url 파라미터를 따로 주면 미리보기가 더 잘 나옴
                  url: Platform.OS === 'ios' ? shareUrl : undefined, 
              });
          } catch (error) {
              Alert.alert("오류", "공유 기능을 실행할 수 없습니다.");
          }
      } else {
          // [Web] 클립보드 복사 (PC/모바일 웹 브라우저)
          try {
              await navigator.clipboard.writeText(shareMessage);
              window.alert("초대장이 복사되었습니다!\n원하는 곳에 붙여넣기(Ctrl+V) 하세요.");
          } catch (err) {
              window.alert("복사에 실패했습니다. 수동으로 복사해주세요.");
          }
      }
  };

  // [Action] 매치 신청하기
  const applyMatch = async () => {
    if (!user?.teamId) return Alert.alert("알림", "팀에 소속되어야 신청할 수 있습니다.");
    if (user.teamId === match?.teamId) return Alert.alert("알림", "자신의 팀 매치에는 신청할 수 없습니다.");
    
    // 실제 신청 로직은 applicants 관리 페이지에서 처리하거나 별도 구현
    Alert.alert("신청", "매치 신청 기능은 '신청자 관리' 페이지와 연동됩니다.");
  };

  // [Logic] 경기 결과 입력
  const submitResult = async () => {
    if (!selectedWinner || !match || !match.opponentId) return;
    
    setProcessing(true);
    try {
        await runTransaction(db, async (transaction) => {
            const matchRef = doc(db, "matches", match.id);
            const matchDoc = await transaction.get(matchRef);
            if (!matchDoc.exists()) throw "매치가 존재하지 않습니다.";
            if (matchDoc.data().status === 'finished') throw "이미 종료된 경기입니다.";

            const homeRef = doc(db, "teams", match.teamId);
            const awayRef = doc(db, "teams", match.opponentId!);
            
            const homeDoc = await transaction.get(homeRef);
            const awayDoc = await transaction.get(awayRef);

            if (!homeDoc.exists() || !awayDoc.exists()) throw "팀 정보를 찾을 수 없습니다.";

            const homeStats = homeDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
            const awayStats = awayDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };

            if (selectedWinner === match.teamId) {
                homeStats.wins += 1;
                homeStats.points += 3;
                awayStats.losses += 1;
                awayStats.points += 1;
            } else {
                awayStats.wins += 1;
                awayStats.points += 3;
                homeStats.losses += 1;
                homeStats.points += 1;
            }
            homeStats.total += 1;
            awayStats.total += 1;

            transaction.update(matchRef, {
                status: 'finished',
                winnerId: selectedWinner,
                endedAt: serverTimestamp()
            });
            transaction.update(homeRef, { stats: homeStats });
            transaction.update(awayRef, { stats: awayStats });
        });

        Alert.alert("처리 완료", "경기 결과가 랭킹에 반영되었습니다.", [
            { text: "확인", onPress: () => {
                setShowResultModal(false);
                fetchMatchInfo();
            }}
        ]);

    } catch (e) {
        console.error("Result Transaction Error:", e);
        Alert.alert("오류", typeof e === 'string' ? e : "결과 처리 중 문제가 발생했습니다.");
    } finally {
        setProcessing(false);
    }
  };

  if (loading || !match) {
    return <View className="flex-1 bg-white justify-center items-center"><ActivityIndicator color="#4F46E5" /></View>;
  }

  const isWriter = user?.uid === match.writerId;
  const canManage = isWriter || user?.role === 'admin';

  const statusBadge = {
      recruiting: { text: '모집중', color: 'text-blue-600', bg: 'bg-blue-50' },
      scheduled: { text: '경기 예정', color: 'text-green-600', bg: 'bg-green-50' },
      finished: { text: '종료됨', color: 'text-gray-500', bg: 'bg-gray-100' }
  }[match.status];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">매치 상세</Text>
        
        {/* 👇 [Updated] 공유 아이콘 변경 (share-square) */}
        {match.status === 'recruiting' ? (
            <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
                <FontAwesome5 name="share-square" size={20} color="#111827" />
            </TouchableOpacity>
        ) : (
            <View className="w-8" />
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* 1. Status & Title */}
        <View className="px-5 py-6 border-b border-gray-100">
            <View className={`self-start px-3 py-1 rounded-full mb-3 ${statusBadge.bg}`}>
                <Text className={`text-xs font-bold ${statusBadge.color}`}>{statusBadge.text}</Text>
            </View>
            <Text className="text-2xl font-black text-gray-900 mb-2">{match.teamName}의 매치</Text>
            <View className="flex-row items-center gap-2">
                <Text className="text-gray-500 font-medium">{match.timeDisplay}</Text>
                <View className="w-1 h-1 bg-gray-300 rounded-full" />
                <Text className="text-gray-500 font-medium">{match.loc}</Text>
            </View>
        </View>

        {/* 2. Match Info Cards */}
        <View className="px-5 py-6 gap-3">
            <View className="flex-row gap-3">
                <View className="flex-1 bg-gray-50 p-4 rounded-xl items-center">
                    <Text className="text-gray-500 text-xs mb-1">경기 방식</Text>
                    <Text className="text-gray-900 font-bold text-base">
                        {match.type === '6man' ? '6인제' : '9인제'} / {match.gender === 'male' ? '남' : match.gender === 'female' ? '여' : '혼성'}
                    </Text>
                </View>
                <View className="flex-1 bg-gray-50 p-4 rounded-xl items-center">
                    <Text className="text-gray-500 text-xs mb-1">모집 레벨</Text>
                    <Text className="text-gray-900 font-bold text-base">{match.level}</Text>
                </View>
            </View>
        </View>

        {/* 3. Description */}
        <View className="px-5 py-4">
            <Text className="text-lg font-bold text-gray-900 mb-3">공지사항</Text>
            <Text className="text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-xl">
                {match.description}
            </Text>
        </View>

        {/* 4. Matchup (상대팀 정보) */}
        {match.status !== 'recruiting' && match.opponentName && (
            <View className="px-5 py-6">
                <Text className="text-lg font-bold text-gray-900 mb-3">매치업</Text>
                <View className="flex-row items-center justify-between bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                    <View className="items-center w-1/3">
                        <Text className="font-bold text-gray-900 mb-1">{match.teamName}</Text>
                        <Text className="text-xs text-gray-500">HOME</Text>
                    </View>
                    <Text className="text-xl font-black text-gray-300">VS</Text>
                    <View className="items-center w-1/3">
                        <Text className="font-bold text-gray-900 mb-1">{match.opponentName}</Text>
                        <Text className="text-xs text-gray-500">AWAY</Text>
                    </View>
                </View>

                {match.status === 'finished' && (
                    <View className="mt-4 items-center p-3 bg-gray-900 rounded-xl">
                        <Text className="text-white font-bold">
                            🏆 승리: {match.winnerId === match.teamId ? match.teamName : match.opponentName}
                        </Text>
                    </View>
                )}
            </View>
        )}
      </ScrollView>

      {/* Footer Buttons */}
      <View className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-5 pb-8 shadow-lg">
        {canManage ? (
            // [관리자 모드]
            <View className="gap-3">
                {match.status === 'recruiting' && (
                    <TouchableOpacity 
                        onPress={() => router.push(`/match/applicants?id=${match.id}` as any)}
                        className="w-full bg-indigo-600 py-4 rounded-xl items-center"
                    >
                        <Text className="text-white font-bold text-lg">신청자 관리</Text>
                    </TouchableOpacity>
                )}
                
                {match.status === 'scheduled' && (
                    <TouchableOpacity 
                        onPress={() => setShowResultModal(true)}
                        className="w-full bg-gray-900 py-4 rounded-xl items-center"
                    >
                        <Text className="text-white font-bold text-lg">경기 결과 입력</Text>
                    </TouchableOpacity>
                )}

                {match.status === 'finished' && (
                    <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                        <Text className="text-gray-500 font-bold text-lg">종료된 경기입니다</Text>
                    </View>
                )}
            </View>
        ) : (
            // [일반 유저 모드]
            match.status === 'recruiting' ? (
                <TouchableOpacity 
                    onPress={applyMatch}
                    className="w-full bg-indigo-600 py-4 rounded-xl items-center"
                >
                    <Text className="text-white font-bold text-lg">매치 신청하기</Text>
                </TouchableOpacity>
            ) : (
                <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                    <Text className="text-gray-500 font-bold text-lg">모집이 마감되었습니다</Text>
                </View>
            )
        )}
      </View>

      {/* [Modal] 결과 입력 모달 */}
      <Modal visible={showResultModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-5">
            <View className="bg-white w-full max-w-sm rounded-2xl p-6">
                <Text className="text-xl font-bold text-gray-900 mb-2 text-center">경기 결과 입력</Text>
                <Text className="text-gray-500 mb-6 text-center text-sm">
                    승리 팀을 선택해주세요.{'\n'}결과는 즉시 랭킹에 반영되며 수정할 수 없습니다.
                </Text>

                <View className="flex-row gap-3 mb-6">
                    <TouchableOpacity 
                        onPress={() => setSelectedWinner(match.teamId)}
                        className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === match.teamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    >
                        <Text className={`font-bold ${selectedWinner === match.teamId ? 'text-indigo-600' : 'text-gray-500'}`}>{match.teamName}</Text>
                        <Text className="text-xs text-gray-400 mt-1">HOME</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={() => setSelectedWinner(match.opponentId!)}
                        className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === match.opponentId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    >
                        <Text className={`font-bold ${selectedWinner === match.opponentId ? 'text-indigo-600' : 'text-gray-500'}`}>{match.opponentName}</Text>
                        <Text className="text-xs text-gray-400 mt-1">AWAY</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    onPress={submitResult}
                    disabled={!selectedWinner || processing}
                    className={`w-full py-4 rounded-xl items-center ${!selectedWinner ? 'bg-gray-300' : 'bg-indigo-600'}`}
                >
                    {processing ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">결과 확정</Text>}
                </TouchableOpacity>
                
                <TouchableOpacity 
                    onPress={() => setShowResultModal(false)}
                    className="mt-3 py-3 items-center"
                >
                    <Text className="text-gray-500 font-bold">취소</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}