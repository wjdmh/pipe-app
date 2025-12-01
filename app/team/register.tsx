import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, FlatList, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../configs/firebaseConfig';
import tw from 'twrnc';
import { KUSF_TEAMS } from '../home/ranking';

const REGIONS = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"];

type Step = 'SEARCH' | 'VERIFY' | 'INFO_FORM';
const MASTER_CODE = "000000";

export default function TeamRegister() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('SEARCH');
  const [loading, setLoading] = useState(false);
  
  const [userInfo, setUserInfo] = useState<any>(null);
  
  // [Fix] 기존에는 ID 문자열 배열이었으나, 상태 확인을 위해 전체 객체 매핑 저장
  const [registeredTeamsMap, setRegisteredTeamsMap] = useState<{[key: string]: any}>({});

  // Search Step State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');
  const [targetTeam, setTargetTeam] = useState<any>(null);
  
  // [New] 팀 복구(이어받기) 모드 플래그
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [reclaimDocId, setReclaimDocId] = useState<string | null>(null);

  // Verify Step State
  const [email, setEmail] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  // Info Form Step State
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [career, setCareer] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [showRegionModal, setShowRegionModal] = useState(false);

  useEffect(() => {
    fetchUserInfo();
    fetchRegisteredTeams();
  }, []);

  const fetchUserInfo = async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) setUserInfo(userDoc.data());
    } catch (e) { console.log('User Info Fetch Error', e); }
  };

  const fetchRegisteredTeams = async () => {
      try {
          const q = query(collection(db, "teams"));
          const snapshot = await getDocs(q);
          const map: {[key: string]: any} = {};
          snapshot.forEach(doc => {
              const data = doc.data();
              if (data.kusfId) {
                  // 해당 KUSF ID에 대한 최신/활성 상태 저장
                  map[data.kusfId] = { ...data, docId: doc.id };
              }
          });
          setRegisteredTeamsMap(map);
      } catch (e) { console.error("팀 목록 로드 실패", e); }
  };

  const filteredTeams = KUSF_TEAMS.filter(team => {
    const isGenderMatch = team.gender === selectedGender;
    const isNameMatch = team.name.includes(searchQuery) || team.affiliation.includes(searchQuery);
    return isGenderMatch && (searchQuery === '' ? true : isNameMatch);
  });

  const onSelectExistingTeam = async (kusfTeam: any) => {
    const existingData = registeredTeamsMap[kusfTeam.id];

    // [Fix] 이미 등록된 팀 처리 로직 개선
    if (existingData) {
        // 1. 이미 등록되어 있고, 활성 상태(isDeleted가 아니고, captainId가 존재)인 경우 -> 가입 불가
        if (!existingData.isDeleted && existingData.captainId) {
            Alert.alert('알림', '이미 활동 중인 팀입니다.');
            return;
        }
        
        // 2. 등록은 되어 있으나, 삭제되었거나(Soft Delete) 대표자가 없는 경우 -> 이어받기 제안
        Alert.alert('팀 이어받기', '이전에 등록되었으나 현재 활동하지 않는 팀입니다.\n이 팀의 대표자가 되어 기록을 이어받으시겠습니까?', [
            { text: '취소', style: 'cancel' },
            { 
                text: '이어받기', 
                onPress: () => {
                    setTargetTeam(kusfTeam);
                    setTeamName(kusfTeam.name);
                    setIsReclaiming(true);
                    setReclaimDocId(existingData.docId);
                    
                    // 기존 데이터가 있다면 불러와서 세팅 (선택사항)
                    if (existingData.region) setSelectedRegion(existingData.region);
                    if (existingData.description) setDescription(existingData.description);
                    
                    setStep('VERIFY');
                }
            }
        ]);
        return;
    }

    // 신규 등록
    setIsReclaiming(false);
    setReclaimDocId(null);
    setTargetTeam(kusfTeam);
    setTeamName(kusfTeam.name);
    setStep('VERIFY');
  };

  const onCreateNewTeam = () => {
    setTargetTeam(null);
    setTeamName('');
    setIsReclaiming(false);
    setStep('INFO_FORM');
  };
  
  const sendVerificationCode = async () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(ac\.kr|edu)$/;
    if (!emailRegex.test(email)) {
      Alert.alert('인증 실패', '유효한 학교 이메일(.ac.kr / .edu)을 입력해주세요.');
      return;
    }
    setEmailSending(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500)); 
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(code);
      setIsCodeSent(true);
      console.log(`[AUTH CODE]: ${code}`);
      Alert.alert('메일 발송', `${email}로 인증코드를 보냈습니다.\n(테스트: 000000)`);
    } catch (e) { Alert.alert('오류', '전송 실패'); } finally { setEmailSending(false); }
  };

  const verifyAndGoToInfo = () => {
    if (inputCode !== generatedCode && inputCode !== MASTER_CODE) {
      Alert.alert('오류', '인증번호가 일치하지 않습니다.');
      return;
    }
    Alert.alert('인증 성공', '학교 인증이 완료되었습니다.\n팀 상세 정보를 입력해주세요.');
    setStep('INFO_FORM');
  };

  const submitTeam = async () => {
    if (!teamName || !selectedRegion) {
      Alert.alert('알림', '팀 이름과 활동 지역은 필수입니다.');
      return;
    }

    const teamData = {
      name: teamName,
      affiliation: targetTeam ? targetTeam.affiliation : (userInfo?.affiliation || '미인증'),
      region: selectedRegion,
      gender: selectedGender,
      description: description || '아직 등록된 팀 소개가 없습니다.',
      career: career || '아직 등록된 수상 경력이 없습니다.',
      kusfId: targetTeam ? targetTeam.id : null,
      initialStats: targetTeam ? targetTeam.stats : { wins: 0, losses: 0, points: 0, total: 0 },
      verifiedEmail: targetTeam ? email : null,
    };

    await createTeamDoc(teamData);
  };

  const createTeamDoc = async (data: any) => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      let teamDocId = '';

      if (isReclaiming && reclaimDocId) {
          // [Fix] 기존 팀 이어받기 (Update)
          // 삭제 플래그 해제 및 새로운 리더 정보 덮어쓰기
          await updateDoc(doc(db, 'teams', reclaimDocId), {
              ...data,
              leaderId: auth.currentUser.uid,
              captainId: auth.currentUser.uid, // 호환성 위해 둘 다 저장
              leaderName: userInfo?.name || auth.currentUser.displayName || '이름없음',
              leaderPhone: userInfo?.phone || '',
              isDeleted: false,
              deletedAt: null
          });
          teamDocId = reclaimDocId;
      } else {
          // [Fix] 신규 팀 생성 (Create)
          const docRef = await addDoc(collection(db, 'teams'), {
            ...data,
            leaderId: auth.currentUser.uid,
            captainId: auth.currentUser.uid,
            leaderName: userInfo?.name || auth.currentUser.displayName || '이름없음',
            leaderPhone: userInfo?.phone || '',
            members: [auth.currentUser.uid],
            createdAt: serverTimestamp(),
            stats: data.initialStats,
            isDeleted: false
          });
          teamDocId = docRef.id;
      }

      // 유저 정보 업데이트
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
          teamId: teamDocId,
          role: 'leader'
      }, { merge: true });

      Alert.alert('성공', isReclaiming ? '팀을 성공적으로 이어받았습니다!' : '팀 등록이 완료되었습니다!');
      router.replace('/home');
    } catch (error: any) {
      Alert.alert('오류', `팀 생성 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`px-5 py-3 border-b border-gray-100 flex-row items-center`}>
        <TouchableOpacity onPress={() => {
            if (step === 'VERIFY') setStep('SEARCH');
            else if (step === 'INFO_FORM') setStep('SEARCH');
            else router.back();
        }} style={tw`p-2 -ml-2`}>
          <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
        </TouchableOpacity>
        <Text style={tw`text-xl font-bold ml-2 text-[#191F28]`}>
           {step === 'SEARCH' ? '팀 찾기' : step === 'VERIFY' ? '학교 인증' : '팀 정보 입력'}
        </Text>
      </View>

      <View style={tw`flex-1`}>
        {step === 'SEARCH' && (
          <View style={tw`flex-1`}>
            <View style={tw`px-5 pt-4 pb-2 bg-white`}>
               <Text style={tw`text-2xl font-bold text-[#191F28] mb-1`}>소속 팀을 선택하세요</Text>
               <Text style={tw`text-gray-500 mb-4`}>KUSF 리그에 참여 중인 팀이라면 선택해주세요.</Text>

               <View style={tw`flex-row bg-gray-100 p-1 rounded-xl mb-4`}>
                 <TouchableOpacity onPress={() => setSelectedGender('male')} style={tw`flex-1 py-2 rounded-lg items-center ${selectedGender === 'male' ? 'bg-white shadow-sm' : ''}`}>
                   <Text style={tw`font-bold ${selectedGender === 'male' ? 'text-[#3182F6]' : 'text-gray-400'}`}>남자부</Text>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => setSelectedGender('female')} style={tw`flex-1 py-2 rounded-lg items-center ${selectedGender === 'female' ? 'bg-white shadow-sm' : ''}`}>
                   <Text style={tw`font-bold ${selectedGender === 'female' ? 'text-[#FF6B6B]' : 'text-gray-400'}`}>여자부</Text>
                 </TouchableOpacity>
               </View>

               <View style={tw`flex-row items-center bg-gray-50 px-4 rounded-xl border border-gray-200 mb-2`}>
                  <FontAwesome5 name="search" size={14} color="#8B95A1" />
                  <TextInput style={tw`flex-1 p-3 text-base`} placeholder="학교명 또는 팀 이름 검색" value={searchQuery} onChangeText={setSearchQuery} />
               </View>
            </View>

            <FlatList
              data={filteredTeams}
              keyExtractor={item => item.id}
              contentContainerStyle={tw`px-5 pb-32`}
              renderItem={({item}) => {
                const existingData = registeredTeamsMap[item.id];
                // [Logic] 이미 등록되었는데 활성 상태인 경우만 비활성화 (삭제된 팀은 선택 가능)
                const isRegisteredActive = existingData && !existingData.isDeleted && existingData.captainId;
                
                return (
                    <TouchableOpacity 
                      onPress={() => onSelectExistingTeam(item)}
                      disabled={!!isRegisteredActive}
                      style={tw`flex-row items-center p-4 mb-3 bg-white border ${isRegisteredActive ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-100'} rounded-2xl shadow-sm`}
                    >
                       <View style={tw`w-10 h-10 rounded-full bg-gray-50 items-center justify-center mr-3`}>
                         <FontAwesome5 name={selectedGender === 'male' ? 'mars' : 'venus'} size={16} color={selectedGender === 'male' ? '#3182F6' : '#FF6B6B'} />
                       </View>
                       <View style={tw`flex-1`}>
                         <Text style={tw`font-bold text-[#191F28]`}>{item.name}</Text>
                         <Text style={tw`text-gray-500 text-xs`}>{item.affiliation}</Text>
                       </View>
                       <View style={tw`items-end`}>
                          {isRegisteredActive ? (
                              <Text style={tw`text-[10px] font-bold text-red-500`}>등록됨</Text>
                          ) : (
                              existingData ? (
                                <Text style={tw`text-[10px] font-bold text-green-600`}>이어받기</Text>
                              ) : (
                                <>
                                  <Text style={tw`font-bold text-[#191F28]`}>{item.stats.points}점</Text>
                                  <Text style={tw`text-[10px] text-blue-500`}>선택</Text>
                                </>
                              )
                          )}
                       </View>
                    </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<View style={tw`py-10 items-center`}><Text style={tw`text-gray-400 mb-1`}>검색 결과가 없습니다.</Text></View>}
            />

            <View style={tw`absolute bottom-0 w-full p-5 bg-white border-t border-gray-100 shadow-lg`}>
                <TouchableOpacity onPress={onCreateNewTeam} style={tw`w-full py-4 rounded-xl bg-[#191F28] items-center`}>
                  <Text style={tw`text-white font-bold text-lg`}>찾는 팀이 없나요? 새로운 팀 생성</Text>
                </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'VERIFY' && targetTeam && (
          <ScrollView contentContainerStyle={tw`p-5`}>
            <Text style={tw`text-2xl font-bold text-[#191F28] mb-2`}>학교 인증</Text>
            <Text style={tw`text-gray-500 mb-6`}>
              <Text style={tw`font-bold text-[#3182F6]`}>{targetTeam.affiliation}</Text> 소속 인증을 위해 이메일을 입력해주세요.
            </Text>
            <View style={tw`flex-row mb-4`}>
              <TextInput style={tw`flex-1 bg-gray-50 p-4 rounded-xl border border-gray-200 font-medium`} placeholder="example@univ.ac.kr" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!isCodeSent} />
              <TouchableOpacity style={tw`justify-center px-5 ml-2 rounded-xl ${isCodeSent ? 'bg-gray-400' : 'bg-[#3182F6]'}`} onPress={sendVerificationCode} disabled={isCodeSent || emailSending}>
                 {emailSending ? <ActivityIndicator color="white"/> : <Text style={tw`text-white font-bold`}>{isCodeSent ? '전송됨' : '전송'}</Text>}
              </TouchableOpacity>
            </View>
            {isCodeSent && (
              <>
                <TextInput style={tw`bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 font-medium`} placeholder="인증코드 6자리" keyboardType="number-pad" value={inputCode} onChangeText={setInputCode} />
                <TouchableOpacity onPress={verifyAndGoToInfo} style={tw`bg-[#333] py-4 rounded-xl items-center`}><Text style={tw`text-white font-bold text-lg`}>인증 확인 및 다음</Text></TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}

        {step === 'INFO_FORM' && (
          <ScrollView contentContainerStyle={tw`p-5`}>
            <Text style={tw`text-2xl font-bold text-[#191F28] mb-1`}>팀 상세 정보</Text>
            <Text style={tw`text-gray-500 mb-6`}>다른 팀에게 보여질 정보를 입력해주세요.</Text>

            <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>팀 이름</Text>
            <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200`} placeholder="팀 이름" value={teamName} onChangeText={setTeamName} editable={!targetTeam} />

            <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>활동 지역</Text>
            <TouchableOpacity onPress={() => setShowRegionModal(true)} style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 flex-row justify-between`}>
               <Text style={tw`${selectedRegion ? 'text-[#191F28]' : 'text-gray-400'}`}>{selectedRegion || '지역 선택'}</Text>
               <FontAwesome5 name="chevron-down" size={14} color="#aaa"/>
            </TouchableOpacity>

            <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>수상 경력 (선택)</Text>
            <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 h-24`} multiline placeholder={`예) 2024 KUSF 4강\n2023 교내리그 우승`} value={career} onChangeText={setCareer} />
            <Text style={tw`text-xs text-gray-400 mb-4 ml-1`}>* 입력하지 않으면 '정보 없음'으로 표시됩니다.</Text>

            <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>간단한 팀 소개 (선택)</Text>
            <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-8 border border-gray-200 h-24`} multiline placeholder="우리 팀의 특징이나 목표를 자유롭게 적어주세요." value={description} onChangeText={setDescription} />

            <TouchableOpacity onPress={submitTeam} style={tw`bg-[#3182F6] py-4 rounded-xl items-center mb-10`}>
              {loading ? <ActivityIndicator color="white"/> : <Text style={tw`text-white font-bold text-lg`}>{isReclaiming ? '팀 이어받기 완료' : '팀 등록 완료'}</Text>}
            </TouchableOpacity>

            <Modal visible={showRegionModal} transparent animationType="fade">
                <View style={tw`flex-1 bg-black/50 justify-center p-5`}>
                    <View style={tw`bg-white rounded-2xl max-h-[70%]`}>
                        <ScrollView>{REGIONS.map(r => (
                            <TouchableOpacity key={r} onPress={() => {setSelectedRegion(r); setShowRegionModal(false);}} style={tw`p-4 border-b border-gray-100`}>
                                <Text style={tw`text-center`}>{r}</Text>
                            </TouchableOpacity>
                        ))}</ScrollView>
                        <TouchableOpacity onPress={() => setShowRegionModal(false)} style={tw`p-4 bg-gray-100 rounded-b-2xl`}><Text style={tw`text-center font-bold`}>닫기</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}