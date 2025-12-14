import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, query, getDocs, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../configs/firebaseConfig';
import { KUSF_TEAMS } from '../home/ranking';

const REGIONS = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"];

export default function TeamRegister() {
  const router = useRouter();
  const { mode } = useLocalSearchParams(); // 'search' or 'create'
  const [step, setStep] = useState(mode === 'create' ? 'INFO_FORM' : 'SEARCH');
  const [loading, setLoading] = useState(false);
  
  const [userInfo, setUserInfo] = useState<any>(null);
  const [registeredTeamsMap, setRegisteredTeamsMap] = useState<{[key: string]: any}>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');
  const [targetTeam, setTargetTeam] = useState<any>(null);
  
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [reclaimDocId, setReclaimDocId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);

  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [showRegionModal, setShowRegionModal] = useState(false);

  useEffect(() => {
    fetchUserInfo();
    fetchRegisteredTeams();
  }, []);

  const fetchUserInfo = async () => {
    if (!auth.currentUser) return;
    try {
        const uSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (uSnap.exists()) setUserInfo(uSnap.data());
    } catch (e) { console.error("User Fetch Error", e); }
  };

  const fetchRegisteredTeams = async () => {
      try {
        const q = query(collection(db, "teams"));
        const snapshot = await getDocs(q);
        const map: {[key: string]: any} = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.kusfId) map[data.kusfId] = { ...data, docId: doc.id };
        });
        setRegisteredTeamsMap(map);
      } catch (e) { console.error("Teams Fetch Error", e); }
  };

  // KUSF 팀 목록 필터링
  const filteredTeams = KUSF_TEAMS.filter(team => {
    return team.gender === selectedGender && (team.name.includes(searchQuery) || team.affiliation.includes(searchQuery));
  });

  const onSelectExistingTeam = async (kusfTeam: any) => {
    const existingData = registeredTeamsMap[kusfTeam.id];

    // Case 1: 이미 등록된 팀이 활성화된 경우
    if (existingData && !existingData.isDeleted && existingData.captainId) {
        Alert.alert('가입 신청', `'${existingData.name}' 팀은 이미 활동 중입니다.\n팀원으로 가입 신청을 보내시겠습니까?`, [
            { text: '취소', style: 'cancel' },
            { text: '신청 보내기', onPress: () => sendJoinRequest(existingData) }
        ]);
        return;
    }
    
    // Case 2: 등록되었으나 비활성(삭제됨/대표없음) -> 이어받기
    if (existingData) {
        Alert.alert('팀 이어받기', '현재 활동하지 않는 팀입니다. 대표자가 되어 팀을 운영하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            { text: '이어받기', onPress: () => {
                setTargetTeam(kusfTeam); setTeamName(kusfTeam.name);
                setIsReclaiming(true); setReclaimDocId(existingData.docId);
                if(existingData.region) setSelectedRegion(existingData.region);
                setStep('VERIFY');
            }}
        ]);
        return;
    }

    // Case 3: 신규 등록
    setTargetTeam(kusfTeam);
    setTeamName(kusfTeam.name);
    setIsReclaiming(false);
    setStep('VERIFY');
  };

  const sendJoinRequest = async (teamDocData: any) => {
      if (!auth.currentUser || !userInfo) return;
      setLoading(true);
      try {
          await runTransaction(db, async (transaction) => {
              const teamRef = doc(db, "teams", teamDocData.docId);
              const teamSnap = await transaction.get(teamRef);
              
              if (!teamSnap.exists()) throw "팀이 존재하지 않습니다.";
              
              const currentRequests = teamSnap.data().joinRequests || [];
              const isAlreadyRequested = currentRequests.some((req: any) => req.uid === auth.currentUser?.uid);
              if (isAlreadyRequested) throw "이미 가입 신청을 보냈습니다.";

              const requestPayload = {
                  uid: auth.currentUser!.uid,
                  name: userInfo.name || '이름없음',
                  position: userInfo.position || '포지션 미정',
                  requestedAt: new Date().toISOString()
              };

              transaction.update(teamRef, {
                  joinRequests: [...currentRequests, requestPayload]
              });
          });

          Alert.alert('신청 완료', '가입 신청을 보냈습니다.\n대표자가 승인하면 팀원으로 등록됩니다.', [
              { text: '확인', onPress: () => router.replace('/home') }
          ]);
      } catch (e: any) {
          Alert.alert('오류', typeof e === 'string' ? e : '가입 신청 중 문제가 발생했습니다.');
      } finally {
          setLoading(false);
      }
  };

  const sendVerificationCode = async () => {
      if (!email.includes('@')) return Alert.alert('오류', '올바른 이메일 형식이 아닙니다.');
      setTimeout(() => {
          setGeneratedCode("000000"); 
          setIsCodeSent(true); 
          Alert.alert('발송 완료', '인증코드: 000000 (테스트)');
      }, 500);
  };

  const verifyAndGoToInfo = () => {
      if(inputCode !== generatedCode) return Alert.alert('오류', '인증코드가 틀립니다.');
      setStep('INFO_FORM');
  };

  const submitTeam = async () => {
      if (!teamName || !selectedRegion) return Alert.alert('오류', '팀 이름과 지역은 필수입니다.');
      if (!auth.currentUser) return;
      
      setLoading(true);
      try {
        const userUid = auth.currentUser.uid;

        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", userUid);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) throw "회원 정보를 찾을 수 없습니다.";
            if (userSnap.data().teamId) throw "이미 소속된 팀이 있습니다.";

            const me = { 
                id: Date.now(), 
                uid: userUid, 
                name: userInfo?.name || '나', 
                position: userInfo?.position || 'L' 
            };

            const teamPayload = {
                name: teamName, 
                affiliation: targetTeam ? targetTeam.affiliation : (userInfo?.affiliation || '미인증'),
                region: selectedRegion, 
                gender: selectedGender,
                description: description || '',
                captainId: userUid, 
                leaderName: userInfo?.name || '이름없음',
                members: [userUid], 
                roster: [me],
                joinRequests: [],
                kusfId: targetTeam ? targetTeam.id : null,
                stats: targetTeam ? targetTeam.stats : { wins: 0, losses: 0, points: 0, total: 0 },
                level: 'C',
                createdAt: new Date().toISOString(),
                lastActiveAt: serverTimestamp(),
                isDeleted: false
            };

            let teamRef;

            if (isReclaiming && reclaimDocId) {
                teamRef = doc(db, "teams", reclaimDocId);
                const teamDoc = await transaction.get(teamRef);
                if (!teamDoc.exists()) throw "이어받을 팀 정보를 찾을 수 없습니다.";
                
                transaction.update(teamRef, {
                    ...teamPayload,
                    isDeleted: false,
                    deletedAt: null 
                });
            } else {
                teamRef = doc(collection(db, "teams")); 
                transaction.set(teamRef, teamPayload);
            }

            transaction.update(userRef, { 
                teamId: teamRef.id, 
                role: 'leader',
                updatedAt: new Date().toISOString()
            });
        });
        
        Alert.alert('성공', '팀 등록이 완료되었습니다!', [
            { text: '확인', onPress: () => router.replace('/home') }
        ]);

      } catch(e: any) { 
          console.error("Team Create Error:", e);
          const msg = typeof e === 'string' ? e : (e.message || '팀 등록에 실패했습니다.');
          Alert.alert('오류', msg); 
      } finally { 
          setLoading(false); 
      }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 py-3 border-b border-gray-100 flex-row items-center z-10 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
        </TouchableOpacity>
        <Text className="text-xl font-bold ml-2 text-[#191F28]">
           {step === 'SEARCH' ? '팀 찾기' : step === 'VERIFY' ? '학교 인증' : '팀 정보 입력'}
        </Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 relative"
      >
        {/* SEARCH VIEW */}
        {step === 'SEARCH' && (
            <View className="flex-1">
                <View className="px-5 pt-4">
                    <Text className="text-2xl font-bold text-[#191F28] mb-1">소속 팀을 선택하세요</Text>
                    <Text className="text-gray-500 mb-4">활동하려는 팀을 검색하거나 새로 만들어보세요.</Text>
                    
                    <View className="flex-row bg-gray-100 p-1 rounded-xl mb-4">
                        <TouchableOpacity onPress={() => setSelectedGender('male')} className={`flex-1 py-2 rounded-lg items-center ${selectedGender === 'male' ? 'bg-white shadow-sm' : ''}`}><Text className={`font-bold ${selectedGender === 'male' ? 'text-[#3182F6]' : 'text-gray-400'}`}>남자부</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelectedGender('female')} className={`flex-1 py-2 rounded-lg items-center ${selectedGender === 'female' ? 'bg-white shadow-sm' : ''}`}><Text className={`font-bold ${selectedGender === 'female' ? 'text-[#FF6B6B]' : 'text-gray-400'}`}>여자부</Text></TouchableOpacity>
                    </View>

                    <TextInput className="bg-gray-50 p-3 rounded-xl border border-gray-200 mb-4" placeholder="학교명 또는 팀 이름 검색" value={searchQuery} onChangeText={setSearchQuery} />
                </View>

                <FlatList
                    data={filteredTeams}
                    keyExtractor={i => i.id}
                    contentContainerClassName="px-5 pb-32"
                    keyboardShouldPersistTaps="handled"
                    renderItem={({item}) => {
                        const existing = registeredTeamsMap[item.id];
                        const isActive = existing && !existing.isDeleted && existing.captainId;
                        return (
                            <TouchableOpacity onPress={() => onSelectExistingTeam(item)} className={`p-4 mb-3 rounded-xl border ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'} shadow-sm`}>
                                <View className="flex-row justify-between items-center">
                                    <View>
                                        <Text className="font-bold text-lg text-[#191F28]">{item.name}</Text>
                                        <Text className="text-gray-500">{item.affiliation}</Text>
                                    </View>
                                    {isActive ? (
                                        <View className="bg-blue-100 px-2 py-1 rounded"><Text className="text-xs font-bold text-blue-600">가입신청 가능</Text></View>
                                    ) : (
                                        <Text className="text-xs text-green-600 font-bold">이어받기 가능</Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
                
                <View className="absolute bottom-0 w-full p-5 bg-white border-t border-gray-100">
                    <TouchableOpacity onPress={() => { setTargetTeam(null); setTeamName(''); setIsReclaiming(false); setStep('INFO_FORM'); }} className="bg-[#191F28] py-4 rounded-xl items-center shadow-lg">
                        <Text className="text-white font-bold text-lg">찾는 팀이 없나요? 새로운 팀 생성</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )}

        {/* VERIFY FORM */}
        {step === 'VERIFY' && targetTeam && (
            <ScrollView contentContainerClassName="p-5" keyboardShouldPersistTaps="handled">
                <Text className="text-2xl font-bold mb-2">학교 인증</Text>
                <Text className="text-gray-500 mb-6">{targetTeam.affiliation} 메일로 인증해주세요.</Text>
                <View className="flex-row mb-4">
                    <TextInput className="flex-1 bg-gray-50 p-4 rounded-xl border border-gray-200" placeholder="example@univ.ac.kr" value={email} onChangeText={setEmail} autoCapitalize="none"/>
                    <TouchableOpacity onPress={sendVerificationCode} className="bg-blue-500 justify-center px-4 ml-2 rounded-xl"><Text className="text-white font-bold">전송</Text></TouchableOpacity>
                </View>
                {isCodeSent && (
                    <>
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6" placeholder="인증코드 6자리" value={inputCode} onChangeText={setInputCode} keyboardType="number-pad"/>
                        <TouchableOpacity onPress={verifyAndGoToInfo} className="bg-[#191F28] p-4 rounded-xl items-center"><Text className="text-white font-bold text-lg">확인</Text></TouchableOpacity>
                    </>
                )}
            </ScrollView>
        )}

        {/* INFO FORM */}
        {step === 'INFO_FORM' && (
            <ScrollView contentContainerClassName="p-5" keyboardShouldPersistTaps="handled">
                <Text className="text-2xl font-bold mb-1">팀 정보 입력</Text>
                <Text className="text-gray-500 mb-6">상세 정보를 입력해주세요.</Text>

                <Text className="font-bold text-gray-500 mb-1 ml-1">팀 이름</Text>
                <TextInput className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200" placeholder="팀 이름" value={teamName} onChangeText={setTeamName} editable={!targetTeam}/>

                <Text className="font-bold text-gray-500 mb-1 ml-1">활동 지역</Text>
                <TouchableOpacity onPress={() => setShowRegionModal(true)} className="bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200"><Text>{selectedRegion || '지역 선택'}</Text></TouchableOpacity>

                <Text className="font-bold text-gray-500 mb-1 ml-1">팀 소개 (선택)</Text>
                <TextInput className="bg-gray-50 p-4 rounded-xl mb-8 border border-gray-200 h-24" multiline placeholder="팀 소개를 입력하세요." value={description} onChangeText={setDescription}/>

                <TouchableOpacity onPress={submitTeam} className="bg-blue-600 p-4 rounded-xl items-center mb-10"><Text className="text-white font-bold text-lg">완료</Text></TouchableOpacity>
            </ScrollView>
        )}

        {/* [Web Fix] Custom Modal Overlay (웹 호환성 해결) */}
        {showRegionModal && (
            <View className="absolute top-0 bottom-0 left-0 right-0 bg-black/50 justify-center items-center z-50 p-5">
                <View className="bg-white w-full max-w-sm rounded-2xl h-2/3 shadow-2xl overflow-hidden">
                    <View className="p-4 border-b border-gray-100 flex-row justify-between items-center bg-gray-50">
                        <Text className="text-lg font-bold text-gray-800">지역 선택</Text>
                        <TouchableOpacity onPress={() => setShowRegionModal(false)} className="bg-gray-200 px-3 py-1 rounded-lg">
                             <Text className="text-xs font-bold text-gray-600">닫기</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerClassName="p-2">
                        {REGIONS.map(r => (
                            <TouchableOpacity key={r} onPress={() => { setSelectedRegion(r); setShowRegionModal(false) }} className="p-4 border-b border-gray-50 items-center active:bg-blue-50 rounded-xl">
                                <Text className={`text-base font-medium ${selectedRegion === r ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>{r}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}