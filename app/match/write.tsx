import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

export default function WriteMatchScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState('6man');
  const [gender, setGender] = useState('mixed');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  const [date, setDate] = useState(new Date());
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

  const onChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || date;
    setDate(currentDate);
    if (Platform.OS === 'android') {
      setShowPickerModal(false);
    }
  };

  const openPicker = (mode: 'date' | 'time') => {
    setPickerMode(mode);
    setShowPickerModal(true);
  };

  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const formatTime = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

  const handleSubmit = async () => {
    if (!place) {
      Alert.alert('알림', '장소를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return Alert.alert('오류', '로그인이 필요합니다.');

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      
      if (!userData?.teamId) {
        Alert.alert('오류', '팀 소속이 아닙니다.');
        router.replace('/team/register');
        return;
      }

      const teamDoc = await getDoc(doc(db, "teams", userData.teamId));
      const teamData = teamDoc.data();

      const finalTimeStr = `${formatDate(date)} ${formatTime(date)}`;

      await addDoc(collection(db, "matches"), {
        hostId: userData.teamId,
        team: teamData?.name || 'Unknown Team',
        affiliation: teamData?.affiliation || '',
        type,
        gender,
        time: finalTimeStr,
        timestamp: date.toISOString(),
        loc: place,
        note: note || '특이사항 없음',
        status: 'recruiting',
        createdAt: new Date().toISOString(),
        applicants: [],
        level: teamData?.level || 'B'
      });

      Alert.alert('등록 완료', '매칭 공고가 등록되었습니다!', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      Alert.alert('실패', '등록 중 오류가 발생했습니다.');
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
        <View style={tw`px-6 py-4 border-b border-slate-100 flex-row justify-between items-center bg-white`}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={tw`text-slate-500 text-lg`}>취소</Text>
          </TouchableOpacity>
          <Text style={tw`text-lg font-bold text-slate-800`}>매치 메이킹</Text>
          <TouchableOpacity onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#4f46e5" /> : <Text style={tw`text-indigo-600 font-bold text-lg`}>완료</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={tw`p-6 pb-20`}>
          <View style={tw`mb-8`}>
            <Text style={tw`text-xs font-bold text-slate-400 mb-3 ml-1`}>TYPE</Text>
            <View style={tw`flex-row gap-3`}>
              {['6man', '9man'].map((t) => (
                <TouchableOpacity key={t} onPress={() => setType(t)} style={tw`flex-1 py-4 rounded-2xl border items-center ${type === t ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}>
                  <Text style={tw`font-bold ${type === t ? 'text-white' : 'text-slate-400'}`}>{t === '6man' ? '6인제' : '9인제'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={tw`mb-8`}>
            <Text style={tw`text-xs font-bold text-slate-400 mb-3 ml-1`}>GENDER</Text>
            <View style={tw`flex-row gap-3`}>
              {['male', 'female', 'mixed'].map((g) => (
                <TouchableOpacity key={g} onPress={() => setGender(g)} style={tw`flex-1 py-4 rounded-2xl border items-center ${gender === g ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}>
                  <Text style={tw`font-bold ${gender === g ? 'text-white' : 'text-slate-400'}`}>{g === 'male' ? '남자' : g === 'female' ? '여자' : '혼성'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={tw`mb-6`}>
              <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>DATE & TIME</Text>
              <View style={tw`flex-row gap-3`}>
                  <TouchableOpacity onPress={() => openPicker('date')} style={tw`flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100`}>
                      <Text style={tw`text-slate-500 text-xs mb-1`}>날짜</Text>
                      <Text style={tw`text-slate-800 font-bold text-lg`}>{formatDate(date)}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => openPicker('time')} style={tw`flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100`}>
                      <Text style={tw`text-slate-500 text-xs mb-1`}>시간</Text>
                      <Text style={tw`text-slate-800 font-bold text-lg`}>{formatTime(date)}</Text>
                  </TouchableOpacity>
              </View>
          </View>

          <View style={tw`mb-6 gap-5`}>
              <View>
                  <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>LOCATION</Text>
                  <TextInput style={tw`w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base`} value={place} onChangeText={setPlace} placeholder="장소 (예: 한신대 체육관)" />
              </View>
              <View>
                  <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>NOTE</Text>
                  <TextInput style={tw`w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base h-24`} multiline textAlignVertical="top" value={note} onChangeText={setNote} placeholder="비고" />
              </View>
          </View>
        </ScrollView>

        {showPickerModal && (
          <Modal transparent={true} animationType="fade" visible={showPickerModal}>
            <View style={tw`flex-1 justify-end bg-black/50`}>
              <View style={tw`bg-white p-5 rounded-t-3xl`}>
                <View style={tw`flex-row justify-between items-center mb-4 border-b border-slate-100 pb-2`}>
                  <Text style={tw`text-lg font-bold text-slate-800`}>
                    {pickerMode === 'date' ? '날짜 선택' : '시간 선택'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPickerModal(false)}>
                    <Text style={tw`text-indigo-600 font-bold text-lg`}>닫기</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={tw`items-center bg-slate-50 rounded-2xl py-2`}>
                  <DateTimePicker
                    value={date}
                    mode={pickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={onChange}
                    textColor="black"
                  />
                </View>

                <TouchableOpacity 
                  onPress={() => setShowPickerModal(false)} 
                  style={tw`mt-4 bg-indigo-600 py-4 rounded-xl items-center shadow-lg`}
                >
                  <Text style={tw`text-white font-bold text-lg`}>선택 완료</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}