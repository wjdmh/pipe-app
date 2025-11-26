import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import tw from 'twrnc';

export default function EditMatchScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // URL에서 수정할 글 ID 가져오기
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 입력 상태
  const [type, setType] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  // 1. 기존 데이터 불러오기
  useEffect(() => {
    const loadData = async () => {
      if (typeof id !== 'string') return;
      try {
        const docSnap = await getDoc(doc(db, "matches", id));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setType(data.type);
          setGender(data.gender);
          setPlace(data.loc);
          setNote(data.note);
          
          // "11/25 18:00" 형태를 날짜와 시간으로 쪼개기
          const timeStr = data.time || '';
          const [d, t] = timeStr.split(' ');
          setDate(d || '');
          setTime(t || '');
        } else {
          Alert.alert('오류', '존재하지 않는 게시물입니다.');
          router.back();
        }
      } catch (e) {
        Alert.alert('오류', '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  // 2. 수정 사항 저장하기
  const handleUpdate = async () => {
    if (!date || !time || !place) return Alert.alert('알림', '필수 정보를 입력해주세요.');
    if (typeof id !== 'string') return;

    setSubmitting(true);
    try {
      await updateDoc(doc(db, "matches", id), {
        type,
        gender,
        time: `${date} ${time}`,
        loc: place,
        note,
        // status는 건드리지 않음 (모집중 상태 유지)
      });

      Alert.alert('수정 완료', '공고가 수정되었습니다.', [
        { text: '확인', onPress: () => router.back() } // 상세 화면으로 복귀
      ]);
    } catch (e) {
      Alert.alert('실패', '수정 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  return (
    <View style={tw`flex-1 bg-white`}>
      <View style={tw`px-6 pt-14 pb-4 border-b border-slate-100 flex-row justify-between items-center bg-white`}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={tw`text-slate-500 text-lg`}>취소</Text>
        </TouchableOpacity>
        <Text style={tw`text-lg font-bold text-slate-800`}>공고 수정</Text>
        <TouchableOpacity onPress={handleUpdate} disabled={submitting}>
           <Text style={tw`text-indigo-600 font-bold text-lg`}>저장</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={tw`p-6 pb-20`}>
        {/* 타입 선택 */}
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

        {/* 성별 선택 */}
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

        {/* 정보 입력 */}
        <View style={tw`mb-6 gap-5`}>
            <View>
                <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>DATE & TIME</Text>
                <View style={tw`flex-row gap-3`}>
                    <TextInput style={tw`flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base`} value={date} onChangeText={setDate} placeholder="날짜" />
                    <TextInput style={tw`flex-1 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base`} value={time} onChangeText={setTime} placeholder="시간" />
                </View>
            </View>
            <View>
                <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>LOCATION</Text>
                <TextInput style={tw`w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base`} value={place} onChangeText={setPlace} placeholder="장소" />
            </View>
            <View>
                <Text style={tw`text-xs font-bold text-slate-400 mb-2 ml-1`}>NOTE</Text>
                <TextInput style={tw`w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base h-24`} multiline textAlignVertical="top" value={note} onChangeText={setNote} placeholder="비고" />
            </View>
        </View>
      </ScrollView>
    </View>
  );
}