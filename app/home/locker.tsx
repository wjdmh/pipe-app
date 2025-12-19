import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, FlatList, Platform, Linking, Image } from 'react-native';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, arrayRemove, arrayUnion, runTransaction } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS } from '../../configs/theme';
import { useMatchResult } from '../../hooks/useMatchResult';

// --- Types ---
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

// --- Helper Functions ---
const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}.${day} (${dayOfWeek}) ${hours}:${minutes}`;
};

const getDDay = (targetDate: string) => {
    const today = new Date();
    const target = new Date(targetDate);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return '종료';
    if (diff === 0) return 'D-Day';
    return `D-${Math.ceil(diff)}`;
};

export default function LockerScreen() {
  const router = useRouter();
  const { initialTab } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'schedule' | 'member'>('schedule');
  const [loading, setLoading] = useState(true);
  
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  
  // Matches State
  const [matches, setMatches] = useState<MatchData[]>([]);
  
  // Modals & Action Sheets
  const [selectedMember, setSelectedMember] = useState<Player | null>(null);
  const [showMemberAction, setShowMemberAction] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false); // 가입 요청 모달

  const { isProcessing, approveResult, disputeResult } = useMatchResult();

  // --- Data Fetching ---
  useEffect(() => {
      if (initialTab === 'matches') setActiveTab('schedule');
      
      const fetchMyTeam = async () => {
        const user = auth.currentUser;
        if (!user) return;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const tid = userDoc.data()?.teamId;
        
        if (tid) {
          setMyTeamId(tid);
          // Team Realtime Listener
          const unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => {
              if (d.exists()) {
                  const data = d.data();
                  // 여기서 id 중복 문제를 방지하기 위해 as TeamData를 나중에 붙입니다.
                  setTeamData({ id: d.id, ...data } as TeamData);
                  setIsCaptain(data.captainId === user.uid);
              }
              setLoading(false);
          });
          return unsubTeam;
        } else {
            setLoading(false);
            // 팀이 없는 경우 처리 (예: 홈으로 이동 or 안내)
        }
      };
      fetchMyTeam();
  }, []);

  useEffect(() => {
    if (!myTeamId) return;
    
    // Fetch All Related Matches (Hosting, Applying, Matched)
    const q = query(collection(db, "matches")); 
    
    const unsub = onSnapshot(q, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => {
            const data = d.data(); // [수정] 여기서 as MatchData를 제거하여 id 속성 충돌 방지
            if (data.isDeleted) return;
            
            // 내가 호스트거나, 게스트거나, 신청자 목록에 있거나
            if (data.hostId === myTeamId || data.guestId === myTeamId || data.applicants?.includes(myTeamId)) {
                // [수정] 최종 객체 생성 시점에 타입 단언
                list.push({ id: d.id, ...data } as MatchData);
            }
        });
        setMatches(list);
    });

    return () => unsub();
  }, [myTeamId]);

  // --- Filtered Lists ---
  const { upcomingMatch, futureMatches, pastMatches, recruitingMatches } = useMemo(() => {
      const now = new Date().toISOString();
      
      const confirmed = matches.filter(m => m.status === 'matched' || m.status === 'finished' || m.status === 'dispute');
      const recruiting = matches.filter(m => m.status === 'recruiting'); // 내가 지원한 것 + 내가 모집 중인 것

      // 확정된 경기 중 미래/과거 분류
      const future = confirmed.filter(m => m.time > now).sort((a, b) => a.time.localeCompare(b.time));
      const past = confirmed.filter(m => m.time <= now).sort((a, b) => b.time.localeCompare(a.time));

      // 가장 가까운 미래 경기 (D-Day)
      const upcoming = future.length > 0 ? future[0] : null;
      const othersFuture = future.length > 0 ? future.slice(1) : [];

      return {
          upcomingMatch: upcoming,
          futureMatches: othersFuture,
          pastMatches: past,
          recruitingMatches: recruiting.sort((a,b) => a.time.localeCompare(b.time))
      };
  }, [matches]);


  // --- Actions ---

  // 1. 주장 위임 (Double Confirm)
  const handleTransferCaptain = async () => {
      if (!selectedMember || !selectedMember.uid || !myTeamId) return;
      const targetName = selectedMember.name;
      const targetUid = selectedMember.uid;

      const executeTransfer = async () => {
          try {
              await runTransaction(db, async (transaction) => {
                  const teamRef = doc(db, "teams", myTeamId);
                  const meRef = doc(db, "users", auth.currentUser!.uid);
                  const targetRef = doc(db, "users", targetUid);

                  transaction.update(teamRef, { 
                      captainId: targetUid,
                      leaderName: targetName
                  });
                  transaction.update(meRef, { role: 'member' });
                  transaction.update(targetRef, { role: 'leader' });
              });
              Alert.alert('완료', `이제 ${targetName}님이 주장입니다.`);
              setShowMemberAction(false);
              // 페이지 리프레시 효과는 onSnapshot이 처리
          } catch (e) {
              Alert.alert('오류', '위임 처리에 실패했습니다.');
          }
      };

      // 2차 확인
      Alert.alert(
          '정말 위임하시겠습니까?',
          `주장 권한을 ${targetName}님에게 넘기면\n회원님은 일반 팀원이 됩니다.`,
          [
              { text: '취소', style: 'cancel' },
              { text: '위임하기', style: 'destructive', onPress: executeTransfer }
          ]
      );
  };

  // 1차 확인 (메뉴 선택 시)
  const confirmTransfer = () => {
      Alert.alert(
          '주장 권한 위임',
          `${selectedMember?.name}님을 새로운 주장으로 임명하시겠습니까?`,
          [
              { text: '아니오', style: 'cancel' },
              { text: '네, 진행합니다', onPress: handleTransferCaptain }
          ]
      );
  };

  const handleKickMember = async () => {
      if (!selectedMember || !myTeamId) return;
      // ... (기존 로직 유지 또는 구현)
      Alert.alert('알림', '내보내기 기능은 팀 관리 페이지 업데이트 후 제공됩니다.'); 
  };

  const handleCallMember = async () => {
      // 실제 전화번호는 DB에서 가져와야 함 (보안상 로스터에는 없을 수 있음)
      if (!selectedMember?.uid) return;
      try {
          const uSnap = await getDoc(doc(db, "users", selectedMember.uid));
          const phone = uSnap.data()?.phoneNumber || uSnap.data()?.phone;
          if (phone) {
              Linking.openURL(`tel:${phone}`);
          } else {
              Alert.alert('알림', '전화번호 정보가 없습니다.');
          }
      } catch(e) { Alert.alert('오류', '정보를 불러오지 못했습니다.'); }
  };

  // 가입 요청 승인
  const handleApproveRequest = async (req: JoinRequest) => {
    if (!myTeamId) return;
    try {
        await runTransaction(db, async (transaction) => {
            const teamRef = doc(db, "teams", myTeamId);
            const userRef = doc(db, "users", req.uid);
            
            const newPlayer = { id: Date.now(), uid: req.uid, name: req.name, position: req.position };
            
            transaction.update(teamRef, {
                joinRequests: arrayRemove(req),
                roster: arrayUnion(newPlayer),
                members: arrayUnion(req.uid)
            });
            transaction.update(userRef, { teamId: myTeamId, role: 'member' });
        });
    } catch (e) { Alert.alert('오류', '승인 실패'); }
  };

  if (loading) return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      
      {/* 1. Header Area */}
      <View className="px-6 pt-4 pb-2 bg-white">
          <View className="flex-row justify-between items-start mb-1">
              <View>
                  <Text className="text-3xl font-extrabold text-slate-900 tracking-tight">{teamData?.name}</Text>
                  <Text className="text-slate-500 font-medium mt-1">
                      {teamData?.region || '지역미정'} · {teamData?.level}급 · {teamData?.roster?.length}명
                  </Text>
              </View>
              {/* Stats Badge */}
              <View className="items-end">
                  <View className="flex-row items-baseline">
                      <Text className="text-xs text-slate-400 font-bold mr-1">승점</Text>
                      <Text className="text-2xl font-black text-indigo-600">{teamData?.stats?.points || 0}</Text>
                  </View>
                  <View className="flex-row gap-2 mt-1">
                      <Text className="text-xs font-bold text-slate-600">
                          {teamData?.stats?.rank ? `${teamData.stats.rank}위` : '- 위'}
                      </Text>
                      <Text className="text-xs text-slate-400">|</Text>
                      <Text className="text-xs text-slate-500">
                          {teamData?.stats?.wins}승 {teamData?.stats?.losses}패
                      </Text>
                  </View>
              </View>
          </View>
      </View>

      {/* 2. Tabs */}
      <View className="flex-row border-b border-slate-100 mt-4 px-2">
          <TouchableOpacity 
              onPress={() => setActiveTab('schedule')} 
              className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'schedule' ? 'border-indigo-600' : 'border-transparent'}`}
          >
              <Text className={`font-bold ${activeTab === 'schedule' ? 'text-indigo-600' : 'text-slate-400'}`}>일정</Text>
          </TouchableOpacity>
          <TouchableOpacity 
              onPress={() => setActiveTab('member')} 
              className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'member' ? 'border-indigo-600' : 'border-transparent'}`}
          >
              <Text className={`font-bold ${activeTab === 'member' ? 'text-indigo-600' : 'text-slate-400'}`}>팀원</Text>
          </TouchableOpacity>
      </View>

      {/* 3. Content Area */}
      <ScrollView contentContainerClassName="pb-24 pt-4 px-6" showsVerticalScrollIndicator={false}>
          
          {/* --- SCHEDULE TAB --- */}
          {activeTab === 'schedule' && (
              <>
                {/* Upcoming Match Highlight */}
                {upcomingMatch && (
                    <View className="mb-6">
                        <Text className="text-xs font-bold text-indigo-500 mb-2 ml-1">다가오는 경기 🔥</Text>
                        <TouchableOpacity 
                            className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl shadow-sm"
                            onPress={() => router.push(`/match/${upcomingMatch.id}`)}
                        >
                            <View className="flex-row justify-between items-center mb-3">
                                <View className="bg-white px-2 py-1 rounded-md border border-indigo-100">
                                    <Text className="text-xs font-bold text-indigo-600">{getDDay(upcomingMatch.time)}</Text>
                                </View>
                                <Text className="text-xs text-indigo-400 font-bold">매칭 확정</Text>
                            </View>
                            <View className="flex-row items-center mb-1">
                                <Text className="text-xl font-bold text-slate-800 mr-2">{formatTime(upcomingMatch.time)}</Text>
                            </View>
                            <Text className="text-base font-medium text-slate-600 mb-1">vs {upcomingMatch.hostId === myTeamId ? '상대팀 미정' : upcomingMatch.team}</Text>
                            <Text className="text-sm text-slate-400">{upcomingMatch.loc}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Processing / Future Matches */}
                <View className="mb-6">
                    <Text className="text-slate-900 font-bold text-lg mb-3 ml-1">예정된 일정</Text>
                    
                    {recruitingMatches.length === 0 && futureMatches.length === 0 && !upcomingMatch && (
                        <View className="py-8 items-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <Text className="text-slate-400 text-sm">잡힌 일정이 없어요.</Text>
                        </View>
                    )}

                    {/* Recruiting / Applying */}
                    {recruitingMatches.map(m => (
                        <View key={m.id} className="flex-row py-4 border-b border-slate-100 items-center">
                            <View className="w-16">
                                <Text className="font-bold text-slate-700 text-sm">{m.time.slice(5,10)}</Text>
                                <Text className="text-xs text-slate-400">{m.time.slice(11,16)}</Text>
                            </View>
                            <View className="flex-1 px-3">
                                <Text className="font-medium text-slate-800 truncate" numberOfLines={1}>{m.loc}</Text>
                                <Text className="text-xs text-slate-500">
                                    {m.hostId === myTeamId ? '우리팀 모집중' : '지원중...'}
                                </Text>
                            </View>
                            <View className="bg-slate-100 px-2 py-1 rounded">
                                <Text className="text-xs font-bold text-slate-500">모집중</Text>
                            </View>
                        </View>
                    ))}

                    {/* Confirmed Future (excluding upcoming if highlighted) */}
                    {futureMatches.map(m => (
                        <TouchableOpacity key={m.id} onPress={() => router.push(`/match/${m.id}`)} className="flex-row py-4 border-b border-slate-100 items-center">
                            <View className="w-16">
                                <Text className="font-bold text-slate-800 text-sm">{m.time.slice(5,10)}</Text>
                                <Text className="text-xs text-slate-400">{m.time.slice(11,16)}</Text>
                            </View>
                            <View className="flex-1 px-3">
                                <Text className="font-bold text-slate-800">vs {m.hostId === myTeamId ? '상대팀' : m.team}</Text>
                                <Text className="text-xs text-slate-500 truncate">{m.loc}</Text>
                            </View>
                            <View className="bg-green-50 px-2 py-1 rounded">
                                <Text className="text-xs font-bold text-green-600">확정</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Past Matches */}
                {pastMatches.length > 0 && (
                    <View className="mb-6">
                         <Text className="text-slate-400 font-bold text-sm mb-3 ml-1">지난 경기</Text>
                         {pastMatches.map(m => {
                             const isHost = m.hostId === myTeamId;
                             const myScore = isHost ? m.result?.hostScore : m.result?.guestScore;
                             const opScore = isHost ? m.result?.guestScore : m.result?.hostScore;
                             const hasResult = m.result?.status === 'verified';

                             return (
                                <View key={m.id} className="flex-row py-3 border-b border-slate-50 items-center opacity-70">
                                    <View className="w-16">
                                        <Text className="text-slate-400 text-sm">{m.time.slice(5,10)}</Text>
                                    </View>
                                    <View className="flex-1 px-3">
                                        <Text className="text-slate-600 text-sm">vs {isHost ? 'Guest' : m.team}</Text>
                                    </View>
                                    {hasResult ? (
                                        <View className="flex-row items-center bg-slate-100 px-2 py-1 rounded-lg">
                                            <Text className={`font-bold ${myScore! > opScore! ? 'text-indigo-500' : 'text-slate-500'}`}>{myScore}</Text>
                                            <Text className="text-xs text-slate-300 mx-1">:</Text>
                                            <Text className={`font-bold ${myScore! < opScore! ? 'text-indigo-500' : 'text-slate-500'}`}>{opScore}</Text>
                                        </View>
                                    ) : (
                                        <Text className="text-xs text-slate-400">결과 미입력</Text>
                                    )}
                                </View>
                             );
                         })}
                    </View>
                )}
              </>
          )}

          {/* --- MEMBER TAB --- */}
          {activeTab === 'member' && (
              <>
                {/* Join Request Banner (Captain Only) */}
                {isCaptain && teamData?.joinRequests && teamData.joinRequests.length > 0 && (
                    <TouchableOpacity 
                        onPress={() => setShowRequestModal(true)}
                        className="bg-red-50 border border-red-100 p-4 rounded-xl mb-6 flex-row justify-between items-center"
                    >
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 bg-red-100 rounded-full items-center justify-center mr-3">
                                <FontAwesome5 name="bell" size={14} color="#EF4444" />
                            </View>
                            <View>
                                <Text className="font-bold text-slate-800">가입 요청이 {teamData.joinRequests.length}건 있어요</Text>
                                <Text className="text-xs text-slate-500">터치해서 확인하기</Text>
                            </View>
                        </View>
                        <FontAwesome5 name="chevron-right" size={12} color="#EF4444" />
                    </TouchableOpacity>
                )}

                {/* Roster List */}
                <View className="mb-4 flex-row justify-between items-end">
                     <Text className="text-slate-900 font-bold text-lg ml-1">멤버 ({teamData?.roster?.length || 0})</Text>
                     <TouchableOpacity onPress={() => Alert.alert('준비중', '초대 기능은 곧 업데이트됩니다.')}>
                         <Text className="text-indigo-600 font-bold text-sm">+ 초대</Text>
                     </TouchableOpacity>
                </View>

                {teamData?.roster?.map((player, index) => {
                    const isLeader = player.uid === teamData.captainId;
                    return (
                        <TouchableOpacity 
                            key={player.id || index}
                            disabled={!isCaptain || player.uid === auth.currentUser?.uid}
                            onPress={() => { setSelectedMember(player); setShowMemberAction(true); }}
                            className="flex-row items-center py-3 border-b border-slate-50"
                        >
                            {/* Profile Icon / Position */}
                            <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isLeader ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                                {isLeader ? (
                                    <FontAwesome5 name="crown" size={14} color="#4F46E5" />
                                ) : (
                                    <Text className="font-bold text-slate-500 text-xs">{player.position}</Text>
                                )}
                            </View>
                            
                            {/* Info */}
                            <View className="flex-1">
                                <View className="flex-row items-center">
                                    <Text className="font-bold text-slate-800 text-base mr-2">{player.name}</Text>
                                    {player.uid === auth.currentUser?.uid && <Text className="text-xs text-slate-400">(나)</Text>}
                                </View>
                                <Text className="text-xs text-slate-400">{player.position} · {isLeader ? 'Leader' : 'Member'}</Text>
                            </View>

                            {/* Action Icon (Only for Captain viewing others) */}
                            {isCaptain && !isLeader && (
                                <FontAwesome5 name="ellipsis-v" size={14} color="#CBD5E1" className="p-2" />
                            )}
                        </TouchableOpacity>
                    );
                })}
              </>
          )}
      </ScrollView>

      {/* --- FAB (Floating Action Button) for Schedule --- */}
      {activeTab === 'schedule' && (
          <TouchableOpacity 
            className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full items-center justify-center shadow-lg shadow-indigo-200"
            onPress={() => Alert.alert('준비중', '자체 일정 등록 기능은 곧 업데이트됩니다!')}
          >
              <FontAwesome5 name="plus" size={20} color="white" />
          </TouchableOpacity>
      )}

      {/* --- Modals --- */}

      {/* 1. Member Action Sheet (Custom Modal) */}
      <Modal visible={showMemberAction} transparent animationType="fade">
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => setShowMemberAction(false)}
            className="flex-1 bg-black/40 justify-end"
          >
              <View className="bg-white rounded-t-3xl p-6 pb-10">
                  <View className="items-center mb-6">
                      <View className="w-12 h-1 bg-slate-200 rounded-full mb-4" />
                      <Text className="text-lg font-bold text-slate-900">{selectedMember?.name}님 관리</Text>
                      <Text className="text-sm text-slate-500">{selectedMember?.position} · Member</Text>
                  </View>

                  <TouchableOpacity onPress={handleCallMember} className="py-4 border-b border-slate-100 flex-row items-center">
                      <View className="w-8 items-center"><FontAwesome5 name="phone-alt" size={16} color="#334155" /></View>
                      <Text className="text-base font-medium text-slate-700 ml-2">전화 걸기</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={confirmTransfer} className="py-4 border-b border-slate-100 flex-row items-center">
                      <View className="w-8 items-center"><FontAwesome5 name="crown" size={16} color="#334155" /></View>
                      <Text className="text-base font-medium text-slate-700 ml-2">주장 위임하기</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleKickMember} className="py-4 flex-row items-center">
                      <View className="w-8 items-center"><FontAwesome5 name="sign-out-alt" size={16} color="#EF4444" /></View>
                      <Text className="text-base font-bold text-red-500 ml-2">팀에서 내보내기</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setShowMemberAction(false)} className="mt-4 bg-slate-100 py-3 rounded-xl items-center">
                      <Text className="font-bold text-slate-600">닫기</Text>
                  </TouchableOpacity>
              </View>
          </TouchableOpacity>
      </Modal>

      {/* 2. Join Requests Modal */}
      <Modal visible={showRequestModal} animationType="slide" presentationStyle="pageSheet">
         <View className="flex-1 bg-white p-6">
            <View className="flex-row justify-between items-center mb-6 mt-4">
                <Text className="text-2xl font-bold text-slate-900">가입 요청</Text>
                <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                    <FontAwesome5 name="times" size={24} color="#94A3B8" />
                </TouchableOpacity>
            </View>
            <FlatList 
                data={teamData?.joinRequests || []}
                keyExtractor={item => item.uid}
                renderItem={({item}) => (
                    <View className="bg-white border border-slate-200 p-4 rounded-xl mb-3 shadow-sm">
                        <View className="flex-row justify-between mb-3">
                            <View>
                                <Text className="font-bold text-lg text-slate-800">{item.name}</Text>
                                <Text className="text-sm text-slate-500">희망 포지션: {item.position}</Text>
                            </View>
                            <Text className="text-xs text-slate-400">{item.requestedAt.split('T')[0]}</Text>
                        </View>
                        <View className="flex-row gap-2">
                            <TouchableOpacity onPress={() => handleApproveRequest(item)} className="flex-1 bg-indigo-600 py-3 rounded-lg items-center">
                                <Text className="text-white font-bold">승인</Text>
                            </TouchableOpacity>
                            <TouchableOpacity className="flex-1 bg-slate-100 py-3 rounded-lg items-center">
                                <Text className="text-slate-600 font-bold">거절</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                ListEmptyComponent={<Text className="text-center text-slate-400 mt-10">대기 중인 요청이 없습니다.</Text>}
            />
         </View>
      </Modal>

    </SafeAreaView>
  );
}