import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, runTransaction, getDocs, orderBy, addDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import tw from 'twrnc';

type Player = { id: number; name: string; position: string; };
type TeamData = { id: string; name: string; affiliation: string; level: string; stats: any; roster: Player[]; captainId: string; };
type MatchData = {
  id: string; hostId: string; guestId?: string; team: string; time: string; loc: string; timestamp?: string;
  status: 'recruiting' | 'matched' | 'finished' | 'dispute';
  applicants: string[];
  result?: { hostScore: number; guestScore: number; status: 'waiting' | 'verified' | 'dispute'; submitterId?: string };
  isDeleted?: boolean; // Soft Delete 확인용
};

const POSITIONS = ['L', 'OH', 'OP', 'MB', 'S'];
const LEVELS = ['A', 'B', 'C', 'D', 'E'];

export default function LockerScreen() {
  const { initialTab } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'team' | 'matches'>('team');
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<number | string>('-');
  const [hostingList, setHostingList] = useState<MatchData[]>([]);
  const [applyingList, setApplyingList] = useState<MatchData[]>([]);
  const [confirmedList, setConfirmedList] = useState<MatchData[]>([]);
  const [pastMatches, setPastMatches] = useState<MatchData[]>([]);
  const [applicantModalVisible, setApplicantModalVisible] = useState(false);
  const [applicantsData, setApplicantsData] = useState<TeamData[]>([]);
  const [teamDetailModalVisible, setTeamDetailModalVisible] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [myScoreInput, setMyScoreInput] = useState('');
  const [opScoreInput, setOpScoreInput] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPos, setNewPlayerPos] = useState('L');
  const [showLevelModal, setShowLevelModal] = useState(false);

  // [New] 중복 방지를 위한 처리 상태
  const [isProcessing, setIsProcessing] = useState(false);

  // [New] 확정된 경기 상세 정보 모달 상태
  const [matchDetailModalVisible, setMatchDetailModalVisible] = useState(false);
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<{match: MatchData, opponentName: string, opponentPhone: string} | null>(null);

  useEffect(() => {
      if (initialTab === 'matches') setActiveTab('matches');
  }, [initialTab]);

  // 알림 전송 헬퍼 함수
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

  // 팀 ID로 대표자(Captain) UID 찾기
  const findCaptainId = async (teamId: string) => {
      try {
        const tSnap = await getDoc(doc(db, "teams", teamId));
        return tSnap.exists() ? tSnap.data().captainId : null;
      } catch (e) { return null; }
  };

  useEffect(() => {
    const fetchMyTeam = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const tid = userDoc.data()?.teamId;
      if (tid) {
        setMyTeamId(tid);
        const unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => setTeamData({ id: d.id, ...d.data() } as TeamData));
        const qRank = query(collection(db, "teams"), orderBy("stats.points", "desc"));
        const rankSnap = await getDocs(qRank);
        let rank = 1;
        rankSnap.forEach((d) => { if (d.id === tid) setMyRank(rank); rank++; });
        return unsubTeam;
      }
    };
    fetchMyTeam();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!myTeamId) return;
    // 내가 모집 중 (삭제 안 된 것만)
    const qHost = query(collection(db, "matches"), where("hostId", "==", myTeamId), where("status", "==", "recruiting"));
    const unsubHost = onSnapshot(qHost, (snap) => {
      const list: MatchData[] = [];
      snap.forEach(d => {
          const data = d.data();
          if(!data.isDeleted) list.push({ id: d.id, ...data } as MatchData);
      });
      setHostingList(list);
    });
    // 내가 신청한 경기
    const qApply = query(collection(db, "matches"), where("applicants", "array-contains", myTeamId));
    const unsubApply = onSnapshot(qApply, (snap) => {
      const list: MatchData[] = [];
      snap.forEach(d => {
        const data = d.data();
        // 삭제되지 않고 아직 모집 중인 것만
        if (data.status === 'recruiting' && !data.isDeleted) list.push({ id: d.id, ...data } as MatchData);
      });
      setApplyingList(list);
    });
    // 확정된 경기 (완료, 분쟁 포함)
    const qConfirmed = query(collection(db, "matches"), where("status", "in", ["matched", "finished", "dispute"]));
    const unsubConfirmed = onSnapshot(qConfirmed, (snap) => {
      const active: MatchData[] = [];
      const past: MatchData[] = [];
      snap.forEach(d => {
        const rawData = d.data();
        if (rawData.isDeleted) return; // Soft Delete 필터링

        const m = { id: d.id, ...rawData } as MatchData;
        if (m.hostId === myTeamId || m.guestId === myTeamId) {
            if (m.status === 'finished') past.push(m);
            else active.push(m);
        }
      });
      // [ISO Date] 정렬
      active.sort((a, b) => b.time.localeCompare(a.time));
      past.sort((a, b) => b.time.localeCompare(a.time));
      setConfirmedList(active);
      setPastMatches(past);
    });
    return () => { unsubHost(); unsubApply(); unsubConfirmed(); };
  }, [myTeamId]);

  const handleAddPlayer = async () => {
    if (!newPlayerName || !myTeamId) return;
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const newPlayer = { id: Date.now(), name: newPlayerName, position: newPlayerPos };
      await updateDoc(doc(db, "teams", myTeamId), { roster: [...(teamData?.roster || []), newPlayer] });
      setNewPlayerName('');
      Alert.alert('성공', '선수가 등록되었습니다.');
    } catch (e) {
      Alert.alert('오류', '선수 등록 실패');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePlayer = async (pid: number) => {
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
    const teams: TeamData[] = [];
    for (const tid of applicantIds) {
      const tSnap = await getDoc(doc(db, "teams", tid));
      if (tSnap.exists()) teams.push({ id: tSnap.id, ...tSnap.data() } as TeamData);
    }
    setApplicantsData(teams);
  };

  const acceptMatch = async (guestTeamId: string) => {
    if (!selectedMatchId || isProcessing) return;
    
    Alert.alert('매칭 수락', '이 팀과 경기를 확정하시겠습니까?', [
      { text: '취소' },
      { text: '확정', onPress: async () => {
          setIsProcessing(true);
          try {
            // 1. 매칭 상태 업데이트
            await updateDoc(doc(db, "matches", selectedMatchId), { 
                status: 'matched', 
                guestId: guestTeamId, 
                applicants: [] // 신청자 목록 초기화 (혹은 보존 정책에 따라 유지 가능)
            });

            // 2. 수락된 팀에게 알림
            const guestCaptainId = await findCaptainId(guestTeamId);
            if (guestCaptainId) {
                await sendNotification(guestCaptainId, 'match_upcoming', '매칭 성사!', '호스트가 매칭을 수락했습니다. 경기 일정을 확인하세요.');
            }

            // 3. [UX Fix] 탈락한 나머지 팀들에게 알림 발송
            const matchData = hostingList.find(m => m.id === selectedMatchId);
            if (matchData && matchData.applicants) {
                const rejectedTeams = matchData.applicants.filter(id => id !== guestTeamId);
                for (const rejectedId of rejectedTeams) {
                    const rejectedCaptainId = await findCaptainId(rejectedId);
                    if (rejectedCaptainId) {
                        await sendNotification(
                            rejectedCaptainId, 
                            'normal', 
                            '매칭 실패 안내', 
                            '신청하신 매칭이 다른 팀과 성사되어 마감되었습니다. 다음 기회를 노려보세요!'
                        );
                    }
                }
            }

            setApplicantModalVisible(false);
            Alert.alert('완료', '매칭이 성사되었습니다! [내 매칭] 탭에서 확인하세요.');
          } catch (e) {
            Alert.alert('오류', '매칭 수락 중 문제가 발생했습니다.');
          } finally {
            setIsProcessing(false);
          }
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
              if (uSnap.exists()) {
                  phone = uSnap.data().phoneNumber || "번호 없음";
              }
          }

          setSelectedMatchDetail({
              match: match,
              opponentName: tData.name,
              opponentPhone: phone
          });
          setMatchDetailModalVisible(true);

      } catch (e) {
          Alert.alert('오류', '상대 정보를 불러올 수 없습니다.');
      }
  };

  const handleOpenResultModal = (matchId: string) => {
    Alert.alert('결과 입력', '오늘 경기에서 승리하셨나요?\n(승리한 팀만 결과를 입력할 수 있습니다)', [
      { text: '아니오 (패배)', onPress: () => Alert.alert('알림', '패배한 팀은 상대방이 결과를 입력할 때까지 기다린 후, [승인] 버튼을 눌러주세요.') },
      { text: '네 (승리)', onPress: () => { setSelectedMatchId(matchId); setMyScoreInput(''); setOpScoreInput(''); setResultModalVisible(true); } }
    ]);
  };

  const submitResult = async () => {
    if (!selectedMatchId || !myScoreInput || !opScoreInput || !myTeamId) return;
    if (isProcessing) return;

    const myScore = parseInt(myScoreInput);
    const opScore = parseInt(opScoreInput);
    if (myScore <= opScore) return Alert.alert('오류', '내 점수가 더 커야 합니다.');
    const match = confirmedList.find(m => m.id === selectedMatchId);
    if (!match) return;

    setIsProcessing(true);
    try {
        const amIHost = match.hostId === myTeamId;
        const finalHostScore = amIHost ? myScore : opScore;
        const finalGuestScore = amIHost ? opScore : myScore;
        const targetTeamId = amIHost ? match.guestId : match.hostId;
        await updateDoc(doc(db, "matches", selectedMatchId), { result: { hostScore: finalHostScore, guestScore: finalGuestScore, status: 'waiting', submitterId: myTeamId } });
        
        // [New] 결과 승인 요청 알림 전송 (findCaptainId 사용)
        if (targetTeamId) {
            const targetCaptainId = await findCaptainId(targetTeamId);
            if (targetCaptainId) {
                await sendNotification(targetCaptainId, 'result_req', '결과 승인 요청', '상대 팀이 경기 결과를 입력했습니다. 승인해주세요.');
            }
        }
        setResultModalVisible(false);
        Alert.alert('전송 완료', '상대 팀에게 승인 요청을 보냈습니다.');
    } catch (e) {
        Alert.alert('오류', '결과 전송 실패');
    } finally {
        setIsProcessing(false);
    }
  };

  const approveResult = async (match: MatchData) => {
    if (!match.result || !match.guestId || !myTeamId) return;
    if (isProcessing) return;

    if (match.result.submitterId === myTeamId) { Alert.alert('대기 중', '상대 팀의 승인을 기다리고 있습니다.'); return; }
    const { hostScore, guestScore } = match.result;
    const amIHost = match.hostId === myTeamId;
    const myScoreView = amIHost ? hostScore : guestScore;
    const opScoreView = amIHost ? guestScore : hostScore;

    Alert.alert('결과 승인', `우리 팀 ${myScoreView} : ${opScoreView} 상대 팀\n\n이 결과가 맞습니까?`, [
        { text: '이의 제기 (관리자)', style: 'destructive', onPress: async () => {
            setIsProcessing(true);
            try {
               await updateDoc(doc(db, "matches", match.id), { status: 'dispute', "result.status": 'dispute' });
               const targetId = amIHost ? match.guestId : match.hostId;
               if(targetId) {
                   const targetCaptainId = await findCaptainId(targetId);
                   if (targetCaptainId) await sendNotification(targetCaptainId, 'dispute', '상대방의 이의제기', '경기 결과에 대해 이의가 제기되었습니다.');
               }
               Alert.alert('접수 완료', '관리자에게 이의가 접수되었습니다.');
            } catch(e) { Alert.alert('오류', '요청 실패'); } finally { setIsProcessing(false); }
          }
        },
        { text: '승인 (전적반영)', onPress: async () => {
             setIsProcessing(true);
             try {
                await runTransaction(db, async (transaction) => {
                    const matchRef = doc(db, "matches", match.id);
                    const currentMatch = await transaction.get(matchRef);
                    if (!currentMatch.exists()) throw "Match not found";
                    if (currentMatch.data().status === 'finished') throw "이미 승점이 반영된 경기입니다.";

                    const hostRef = doc(db, "teams", match.hostId);
                    const guestRef = doc(db, "teams", match.guestId!);
                    const hostDoc = await transaction.get(hostRef);
                    const guestDoc = await transaction.get(guestRef);
                    if (!hostDoc.exists() || !guestDoc.exists()) throw "Team not found";
                    
                    const hStats = hostDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
                    const gStats = guestDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
                    const isHostWin = hostScore > guestScore;
                    const isDraw = hostScore === guestScore;
                    const hostPoints = isHostWin ? 3 : (isDraw ? 1 : 1);
                    const guestPoints = !isHostWin && !isDraw ? 3 : (isDraw ? 1 : 1);
                    
                    transaction.update(hostRef, { 
                        "stats.total": (hStats.total || 0) + 1, 
                        "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0), 
                        "stats.losses": (hStats.losses || 0) + (!isHostWin && !isDraw ? 1 : 0), 
                        "stats.points": (hStats.points || 0) + hostPoints 
                    });
                    transaction.update(guestRef, { 
                        "stats.total": (gStats.total || 0) + 1, 
                        "stats.wins": (gStats.wins || 0) + (!isHostWin && !isDraw ? 1 : 0), 
                        "stats.losses": (gStats.losses || 0) + (isHostWin ? 1 : 0), 
                        "stats.points": (gStats.points || 0) + guestPoints 
                    });
                    transaction.update(matchRef, { status: 'finished', "result.status": 'verified' });
                });
                Alert.alert('처리 완료', '경기 결과와 승점이 반영되었습니다. [더보기]에서 전적을 확인하세요.');
            } catch (e: any) { Alert.alert('오류', typeof e === 'string' ? e : e.message); } finally { setIsProcessing(false); }
          } 
        }
    ]);
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  // ... (Render 부분은 기존과 동일하되, 시간 포맷 처리는 Home/Index에서 처리한 로직처럼 API에서 온 ISO string을 그대로 보여주거나 
  // 필요 시 여기서도 formatting 함수를 쓸 수 있음. 현재는 Locker에서 시간 표시가 단순 문자열이므로 기존 유지)
  return (
    <SafeAreaView style={tw`flex-1 bg-white px-5`} edges={['top']}>
      {isProcessing && <View style={tw`absolute inset-0 bg-black/20 z-50 justify-center items-center`}><ActivityIndicator size="large" color="#3182F6" /></View>}
      <Text style={tw`text-2xl font-extrabold text-[#191F28] mb-6 pt-4`}>라커룸</Text>
      <View style={tw`flex-row bg-[#F2F4F6] p-1 rounded-2xl mb-6`}>
        {['team', 'matches'].map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab as any)} style={tw`flex-1 py-2 rounded-xl items-center ${activeTab === tab ? 'bg-white shadow-sm' : ''}`}>
                <Text style={tw`font-bold ${activeTab === tab ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>{tab === 'team' ? '우리 팀' : '내 매칭'}</Text>
            </TouchableOpacity>
        ))}
      </View>
      {activeTab === 'team' ? (
        <ScrollView contentContainerStyle={tw`pb-32`} showsVerticalScrollIndicator={false}>
          <View style={tw`bg-white border border-[#F2F4F6] rounded-[24px] p-6 mb-6 shadow-sm`}>
             <View style={tw`flex-row justify-between items-start mb-6`}>
                 <View style={tw`flex-row items-center`}>
                    <View style={tw`w-14 h-14 bg-blue-50 rounded-2xl items-center justify-center mr-3`}><Text style={tw`text-2xl`}>🛡️</Text></View>
                    <View>
                        <Text style={tw`text-lg font-extrabold text-[#191F28]`}>{teamData?.name}</Text>
                        <View style={tw`flex-row items-center mt-1`}>
                            <Text style={tw`text-[#4E5968] font-bold text-xs mr-2`}>{teamData?.affiliation}</Text>
                            <TouchableOpacity onPress={() => setShowLevelModal(true)} style={tw`bg-gray-100 px-2 py-0.5 rounded flex-row items-center`}>
                                <Text style={tw`text-xs font-bold text-[#3182F6]`}>{teamData?.level}급</Text>
                                <FontAwesome5 name="edit" size={10} color="#3182F6" style={tw`ml-1`} />
                            </TouchableOpacity>
                        </View>
                    </View>
                 </View>
                 <TouchableOpacity onPress={() => setTeamDetailModalVisible(true)} style={tw`bg-gray-50 px-3 py-1 rounded-full border border-gray-100`}>
                     <Text style={tw`text-xs font-bold text-[#8B95A1]`}>더보기 <FontAwesome5 name="chevron-right" size={10} /></Text>
                 </TouchableOpacity>
            </View>
            <View style={tw`flex-row bg-[#F9FAFB] rounded-2xl p-4 justify-between`}>
                <View style={tw`items-center flex-1 border-r border-gray-200`}><Text style={tw`text-xs text-[#8B95A1] font-bold mb-1`}>경기</Text><Text style={tw`text-xl font-black text-[#333D4B]`}>{teamData?.stats?.total || 0}</Text></View>
                <View style={tw`items-center flex-1 border-r border-gray-200`}><Text style={tw`text-xs text-[#8B95A1] font-bold mb-1`}>승리</Text><Text style={tw`text-xl font-black text-[#3182F6]`}>{teamData?.stats?.wins || 0}</Text></View>
                <View style={tw`items-center flex-1 border-r border-gray-200`}><Text style={tw`text-xs text-[#8B95A1] font-bold mb-1`}>승점</Text><Text style={tw`text-xl font-black text-[#333D4B]`}>{teamData?.stats?.points || 0}</Text></View>
                <View style={tw`items-center flex-1`}><Text style={tw`text-xs text-[#8B95A1] font-bold mb-1`}>랭킹</Text><Text style={tw`text-xl font-black text-[#FFD700]`}>{myRank}위</Text></View>
            </View>
          </View>
          <View>
            <Text style={tw`font-bold text-[#191F28] mb-3 ml-1`}>선수 명단 <Text style={tw`text-[#3182F6]`}>{teamData?.roster?.length || 0}</Text></Text>
            <View style={tw`gap-3 mb-6`}>
                {teamData?.roster?.map((player) => (
                    <View key={player.id} style={tw`bg-white p-3 rounded-2xl border border-[#F2F4F6] flex-row items-center justify-between`}>
                        <View style={tw`flex-row items-center`}>
                            <View style={tw`w-10 h-10 rounded-full bg-blue-50 items-center justify-center mr-3`}>
                                <Text style={tw`font-bold text-xs text-[#3182F6]`}>{player.position}</Text>
                            </View>
                            <Text style={tw`font-bold text-[#333D4B]`}>{player.name}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleDeletePlayer(player.id)} style={tw`p-2`}><FontAwesome5 name="minus-circle" size={16} color="#FF3B30" /></TouchableOpacity>
                    </View>
                ))}
            </View>
            <View style={tw`bg-[#F9FAFB] p-4 rounded-[24px]`}>
                <Text style={tw`text-xs font-bold text-[#8B95A1] mb-2 ml-1`}>새 선수 등록</Text>
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
                <TouchableOpacity onPress={handleAddPlayer} style={tw`mt-3 bg-[#333D4B] py-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>추가하기</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={tw`pb-32`} showsVerticalScrollIndicator={false}>
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-[#191F28] mb-3 border-l-4 border-green-500 pl-3`}>확정된 경기</Text>
                {confirmedList.length === 0 && <Text style={tw`text-[#8B95A1] text-sm`}>진행 중인 경기가 없습니다.</Text>}
                {confirmedList.map(m => {
                    const isDispute = m.status === 'dispute';
                    const waitingApproval = m.result?.status === 'waiting';
                    const iSubmitted = m.result?.submitterId === myTeamId;
                    // [Date Format] 화면 표시 (간단히 처리, 필요시 getFormattedDate 등 사용)
                    const timeDisplay = m.time.includes('T') ? m.time.split('T')[0] : m.time;

                    return (
                        <TouchableOpacity 
                            key={m.id} 
                            onPress={() => handleMatchDetail(m)}
                            style={tw`bg-white p-4 rounded-2xl border ${isDispute ? 'border-red-500' : 'border-green-100'} shadow-sm mb-3`}
                        >
                            <View style={tw`flex-row justify-between mb-2`}>
                                <Text style={tw`font-bold text-[#333D4B]`}>{m.team}</Text>
                                <Text style={tw`text-xs text-[#8B95A1]`}>{timeDisplay}</Text>
                            </View>
                            <Text style={tw`text-xs text-[#8B95A1] mb-3`}>{m.loc}</Text>
                            {isDispute ? (
                                <View style={tw`bg-red-50 p-2 rounded-lg items-center`}><Text style={tw`font-bold text-red-500`}>🚨 분쟁 조정 중</Text></View>
                            ) : waitingApproval ? (
                                iSubmitted ? (
                                    <View style={tw`bg-orange-50 p-2 rounded-lg items-center`}><Text style={tw`font-bold text-orange-500`}>상대 팀 승인 대기중...</Text></View>
                                ) : (
                                    <TouchableOpacity onPress={() => approveResult(m)} disabled={isProcessing} style={tw`bg-[#3182F6] p-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>승인 요청 도착 (결과 확인)</Text></TouchableOpacity>
                                )
                            ) : (
                                <TouchableOpacity onPress={() => handleOpenResultModal(m.id)} disabled={isProcessing} style={tw`bg-green-500 p-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>결과 입력 (승리 팀)</Text></TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
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
      {/* ... 나머지 모달들 (Level, TeamDetail, Applicant, Result) 유지 ... */}
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
      <Modal visible={teamDetailModalVisible} animationType="slide" presentationStyle="pageSheet">
          <View style={tw`flex-1 bg-white p-6 pt-10`}>
              <View style={tw`flex-row justify-between items-center mb-8`}>
                  <Text style={tw`text-2xl font-extrabold text-[#191F28]`}>팀 상세 정보</Text>
                  <TouchableOpacity onPress={() => setTeamDetailModalVisible(false)} style={tw`bg-gray-100 p-2 rounded-full`}><FontAwesome5 name="times" size={20} color="#64748b" /></TouchableOpacity>
              </View>
              <FlatList data={pastMatches} keyExtractor={item => item.id} renderItem={({item}) => { const isHost = item.hostId === myTeamId; const myScore = isHost ? item.result?.hostScore : item.result?.guestScore; const opScore = isHost ? item.result?.guestScore : item.result?.hostScore; const isWin = (myScore || 0) > (opScore || 0); return ( <View style={tw`bg-white border border-gray-100 p-4 rounded-2xl mb-3 flex-row justify-between items-center shadow-sm`}> <View><Text style={tw`font-bold text-[#333D4B]`}>{item.team}</Text><Text style={tw`text-xs text-[#8B95A1]`}>{item.time.includes('T')?item.time.split('T')[0]:item.time}</Text></View> <View style={tw`flex-row items-center`}><Text style={tw`text-lg font-black ${isWin ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>{myScore}</Text><Text style={tw`mx-2 text-gray-300 font-bold`}>:</Text><Text style={tw`text-lg font-black ${!isWin ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>{opScore}</Text></View> </View> ); }} ListEmptyComponent={<Text style={tw`text-center text-[#8B95A1] mt-4`}>완료된 경기가 없습니다.</Text>} />
          </View>
      </Modal>
      <Modal visible={applicantModalVisible} animationType="slide" transparent={true}>
        <View style={tw`flex-1 justify-end bg-black/50`}>
            <View style={tw`bg-white rounded-t-3xl p-6 min-h-[50%]`}>
                <Text style={tw`text-xl font-bold mb-4`}>신청 팀 목록</Text>
                <FlatList data={applicantsData} keyExtractor={item => item.id} renderItem={({item}) => ( <View style={tw`flex-row justify-between items-center bg-[#F9FAFB] p-4 rounded-2xl mb-3`}> <View><Text style={tw`font-bold text-lg text-[#191F28]`}>{item.name}</Text><Text style={tw`text-sm text-[#8B95A1]`}>{item.affiliation} ({item.level}급)</Text></View> <TouchableOpacity onPress={() => acceptMatch(item.id)} style={tw`bg-[#3182F6] px-4 py-2 rounded-xl`}><Text style={tw`text-white font-bold`}>수락</Text></TouchableOpacity> </View> )} />
                <TouchableOpacity onPress={() => setApplicantModalVisible(false)} style={tw`mt-4 bg-gray-200 p-4 rounded-xl items-center`}><Text style={tw`font-bold text-gray-600`}>닫기</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>
      <Modal visible={resultModalVisible} animationType="fade" transparent={true}>
        <View style={tw`flex-1 justify-center items-center bg-black/50 px-6`}>
            <View style={tw`bg-white w-full rounded-3xl p-6`}>
                <Text style={tw`text-xl font-bold mb-2 text-center`}>경기 결과 입력</Text>
                <Text style={tw`text-xs text-[#3182F6] font-bold mb-6 text-center`}>승리한 팀 기준으로 점수를 입력하세요</Text>
                <View style={tw`flex-row justify-between items-center mb-8`}>
                    <View style={tw`items-center`}><Text style={tw`font-bold text-[#3182F6] mb-2`}>우리 팀 (승)</Text><TextInput style={tw`w-20 h-20 bg-gray-100 rounded-2xl text-center text-3xl font-bold`} keyboardType="number-pad" value={myScoreInput} onChangeText={setMyScoreInput} /></View>
                    <Text style={tw`text-2xl font-bold text-gray-300`}>:</Text>
                    <View style={tw`items-center`}><Text style={tw`font-bold text-gray-500 mb-2`}>상대 팀 (패)</Text><TextInput style={tw`w-20 h-20 bg-gray-100 rounded-2xl text-center text-3xl font-bold`} keyboardType="number-pad" value={opScoreInput} onChangeText={setOpScoreInput} /></View>
                </View>
                <TouchableOpacity onPress={submitResult} disabled={isProcessing} style={tw`bg-[#3182F6] py-4 rounded-xl items-center mb-3`}><Text style={tw`text-white font-bold text-lg`}>결과 전송</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setResultModalVisible(false)} disabled={isProcessing} style={tw`py-4 items-center`}><Text style={tw`text-[#8B95A1] font-bold`}>취소</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}