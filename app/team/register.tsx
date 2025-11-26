import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, runTransaction, collection } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

const LEVELS = [
  { id: 'S', label: 'S급', desc: '선수 출신 다수 / 최상위 실력' },
  { id: 'A', label: 'A급', desc: '대회 입상권 / 탄탄한 조직력' },
  { id: 'B', label: 'B급', desc: '일반 동호회 / 기본기 갖춤' },
  { id: 'C', label: 'C급', desc: '초심자 위주 / 즐겜 모드' },
];

export default function TeamRegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [level, setLevel] = useState('B');
  const [loading, setLoading] = useState(false);

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

        transaction.set(newTeamRef, {
          name: name,
          affiliation: affiliation,
          captainId: user.uid,
          level: level,
          createdAt: new Date().toISOString(),
          stats: { wins: 0, losses: 0, points: 0, total: 0 }
        });

        transaction.set(userRef, {
            teamId: newTeamRef.id,
            role: 'Captain',
            nickname: captainName,
        }, { merge: true });
      });

      Alert.alert('등록 완료', '팀이 성공적으로 창단되었습니다!', [
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
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
      >
        <ScrollView 
          contentContainerStyle={tw`flex-grow justify-center p-6 pb-20`}
          keyboardShouldPersistTaps="handled"
        >
          <View style={tw`mb-8`}>
            <Text style={tw`text-indigo-600 font-bold text-lg mb-1`}>STEP 01</Text>
            <Text style={tw`text-3xl font-bold text-slate-800`}>팀 프로필 등록</Text>
            <Text style={tw`text-slate-500 mt-2`}>
              우리 팀을 대표할 정보를 입력해주세요.
            </Text>
          </View>

          <View style={tw`gap-5`}>
            <View>
              <Text style={tw`text-slate-600 font-bold mb-2`}>팀 이름</Text>
              <TextInput
                style={tw`w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-base`}
                placeholder="예: 파이프 배구단"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View>
              <Text style={tw`text-slate-600 font-bold mb-2`}>소속 (학교/지역/클럽)</Text>
              <TextInput
                style={tw`w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-base`}
                placeholder="예: 한국대 or 강남구 동호회"
                value={affiliation}
                onChangeText={setAffiliation}
              />
            </View>

            <View>
              <Text style={tw`text-slate-600 font-bold mb-2`}>주장 닉네임</Text>
              <TextInput
                style={tw`w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-base`}
                placeholder="본명 또는 닉네임"
                value={captainName}
                onChangeText={setCaptainName}
              />
            </View>

            <View>
              <Text style={tw`text-slate-600 font-bold mb-3`}>팀 실력 (예상)</Text>
              <View style={tw`gap-3`}>
                {LEVELS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setLevel(item.id)}
                    style={tw`p-4 rounded-xl border-2 flex-row justify-between items-center ${
                      level === item.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <View>
                      <Text style={tw`font-bold text-lg ${level === item.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {item.label}
                      </Text>
                      <Text style={tw`text-xs text-slate-400 mt-1`}>{item.desc}</Text>
                    </View>
                    {level === item.id && (
                      <View style={tw`w-6 h-6 rounded-full bg-indigo-600 items-center justify-center`}>
                        <Text style={tw`text-white font-bold text-xs`}>V</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              style={tw`w-full bg-slate-900 p-4 rounded-xl mt-6 items-center shadow-lg ${loading ? 'opacity-70' : ''}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={tw`text-white font-bold text-lg`}>등록 완료</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}