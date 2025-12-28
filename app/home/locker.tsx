import React, { useEffect, useState, useMemo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, 
  Modal, FlatList, Linking, TextInput, Platform 
} from 'react-native';
import { 
  doc, updateDoc, arrayRemove, arrayUnion, runTransaction, 
  collection, query, onSnapshot, serverTimestamp, getDoc, where 
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
type MatchData = {
  id: string; hostId: string; guestId?: string; team: string; time: string; loc: string; 
  status: 'recruiting' | 'scheduled' | 'finished' | 'dispute'; 
  applicants: string[];
  opponentName?: string; 
  winnerId?: string; 
  result?: { hostScore: number; guestScore: number; status: 'waiting' | 'verified' | 'dispute'; submitterId?: string };
  isDeleted?: boolean;
  // ✅ [Phase 2 추가 필드] 연락처 정보
  hostContact?: string;
  guestContact?: string;
};

// ✅ [Phase 3 신규 타입] 게스트 활동 데이터
type MyGuestActivity = {
    id: string; // post ID
    hostTeamName: string;
    matchDate: string;
    location: string;
    status: 'pending' | 'accepted' | 'rejected';
    fee: string;
    hostContact?: string; // 수락 시 표시할 호스트 연락처
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
  
  // ✅ [View Mode] 팀 활동 vs 게스트 활동
  const [viewMode, setViewMode] = useState<'team' | 'guest'>('team');
  const [activeTab, setActiveTab] = useState<'schedule' | 'member'>('schedule');
  
  // Status State
  const [status, setStatus] = useState<'loading' | 'hasTeam' | 'noTeam' | 'pending'>('loading');
  
  // Data States
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [matches, setMatches] = useState<MatchData[]>([]);
  
  // ✅ [Guest Data]
  const [guestActivities, setGuestActivities] = useState<MyGuestActivity[]>([]);

  // Action States
  const [selectedMember, setSelectedMember] = useState<Player | null>(null);
  const [showMemberAction, setShowMemberAction] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Management States
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  
  const [editName, setEditName] = useState('');
  const [editIntro, setEditIntro] = useState('');
  
  const [targetMatch, setTargetMatch] = useState<any>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);

  // --- [1. 초기 데이터 로드 & 팀 상태 확인] ---
  useEffect(() => {
      // 알림 타고 들어왔을 때 탭 전환
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
                // 1-A. 유저 팀 정보 로드
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const userData = userDoc.data();
                const tid = userData?.teamId;
                const appliedTid = userData?.appliedTeamId;

                if (tid) {
                  setMyTeamId(tid);
                  unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => {
                      if (d.exists()) {
                          const data = d.data();
                          setTeamData({ id: d.id, ...data } as TeamData);
                          setIsCaptain(data.captainId === user.uid);
                          
                          setEditName(data.name);
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

                // 1-B. ✅ 게스트 활동 로드 (내가 신청한 글)
                // applicantIds 배열에 내 UID가 있는 문서 검색
                const qGuest = query(
                    collection(db, "guest_posts"), 
                    where("applicantIds", "array-contains", user.uid)
                );

                unsubGuest = onSnapshot(qGuest, async (snap) => {
                    const list: MyGuestActivity[] = [];
                    // 비동기 처리를 위해 for loop 사용 고려, 여기서는 Promise.all 사용
                    const promises = snap.docs.map(async (d) => {
                        const data = d.data();
                        
                        // applicants 배열(객체 구조)에서 내 상태 찾기
                        // 문자열(구버전) 호환성 체크
                        const myApp = data.applicants?.find((a: any) => 
                            typeof a === 'string' ? a === user.uid : a.uid === user.uid
                        );
                        
                        // 객체 구조면 status 사용, 문자열이면 기본값 pending
                        const myStatus = typeof myApp === 'object' ? myApp.status : 'pending';
                        
                        let hostContact = undefined;
                        // ✅ 수락된 상태라면 호스트 연락처 가져오기
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
                            matchDate: data.matchDate || data.time, // 필드명 호환
                            location: data.loc || data.location,
                            status: myStatus,
                            fee: data.fee,
                            hostContact
                        } as MyGuestActivity;
                    });

                    const results = await Promise.all(promises);
                    // 날짜순 정렬
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

  // --- [2. 매치 데이터 로드 (팀 모드일 때만)] ---
  useEffect(() => {
    if (!myTeamId || status !== 'hasTeam') return;
    const q = query(collection(db, "matches")); 
    const unsub = onSnapshot(q, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.isDeleted) return;
            if (data.hostId === myTeamId || data.guestId === myTeamId || data.applicants?.includes(myTeamId) || data.teamId === myTeamId) {
                const mappedStatus = data.status === 'matched' ? 'scheduled' : data.status;
                list.push({ id: d.id, ...data, status: mappedStatus } as MatchData);
            }
        });
        setMatches(list);
    });
    return () => unsub();
  }, [myTeamId, status]);

  // --- [4. 리스트 가공] ---
  const { upcomingMatch, futureMatches, pastMatches, recruitingMatches, pendingMatches } = useMemo(() => {
      const now = new Date().toISOString();
      const confirmed = matches.filter(m => m.status === 'scheduled' || m.status === 'finished' || m.status === 'dispute');
      const recruiting = matches.filter(m => m.status === 'recruiting'); 

      const future = confirmed.filter(m => m.time > now).sort((a, b) => a.time.localeCompare(b.time));
      const past = confirmed.filter(m => m.time <= now).sort((a, b) => b.time.localeCompare(a.time));
      
      const pending = confirmed.filter(m => m.status === 'scheduled' && m.time < now);

      return { 
          upcomingMatch: future.length > 0 ? future[0] : null, 
          futureMatches: future.length > 0 ? future.slice(1) : [], 
          pastMatches: past, 
          recruitingMatches: recruiting.sort((a, b) => a.time.localeCompare(b.time)),
          pendingMatches: pending
      };
  }, [matches]);

  // --- [액션 핸들러들] ---
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

  const handleKickMember = () => { /* 기존 코드 유지 */ };
  const handleTransferCaptain = async () => { /* 기존 코드 유지 */ };
  const handleCallMember = async () => { /* 기존 코드 유지 */ };
  const handleApproveRequest = async (req: JoinRequest) => { /* 기존 코드 유지 */ };
  
  // 전화 걸기 헬퍼
  const makeCall = (phoneNumber?: string) => {
      if (!phoneNumber) return Alert.alert("알림", "연락처 정보가 없습니다.");
      Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleInputResult = async () => {
      if (!targetMatch || !selectedWinner || !myTeamId) return;
      try {
        await runTransaction(db, async (transaction) => {
            const matchRef = doc(db, "matches", targetMatch.id);
            const teamRef = doc(db, "teams", myTeamId);
            const isHost = targetMatch.hostId === myTeamId;
            const oppId = isHost ? targetMatch.guestId : targetMatch.hostId;
            if(!oppId) throw "상대팀 정보 오류";
            const oppRef = doc(db, "teams", oppId);
            const mDoc = await transaction.get(matchRef);
            if((mDoc.data() as any)?.status === 'finished') throw "이미 처리된 경기입니다.";

            const homeDoc = await transaction.get(teamRef);
            const oppDoc = await transaction.get(oppRef);
            const hStats = (homeDoc.data() as any)?.stats || { wins:0, losses:0, points:0, total:0 };
            const oStats = (oppDoc.data() as any)?.stats || { wins:0, losses:0, points:0, total:0 };

            if (selectedWinner === myTeamId) {
                hStats.wins++; hStats.points += 3;
                oStats.losses++; oStats.points += 1;
            } else {
                oStats.wins++; oStats.points += 3;
                hStats.losses++; hStats.points += 1;
            }
            hStats.total++; oStats.total++;
            transaction.update(matchRef, { status: 'finished', winnerId: selectedWinner, endedAt: serverTimestamp() });
            transaction.update(teamRef, { stats: hStats });
            transaction.update(oppRef, { stats: oStats });
        });
        Alert.alert('성공', '경기 결과가 반영되었습니다.');
        setResultModalVisible(false);
        setMatchModalVisible(false); 
      } catch(e) { Alert.alert('오류', typeof e === 'string' ? e : '결과 처리 실패'); }
  };


  // --- [렌더링] ---
  if (status === 'loading') {
      return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }
  
  // 팀 없으면 바로 게스트 모드 UI처럼 보이게 하거나, 기존 NoTeam UI 유지하면서 탭 제공 (여기선 간단히 기존 유지)
  // 단, 게스트 모드를 보려면 팀이 없어도 접근 가능해야 함.
  // 로직 수정: 팀이 없어도 LockerScreen은 렌더링되되, '내 팀' 탭 내용만 NoTeam 컴포넌트로 대체.

  const stats = teamData?.stats || { wins: 0, losses: 0, points: 0, total: 0 };
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) + '%' : '-';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <ScrollView 
        stickyHeaderIndices={[1]} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
         {/* [Index 0] Header Area */}
         <View className="bg-white px-5 pt-3 pb-6">
             {/* ✅ 1. 상단 모드 전환 스위치 (Team / Guest) */}
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
                    <TouchableOpacity 
                        onPress={() => setViewMode('team')}
                        className={`px-3 py-1.5 rounded-lg ${viewMode === 'team' ? 'bg-white shadow-sm' : ''}`}
                    >
                        <Text className={`text-xs font-bold ${viewMode === 'team' ? 'text-gray-900' : 'text-gray-400'}`}>내 팀</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setViewMode('guest')}
                        className={`px-3 py-1.5 rounded-lg ${viewMode === 'guest' ? 'bg-white shadow-sm' : ''}`}
                    >
                        <Text className={`text-xs font-bold ${viewMode === 'guest' ? 'text-gray-900' : 'text-gray-400'}`}>게스트</Text>
                    </TouchableOpacity>
                 </View>
             </View>

             {/* Team Mode일 때만 보여주는 통계 및 대시보드 */}
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
                             <View className="flex-row items-baseline">
                                 <Text className="text-xl font-black text-gray-900">{winRate}</Text>
                             </View>
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
                             <Text className="text-base font-bold text-gray-900">
                                 {stats.wins}승 {stats.losses}패
                             </Text>
                         </View>
                     </View>
                 </>
             )}
         </View>

         {/* [Index 1] Sticky Tabs */}
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

         {/* [Index 2] Content Body */}
         <View className="bg-gray-50 pt-6 min-h-screen">
             
             {/* --- TEAM MODE --- */}
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
                    // 기존 팀 콘텐츠 (Schedule / Member)
                    <View className="px-5">
                        {activeTab === 'schedule' && (
                            <>
                                {/* Hero Card (Upcoming) */}
                                {upcomingMatch ? (
                                    <View className="mb-8">
                                        <View className="flex-row justify-between items-end mb-3 px-1">
                                            <Text className="text-lg font-bold text-gray-900">다가오는 매치 🔥</Text>
                                            <Text className="text-xs font-bold text-blue-600">{getDDay(upcomingMatch.time)}</Text>
                                        </View>
                                        <TouchableOpacity 
                                            onPress={() => isCaptain && router.push(`/match/${upcomingMatch.id}` as any)} 
                                            activeOpacity={isCaptain ? 0.9 : 1}
                                            className="bg-white p-6 rounded-[24px] shadow-sm border border-blue-100 relative overflow-hidden"
                                        >
                                            <View className="absolute top-0 right-0 p-4 opacity-5"><FontAwesome5 name="volleyball-ball" size={80} color={THEME.primary} /></View>
                                            <Text className="text-blue-600 font-bold text-xs mb-2 tracking-wider">MATCH DAY</Text>
                                            <Text className="text-3xl font-black text-gray-900 mb-1">{upcomingMatch.time.slice(11,16)}</Text>
                                            <Text className="text-gray-500 font-medium text-sm mb-6">{formatTime(upcomingMatch.time)} · {upcomingMatch.loc}</Text>
                                            <View className="bg-gray-50 p-4 rounded-xl flex-row items-center justify-between mb-2">
                                                <Text className="font-bold text-gray-700 text-base">vs {upcomingMatch.team}</Text>
                                                {isCaptain && <FontAwesome5 name="chevron-right" size={12} color="#9CA3AF" />}
                                            </View>
                                            
                                            {/* ✅ [Phase 3] 상대팀 연락처 표시 (상대가 확정된 경우) */}
                                            {upcomingMatch.status === 'scheduled' && (
                                                <View className="bg-blue-50 p-3 rounded-xl flex-row items-center justify-between">
                                                    <View className="flex-row items-center">
                                                        <FontAwesome5 name="phone-alt" size={12} color="#2563EB" style={{marginRight:8}} />
                                                        <Text className="text-blue-700 font-bold text-xs">
                                                            상대 주장: {upcomingMatch.hostId === myTeamId ? upcomingMatch.guestContact : upcomingMatch.hostContact || '연락처 없음'}
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity 
                                                        onPress={() => makeCall(upcomingMatch.hostId === myTeamId ? upcomingMatch.guestContact : upcomingMatch.hostContact)}
                                                        className="bg-white px-3 py-1.5 rounded-lg border border-blue-100"
                                                    >
                                                        <Text className="text-blue-600 text-[10px] font-bold">전화걸기</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View className="bg-white p-8 rounded-2xl border border-gray-100 items-center justify-center mb-6 shadow-sm">
                                        <Text className="text-gray-400 font-bold mb-4">예정된 경기가 없습니다.</Text>
                                        {isCaptain && (
                                            <TouchableOpacity className="bg-gray-900 py-3 px-5 rounded-xl shadow-lg" onPress={() => router.push('/match/write')}>
                                                <Text className="text-white font-bold text-xs">매치 생성하기</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}

                                {/* Future List */}
                                {(recruitingMatches.length > 0 || futureMatches.length > 0) && (
                                    <View className="mb-6">
                                        <Text className="text-gray-900 font-bold text-lg mb-3 px-1">예정된 일정</Text>
                                        {[...recruitingMatches, ...futureMatches].map(m => {
                                            const isHost = m.hostId === myTeamId;
                                            const isRecruiting = m.status === 'recruiting';
                                            let statusText = isRecruiting ? (isHost ? "상대 모집중" : "수락 대기중") : `vs ${m.team}`;
                                            
                                            // 연락처 정보
                                            const contact = isHost ? m.guestContact : m.hostContact;

                                            return (
                                                <TouchableOpacity 
                                                    key={m.id} 
                                                    onPress={() => isCaptain && router.push(`/match/${m.id}` as any)} 
                                                    className="bg-white p-5 rounded-2xl mb-3 shadow-sm border border-gray-100"
                                                >
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

                                                    {/* ✅ 매칭된 경우 연락처 버튼 노출 */}
                                                    {m.status === 'scheduled' && contact && (
                                                        <TouchableOpacity 
                                                            onPress={() => makeCall(contact)}
                                                            className="mt-3 bg-green-50 p-2.5 rounded-xl flex-row items-center justify-center border border-green-100"
                                                        >
                                                            <FontAwesome5 name="phone-alt" size={12} color="#059669" style={{marginRight:6}} />
                                                            <Text className="text-green-700 font-bold text-xs">상대 연락처: {contact}</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                                
                                {/* Past Matches (기존 코드 유지) */}
                                {pastMatches.length > 0 && (
                                    <View className="mt-4 pb-10">
                                        {/* ... Past Matches Rendering ... */}
                                        <Text className="text-gray-400 font-bold text-sm mb-3 px-1">지난 경기 기록</Text>
                                        {pastMatches.map(m => (
                                            <View key={m.id} className="bg-white px-5 py-4 rounded-xl mb-2 border border-gray-100 flex-row items-center justify-between opacity-80">
                                                <View>
                                                    <Text className="text-gray-400 text-xs mb-0.5">{m.time.slice(0,10)}</Text>
                                                    <Text className="text-gray-600 font-bold text-sm">vs {m.team}</Text>
                                                </View>
                                                <Text className="text-xs text-gray-300">{m.status === 'finished' ? '종료' : '결과 미입력'}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </>
                        )}

                        {activeTab === 'member' && (
                            // ... Existing Member Tab Code ...
                            <View>
                                {isCaptain && teamData?.joinRequests && teamData.joinRequests.length > 0 && (
                                    <TouchableOpacity onPress={() => setShowRequestModal(true)} className="bg-white border border-red-100 p-5 rounded-2xl mb-6 shadow-sm flex-row items-center">
                                        <View className="w-10 h-10 bg-red-50 rounded-full items-center justify-center mr-3"><FontAwesome5 name="bell" size={16} color="#EF4444" /></View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-gray-900 text-base">가입 요청이 있어요!</Text>
                                            <Text className="text-xs text-gray-500">{teamData.joinRequests.length}명이 승인을 기다립니다.</Text>
                                        </View>
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

             {/* --- GUEST MODE UI (신규) --- */}
             {viewMode === 'guest' && (
                 <View className="px-5">
                    {guestActivities.length === 0 ? (
                        <View className="items-center justify-center py-20">
                            <FontAwesome5 name="running" size={48} color="#E5E7EB" style={{marginBottom:16}} />
                            <Text className="text-gray-400 mb-4 font-bold text-center">아직 신청한 용병 활동이 없습니다.</Text>
                            <TouchableOpacity onPress={() => router.push('/guest/list')} className="bg-indigo-600 px-6 py-3 rounded-xl shadow-md shadow-indigo-200">
                                <Text className="text-white font-bold">게스트 모집 보러가기</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        guestActivities.map((activity) => {
                            let statusColor = 'bg-gray-100 text-gray-500';
                            let statusText = '승인 대기중';
                            let icon = 'clock';
                            
                            if (activity.status === 'accepted') { 
                                statusColor = 'bg-blue-100 text-blue-700'; 
                                statusText = '참가 확정'; 
                                icon = 'check-circle';
                            }
                            if (activity.status === 'rejected') { 
                                statusColor = 'bg-red-100 text-red-500'; 
                                statusText = '거절됨'; 
                                icon = 'times-circle';
                            }

                            return (
                                <TouchableOpacity 
                                    key={activity.id}
                                    onPress={() => router.push(`/guest/${activity.id}` as any)}
                                    className="bg-white p-5 rounded-2xl mb-3 border border-gray-100 shadow-sm"
                                >
                                    <View className="flex-row justify-between items-start mb-3">
                                        <View>
                                            <Text className="font-bold text-lg text-gray-900 mb-1">{activity.hostTeamName}</Text>
                                            <Text className="text-gray-500 text-xs font-bold">{formatTime(activity.matchDate)}</Text>
                                        </View>
                                        <View className={`px-2.5 py-1.5 rounded-lg flex-row items-center ${statusColor.split(' ')[0]}`}>
                                            <FontAwesome5 name={icon} size={10} style={{marginRight:4}} />
                                            <Text className={`text-xs font-bold ${statusColor.split(' ')[1]}`}>{statusText}</Text>
                                        </View>
                                    </View>
                                    
                                    <View className="flex-row items-center mb-2">
                                        <FontAwesome5 name="map-marker-alt" size={12} color="#9CA3AF" style={{width:16}} />
                                        <Text className="text-gray-600 text-sm">{activity.location}</Text>
                                    </View>
                                    <View className="flex-row items-center mb-4">
                                        <FontAwesome5 name="coins" size={12} color="#9CA3AF" style={{width:16}} />
                                        <Text className="text-gray-600 text-sm">참가비: {activity.fee || '무료'}</Text>
                                    </View>

                                    {/* ✅ 참가 확정 시 호스트 연락처 노출 */}
                                    {activity.status === 'accepted' && activity.hostContact && (
                                        <TouchableOpacity 
                                            onPress={() => makeCall(activity.hostContact)}
                                            className="bg-indigo-50 p-3 rounded-xl flex-row items-center justify-between border border-indigo-100"
                                        >
                                            <View className="flex-row items-center">
                                                <View className="w-8 h-8 bg-indigo-100 rounded-full items-center justify-center mr-3">
                                                    <FontAwesome5 name="phone-alt" size={12} color="#4F46E5" />
                                                </View>
                                                <View>
                                                    <Text className="text-indigo-900 font-bold text-xs">호스트에게 연락하기</Text>
                                                    <Text className="text-indigo-600 font-bold text-sm">{activity.hostContact}</Text>
                                                </View>
                                            </View>
                                            <FontAwesome5 name="chevron-right" size={12} color="#818CF8" />
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>
                            );
                        })
                    )}
                 </View>
             )}
         </View>
      </ScrollView>

      {/* --- Modals --- */}
      {/* 기존 모달들은 그대로 유지 (EditModal, MatchModal, ResultModal, MemberActionModal, JoinRequestModal) */}
      <Modal visible={editModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
                <Text className="font-bold text-lg">팀 정보 수정</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity>
            </View>
            <View className="p-5">
                <Text className="text-sm font-bold text-gray-500 mb-1">팀 이름</Text>
                <TextInput className="bg-gray-50 p-4 rounded-xl mb-4 text-lg" value={editName} onChangeText={setEditName} />
                <Text className="text-sm font-bold text-gray-500 mb-1">팀 소개</Text>
                <TextInput className="bg-gray-50 p-4 rounded-xl mb-6 min-h-[120px]" multiline textAlignVertical="top" value={editIntro} onChangeText={setEditIntro} />
                <TouchableOpacity onPress={handleUpdateTeam} className="bg-indigo-600 p-4 rounded-xl items-center">
                    <Text className="text-white font-bold">저장하기</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
      </Modal>

      {/* 2. Match Manage Modal */}
      <Modal visible={matchModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
                <Text className="font-bold text-lg">매치 관리</Text>
                <TouchableOpacity onPress={() => setMatchModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity>
            </View>
            <ScrollView className="p-5">
                {pendingMatches.length > 0 ? (
                    <View className="mb-6">
                        <Text className="font-bold text-red-500 mb-2">🚨 결과 입력이 필요합니다!</Text>
                        {pendingMatches.map(m => (
                            <View key={m.id} className="bg-red-50 border border-red-100 p-4 rounded-xl mb-2 flex-row justify-between items-center">
                                <View>
                                    <Text className="font-bold text-gray-900">{m.team ? `vs ${m.team}` : '상대 미정'}</Text>
                                    <Text className="text-xs text-red-400">{formatTime(m.time)}</Text>
                                </View>
                                <TouchableOpacity onPress={() => { setTargetMatch(m); setResultModalVisible(true); }} className="bg-red-500 px-4 py-2 rounded-lg">
                                    <Text className="text-white font-bold text-xs">결과 입력</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View className="items-center py-6 bg-gray-50 rounded-xl mb-6"><Text className="text-gray-400 font-bold">입력할 경기 결과가 없습니다.</Text></View>
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

      {/* 3. Result Input Modal */}
      <Modal visible={resultModalVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-2xl p-6">
                  <Text className="text-xl font-bold text-center mb-2">경기 결과 확정</Text>
                  <Text className="text-center text-gray-500 text-xs mb-6">승리한 팀을 선택해주세요.</Text>
                  
                  {targetMatch && (
                      <View className="flex-row gap-3 mb-6">
                          <TouchableOpacity onPress={() => setSelectedWinner(myTeamId)} className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === myTeamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}>
                              <Text className={`font-bold ${selectedWinner === myTeamId ? 'text-indigo-600' : 'text-gray-500'}`}>{teamData?.name} (우리팀)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setSelectedWinner(targetMatch.hostId === myTeamId ? targetMatch.guestId : targetMatch.hostId)} className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner !== null && selectedWinner !== myTeamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}>
                              <Text className={`font-bold ${selectedWinner !== null && selectedWinner !== myTeamId ? 'text-indigo-600' : 'text-gray-500'}`}>{targetMatch.team}</Text>
                          </TouchableOpacity>
                      </View>
                  )}
                  
                  <TouchableOpacity onPress={handleInputResult} disabled={!selectedWinner} className={`w-full py-4 rounded-xl items-center ${selectedWinner ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                      <Text className="text-white font-bold">결과 저장</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setResultModalVisible(false)} className="mt-4 items-center">
                      <Text className="text-gray-500 font-bold">취소</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* 4. Member Action Modal */}
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

      {/* 5. Join Request Modal */}
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
                            <View>
                                <Text className="font-bold text-lg text-gray-900 mb-1">{item.name}</Text>
                                <Text className="text-sm text-gray-500">희망 포지션: <Text className="font-bold text-blue-600">{item.position}</Text></Text>
                            </View>
                            <Text className="text-xs text-gray-400">{item.requestedAt.split('T')[0]}</Text>
                        </View>
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={() => handleApproveRequest(item)} className="flex-1 bg-blue-600 py-3.5 rounded-xl items-center shadow-sm shadow-blue-200">
                                <Text className="text-white font-bold">승인</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="flex-1 bg-gray-100 py-3.5 rounded-xl items-center">
                                <Text className="text-gray-600 font-bold">거절</Text>
                            </TouchableOpacity>
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