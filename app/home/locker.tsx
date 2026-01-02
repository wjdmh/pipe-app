import React, { useEffect, useState, useMemo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, 
  Modal, FlatList, Linking, TextInput, Platform, RefreshControl, Image, LayoutAnimation, UIManager
} from 'react-native';
import { 
  doc, updateDoc, arrayRemove, arrayUnion, runTransaction, 
  collection, query, onSnapshot, serverTimestamp, getDoc, where,
  deleteField
} from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5, Ionicons } from '@expo/vector-icons'; 
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { shareLink } from '../../utils/share';
import GuestCard from '../../components/GuestCard';
import { useUser } from '../../context/UserContext';
import { useMatchResult } from '../../hooks/useMatchResult';

// 안드로이드에서 LayoutAnimation 활성화
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- [디자인 테마 상수] ---
const THEME = {
    bg: '#F9FAFB',     
    white: '#FFFFFF', 
    primary: '#4F46E5', // Indigo-600
    textMain: '#111827', 
    textSub: '#6B7280',  
    border: '#E5E7EB',
};

// --- [타입 정의] ---
type JoinRequest = { uid: string; name: string; position: string; requestedAt: string; };
type Player = { id: number; uid?: string; name: string; position: string; };
type TeamData = { 
    id: string; 
    name: string; 
    affiliation: string; 
    level: string; 
    stats: { wins: number; losses: number; points: number; total: number; }; 
    roster: Player[]; members: string[]; captainId: string; 
    joinRequests?: JoinRequest[]; 
    description?: string;
};

// MatchData 타입 확장: result 필드 추가 및 상태값 호환성 확보
type MatchData = {
  id: string; 
  teamId: string; 
  guestId?: string; 
  opponentId?: string; 
  team: string;   
  time: string; 
  loc: string; 
  status: 'recruiting' | 'scheduled' | 'waiting_verify' | 'finished' | 'dispute' | 'waiting'; 
  applicants: string[];
  opponentName?: string; 
  winnerId?: string; 
  
  // Hooks 표준 결과 데이터 구조
  result?: {
      hostScore: number;
      guestScore: number;
      status: 'waiting' | 'verified' | 'dispute';
      submitterId: string;
      submittedAt: string;
  };

  // 구버전 데이터 호환용
  pendingResult?: { winnerId: string; submitterId: string; };
  
  isDeleted?: boolean;
  hostContact?: string;
  guestContact?: string;
  teamName?: string; 
};

type MyGuestActivity = {
    id: string; 
    hostTeamName: string;
    matchDate: string;
    location: string;
    status: 'pending' | 'accepted' | 'rejected' | 'recruiting';
    fee: string;
    hostContact?: string;
    isMyPost?: boolean;
    // GuestCard 호환 필드
    time?: string;
    hostCaptainId?: string;
    positions?: string[];
    gender?: 'male' | 'female' | 'mixed';
    targetLevel?: string;
    recruitmentCount?: number;
    applicants?: any[];
};

// --- [헬퍼 함수] ---
const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
        return `${month}.${day} (${dayOfWeek}) ${hours}:${minutes}`;
    } catch(e) { return '-'; }
};

const getDDay = (targetDate: string) => {
    try {
        const today = new Date();
        const target = new Date(targetDate);
        today.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) return '종료';
        if (diff === 0) return 'D-Day';
        return `D-${Math.ceil(diff)}`;
    } catch(e) { return '-'; }
};

