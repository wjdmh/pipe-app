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
    doc, 
    getDoc, 
    updateDoc, 
    arrayUnion
} from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../../context/UserContext';
import { shareLink } from '../../utils/share';
// ✅ [복구] 훅 불러오기
import { useMatchResult } from '../../hooks/useMatchResult';

type MatchResult = {
    hostScore: number;
    guestScore: number;
    status: 'waiting' | 'verified' | 'dispute';
    submitterId: string;
    submittedAt: string;
};

type MatchData = {
  id: string;
  teamId: string; // 호스트 팀 ID
  teamName?: string;
  team?: string; 
  writerId: string;
  type: '6man' | '9man';
  gender: 'male' | 'female' | 'mixed';
  level: string;
  timeDisplay: string;
  time: string;
  loc: string;
  description: string;
  status: 'recruiting' | 'scheduled' | 'finished' | 'matched';
  
  applicants?: string[]; 
  opponentId?: string;   
  guestId?: string;      
  opponentName?: string; 
  
  hostContact?: string;
  guestContact?: string;

  winnerId?: string;
  
  // ✅ [추가] 결과 처리를 위한 필드
  result?: MatchResult; 
};

export default function MatchDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user, requireAuth } = useUser();
  const matchId = Array.isArray(id) ? id[0] : id;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false); 
  
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  
  // ✅ [연결] Hooks 사용 (submitResult, approveResult 등)
  const { submitResult, approveResult, isProcessing } = useMatchResult();

  useEffect(() => {
    if (matchId) fetchMatchInfo();
  }, [matchId, isProcessing]); // 처리 상태가 바뀌면 데이터 갱신

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

  const getTeamName = () => {
      if (!match) return "";
      return match.teamName || match.team || "팀명 미정";
  };

  const handleShare = async () => {
      if (!match) return;
      const typeText = `${match.type === '6man' ? '6인제' : '9인제'} | ${match.gender === 'male' ? '남자부' : match.gender === 'female' ? '여자부' : '혼성'} | ${match.level}`;
      const shareUrl = `https://pipe-app.vercel.app/match/${match.id}`;
      const shareMessage = `🏐 [PIPE 매치 초청] 상대 팀을 찾습니다!\n\n📅 ${match.timeDisplay}\n📍 ${match.loc}\n🔥 ${typeText}\n${match.description ? `📢 비고: ${match.description}` : ''}`;

      await shareLink({
          title: 'PIPE 매치 공유',
          message: shareMessage,
          url: shareUrl
      });
  };

  const applyMatch = async () => {
    if (!user) return Alert.alert("알림", "로그인이 필요합니다.");
    if (!user.teamId) return Alert.alert("알림", "팀에 소속되어야 신청할 수 있습니다.");
    if (!match) return;

    if (user.teamId === match.teamId) {
        return Alert.alert("알림", "자신의 팀 매치에는 신청할 수 없습니다.");
    }
    if (match.applicants?.includes(user.teamId)) {
        return Alert.alert("알림", "이미 신청한 매치입니다.");
    }

    const processApplication = async () => {
        setApplying(true);
        try {
            const matchRef = doc(db, "matches", match.id);
            await updateDoc(matchRef, {
                applicants: arrayUnion(user.teamId)
            });
            
            const msg = "신청이 완료되었습니다. 호스트가 수락하면 매칭이 확정됩니다.";
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert("완료", msg);
            }
            fetchMatchInfo(); 
        } catch (e) {
            console.error("Match Apply Error:", e);
            Alert.alert("오류", "신청 중 문제가 발생했습니다.");
        } finally {
            setApplying(false);
        }
    };

    if (Platform.OS === 'web') {
        const confirmed = window.confirm(`'${getTeamName()}' 팀과의 경기를 신청하시겠습니까?`);
        if (confirmed) {
            await processApplication();
        }
    } else {
        Alert.alert("매치 신청", `'${getTeamName()}' 팀과의 경기를 신청하시겠습니까?`, [
            { text: "취소", style: "cancel" },
            { text: "신청하기", onPress: processApplication }
        ]);
    }
  };

  // ✅ [수정] Hooks의 submitResult 사용 (호스트만 입력 가능)
  const handleResultSubmit = async () => {
    if (!selectedWinner || !match || !user?.teamId) return;

    // 권한 체크: 호스트만 입력 가능
    if (user.teamId !== match.teamId) {
        Alert.alert("권한 없음", "경기 결과 입력은 호스트(홈팀)만 가능합니다.");
        return;
    }

    // 승리 팀에 따라 가상의 점수 생성 (Hook이 점수를 요구하므로)
    // 홈팀 승리 시: 나 3점 vs 상대 0점
    // 상대팀 승리 시: 나 0점 vs 상대 3점
    const isMyWin = selectedWinner === match.teamId;
    const myScore = isMyWin ? 3 : 0;
    const opScore = isMyWin ? 0 : 3;

    // 🚨 중요: Hook은 'hostId'를 찾지만 현재 match 객체엔 'teamId'로 되어있음.
    // 따라서 match 객체를 복사하여 hostId를 명시적으로 주입해줌.
    const matchDataForHook = {
        ...match,
        hostId: match.teamId, // Hook 호환성 확보
        guestId: match.opponentId || match.guestId
    };

    const success = await submitResult(match.id, myScore, opScore, user.teamId, matchDataForHook);
    
    if (success) {
        setShowResultModal(false);
        fetchMatchInfo(); // 상태 업데이트
    }
  };

  // ✅ [추가] 결과 승인 핸들러
  const handleApprove = async () => {
      if (!match || !user?.teamId) return;
      
      // 승인 로직 호출
      // 마찬가지로 hostId 매핑 필요
      const matchDataForHook = {
        ...match,
        hostId: match.teamId,
        guestId: match.opponentId || match.guestId
      };

      await approveResult(matchDataForHook, user.teamId);
      fetchMatchInfo();
  };

  if (loading || !match) {
    return <View className="flex-1 bg-white justify-center items-center"><ActivityIndicator color="#4F46E5" /></View>;
  }

  const isWriter = user?.uid === match.writerId;
  const isHost = user?.teamId === match.teamId;
  const confirmedOpponentId = match.guestId || match.opponentId;
  const isGuest = user?.teamId === confirmedOpponentId;
  
  const canManage = isWriter || user?.role === 'admin';
  const isMatched = match.status === 'scheduled' || match.status === 'matched';
  const iHaveApplied = user?.teamId ? match.applicants?.includes(user.teamId) : false;

  // 결과 관련 상태
  const hasResult = !!match.result;
  const isWaitingApproval = match.result?.status === 'waiting';
  // 내가 결과를 제출했는지 여부
  const iAmSubmitter = match.result?.submitterId === user?.teamId;

  const statusBadge = {
      recruiting: { text: '모집중', color: 'text-blue-600', bg: 'bg-blue-50', icon: 'bullhorn' },
      matched: { text: '매칭 확정', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'handshake' }, 
      scheduled: { text: '경기 예정', color: 'text-green-600', bg: 'bg-green-50', icon: 'calendar-check' },
      finished: { text: '종료됨', color: 'text-gray-500', bg: 'bg-gray-100', icon: 'flag-checkered' }
  }[match.status] || { text: '상태 미정', color: 'text-gray-500', bg: 'bg-gray-100', icon: 'question' };

  let targetTeamName = "";
  let targetContact = "";
  
  if (isMatched) {
      if (isHost) {
          targetTeamName = match.opponentName || "상대팀";
          targetContact = match.guestContact || "연락처 미등록";
      } else if (isGuest) {
          targetTeamName = getTeamName();
          targetContact = match.hostContact || "연락처 정보 없음";
      }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">매치 정보</Text>
        <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
            <FontAwesome5 name="share-square" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        
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
            <Text className="text-[24px] font-extrabold text-gray-900 leading-tight mb-2">{getTeamName()}</Text>
            <Text className="text-[15px] text-gray-600">
                {match.type === '6man' ? '6인제' : '9인제'} 경기를 제안합니다.
            </Text>
        </View>

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

        {isMatched && (isHost || isGuest) && (
            <View className="px-6 py-4 bg-indigo-50 border-b border-indigo-100">
                <Text className="text-indigo-900 font-bold text-sm mb-3 flex-row items-center">
                    <FontAwesome5 name="id-card" size={12} color="#312E81" />  대표자 연락처 확인
                </Text>
                <View className="bg-white p-4 rounded-xl border border-indigo-100 flex-row justify-between items-center shadow-sm">
                    <View>
                        <Text className="text-gray-500 font-medium text-xs mb-1">상대팀 대표자 ({targetTeamName})</Text>
                        <Text className="text-gray-900 font-extrabold text-lg tracking-wide">{targetContact}</Text>
                    </View>
                    <TouchableOpacity 
                        onPress={() => Linking.openURL(`sms:${targetContact}`)}
                        className="bg-indigo-100 p-3 rounded-full"
                    >
                        <FontAwesome5 name="sms" size={16} color="#4F46E5" />
                    </TouchableOpacity>
                </View>
            </View>
        )}

        {isMatched && (match.opponentName || match.guestId) && (
             <View className="px-6 py-6 border-b border-gray-100">
                <Text className="text-sm font-bold text-gray-900 mb-4 flex-row items-center">
                    <FontAwesome5 name="handshake" size={14} color="#111827" /> 매치업
                </Text>
                <View className="flex-row items-center justify-between bg-white border border-gray-200 p-5 rounded-2xl shadow-sm">
                    <View className="items-center w-[40%]">
                        <Text className="font-black text-gray-900 text-lg mb-1 text-center" numberOfLines={1}>{getTeamName()}</Text>
                        <View className="bg-indigo-100 px-2 py-0.5 rounded"><Text className="text-[10px] text-indigo-700 font-bold">HOME</Text></View>
                    </View>
                    <Text className="text-xl font-black text-gray-300 italic">VS</Text>
                    <View className="items-center w-[40%]">
                        <Text className="font-black text-gray-900 text-lg mb-1 text-center" numberOfLines={1}>
                            {match.opponentName || "상대팀"}
                        </Text>
                        <View className="bg-gray-100 px-2 py-0.5 rounded"><Text className="text-[10px] text-gray-600 font-bold">AWAY</Text></View>
                    </View>
                </View>

                {/* ✅ [수정] 결과 표시 로직 강화 */}
                {match.status === 'finished' && (
                    <View className="mt-4 flex-row items-center justify-center p-3 bg-gray-900 rounded-xl gap-2">
                        <FontAwesome5 name="trophy" size={14} color="#FBBF24" />
                        <Text className="text-white font-bold">
                            {/* winnerId가 있으면 그것을, 없으면 점수 비교 */}
                            승리: {match.winnerId === match.teamId ? getTeamName() : 
                                  (match.winnerId === match.opponentId ? (match.opponentName || "상대팀") : 
                                  (match.result?.hostScore && match.result.hostScore > match.result.guestScore ? getTeamName() : (match.opponentName || "상대팀")))}
                        </Text>
                    </View>
                )}
            </View>
        )}

        <View className="px-6 py-6">
            <Text className="text-sm font-bold text-gray-900 mb-3">상세 내용 및 공지</Text>
            <View className="bg-gray-50 p-5 rounded-2xl">
                <Text className="text-gray-700 text-[15px] leading-7">
                    {match.description || "등록된 상세 내용이 없습니다."}
                </Text>
            </View>
        </View>

      </ScrollView>

      {/* ✅ 하단 버튼 영역 로직 수정 */}
      <View className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-5 pb-8 shadow-lg z-10">
        {canManage ? (
            <View className="gap-3">
                {match.status === 'recruiting' && (
                    <TouchableOpacity 
                        onPress={() => router.push(`/match/applicants?id=${match.id}` as any)}
                        className="w-full bg-indigo-600 py-4 rounded-xl items-center flex-row justify-center shadow-md shadow-indigo-200"
                    >
                        <FontAwesome5 name="users" size={16} color="white" style={{ marginRight: 8 }} />
                        <Text className="text-white font-bold text-lg">
                            신청자 관리 ({match.applicants?.length || 0})
                        </Text>
                    </TouchableOpacity>
                )}
                
                {/* 매칭되었고 아직 종료되지 않았을 때 */}
                {isMatched && match.status !== 'finished' && (
                    <>
                        {/* 1. 결과가 아직 없을 때 (호스트만 입력 가능) */}
                        {!hasResult && isHost && (
                            <TouchableOpacity 
                                onPress={() => setShowResultModal(true)}
                                className="w-full bg-gray-900 py-4 rounded-xl items-center shadow-lg"
                            >
                                <Text className="text-white font-bold text-lg">경기 결과 입력</Text>
                            </TouchableOpacity>
                        )}

                        {/* 2. 결과가 아직 없는데 게스트인 경우 (대기 안내) */}
                        {!hasResult && isGuest && (
                             <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                                <Text className="text-gray-500 font-bold text-lg">호스트의 결과 입력을 기다리는 중</Text>
                            </View>
                        )}

                        {/* 3. 결과가 있고 승인 대기 중일 때 */}
                        {hasResult && isWaitingApproval && (
                            iAmSubmitter ? (
                                <View className="w-full bg-indigo-100 py-4 rounded-xl items-center flex-row justify-center">
                                    <ActivityIndicator size="small" color="#4F46E5" style={{marginRight: 8}}/>
                                    <Text className="text-indigo-700 font-bold text-lg">상대 팀 승인 대기중</Text>
                                </View>
                            ) : (
                                <TouchableOpacity 
                                    onPress={handleApprove}
                                    disabled={isProcessing}
                                    className="w-full bg-indigo-600 py-4 rounded-xl items-center shadow-lg"
                                >
                                    {isProcessing ? <ActivityIndicator color="white"/> : <Text className="text-white font-bold text-lg">경기 결과 승인하기</Text>}
                                </TouchableOpacity>
                            )
                        )}
                    </>
                )}

                {match.status === 'finished' && (
                    <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                        <Text className="text-gray-500 font-bold text-lg">종료된 경기입니다</Text>
                    </View>
                )}
            </View>
        ) : (
            match.status === 'recruiting' ? (
                iHaveApplied ? (
                    <View className="w-full bg-gray-300 py-4 rounded-xl items-center flex-row justify-center">
                        <FontAwesome5 name="check" size={16} color="white" style={{ marginRight: 8 }} />
                        <Text className="text-white font-bold text-lg">신청 완료 (대기중)</Text>
                    </View>
                ) : (
                    <TouchableOpacity 
                        onPress={() => requireAuth(applyMatch)}
                        disabled={applying}
                        className={`w-full py-4 rounded-xl items-center flex-row justify-center shadow-md shadow-indigo-200 ${applying ? 'bg-indigo-400' : 'bg-indigo-600'}`}
                    >
                        {applying ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <FontAwesome5 name="paper-plane" size={16} color="white" style={{ marginRight: 8 }} />
                                <Text className="text-white font-bold text-lg">매치 신청하기</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )
            ) : (
                <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                    <Text className="text-gray-500 font-bold text-lg">모집이 마감되었습니다</Text>
                </View>
            )
        )}
      </View>

      {/* ✅ 결과 입력 모달 */}
      <Modal visible={showResultModal} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
            <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                <Text className="text-xl font-bold text-gray-900 mb-2 text-center">경기 결과 입력</Text>
                <Text className="text-gray-500 mb-8 text-center text-sm leading-5">
                    승리한 팀을 선택해주세요.{'\n'}상대팀이 승인하면 전적에 반영됩니다.
                </Text>

                <View className="flex-row gap-3 mb-8">
                    {/* HOME 버튼 */}
                    <TouchableOpacity 
                        onPress={() => setSelectedWinner(match.teamId)}
                        className={`flex-1 p-5 rounded-2xl border-2 items-center justify-center ${selectedWinner === match.teamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    >
                        <Text className={`font-black text-lg ${selectedWinner === match.teamId ? 'text-indigo-600' : 'text-gray-400'}`} numberOfLines={1}>{getTeamName()}</Text>
                        <Text className="text-xs text-gray-400 mt-1 font-bold">HOME</Text>
                    </TouchableOpacity>

                    {/* AWAY 버튼 (확정된 상대) */}
                    <TouchableOpacity 
                        onPress={() => setSelectedWinner(confirmedOpponentId!)}
                        disabled={!confirmedOpponentId}
                        className={`flex-1 p-5 rounded-2xl border-2 items-center justify-center ${selectedWinner === confirmedOpponentId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                    >
                        <Text className={`font-black text-lg ${selectedWinner === confirmedOpponentId ? 'text-indigo-600' : 'text-gray-400'}`} numberOfLines={1}>{match.opponentName || "상대팀"}</Text>
                        <Text className="text-xs text-gray-400 mt-1 font-bold">AWAY</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    onPress={handleResultSubmit}
                    disabled={!selectedWinner || isProcessing}
                    className={`w-full py-4 rounded-xl items-center ${!selectedWinner ? 'bg-gray-200' : 'bg-indigo-600'}`}
                >
                    {isProcessing ? <ActivityIndicator color="white" /> : <Text className={`font-bold text-lg ${!selectedWinner ? 'text-gray-400' : 'text-white'}`}>승인 요청하기</Text>}
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