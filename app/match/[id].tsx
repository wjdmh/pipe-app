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
    deleteDoc,
    arrayUnion,
    addDoc,
    collection
} from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../../context/UserContext';
import { shareLink } from '../../utils/share';
import { useMatchResult } from '../../hooks/useMatchResult';
import { sendPushNotification } from '../../utils/notificationHelper';

// 타입 정의
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
  // waiting, waiting_verify 상태 추가
  status: 'recruiting' | 'scheduled' | 'finished' | 'matched' | 'waiting' | 'waiting_verify';
  
  applicants?: string[]; 
  opponentId?: string;   
  guestId?: string;      
  opponentName?: string; 
  
  hostContact?: string;
  guestContact?: string;

  winnerId?: string;
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
  const [deleting, setDeleting] = useState(false);
  
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  
  // Hooks 연결
  const { submitResult, approveResult, isProcessing } = useMatchResult();

  useEffect(() => {
    if (matchId) fetchMatchInfo();
  }, [matchId, isProcessing]);

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

  // ✅ [New] 매치 삭제 핸들러 (지원자 알림 포함)
  const handleDeleteMatch = async () => {
    if (!match || deleting) return;

    // 1. 지원자 확인
    const hasApplicants = match.applicants && match.applicants.length > 0;
    
    const executeDelete = async () => {
        setDeleting(true);
        try {
            // 지원자가 있다면 알림 발송
            if (hasApplicants) {
                for (const applicantTeamId of match.applicants!) {
                    // 팀장 정보 가져오기
                    const teamSnap = await getDoc(doc(db, "teams", applicantTeamId));
                    if (teamSnap.exists()) {
                        const captainId = teamSnap.data().captainId;
                        if (captainId) {
                            // DB 알림
                            await addDoc(collection(db, "notifications"), {
                                userId: captainId,
                                type: 'match_cancel',
                                title: '매치 모집 취소 😥',
                                message: `'${match.teamName}' 팀과의 매치 모집이 취소되었습니다.`,
                                link: '/home/locker',
                                createdAt: new Date().toISOString(),
                                isRead: false
                            });
                            // 푸시 알림
                            const userSnap = await getDoc(doc(db, "users", captainId));
                            if (userSnap.exists() && userSnap.data().pushToken) {
                                await sendPushNotification(
                                    userSnap.data().pushToken,
                                    '매치 모집 취소',
                                    '신청하신 매치 모집이 취소되었습니다.',
                                    { link: '/home/locker' }
                                );
                            }
                        }
                    }
                }
            }

            // 매치 삭제
            await deleteDoc(doc(db, "matches", match.id));
            Alert.alert("삭제 완료", "매치 모집이 삭제되었습니다.");
            router.replace('/home/locker');

        } catch (e) {
            console.error("Delete Error:", e);
            Alert.alert("오류", "삭제 중 문제가 발생했습니다.");
            setDeleting(false);
        }
    };

    if (hasApplicants) {
        Alert.alert(
            "삭제 확인",
            "현재 대기 중인 지원자가 있습니다.\n삭제 시 지원자들에게 취소 알림이 전송됩니다.\n정말 삭제하시겠습니까?",
            [
                { text: "취소", style: "cancel" },
                { text: "삭제하기", style: "destructive", onPress: executeDelete }
            ]
        );
    } else {
        Alert.alert(
            "삭제 확인",
            "정말 이 매치 모집을 삭제하시겠습니까?",
            [
                { text: "취소", style: "cancel" },
                { text: "삭제", style: "destructive", onPress: executeDelete }
            ]
        );
    }
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

  // 결과 제출 핸들러
  const handleResultSubmit = async () => {
    if (!selectedWinner || !match || !user?.teamId) return;

    if (user.teamId !== match.teamId) {
        Alert.alert("권한 없음", "경기 결과 입력은 호스트(홈팀)만 가능합니다.");
        setShowResultModal(false); 
        return;
    }

    const isMyWin = selectedWinner === match.teamId;
    const myScore = isMyWin ? 3 : 0;
    const opScore = isMyWin ? 0 : 3;

    const matchDataForHook = {
        ...match,
        hostId: match.teamId, 
        guestId: match.opponentId || match.guestId
    };

    const success = await submitResult(match.id, myScore, opScore, user.teamId, matchDataForHook);
    
    if (success) {
        setShowResultModal(false);
        fetchMatchInfo(); 
    }
  };

  // 결과 승인 핸들러
  const handleApprove = async () => {
      if (!match || !user?.teamId) return;
      
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

  // 권한 및 상태 변수
  const isWriter = user?.uid === match.writerId;
  const isHost = user?.teamId === match.teamId; 
  const confirmedOpponentId = match.guestId || match.opponentId;
  const isGuest = user?.teamId === confirmedOpponentId; 
  
  const canManage = isHost || isWriter || user?.role === 'admin';
  const isMatched = match.status === 'scheduled' || match.status === 'matched' || match.status === 'waiting' || match.status === 'waiting_verify';
  const iHaveApplied = user?.teamId ? match.applicants?.includes(user.teamId) : false;

  const hasResult = !!match.result || match.status === 'waiting' || match.status === 'waiting_verify';
  const isWaitingApproval = match.result?.status === 'waiting' || match.status === 'waiting' || match.status === 'waiting_verify';
  const resultSubmitterId = match.result?.submitterId;
  const iAmSubmitter = resultSubmitterId === user?.teamId;

  const statusBadge = {
      recruiting: { text: '모집중', color: 'text-blue-600', bg: 'bg-blue-50', icon: 'bullhorn' },
      matched: { text: '매칭 확정', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'handshake' }, 
      scheduled: { text: '경기 예정', color: 'text-green-600', bg: 'bg-green-50', icon: 'calendar-check' },
      waiting: { text: '승인 대기', color: 'text-orange-600', bg: 'bg-orange-50', icon: 'hourglass-half' },
      waiting_verify: { text: '승인 대기', color: 'text-orange-600', bg: 'bg-orange-50', icon: 'hourglass-half' },
      finished: { text: '종료됨', color: 'text-gray-500', bg: 'bg-gray-100', icon: 'flag-checkered' }
  }[match.status] || { text: '상태 미정', color: 'text-gray-500', bg: 'bg-gray-100', icon: 'question' };

  let targetTeamName = "";
  let targetContact = "";
  
  if (isMatched || match.status === 'finished') {
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

        {(isMatched || match.status === 'finished') && (isHost || isGuest) && (
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

        {(isMatched || match.status === 'finished') && (match.opponentName || match.guestId) && (
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

                {match.status === 'finished' && (
                    <View className="mt-4 flex-row items-center justify-center p-3 bg-gray-900 rounded-xl gap-2">
                        <FontAwesome5 name="trophy" size={14} color="#FBBF24" />
                        <Text className="text-white font-bold">
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

      {/* ✅ 하단 버튼 영역 */}
      <View className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-5 pb-8 shadow-lg z-10">
        {canManage ? (
            <View className="gap-3">
                {/* 1. 모집중 상태: 신청자 관리 / 수정 / 삭제 */}
                {match.status === 'recruiting' && (
                    <>
                        <TouchableOpacity 
                            onPress={() => router.push(`/match/applicants?id=${match.id}` as any)}
                            className="w-full bg-indigo-600 py-4 rounded-xl items-center flex-row justify-center shadow-md shadow-indigo-200"
                        >
                            <FontAwesome5 name="users" size={16} color="white" style={{ marginRight: 8 }} />
                            <Text className="text-white font-bold text-lg">
                                신청자 관리 ({match.applicants?.length || 0})
                            </Text>
                        </TouchableOpacity>
                        
                        <View className="flex-row gap-3">
                            <TouchableOpacity 
                                onPress={() => router.push(`/match/edit?id=${match.id}` as any)}
                                className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
                            >
                                <Text className="text-gray-600 font-bold">수정</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={handleDeleteMatch}
                                className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
                            >
                                <Text className="text-red-500 font-bold">삭제</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
                
                {/* 2. 매칭된 상태 (결과 처리) */}
                {isMatched && match.status !== 'finished' && (
                    <>
                        {!hasResult && isHost && (
                            <TouchableOpacity 
                                onPress={() => setShowResultModal(true)}
                                className="w-full bg-gray-900 py-4 rounded-xl items-center shadow-lg"
                            >
                                <Text className="text-white font-bold text-lg">경기 결과 입력</Text>
                            </TouchableOpacity>
                        )}

                        {!hasResult && isGuest && (
                             <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                                <Text className="text-gray-500 font-bold text-lg">호스트의 입력을 기다리는 중</Text>
                            </View>
                        )}

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

                {/* 3. 종료된 상태 */}
                {match.status === 'finished' && (
                    <View className="w-full bg-gray-200 py-4 rounded-xl items-center">
                        <Text className="text-gray-500 font-bold text-lg">종료된 경기입니다</Text>
                    </View>
                )}
            </View>
        ) : (
            // 게스트/일반 유저 뷰
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

      {/* 결과 입력 모달 */}
      {isHost && (
        <Modal visible={showResultModal} transparent animationType="fade">
            <View className="flex-1 bg-black/60 justify-center items-center p-6">
                <View className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
                    <Text className="text-xl font-bold text-gray-900 mb-2 text-center">경기 결과 입력</Text>
                    <Text className="text-gray-500 mb-8 text-center text-sm leading-5">
                        승리한 팀을 선택해주세요.{'\n'}상대팀이 승인하면 전적에 반영됩니다.
                    </Text>

                    <View className="flex-row gap-3 mb-8">
                        <TouchableOpacity 
                            onPress={() => setSelectedWinner(match.teamId)}
                            className={`flex-1 p-5 rounded-2xl border-2 items-center justify-center ${selectedWinner === match.teamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                        >
                            <Text className={`font-black text-lg ${selectedWinner === match.teamId ? 'text-indigo-600' : 'text-gray-400'}`} numberOfLines={1}>
                                {match.teamName || "HOME"}
                            </Text>
                            <Text className="text-xs text-gray-400 mt-1 font-bold">HOME (승)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={() => setSelectedWinner(confirmedOpponentId!)}
                            disabled={!confirmedOpponentId}
                            className={`flex-1 p-5 rounded-2xl border-2 items-center justify-center ${selectedWinner === confirmedOpponentId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 bg-white'}`}
                        >
                            <Text className={`font-black text-lg ${selectedWinner === confirmedOpponentId ? 'text-indigo-600' : 'text-gray-400'}`} numberOfLines={1}>
                                {match.opponentName || "AWAY"}
                            </Text>
                            <Text className="text-xs text-gray-400 mt-1 font-bold">AWAY (승)</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        onPress={handleResultSubmit}
                        disabled={!selectedWinner || isProcessing}
                        className={`w-full py-4 rounded-xl items-center ${!selectedWinner ? 'bg-gray-200' : 'bg-indigo-600'}`}
                    >
                        {isProcessing ? <ActivityIndicator color="white" /> : <Text className={`font-bold text-lg ${!selectedWinner ? 'text-gray-400' : 'text-white'}`}>결과 제출하기</Text>}
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
      )}

    </SafeAreaView>
  );
}