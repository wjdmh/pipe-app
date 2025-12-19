import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, FlatList, Linking, Share } from 'react-native';
import { doc, getDoc, collection, query, onSnapshot, arrayRemove, arrayUnion, runTransaction } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

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
    id: string; name: string; affiliation: string; level: string; region?: string;
    stats: { wins: number; losses: number; points: number; total: number; rank?: number }; 
    roster: Player[]; members: string[]; captainId: string; 
    joinRequests?: JoinRequest[]; 
};
type MatchData = {
  id: string; hostId: string; guestId?: string; team: string; time: string; loc: string; 
  status: 'recruiting' | 'matched' | 'finished' | 'dispute';
  applicants: string[];
  result?: { hostScore: number; guestScore: number; status: 'waiting' | 'verified' | 'dispute'; submitterId?: string };
  isDeleted?: boolean;
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
  const [activeTab, setActiveTab] = useState<'schedule' | 'member'>('schedule');
  
  // Status State: loading | hasTeam | noTeam | pending
  const [status, setStatus] = useState<'loading' | 'hasTeam' | 'noTeam' | 'pending'>('loading');
  
  // Data States
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [selectedMember, setSelectedMember] = useState<Player | null>(null);
  const [showMemberAction, setShowMemberAction] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // --- [1. 초기 데이터 로드 & 팀 상태 확인] ---
  useEffect(() => {
      if (initialTab === 'matches') setActiveTab('schedule');
      
      let unsubTeam: (() => void) | undefined;

      const unsubAuth = auth.onAuthStateChanged(async (user) => {
          if (user) {
              try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const userData = userDoc.data();
                const tid = userData?.teamId;
                const appliedTid = userData?.appliedTeamId; // 신청 대기 중인 팀 ID

                if (tid) {
                  setMyTeamId(tid);
                  // 팀 데이터 실시간 구독
                  unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => {
                      if (d.exists()) {
                          const data = d.data();
                          setTeamData({ id: d.id, ...data } as TeamData);
                          setIsCaptain(data.captainId === user.uid);
                          setStatus('hasTeam');
                      } else {
                          setStatus('noTeam');
                      }
                  });
                } else if (appliedTid) {
                    // 팀은 없지만 신청 내역이 있는 경우
                    setStatus('pending');
                } else {
                    setStatus('noTeam');
                }
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
      };
  }, []);

  // --- [2. 매치 데이터 로드] ---
  useEffect(() => {
    if (!myTeamId || status !== 'hasTeam') return;
    const q = query(collection(db, "matches")); 
    const unsub = onSnapshot(q, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.isDeleted) return;
            // 필터링
            if (data.hostId === myTeamId || data.guestId === myTeamId || data.applicants?.includes(myTeamId)) {
                list.push({ id: d.id, ...data } as MatchData);
            }
        });
        setMatches(list);
    });
    return () => unsub();
  }, [myTeamId, status]);

  // --- [3. 리스트 가공] ---
  const { upcomingMatch, futureMatches, pastMatches, recruitingMatches } = useMemo(() => {
      const now = new Date().toISOString();
      const confirmed = matches.filter((m: MatchData) => m.status === 'matched' || m.status === 'finished' || m.status === 'dispute');
      const recruiting = matches.filter((m: MatchData) => m.status === 'recruiting'); 

      const future = confirmed.filter((m: MatchData) => m.time > now).sort((a, b) => a.time.localeCompare(b.time));
      const past = confirmed.filter((m: MatchData) => m.time <= now).sort((a, b) => b.time.localeCompare(a.time));

      const upcoming = future.length > 0 ? future[0] : null;
      const othersFuture = future.length > 0 ? future.slice(1) : [];

      return { 
          upcomingMatch: upcoming, 
          futureMatches: othersFuture, 
          pastMatches: past, 
          recruitingMatches: recruiting.sort((a, b) => a.time.localeCompare(b.time)) 
      };
  }, [matches]);

  // --- [4. 액션 핸들러] ---
  const handleCreateMatch = () => {
      // 일반 팀원 버튼 숨김 처리로 인해 호출될 일은 적지만 안전장치
      if (isCaptain) {
          router.push('/match/write');
      }
  };

  const handleInvite = async () => {
      if (!teamData) return;
      try {
          await Share.share({
              message: `[PIPE] '${teamData.name}' 팀에서 동료를 찾고 있어요! 함께 운동해요.`,
          });
      } catch (error) { }
  };

  const handleTransferCaptain = async () => {
      if (!selectedMember || !selectedMember.uid || !myTeamId || !auth.currentUser) return;

      const targetName = selectedMember.name;
      const targetUid = selectedMember.uid;
      const myUid = auth.currentUser.uid;

      Alert.alert('정말 위임하시겠습니까?', `주장 권한을 ${targetName}님에게 넘기면\n회원님은 일반 팀원이 됩니다.`, [
          { text: '취소', style: 'cancel' },
          { text: '위임하기', style: 'destructive', onPress: async () => {
              try {
                  await runTransaction(db, async (transaction) => {
                      const teamRef = doc(db, "teams", myTeamId);
                      const meRef = doc(db, "users", myUid);
                      const targetRef = doc(db, "users", targetUid);
                      transaction.update(teamRef, { captainId: targetUid, leaderName: targetName });
                      transaction.update(meRef, { role: 'member' });
                      transaction.update(targetRef, { role: 'leader' });
                  });
                  Alert.alert('완료', `이제 ${targetName}님이 주장입니다.`);
                  setShowMemberAction(false);
              } catch (e) { Alert.alert('오류', '위임 실패'); }
          }}
      ]);
  };

  const handleCallMember = async () => {
      if (!selectedMember?.uid) return;
      if (!isCaptain) return; 
      try {
          const uSnap = await getDoc(doc(db, "users", selectedMember.uid));
          const phone = uSnap.data()?.phoneNumber || uSnap.data()?.phone;
          if (phone) Linking.openURL(`tel:${phone}`);
          else Alert.alert('알림', '전화번호 정보가 없습니다.');
      } catch(e) { Alert.alert('오류', '정보 로드 실패'); }
  };

  const handleApproveRequest = async (req: JoinRequest) => {
    if (!myTeamId) return;
    try {
        await runTransaction(db, async (transaction) => {
            const teamRef = doc(db, "teams", myTeamId);
            const userRef = doc(db, "users", req.uid);
            const newPlayer = { id: Date.now(), uid: req.uid, name: req.name, position: req.position };
            
            transaction.update(teamRef, { joinRequests: arrayRemove(req), roster: arrayUnion(newPlayer), members: arrayUnion(req.uid) });
            transaction.update(userRef, { teamId: myTeamId, role: 'member', appliedTeamId: null });
        });
    } catch (e) { Alert.alert('오류', '승인 실패'); }
  };

  const handleKickMember = () => {
      Alert.alert('알림', '내보내기 기능은 다음 업데이트에 제공됩니다.');
  };

  // --- [5. 렌더링 분기] ---

  // 5-1. 로딩 중
  if (status === 'loading') {
      return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator size="large" color={THEME.primary} /></View>;
  }

  // 5-2. 가입 대기 중 (Pending)
  if (status === 'pending') {
      return (
          <SafeAreaView className="flex-1 bg-white justify-center items-center px-6">
              <View className="bg-blue-50 p-8 rounded-full mb-6">
                  <FontAwesome5 name="clock" size={48} color={THEME.primary} />
              </View>
              <Text className="text-2xl font-extrabold text-gray-900 mb-2">가입 수락 대기 중</Text>
              <Text className="text-gray-500 text-center mb-8 leading-6">
                  팀 대표자가 가입 요청을 확인하고 있습니다.{'\n'}조금만 기다려주세요!
              </Text>
              <TouchableOpacity 
                  onPress={() => Alert.alert('알림', '가입 취소 기능은 준비 중입니다.')} 
                  className="bg-gray-100 py-3 px-6 rounded-xl"
              >
                  <Text className="text-gray-600 font-bold">요청 취소하기</Text>
              </TouchableOpacity>
          </SafeAreaView>
      );
  }

  // 5-3. 팀 없음 (No Team)
  if (status === 'noTeam') {
      return (
          <SafeAreaView className="flex-1 bg-white justify-center items-center px-6">
              <View className="mb-6 opacity-80">
                <FontAwesome5 name="users" size={64} color="#E5E7EB" />
              </View>
              <Text className="text-2xl font-extrabold text-gray-900 mb-3 text-center">아직 팀이 없으시네요!</Text>
              <Text className="text-gray-500 text-center mb-10 leading-6 text-base">
                  새로운 팀을 만들거나{'\n'}기존 팀에 가입하여 활동을 시작해보세요!
              </Text>
              
              <TouchableOpacity 
                  onPress={() => router.push('/team/register')} 
                  className="w-full bg-blue-600 py-4 rounded-xl items-center shadow-md shadow-blue-200 flex-row justify-center"
              >
                  <FontAwesome5 name="search-plus" size={18} color="white" style={{ marginRight: 8 }} />
                  <Text className="text-white font-bold text-lg">새로운 팀 찾기 / 만들기</Text>
              </TouchableOpacity>
          </SafeAreaView>
      );
  }

  // 5-4. 팀 관리 화면 (Has Team)
  
  // 팀원 정렬 (주장 맨 위)
  const sortedRoster = teamData?.roster ? [...teamData.roster].sort((a, b) => {
      const aIsCapt = a.uid === teamData.captainId;
      const bIsCapt = b.uid === teamData.captainId;
      if (aIsCapt && !bIsCapt) return -1;
      if (!aIsCapt && bIsCapt) return 1;
      return 0;
  }) : [];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      
      {/* Header */}
      <View className="bg-white px-5 pt-3 pb-2 border-b border-gray-100 shadow-sm z-10">
         <View className="flex-row justify-between items-center mb-6">
             <View>
                <View className="flex-row items-center mb-1">
                    <Text className="text-2xl font-extrabold text-gray-900 tracking-tight mr-2">{teamData?.name || '팀 정보'}</Text>
                    {isCaptain && <View className="bg-blue-100 px-2 py-0.5 rounded"><Text className="text-[10px] font-bold text-blue-600">Leader</Text></View>}
                </View>
                <Text className="text-gray-500 font-medium text-sm">
                    {teamData?.affiliation || '-'} · {teamData?.region || '지역미정'}
                </Text>
             </View>
         </View>

         {/* Dashboard Card */}
         <View className="bg-gray-50 rounded-2xl p-4 flex-row justify-between items-center mb-6 border border-gray-100">
             <View className="flex-1 items-center border-r border-gray-200">
                 <Text className="text-gray-400 text-xs font-bold mb-1">랭킹</Text>
                 <View className="flex-row items-baseline">
                     <Text className="text-xl font-black text-gray-900">{teamData?.stats?.rank || '-'}</Text>
                     <Text className="text-xs text-gray-500 font-medium ml-0.5">위</Text>
                 </View>
             </View>
             <View className="flex-1 items-center border-r border-gray-200">
                 <Text className="text-gray-400 text-xs font-bold mb-1">승점</Text>
                 <View className="flex-row items-baseline">
                     <Text className="text-xl font-black text-blue-600">{teamData?.stats?.points || 0}</Text>
                     <Text className="text-xs text-gray-500 font-medium ml-0.5">점</Text>
                 </View>
             </View>
             <View className="flex-1 items-center">
                 <Text className="text-gray-400 text-xs font-bold mb-1">전적</Text>
                 <Text className="text-base font-bold text-gray-900">
                     {teamData?.stats?.wins || 0}승 {teamData?.stats?.losses || 0}패
                 </Text>
             </View>
         </View>
        
        {/* Tabs */}
        <View className="flex-row gap-8">
            <TouchableOpacity onPress={() => setActiveTab('schedule')} className="pb-3" style={{ borderBottomWidth: 3, borderBottomColor: activeTab === 'schedule' ? THEME.primary : 'transparent' }}>
                <Text className={`text-[16px] font-bold ${activeTab === 'schedule' ? 'text-gray-900' : 'text-gray-400'}`}>
                    {isCaptain ? '일정 관리' : '일정'}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveTab('member')} className="pb-3" style={{ borderBottomWidth: 3, borderBottomColor: activeTab === 'member' ? THEME.primary : 'transparent' }}>
                <Text className={`text-[16px] font-bold ${activeTab === 'member' ? 'text-gray-900' : 'text-gray-400'}`}>멤버 ({teamData?.roster?.length || 0})</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* Content Area */}
      <ScrollView contentContainerClassName="pb-32 pt-4 bg-gray-50" showsVerticalScrollIndicator={false}>
          
          {/* --- [Tab: Schedule] --- */}
          {activeTab === 'schedule' && (
              <View className="px-5">
                {/* Hero Card (Upcoming) */}
                {upcomingMatch ? (
                    <View className="mb-8">
                        <View className="flex-row justify-between items-end mb-3 px-1">
                            <Text className="text-lg font-bold text-gray-900">다가오는 매치 🔥</Text>
                            <Text className="text-xs font-bold text-blue-600">{getDDay(upcomingMatch.time)}</Text>
                        </View>
                        <TouchableOpacity 
                            onPress={() => isCaptain && router.push(`/match/${upcomingMatch.id}`)} // 팀원은 클릭 불가
                            activeOpacity={isCaptain ? 0.9 : 1}
                            className="bg-white p-6 rounded-[24px] shadow-sm border border-blue-100 relative overflow-hidden"
                        >
                            <View className="absolute top-0 right-0 p-4 opacity-5"><FontAwesome5 name="volleyball-ball" size={80} color={THEME.primary} /></View>
                            <Text className="text-blue-600 font-bold text-xs mb-2 tracking-wider">MATCH DAY</Text>
                            <Text className="text-3xl font-black text-gray-900 mb-1">{upcomingMatch.time.slice(11,16)}</Text>
                            <Text className="text-gray-500 font-medium text-sm mb-6">{formatTime(upcomingMatch.time)} · {upcomingMatch.loc}</Text>
                            <View className="bg-gray-50 p-4 rounded-xl flex-row items-center justify-between">
                                <Text className="font-bold text-gray-700 text-base">vs {upcomingMatch.hostId === myTeamId ? '상대 미정' : upcomingMatch.team}</Text>
                                {/* 팀원에게는 화살표도 숨겨서 클릭 불가임을 암시 */}
                                {isCaptain && <FontAwesome5 name="chevron-right" size={12} color="#9CA3AF" />}
                            </View>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View className="bg-white p-8 rounded-2xl border border-gray-100 items-center justify-center mb-6 shadow-sm">
                        <FontAwesome5 name="calendar-check" size={32} color="#E5E7EB" style={{ marginBottom: 12 }} />
                        <Text className="text-gray-400 font-bold mb-4">예정된 경기가 없습니다.</Text>
                        {/* 팀 대표에게만 생성 버튼 노출 */}
                        {isCaptain && (
                            <TouchableOpacity className="bg-gray-900 py-3 px-5 rounded-xl shadow-lg" onPress={handleCreateMatch}>
                                <Text className="text-white font-bold text-xs">매치 생성하기</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* List */}
                {(recruitingMatches.length > 0 || futureMatches.length > 0) && (
                    <View className="mb-6">
                        <Text className="text-gray-900 font-bold text-lg mb-3 px-1">예정된 일정</Text>
                        {[...recruitingMatches, ...futureMatches].map(m => {
                            const isHost = m.hostId === myTeamId;
                            const isRecruiting = m.status === 'recruiting';
                            let statusText = '';
                            let badge = null;

                            if (isRecruiting) {
                                if (isHost) {
                                    statusText = "상대 모집중";
                                    badge = <View className="bg-orange-100 px-1.5 py-0.5 rounded"><Text className="text-[10px] text-orange-600 font-bold">모집중</Text></View>;
                                } else {
                                    statusText = "수락 대기중";
                                    badge = <View className="bg-gray-100 px-1.5 py-0.5 rounded"><Text className="text-[10px] text-gray-500 font-bold">신청완료</Text></View>;
                                }
                            } else {
                                statusText = `vs ${isHost ? '상대팀' : m.team}`;
                            }

                            return (
                                <TouchableOpacity 
                                    key={m.id} 
                                    onPress={() => isCaptain && router.push(`/match/${m.id}`)} // 팀원은 클릭 불가
                                    activeOpacity={isCaptain ? 0.7 : 1}
                                    className="bg-white p-5 rounded-2xl mb-3 shadow-sm border border-gray-100 flex-row items-center"
                                >
                                    <View className="bg-gray-50 w-14 h-14 rounded-xl items-center justify-center mr-4">
                                        <Text className="text-gray-900 font-bold text-lg">{m.time.slice(8,10)}</Text>
                                        <Text className="text-gray-400 text-[10px] font-bold">일</Text>
                                    </View>
                                    <View className="flex-1">
                                        <View className="flex-row items-center mb-1">
                                            <Text className="font-bold text-gray-900 text-base mr-2" numberOfLines={1}>
                                                {statusText}
                                            </Text>
                                            {badge}
                                        </View>
                                        <Text className="text-gray-500 text-xs">{formatTime(m.time)} · {m.loc}</Text>
                                    </View>
                                    {isCaptain && <FontAwesome5 name="chevron-right" size={14} color="#D1D5DB" />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {/* Past Matches */}
                {pastMatches.length > 0 && (
                    <View className="mt-4">
                        <Text className="text-gray-400 font-bold text-sm mb-3 px-1">지난 경기 기록</Text>
                        {pastMatches.map(m => {
                             const isHost = m.hostId === myTeamId;
                             const myScore = isHost ? m.result?.hostScore : m.result?.guestScore;
                             const opScore = isHost ? m.result?.guestScore : m.result?.hostScore;
                             const hasResult = m.result?.status === 'verified';
                             return (
                                <View key={m.id} className="bg-white px-5 py-4 rounded-xl mb-2 border border-gray-100 flex-row items-center justify-between opacity-80">
                                    <View>
                                        <Text className="text-gray-400 text-xs mb-0.5">{m.time.slice(0,10)}</Text>
                                        <Text className="text-gray-600 font-bold text-sm">vs {isHost ? 'Guest' : m.team}</Text>
                                    </View>
                                    {hasResult ? (
                                        <View className="flex-row items-center bg-gray-50 px-3 py-1.5 rounded-lg">
                                            <Text className={`font-black ${Number(myScore) > Number(opScore) ? 'text-blue-600' : 'text-gray-400'}`}>{myScore}</Text>
                                            <Text className="text-xs text-gray-300 mx-1">:</Text>
                                            <Text className={`font-black ${Number(myScore) < Number(opScore) ? 'text-blue-600' : 'text-gray-400'}`}>{opScore}</Text>
                                        </View>
                                    ) : <Text className="text-xs text-gray-300">결과 미입력</Text>}
                                </View>
                             );
                        })}
                    </View>
                )}
              </View>
          )}

          {/* --- [Tab: Member] --- */}
          {activeTab === 'member' && (
              <View className="px-5">
                
                {/* 1. 가입 요청 배너 (Only Captain) */}
                {isCaptain && teamData?.joinRequests && teamData.joinRequests.length > 0 && (
                    <TouchableOpacity onPress={() => setShowRequestModal(true)} className="bg-white border border-red-100 p-5 rounded-2xl mb-6 shadow-sm flex-row items-center">
                        <View className="w-10 h-10 bg-red-50 rounded-full items-center justify-center mr-3">
                            <FontAwesome5 name="bell" size={16} color="#EF4444" />
                        </View>
                        <View className="flex-1">
                            <Text className="font-bold text-gray-900 text-base">가입 요청이 있어요!</Text>
                            <Text className="text-xs text-gray-500">{teamData.joinRequests.length}명이 승인을 기다립니다.</Text>
                        </View>
                        <View className="bg-red-500 px-3 py-1 rounded-full"><Text className="text-white text-xs font-bold">확인</Text></View>
                    </TouchableOpacity>
                )}

                {/* 2. 팀원 초대 버튼 (Only Captain) */}
                {isCaptain && (
                    <TouchableOpacity onPress={handleInvite} className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-xl flex-row justify-center items-center">
                        <FontAwesome5 name="share-alt" size={16} color={THEME.primary} style={{ marginRight: 8 }} />
                        <Text className="text-blue-600 font-bold">팀원 초대 링크 보내기</Text>
                    </TouchableOpacity>
                )}

                {/* 3. 팀원 리스트 (Sorted: Captain First) */}
                <Text className="text-gray-900 font-bold text-lg mb-3 px-1">팀원 목록</Text>
                {sortedRoster.map((player, index) => {
                    const isLeader = player.uid === teamData?.captainId;
                    return (
                        <TouchableOpacity 
                            key={player.id || index}
                            disabled={!isCaptain || player.uid === auth.currentUser?.uid} 
                            onPress={() => { setSelectedMember(player); setShowMemberAction(true); }}
                            className="bg-white p-4 rounded-2xl mb-2.5 shadow-sm border border-gray-100 flex-row items-center"
                        >
                            <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isLeader ? 'bg-blue-50' : 'bg-gray-50'}`}>
                                {isLeader ? <FontAwesome5 name="crown" size={16} color="#2563EB" /> : <Text className="font-bold text-gray-400 text-sm">{player.position}</Text>}
                            </View>
                            <View className="flex-1">
                                <View className="flex-row items-center">
                                    <Text className="font-bold text-gray-900 text-base mr-2">{player.name}</Text>
                                    {player.uid === auth.currentUser?.uid && <Text className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">나</Text>}
                                </View>
                                <Text className="text-xs text-gray-400 mt-0.5">{player.position} · {isLeader ? '팀 대표' : '팀원'}</Text>
                            </View>
                            {/* 대표만 ... 메뉴 보임 */}
                            {isCaptain && !isLeader && <FontAwesome5 name="ellipsis-v" size={14} color="#E5E7EB" className="p-3" />}
                        </TouchableOpacity>
                    );
                })}
              </View>
          )}
      </ScrollView>

      {/* FAB 삭제됨 */}

      {/* --- [Modals] --- */}
      <Modal visible={showMemberAction} transparent animationType="fade">
          <TouchableOpacity activeOpacity={1} onPress={() => setShowMemberAction(false)} className="flex-1 bg-black/40 justify-end">
              <View className="bg-white rounded-t-[30px] p-6 pb-10">
                  <View className="items-center mb-8">
                      <View className="w-10 h-1 bg-gray-200 rounded-full mb-4" />
                      <Text className="text-xl font-bold text-gray-900">{selectedMember?.name}</Text>
                      <Text className="text-sm text-gray-500">{selectedMember?.position} · Member</Text>
                  </View>
                  
                  {/* 메뉴들 (Captain Only) */}
                  <TouchableOpacity onPress={handleCallMember} className="bg-gray-50 p-4 rounded-2xl flex-row items-center mb-3">
                      <FontAwesome5 name="phone-alt" size={18} color="#4B5563" className="mr-3" />
                      <Text className="text-base font-bold text-gray-700">전화 걸기</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => { setShowMemberAction(false); setTimeout(() => Alert.alert('확인', '위임하시겠습니까?', [{text:'취소'}, {text:'위임', onPress: handleTransferCaptain}]), 300); }} className="bg-gray-50 p-4 rounded-2xl flex-row items-center mb-3">
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