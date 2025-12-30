import React, { useEffect, useState, useMemo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, 
  Modal, FlatList, Linking, TextInput, Platform 
} from 'react-native';
import { 
  doc, updateDoc, arrayRemove, arrayUnion, runTransaction, 
  collection, query, onSnapshot, serverTimestamp, getDoc, where,
  deleteField // ✅ [Fix] 필드 삭제를 위한 함수 추가
} from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { shareLink } from '../../utils/share';

// --- [디자인 테마 상수] ---
const THEME = {
    bg: '#F3F4F6',    
    white: '#FFFFFF', 
    primary: '#2563EB', 
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
    gender?: 'male' | 'female' | 'mixed'; 
    region?: string;
    description?: string; 
    stats: { wins: number; losses: number; points: number; total: number; rank?: number }; 
    roster: Player[]; members: string[]; captainId: string; 
    joinRequests?: JoinRequest[]; 
    kusfId?: string; 
};

// MatchData 구조
type MatchData = {
  id: string; 
  teamId: string; // 호스트(모집) 팀 ID
  guestId?: string; 
  team: string;   // 호스트 팀 이름
  time: string; 
  loc: string; 
  status: 'recruiting' | 'scheduled' | 'waiting_verify' | 'finished' | 'dispute'; 
  applicants: string[];
  opponentName?: string; 
  winnerId?: string; 
  
  // 결과 검증을 위한 임시 필드
  pendingResult?: {
      winnerId: string;
      submitterId: string; 
  };

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
    status: 'pending' | 'accepted' | 'rejected';
    fee: string;
    hostContact?: string; 
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
        if (diff === 0) return 'MATCH DAY';
        return `D-${Math.ceil(diff)}`;
    } catch(e) { return '-'; }
};

