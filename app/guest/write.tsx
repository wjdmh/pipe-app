import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native'; // [Add] KeyboardAvoidingView, Platform 추가
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { useGuest } from '../../hooks/useGuest';
import tw from 'twrnc';

const POSITIONS = ['OH', 'OP', 'MB', 'S', 'L'];

export default function GuestWriteScreen() {
  const router = useRouter();
  const { createPost } = useGuest();
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(new Date());
  const [tempDate, setTempDate] = useState(new Date()); 
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [location, setLocation] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [gender, setGender] = useState<'male'|'female'|'mixed'>('mixed');
  
  const [fee, setFee] = useState('');
  const [isFree, setIsFree] = useState(false);

  const [description, setDescription] = useState('');

  const formatDateKr = (d: Date) => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  };

  const formatTimeKr = (d: Date) => {
    const hour = d.getHours();
    const min = d.getMinutes();
    const ampm = hour >= 12 ? '오후' : '오전';
    const formatHour = hour % 12 || 12;
    return `${ampm} ${formatHour}시 ${min > 0 ? `${min}분` : ''}`;
  };

  const togglePosition = (pos: string) => {
    if (positions.includes(pos)) setPositions(positions.filter(p => p !== pos));
    else setPositions([...positions, pos]);
  };

  const handleFeeChange = (text: string) => {
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
    
    if (date < new Date()) {
        return Alert.alert('알림', '이미 지나간 날짜는 선택할 수 없어요.');
    }
    
    setLoading(true);
    try {
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
        fee: isFree ? '0' : fee,
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
        <Text style={tw`text-lg font-bold ml-4 text-gray-900`}>게스트 모집하기</Text>
      </View>

      {/* [Fix] KeyboardAvoidingView 추가: 입력창 가림 방지 */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
      >
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
            <TouchableOpacity 
                onPress={() => { setTempDate(date); setShowDatePicker(true); }} 
                activeOpacity={0.8}
                style={tw`bg-white p-5 rounded-3xl border border-gray-200 flex-row justify-between items-center shadow-sm mb-6`}
            >
                <View>
                    <Text style={tw`text-xs font-bold text-gray-400 mb-1`}>날짜와 시간</Text>
                    <Text style={tw`text-xl font-extrabold text-[#4F46E5]`}>
                        {formatDateKr(date)}  {formatTimeKr(date)}
                    </Text>
                </View>
                <View style={tw`w-10 h-10 bg-indigo-50 rounded-full items-center justify-center`}>
                    <FontAwesome5 name="calendar-alt" size={18} color="#4F46E5" />
                </View>
            </TouchableOpacity>

            <Text style={tw`font-bold text-gray-500 mb-2`}>장소</Text>
            <TextInput style={tw`bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6`} placeholder="정확한 주소를 입력해주세요" value={location} onChangeText={setLocation} />

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

            <TouchableOpacity onPress={handleSubmit} disabled={loading} style={tw`bg-indigo-600 py-4 rounded-xl items-center shadow-lg shadow-indigo-200`}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>모집 등록</Text>}
            </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={tw`flex-1 justify-end bg-black/60`}>
            <View style={tw`bg-white rounded-t-[32px] p-6 pb-10 shadow-2xl`}>
                <View style={tw`flex-row justify-between items-center mb-6 px-2`}>
                    <Text style={tw`text-xl font-bold text-gray-900`}>시간 선택</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)} style={tw`bg-gray-100 px-4 py-2 rounded-full`}>
                        <Text style={tw`text-gray-500 font-bold text-xs`}>취소</Text>
                    </TouchableOpacity>
                </View>
                <DateTimePicker
                    value={tempDate}
                    mode="datetime"
                    display="spinner"
                    onChange={(e, d) => d && setTempDate(d)}
                    textColor="#111827"
                    locale="ko-KR"
                    minimumDate={new Date()}
                    style={tw`h-48`}
                />
                <TouchableOpacity 
                    onPress={() => {
                        setDate(tempDate);
                        setShowDatePicker(false);
                    }}
                    style={tw`mt-6 bg-[#4F46E5] py-4 rounded-2xl items-center shadow-lg shadow-indigo-200`}
                >
                    <Text style={tw`text-white font-bold text-lg`}>설정</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}