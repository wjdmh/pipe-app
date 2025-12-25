import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  TextInput, 
  ActivityIndicator, 
  Modal, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { collection, query, where, getDocs, updateDoc, doc, runTransaction, getDoc, orderBy, serverTimestamp } from 'firebase/firestore';
// 👇 [Path Check] auth 추가 (보안 검증용)
import { db, auth } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminManager() {
  const router = useRouter();
  
  // [보안] 관리자 이메일 상수 (MyPage와 동일)
  const ADMIN_EMAIL = 'wjdangus6984@gmail.com';

  const [activeTab, setActiveTab] = useState<'dispute' | 'recruiting' | 'teams'>('dispute');
  const [disputes, setDisputes] = useState<any[]>([]);
  const [recruitings, setRecruitings] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- 분쟁 관리 상태 ---
  const [adminScoreHost, setAdminScoreHost] = useState('');
  const [adminScoreGuest, setAdminScoreGuest] = useState('');
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [contactInfo, setContactInfo] = useState<{host: string, guest: string} | null>(null);

  // --- 팀 상세 & 전적 수정 상태 ---
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [teamCaptain, setTeamCaptain] = useState<any>(null);
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [captainStatus, setCaptainStatus] = useState<'active' | 'ghost'>('active');
  const [editStats, setEditStats] = useState({ wins: '', losses: '', points: '', total: '' });

  // --- 매치 수정 상태 ---
  const [editMatchModalVisible, setEditMatchModalVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [matchEditForm, setMatchEditForm] = useState({ time: '', loc: '', note: '' });
  const [hostContact, setHostContact] = useState('');

  // 1. 관리자 보안 검증 및 데이터 로드
  useEffect(() => {
    const init = async () => {
        // 로그인 체크 & 관리자 이메일 체크
        if (!auth.currentUser || auth.currentUser.email !== ADMIN_EMAIL) {
            Alert.alert("접근 거부", "관리자 권한이 없습니다.");
            router.replace('/home'); // 홈으로 강제 이동
            return;
        }
        await loadData();
    };
    init();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. 분쟁 중인 경기
      const qDispute = query(collection(db, "matches"), where("status", "==", "dispute"));
      const disputeSnap = await getDocs(qDispute);
      const disputeList: any[] = [];
      disputeSnap.forEach(d => disputeList.push({ id: d.id, ...d.data() }));
      setDisputes(disputeList);

      // 2. 모집 중인 경기
      const qRecruiting = query(collection(db, "matches"), where("status", "==", "recruiting"), orderBy("createdAt", "desc"));
      const recSnap = await getDocs(qRecruiting);
      const recList: any[] = [];
      recSnap.forEach(d => {
          const data = d.data();
          if (!data.isDeleted && data.status !== 'deleted') {
              recList.push({ id: d.id, ...data });
          }
      });
      setRecruitings(recList);

      // 3. 모든 팀 (삭제되지 않은)
      const qTeams = query(collection(db, "teams"), orderBy("name"));
      const teamSnap = await getDocs(qTeams);
      const teamList: any[] = [];
      teamSnap.forEach(d => {
          const data = d.data();
          if (!data.isDeleted) teamList.push({ id: d.id, ...data });
      });
      setTeams(teamList);

    } catch (e) {
      console.error(e);
      Alert.alert('오류', '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const getContact = async (teamId: string) => {
      if (!teamId) return '정보없음';
      try {
          const tSnap = await getDoc(doc(db, "teams", teamId));
          if (tSnap.exists() && tSnap.data().captainId) {
              const uSnap = await getDoc(doc(db, "users", tSnap.data().captainId));
              if (uSnap.exists()) return uSnap.data().phoneNumber || '번호없음';
          }
      } catch (e) {}
      return '정보없음';
  }

  // --- TAB 1: 분쟁 관리 로직 ---
  const handleSelectDispute = async (match: any) => {
      if (selectedDisputeId === match.id) {
          setSelectedDisputeId(null);
          return;
      }
      setSelectedDisputeId(match.id);
      setAdminScoreHost(String(match.result?.hostScore || 0));
      setAdminScoreGuest(String(match.result?.guestScore || 0));
      
      const hPhone = await getContact(match.hostId);
      const gPhone = await getContact(match.guestId);
      setContactInfo({ host: hPhone, guest: gPhone });
  };

  const forceFinalize = async (match: any) => {
    Alert.alert('강제 확정', `HOST ${adminScoreHost} : ${adminScoreGuest} GUEST\n이 결과로 확정하고 승점을 반영하시겠습니까?`, [
      { text: '취소' },
      { text: '확정', onPress: async () => {
          try {
              const hScore = parseInt(adminScoreHost || '0');
              const gScore = parseInt(adminScoreGuest || '0');
              if (!match.hostId || !match.guestId) return Alert.alert('오류', '팀 정보 유실');

              await runTransaction(db, async (transaction) => {
                  const matchRef = doc(db, "matches", match.id);
                  const currentMatch = await transaction.get(matchRef);
                  if (!currentMatch.exists()) throw "Match not found";
                  
                  if (currentMatch.data().status === 'finished') throw "이미 처리된 경기입니다.";

                  const hostRef = doc(db, "teams", match.hostId);
                  const guestRef = doc(db, "teams", match.guestId);
                  const hDoc = await transaction.get(hostRef);
                  const gDoc = await transaction.get(guestRef);
                  
                  if(hDoc.exists()) {
                      const hStats = hDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
                      const isHostWin = hScore > gScore;
                      const isDraw = hScore === gScore;
                      const hPoints = isHostWin ? 3 : (isDraw ? 1 : 1);
                      
                      transaction.update(hostRef, { 
                          "stats.total": (hStats.total || 0) + 1, 
                          "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0), 
                          "stats.losses": (hStats.losses || 0) + (!isHostWin && !isDraw ? 1 : 0), 
                          "stats.points": (hStats.points || 0) + hPoints,
                          lastActiveAt: serverTimestamp()
                      });
                  }

                  if(gDoc.exists()) {
                      const gStats = gDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
                      const isGuestWin = gScore > hScore;
                      const isDraw = gScore === hScore;
                      const gPoints = isGuestWin ? 3 : (isDraw ? 1 : 1);

                      transaction.update(guestRef, { 
                          "stats.total": (gStats.total || 0) + 1, 
                          "stats.wins": (gStats.wins || 0) + (isGuestWin ? 1 : 0), 
                          "stats.losses": (gStats.losses || 0) + (!isGuestWin && !isDraw ? 1 : 0), 
                          "stats.points": (gStats.points || 0) + gPoints,
                          lastActiveAt: serverTimestamp()
                      });
                  }

                  transaction.update(matchRef, { 
                      status: 'finished', 
                      result: { hostScore: hScore, guestScore: gScore, status: 'verified_by_admin' },
                      finishedAt: new Date().toISOString()
                  });
              });
              Alert.alert('성공', '결과가 강제 반영되었습니다.');
              setSelectedDisputeId(null);
              loadData();
          } catch(e: any) { Alert.alert('오류', '처리 실패: ' + e); }
      }}
    ]);
  };

  // --- TAB 2: 모집 관리 로직 ---
  const handleSelectRecruiting = async (match: any) => {
      setSelectedMatch(match);
      setMatchEditForm({ 
          time: match.time || '', 
          loc: match.loc || '', 
          note: match.note || '' 
      });
      
      const phone = await getContact(match.hostId);
      setHostContact(phone);
      setEditMatchModalVisible(true);
  };

  const deleteMatch = async (matchId: string) => {
      Alert.alert('경기 삭제 (Soft Delete)', '기록을 삭제하시겠습니까?', [
          { text: '취소' },
          { text: '삭제', style: 'destructive', onPress: async () => {
              await updateDoc(doc(db, "matches", matchId), { status: 'deleted', isDeleted: true, deletedAt: new Date().toISOString() });
              loadData();
              setEditMatchModalVisible(false); 
          }}
      ]);
  };

  const updateMatchInfo = async () => {
      if (!selectedMatch) return;
      try {
          await updateDoc(doc(db, "matches", selectedMatch.id), { time: matchEditForm.time, loc: matchEditForm.loc, note: matchEditForm.note });
          Alert.alert('수정 완료', '매치 정보가 수정되었습니다.');
          setEditMatchModalVisible(false);
          loadData();
      } catch(e) { Alert.alert('오류', '수정 실패'); }
  };

  // --- TAB 3: 팀 관리 로직 ---
  const handleSelectTeam = async (team: any) => {
      setSelectedTeam(team);
      setTeamCaptain(null);
      setCaptainStatus('active');
      setEditStats({
          wins: String(team.stats?.wins || 0),
          losses: String(team.stats?.losses || 0),
          points: String(team.stats?.points || 0),
          total: String(team.stats?.total || 0),
      });
      setTeamModalVisible(true);

      if (team.captainId) {
          try {
              const uSnap = await getDoc(doc(db, "users", team.captainId));
              if (uSnap.exists()) {
                  setTeamCaptain({ id: uSnap.id, ...uSnap.data() });
                  setCaptainStatus('active');
              } else {
                  setCaptainStatus('ghost'); 
              }
          } catch (e) { console.error(e); }
      } else {
          setCaptainStatus('ghost');
      }
  };

  const updateTeamStats = async () => {
      if (!selectedTeam) return;
      try {
          await updateDoc(doc(db, "teams", selectedTeam.id), {
              stats: { wins: parseInt(editStats.wins)||0, losses: parseInt(editStats.losses)||0, points: parseInt(editStats.points)||0, total: parseInt(editStats.total)||0 }
          });
          Alert.alert('완료', '전적이 수정되었습니다.');
          setTeamModalVisible(false);
          loadData();
      } catch(e) { Alert.alert('오류', '수정 실패'); }
  };

  const deleteTeam = async () => {
    if (!selectedTeam) return;
    Alert.alert('팀 삭제 (Soft Delete)', `'${selectedTeam.name}' 팀을 삭제 처리하시겠습니까?\n소속된 모든 멤버는 자동으로 탈퇴(Guest) 처리됩니다.`, [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: async () => {
          try {
              await runTransaction(db, async (transaction) => {
                  const teamRef = doc(db, "teams", selectedTeam.id);
                  const teamDoc = await transaction.get(teamRef);
                  if (!teamDoc.exists()) throw "팀 데이터가 존재하지 않습니다.";
                  
                  const teamData = teamDoc.data();
                  const memberIds = teamData.members || []; 

                  memberIds.forEach((uid: string) => {
                      const userRef = doc(db, "users", uid);
                      transaction.update(userRef, { 
                          teamId: null, 
                          role: 'guest',
                          updatedAt: new Date().toISOString()
                      });
                  });

                  transaction.update(teamRef, { 
                      isDeleted: true, 
                      deletedAt: new Date().toISOString(),
                      captainId: null,
                      members: [],
                      roster: []
                  });
              });

              Alert.alert('완료', '팀과 소속 멤버가 모두 정리되었습니다.');
              setTeamModalVisible(false);
              loadData(); 

          } catch (e: any) { 
              console.error(e);
              Alert.alert('오류', '삭제 처리 중 문제가 발생했습니다: ' + e.message); 
          }
      }}
    ]);
  };

  const formatTimeSimple = (timeStr: string) => {
      if (!timeStr) return '-';
      const d = new Date(timeStr);
      if(!isNaN(d.getTime()) && timeStr.includes('T')) {
          return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
      }
      return timeStr;
  }

  return (
    // 👇 [Fix] Web 호환성 패딩 적용 (상단 여백 확보)
    <SafeAreaView 
        className="flex-1 bg-slate-900" 
        edges={['top']}
        style={{ paddingTop: Platform.OS === 'web' ? 20 : 0 }}
    >
      {/* 헤더: 뒤로가기 및 타이틀 */}
      <View className="px-5 pb-4 flex-row justify-between items-center border-b border-slate-800">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-3 p-2 -ml-2">
                <FontAwesome5 name="arrow-left" size={20} color="white" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-white">🕵️ 관리자 페이지</Text>
          </View>
          <TouchableOpacity onPress={loadData} className="bg-slate-800 p-2 rounded-lg">
              <FontAwesome5 name="sync" size={16} color="white" />
          </TouchableOpacity>
      </View>
      
      {/* 탭 네비게이션 */}
      <View className="flex-row bg-slate-800 p-1 mx-5 mt-4 rounded-xl mb-4">
        {['dispute', 'recruiting', 'teams'].map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab as any)} className={`flex-1 py-3 rounded-lg items-center ${activeTab === tab ? 'bg-indigo-600' : ''}`}>
                <Text className="text-white font-bold text-xs">
                    {tab === 'dispute' ? '🚨 분쟁' : tab === 'recruiting' ? '📢 모집' : '🛡️ 팀'} 
                    {tab === 'dispute' ? ` (${disputes.length})` : tab === 'recruiting' ? ` (${recruitings.length})` : ` (${teams.length})`}
                </Text>
            </TouchableOpacity>
        ))}
      </View>

      {/* 메인 컨텐츠 리스트 */}
      {loading ? <ActivityIndicator color="white" className="mt-10" /> : (
        <ScrollView contentContainerClassName="pb-20 px-5">
          
          {/* TAB 1: 분쟁 */}
          {activeTab === 'dispute' && (
            disputes.length === 0 ? <Text className="text-slate-500 text-center mt-10">접수된 분쟁이 없습니다.</Text> :
            disputes.map(m => (
              <TouchableOpacity key={m.id} onPress={() => handleSelectDispute(m)} className={`bg-slate-800 p-4 rounded-xl mb-3 border ${selectedDisputeId === m.id ? 'border-indigo-500 bg-slate-700' : 'border-red-500'}`}>
                <Text className="text-red-400 font-bold mb-1">[이의제기]</Text>
                <Text className="text-white font-bold text-lg">{m.team}</Text>
                <Text className="text-slate-400 mb-2">{formatTimeSimple(m.time)} | {m.loc}</Text>
                {selectedDisputeId === m.id && (
                    <View className="mt-3 bg-slate-900 p-3 rounded-lg">
                        <View className="flex-row justify-between mb-4"><Text className="text-indigo-400 text-xs">Host: {contactInfo?.host}</Text><Text className="text-pink-400 text-xs">Guest: {contactInfo?.guest}</Text></View>
                        <View className="flex-row items-center justify-between mb-4">
                            <TextInput className="w-12 h-10 bg-slate-800 border border-slate-600 rounded text-white text-center font-bold" value={adminScoreHost} onChangeText={setAdminScoreHost} keyboardType="number-pad"/>
                            <Text className="text-white font-bold">:</Text>
                            <TextInput className="w-12 h-10 bg-slate-800 border border-slate-600 rounded text-white text-center font-bold" value={adminScoreGuest} onChangeText={setAdminScoreGuest} keyboardType="number-pad"/>
                        </View>
                        <View className="gap-2">
                            <TouchableOpacity onPress={() => forceFinalize(m)} className="bg-green-600 p-3 rounded-lg items-center"><Text className="text-white font-bold">결과 확정</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteMatch(m.id)} className="bg-red-600 p-3 rounded-lg items-center"><Text className="text-white font-bold">기록 삭제</Text></TouchableOpacity>
                        </View>
                    </View>
                )}
              </TouchableOpacity>
            ))
          )}

          {/* TAB 2: 모집 */}
          {activeTab === 'recruiting' && (
            recruitings.length === 0 ? <Text className="text-slate-500 text-center mt-10">모집 중인 경기가 없습니다.</Text> :
            recruitings.map(m => (
                <TouchableOpacity key={m.id} onPress={() => handleSelectRecruiting(m)} className="bg-slate-800 p-4 rounded-xl mb-3 border border-slate-700">
                    <View className="flex-row justify-between">
                        <Text className="text-indigo-400 font-bold">{m.team}</Text>
                        <Text className="text-slate-500 text-xs">{m.createdAt ? m.createdAt.split('T')[0] : '날짜없음'}</Text>
                    </View>
                    <Text className="text-white font-bold mt-1">{formatTimeSimple(m.time)}</Text>
                    <Text className="text-slate-400 text-xs">{m.loc}</Text>
                </TouchableOpacity>
            ))
          )}

          {/* TAB 3: 팀 */}
          {activeTab === 'teams' && (
            teams.map(t => (
              <TouchableOpacity key={t.id} onPress={() => handleSelectTeam(t)} className="bg-slate-800 p-4 rounded-xl mb-3 flex-row justify-between items-center border border-slate-700">
                <View>
                    <View className="flex-row items-center mb-1">
                        <Text className="text-white font-bold text-lg mr-2">{t.name}</Text>
                        {t.kusfId ? <View className="bg-blue-900 px-2 py-0.5 rounded"><Text className="text-blue-300 text-[10px] font-bold">KUSF</Text></View> : <View className="bg-gray-700 px-2 py-0.5 rounded"><Text className="text-gray-300 text-[10px] font-bold">자체생성</Text></View>}
                    </View>
                    <Text className="text-indigo-300 text-xs">{t.stats?.wins||0}승 {t.stats?.losses||0}패 ({t.stats?.points||0}점)</Text>
                </View>
                <FontAwesome5 name="chevron-right" size={16} color="#64748b" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* --- Modals (수정 및 삭제용) --- */}
      
      {/* 1. 팀 수정 모달 */}
      <Modal visible={teamModalVisible} animationType="slide" presentationStyle="pageSheet">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-slate-900 p-6 pt-10">
              <ScrollView>
                <View className="flex-row justify-between items-center mb-8">
                    <Text className="text-2xl font-bold text-white">팀 데이터 수정</Text>
                    <TouchableOpacity onPress={() => setTeamModalVisible(false)}><FontAwesome5 name="times" size={24} color="white" /></TouchableOpacity>
                </View>
                {selectedTeam && (
                    <View>
                        <Text className="text-3xl font-bold text-indigo-400 mb-1">{selectedTeam.name}</Text>
                        <Text className="text-slate-400 mb-6">{selectedTeam.affiliation} ({selectedTeam.level}급)</Text>
                        {captainStatus === 'ghost' && <View className="bg-red-900/50 border border-red-500 p-4 rounded-xl mb-6"><Text className="text-red-300 font-bold mb-1">유령 팀 감지됨</Text><Text className="text-red-200 text-xs">대표자가 탈퇴했습니다. 삭제를 권장합니다.</Text></View>}
                        
                        <View className="bg-slate-800 p-5 rounded-2xl mb-6">
                            <Text className="text-white font-bold mb-4 border-b border-slate-700 pb-2">📊 전적 강제 수정</Text>
                            <View className="flex-row justify-between mb-3"><View className="w-[48%]"> <Text className="text-slate-400 text-xs mb-1">승리</Text> <TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600" keyboardType="number-pad" value={editStats.wins} onChangeText={(t)=>setEditStats({...editStats,wins:t})} /> </View> <View className="w-[48%]"> <Text className="text-slate-400 text-xs mb-1">패배</Text> <TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600" keyboardType="number-pad" value={editStats.losses} onChangeText={(t)=>setEditStats({...editStats,losses:t})} /> </View></View>
                            <View className="flex-row justify-between mb-6"><View className="w-[48%]"> <Text className="text-slate-400 text-xs mb-1">승점</Text> <TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600" keyboardType="number-pad" value={editStats.points} onChangeText={(t)=>setEditStats({...editStats,points:t})} /> </View> <View className="w-[48%]"> <Text className="text-slate-400 text-xs mb-1">총 경기</Text> <TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600" keyboardType="number-pad" value={editStats.total} onChangeText={(t)=>setEditStats({...editStats,total:t})} /> </View></View>
                            <TouchableOpacity onPress={updateTeamStats} className="bg-indigo-600 p-4 rounded-xl items-center"><Text className="text-white font-bold">전적 저장</Text></TouchableOpacity>
                        </View>
                        {captainStatus === 'active' && <View className="bg-slate-800 p-5 rounded-2xl mb-6"><Text className="text-slate-400 text-xs font-bold mb-2">대표 연락처</Text><Text className="text-white text-lg">{teamCaptain?.phoneNumber || '번호 없음'}</Text><Text className="text-slate-500 text-sm">{teamCaptain?.email}</Text></View>}
                        <TouchableOpacity onPress={deleteTeam} className="bg-red-600/20 border border-red-600 p-4 rounded-xl items-center mb-10"><Text className="text-red-500 font-bold">팀 삭제</Text></TouchableOpacity>
                    </View>
                )}
              </ScrollView>
          </KeyboardAvoidingView>
      </Modal>

      {/* 2. 매치 수정 모달 */}
      <Modal visible={editMatchModalVisible} animationType="slide" transparent={true}>
          <View className="flex-1 justify-center bg-black/70 px-5">
              <View className="bg-slate-800 p-6 rounded-2xl w-full">
                  <Text className="text-xl font-bold text-white mb-4">모집 공고 관리</Text>
                  <Text className="text-slate-400 text-xs mb-1">작성자 연락처</Text><Text className="text-indigo-400 text-lg font-bold mb-4">{hostContact}</Text>
                  <Text className="text-slate-400 text-xs mb-1">시간</Text><TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600 mb-3" value={matchEditForm.time} onChangeText={(t)=>setMatchEditForm({...matchEditForm,time:t})} />
                  <Text className="text-slate-400 text-xs mb-1">장소</Text><TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600 mb-3" value={matchEditForm.loc} onChangeText={(t)=>setMatchEditForm({...matchEditForm,loc:t})} />
                  <Text className="text-slate-400 text-xs mb-1">비고</Text><TextInput className="bg-slate-900 text-white p-3 rounded-lg border border-slate-600 mb-6" value={matchEditForm.note} onChangeText={(t)=>setMatchEditForm({...matchEditForm,note:t})} />
                  <View className="gap-3">
                      <TouchableOpacity onPress={updateMatchInfo} className="bg-indigo-600 p-4 rounded-xl items-center"><Text className="text-white font-bold">수정사항 저장</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMatch(selectedMatch.id)} className="bg-red-600 p-4 rounded-xl items-center"><Text className="text-white font-bold">공고 취소</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditMatchModalVisible(false)} className="bg-slate-700 p-4 rounded-xl items-center"><Text className="text-slate-300 font-bold">닫기</Text></TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
  );
}