import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc, runTransaction, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import tw from 'twrnc';
import { FontAwesome } from '@expo/vector-icons';

export default function AdminManager() {
  const [activeTab, setActiveTab] = useState<'dispute' | 'recruiting' | 'teams'>('dispute');
  const [disputes, setDisputes] = useState<any[]>([]);
  const [recruitings, setRecruitings] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // --- 분쟁 관리 상태 ---
  const [adminScoreHost, setAdminScoreHost] = useState('');
  const [adminScoreGuest, setAdminScoreGuest] = useState('');
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [contactInfo, setContactInfo] = useState<{host: string, guest: string} | null>(null);

  // --- 팀 상세 & 전적 수정 상태 ---
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [teamCaptain, setTeamCaptain] = useState<any>(null);
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  // 전적 수정용 입력값
  const [editStats, setEditStats] = useState({ wins: '', losses: '', points: '', total: '' });

  // --- 매치 수정 상태 ---
  const [editMatchModalVisible, setEditMatchModalVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  const [matchEditForm, setMatchEditForm] = useState({ time: '', loc: '', note: '' });
  const [hostContact, setHostContact] = useState('');

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
      recSnap.forEach(d => recList.push({ id: d.id, ...d.data() }));
      setRecruitings(recList);

      // 3. 모든 팀
      const qTeams = query(collection(db, "teams"), orderBy("name")); // 이름순 정렬
      const teamSnap = await getDocs(qTeams);
      const teamList: any[] = [];
      teamSnap.forEach(d => teamList.push({ id: d.id, ...d.data() }));
      setTeams(teamList);

    } catch (e) {
      console.error(e);
      Alert.alert('오류', '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- 공통: 연락처 가져오기 헬퍼 ---
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

  // --- 탭 1: 분쟁 관리 로직 ---
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
                  const hostRef = doc(db, "teams", match.hostId);
                  const guestRef = doc(db, "teams", match.guestId);
                  const matchRef = doc(db, "matches", match.id);
                  const hDoc = await transaction.get(hostRef);
                  const gDoc = await transaction.get(guestRef);
                  if(!hDoc.exists() || !gDoc.exists()) throw "Team Error";

                  const hStats = hDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
                  const gStats = gDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
                  const isHostWin = hScore > gScore;
                  const isDraw = hScore === gScore;
                  const hPoints = isHostWin ? 3 : 1;
                  const gPoints = !isHostWin && !isDraw ? 3 : 1;

                  transaction.update(hostRef, {
                      "stats.total": (hStats.total || 0) + 1,
                      "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0),
                      "stats.losses": (hStats.losses || 0) + (!isHostWin && !isDraw ? 1 : 0),
                      "stats.points": (hStats.points || 0) + hPoints
                  });
                  transaction.update(guestRef, {
                      "stats.total": (gStats.total || 0) + 1,
                      "stats.wins": (gStats.wins || 0) + (!isHostWin && !isDraw ? 1 : 0),
                      "stats.losses": (gStats.losses || 0) + (isHostWin ? 1 : 0),
                      "stats.points": (gStats.points || 0) + gPoints
                  });
                  transaction.update(matchRef, {
                      status: 'finished',
                      result: { hostScore: hScore, guestScore: gScore, status: 'verified_by_admin' }
                  });
              });
              Alert.alert('성공', '결과가 강제 반영되었습니다.');
              setSelectedDisputeId(null);
              loadData();
          } catch(e) { Alert.alert('오류', '처리 실패: ' + e); }
      }}
    ]);
  };

  const deleteMatch = async (matchId: string) => {
      Alert.alert('경기 삭제', '기록을 영구 삭제하시겠습니까?', [
          { text: '취소' },
          { text: '삭제', style: 'destructive', onPress: async () => {
              await deleteDoc(doc(db, "matches", matchId));
              loadData();
              setEditMatchModalVisible(false); // 모달에서 삭제했을 경우 닫기
          }}
      ]);
  };

  // --- 탭 2: 모집 관리 로직 ---
  const handleSelectRecruiting = async (match: any) => {
      setSelectedMatch(match);
      setMatchEditForm({ time: match.time, loc: match.loc, note: match.note });
      const phone = await getContact(match.hostId);
      setHostContact(phone);
      setEditMatchModalVisible(true);
  };

  const updateMatchInfo = async () => {
      if (!selectedMatch) return;
      try {
          await updateDoc(doc(db, "matches", selectedMatch.id), {
              time: matchEditForm.time,
              loc: matchEditForm.loc,
              note: matchEditForm.note
          });
          Alert.alert('수정 완료', '매치 정보가 수정되었습니다.');
          setEditMatchModalVisible(false);
          loadData();
      } catch(e) {
          Alert.alert('오류', '수정 실패');
      }
  };

  // --- 탭 3: 팀 관리 로직 ---
  const handleSelectTeam = async (team: any) => {
      setSelectedTeam(team);
      setTeamCaptain(null);
      // 전적 수정 폼 초기화
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
              }
          } catch (e) {}
      }
  };

  const updateTeamStats = async () => {
      if (!selectedTeam) return;
      Alert.alert('전적 수정', '입력한 내용으로 팀 전적을 덮어쓰시겠습니까?', [
          { text: '취소' },
          { text: '수정', onPress: async () => {
              try {
                  await updateDoc(doc(db, "teams", selectedTeam.id), {
                      stats: {
                          wins: parseInt(editStats.wins) || 0,
                          losses: parseInt(editStats.losses) || 0,
                          points: parseInt(editStats.points) || 0,
                          total: parseInt(editStats.total) || 0,
                      }
                  });
                  Alert.alert('완료', '전적이 수정되었습니다.');
                  setTeamModalVisible(false);
                  loadData();
              } catch(e) { Alert.alert('오류', '수정 실패'); }
          }}
      ]);
  };

  const deleteTeam = async () => {
    if (!selectedTeam) return;
    Alert.alert('팀 영구 삭제', `'${selectedTeam.name}' 팀을 삭제하시겠습니까?`, [
      { text: '취소' },
      { text: '삭제', style: 'destructive', onPress: async () => {
          try {
              await deleteDoc(doc(db, "teams", selectedTeam.id));
              if (selectedTeam.captainId) {
                  await updateDoc(doc(db, "users", selectedTeam.captainId), { teamId: null, role: 'User' });
              }
              Alert.alert('완료', '팀이 삭제되었습니다.');
              setTeamModalVisible(false);
              loadData();
          } catch (e) { Alert.alert('오류', '삭제 실패'); }
      }}
    ]);
  };

  return (
    <View style={tw`flex-1 bg-slate-900 pt-12 px-5`}>
      <View style={tw`flex-row justify-between items-center mb-4`}>
          <Text style={tw`text-2xl font-bold text-white`}>🕵️ 관리자 페이지</Text>
          <TouchableOpacity onPress={loadData} style={tw`bg-slate-800 p-2 rounded-lg`}><FontAwesome name="refresh" size={16} color="white" /></TouchableOpacity>
      </View>
      
      <View style={tw`flex-row bg-slate-800 p-1 rounded-xl mb-6`}>
        <TouchableOpacity onPress={() => setActiveTab('dispute')} style={tw`flex-1 py-3 rounded-lg items-center ${activeTab === 'dispute' ? 'bg-indigo-600' : ''}`}>
          <Text style={tw`text-white font-bold text-xs`}>🚨 분쟁 ({disputes.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('recruiting')} style={tw`flex-1 py-3 rounded-lg items-center ${activeTab === 'recruiting' ? 'bg-indigo-600' : ''}`}>
          <Text style={tw`text-white font-bold text-xs`}>📢 모집 ({recruitings.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('teams')} style={tw`flex-1 py-3 rounded-lg items-center ${activeTab === 'teams' ? 'bg-indigo-600' : ''}`}>
          <Text style={tw`text-white font-bold text-xs`}>🛡️ 팀 ({teams.length})</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color="white" style={tw`mt-10`} /> : (
        <ScrollView>
          {/* TAB 1: 분쟁 관리 */}
          {activeTab === 'dispute' && (
            disputes.length === 0 ? <Text style={tw`text-slate-500 text-center mt-10`}>접수된 분쟁이 없습니다.</Text> :
            disputes.map(m => (
              <TouchableOpacity 
                key={m.id} 
                onPress={() => handleSelectDispute(m)}
                style={tw`bg-slate-800 p-4 rounded-xl mb-3 border ${selectedDisputeId === m.id ? 'border-indigo-500 bg-slate-700' : 'border-red-500'}`}
              >
                <Text style={tw`text-red-400 font-bold mb-1`}>[이의제기]</Text>
                <Text style={tw`text-white font-bold text-lg`}>{m.team}</Text>
                <Text style={tw`text-slate-400 mb-2`}>{m.time} | {m.loc}</Text>
                
                {selectedDisputeId === m.id && (
                    <View style={tw`mt-3 bg-slate-900 p-3 rounded-lg`}>
                        <View style={tw`flex-row justify-between mb-4`}>
                             <Text style={tw`text-indigo-400 text-xs`}>Host: {contactInfo?.host}</Text>
                             <Text style={tw`text-pink-400 text-xs`}>Guest: {contactInfo?.guest}</Text>
                        </View>
                        <View style={tw`flex-row items-center justify-between mb-4`}>
                            <TextInput style={tw`w-12 h-10 bg-slate-800 border border-slate-600 rounded text-white text-center font-bold`} value={adminScoreHost} onChangeText={setAdminScoreHost} keyboardType="number-pad"/>
                            <Text style={tw`text-white font-bold`}>:</Text>
                            <TextInput style={tw`w-12 h-10 bg-slate-800 border border-slate-600 rounded text-white text-center font-bold`} value={adminScoreGuest} onChangeText={setAdminScoreGuest} keyboardType="number-pad"/>
                        </View>
                        <View style={tw`gap-2`}>
                            <TouchableOpacity onPress={() => forceFinalize(m)} style={tw`bg-green-600 p-3 rounded-lg items-center`}><Text style={tw`text-white font-bold`}>결과 확정</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteMatch(m.id)} style={tw`bg-red-600 p-3 rounded-lg items-center`}><Text style={tw`text-white font-bold`}>기록 삭제</Text></TouchableOpacity>
                        </View>
                    </View>
                )}
              </TouchableOpacity>
            ))
          )}

          {/* TAB 2: 모집 관리 (New) */}
          {activeTab === 'recruiting' && (
            recruitings.length === 0 ? <Text style={tw`text-slate-500 text-center mt-10`}>모집 중인 경기가 없습니다.</Text> :
            recruitings.map(m => (
                <TouchableOpacity key={m.id} onPress={() => handleSelectRecruiting(m)} style={tw`bg-slate-800 p-4 rounded-xl mb-3 border border-slate-700`}>
                    <View style={tw`flex-row justify-between`}>
                        <Text style={tw`text-indigo-400 font-bold`}>{m.team}</Text>
                        <Text style={tw`text-slate-500 text-xs`}>{m.createdAt?.split('T')[0]}</Text>
                    </View>
                    <Text style={tw`text-white font-bold mt-1`}>{m.time}</Text>
                    <Text style={tw`text-slate-400 text-xs`}>{m.loc}</Text>
                </TouchableOpacity>
            ))
          )}

          {/* TAB 3: 팀 관리 */}
          {activeTab === 'teams' && (
            teams.map(t => (
              <TouchableOpacity key={t.id} onPress={() => handleSelectTeam(t)} style={tw`bg-slate-800 p-4 rounded-xl mb-3 flex-row justify-between items-center`}>
                <View>
                    <Text style={tw`text-white font-bold text-lg`}>{t.name}</Text>
                    <Text style={tw`text-indigo-300 text-xs mt-1`}>{t.stats?.wins || 0}승 {t.stats?.losses || 0}패 ({t.stats?.points || 0}점)</Text>
                </View>
                <FontAwesome name="chevron-right" size={16} color="#64748b" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* --- 모달: 팀 상세 및 전적 수정 --- */}
      <Modal visible={teamModalVisible} animationType="slide" presentationStyle="pageSheet">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={tw`flex-1 bg-slate-900 p-6 pt-10`}>
              <ScrollView>
                <View style={tw`flex-row justify-between items-center mb-8`}>
                    <Text style={tw`text-2xl font-bold text-white`}>팀 데이터 수정</Text>
                    <TouchableOpacity onPress={() => setTeamModalVisible(false)}><FontAwesome name="close" size={24} color="white" /></TouchableOpacity>
                </View>
                
                {selectedTeam && (
                    <View>
                        <Text style={tw`text-3xl font-bold text-indigo-400 mb-1`}>{selectedTeam.name}</Text>
                        <Text style={tw`text-slate-400 mb-6`}>{selectedTeam.affiliation} ({selectedTeam.level}급)</Text>

                        {/* 전적 수정 폼 */}
                        <View style={tw`bg-slate-800 p-5 rounded-2xl mb-6`}>
                            <Text style={tw`text-white font-bold mb-4 border-b border-slate-700 pb-2`}>📊 전적 강제 수정 (즉시 반영)</Text>
                            <View style={tw`flex-row justify-between mb-3`}>
                                <View style={tw`w-[48%]`}>
                                    <Text style={tw`text-slate-400 text-xs mb-1`}>승리 (Wins)</Text>
                                    <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600`} keyboardType="number-pad" value={editStats.wins} onChangeText={(t) => setEditStats({...editStats, wins: t})} />
                                </View>
                                <View style={tw`w-[48%]`}>
                                    <Text style={tw`text-slate-400 text-xs mb-1`}>패배 (Losses)</Text>
                                    <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600`} keyboardType="number-pad" value={editStats.losses} onChangeText={(t) => setEditStats({...editStats, losses: t})} />
                                </View>
                            </View>
                            <View style={tw`flex-row justify-between mb-6`}>
                                <View style={tw`w-[48%]`}>
                                    <Text style={tw`text-slate-400 text-xs mb-1`}>승점 (Points)</Text>
                                    <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600`} keyboardType="number-pad" value={editStats.points} onChangeText={(t) => setEditStats({...editStats, points: t})} />
                                </View>
                                <View style={tw`w-[48%]`}>
                                    <Text style={tw`text-slate-400 text-xs mb-1`}>총 경기수 (Total)</Text>
                                    <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600`} keyboardType="number-pad" value={editStats.total} onChangeText={(t) => setEditStats({...editStats, total: t})} />
                                </View>
                            </View>
                            <TouchableOpacity onPress={updateTeamStats} style={tw`bg-indigo-600 p-4 rounded-xl items-center`}>
                                <Text style={tw`text-white font-bold`}>전적 수정 사항 저장</Text>
                            </TouchableOpacity>
                        </View>

                        {/* 대표 정보 및 삭제 */}
                        <View style={tw`bg-slate-800 p-5 rounded-2xl mb-6`}>
                            <Text style={tw`text-slate-400 text-xs font-bold mb-2`}>대표 연락처</Text>
                            <Text style={tw`text-white text-lg`}>{teamCaptain?.phoneNumber || '번호 없음'}</Text>
                            <Text style={tw`text-slate-500 text-sm`}>{teamCaptain?.email}</Text>
                        </View>

                        <TouchableOpacity onPress={deleteTeam} style={tw`bg-red-600/20 border border-red-600 p-4 rounded-xl items-center`}>
                            <Text style={tw`text-red-500 font-bold`}>팀 삭제 (주의)</Text>
                        </TouchableOpacity>
                    </View>
                )}
              </ScrollView>
          </KeyboardAvoidingView>
      </Modal>

      {/* --- 모달: 모집 공고 수정 --- */}
      <Modal visible={editMatchModalVisible} animationType="slide" transparent={true}>
          <View style={tw`flex-1 justify-center bg-black/70 px-5`}>
              <View style={tw`bg-slate-800 p-6 rounded-2xl w-full`}>
                  <Text style={tw`text-xl font-bold text-white mb-4`}>모집 공고 관리</Text>
                  
                  <Text style={tw`text-slate-400 text-xs mb-1`}>작성자 연락처</Text>
                  <Text style={tw`text-indigo-400 text-lg font-bold mb-4`}>{hostContact}</Text>

                  <Text style={tw`text-slate-400 text-xs mb-1`}>시간 (Time)</Text>
                  <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600 mb-3`} value={matchEditForm.time} onChangeText={(t) => setMatchEditForm({...matchEditForm, time: t})} />

                  <Text style={tw`text-slate-400 text-xs mb-1`}>장소 (Location)</Text>
                  <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600 mb-3`} value={matchEditForm.loc} onChangeText={(t) => setMatchEditForm({...matchEditForm, loc: t})} />

                  <Text style={tw`text-slate-400 text-xs mb-1`}>비고 (Note)</Text>
                  <TextInput style={tw`bg-slate-900 text-white p-3 rounded-lg border border-slate-600 mb-6`} value={matchEditForm.note} onChangeText={(t) => setMatchEditForm({...matchEditForm, note: t})} />

                  <View style={tw`gap-3`}>
                      <TouchableOpacity onPress={updateMatchInfo} style={tw`bg-indigo-600 p-4 rounded-xl items-center`}>
                          <Text style={tw`text-white font-bold`}>수정사항 저장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMatch(selectedMatch.id)} style={tw`bg-red-600 p-4 rounded-xl items-center`}>
                          <Text style={tw`text-white font-bold`}>공고 취소 (삭제)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditMatchModalVisible(false)} style={tw`bg-slate-700 p-4 rounded-xl items-center`}>
                          <Text style={tw`text-slate-300 font-bold`}>닫기</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </View>
  );
}