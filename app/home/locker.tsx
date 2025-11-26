import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, runTransaction, getDocs, orderBy, addDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { FontAwesome } from '@expo/vector-icons';
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
};

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
  const [teamDetailModalVisible, setTeamDetailModalVisible] = useState(false);
  const [applicantsData, setApplicantsData] = useState<TeamData[]>([]);
  
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [myScoreInput, setMyScoreInput] = useState('');
  const [opScoreInput, setOpScoreInput] = useState('');

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPos, setNewPlayerPos] = useState('L');

  // [New] 파라미터로 탭 설정
  useEffect(() => {
      if (initialTab === 'matches') {
          setActiveTab('matches');
      }
  }, [initialTab]);

  const sendNotification = async (teamId: string, type: string, title: string, msg: string) => {
      try {
          const tSnap = await getDoc(doc(db, "teams", teamId));
          if (tSnap.exists() && tSnap.data().captainId) {
              await addDoc(collection(db, "notifications"), {
                  userId: tSnap.data().captainId,
                  type, title, message: msg,
                  link: '/home/locker?initialTab=matches', // 바로 매칭 탭으로 이동
                  createdAt: new Date().toISOString(),
                  isRead: false
              });
          }
      } catch (e) {}
  };

  useEffect(() => {
    const fetchMyTeam = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const tid = userDoc.data()?.teamId;
      if (tid) {
        setMyTeamId(tid);
        const unsubTeam = onSnapshot(doc(db, "teams", tid), (d) => {
             setTeamData({ id: d.id, ...d.data() } as TeamData);
        });

        const qRank = query(collection(db, "teams"), orderBy("stats.points", "desc"));
        const rankSnap = await getDocs(qRank);
        let rank = 1;
        rankSnap.forEach((d) => {
            if (d.id === tid) setMyRank(rank);
            rank++;
        });
        return unsubTeam;
      }
    };
    fetchMyTeam();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!myTeamId) return;

    const qHost = query(collection(db, "matches"), where("hostId", "==", myTeamId), where("status", "==", "recruiting"));
    const unsubHost = onSnapshot(qHost, (snap) => {
      const list: MatchData[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as MatchData));
      setHostingList(list);
    });

    const qApply = query(collection(db, "matches"), where("applicants", "array-contains", myTeamId));
    const unsubApply = onSnapshot(qApply, (snap) => {
      const list: MatchData[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'recruiting') list.push({ id: d.id, ...data } as MatchData);
      });
      setApplyingList(list);
    });

    const qConfirmed = query(collection(db, "matches"), where("status", "in", ["matched", "finished", "dispute"]));
    const unsubConfirmed = onSnapshot(qConfirmed, (snap) => {
      const active: MatchData[] = [];
      const past: MatchData[] = [];
      
      snap.forEach(d => {
        const rawData = d.data();
        const m = { id: d.id, ...rawData } as MatchData;
        
        if (m.hostId === myTeamId || m.guestId === myTeamId) {
            if (m.status === 'finished') {
                past.push(m);
            } else {
                active.push(m);
            }
        }
      });
      
      active.sort((a, b) => b.time.localeCompare(a.time));
      past.sort((a, b) => b.time.localeCompare(a.time));

      setConfirmedList(active);
      setPastMatches(past);
    });

    return () => { unsubHost(); unsubApply(); unsubConfirmed(); };
  }, [myTeamId]);

  const handleAddPlayer = async () => {
    if (!newPlayerName || !myTeamId) return;
    const newPlayer = { id: Date.now(), name: newPlayerName, position: newPlayerPos };
    await updateDoc(doc(db, "teams", myTeamId), { roster: [...(teamData?.roster || []), newPlayer] });
    setNewPlayerName('');
    Alert.alert('성공', '선수가 등록되었습니다.');
  };

  const handleDeletePlayer = async (pid: number) => {
    if (!myTeamId) return;
    const updated = (teamData?.roster || []).filter(p => p.id !== pid);
    await updateDoc(doc(db, "teams", myTeamId), { roster: updated });
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
    if (!selectedMatchId) return;
    Alert.alert('매칭 수락', '이 팀과 경기를 확정하시겠습니까?', [
      { text: '취소' },
      { text: '확정', onPress: async () => {
          await updateDoc(doc(db, "matches", selectedMatchId), {
            status: 'matched',
            guestId: guestTeamId,
            applicants: []
          });
          
          await sendNotification(guestTeamId, 'match_upcoming', '매칭 성사!', '호스트가 매칭을 수락했습니다. 경기 일정을 확인하세요.');

          setApplicantModalVisible(false);
          Alert.alert('완료', '매칭이 성사되었습니다! [내 매칭] 탭에서 확인하세요.');
        } 
      }
    ]);
  };

  const handleOpenResultModal = (matchId: string) => {
    Alert.alert('결과 입력', '오늘 경기에서 승리하셨나요?\n(승리한 팀만 결과를 입력할 수 있습니다)', [
      { text: '아니오 (패배)', onPress: () => Alert.alert('알림', '패배한 팀은 상대방이 결과를 입력할 때까지 기다린 후, [승인] 버튼을 눌러주세요.') },
      { text: '네 (승리)', onPress: () => {
          setSelectedMatchId(matchId);
          setMyScoreInput('');
          setOpScoreInput('');
          setResultModalVisible(true);
        } 
      }
    ]);
  };

  const submitResult = async () => {
    if (!selectedMatchId || !myScoreInput || !opScoreInput || !myTeamId) return;
    const myScore = parseInt(myScoreInput);
    const opScore = parseInt(opScoreInput);

    if (myScore <= opScore) return Alert.alert('오류', '내 점수가 더 커야 합니다.');

    const match = confirmedList.find(m => m.id === selectedMatchId);
    if (!match) return;

    const amIHost = match.hostId === myTeamId;
    const finalHostScore = amIHost ? myScore : opScore;
    const finalGuestScore = amIHost ? opScore : myScore;
    const targetTeamId = amIHost ? match.guestId : match.hostId;

    await updateDoc(doc(db, "matches", selectedMatchId), {
      result: { 
        hostScore: finalHostScore, 
        guestScore: finalGuestScore, 
        status: 'waiting',
        submitterId: myTeamId 
      }
    });

    if (targetTeamId) {
        await sendNotification(targetTeamId, 'result_req', '결과 승인 요청', '상대 팀이 경기 결과를 입력했습니다. 승인해주세요.');
    }

    setResultModalVisible(false);
    Alert.alert('전송 완료', '상대 팀에게 승인 요청을 보냈습니다.');
  };

  const approveResult = async (match: MatchData) => {
    if (!match.result || !match.guestId || !myTeamId) return;
    
    if (match.result.submitterId === myTeamId) {
        Alert.alert('대기 중', '상대 팀의 승인을 기다리고 있습니다.');
        return;
    }

    const { hostScore, guestScore } = match.result;
    const amIHost = match.hostId === myTeamId;
    const myScoreView = amIHost ? hostScore : guestScore;
    const opScoreView = amIHost ? guestScore : hostScore;

    Alert.alert('결과 승인', `우리 팀 ${myScoreView} : ${opScoreView} 상대 팀\n\n이 결과가 맞습니까?`, [
        { 
          text: '이의 제기 (관리자)', 
          style: 'destructive',
          onPress: async () => {
            try {
               await updateDoc(doc(db, "matches", match.id), {
                 status: 'dispute',
                 "result.status": 'dispute'
               });
               const targetId = amIHost ? match.guestId : match.hostId;
               if(targetId) await sendNotification(targetId, 'dispute', '상대방의 이의제기', '경기 결과에 대해 이의가 제기되었습니다.');
               
               Alert.alert('접수 완료', '관리자에게 이의가 접수되었습니다.');
            } catch(e) { Alert.alert('오류', '요청 실패'); }
          }
        },
        { 
          text: '승인 (전적반영)', 
          onPress: async () => {
             try {
                await runTransaction(db, async (transaction) => {
                    const hostRef = doc(db, "teams", match.hostId);
                    const guestRef = doc(db, "teams", match.guestId!);
                    const matchRef = doc(db, "matches", match.id);
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
                    transaction.update(matchRef, {
                        status: 'finished',
                        "result.status": 'verified'
                    });
                });
                Alert.alert('처리 완료', '경기 결과와 승점이 반영되었습니다. [더보기]에서 전적을 확인하세요.');
            } catch (e) { Alert.alert('오류', '처리 실패: ' + e); }
          } 
        }
    ]);
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={tw`flex-1 bg-white px-5`}>
      <Text style={tw`text-2xl font-extrabold text-slate-800 mb-6 pt-2`}>라커룸</Text>

      <View style={tw`flex-row bg-slate-100 p-1 rounded-2xl mb-6`}>
        {['team', 'matches'].map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab as any)} style={tw`flex-1 py-2 rounded-xl items-center ${activeTab === tab ? 'bg-white shadow-sm' : ''}`}>
                <Text style={tw`font-bold ${activeTab === tab ? 'text-indigo-600' : 'text-slate-400'}`}>{tab === 'team' ? '우리 팀' : '내 매칭'}</Text>
            </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'team' ? (
        <ScrollView contentContainerStyle={tw`pb-24`} showsVerticalScrollIndicator={false}>
          <View style={tw`bg-white border border-indigo-100 rounded-3xl p-6 mb-6 shadow-lg shadow-indigo-100/50`}>
             <View style={tw`flex-row justify-between items-start mb-6`}>
                 <View style={tw`flex-row items-center`}>
                    <View style={tw`w-14 h-14 bg-indigo-50 rounded-2xl items-center justify-center mr-3`}><Text style={tw`text-2xl`}>🛡️</Text></View>
                    <View>
                        <Text style={tw`text-lg font-extrabold text-slate-800`}>{teamData?.name}</Text>
                        <Text style={tw`text-indigo-500 font-bold text-xs uppercase`}>{teamData?.affiliation}</Text>
                    </View>
                 </View>
                 <TouchableOpacity onPress={() => setTeamDetailModalVisible(true)} style={tw`bg-slate-50 px-3 py-1 rounded-full border border-slate-100`}>
                     <Text style={tw`text-xs font-bold text-slate-500`}>더보기 <FontAwesome name="chevron-right" size={10} /></Text>
                 </TouchableOpacity>
            </View>
            <View style={tw`flex-row bg-slate-50 rounded-2xl p-4 justify-between`}>
                <View style={tw`items-center flex-1 border-r border-slate-200`}><Text style={tw`text-xs text-slate-400 font-bold mb-1`}>경기</Text><Text style={tw`text-xl font-black text-slate-700`}>{teamData?.stats?.total || 0}</Text></View>
                <View style={tw`items-center flex-1 border-r border-slate-200`}><Text style={tw`text-xs text-slate-400 font-bold mb-1`}>승리</Text><Text style={tw`text-xl font-black text-indigo-600`}>{teamData?.stats?.wins || 0}</Text></View>
                <View style={tw`items-center flex-1 border-r border-slate-200`}><Text style={tw`text-xs text-slate-400 font-bold mb-1`}>승점</Text><Text style={tw`text-xl font-black text-slate-800`}>{teamData?.stats?.points || 0}</Text></View>
                <View style={tw`items-center flex-1`}><Text style={tw`text-xs text-slate-400 font-bold mb-1`}>랭킹</Text><Text style={tw`text-xl font-black text-amber-500`}>{myRank}위</Text></View>
            </View>
          </View>
          <View>
            <Text style={tw`font-bold text-slate-800 mb-3 ml-1`}>선수 명단 <Text style={tw`text-indigo-600`}>{teamData?.roster?.length || 0}</Text></Text>
            <View style={tw`gap-3 mb-6`}>
                {teamData?.roster?.map((player) => (
                    <View key={player.id} style={tw`bg-white p-3 rounded-2xl border border-slate-100 flex-row items-center justify-between`}>
                        <View style={tw`flex-row items-center`}>
                            <View style={tw`w-10 h-10 rounded-full bg-slate-100 items-center justify-center mr-3`}><Text style={tw`font-bold text-xs text-slate-600`}>{player.position}</Text></View>
                            <Text style={tw`font-bold text-slate-700`}>{player.name}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleDeletePlayer(player.id)} style={tw`p-2`}><FontAwesome name="minus-circle" size={20} color="#ef4444" /></TouchableOpacity>
                    </View>
                ))}
            </View>
            <View style={tw`bg-slate-50 p-4 rounded-2xl`}>
                <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>새 선수 등록</Text>
                <View style={tw`flex-row gap-2`}>
                    <TextInput style={tw`flex-1 bg-white p-3 rounded-xl border border-slate-200`} placeholder="이름" value={newPlayerName} onChangeText={setNewPlayerName}/>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`flex-1`}>{['L', 'R', 'C', 'S'].map(pos => (<TouchableOpacity key={pos} onPress={() => setNewPlayerPos(pos)} style={tw`w-10 h-10 rounded-xl items-center justify-center mr-1 ${newPlayerPos === pos ? 'bg-indigo-600' : 'bg-white border border-slate-200'}`}><Text style={tw`font-bold ${newPlayerPos === pos ? 'text-white' : 'text-slate-400'}`}>{pos}</Text></TouchableOpacity>))}</ScrollView>
                </View>
                <TouchableOpacity onPress={handleAddPlayer} style={tw`mt-3 bg-slate-800 py-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>추가하기</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={tw`pb-24`} showsVerticalScrollIndicator={false}>
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-slate-800 mb-3 border-l-4 border-green-500 pl-3`}>진행 중인 경기</Text>
                {confirmedList.length === 0 && <Text style={tw`text-slate-400 text-sm`}>진행 중인 경기가 없습니다.</Text>}
                {confirmedList.map(m => {
                    const isDispute = m.status === 'dispute';
                    const waitingApproval = m.result?.status === 'waiting';
                    const iSubmitted = m.result?.submitterId === myTeamId;
                    return (
                        <View key={m.id} style={tw`bg-white p-4 rounded-2xl border ${isDispute ? 'border-red-500' : 'border-green-100'} shadow-sm mb-3`}>
                            <View style={tw`flex-row justify-between mb-2`}>
                                <Text style={tw`font-bold text-slate-700`}>{m.team}</Text>
                                <Text style={tw`text-xs text-slate-500`}>{m.time}</Text>
                            </View>
                            <Text style={tw`text-xs text-slate-400 mb-3`}>{m.loc}</Text>
                            {isDispute ? (
                                <View style={tw`bg-red-50 p-2 rounded-lg items-center`}><Text style={tw`font-bold text-red-500`}>🚨 분쟁 조정 중 (관리자 호출됨)</Text></View>
                            ) : waitingApproval ? (
                                iSubmitted ? (
                                    <View style={tw`bg-orange-50 p-2 rounded-lg items-center`}><Text style={tw`font-bold text-orange-500`}>상대 팀 승인 대기중...</Text></View>
                                ) : (
                                    <TouchableOpacity onPress={() => approveResult(m)} style={tw`bg-indigo-600 p-3 rounded-xl items-center animate-pulse`}><Text style={tw`text-white font-bold`}>승인 요청 도착 (결과 확인)</Text></TouchableOpacity>
                                )
                            ) : (
                                <TouchableOpacity onPress={() => handleOpenResultModal(m.id)} style={tw`bg-green-500 p-3 rounded-xl items-center`}><Text style={tw`text-white font-bold`}>결과 입력 (승리 팀)</Text></TouchableOpacity>
                            )}
                        </View>
                    );
                })}
            </View>
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-slate-800 mb-3 border-l-4 border-indigo-500 pl-3`}>내가 모집 중</Text>
                {hostingList.length === 0 && <Text style={tw`text-slate-400 text-sm`}>모집 중인 경기가 없습니다.</Text>}
                {hostingList.map(m => (
                    <View key={m.id} style={tw`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-3`}>
                         <View style={tw`flex-row justify-between`}>
                            <View><Text style={tw`font-bold text-slate-700`}>{m.time}</Text><Text style={tw`text-xs text-slate-400`}>{m.loc}</Text></View>
                            {m.applicants && m.applicants.length > 0 ? (
                                <TouchableOpacity onPress={() => openApplicantModal(m.id, m.applicants)} style={tw`bg-indigo-600 px-4 py-2 rounded-xl justify-center`}><Text style={tw`text-white font-bold text-xs`}>신청자 {m.applicants.length}명 보기</Text></TouchableOpacity>
                            ) : (
                                <View style={tw`bg-slate-100 px-4 py-2 rounded-xl justify-center`}><Text style={tw`text-slate-400 font-bold text-xs`}>신청 대기중</Text></View>
                            )}
                        </View>
                    </View>
                ))}
            </View>
            <View style={tw`mb-8`}>
                <Text style={tw`font-bold text-slate-800 mb-3 border-l-4 border-pink-500 pl-3`}>내가 보낸 신청</Text>
                {applyingList.length === 0 && <Text style={tw`text-slate-400 text-sm`}>신청한 경기가 없습니다.</Text>}
                {applyingList.map(m => (
                    <View key={m.id} style={tw`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-3`}>
                        <Text style={tw`font-bold text-slate-700`}>{m.team}</Text>
                        <Text style={tw`text-xs text-slate-400`}>{m.time} | {m.loc}</Text>
                        <Text style={tw`text-pink-500 font-bold text-xs mt-2`}>수락 대기중...</Text>
                    </View>
                ))}
            </View>
        </ScrollView>
      )}

      {/* 모달들 (동일) */}
      <Modal visible={teamDetailModalVisible} animationType="slide" presentationStyle="pageSheet">
          <View style={tw`flex-1 bg-white p-6 pt-10`}>
              <View style={tw`flex-row justify-between items-center mb-8`}>
                  <Text style={tw`text-2xl font-extrabold text-slate-800`}>팀 상세 정보</Text>
                  <TouchableOpacity onPress={() => setTeamDetailModalVisible(false)} style={tw`bg-slate-100 p-2 rounded-full`}><FontAwesome name="close" size={20} color="#64748b" /></TouchableOpacity>
              </View>
              <View style={tw`bg-slate-50 p-6 rounded-3xl mb-8`}>
                  <Text style={tw`text-center font-extrabold text-2xl text-slate-800 mb-1`}>{teamData?.name}</Text>
                  <Text style={tw`text-center text-indigo-500 font-bold mb-6`}>{teamData?.affiliation}</Text>
                  <View style={tw`flex-row justify-around`}>
                      <View style={tw`items-center`}><Text style={tw`text-slate-400 font-bold mb-1`}>경기</Text><Text style={tw`text-2xl font-black text-slate-800`}>{teamData?.stats?.total || 0}</Text></View>
                      <View style={tw`items-center`}><Text style={tw`text-slate-400 font-bold mb-1`}>승리</Text><Text style={tw`text-2xl font-black text-indigo-600`}>{teamData?.stats?.wins || 0}</Text></View>
                      <View style={tw`items-center`}><Text style={tw`text-slate-400 font-bold mb-1`}>패배</Text><Text style={tw`text-2xl font-black text-slate-500`}>{teamData?.stats?.losses || 0}</Text></View>
                      <View style={tw`items-center`}><Text style={tw`text-slate-400 font-bold mb-1`}>승점</Text><Text style={tw`text-2xl font-black text-amber-500`}>{teamData?.stats?.points || 0}</Text></View>
                  </View>
              </View>
              <Text style={tw`font-bold text-lg text-slate-800 mb-4`}>지난 경기 기록 ({pastMatches.length})</Text>
              <FlatList
                  data={pastMatches}
                  keyExtractor={item => item.id}
                  renderItem={({item}) => {
                      const isHost = item.hostId === myTeamId;
                      const myScore = isHost ? item.result?.hostScore : item.result?.guestScore;
                      const opScore = isHost ? item.result?.guestScore : item.result?.hostScore;
                      const isWin = (myScore || 0) > (opScore || 0);
                      return (
                          <View style={tw`bg-white border border-slate-100 p-4 rounded-2xl mb-3 flex-row justify-between items-center shadow-sm`}>
                              <View><Text style={tw`font-bold text-slate-800`}>{item.team}</Text><Text style={tw`text-xs text-slate-400`}>{item.time.split(' ')[0]}</Text></View>
                              <View style={tw`flex-row items-center`}><Text style={tw`text-lg font-black ${isWin ? 'text-indigo-600' : 'text-slate-400'}`}>{myScore}</Text><Text style={tw`mx-2 text-slate-300 font-bold`}>:</Text><Text style={tw`text-lg font-black ${!isWin ? 'text-indigo-600' : 'text-slate-400'}`}>{opScore}</Text><View style={tw`ml-3 px-2 py-1 rounded-lg ${isWin ? 'bg-indigo-100' : 'bg-slate-100'}`}><Text style={tw`text-xs font-bold ${isWin ? 'text-indigo-600' : 'text-slate-500'}`}>{isWin ? 'WIN' : 'LOSE'}</Text></View></View>
                          </View>
                      );
                  }}
                  ListEmptyComponent={<Text style={tw`text-center text-slate-400 mt-4`}>완료된 경기가 없습니다.</Text>}
              />
          </View>
      </Modal>
      <Modal visible={applicantModalVisible} animationType="slide" transparent={true}>
        <View style={tw`flex-1 justify-end bg-black/50`}>
            <View style={tw`bg-white rounded-t-3xl p-6 min-h-[50%]`}>
                <Text style={tw`text-xl font-bold mb-4`}>신청 팀 목록</Text>
                <FlatList data={applicantsData} keyExtractor={item => item.id} renderItem={({item}) => (
                    <View style={tw`flex-row justify-between items-center bg-slate-50 p-4 rounded-2xl mb-3`}>
                        <View><Text style={tw`font-bold text-lg text-slate-800`}>{item.name}</Text><Text style={tw`text-sm text-slate-500`}>{item.affiliation} ({item.level}급)</Text></View>
                        <TouchableOpacity onPress={() => acceptMatch(item.id)} style={tw`bg-indigo-600 px-4 py-2 rounded-xl`}><Text style={tw`text-white font-bold`}>수락</Text></TouchableOpacity>
                    </View>
                )} />
                <TouchableOpacity onPress={() => setApplicantModalVisible(false)} style={tw`mt-4 bg-slate-200 p-4 rounded-xl items-center`}><Text style={tw`font-bold text-slate-600`}>닫기</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>
      <Modal visible={resultModalVisible} animationType="fade" transparent={true}>
        <View style={tw`flex-1 justify-center items-center bg-black/50 px-6`}>
            <View style={tw`bg-white w-full rounded-3xl p-6`}>
                <Text style={tw`text-xl font-bold mb-2 text-center`}>경기 결과 입력</Text>
                <Text style={tw`text-xs text-indigo-500 font-bold mb-6 text-center`}>승리한 팀 기준으로 점수를 입력하세요</Text>
                <View style={tw`flex-row justify-between items-center mb-8`}>
                    <View style={tw`items-center`}><Text style={tw`font-bold text-indigo-600 mb-2`}>우리 팀 (승)</Text><TextInput style={tw`w-20 h-20 bg-slate-100 rounded-2xl text-center text-3xl font-bold`} keyboardType="number-pad" value={myScoreInput} onChangeText={setMyScoreInput} /></View>
                    <Text style={tw`text-2xl font-bold text-slate-300`}>:</Text>
                    <View style={tw`items-center`}><Text style={tw`font-bold text-slate-500 mb-2`}>상대 팀 (패)</Text><TextInput style={tw`w-20 h-20 bg-slate-100 rounded-2xl text-center text-3xl font-bold`} keyboardType="number-pad" value={opScoreInput} onChangeText={setOpScoreInput} /></View>
                </View>
                <TouchableOpacity onPress={submitResult} style={tw`bg-indigo-600 py-4 rounded-xl items-center mb-3`}><Text style={tw`text-white font-bold text-lg`}>결과 전송</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setResultModalVisible(false)} style={tw`py-4 items-center`}><Text style={tw`text-slate-400 font-bold`}>취소</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}