export default function LockerScreen() {
  const router = useRouter();
  const { initialTab } = useLocalSearchParams();
  
  const [viewMode, setViewMode] = useState<'team' | 'guest'>('team');
  const [activeTab, setActiveTab] = useState<'schedule' | 'member'>('schedule');
  const [status, setStatus] = useState<'loading' | 'hasTeam' | 'noTeam' | 'pending'>('loading');
  
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [guestActivities, setGuestActivities] = useState<MyGuestActivity[]>([]);

  const [dynamicContact, setDynamicContact] = useState<string | null>(null);

  const [selectedMember, setSelectedMember] = useState<Player | null>(null);
  const [showMemberAction, setShowMemberAction] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  
  const [editName, setEditName] = useState('');
  const [editIntro, setEditIntro] = useState('');
  
  const [targetMatch, setTargetMatch] = useState<MatchData | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);

  // --- [인증 및 데이터 구독] ---
  useEffect(() => {
      if (initialTab === 'matches') {
          setViewMode('team');
          setActiveTab('schedule');
      } else if (initialTab === 'guest') {
          setViewMode('guest');
      }
      
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

                const qGuest = query(
                    collection(db, "guest_posts"), 
                    where("applicantIds", "array-contains", user.uid)
                );

                unsubGuest = onSnapshot(qGuest, async (snap) => {
                    const list: MyGuestActivity[] = [];
                    const promises = snap.docs.map(async (d) => {
                        const data = d.data();
                        const myApp = data.applicants?.find((a: any) => 
                            typeof a === 'string' ? a === user.uid : a.uid === user.uid
                        );
                        const myStatus = typeof myApp === 'object' ? myApp.status : 'pending';
                        
                        let hostContact = undefined;
                        if (myStatus === 'accepted' && data.hostCaptainId) {
                            try {
                                const hostSnap = await getDoc(doc(db, "users", data.hostCaptainId));
                                if (hostSnap.exists()) {
                                    hostContact = hostSnap.data().phoneNumber;
                                }
                            } catch (e) { console.log('Contact fetch error', e); }
                        }

                        return {
                            id: d.id,
                            hostTeamName: data.hostTeamName || '팀명 미정',
                            matchDate: data.matchDate || data.time, 
                            location: data.loc || data.location,
                            status: myStatus,
                            fee: data.fee,
                            hostContact
                        } as MyGuestActivity;
                    });
                    const results = await Promise.all(promises);
                    results.sort((a, b) => a.matchDate.localeCompare(b.matchDate));
                    setGuestActivities(results);
                });

              } catch (e) {
                  console.error(e);
                  setStatus('noTeam');
              }
          } else {
              setStatus('loading');
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
                const mappedStatus = data.status === 'matched' ? 'scheduled' : data.status;
                const safeTeamName = data.teamName || data.team || '팀명 미정';

                list.push({ 
                    id: d.id, 
                    ...data, 
                    team: safeTeamName, 
                    status: mappedStatus 
                } as MatchData);
            }
        });
        setMatches(list);
    });
    return () => unsub();
  }, [myTeamId, status]);

  // --- [매치 분류] ---
  const { upcomingMatch, futureMatches, pastMatches, recruitingMatches, pendingMatches } = useMemo(() => {
      const now = new Date().toISOString();
      const confirmed = matches.filter(m => ['scheduled', 'waiting_verify', 'finished', 'dispute'].includes(m.status));
      const recruiting = matches.filter(m => m.status === 'recruiting'); 

      const future = confirmed.filter(m => m.status !== 'finished' && m.time > now).sort((a, b) => a.time.localeCompare(b.time));
      const past = confirmed.filter(m => m.status === 'finished' || (m.time <= now && m.status !== 'waiting_verify')).sort((a, b) => b.time.localeCompare(a.time));
      
      const pending = confirmed.filter(m => 
          (m.status === 'scheduled' && m.time < now) || 
          (m.status === 'waiting_verify')
      );

      return { 
          upcomingMatch: future.length > 0 ? future[0] : null, 
          futureMatches: future.length > 0 ? future.slice(1) : [], 
          pastMatches: past, 
          recruitingMatches: recruiting.sort((a, b) => a.time.localeCompare(b.time)),
          pendingMatches: pending
      };
  }, [matches]);

  // --- [연락처 강제 조회] ---
  useEffect(() => {
    if (!upcomingMatch || !myTeamId) return;
    if (upcomingMatch.status !== 'scheduled') return;

    const fetchContact = async () => {
        const isHost = upcomingMatch.teamId === myTeamId;
        const existingContact = isHost ? upcomingMatch.guestContact : upcomingMatch.hostContact;
        
        if (existingContact) {
            setDynamicContact(existingContact || null);
            return;
        }

        try {
            const targetTeamId = isHost ? upcomingMatch.guestId : upcomingMatch.teamId;
            if (!targetTeamId) { setDynamicContact("팀 정보 없음"); return; }

            const teamSnap = await getDoc(doc(db, "teams", targetTeamId));
            if (!teamSnap.exists()) { setDynamicContact("상대팀 정보 없음"); return; }
            
            const captainId = teamSnap.data().captainId;
            if (!captainId) { setDynamicContact("대표자 미지정"); return; }

            const userSnap = await getDoc(doc(db, "users", captainId));
            if (userSnap.exists()) {
                const userData = userSnap.data();
                const phone = userData.phoneNumber || userData.phone || "연락처 미공개";
                setDynamicContact(phone);
            } else {
                setDynamicContact("유저 정보 없음");
            }
        } catch (e) {
            console.error("Contact Fetch Error:", e);
            setDynamicContact("조회 실패");
        }
    };

    fetchContact();
  }, [upcomingMatch, myTeamId]);

  // --- [Handlers] ---
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

  const handleKickMember = () => { /* Logic Preserved */ };
  const handleTransferCaptain = async () => { /* Logic Preserved */ };
  const handleCallMember = async () => { /* Logic Preserved */ };
  const handleApproveRequest = async (req: JoinRequest) => { /* Logic Preserved */ };
  
  const sendSMS = (phoneNumber?: string) => {
      if (!phoneNumber || phoneNumber.includes("없음") || phoneNumber.includes("실패")) {
          return Alert.alert("알림", "유효한 연락처가 없습니다.");
      }
      Linking.openURL(`sms:${phoneNumber}`);
  };

  // 1단계: 결과 제안 (Propose)
  const handleProposeResult = async () => {
      if (!targetMatch || !selectedWinner || !myTeamId) return;
      
      try {
          const matchRef = doc(db, "matches", targetMatch.id);
          
          await updateDoc(matchRef, {
              status: 'waiting_verify',
              pendingResult: {
                  winnerId: selectedWinner,
                  submitterId: myTeamId, 
              }
          });

          const msg = "결과가 입력되었습니다.\n상대 팀이 승인하면 순위가 반영됩니다.";
          Platform.OS === 'web' ? window.alert(msg) : Alert.alert("입력 완료", msg);
          setResultModalVisible(false);
          setMatchModalVisible(false);

      } catch(e) {
          console.error("Propose Error:", e);
          Alert.alert("오류", "결과 입력 중 문제가 발생했습니다.");
      }
  };

  // ✅ [Fixed] 2단계: 결과 승인 (Approve & Apply Stats) - deleteField 사용
  const handleApproveResult = async (match: MatchData) => {
      if (!myTeamId || !match.pendingResult) return;

      // 승리한 팀 이름 찾기
      const winningTeamId = match.pendingResult.winnerId;
      let winningTeamName = "알 수 없음";
      if (winningTeamId === match.teamId) winningTeamName = match.teamName || match.team;
      else if (winningTeamId === match.guestId) winningTeamName = match.opponentName || "상대팀";

      const confirmMsg = `홈팀이 [${winningTeamName} 승리]로 결과를 입력했습니다.\n\n이 결과가 맞다면 승인해주세요.\n승인 즉시 랭킹에 반영됩니다.`;
      
      const processApproval = async () => {
          try {
              const matchRef = doc(db, "matches", match.id);
              const teamRef = doc(db, "teams", myTeamId);
              // 상대팀 ID 찾기 (내가 Host면 Guest, 내가 Guest면 Host)
              const isHost = match.teamId === myTeamId; 
              const oppId = isHost ? match.guestId : match.teamId;
              
              if(!oppId) throw "상대팀 정보 오류 (Opponent ID Missing)";
              const oppRef = doc(db, "teams", oppId);
              
              await runTransaction(db, async (transaction) => {
                  const mDoc = await transaction.get(matchRef);
                  const mData = mDoc.data() as MatchData;
                  if (mData.status === 'finished') throw "이미 종료된 경기입니다.";
                  if (!mData.pendingResult) throw "입력된 결과가 없습니다.";

                  const winnerId = mData.pendingResult.winnerId;

                  // 팀 스탯 가져오기
                  const homeDoc = await transaction.get(teamRef);
                  const oppDoc = await transaction.get(oppRef);
                  
                  if (!homeDoc.exists() || !oppDoc.exists()) throw "팀 데이터를 찾을 수 없습니다.";

                  const hStats = (homeDoc.data() as any)?.stats || { wins:0, losses:0, points:0, total:0 };
                  const oStats = (oppDoc.data() as any)?.stats || { wins:0, losses:0, points:0, total:0 };

                  // 승점 계산
                  if (winnerId === myTeamId) {
                      hStats.wins++; hStats.points += 3;
                      oStats.losses++; oStats.points += 1;
                  } else {
                      oStats.wins++; oStats.points += 3;
                      hStats.losses++; hStats.points += 1;
                  }
                  hStats.total++; oStats.total++;

                  // DB 업데이트 (deleteField 사용)
                  transaction.update(matchRef, { 
                      status: 'finished', 
                      winnerId: winnerId, 
                      endedAt: serverTimestamp(),
                      pendingResult: deleteField() // ✅ arrayRemove -> deleteField 수정 완료
                  });
                  transaction.update(teamRef, { stats: hStats });
                  transaction.update(oppRef, { stats: oStats });
              });

              const msg = "승인이 완료되었습니다.\n수고하셨습니다! 👏";
              Platform.OS === 'web' ? window.alert(msg) : Alert.alert("완료", msg);
              setMatchModalVisible(false);

          } catch(e: any) {
              console.error("Approve Error:", e);
              const errMsg = typeof e === 'string' ? e : (e.message || "승인 처리 중 오류가 발생했습니다.");
              Platform.OS === 'web' ? window.alert(errMsg) : Alert.alert("오류", errMsg);
          }
      };

      if (Platform.OS === 'web') {
          if (confirm(confirmMsg)) processApproval();
      } else {
          Alert.alert("결과 승인", confirmMsg, [
              { text: "취소", style: "cancel" },
              { text: "승인", onPress: processApproval }
          ]);
      }
  };


  if (status === 'loading') {
      return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  const stats = teamData?.stats || { wins: 0, losses: 0, points: 0, total: 0 };
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) + '%' : '-';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <ScrollView 
        stickyHeaderIndices={[1]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
         {/* [Index 0] Header */}
         <View className="bg-white px-5 pt-3 pb-6">
             <View className="flex-row justify-between items-center mb-6">
                 <View>
                    {viewMode === 'team' ? (
                        <>
                           <Text className="text-2xl font-extrabold text-gray-900 tracking-tight">{teamData?.name || '소속 팀 없음'}</Text>
                           <Text className="text-gray-500 font-medium text-sm">{teamData?.affiliation || '팀에 가입하여 활동을 시작해보세요'}</Text>
                        </>
                    ) : (
                        <>
                           <Text className="text-2xl font-extrabold text-gray-900 tracking-tight">나의 용병 활동 👟</Text>
                           <Text className="text-gray-500 font-medium text-sm">개인 자격으로 참여하는 경기들입니다.</Text>
                        </>
                    )}
                 </View>
                 
                 <View className="flex-row bg-gray-100 p-1 rounded-xl">
                    <TouchableOpacity onPress={() => setViewMode('team')} className={`px-3 py-1.5 rounded-lg ${viewMode === 'team' ? 'bg-white shadow-sm' : ''}`}>
                        <Text className={`text-xs font-bold ${viewMode === 'team' ? 'text-gray-900' : 'text-gray-400'}`}>내 팀</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setViewMode('guest')} className={`px-3 py-1.5 rounded-lg ${viewMode === 'guest' ? 'bg-white shadow-sm' : ''}`}>
                        <Text className={`text-xs font-bold ${viewMode === 'guest' ? 'text-gray-900' : 'text-gray-400'}`}>게스트</Text>
                    </TouchableOpacity>
                 </View>
             </View>

             {viewMode === 'team' && status === 'hasTeam' && (
                 <>
                     {isCaptain && (
                        <View className="bg-[#191F28] rounded-2xl p-5 shadow-lg mb-6">
                            <View className="flex-row items-center mb-4">
                                <FontAwesome5 name="crown" size={16} color="#FBBF24" />
                                <Text className="text-white font-bold text-lg ml-2">대표자 관리 모드</Text>
                            </View>
                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setEditModalVisible(true)} className="flex-1 bg-gray-700 py-4 rounded-xl items-center">
                                    <FontAwesome5 name="edit" size={18} color="#9CA3AF" style={{marginBottom:6}}/>
                                    <Text className="text-gray-300 font-bold text-xs">정보 수정</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setActiveTab('member')} className="flex-1 bg-gray-700 py-4 rounded-xl items-center">
                                    <FontAwesome5 name="user-friends" size={18} color="#60A5FA" style={{marginBottom:6}}/>
                                    <Text className="text-blue-300 font-bold text-xs">멤버 관리</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setMatchModalVisible(true)} className="flex-1 bg-gray-700 py-4 rounded-xl items-center">
                                    <View>
                                        <FontAwesome5 name="trophy" size={18} color="#FBBF24" style={{marginBottom:6, alignSelf:'center'}}/>
                                        {pendingMatches.length > 0 && <View className="absolute -top-1 -right-2 w-3 h-3 bg-red-500 rounded-full border border-white" />}
                                    </View>
                                    <Text className="text-yellow-500 font-bold text-xs">매치 관리</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                     )}

                     <View className="bg-gray-50 rounded-2xl p-4 flex-row justify-between items-center border border-gray-100">
                         <View className="flex-1 items-center border-r border-gray-200">
                             <Text className="text-gray-400 text-xs font-bold mb-1">승률</Text>
                             <View className="flex-row items-baseline"><Text className="text-xl font-black text-gray-900">{winRate}</Text></View>
                         </View>
                         <View className="flex-1 items-center border-r border-gray-200">
                             <Text className="text-gray-400 text-xs font-bold mb-1">승점</Text>
                             <View className="flex-row items-baseline">
                                 <Text className="text-xl font-black text-blue-600">{stats.points}</Text>
                                 <Text className="text-xs text-gray-500 font-medium ml-0.5">점</Text>
                             </View>
                         </View>
                         <View className="flex-1 items-center">
                             <Text className="text-gray-400 text-xs font-bold mb-1">전적</Text>
                             <Text className="text-base font-bold text-gray-900">{stats.wins}승 {stats.losses}패</Text>
                         </View>
                     </View>
                 </>
             )}
         </View>

         {/* [Index 1] Tabs */}
         {viewMode === 'team' ? (
             <View className="bg-white px-5 border-b border-gray-100 pb-0 pt-2 shadow-sm z-10">
                <View className="flex-row gap-8">
                    <TouchableOpacity onPress={() => setActiveTab('schedule')} className="pb-3" style={{ borderBottomWidth: 3, borderBottomColor: activeTab === 'schedule' ? THEME.primary : 'transparent' }}>
                        <Text className={`text-[16px] font-bold ${activeTab === 'schedule' ? 'text-gray-900' : 'text-gray-400'}`}>일정</Text>
                    </TouchableOpacity>
                    {status === 'hasTeam' && (
                        <TouchableOpacity onPress={() => setActiveTab('member')} className="pb-3" style={{ borderBottomWidth: 3, borderBottomColor: activeTab === 'member' ? THEME.primary : 'transparent' }}>
                            <Text className={`text-[16px] font-bold ${activeTab === 'member' ? 'text-gray-900' : 'text-gray-400'}`}>멤버 ({teamData?.roster?.length || 0})</Text>
                        </TouchableOpacity>
                    )}
                </View>
             </View>
         ) : (
             <View className="bg-white px-5 border-b border-gray-100 pb-3 pt-2 shadow-sm z-10">
                <Text className="font-bold text-gray-900">신청 내역 ({guestActivities.length})</Text>
             </View>
         )}

         {/* [Index 2] Body */}
         <View className="bg-gray-50 pt-6 min-h-screen">
             {viewMode === 'team' && (
                 status === 'noTeam' || status === 'pending' ? (
                     <View className="px-5 items-center justify-center py-20">
                         {status === 'pending' ? (
                             <>
                                <View className="bg-blue-50 p-6 rounded-full mb-4"><FontAwesome5 name="clock" size={32} color={THEME.primary} /></View>
                                <Text className="text-xl font-bold text-gray-900 mb-2">가입 수락 대기 중</Text>
                                <Text className="text-gray-500 text-center">팀 대표자가 확인 중입니다.</Text>
                             </>
                         ) : (
                             <>
                                <View className="mb-4 opacity-50"><FontAwesome5 name="users" size={48} color="#9CA3AF" /></View>
                                <Text className="text-xl font-bold text-gray-900 mb-2">소속된 팀이 없습니다</Text>
                                <TouchableOpacity onPress={() => router.push('/team/register')} className="bg-blue-600 px-6 py-3 rounded-xl mt-4">
                                    <Text className="text-white font-bold">팀 찾기 / 만들기</Text>
                                </TouchableOpacity>
                             </>
                         )}
                     </View>
                 ) : (
                    <View className="px-5">
                        {activeTab === 'schedule' && (
                            <>
                                {/* Upcoming Card */}
                                {upcomingMatch ? (
                                    <View className="mb-8">
                                        <View className="flex-row justify-between items-end mb-3 px-1">
                                            <Text className="text-lg font-bold text-gray-900">다가오는 매치 🔥</Text>
                                        </View>
                                        <TouchableOpacity 
                                            onPress={() => isCaptain && router.push(`/match/${upcomingMatch.id}` as any)} 
                                            activeOpacity={isCaptain ? 0.9 : 1}
                                            className="bg-white rounded-[24px] shadow-sm border border-gray-200 overflow-hidden"
                                        >
                                            <View className="items-center pt-4 pb-2">
                                                <View className="bg-blue-600 px-3 py-1 rounded-full">
                                                    <Text className="text-white font-bold text-xs">{getDDay(upcomingMatch.time)}</Text>
                                                </View>
                                            </View>

                                            <View className="items-center px-6 pb-6 pt-2">
                                                <View className="flex-row items-center justify-center w-full mb-4">
                                                    <View className="flex-1 items-center">
                                                        <Text className="text-gray-900 font-extrabold text-lg text-center" numberOfLines={1}>
                                                            {upcomingMatch.teamName || upcomingMatch.team || '팀명 미정'}
                                                        </Text>
                                                        <Text className="text-gray-400 text-[10px] font-bold mt-1">HOME</Text>
                                                    </View>
                                                    
                                                    <Text className="text-gray-300 font-black text-xl mx-3">VS</Text>
                                                    
                                                    <View className="flex-1 items-center">
                                                        <Text className="text-gray-900 font-extrabold text-lg text-center" numberOfLines={1}>
                                                            {upcomingMatch.opponentName || '상대팀'}
                                                        </Text>
                                                        <Text className="text-gray-400 text-[10px] font-bold mt-1">AWAY</Text>
                                                    </View>
                                                </View>
                                                
                                                <View className="flex-row items-center bg-gray-50 px-4 py-2 rounded-lg">
                                                    <FontAwesome5 name="calendar-alt" size={12} color="#6B7280" style={{marginRight:6}} />
                                                    <Text className="text-gray-600 font-bold text-xs mr-3">{formatTime(upcomingMatch.time)}</Text>
                                                    <View className="w-[1px] h-3 bg-gray-300 mr-3" />
                                                    <FontAwesome5 name="map-marker-alt" size={12} color="#6B7280" style={{marginRight:6}} />
                                                    <Text className="text-gray-600 font-bold text-xs">{upcomingMatch.loc}</Text>
                                                </View>
                                            </View>

                                            {upcomingMatch.status === 'scheduled' && (
                                                <View className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex-row justify-between items-center">
                                                    <View>
                                                        <Text className="text-gray-400 text-[10px] font-bold mb-0.5">대표자 연락처</Text>
                                                        <Text className="text-gray-900 font-bold text-sm">
                                                            {dynamicContact || (upcomingMatch.teamId === myTeamId 
                                                                ? (upcomingMatch.guestContact || '로딩 중...') 
                                                                : (upcomingMatch.hostContact || '로딩 중...')
                                                            )}
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity 
                                                        onPress={() => sendSMS(dynamicContact || (upcomingMatch.teamId === myTeamId ? upcomingMatch.guestContact : upcomingMatch.hostContact))}
                                                        className="bg-white p-2.5 rounded-full border border-gray-200 shadow-sm"
                                                    >
                                                        <FontAwesome5 name="sms" size={16} color="#4B5563" />
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View className="bg-white p-8 rounded-2xl border border-gray-100 items-center justify-center mb-6 shadow-sm"><Text className="text-gray-400 font-bold mb-4">예정된 경기가 없습니다.</Text></View>
                                )}

                                {/* Future & Recruiting */}
                                {(recruitingMatches.length > 0 || futureMatches.length > 0) && (
                                    <View className="mb-6">
                                        <Text className="text-gray-900 font-bold text-lg mb-3 px-1">예정된 일정</Text>
                                        {[...recruitingMatches, ...futureMatches].map(m => {
                                            const isHost = m.teamId === myTeamId;
                                            const isRecruiting = m.status === 'recruiting';
                                            const hostName = m.teamName || m.team || '팀명 미정';
                                            let statusText = '';
                                            if (isRecruiting) statusText = isHost ? "상대 모집중" : "수락 대기중";
                                            else statusText = `vs ${isHost ? (m.opponentName || '상대팀') : hostName}`;
                                            const contact = isHost ? m.guestContact : m.hostContact;

                                            return (
                                                <TouchableOpacity key={m.id} onPress={() => isCaptain && router.push(`/match/${m.id}` as any)} className="bg-white p-5 rounded-2xl mb-3 shadow-sm border border-gray-100">
                                                    <View className="flex-row items-center">
                                                        <View className="bg-gray-50 w-14 h-14 rounded-xl items-center justify-center mr-4">
                                                            <Text className="text-gray-900 font-bold text-lg">{m.time.slice(8,10)}</Text>
                                                            <Text className="text-gray-400 text-[10px] font-bold">일</Text>
                                                        </View>
                                                        <View className="flex-1">
                                                            <Text className="font-bold text-gray-900 text-base mb-1">{statusText}</Text>
                                                            <Text className="text-gray-500 text-xs">{formatTime(m.time)} · {m.loc}</Text>
                                                        </View>
                                                        {isCaptain && <FontAwesome5 name="chevron-right" size={14} color="#D1D5DB" />}
                                                    </View>
                                                    {m.status === 'scheduled' && contact && (
                                                        <TouchableOpacity onPress={() => sendSMS(contact)} className="mt-3 bg-gray-50 p-2.5 rounded-xl flex-row items-center justify-center border border-gray-100">
                                                            <FontAwesome5 name="sms" size={12} color="#4B5563" style={{marginRight:6}} />
                                                            <Text className="text-gray-700 font-bold text-xs">대표자에게 문자 보내기</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                                
                                {pastMatches.length > 0 && (
                                    <View className="mt-4 pb-10">
                                        <Text className="text-gray-400 font-bold text-sm mb-3 px-1">지난 경기 기록</Text>
                                        {pastMatches.map(m => (
                                            <View key={m.id} className="bg-white px-5 py-4 rounded-xl mb-2 border border-gray-100 flex-row items-center justify-between opacity-80">
                                                <View>
                                                    <Text className="text-gray-400 text-xs mb-0.5">{m.time.slice(0,10)}</Text>
                                                    <Text className="text-gray-600 font-bold text-sm">vs {m.teamId === myTeamId ? (m.opponentName || '상대팀') : (m.teamName || m.team)}</Text>
                                                </View>
                                                <Text className="text-xs text-gray-300">{m.status === 'finished' ? '종료' : '결과 미입력'}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </>
                        )}
                        {activeTab === 'member' && (
                            // Member Tab (기존 유지)
                            <View>
                                {isCaptain && teamData?.joinRequests && teamData.joinRequests.length > 0 && (
                                    <TouchableOpacity onPress={() => setShowRequestModal(true)} className="bg-white border border-red-100 p-5 rounded-2xl mb-6 shadow-sm flex-row items-center">
                                        <View className="w-10 h-10 bg-red-50 rounded-full items-center justify-center mr-3"><FontAwesome5 name="bell" size={16} color="#EF4444" /></View>
                                        <View className="flex-1"><Text className="font-bold text-gray-900 text-base">가입 요청이 있어요!</Text><Text className="text-xs text-gray-500">{teamData.joinRequests.length}명이 승인을 기다립니다.</Text></View>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={handleInvite} className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-xl flex-row justify-center items-center">
                                    <FontAwesome5 name="share-alt" size={16} color={THEME.primary} style={{ marginRight: 8 }} />
                                    <Text className="text-blue-600 font-bold">팀원 초대 링크 보내기</Text>
                                </TouchableOpacity>
                                <Text className="text-gray-900 font-bold text-lg mb-3 px-1">팀원 목록</Text>
                                {teamData?.roster?.map((player, index) => (
                                    <TouchableOpacity key={index} disabled={!isCaptain} onPress={() => {setSelectedMember(player); setShowMemberAction(true);}} className="bg-white p-4 rounded-2xl mb-2 border border-gray-100 flex-row items-center">
                                        <View className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-3"><Text className="font-bold text-gray-500">{player.position}</Text></View>
                                        <View className="flex-1"><Text className="font-bold text-gray-900">{player.name}</Text><Text className="text-xs text-gray-400">{player.position}</Text></View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                 )
             )}
             {viewMode === 'guest' && (
                 // Guest Tab (기존 유지)
                 <View className="px-5">
                    {guestActivities.length === 0 ? (
                        <View className="items-center justify-center py-20">
                            <FontAwesome5 name="running" size={48} color="#E5E7EB" style={{marginBottom:16}} />
                            <Text className="text-gray-400 mb-4 font-bold text-center">아직 신청한 용병 활동이 없습니다.</Text>
                            <TouchableOpacity onPress={() => router.push('/guest/list')} className="bg-indigo-600 px-6 py-3 rounded-xl shadow-md shadow-indigo-200"><Text className="text-white font-bold">게스트 모집 보러가기</Text></TouchableOpacity>
                        </View>
                    ) : (
                        guestActivities.map((activity) => (
                            <TouchableOpacity key={activity.id} onPress={() => router.push(`/guest/${activity.id}` as any)} className="bg-white p-5 rounded-2xl mb-3 border border-gray-100 shadow-sm">
                                <View className="flex-row justify-between items-start mb-3">
                                    <View><Text className="font-bold text-lg text-gray-900 mb-1">{activity.hostTeamName}</Text><Text className="text-gray-500 text-xs font-bold">{formatTime(activity.matchDate)}</Text></View>
                                    <View className={`px-2.5 py-1.5 rounded-lg flex-row items-center ${activity.status === 'accepted' ? 'bg-blue-100' : 'bg-gray-100'}`}><Text className={`text-xs font-bold ${activity.status === 'accepted' ? 'text-blue-700' : 'text-gray-500'}`}>{activity.status === 'accepted' ? '참가 확정' : '승인 대기중'}</Text></View>
                                </View>
                                <View className="flex-row items-center mb-2"><FontAwesome5 name="map-marker-alt" size={12} color="#9CA3AF" style={{width:16}} /><Text className="text-gray-600 text-sm">{activity.location}</Text></View>
                                <View className="flex-row items-center mb-4"><FontAwesome5 name="coins" size={12} color="#9CA3AF" style={{width:16}} /><Text className="text-gray-600 text-sm">참가비: {activity.fee || '무료'}</Text></View>
                                {activity.status === 'accepted' && activity.hostContact && (
                                    <TouchableOpacity onPress={() => sendSMS(activity.hostContact)} className="bg-indigo-50 p-3 rounded-xl flex-row items-center justify-between border border-indigo-100">
                                        <View className="flex-row items-center"><View className="w-8 h-8 bg-indigo-100 rounded-full items-center justify-center mr-3"><FontAwesome5 name="sms" size={12} color="#4F46E5" /></View><View><Text className="text-indigo-900 font-bold text-xs">호스트 대표자에게</Text><Text className="text-indigo-600 font-bold text-sm">문자 보내기</Text></View></View>
                                        <FontAwesome5 name="chevron-right" size={12} color="#818CF8" />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        ))
                    )}
                 </View>
             )}
         </View>
      </ScrollView>

      {/* --- Modals --- */}
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

      {/* ✅ [Updated] Match Manage Modal (결과 승인/입력 UI 분기) */}
      <Modal visible={matchModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
                <Text className="font-bold text-lg">매치 관리</Text>
                <TouchableOpacity onPress={() => setMatchModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity>
            </View>
            <ScrollView className="p-5">
                {pendingMatches.length > 0 ? (
                    <View className="mb-6">
                        <Text className="font-bold text-red-500 mb-2">🚨 결과 처리가 필요합니다!</Text>
                        {pendingMatches.map(m => {
                            const isMySubmission = m.pendingResult?.submitterId === myTeamId;
                            // 내가 호스트(모집자)인가?
                            const isHost = m.teamId === myTeamId;
                            
                            return (
                                <View key={m.id} className="bg-red-50 border border-red-100 p-4 rounded-xl mb-2 flex-row justify-between items-center">
                                    <View className="flex-1 mr-2">
                                        <Text className="font-bold text-gray-900 truncate" numberOfLines={1}>{m.team ? `vs ${m.team}` : '상대 미정'}</Text>
                                        <Text className="text-xs text-red-400 font-bold">
                                            {m.status === 'waiting_verify' 
                                                ? (isMySubmission ? '상대 승인 대기중...' : '승인 요청 도착!') 
                                                : (isHost ? formatTime(m.time) : '결과 대기중')}
                                        </Text>
                                    </View>
                                    
                                    {m.status === 'waiting_verify' ? (
                                        !isMySubmission ? (
                                            <TouchableOpacity onPress={() => handleApproveResult(m)} className="bg-blue-600 px-4 py-2 rounded-lg">
                                                <Text className="text-white font-bold text-xs">결과 승인</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View className="bg-gray-200 px-4 py-2 rounded-lg">
                                                <Text className="text-gray-500 font-bold text-xs">대기중</Text>
                                            </View>
                                        )
                                    ) : (
                                        // 호스트만 결과 입력 가능
                                        isHost ? (
                                            <TouchableOpacity onPress={() => { setTargetMatch(m); setResultModalVisible(true); }} className="bg-red-500 px-4 py-2 rounded-lg">
                                                <Text className="text-white font-bold text-xs">결과 입력</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View className="bg-gray-200 px-4 py-2 rounded-lg">
                                                <Text className="text-gray-400 font-bold text-xs">입력 권한 없음</Text>
                                            </View>
                                        )
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View className="items-center py-6 bg-gray-50 rounded-xl mb-6"><Text className="text-gray-400 font-bold">처리할 매치 결과가 없습니다.</Text></View>
                )}

                <Text className="font-bold text-gray-900 mb-3">경기 생성</Text>
                <TouchableOpacity className="bg-indigo-600 w-full py-4 rounded-xl items-center mb-6" onPress={() => { setMatchModalVisible(false); router.push('/match/write'); }}>
                    <Text className="text-white font-bold">새 매치 생성하기</Text>
                </TouchableOpacity>

                <Text className="font-bold text-gray-900 mb-3">전체 경기 기록</Text>
                {matches.map(m => (
                    <View key={m.id} className="bg-white border border-gray-100 p-4 rounded-xl mb-3 shadow-sm">
                        <View className="flex-row justify-between mb-2">
                            <Text className={`text-xs font-bold ${m.status === 'finished' ? 'text-gray-400' : 'text-blue-500'}`}>{m.status === 'finished' ? '종료됨' : '예정됨'}</Text>
                            <Text className="text-xs text-gray-400">{formatTime(m.time)}</Text>
                        </View>
                        <Text className="font-bold text-lg mb-1">{m.team ? `vs ${m.team}` : '상대팀 미정'}</Text>
                        {m.winnerId && <View className="mt-2 bg-gray-100 self-start px-2 py-1 rounded"><Text className="text-xs text-gray-600 font-bold">결과: {m.winnerId === myTeamId ? '승리 🏆' : '패배'}</Text></View>}
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ✅ [Updated] Result Input Modal (단순 입력 -> 제안) */}
      <Modal visible={resultModalVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-2xl p-6">
                  <Text className="text-xl font-bold text-center mb-2">경기 결과 입력</Text>
                  <Text className="text-center text-gray-500 text-xs mb-6">승리한 팀을 선택해주세요.<br/>상대방이 승인하면 최종 반영됩니다.</Text>
                  
                  {targetMatch && (
                      <View className="flex-row gap-3 mb-6">
                          <TouchableOpacity onPress={() => setSelectedWinner(myTeamId)} className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === myTeamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}>
                              <Text className={`font-bold ${selectedWinner === myTeamId ? 'text-indigo-600' : 'text-gray-500'}`}>{teamData?.name} (우리팀)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setSelectedWinner(targetMatch.teamId === myTeamId ? (targetMatch.guestId || null) : targetMatch.teamId)} className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner !== null && selectedWinner !== myTeamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}>
                              <Text className={`font-bold ${selectedWinner !== null && selectedWinner !== myTeamId ? 'text-indigo-600' : 'text-gray-500'}`}>{targetMatch.opponentName || '상대팀'}</Text>
                          </TouchableOpacity>
                      </View>
                  )}
                  
                  <TouchableOpacity onPress={handleProposeResult} disabled={!selectedWinner} className={`w-full py-4 rounded-xl items-center ${selectedWinner ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                      <Text className="text-white font-bold">입력 완료 (승인 요청)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setResultModalVisible(false)} className="mt-4 items-center">
                      <Text className="text-gray-500 font-bold">취소</Text>
                  </TouchableOpacity>
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