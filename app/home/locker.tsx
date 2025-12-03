import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, orderBy, arrayRemove, arrayUnion, addDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import tw from 'twrnc';
import { COLORS, TYPOGRAPHY } from '../../configs/theme';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useMatchResult } from '../../hooks/useMatchResult'; 

type JoinRequest = { uid: string; name: string; position: string; requestedAt: string; };
type Player = { id: number; uid?: string; name: string; position: string; };
type TeamData = { 
    id: string; name: string; affiliation: string; level: string; 
    stats: { wins: number; losses: number; points: number; total: number }; 
    roster: Player[]; captainId: string; 
    joinRequests?: JoinRequest[]; 
};
type MatchData = {
  id: string; hostId: string; guestId?: string; team: string; time: string; loc: string; 
  status: 'recruiting' | 'matched' | 'finished' | 'dispute';
  applicants: string[];
  result?: { hostScore: number; guestScore: number; status: 'waiting' | 'verified' | 'dispute'; submitterId?: string };
  isDeleted?: boolean;
  createdAt: string;
};

const POSITIONS = ['L', 'OH', 'OP', 'MB', 'S', 'Li'];
const LEVELS = ['A', 'B', 'C', 'D', 'E'];

export default function LockerScreen() {
  const router = useRouter();
  const { initialTab } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'team' | 'matches'>('team');
  const [loading, setLoading] = useState(true);
  
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  
  const [hostingList, setHostingList] = useState<MatchData[]>([]);
  const [applyingList, setApplyingList] = useState<MatchData[]>([]);
  const [confirmedList, setConfirmedList] = useState<MatchData[]>([]);
  
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPos, setNewPlayerPos] = useState('L');
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [teamDetailModalVisible, setTeamDetailModalVisible] = useState(false);

  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [myScoreInput, setMyScoreInput] = useState('');
  const [opScoreInput, setOpScoreInput] = useState('');
  
  const [applicantModalVisible, setApplicantModalVisible] = useState(false);
  const [applicantsData, setApplicantsData] = useState<any[]>([]);
  
  const [matchDetailModalVisible, setMatchDetailModalVisible] = useState(false);
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<{match: MatchData, opponentName: string, opponentPhone: string} | null>(null);

  const { isProcessing, submitResult, approveResult, disputeResult } = useMatchResult();

  const findCaptainId = async (teamId: string) => {
      try {
        const tSnap = await getDoc(doc(db, "teams", teamId));
        return tSnap.exists() ? tSnap.data().captainId : null;
      } catch (e) { return null; }
  };

  const sendNotification = async (targetUserId: string, type: string, title: string, msg: string) => {
      try {
          await addDoc(collection(db, "notifications"), {
              userId: targetUserId,
              type, title, message: msg,
              link: '/home/locker?initialTab=matches', 
              createdAt: new Date().toISOString(),
              isRead: false
          });
      } catch (e) {}
  };

  useEffect(() => {
      if (initialTab === 'matches') setActiveTab('matches');
  }, [initialTab]);

  useEffect(() => {
    const fetchMyTeam = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const tid = userDoc.data()?.teamId;
      
      if (tid) {
        setMyTeamId(tid);
        const unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => {
            if (d.exists()) {
                const data = d.data();
                // [Fix] 타입 충돌 방지를 위해 명시적 캐스팅 사용
                setTeamData({ id: d.id, ...data } as TeamData);
                setIsCaptain(data.captainId === user.uid);
            }
            setLoading(false);
        });
        return unsubTeam;
      } else {
          setLoading(false);
      }
    };
    fetchMyTeam();
  }, []);

  useEffect(() => {
    if (!myTeamId) return;
    
    const qHost = query(collection(db, "matches"), where("hostId", "==", myTeamId), where("status", "==", "recruiting"));
    const unsubHost = onSnapshot(qHost, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => { if(!d.data().isDeleted) list.push({id:d.id, ...d.data()} as MatchData) });
        setHostingList(list);
    });

    const qApply = query(collection(db, "matches"), where("applicants", "array-contains", myTeamId));
    const unsubApply = onSnapshot(qApply, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => { 
            if(d.data().status==='recruiting' && !d.data().isDeleted) list.push({id:d.id, ...d.data()} as MatchData) 
        });
        setApplyingList(list);
    });

    const qConfirmed = query(collection(db, "matches"), where("status", "in", ["matched", "finished", "dispute"]));
    const unsubConfirmed = onSnapshot(qConfirmed, (snap) => {
        const list: MatchData[] = [];
        snap.forEach(d => {
            const data = d.data();
            if(!data.isDeleted && (data.hostId === myTeamId || data.guestId === myTeamId)) {
                list.push({id:d.id, ...data} as MatchData);
            }
        });
        list.sort((a, b) => b.time.localeCompare(a.time));
        setConfirmedList(list);
    });

    return () => { unsubHost(); unsubApply(); unsubConfirmed(); };
  }, [myTeamId]);

  const handleApproveMember = async (req: JoinRequest) => {
      if (!isCaptain || !myTeamId) return;
      try {
          const newPlayer = { id: Date.now(), uid: req.uid, name: req.name, position: req.position };
          await updateDoc(doc(db, "teams", myTeamId), {
              joinRequests: arrayRemove(req),
              roster: arrayUnion(newPlayer),
              members: arrayUnion(req.uid)
          });
          await updateDoc(doc(db, "users", req.uid), { teamId: myTeamId, role: 'member' });
          Alert.alert('승인 완료', `${req.name}님이 팀원이 되었습니다.`);
      } catch (e) { Alert.alert('오류', '승인 처리에 실패했습니다.'); }
  };

  const handleRejectMember = async (req: JoinRequest) => {
      if (!isCaptain || !myTeamId) return;
      await updateDoc(doc(db, "teams", myTeamId), { joinRequests: arrayRemove(req) });
  };

  const handleKickMember = async (player: Player) => {
      if (!isCaptain || !myTeamId || !player.uid) return;
      Alert.alert('방출', '정말 방출하시겠습니까?', [
          { text: '취소' },
          { text: '방출', style: 'destructive', onPress: async () => {
              try {
                  await updateDoc(doc(db, "teams", myTeamId), { roster: arrayRemove(player), members: arrayRemove(player.uid) });
                  await updateDoc(doc(db, "users", player.uid!), { teamId: null, role: 'guest' });
                  Alert.alert('완료', '멤버를 방출했습니다.');
              } catch (e) { Alert.alert('오류', '방출 실패'); }
          }}
      ]);
  };

  const handleAddManualPlayer = async () => {
    if (!newPlayerName || !myTeamId) return;
    try {
      const newPlayer = { id: Date.now(), name: newPlayerName, position: newPlayerPos };
      await updateDoc(doc(db, "teams", myTeamId), { 
          roster: [...(teamData?.roster || []), newPlayer] 
      });
      setNewPlayerName('');
      Alert.alert('성공', '선수가 등록되었습니다.');
    } catch (e) { Alert.alert('오류', '선수 등록 실패'); }
  };

  const handleDeleteManualPlayer = async (pid: number) => {
    if (!myTeamId) return;
    const updated = (teamData?.roster || []).filter(p => p.id !== pid);
    await updateDoc(doc(db, "teams", myTeamId), { roster: updated });
  };

  const updateTeamLevel = async (lvl: string) => {
      if (!myTeamId) return;
      await updateDoc(doc(db, "teams", myTeamId), { level: lvl });
      setShowLevelModal(false);
  };

  const openApplicantModal = async (matchId: string, applicantIds: string[]) => {
    setSelectedMatchId(matchId);
    setApplicantsData([]);
    setApplicantModalVisible(true);
    const teams: any[] = [];
    for (const tid of applicantIds) {
      const tSnap = await getDoc(doc(db, "teams", tid));
      if (tSnap.exists()) teams.push({ id: tSnap.id, ...tSnap.data() });
    }
    setApplicantsData(teams);
  };

  const acceptMatch = async (guestTeamId: string) => {
    if (!selectedMatchId) return;
    Alert.alert('매칭 수락', '이 팀과 경기를 확정하시겠습니까?', [
      { text: '취소' },
      { text: '확정', onPress: async () => {
          try {
            await updateDoc(doc(db, "matches", selectedMatchId), { 
                status: 'matched', 
                guestId: guestTeamId, 
                applicants: [] 
            });
            const guestCaptainId = await findCaptainId(guestTeamId);
            if (guestCaptainId) await sendNotification(guestCaptainId, 'match_upcoming', '매칭 성사!', '호스트가 매칭을 수락했습니다.');
            
            setApplicantModalVisible(false);
            Alert.alert('완료', '매칭이 성사되었습니다!');
          } catch (e) { Alert.alert('오류', '문제가 발생했습니다.'); }
        } 
      }
    ]);
  };

  const handleMatchDetail = async (match: MatchData) => {
      if (!myTeamId) return;
      const opponentTeamId = match.hostId === myTeamId ? match.guestId : match.hostId;
      if (!opponentTeamId) return;
      try {
          const tSnap = await getDoc(doc(db, "teams", opponentTeamId));
          if (!tSnap.exists()) return;
          const tData = tSnap.data();
          const captainId = tData.captainId;
          let phone = "정보 없음";
          if (captainId) {
              const uSnap = await getDoc(doc(db, "users", captainId));
              if (uSnap.exists()) phone = uSnap.data().phoneNumber || "번호 없음";
          }
          setSelectedMatchDetail({ match: match, opponentName: tData.name, opponentPhone: phone });
          setMatchDetailModalVisible(true);
      } catch (e) { Alert.alert('오류', '상대 정보를 불러올 수 없습니다.'); }
  };

  const handleApprove = (match: any) => {
    Alert.alert('결과 승인', '이 결과가 맞습니까?', [
      { text: '이의 제기', style: 'destructive', onPress: () => disputeResult(match.id) },
      { text: '승인', onPress: () => approveResult(match, myTeamId!) }
    ]);
  };

  const handleSubmitResult = async () => {
    if (!selectedMatchId || !myScoreInput || !opScoreInput || !myTeamId) return;
    const matchData = confirmedList.find(m => m.id === selectedMatchId);
    if (!matchData) return;

    const success = await submitResult(selectedMatchId, parseInt(myScoreInput), parseInt(opScoreInput), myTeamId, matchData);
    if (success) {
      setResultModalVisible(false);
      setMyScoreInput(''); setOpScoreInput('');
    }
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={tw`flex-1 bg-white px-5`} edges={['top']}>
      <Text style={tw`text-2xl font-extrabold text-[#191F28] mb-6 pt-4`}>라커룸</Text>
      
      <View style={tw`flex-row bg-[#F2F4F6] p-1 rounded-2xl mb-6`}>
        <TouchableOpacity onPress={() => setActiveTab('team')} style={tw`flex-1 py-2 rounded-xl items-center ${activeTab === 'team' ? 'bg-white shadow-sm' : ''}`}><Text style={tw`font-bold ${activeTab === 'team' ? 'text-[#3182F6]' : 'text-gray-400'}`}>우리 팀</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('matches')} style={tw`flex-1 py-2 rounded-xl items-center ${activeTab === 'matches' ? 'bg-white shadow-sm' : ''}`}><Text style={tw`font-bold ${activeTab === 'matches' ? 'text-[#3182F6]' : 'text-gray-400'}`}>경기 관리</Text></TouchableOpacity>
      </View>

      {activeTab === 'team' ? (
        <ScrollView contentContainerStyle={tw`pb-32`} showsVerticalScrollIndicator={false}>
            {/* 1. 팀 정보 카드 */}
            <Card style={tw`mb-6`}>
                <View style={tw`flex-row justify-between items-center mb-4`}>
                    <View>
                        <Text style={tw`${TYPOGRAPHY.h2}`}>{teamData?.name}</Text>
                        <View style={tw`flex-row items-center mt-1`}>
                            <Text style={tw`text-gray-500 mr-2`}>{teamData?.affiliation}</Text>
                            {isCaptain && (
                                <TouchableOpacity onPress={() => setShowLevelModal(true)} style={tw`bg-gray-100 px-2 py-0.5 rounded`}>
                                    <Text style={tw`text-xs font-bold text-[#3182F6]`}>{teamData?.level}급 ✎</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    {isCaptain && <View style={tw`bg-blue-100 px-2 py-1 rounded`}><Text style={tw`text-blue-600 text-xs font-bold`}>TEAM LEADER</Text></View>}
                </View>
                <View style={tw`flex-row bg-gray-50 p-4 rounded-xl justify-between`}>
                    <View style={tw`items-center`}><Text style={tw`text-xs text-gray-400`}>경기</Text><Text style={tw`text-lg font-bold`}>{teamData?.stats?.total||0}</Text></View>
                    <View style={tw`items-center`}><Text style={tw`text-xs text-gray-400`}>승리</Text><Text style={tw`text-lg font-bold text-blue-500`}>{teamData?.stats?.wins||0}</Text></View>
                    <View style={tw`items-center`}><Text style={tw`text-xs text-gray-400`}>승점</Text><Text style={tw`text-lg font-bold`}>{teamData?.stats?.points||0}</Text></View>
                </View>
            </Card>

            {/* 2. 가입 요청 목록 */}
            {isCaptain && teamData?.joinRequests && teamData.joinRequests.length > 0 && (
                <View style={tw`mb-6`}>
                    <Text style={tw`text-lg font-bold mb-3 text-red-500`}>🔔 가입 요청 ({teamData.joinRequests.length})</Text>
                    {teamData.joinRequests.map((req, idx) => (
                        <View key={idx} style={tw`bg-white border border-red-100 p-4 rounded-xl mb-2 flex-row justify-between items-center shadow-sm`}>
                            <View>
                                <Text style={tw`font-bold`}>{req.name} <Text style={tw`text-gray-400 font-normal text-xs`}>({req.position})</Text></Text>
                                <Text style={tw`text-xs text-gray-400`}>{req.requestedAt.split('T')[0]}</Text>
                            </View>
                            <View style={tw`flex-row gap-2`}>
                                <Button label="승인" size="sm" onPress={() => handleApproveMember(req)} />
                                <Button label="거절" size="sm" variant="secondary" onPress={() => handleRejectMember(req)} />
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* 3. 선수 명단 */}
            <Text style={tw`text-lg font-bold mb-3`}>선수 명단</Text>
            {teamData?.roster?.map((player) => (
                <View key={player.id} style={tw`bg-white p-4 rounded-xl border border-gray-100 mb-2 flex-row justify-between items-center`}>
                    <View style={tw`flex-row items-center`}>
                        <View style={tw`w-8 h-8 bg-gray-100 rounded-full items-center justify-center mr-3`}>
                            <Text style={tw`font-bold text-xs text-gray-600`}>{player.position}</Text>
                        </View>
                        <Text style={tw`font-medium`}>{player.name}</Text>
                        {player.uid === teamData.captainId && <FontAwesome5 name="crown" size={12} color="#FFD700" style={tw`ml-2`} />}
                    </View>
                    {isCaptain && player.uid !== auth.currentUser?.uid && (
                        <TouchableOpacity onPress={() => player.uid ? handleKickMember(player) : handleDeleteManualPlayer(player.id)} style={tw`bg-red-50 p-2 rounded-lg`}>
                            <Text style={tw`text-red-500 text-xs font-bold`}>방출</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ))}

            {/* 4. 수동 선수 추가 */}
            {isCaptain && (
                <View style={tw`bg-[#F9FAFB] p-4 rounded-[24px] mt-4`}>
                    <Text style={tw`text-xs font-bold text-[#8B95A1] mb-2 ml-1`}>게스트/용병 수동 등록</Text>
                    <View style={tw`flex-row gap-2`}>
                        <TextInput style={tw`flex-1 bg-white p-3 rounded-xl border border-gray-200`} placeholder="이름" value={newPlayerName} onChangeText={setNewPlayerName}/>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`flex-1`}>
                            {POSITIONS.map(pos => (
                                <TouchableOpacity key={pos} onPress={() => setNewPlayerPos(pos)} style={tw`w-10 h-10 rounded-xl items-center justify-center mr-1 ${newPlayerPos === pos ? 'bg-[#3182F6]' : 'bg-white border border-gray-200'}`}>
                                    <Text style={tw`font-bold ${newPlayerPos === pos ? 'text-white' : 'text-[#8B95A1]'}`}>{pos}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                    <TouchableOpacity onPress={handleAddManualPlayer} style={tw`mt-3 bg-[#333D4B] py-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>추가하기</Text></TouchableOpacity>
                </View>
            )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={tw`pb-32`} showsVerticalScrollIndicator={false}>
            {/* 1. 확정된 경기 */}
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-[#191F28] mb-3 border-l-4 border-green-500 pl-3`}>확정된 경기</Text>
                {confirmedList.length === 0 && <Text style={tw`text-[#8B95A1] text-sm`}>진행 중인 경기가 없습니다.</Text>}
                {confirmedList.map(m => {
                    const isDispute = m.status === 'dispute';
                    const waitingApproval = m.result?.status === 'waiting';
                    const iSubmitted = m.result?.submitterId === myTeamId;
                    const timeDisplay = m.time.includes('T') ? m.time.split('T')[0] : m.time;

                    return (
                        <TouchableOpacity key={m.id} onPress={() => handleMatchDetail(m)} style={tw`bg-white p-4 rounded-2xl border ${isDispute ? 'border-red-500' : 'border-green-100'} shadow-sm mb-3`}>
                            <View style={tw`flex-row justify-between mb-2`}>
                                <Text style={tw`${TYPOGRAPHY.body1}`}>{m.team}</Text>
                                <Text style={tw`${TYPOGRAPHY.caption}`}>{timeDisplay}</Text>
                            </View>
                            <Text style={tw`${TYPOGRAPHY.body2} mb-3`}>{m.loc}</Text>
                            
                            {isDispute ? (
                                <View style={tw`bg-red-50 p-3 rounded-xl items-center`}><Text style={tw`text-red-500 font-bold`}>🚨 분쟁 조정 중</Text></View>
                            ) : waitingApproval ? (
                                iSubmitted ? (
                                    <View style={tw`bg-orange-50 p-3 rounded-xl items-center`}><Text style={tw`text-orange-500 font-bold`}>승인 대기중...</Text></View>
                                ) : (
                                    <Button label="승인 요청 도착 (확인)" onPress={() => handleApprove(m)} isLoading={isProcessing} />
                                )
                            ) : m.status === 'finished' ? (
                                <View style={tw`bg-gray-100 p-2 rounded-xl items-center`}><Text style={tw`text-gray-500 font-bold`}>경기 종료</Text></View>
                            ) : (
                                <Button label="결과 입력 (승리 팀)" variant="secondary" onPress={() => { setSelectedMatchId(m.id); setResultModalVisible(true); }} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* 2. 내가 모집 중 */}
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-[#191F28] mb-3 border-l-4 border-[#3182F6] pl-3`}>내가 모집 중</Text>
                {hostingList.length === 0 && <Text style={tw`text-[#8B95A1] text-sm`}>모집 중인 경기가 없습니다.</Text>}
                {hostingList.map(m => (
                    <View key={m.id} style={tw`bg-white p-4 rounded-2xl border border-[#F2F4F6] shadow-sm mb-3`}>
                         <View style={tw`flex-row justify-between`}>
                            <View><Text style={tw`font-bold text-[#333D4B]`}>{m.time.includes('T')?m.time.split('T')[0]:m.time}</Text><Text style={tw`text-xs text-[#8B95A1]`}>{m.loc}</Text></View>
                            {m.applicants && m.applicants.length > 0 ? (
                                <TouchableOpacity onPress={() => openApplicantModal(m.id, m.applicants)} style={tw`bg-[#3182F6] px-4 py-2 rounded-xl justify-center`}><Text style={tw`text-white font-bold text-xs`}>신청자 {m.applicants.length}명 보기</Text></TouchableOpacity>
                            ) : (
                                <View style={tw`bg-gray-100 px-4 py-2 rounded-xl justify-center`}><Text style={tw`text-[#8B95A1] font-bold text-xs`}>신청 대기중</Text></View>
                            )}
                        </View>
                    </View>
                ))}
            </View>

            {/* 3. 내가 보낸 신청 */}
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-[#191F28] mb-3 border-l-4 border-pink-500 pl-3`}>내가 보낸 신청</Text>
                {applyingList.length === 0 && <Text style={tw`text-[#8B95A1] text-sm`}>신청한 경기가 없습니다.</Text>}
                {applyingList.map(m => (
                    <View key={m.id} style={tw`bg-white p-4 rounded-2xl border border-[#F2F4F6] shadow-sm mb-3`}>
                        <Text style={tw`font-bold text-[#333D4B]`}>{m.team}</Text>
                        <Text style={tw`text-xs text-[#8B95A1]`}>{m.time.includes('T')?m.time.split('T')[0]:m.time} | {m.loc}</Text>
                        <Text style={tw`text-pink-500 font-bold text-xs mt-2`}>수락 대기중...</Text>
                    </View>
                ))}
            </View>
        </ScrollView>
      )}

      {/* --- Modals --- */}
      
      {/* 1. 레벨 변경 모달 */}
      <Modal visible={showLevelModal} transparent animationType="fade">
          <View style={tw`flex-1 justify-center items-center bg-black/50 px-6`}>
              <View style={tw`bg-white w-full rounded-2xl p-6`}>
                  <Text style={tw`text-lg font-bold mb-4 text-[#191F28] text-center`}>팀 수준 변경</Text>
                  <View style={tw`flex-row justify-between mb-2`}>
                      {LEVELS.map(lvl => (
                          <TouchableOpacity key={lvl} onPress={() => updateTeamLevel(lvl)} style={tw`w-12 h-12 rounded-xl items-center justify-center border ${teamData?.level === lvl ? 'bg-[#3182F6] border-[#3182F6]' : 'bg-white border-gray-200'}`}>
                              <Text style={tw`font-bold text-lg ${teamData?.level === lvl ? 'text-white' : 'text-[#8B95A1]'}`}>{lvl}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>
                  <TouchableOpacity onPress={() => setShowLevelModal(false)} style={tw`mt-4 py-2 items-center`}><Text style={tw`text-[#8B95A1] font-bold`}>취소</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* 2. 신청자 관리 모달 */}
      <Modal visible={applicantModalVisible} animationType="slide" transparent={true}>
        <View style={tw`flex-1 justify-end bg-black/50`}>
            <View style={tw`bg-white rounded-t-3xl p-6 min-h-[50%]`}>
                <Text style={tw`text-xl font-bold mb-4`}>신청 팀 목록</Text>
                <FlatList data={applicantsData} keyExtractor={item => item.id} renderItem={({item}) => ( <View style={tw`flex-row justify-between items-center bg-[#F9FAFB] p-4 rounded-2xl mb-3`}> <View><Text style={tw`font-bold text-lg text-[#191F28]`}>{item.name}</Text><Text style={tw`text-sm text-[#8B95A1]`}>{item.affiliation} ({item.level}급)</Text></View> <TouchableOpacity onPress={() => acceptMatch(item.id)} style={tw`bg-[#3182F6] px-4 py-2 rounded-xl`}><Text style={tw`text-white font-bold`}>수락</Text></TouchableOpacity> </View> )} />
                <TouchableOpacity onPress={() => setApplicantModalVisible(false)} style={tw`mt-4 bg-gray-200 p-4 rounded-xl items-center`}><Text style={tw`font-bold text-gray-600`}>닫기</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>

      {/* 3. 경기 결과 입력 모달 */}
      <Modal visible={resultModalVisible} animationType="fade" transparent={true}>
        <View style={tw`flex-1 justify-center items-center bg-black/50 px-6`}>
            <View style={tw`bg-white w-full rounded-3xl p-6`}>
                <Text style={tw`${TYPOGRAPHY.h2} mb-2 text-center`}>경기 결과 입력</Text>
                <Text style={tw`text-xs text-[#3182F6] font-bold mb-6 text-center`}>승리한 팀 기준으로 점수를 입력하세요</Text>
                <View style={tw`flex-row justify-between items-center mb-8`}>
                    <View style={tw`items-center`}><Text style={tw`font-bold text-[#3182F6] mb-2`}>우리 팀 (승)</Text><TextInput style={tw`w-20 h-20 bg-gray-100 rounded-2xl text-center text-3xl font-bold`} keyboardType="number-pad" value={myScoreInput} onChangeText={setMyScoreInput} /></View>
                    <Text style={tw`text-2xl font-bold text-gray-300`}>:</Text>
                    <View style={tw`items-center`}><Text style={tw`font-bold text-gray-500 mb-2`}>상대 팀 (패)</Text><TextInput style={tw`w-20 h-20 bg-gray-100 rounded-2xl text-center text-3xl font-bold`} keyboardType="number-pad" value={opScoreInput} onChangeText={setOpScoreInput} /></View>
                </View>
                <View style={tw`gap-3`}>
                    <Button label="결과 전송" onPress={handleSubmitResult} isLoading={isProcessing} />
                    <Button label="취소" variant="ghost" onPress={() => setResultModalVisible(false)} />
                </View>
            </View>
        </View>
      </Modal>

      {/* 4. 경기 상세 모달 (상대 연락처) */}
      <Modal visible={matchDetailModalVisible} transparent animationType="fade">
          <View style={tw`flex-1 justify-center items-center bg-black/60 px-6`}>
              <View style={tw`bg-white w-full rounded-2xl p-6`}>
                  <Text style={tw`text-xl font-bold mb-4 text-[#191F28] text-center`}>경기 상세 정보</Text>
                  <View style={tw`mb-4 p-4 bg-[#F9FAFB] rounded-xl`}><Text style={tw`text-xs text-[#8B95A1] mb-1`}>상대 팀</Text><Text style={tw`text-lg font-bold text-[#3182F6]`}>{selectedMatchDetail?.opponentName}</Text></View>
                  <View style={tw`mb-6 p-4 bg-[#F9FAFB] rounded-xl`}><Text style={tw`text-xs text-[#8B95A1] mb-1`}>대표자 연락처</Text><Text style={tw`text-lg font-bold text-[#191F28]`}>{selectedMatchDetail?.opponentPhone}</Text></View>
                  <View style={tw`mb-6`}><Text style={tw`text-xs text-[#8B95A1] mb-1 ml-1`}>장소</Text><Text style={tw`text-base font-medium text-[#333D4B] ml-1`}>{selectedMatchDetail?.match.loc}</Text></View>
                  <TouchableOpacity onPress={() => setMatchDetailModalVisible(false)} style={tw`bg-[#3182F6] py-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>확인</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      {/* 5. 팀 상세 정보 (전적 히스토리) */}
      <Modal visible={teamDetailModalVisible} animationType="slide" presentationStyle="pageSheet">
          <View style={tw`flex-1 bg-white p-6 pt-10`}>
              <View style={tw`flex-row justify-between items-center mb-8`}>
                  <Text style={tw`text-2xl font-extrabold text-[#191F28]`}>팀 전적 기록</Text>
                  <TouchableOpacity onPress={() => setTeamDetailModalVisible(false)} style={tw`bg-gray-100 p-2 rounded-full`}><FontAwesome5 name="times" size={20} color="#64748b" /></TouchableOpacity>
              </View>
              <FlatList 
                data={confirmedList.filter(m => m.status === 'finished')} 
                keyExtractor={item => item.id} 
                renderItem={({item}) => { 
                    const isHost = item.hostId === myTeamId; 
                    const myScore = isHost ? item.result?.hostScore : item.result?.guestScore; 
                    const opScore = isHost ? item.result?.guestScore : item.result?.hostScore; 
                    const isWin = (myScore || 0) > (opScore || 0); 
                    return ( 
                        <View style={tw`bg-white border border-gray-100 p-4 rounded-2xl mb-3 flex-row justify-between items-center shadow-sm`}> 
                            <View><Text style={tw`font-bold text-[#333D4B]`}>{item.team}</Text><Text style={tw`text-xs text-[#8B95A1]`}>{item.time.split('T')[0]}</Text></View> 
                            <View style={tw`flex-row items-center`}><Text style={tw`text-lg font-black ${isWin ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>{myScore}</Text><Text style={tw`mx-2 text-gray-300 font-bold`}>:</Text><Text style={tw`text-lg font-black ${!isWin ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>{opScore}</Text></View> 
                        </View> 
                    ); 
                }} 
                ListEmptyComponent={<Text style={tw`text-center text-[#8B95A1] mt-4`}>완료된 경기 기록이 없습니다.</Text>} 
              />
          </View>
      </Modal>

    </SafeAreaView>
  );
}