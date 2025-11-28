import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, runTransaction, collection } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import tw from 'twrnc';
import { KUSF_TEAMS } from '../home/ranking'; // ranking.tsx에서 데이터 import

const LEVELS = [
  { id: 'S', label: 'S급', desc: '선수 출신 다수 / 최상위 실력' },
  { id: 'A', label: 'A급', desc: '대회 입상권 / 탄탄한 조직력' },
  { id: 'B', label: 'B급', desc: '일반 동호회 / 기본기 갖춤' },
  { id: 'C', label: 'C급', desc: '초심자 위주 / 즐겜 모드' },
];

export default function TeamRegisterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [level, setLevel] = useState('B');

  const filteredTeams = KUSF_TEAMS.filter(t => t.name.includes(searchText) || t.affiliation.includes(searchText));

  const handleSelectTeam = (team: any) => {
      setSelectedTeam(team);
      setName(team.name);
      setAffiliation(team.affiliation);
      setModalVisible(false);
  };

  const handleRegister = async () => {
    if (!name || !affiliation || !captainName) {
      Alert.alert('알림', '팀 이름, 소속, 주장 닉네임을 모두 입력해주세요.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert('오류', '로그인 정보가 없습니다.');
      router.replace('/auth/login');
      return;
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const newTeamRef = doc(collection(db, "teams"));
        const userRef = doc(db, "users", user.uid);

        // KUSF 팀 선택 시 기존 승점 가져오기, 아니면 0
        const initialStats = selectedTeam ? selectedTeam.stats : { wins: 0, losses: 0, points: 0, total: 0 };

        transaction.set(newTeamRef, {
          name: name,
          affiliation: affiliation,
          captainId: user.uid,
          level: level,
          createdAt: new Date().toISOString(),
          stats: initialStats,
          kusfId: selectedTeam ? selectedTeam.id : null, // KUSF 연동 ID 저장
        });

        transaction.set(userRef, {
            teamId: newTeamRef.id,
            role: 'Captain',
            nickname: captainName,
        }, { merge: true });
      });

      Alert.alert('등록 완료', `${name} 팀의 대표자가 되셨습니다!`, [
        { text: '홈으로 이동', onPress: () => router.replace('/home') }
      ]);
      
    } catch (error: any) {
      Alert.alert('등록 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={tw`flex-1`}>
        <ScrollView contentContainerStyle={tw`flex-grow justify-center p-6 pb-20`} keyboardShouldPersistTaps="handled">
          <View style={tw`mb-8`}>
            <Text style={tw`text-[#3182F6] font-bold text-lg mb-1`}>STEP 01</Text>
            <Text style={tw`text-3xl font-bold text-[#191F28]`}>팀 프로필 등록</Text>
            <Text style={tw`text-[#8B95A1] mt-2`}>2025 KUSF 클럽 챔피언십 팀이라면,{'\n'}검색해서 간편하게 시작하세요.</Text>
          </View>

          <TouchableOpacity onPress={() => setModalVisible(true)} style={tw`bg-[#F2F4F6] p-4 rounded-xl flex-row justify-between items-center mb-6 border border-[#E5E8EB]`}>
              <View>
                  <Text style={tw`text-xs font-bold text-[#3182F6] mb-1`}>추천</Text>
                  <Text style={tw`text-[#191F28] font-bold`}>{selectedTeam ? '다시 검색하기' : '우리 팀 검색하기 (KUSF 데이터)'}</Text>
              </View>
              <FontAwesome5 name="search" size={16} color="#3182F6" />
          </TouchableOpacity>

          <View style={tw`gap-5`}>
            <View>
              <Text style={tw`text-[#4E5968] font-bold mb-2`}>팀 이름</Text>
              <TextInput style={tw`w-full bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E8EB] text-base ${selectedTeam ? 'bg-blue-50/50 text-[#3182F6] font-bold' : ''}`} placeholder="예: 파이프 배구단" value={name} onChangeText={setName} editable={!selectedTeam} />
            </View>
            <View>
              <Text style={tw`text-[#4E5968] font-bold mb-2`}>소속 (학교/지역/클럽)</Text>
              <TextInput style={tw`w-full bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E8EB] text-base ${selectedTeam ? 'bg-blue-50/50 text-[#3182F6] font-bold' : ''}`} placeholder="예: 한국대 or 강남구 동호회" value={affiliation} onChangeText={setAffiliation} editable={!selectedTeam} />
            </View>
            <View>
              <Text style={tw`text-[#4E5968] font-bold mb-2`}>주장 닉네임 (본인)</Text>
              <TextInput style={tw`w-full bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E8EB] text-base`} placeholder="본명 또는 닉네임" value={captainName} onChangeText={setCaptainName} />
            </View>
            <View>
              <Text style={tw`text-[#4E5968] font-bold mb-3`}>팀 실력 (예상)</Text>
              <View style={tw`gap-3`}>
                {LEVELS.map((item) => (
                  <TouchableOpacity key={item.id} onPress={() => setLevel(item.id)} style={tw`p-4 rounded-xl border-2 flex-row justify-between items-center ${level === item.id ? 'border-[#3182F6] bg-[#E8F3FF]' : 'border-[#E5E8EB] bg-white'}`}>
                    <View><Text style={tw`font-bold text-lg ${level === item.id ? 'text-[#3182F6]' : 'text-[#333D4B]'}`}>{item.label}</Text><Text style={tw`text-xs text-[#8B95A1] mt-1`}>{item.desc}</Text></View>
                    {level === item.id && <View style={tw`w-6 h-6 rounded-full bg-[#3182F6] items-center justify-center`}><FontAwesome5 name="check" size={12} color="white" /></View>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity onPress={handleRegister} disabled={loading} style={tw`w-full bg-[#333D4B] p-4 rounded-xl mt-6 items-center shadow-lg ${loading ? 'opacity-70' : ''}`}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>등록 완료</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
          <View style={tw`flex-1 bg-white p-6 pt-10`}>
              <View style={tw`flex-row justify-between items-center mb-4`}>
                  <Text style={tw`text-2xl font-extrabold text-[#191F28]`}>팀 찾기</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)} style={tw`bg-gray-100 p-2 rounded-full`}><FontAwesome5 name="times" size={20} color="#64748b" /></TouchableOpacity>
              </View>
              <TextInput style={tw`bg-[#F2F4F6] p-4 rounded-xl mb-4 text-base`} placeholder="팀 이름 또는 학교명을 입력하세요" value={searchText} onChangeText={setSearchText} autoFocus />
              <FlatList 
                  data={filteredTeams}
                  keyExtractor={item => item.id}
                  renderItem={({item}) => (
                      <TouchableOpacity onPress={() => handleSelectTeam(item)} style={tw`p-4 border-b border-gray-100 flex-row justify-between items-center`}>
                          <View><Text style={tw`font-bold text-lg text-[#191F28]`}>{item.name}</Text><Text style={tw`text-sm text-[#8B95A1]`}>{item.affiliation}</Text></View>
                          <View style={tw`items-end`}><Text style={tw`text-[#3182F6] font-bold`}>{item.stats.points}점</Text><Text style={tw`text-xs text-[#8B95A1]`}>{item.stats.wins}승 {item.stats.losses}패</Text></View>
                      </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={tw`text-center text-[#8B95A1] mt-10`}>검색 결과가 없습니다.{'\n'}직접 입력하여 등록해주세요.</Text>}
              />
          </View>
      </Modal>
    </SafeAreaView>
  );
}