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
  Linking
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { 
    doc, getDoc, runTransaction, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';
// 공유 유틸리티
import { shareLink } from '../../utils/share';

// ✅ [Fix] MatchData 타입 확장 (teamName, team 호환성 확보)
type MatchData = {
  id: string;
  teamId: string;
  teamName?: string; // 신규 필드
  team?: string;     // 구형 필드 (하위 호환)
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

  // 날짜 포맷팅 헬퍼
  const formatTimeDetail = (isoString: string) => {
    try {
        const d = new Date(isoString);
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const hour = d.getHours();
        const min = d.getMinutes();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = days[d.getDay()];
        return `${month}월 ${day}일 (${dayName}) ${hour}:${min.toString().padStart(2, '0')}`;
    } catch { return isoString; }
  };

  // ✅ [Fix] 팀 이름 안전하게 가져오기 (Fallback 로직)
  const getTeamName = () => {
      if (!match) return "";
      return match.teamName || match.team || "팀명 미정";
  };

  // 공유하기
  const handleShare = async () => {
      if (!match) return;

      const typeText = `${match.type === '6man' ? '6인제' : '9인제'} | ${match.gender === 'male' ? '남자부' : match.gender === 'female' ? '여자부' : '혼성'} | ${match.level}`;
      const shareUrl = `https://pipe-app.vercel.app/match/${match.id}`;

      const shareMessage = `🏐 [PIPE 매치 초청] 상대 팀을 찾습니다!

📅 ${match.timeDisplay}
📍 ${match.loc}
🔥 ${typeText}
${match.description ? `📢 비고: ${match.description}` : ''}`;

      await shareLink({
          title: 'PIPE 매치 공유',
          message: shareMessage,
          url: shareUrl
      });
  };

  // 매치 신청하기
  const applyMatch = async () => {
    if (!user?.teamId) return Alert.alert("알림", "팀에 소속되어야 신청할 수 있습니다.");
    if (user.teamId === match?.teamId) return Alert.alert("알림", "자신의 팀 매치에는 신청할 수 없습니다.");
    
    // 실제 로직은 별도 구현 필요, 여기선 안내만
    Alert.alert("신청", "매치 신청 기능은 '신청자 관리' 페이지와 연동됩니다.");
  };

  // 경기 결과 입력 로직
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

  // 상태 배지 스타일 정의
  const statusBadge = {
      recruiting: { text: '모집중', color: 'text-blue-600', bg: 'bg-blue-50', icon: 'bullhorn' },
      scheduled: { text: '경기 예정', color: 'text-green-600', bg: 'bg-green-50', icon: 'calendar-check' },
      finished: { text: '종료됨', color: 'text-gray-500', bg: 'bg-gray-100', icon: 'flag-checkered' }
  }[match.status];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">매치 정보</Text>
        
        {/* 공유 아이콘 */}
        <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
            <FontAwesome5 name="share-square" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        
        {/* 1. Title & Status Section */}
        <View className="px-6 pt-8 pb-6 border-b border-gray-100">
            <View className="flex-row items-center mb-3">
                <View className={`flex-row items-center px-2.5 py-1 rounded-md mr-2 ${statusBadge.bg}`}>
                    {/* @ts-ignore */}
                    <FontAwesome5 name={statusBadge.icon} size={10} style={{ marginRight: 4 }} className={statusBadge.color.replace('text-', 'text-opacity-80 ')} />
                    <Text className={`text-xs font-bold ${statusBadge.color}`}>{statusBadge.text}</Text>
                </View>
                <Text className="text-gray-500 font-medium text-[13px]">
                   {match.gender === 'male' ? '남자부' : match.gender === 'female' ? '여자부' : '혼성'} · {match.level}
                </Text>
            </View>
            
            {/* ✅ [Fix] 팀 이름 안전 표시 (getTeamName 함수 사용) */}
            <Text className="text-[24px] font-extrabold text-gray-900 leading-tight mb-2">{getTeamName()}</Text>
            
            <Text className="text-[15px] text-gray-600">
                {match.type === '6man' ? '6인제' : '9인제'} 경기를 제안합니다.
            </Text>
        </View>

        {/* 2. Info Grid (시간/장소) */}
        <View className="px-6 py-6 border-b border-gray-100">
            <View className="flex-row items-start mb-5">
                <View className="w-6 mt-0.5"><FontAwesome5 name="clock" size={16} color="#9CA3AF" /></View>
                <View>
                    <Text className="text-gray-400 text-[12px] font-bold mb-0.5">일시</Text>
                    <Text className="text-gray-900 text-[16px] font-bold">
                        {formatTimeDetail(match.time)}
                    </Text>
                </View>
            </View>
            <View className="flex-row items-start">
                <View className="w-6 mt-0.5"><FontAwesome5 name="map-marker-alt" size={16} color="#9CA3AF" /></View>
                <View className="flex-1">
                    <Text className="text-gray-400 text-[12px] font-bold mb-0.5">장소</Text>
                    <Text className="text-gray-900 text-[16px] font-bold leading-6">{match.loc}</Text>
                </View>
            </View>
        </View>

        {/* 3. Matchup Card (매칭 성사 시 표시) */}
        {match.status !== 'recruiting' && match.opponentName && (
             <View className="px-6 py-6 border-b border-gray-100">
                <Text className="text-sm font-bold text-gray-900 mb-4 flex-row items-center">
                    <FontAwesome5 name="handshake" size={14} color="#111827" /> 매치업
                </Text>
                <View className="flex-row items-center justify-between bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                    <View className="items-center w-[40%]">
                        {/* ✅ [Fix] 팀 이름 안전 표시 */}
                        <Text className="font-black text-gray-900 text-lg mb-1 text-center" numberOfLines={1}>{getTeamName()}</Text>
                        <View className="bg-indigo-100 px-2 py-0.5 rounded"><Text className="text-[10px] text-indigo-700 font-bold">HOME</Text></View>
                    </View>
                    <Text className="text-xl font-black text-gray-300 italic">VS</Text>
                    <View className="items-center w-[40%]">
                        <Text className="font-black text-gray-900 text-lg mb-1 text-center" numberOfLines={1}>{match.opponentName}</Text>
                        <View className="bg-gray-100 px-2 py-0.5 rounded"><Text className="text-[10px] text-gray-600 font-bold">AWAY</Text></View>
                    </View>
                </View>

                {/* 경기 결과 표시 */}
                {match.status === 'finished' && (
                    <View className="mt-4 flex-row items-center justify-center p-3 bg-gray-900 rounded-xl gap-2">
                        <FontAwesome5 name="trophy" size={14} color="#FBBF24" />
                        <Text className="text-white font-bold">
                            승리: {match.winnerId === match.teamId ? getTeamName() : match.opponentName}
                        </Text>
                    </View>
                )}
            </View>
        )}

        {/* 4. Description (공지사항) */}
        <View className="px-6 py-6">
            <Text className="text-sm font-bold text-gray-900 mb-3">상세 내용 및 공지</Text>
            <View className="bg-gray-50 p-5 rounded-2xl">
                <Text className="text-gray-700 text-[15px] leading-7">
                    {match.description || "등록된 상세 내용이 없습니다."}
                </Text>
            </View>
        </View>

      </ScrollView>

      {/* Bottom Floating Buttons */}
      <View className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-5 pb-8 shadow-lg z-10">
        {canManage ? (
            // [관리자/작성자 모드]
            <View className="gap-3">
                {match.status === 'recruiting' && (
                    <TouchableOpacity 
                        onPress={() => router.push(`/match/applicants?id=${match.id}` as any)}
                        className="w-full bg-indigo-600 py-4 rounded-xl items-center flex-row justify-center shadow-md shadow-indigo-200"
                    >
                        <FontAwesome5 name="users" size={16} color="white" style={{ marginRight: 8 }} />
                        <Text className="text-white font-bold text-lg">신청자 관리 / 매칭 확정</Text>
                    </TouchableOpacity>
                )}
                
                {match.status === 'scheduled' && (
                    <TouchableOpacity 
                        onPress={() => setShowResultModal(true)}
                        className="w-full bg-gray-900 py-4 rounded-xl items-center shadow-lg"
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
            // [일반 방문자 모드]
            match.status === 'recruiting' ? (
                <TouchableOpacity 
                    onPress={applyMatch}
                    className="w-full bg-indigo-600 py-4 rounded-xl items-center flex-row justify-center shadow-md shadow-indigo-200"
                >
                    <FontAwesome5 name="paper-plane" size={16} color="white" style={{ marginRight: 8 }} />
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
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
            <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                <Text className="text-xl font-bold text-gray-900 mb-2 text-center">경기 결과 입력</Text>
                <Text className="text-gray-500 mb-8 text-center text-sm leading-5">
                    승리한 팀을 선택해주세요.{'\n'}결과는 즉시 랭킹에 반영되며 수정이 불가능합니다.
                </Text>

                <View className="flex-row gap-3 mb-8">
                    <TouchableOpacity 
                        onPress={() => setSelectedWinner(match.teamId)}
                        className={`flex-1 p-5 rounded-2xl border-2 items-center justify-center ${selectedWinner === match.teamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    >
                        {/* ✅ [Fix] 팀 이름 안전 표시 */}
                        <Text className={`font-black text-lg ${selectedWinner === match.teamId ? 'text-indigo-600' : 'text-gray-400'}`} numberOfLines={1}>{getTeamName()}</Text>
                        <Text className="text-xs text-gray-400 mt-1 font-bold">HOME</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={() => setSelectedWinner(match.opponentId!)}
                        className={`flex-1 p-5 rounded-2xl border-2 items-center justify-center ${selectedWinner === match.opponentId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    >
                        <Text className={`font-black text-lg ${selectedWinner === match.opponentId ? 'text-indigo-600' : 'text-gray-400'}`} numberOfLines={1}>{match.opponentName}</Text>
                        <Text className="text-xs text-gray-400 mt-1 font-bold">AWAY</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    onPress={submitResult}
                    disabled={!selectedWinner || processing}
                    className={`w-full py-4 rounded-xl items-center ${!selectedWinner ? 'bg-gray-200' : 'bg-indigo-600'}`}
                >
                    {processing ? <ActivityIndicator color="white" /> : <Text className={`font-bold text-lg ${!selectedWinner ? 'text-gray-400' : 'text-white'}`}>결과 확정하기</Text>}
                </TouchableOpacity>
                
                <TouchableOpacity 
                    onPress={() => setShowResultModal(false)}
                    className="mt-4 py-2 items-center"
                >
                    <Text className="text-gray-400 font-bold text-sm">취소</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}