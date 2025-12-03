import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { useGuest } from '../../hooks/useGuest';
import tw from 'twrnc';

const POSITIONS = ['L', 'R', 'C', 'S', 'Li'];

export default function GuestWriteScreen() {
  const router = useRouter();
  const { createPost } = useGuest();
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [location, setLocation] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [gender, setGender] = useState<'male'|'female'|'mixed'>('mixed');
  
  // [Improved Fee UI] 회비 입력 개선
  const [fee, setFee] = useState('');
  const [isFree, setIsFree] = useState(false);

  const [description, setDescription] = useState('');

  const togglePosition = (pos: string) => {
    if (positions.includes(pos)) setPositions(positions.filter(p => p !== pos));
    else setPositions([...positions, pos]);
  };

  const handleFeeChange = (text: string) => {
      // 숫자만 입력 가능하도록 필터링
      const numericValue = text.replace(/[^0-9]/g, '');
      setFee(numericValue);
      setIsFree(false);
  };

  const toggleFree = () => {
      if (!isFree) {
          setFee('');
          setIsFree(true);
      } else {
          setIsFree(false);
      }
  };

  const handleSubmit = async () => {
    if (!location || positions.length === 0 || (!isFree && !fee)) return Alert.alert('알림', '필수 정보를 입력해주세요.');
    
    setLoading(true);
    try {
      // 내 팀 정보 가져오기
      let teamId = 'individual';
      let teamName = '개인 모집';

      if (auth.currentUser) {
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.teamId) {
                teamId = uData.teamId;
                const teamSnap = await getDoc(doc(db, "teams", teamId));
                if (teamSnap.exists()) teamName = teamSnap.data().name;
            } else if (uData.name) {
                teamName = `${uData.name} (개인)`;
            }
        }
      }

      const success = await createPost({
        hostTeamId: teamId,
        hostTeamName: teamName,
        hostCaptainId: auth.currentUser!.uid,
        matchDate: date.toISOString(),
        location,
        positions,
        gender,
        fee: isFree ? '0' : fee, // 무료면 '0', 아니면 입력된 숫자 문자열
        description
      });

      if (success) {
        Alert.alert('등록 완료', '용병 모집글이 등록되었습니다.');
        router.back();
      }
    } catch (e) {
      Alert.alert('오류', '등록 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`px-5 py-4 border-b border-gray-100 flex-row items-center`}>
        <TouchableOpacity onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={20} color="#191F28" /></TouchableOpacity>
        <Text style={tw`text-lg font-bold ml-4 text-gray-900`}>용병 모집하기</Text>
      </View>

      <ScrollView contentContainerStyle={tw`p-6 pb-20`}>
        <Text style={tw`font-bold text-gray-500 mb-2`}>필요 포지션</Text>
        <View style={tw`flex-row flex-wrap gap-2 mb-6`}>
          {POSITIONS.map(pos => (
            <TouchableOpacity 
              key={pos}
              onPress={() => togglePosition(pos)}
              style={tw`px-4 py-2 rounded-lg border ${positions.includes(pos) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
            >
              <Text style={tw`font-bold ${positions.includes(pos) ? 'text-white' : 'text-gray-500'}`}>{pos}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={tw`font-bold text-gray-500 mb-2`}>성별</Text>
        <View style={tw`flex-row gap-2 mb-6`}>
          {['male', 'female', 'mixed'].map((g: any) => (
            <TouchableOpacity 
              key={g}
              onPress={() => setGender(g)}
              style={tw`flex-1 py-3 rounded-xl border items-center ${gender === g ? 'bg-gray-800 border-gray-800' : 'bg-white border-gray-200'}`}
            >
              <Text style={tw`font-bold ${gender === g ? 'text-white' : 'text-gray-500'}`}>
                {g === 'male' ? '남성' : g === 'female' ? '여성' : '혼성'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={tw`font-bold text-gray-500 mb-2`}>일시</Text>
        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={tw`bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6`}>
          <Text style={tw`text-gray-900 font-bold`}>
            {date.getMonth()+1}월 {date.getDate()}일 {date.getHours()}시 {date.getMinutes() > 0 ? date.getMinutes()+'분' : ''}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker 
            value={date} 
            mode="datetime" 
            display="spinner"
            onChange={(e, d) => { setShowDatePicker(false); if(d) setDate(d); }} 
          />
        )}

        <Text style={tw`font-bold text-gray-500 mb-2`}>장소</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6`} placeholder="예: 한신대학교 체육관" value={location} onChangeText={setLocation} />

        {/* [Improved Fee UI] */}
        <Text style={tw`font-bold text-gray-500 mb-2`}>참가비</Text>
        <View style={tw`flex-row gap-2 mb-6`}>
            <TextInput 
                style={tw`flex-1 bg-gray-50 p-4 rounded-xl border ${isFree ? 'border-gray-200 bg-gray-100' : 'border-indigo-500 bg-white'}`} 
                placeholder="금액 입력 (원)" 
                keyboardType="number-pad"
                value={isFree ? '' : fee} 
                onChangeText={handleFeeChange}
                editable={!isFree}
            />
            <TouchableOpacity 
                onPress={toggleFree}
                style={tw`px-5 rounded-xl border items-center justify-center ${isFree ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
            >
                <Text style={tw`font-bold ${isFree ? 'text-white' : 'text-gray-500'}`}>참가비 없음</Text>
            </TouchableOpacity>
        </View>

        <Text style={tw`font-bold text-gray-500 mb-2`}>상세 내용</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl border border-gray-200 h-24 mb-8`} multiline placeholder="실력, 분위기 등 추가 정보를 입력하세요." value={description} onChangeText={setDescription} textAlignVertical="top" />

        <TouchableOpacity onPress={handleSubmit} disabled={loading} style={tw`bg-indigo-600 py-4 rounded-xl items-center`}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>모집 등록</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}