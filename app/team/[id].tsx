import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Modal, 
  TextInput, 
  Platform
  // Share 제거 (utils/share.ts 사용)
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { 
    doc, getDoc, updateDoc, arrayRemove, runTransaction, 
    collection, query, where, getDocs, orderBy, serverTimestamp 
} from 'firebase/firestore';
// 👇 [Path Check] 경로가 맞는지 확인해주세요
import { db, auth } from '../../configs/firebaseConfig';
import { useUser } from '../../context/UserContext';
// 👇 [New] 공유 유틸리티 불러오기
import { shareLink } from '../../utils/share';

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useUser();
  const teamId = Array.isArray(id) ? id[0] : id;

  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [pendingMatches, setPendingMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Modals State ---
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [resultModalVisible, setResultModalVisible] = useState(false);
  
  // --- Edit State ---
  const [editName, setEditName] = useState('');
  const [editIntro, setEditIntro] = useState('');
  
  // --- Match Result State ---
  const [targetMatch, setTargetMatch] = useState<any>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);

  useEffect(() => {
    if (teamId) fetchTeamData();
  }, [teamId]);

  const fetchTeamData = async () => {
    try {
        setLoading(true);
        // A. 팀 정보
        const teamSnap = await getDoc(doc(db, "teams", teamId));
        if (!teamSnap.exists()) {
            Alert.alert("오류", "팀을 찾을 수 없습니다.");
            return router.back();
        }
        const teamData = { id: teamSnap.id, ...teamSnap.data() } as any;
        
        setTeam(teamData);
        setEditName(teamData.name);
        setEditIntro(teamData.description || '');

        // B. 멤버 정보
        if (teamData.members && teamData.members.length > 0) {
            const memberPromises = teamData.members.map((uid: string) => getDoc(doc(db, "users", uid)));
            const memberSnaps = await Promise.all(memberPromises);
            
            const memberList = memberSnaps
                .filter((s: any) => s.exists())
                .map((s: any) => ({ id: s.id, ...s.data() }));
            setMembers(memberList);
        }

        // C. 매치 정보 (최근 경기)
        const q = query(
            collection(db, "matches"), 
            where("teamId", "==", teamId), 
            orderBy("time", "desc")
        );
        const matchSnaps = await getDocs(q);
        const matchList: any[] = [];
        const pendingList: any[] = [];
        
        matchSnaps.forEach(d => {
            const m = { id: d.id, ...d.data() } as any;
            matchList.push(m);
            
            // 종료됐는데 결과가 없는 경우 체크
            if (m.status === 'scheduled' && new Date(m.time) < new Date()) {
                pendingList.push(m);
            }
        });
        setMatches(matchList);
        setPendingMatches(pendingList);

    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  // ✅ [Updated] 공유 유틸리티(shareLink) 적용
  const handleInvite = async () => {
      const shareUrl = `https://pipe-app.vercel.app/team/${teamId}`;
      const message = `🏐 [PIPE 팀 초대장]\n'${team.name}' 팀에서 당신을 초대합니다!`;

      await shareLink({
          title: 'PIPE 팀 초대',
          message: message,
          url: shareUrl
      });
  };

  const handleUpdateTeam = async () => {
      if(!editName.trim()) return Alert.alert('알림', '팀 이름을 입력해주세요.');
      try {
          await updateDoc(doc(db, "teams", teamId), {
              name: editName,
              description: editIntro,
              updatedAt: new Date().toISOString()
          });
          Alert.alert('완료', '팀 정보가 수정되었습니다.');
          setEditModalVisible(false);
          fetchTeamData();
      } catch(e) { Alert.alert('오류', '수정 실패'); }
  };

  const handleKickMember = async (targetUser: any) => {
      Alert.alert('팀원 방출', `'${targetUser.name}'님을 팀에서 내보내시겠습니까?`, [
          { text: '취소', style: 'cancel' },
          { text: '방출', style: 'destructive', onPress: async () => {
              try {
                  await runTransaction(db, async (transaction) => {
                      const teamRef = doc(db, "teams", teamId);
                      const userRef = doc(db, "users", targetUser.id);
                      
                      transaction.update(teamRef, {
                          members: arrayRemove(targetUser.id)
                      });
                      transaction.update(userRef, {
                          teamId: null,
                          role: 'guest', 
                          updatedAt: new Date().toISOString()
                      });
                  });
                  Alert.alert('완료', '해당 멤버를 방출했습니다.');
                  fetchTeamData(); 
              } catch(e) { Alert.alert('오류', '처리 실패'); }
          }}
      ]);
  };

  // ✅ [Logic Verified] Transaction을 통한 안전한 결과 처리
  const handleInputResult = async () => {
      if (!targetMatch || !selectedWinner) return;
      try {
        await runTransaction(db, async (transaction) => {
            const matchRef = doc(db, "matches", targetMatch.id);
            const teamRef = doc(db, "teams", targetMatch.teamId); 
            const oppRef = doc(db, "teams", targetMatch.opponentId); 

            const mDoc = await transaction.get(matchRef);
            const mData = mDoc.data() as any;
            
            // 중복 처리 방지
            if(mData?.status === 'finished') throw "이미 처리된 경기입니다.";

            const homeDoc = await transaction.get(teamRef);
            const oppDoc = await transaction.get(oppRef);

            // 데이터 안전 접근 (기존 스탯이 없으면 0으로 초기화)
            const hStats = (homeDoc.data() as any)?.stats || { wins:0, losses:0, points:0, total:0 };
            const oStats = (oppDoc.data() as any)?.stats || { wins:0, losses:0, points:0, total:0 };

            // 승점 로직: 승리 3점, 패배 1점
            if (selectedWinner === targetMatch.teamId) {
                hStats.wins++; hStats.points += 3;
                oStats.losses++; oStats.points += 1;
            } else {
                oStats.wins++; oStats.points += 3;
                hStats.losses++; hStats.points += 1;
            }
            hStats.total++; oStats.total++;

            // 상태 업데이트 및 종료 시간 기록
            transaction.update(matchRef, { status: 'finished', winnerId: selectedWinner, endedAt: serverTimestamp() });
            transaction.update(teamRef, { stats: hStats });
            transaction.update(oppRef, { stats: oStats });
        });
        
        Alert.alert('성공', '경기 결과가 반영되었습니다.');
        setResultModalVisible(false);
        setMatchModalVisible(false); 
        fetchTeamData();

      } catch(e) { Alert.alert('오류', '결과 처리 실패'); }
  };


  if (loading || !team) {
      return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#4F46E5" /></View>;
  }

  const isCaptain = user?.uid === team.captainId;
  const isMember = team.members?.includes(user?.uid);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* 1. Header (공유 버튼 제거됨) */}
      <View className="px-5 py-3 border-b border-gray-100 flex-row justify-between items-center">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text className="font-bold text-lg">팀 상세</Text>
        <View className="w-8" /> {/* 레이아웃 균형을 위한 빈 공간 */}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* 2. Team Profile */}
        <View className="items-center py-8 bg-indigo-50/50">
            <View className="w-24 h-24 bg-white rounded-full items-center justify-center shadow-sm mb-4 border border-indigo-100">
                <FontAwesome5 name="users" size={40} color="#4F46E5" />
            </View>
            <Text className="text-2xl font-black text-gray-900 mb-1">{team.name}</Text>
            <Text className="text-gray-500 mb-4">{team.affiliation} · {team.level}급</Text>
            
            <View className="flex-row gap-4 bg-white px-6 py-3 rounded-xl shadow-sm">
                <View className="items-center">
                    <Text className="text-xs text-gray-400 font-bold">승리</Text>
                    <Text className="text-lg font-black text-indigo-600">{team.stats?.wins || 0}</Text>
                </View>
                <View className="w-[1px] bg-gray-100" />
                <View className="items-center">
                    <Text className="text-xs text-gray-400 font-bold">패배</Text>
                    <Text className="text-lg font-black text-gray-600">{team.stats?.losses || 0}</Text>
                </View>
                <View className="w-[1px] bg-gray-100" />
                <View className="items-center">
                    <Text className="text-xs text-gray-400 font-bold">승점</Text>
                    <Text className="text-lg font-black text-gray-900">{team.stats?.points || 0}</Text>
                </View>
            </View>
        </View>

        {/* 3. [Updated] Captain Dashboard UI */}
        {isCaptain ? (
            <View className="mx-5 mt-6 bg-[#191F28] rounded-2xl p-5 shadow-lg">
                <View className="flex-row items-center mb-4">
                    <FontAwesome5 name="crown" size={16} color="#FBBF24" />
                    <Text className="text-white font-bold text-lg ml-2">대표자 관리 모드</Text>
                </View>
                <View className="flex-row gap-3">
                    <TouchableOpacity onPress={() => setEditModalVisible(true)} className="flex-1 bg-gray-700 py-4 rounded-xl items-center active:bg-gray-600">
                        <FontAwesome5 name="edit" size={18} color="#9CA3AF" style={{marginBottom:6}}/>
                        <Text className="text-gray-300 font-bold text-xs">정보 수정</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMemberModalVisible(true)} className="flex-1 bg-gray-700 py-4 rounded-xl items-center active:bg-gray-600">
                        <FontAwesome5 name="user-friends" size={18} color="#60A5FA" style={{marginBottom:6}}/>
                        <Text className="text-blue-300 font-bold text-xs">멤버 관리</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMatchModalVisible(true)} className="flex-1 bg-gray-700 py-4 rounded-xl items-center active:bg-gray-600">
                        <View>
                            <FontAwesome5 name="trophy" size={18} color="#FBBF24" style={{marginBottom:6, alignSelf:'center'}}/>
                            {pendingMatches.length > 0 && <View className="absolute -top-1 -right-2 w-3 h-3 bg-red-500 rounded-full border border-white" />}
                        </View>
                        <Text className="text-yellow-500 font-bold text-xs">매치 관리</Text>
                    </TouchableOpacity>
                </View>
            </View>
        ) : isMember && (
            <View className="px-5 py-4">
                <TouchableOpacity onPress={handleInvite} className="bg-indigo-600 w-full py-4 rounded-xl flex-row justify-center items-center shadow-md shadow-indigo-200">
                    <FontAwesome5 name="share-square" size={16} color="white" style={{marginRight:8}} />
                    <Text className="text-white font-bold text-lg">팀원 초대하기</Text>
                </TouchableOpacity>
            </View>
        )}

        {/* Team Description */}
        <View className="px-5 py-6">
            <Text className="text-lg font-bold text-gray-900 mb-3">팀 소개</Text>
            <View className="bg-gray-50 p-4 rounded-xl min-h-[100px]">
                <Text className="text-gray-600 leading-relaxed">{team.description || "소개글이 없습니다."}</Text>
            </View>
        </View>

        {/* Members List */}
        <View className="px-5 pb-6">
            <View className="flex-row justify-between items-center mb-3">
                <Text className="text-lg font-bold text-gray-900">멤버 ({members.length})</Text>
                <TouchableOpacity onPress={() => setMemberModalVisible(true)}>
                    <Text className="text-gray-400 text-sm">더보기</Text>
                </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-3">
                {members.slice(0, 5).map(m => (
                    <View key={m.id} className="items-center mr-4">
                        <View className="w-12 h-12 bg-gray-200 rounded-full items-center justify-center mb-1">
                            <FontAwesome5 name="user" size={16} color="#9CA3AF" />
                        </View>
                        <Text className="text-xs text-gray-700 font-medium">{m.name}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
      </ScrollView>

      {/* --- Modals --- */}
      
      {/* Edit Modal */}
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

      {/* Member Modal */}
      <Modal visible={memberModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
                <Text className="font-bold text-lg">멤버 관리</Text>
                <TouchableOpacity onPress={() => setMemberModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity>
            </View>
            <View className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                 <TouchableOpacity onPress={handleInvite} className="bg-white border border-indigo-200 py-3 rounded-xl flex-row justify-center items-center">
                    <FontAwesome5 name="share-square" size={14} color="#4F46E5" style={{marginRight:6}} />
                    <Text className="text-indigo-600 font-bold">팀원 초대 링크 공유</Text>
                </TouchableOpacity>
            </View>
            <ScrollView className="px-5">
                {members.map(m => (
                    <View key={m.id} className="flex-row items-center justify-between py-4 border-b border-gray-50">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-3">
                                <FontAwesome5 name="user" size={14} color="#9CA3AF" />
                            </View>
                            <View>
                                <Text className="font-bold text-gray-900">{m.name} {m.id === team.captainId && <Text className="text-indigo-600 text-xs"> (대표)</Text>}</Text>
                                <Text className="text-xs text-gray-400">{m.phoneNumber || '연락처 없음'}</Text>
                            </View>
                        </View>
                        {isCaptain && m.id !== user?.uid && (
                            <TouchableOpacity onPress={() => handleKickMember(m)} className="bg-red-50 px-3 py-1.5 rounded-lg">
                                <Text className="text-red-500 text-xs font-bold">방출</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Match Modal */}
      <Modal visible={matchModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-white">
            <View className="px-5 py-4 border-b border-gray-100 flex-row justify-between items-center">
                <Text className="font-bold text-lg">매치 관리</Text>
                <TouchableOpacity onPress={() => setMatchModalVisible(false)}><FontAwesome5 name="times" size={20} color="#111827" /></TouchableOpacity>
            </View>
            <ScrollView className="p-5">
                {pendingMatches.length > 0 && (
                    <View className="mb-6">
                        <Text className="font-bold text-red-500 mb-2">🚨 결과 입력이 필요합니다!</Text>
                        {pendingMatches.map(m => (
                            <View key={m.id} className="bg-red-50 border border-red-100 p-4 rounded-xl mb-2 flex-row justify-between items-center">
                                <View>
                                    <Text className="font-bold text-gray-900">{m.opponentName ? `vs ${m.opponentName}` : '상대 미정'}</Text>
                                    <Text className="text-xs text-red-400">{m.timeDisplay}</Text>
                                </View>
                                <TouchableOpacity 
                                    onPress={() => { setTargetMatch(m); setResultModalVisible(true); }}
                                    className="bg-red-500 px-4 py-2 rounded-lg"
                                >
                                    <Text className="text-white font-bold text-xs">결과 입력</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
                <Text className="font-bold text-gray-900 mb-3">경기 기록</Text>
                {matches.map(m => (
                    <View key={m.id} className="bg-white border border-gray-100 p-4 rounded-xl mb-3 shadow-sm">
                        <View className="flex-row justify-between mb-2">
                            <Text className={`text-xs font-bold ${m.status === 'finished' ? 'text-gray-400' : 'text-blue-500'}`}>
                                {m.status === 'finished' ? '종료됨' : '예정됨'}
                            </Text>
                            <Text className="text-xs text-gray-400">{m.timeDisplay}</Text>
                        </View>
                        <Text className="font-bold text-lg mb-1">{m.opponentName ? `vs ${m.opponentName}` : '상대팀 미정'}</Text>
                        <Text className="text-xs text-gray-500">{m.loc}</Text>
                        {m.winnerId && (
                            <View className="mt-2 bg-gray-100 self-start px-2 py-1 rounded">
                                <Text className="text-xs text-gray-600 font-bold">
                                    결과: {m.winnerId === teamId ? '승리 🏆' : '패배'}
                                </Text>
                            </View>
                        )}
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Result Input Modal */}
      <Modal visible={resultModalVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-2xl p-6">
                  <Text className="text-xl font-bold text-center mb-2">경기 결과 확정</Text>
                  <Text className="text-center text-gray-500 text-xs mb-6">승리한 팀을 선택해주세요. 결과는 되돌릴 수 없습니다.</Text>
                  
                  {targetMatch && (
                      <View className="flex-row gap-3 mb-6">
                          <TouchableOpacity onPress={() => setSelectedWinner(targetMatch.teamId)} className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === targetMatch.teamId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}>
                              <Text className={`font-bold ${selectedWinner === targetMatch.teamId ? 'text-indigo-600' : 'text-gray-500'}`}>{team.name} (우리팀)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setSelectedWinner(targetMatch.opponentId)} className={`flex-1 p-4 rounded-xl border-2 items-center ${selectedWinner === targetMatch.opponentId ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100'}`}>
                              <Text className={`font-bold ${selectedWinner === targetMatch.opponentId ? 'text-indigo-600' : 'text-gray-500'}`}>{targetMatch.opponentName}</Text>
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
    </SafeAreaView>
  );
}