export default function LockerScreen() {
  const router = useRouter();
  const { initialTab } = useLocalSearchParams();
  const { showLoginModal } = useUser();
  
  const [viewMode, setViewMode] = useState<'team' | 'guest'>('team');
  const [guestFilter, setGuestFilter] = useState<'all' | 'recruiting' | 'applied'>('all');
  
  const [status, setStatus] = useState<'loading' | 'unauth' | 'hasTeam' | 'noTeam' | 'pending'>('loading');
  
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [guestActivities, setGuestActivities] = useState<MyGuestActivity[]>([]);

  const [selectedMember, setSelectedMember] = useState<Player | null>(null);
  
  // Modals
  const [showMemberAction, setShowMemberAction] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  
  const [editName, setEditName] = useState('');
  const [editIntro, setEditIntro] = useState('');
  const [targetMatch, setTargetMatch] = useState<MatchData | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ [New] 지난 경기 접기/펼치기 상태
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Hooks 연결: 비즈니스 로직 가져오기
  const { submitResult, approveResult: hookApproveResult, isProcessing } = useMatchResult();

  // --- [인증 및 데이터 구독] ---
  useEffect(() => {
      if (initialTab === 'matches') { setViewMode('team'); } 
      else if (initialTab === 'guest') { setViewMode('guest'); }
      
      let unsubTeam: (() => void) | undefined;
      let unsubGuest: (() => void) | undefined;

      const unsubAuth = auth.onAuthStateChanged(async (user) => {
          if (user) {
              try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const userData = userDoc.data();
                const tid = userData?.teamId;
                const appliedTid = userData?.appliedTeamId;

                if (tid) {
                  setMyTeamId(tid || null);
                  unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => {
                      if (d.exists()) {
                          const data = d.data();
                          setTeamData({ id: d.id, ...data } as TeamData);
                          setIsCaptain(data.captainId === user.uid);
                          setEditName(data.name || '');
                          setEditIntro(data.description || '');
                          setStatus('hasTeam');
                      } else {
                          setStatus('noTeam');
                      }
                  });
                } else if (appliedTid) {
                    setStatus('pending');
                } else {
                    setStatus('noTeam');
                }

                // 게스트 데이터 구독
                const fetchGuests = async () => {
                    unsubGuest = onSnapshot(query(collection(db, "guest_posts")), (snap) => {
                        const list: MyGuestActivity[] = [];
                        snap.forEach((doc) => {
                            const data = doc.data();
                            const isHost = data.hostCaptainId === user.uid;
                            // @ts-ignore
                            const isApplicant = data.applicantIds?.includes(user.uid);

                            if (isHost || isApplicant) {
                                const myApp = data.applicants?.find((a: any) => 
                                    typeof a === 'string' ? a === user.uid : a.uid === user.uid
                                );
                                const myStatus = isHost ? 'recruiting' : (typeof myApp === 'object' ? myApp.status : 'pending');

                                list.push({
                                    id: doc.id,
                                    hostTeamName: data.hostTeamName || data.teamName || '팀명 미정',
                                    matchDate: data.matchDate || data.time,
                                    location: data.location || data.loc || '',
                                    status: myStatus, 
                                    fee: data.fee,
                                    isMyPost: isHost,
                                    ...data
                                } as MyGuestActivity);
                            }
                        });
                        list.sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
                        setGuestActivities(list);
                    });
                };
                fetchGuests();

              } catch (e) {
                  console.error(e);
                  setStatus('noTeam');
              }
          } else {
              setStatus('unauth');
              setTeamData(null);
              setMatches([]);
          }
      });

      return () => {
          unsubAuth();
          if (unsubTeam) unsubTeam();
          if (unsubGuest) unsubGuest();
      };
  }, []);

  // --- [매치 데이터 구독] ---
  useEffect(() => {
    if (!myTeamId || status !== 'hasTeam') return;
    const q = query(collection(db, "matches")); 
    const unsub = onSnapshot(q, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.isDeleted) return;
            if (data.teamId === myTeamId || data.guestId === myTeamId || data.applicants?.includes(myTeamId)) {
                // waiting_verify는 구버전 호환, waiting은 신버전
                const mappedStatus = data.status === 'matched' ? 'scheduled' : data.status;
                const safeTeamName = data.teamName || data.team || '팀명 미정';
                list.push({ id: d.id, ...data, team: safeTeamName, status: mappedStatus } as MatchData);
            }
        });
        setMatches(list);
    });
    return () => unsub();
  }, [myTeamId, status]);

  // --- [데이터 분류 (Memo)] ---
  const { upcomingMatch, futureMatches, pastMatches, recruitingMatches, pendingMatches } = useMemo(() => {
      const now = new Date().toISOString();
      const confirmed = matches.filter(m => ['scheduled', 'waiting_verify', 'finished', 'dispute', 'waiting'].includes(m.status));
      const recruiting = matches.filter(m => m.status === 'recruiting'); 

      const future = confirmed.filter(m => m.status !== 'finished' && m.time > now).sort((a, b) => a.time.localeCompare(b.time));
      
      // 종료된 경기나 이미 지난 경기 중, 결과 승인 대기 상태가 아닌 것들
      const past = confirmed.filter(m => 
          m.status === 'finished' || 
          (m.time <= now && m.status !== 'waiting_verify' && m.result?.status !== 'waiting' && m.status !== 'waiting')
      ).sort((a, b) => b.time.localeCompare(a.time));
      
      // 처리 필요한 경기 필터링 강화
      const pending = confirmed.filter(m => 
          (m.status === 'scheduled' && m.time < now && !m.result && !m.pendingResult) || // 시간 지남 + 결과 없음
          (m.status === 'waiting_verify') ||                         // 구버전 대기 상태
          (m.status === 'waiting') ||                                // 신버전 대기 상태
          (m.result?.status === 'waiting')                           // 신버전 결과 대기 상태
      );

      return { 
          upcomingMatch: future.length > 0 ? future[0] : null, 
          futureMatches: future.length > 0 ? future.slice(1) : [], 
          pastMatches: past, 
          recruitingMatches: recruiting.sort((a, b) => a.time.localeCompare(b.time)),
          pendingMatches: pending
      };
  }, [matches]);

  // 게스트 필터링
  const filteredGuests = useMemo(() => {
      if (guestFilter === 'all') return guestActivities;
      if (guestFilter === 'recruiting') return guestActivities.filter(g => g.isMyPost);
      if (guestFilter === 'applied') return guestActivities.filter(g => !g.isMyPost);
      return guestActivities;
  }, [guestActivities, guestFilter]);

  // --- [Handlers] ---
  const onRefresh = () => {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 1000);
  };

  // 지난 경기 더 보기 핸들러 (애니메이션 적용)
  const toggleHistory = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsHistoryExpanded(!isHistoryExpanded);
  };

  const handleInvite = async () => {
      if (!teamData) return;
      await shareLink({
          title: 'PIPE 팀 초대',
          message: `🏐 [PIPE 팀 초대장]\n'${teamData.name}' 팀에서 당신을 초대합니다!`,
          url: `https://pipe-app.vercel.app/team/${teamData.id}`
      });
  };

  const handleUpdateTeam = async () => {
      if(!editName.trim()) return Alert.alert('알림', '팀 이름을 입력해주세요.');
      if(!myTeamId) return;
      try {
          await updateDoc(doc(db, "teams", myTeamId), { name: editName, description: editIntro, updatedAt: new Date().toISOString() });
          Alert.alert('완료', '팀 정보가 수정되었습니다.');
          setEditModalVisible(false);
      } catch(e) { Alert.alert('오류', '수정 실패'); }
  };

  const sendSMS = (phoneNumber?: string) => {
      if (!phoneNumber || phoneNumber.includes("없음") || phoneNumber.includes("실패")) {
          return Alert.alert("알림", "유효한 연락처가 없습니다.");
      }
      Linking.openURL(`sms:${phoneNumber}`);
  };

  const handleKickMember = () => {
      if (!selectedMember || !myTeamId) return;
      Alert.alert(
          "팀원 내보내기",
          `정말 '${selectedMember.name}'님을 팀에서 제외하시겠습니까?`,
          [
              { text: "취소", style: "cancel" },
              {
                  text: "내보내기",
                  style: "destructive",
                  onPress: async () => {
                      try {
                          await runTransaction(db, async (transaction) => {
                              const teamRef = doc(db, "teams", myTeamId);
                              const teamDoc = await transaction.get(teamRef);
                              if (!teamDoc.exists()) throw "팀 데이터 없음";

                              const currentRoster = teamDoc.data().roster as Player[];
                              const newRoster = currentRoster.filter(p => p.uid !== selectedMember.uid);
                              
                              transaction.update(teamRef, {
                                  roster: newRoster,
                                  members: arrayRemove(selectedMember.uid)
                              });

                              if (selectedMember.uid) {
                                  const userRef = doc(db, "users", selectedMember.uid);
                                  transaction.update(userRef, { teamId: null, role: 'guest' });
                              }
                          });
                          Alert.alert("완료", "팀원을 내보냈습니다.");
                          setShowMemberAction(false);
                      } catch (e) {
                          console.error(e);
                          Alert.alert("오류", "작업을 완료하지 못했습니다.");
                      }
                  }
              }
          ]
      );
  };

  const handleTransferCaptain = async () => {
      if (!selectedMember || !selectedMember.uid || !myTeamId) return;
      Alert.alert(
          "주장 위임",
          `'${selectedMember.name}'님에게 주장 권한을 넘기시겠습니까?\n완료 후 본인은 일반 멤버가 됩니다.`,
          [
              { text: "취소", style: "cancel" },
              {
                  text: "위임하기",
                  onPress: async () => {
                      try {
                          await runTransaction(db, async (transaction) => {
                              const teamRef = doc(db, "teams", myTeamId);
                              const oldCapRef = doc(db, "users", auth.currentUser!.uid);
                              const newCapRef = doc(db, "users", selectedMember.uid!);

                              transaction.update(teamRef, { captainId: selectedMember.uid });
                              transaction.update(oldCapRef, { role: 'member' });
                              transaction.update(newCapRef, { role: 'leader' });
                          });
                          Alert.alert("완료", "주장이 변경되었습니다.");
                          setShowMemberAction(false);
                      } catch (e) {
                          Alert.alert("오류", "위임 실패");
                      }
                  }
              }
          ]
      );
  };

  const handleCallMember = async () => {
      if (!selectedMember?.uid) return;
      try {
          const uDoc = await getDoc(doc(db, "users", selectedMember.uid));
          if (uDoc.exists()) {
              const p = uDoc.data().phoneNumber || uDoc.data().phone;
              if (p) Linking.openURL(`tel:${p}`);
              else Alert.alert("알림", "연락처 정보가 없습니다.");
          }
      } catch (e) { Alert.alert("오류", "정보 조회 실패"); }
  };

  const handleApproveRequest = async (req: JoinRequest) => {
      if (!myTeamId) return;
      try {
          await runTransaction(db, async (transaction) => {
              const teamRef = doc(db, "teams", myTeamId);
              const userRef = doc(db, "users", req.uid);
              const teamDoc = await transaction.get(teamRef);
              if (!teamDoc.exists()) throw "팀 오류";
              
              const newPlayer = {
                  id: Date.now(),
                  uid: req.uid,
                  name: req.name,
                  position: req.position
              };

              transaction.update(teamRef, {
                  roster: arrayUnion(newPlayer),
                  members: arrayUnion(req.uid),
                  joinRequests: arrayRemove(req)
              });
              transaction.update(userRef, {
                  teamId: myTeamId,
                  role: 'member',
                  appliedTeamId: null
              });
          });
          Alert.alert("승인 완료", `${req.name}님이 팀에 합류했습니다!`);
      } catch (e) {
          Alert.alert("오류", "승인 처리 실패");
      }
  };

  // 결과 제출 로직 (Hooks 사용으로 통합)
  const handleProposeResult = async () => {
      if (!targetMatch || !selectedWinner || !myTeamId) return;

      // 1. 호스트 권한 체크 (보안 강화)
      if (targetMatch.teamId !== myTeamId) {
          Alert.alert("권한 오류", "경기 결과 입력은 호스트(HOME)만 가능합니다.");
          setResultModalVisible(false);
          return;
      }

      // 2. 점수 자동 할당: 승리팀에 따라 3:0 또는 0:3
      const isMyWin = selectedWinner === myTeamId;
      const myScore = isMyWin ? 3 : 0;
      const opScore = isMyWin ? 0 : 3;

      // Hooks 호환성을 위한 데이터 매핑
      const matchDataForHook = {
          ...targetMatch,
          hostId: targetMatch.teamId, 
          guestId: targetMatch.guestId || targetMatch.opponentId 
      };

      const success = await submitResult(
          targetMatch.id, 
          myScore, 
          opScore, 
          myTeamId, 
          matchDataForHook
      );

      if (success) {
          setResultModalVisible(false);
          setMatchModalVisible(false);
      }
  };

  // 결과 승인 로직 (Hooks 사용으로 통합)
  const handleApproveResult = async (match: MatchData) => {
      if (!myTeamId) return;

      // Hooks 호환성 데이터 매핑
      const matchDataForHook = {
          ...match, // match에 이미 id가 포함되어 있음
          result: match.pendingResult || match.result 
      };

      await hookApproveResult(matchDataForHook, myTeamId);
      setMatchModalVisible(false);
  };

  if (status === 'loading') {
      return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  if (status === 'unauth') {
      return (
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
            <View className="flex-1 justify-center items-center px-8 pb-20">
                <View className="bg-indigo-50 p-6 rounded-full mb-6 animate-pulse">
                    <Ionicons name="shield-checkmark" size={64} color={THEME.primary} />
                </View>
                <Text className="text-2xl font-extrabold text-gray-900 text-center mb-3">
                    로그인하고{'\n'}팀 활동을 시작해보세요!
                </Text>
                <Text className="text-gray-500 text-center mb-10 leading-6">
                    내 팀을 만들어 매치를 잡거나,{'\n'}용병으로 경기에 참여할 수 있습니다.
                </Text>
                <TouchableOpacity 
                    onPress={showLoginModal}
                    className="w-full bg-indigo-600 py-4 rounded-2xl shadow-lg shadow-indigo-200 active:bg-indigo-700"
                >
                    <Text className="text-white font-bold text-center text-lg">지금 바로 로그인하기</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
      );
  }

  const stats = teamData?.stats || { wins: 0, losses: 0, points: 0, total: 0 };
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) + '%' : '0%';

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
         <View className="bg-white px-5 pt-2 pb-4 mb-2">
             <View className="flex-row justify-between items-center mb-5">
                 <Text className="text-2xl font-extrabold text-gray-900 tracking-tight">
                     {viewMode === 'team' ? (teamData?.name || 'Locker Room') : 'Guest Locker'}
                 </Text>
                 <View className="flex-row bg-gray-100 p-1 rounded-xl">
                    <TouchableOpacity onPress={() => setViewMode('team')} className={`px-4 py-1.5 rounded-lg ${viewMode === 'team' ? 'bg-white shadow-sm' : ''}`}>
                        <Text className={`text-xs font-bold ${viewMode === 'team' ? 'text-gray-900' : 'text-gray-400'}`}>내 팀</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setViewMode('guest')} className={`px-4 py-1.5 rounded-lg ${viewMode === 'guest' ? 'bg-white shadow-sm' : ''}`}>
                        <Text className={`text-xs font-bold ${viewMode === 'guest' ? 'text-gray-900' : 'text-gray-400'}`}>게스트</Text>
                    </TouchableOpacity>
                 </View>
             </View>

             {viewMode === 'team' && (
                 status === 'noTeam' || status === 'pending' ? (
                     <View className="py-10 items-center">
                         <View className="bg-gray-100 p-4 rounded-full mb-4"><FontAwesome5 name="users" size={32} color="#9CA3AF" /></View>
                         <Text className="text-lg font-bold text-gray-900 mb-2">{status === 'pending' ? '가입 승인 대기 중 ⏳' : '아직 소속된 팀이 없습니다'}</Text>
                         <Text className="text-gray-400 text-center mb-6 text-xs">팀을 만들거나 가입하여{'\n'}본격적인 활동을 시작해보세요.</Text>
                         {status === 'noTeam' && (
                             <TouchableOpacity onPress={() => router.push('/team/register')} className="bg-indigo-600 px-6 py-3 rounded-xl shadow-sm">
                                 <Text className="text-white font-bold">팀 찾기 / 만들기</Text>
                             </TouchableOpacity>
                         )}
                     </View>
                 ) : (
                     <View>
                        {upcomingMatch ? (
                            <TouchableOpacity 
                                onPress={() => isCaptain && router.push(`/match/${upcomingMatch.id}` as any)}
                                activeOpacity={0.9}
                                className="bg-indigo-600 rounded-[24px] p-5 shadow-lg shadow-indigo-200 mb-6 overflow-hidden relative"
                            >
                                <View className="absolute -top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full" />
                                
                                <View className="flex-row justify-between items-start mb-4">
                                    <View className="bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                                        <Text className="text-white font-bold text-xs">NEXT MATCH</Text>
                                    </View>
                                    <View className="bg-white px-2 py-1 rounded-lg">
                                        <Text className="text-indigo-600 font-extrabold text-xs">{getDDay(upcomingMatch.time)}</Text>
                                    </View>
                                </View>

                                <View className="flex-row items-center justify-between mb-5 px-2">
                                    <View className="items-center flex-1">
                                        <Text className="text-white font-bold text-lg text-center" numberOfLines={1}>
                                            {upcomingMatch.teamName || '우리팀'}
                                        </Text>
                                    </View>
                                    <Text className="text-white/80 font-black text-xl mx-2">VS</Text>
                                    <View className="items-center flex-1">
                                        <Text className="text-white font-bold text-lg text-center" numberOfLines={1}>
                                            {upcomingMatch.opponentName || '상대팀'}
                                        </Text>
                                    </View>
                                </View>

                                <View className="flex-row items-center bg-indigo-800/50 p-3 rounded-xl backdrop-blur-sm">
                                    <Ionicons name="time" size={14} color="white" style={{marginRight:6}} />
                                    <Text className="text-white text-xs font-bold mr-3">{formatTime(upcomingMatch.time)}</Text>
                                    <View className="w-[1px] h-3 bg-white/30 mr-3" />
                                    <Ionicons name="location" size={14} color="white" style={{marginRight:6}} />
                                    <Text className="text-white text-xs font-bold truncate flex-1" numberOfLines={1}>{upcomingMatch.loc}</Text>
                                </View>
                            </TouchableOpacity>
                        ) : (
                            <View className="bg-gray-100 rounded-2xl p-6 items-center justify-center mb-6 border border-gray-200">
                                <Text className="text-gray-400 font-bold">예정된 경기가 없습니다 😴</Text>
                            </View>
                        )}

                        <View className="flex-row bg-white border border-gray-100 rounded-2xl p-4 justify-around items-center mb-6 shadow-sm">
                            <View className="items-center">
                                <Text className="text-gray-400 text-[10px] font-bold mb-1">시즌 승률</Text>
                                <Text className="text-gray-900 text-lg font-black">{winRate}</Text>
                            </View>
                            <View className="w-[1px] h-8 bg-gray-100" />
                            <View className="items-center">
                                <Text className="text-gray-400 text-[10px] font-bold mb-1">승점</Text>
                                <Text className="text-indigo-600 text-lg font-black">{stats.points}P</Text>
                            </View>
                            <View className="w-[1px] h-8 bg-gray-100" />
                            <View className="items-center">
                                <Text className="text-gray-400 text-[10px] font-bold mb-1">전적</Text>
                                <Text className="text-gray-900 text-base font-bold">{stats.wins}승 {stats.losses}패</Text>
                            </View>
                        </View>

                        {isCaptain && (
                            <View className="mb-8">
                                <Text className="text-gray-900 font-bold text-base mb-3 ml-1">운영진 메뉴</Text>
                                <View className="flex-row flex-wrap justify-between gap-y-3">
                                    {[
                                        { label: '정보 수정', icon: 'create-outline', action: () => setEditModalVisible(true), color: '#4B5563' },
                                        { label: '멤버 관리', icon: 'people-outline', action: () => router.push('/home/locker?initialTab=member' as any), color: '#4B5563' }, 
                                        { label: '매치 관리', icon: 'trophy-outline', action: () => setMatchModalVisible(true), color: '#F59E0B', badge: pendingMatches.length > 0 },
                                        { label: '팀원 초대', icon: 'share-social-outline', action: handleInvite, color: '#4F46E5' },
                                    ].map((item, idx) => (
                                        <TouchableOpacity 
                                            key={idx} 
                                            onPress={item.action} 
                                            className="w-[23%] bg-white p-3 rounded-2xl items-center border border-gray-100 shadow-sm"
                                        >
                                            <View className="w-10 h-10 bg-gray-50 rounded-full items-center justify-center mb-2 relative">
                                                <Ionicons name={item.icon as any} size={20} color={item.color} />
                                                {item.badge && <View className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />}
                                            </View>
                                            <Text className="text-[10px] font-bold text-gray-600">{item.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Text className="text-gray-900 font-bold text-base mb-3 ml-1">매치 일정</Text>
                        <View className="pl-2">
                            <View className="absolute top-2 left-[19px] bottom-0 w-[2px] bg-gray-200" />
                            
                            {/* 모집중 / 예정된 경기 (항상 보임) */}
                            {[...recruitingMatches, ...futureMatches].map((m, i) => (
                                <View key={m.id} className="flex-row mb-6 relative">
                                    <View className="z-10 bg-indigo-100 w-3 h-3 rounded-full mt-1.5 ml-[14px] border-2 border-white mr-4" />
                                    <TouchableOpacity 
                                        onPress={() => isCaptain && router.push(`/match/${m.id}` as any)}
                                        className="flex-1 bg-white p-4 rounded-xl border border-gray-100 shadow-sm"
                                    >
                                        <View className="flex-row justify-between mb-2">
                                            <Text className="text-indigo-600 font-bold text-xs">
                                                {m.status === 'recruiting' ? '모집중' : '예정됨'}
                                            </Text>
                                            <Text className="text-gray-400 text-xs">{formatTime(m.time)}</Text>
                                        </View>
                                        <Text className="text-gray-900 font-bold text-base">
                                            vs {m.teamId === myTeamId ? (m.opponentName || '상대 미정') : (m.teamName || 'Host')}
                                        </Text>
                                        <Text className="text-gray-500 text-xs mt-1">{m.loc}</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                            
                            {/* ✅ [수정] 지난 경기: 3개만 보여주고 나머지는 '더 보기'로 처리 */}
                            {(isHistoryExpanded ? pastMatches : pastMatches.slice(0, 3)).map((m, i) => (
                                <View key={m.id} className="flex-row mb-6 relative opacity-60">
                                    <View className="z-10 bg-gray-300 w-3 h-3 rounded-full mt-1.5 ml-[14px] border-2 border-white mr-4" />
                                    <View className="flex-1 bg-white p-4 rounded-xl border border-gray-100">
                                        <View className="flex-row justify-between mb-2">
                                            <Text className="text-gray-500 font-bold text-xs">종료</Text>
                                            <Text className="text-gray-400 text-xs">{formatTime(m.time)}</Text>
                                        </View>
                                        <Text className="text-gray-700 font-bold text-base">
                                            vs {m.teamId === myTeamId ? (m.opponentName || '상대팀') : (m.teamName || 'Host')}
                                        </Text>
                                        <View className="mt-2 bg-gray-100 self-start px-2 py-1 rounded">
                                            <Text className="text-[10px] text-gray-500">
                                                {m.winnerId ? (m.winnerId === myTeamId ? 'WIN 🏆' : 'LOSE') : '결과 미입력'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ))}

                            {/* ✅ [New] 더 보기 버튼 (3개 초과일 때만 노출) */}
                            {pastMatches.length > 3 && (
                                <View className="flex-row relative mb-6">
                                     <View className="z-10 bg-gray-200 w-2 h-2 rounded-full mt-2 ml-[16px] border border-white mr-5" />
                                     <TouchableOpacity 
                                        onPress={toggleHistory}
                                        className="flex-1 bg-gray-100 py-3 rounded-xl flex-row items-center justify-center active:bg-gray-200"
                                     >
                                         <Text className="text-gray-500 font-bold text-xs mr-2">
                                             {isHistoryExpanded ? '접기' : `지난 경기 더 보기 (+${pastMatches.length - 3})`}
                                         </Text>
                                         <FontAwesome5 
                                            name={isHistoryExpanded ? "chevron-up" : "chevron-down"} 
                                            size={10} 
                                            color="#6B7280" 
                                         />
                                     </TouchableOpacity>
                                </View>
                            )}
                        </View>
                     </View>
                 )
             )}

             {viewMode === 'guest' && (
                 <View>
                     <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-4">
                        {[
                            { id: 'all', label: '전체' }, 
                            { id: 'recruiting', label: '내가 모집중' }, 
                            { id: 'applied', label: '신청한 내역' }
                        ].map((chip) => (
                            <TouchableOpacity 
                                key={chip.id} 
                                onPress={() => setGuestFilter(chip.id as any)}
                                className={`px-4 py-2 rounded-full mr-2 border ${guestFilter === chip.id ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`text-xs font-bold ${guestFilter === chip.id ? 'text-white' : 'text-gray-500'}`}>{chip.label}</Text>
                            </TouchableOpacity>
                        ))}
                     </ScrollView>

                     {filteredGuests.length === 0 ? (
                        <View className="items-center justify-center py-20 bg-white rounded-2xl border border-gray-100">
                            <Text className="text-gray-400 font-bold mb-4">내역이 없습니다.</Text>
                            <TouchableOpacity onPress={() => router.push('/guest/list')} className="bg-indigo-50 px-5 py-2.5 rounded-lg">
                                <Text className="text-indigo-600 font-bold text-xs">게스트 모집 보러가기</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        filteredGuests.map((activity) => (
                            <View key={activity.id} className="mb-3">
                                <GuestCard 
                                    item={activity as any} 
                                    onPress={() => router.push(`/guest/${activity.id}` as any)} 
                                    variant="simple" 
                                />
                            </View>
                        ))
                    )}
                 </View>
             )}
         </View>
      </ScrollView>

      <Modal visible={editModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center"><Text className="font-bold text-lg">팀 정보 수정</Text><TouchableOpacity onPress={() => setEditModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity></View>
            <View className="p-5">
                <Text className="text-sm font-bold text-gray-500 mb-1">팀 이름</Text><TextInput className="bg-gray-50 p-4 rounded-xl mb-4 text-lg" value={editName} onChangeText={setEditName} />
                <Text className="text-sm font-bold text-gray-500 mb-1">팀 소개</Text><TextInput className="bg-gray-50 p-4 rounded-xl mb-6 min-h-[120px]" multiline textAlignVertical="top" value={editIntro} onChangeText={setEditIntro} />
                <TouchableOpacity onPress={handleUpdateTeam} className="bg-indigo-600 p-4 rounded-xl items-center"><Text className="text-white font-bold">저장하기</Text></TouchableOpacity>
            </View>
        </SafeAreaView>
      </Modal>

      {/* 매치 관리 모달 */}
      <Modal visible={matchModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
                <Text className="font-bold text-lg">매치 관리 센터</Text>
                <TouchableOpacity onPress={() => setMatchModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity>
            </View>
            <ScrollView className="p-5">
                {pendingMatches.length > 0 && (
                    <View className="mb-6">
                        <Text className="font-bold text-red-500 mb-2">🚨 처리 필요한 결과</Text>
                        {pendingMatches.map(m => {
                            const isHost = m.teamId === myTeamId;
                            const hasResult = m.status === 'waiting' || m.status === 'waiting_verify' || m.result?.status === 'waiting';

                            const resultData = m.result || m.pendingResult;
                            const iAmSubmitter = resultData?.submitterId === myTeamId;

                            return (
                                <View key={m.id} className="bg-red-50 border border-red-100 p-4 rounded-xl mb-2 flex-row justify-between items-center">
                                    <View className="flex-1 mr-2">
                                        <Text className="font-bold text-gray-900 truncate">{m.teamName || '우리팀'} vs {m.opponentName || '상대팀'}</Text>
                                        <Text className="text-xs text-gray-500 mt-1">
                                            {hasResult ? '결과 승인 대기중' : '결과 미입력'}
                                        </Text>
                                    </View>

                                    {hasResult ? (
                                        iAmSubmitter ? (
                                            <View className="bg-gray-200 px-3 py-2 rounded-lg">
                                                <Text className="text-gray-500 font-bold text-xs">승인 대기중</Text>
                                            </View>
                                        ) : (
                                            <TouchableOpacity 
                                                onPress={() => handleApproveResult(m)} 
                                                disabled={isProcessing}
                                                className="bg-blue-600 px-3 py-2 rounded-lg"
                                            >
                                                {isProcessing ? <ActivityIndicator size="small" color="white"/> : <Text className="text-white font-bold text-xs">결과 승인</Text>}
                                            </TouchableOpacity>
                                        )
                                    ) : (
                                        isHost ? (
                                            <TouchableOpacity onPress={() => { setTargetMatch(m); setResultModalVisible(true); }} className="bg-red-500 px-3 py-2 rounded-lg">
                                                <Text className="text-white font-bold text-xs">결과 입력</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View className="bg-gray-200 px-3 py-2 rounded-lg">
                                                <Text className="text-gray-500 font-bold text-xs">호스트 입력 대기</Text>
                                            </View>
                                        )
                                    )}
                                </View>
                            );
                        })}
                    </View>
                )}
                <TouchableOpacity className="bg-indigo-600 w-full py-4 rounded-xl items-center mb-6" onPress={() => { setMatchModalVisible(false); router.push('/match/write'); }}>
                    <Text className="text-white font-bold">새 매치 생성하기</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 결과 입력 모달 */}
      <Modal visible={resultModalVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-2xl p-6">
                  <Text className="text-xl font-bold text-center mb-2">경기 결과 입력</Text>
                  <Text className="text-center text-gray-500 text-xs mb-6">
                      승리한 팀을 선택해주세요.{'\n'}자동으로 3:0 점수로 기록되며 상대팀 승인 후 반영됩니다.
                  </Text>
                  
                  <View className="flex-row gap-3 mb-6">
                      <TouchableOpacity 
                          onPress={() => setSelectedWinner(myTeamId)} 
                          className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === myTeamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}
                      >
                          <Text className={`font-black text-lg ${selectedWinner === myTeamId ? 'text-indigo-600' : 'text-gray-500'}`} numberOfLines={1}>
                              {teamData?.name || 'HOME'}
                          </Text>
                          <Text className="text-xs font-bold text-indigo-600 mt-1">HOME (승)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                          onPress={() => setSelectedWinner(targetMatch?.guestId || targetMatch?.opponentId || null)} 
                          className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner && selectedWinner !== myTeamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}
                      >
                          <Text className={`font-black text-lg ${selectedWinner && selectedWinner !== myTeamId ? 'text-indigo-600' : 'text-gray-500'}`} numberOfLines={1}>
                              {targetMatch?.opponentName || 'AWAY'}
                          </Text>
                          <Text className="text-xs font-bold text-gray-400 mt-1">AWAY (승)</Text>
                      </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={handleProposeResult} disabled={!selectedWinner || isProcessing} className={`w-full py-4 rounded-xl items-center ${selectedWinner ? 'bg-indigo-600' : 'bg-gray-300'}`}><Text className="text-white font-bold">결과 제출</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setResultModalVisible(false)} className="mt-4 items-center"><Text className="text-gray-400 font-bold">취소</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showMemberAction} transparent animationType="fade">
          <TouchableOpacity activeOpacity={1} onPress={() => setShowMemberAction(false)} className="flex-1 bg-black/40 justify-end">
              <View className="bg-white rounded-t-[30px] p-6 pb-10">
                  <View className="items-center mb-8">
                      <View className="w-10 h-1 bg-gray-200 rounded-full mb-4" />
                      <Text className="text-xl font-bold text-gray-900">{selectedMember?.name}</Text>
                      <Text className="text-sm text-gray-500">{selectedMember?.position} · Member</Text>
                  </View>
                  <TouchableOpacity onPress={handleCallMember} className="bg-gray-50 p-4 rounded-2xl flex-row items-center mb-3">
                      <FontAwesome5 name="phone-alt" size={18} color="#4B5563" className="mr-3" />
                      <Text className="text-base font-bold text-gray-700">전화 걸기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowMemberAction(false); setTimeout(() => handleTransferCaptain(), 300); }} className="bg-gray-50 p-4 rounded-2xl flex-row items-center mb-3">
                      <FontAwesome5 name="crown" size={16} color="#4B5563" className="mr-3" />
                      <Text className="text-base font-bold text-gray-700">주장 위임하기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleKickMember} className="bg-red-50 p-4 rounded-2xl flex-row items-center">
                      <FontAwesome5 name="sign-out-alt" size={18} color="#EF4444" className="mr-3" />
                      <Text className="text-base font-bold text-red-500">팀에서 내보내기</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      </Modal>

      <Modal visible={showRequestModal} animationType="slide" presentationStyle="pageSheet">
         <View className="flex-1 bg-white p-6">
            <View className="flex-row justify-between items-center mb-6 mt-4">
                <Text className="text-2xl font-extrabold text-gray-900">가입 요청</Text>
                <TouchableOpacity onPress={() => setShowRequestModal(false)} className="p-2"><FontAwesome5 name="times" size={20} color="#9CA3AF" /></TouchableOpacity>
            </View>
            <FlatList 
                data={teamData?.joinRequests || []}
                keyExtractor={item => item.uid}
                renderItem={({item}) => (
                    <View className="bg-white border border-gray-100 p-5 rounded-2xl mb-4 shadow-sm">
                        <View className="flex-row justify-between mb-4">
                            <View><Text className="font-bold text-lg text-gray-900 mb-1">{item.name}</Text><Text className="text-sm text-gray-500">희망 포지션: <Text className="font-bold text-blue-600">{item.position}</Text></Text></View>
                            <Text className="text-xs text-gray-400">{item.requestedAt.split('T')[0]}</Text>
                        </View>
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={() => handleApproveRequest(item)} className="flex-1 bg-blue-600 py-3.5 rounded-xl items-center shadow-sm shadow-blue-200"><Text className="text-white font-bold">승인</Text></TouchableOpacity>
                            <TouchableOpacity className="flex-1 bg-gray-100 py-3.5 rounded-xl items-center"><Text className="text-gray-600 font-bold">거절</Text></TouchableOpacity>
                        </View>
                    </View>
                )}
                ListEmptyComponent={<Text className="text-center text-gray-400 mt-20">대기 중인 요청이 없습니다.</Text>}
            />
         </View>
      </Modal>
    </SafeAreaView>
  );
}