import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { useGuest } from '../../hooks/useGuest';

const POSITIONS = ['OH', 'OP', 'MB', 'S', 'L'];

// [Helper] 로컬 시간 ISO 문자열 변환 (웹 input용)
const toLocalISOString = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000; //ms
  const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
  return localISOTime;
};

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

  // [Mobile] 날짜 변경 핸들러
  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) {
        setTempDate(selectedDate);
    }
  };

  // [Web] 날짜 변경 핸들러
  const handleWebDateChange = (e: any) => {
      const val = e.target.value;
      if (val) {
          setDate(new Date(val));
      }
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
        Alert.alert('등록 완료', '용병 모집글이 등록되었습니다.', [
            { text: '확인', onPress: () => router.back() }
        ]);
      }
    } catch (e) {
      Alert.alert('오류', '등록 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="p-6 pb-20" showsVerticalScrollIndicator={false}>
            {/* Title 추가 */}
            <View className="mb-8">
                <Text className="text-2xl font-extrabold text-gray-900 mb-2">게스트 모집하기</Text>
                <Text className="text-gray-500 text-sm">함께 운동할 멤버를 찾아보세요.</Text>
            </View>

            <Text className="font-bold text-gray-500 mb-2">필요 포지션</Text>
            <View className="flex-row flex-wrap gap-2 mb-6">
            {POSITIONS.map(pos => (
                <TouchableOpacity 
                key={pos}
                onPress={() => togglePosition(pos)}
                className={`px-4 py-2 rounded-lg border ${positions.includes(pos) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
                >
                <Text className={`font-bold ${positions.includes(pos) ? 'text-white' : 'text-gray-500'}`}>{pos}</Text>
                </TouchableOpacity>
            ))}
            </View>

            <Text className="font-bold text-gray-500 mb-2">성별</Text>
            <View className="flex-row gap-2 mb-6">
            {['male', 'female', 'mixed'].map((g: any) => (
                <TouchableOpacity 
                key={g}
                onPress={() => setGender(g)}
                className={`flex-1 py-3 rounded-xl border items-center ${gender === g ? 'bg-gray-800 border-gray-800' : 'bg-white border-gray-200'}`}
                >
                <Text className={`font-bold ${gender === g ? 'text-white' : 'text-gray-500'}`}>
                    {g === 'male' ? '남성' : g === 'female' ? '여성' : '혼성'}
                </Text>
                </TouchableOpacity>
            ))}
            </View>

            <Text className="font-bold text-gray-500 mb-2">일시</Text>
            {Platform.OS === 'web' ? (
                <View className="bg-white p-4 rounded-xl border border-gray-200 mb-6">
                    {React.createElement('input', {
                        type: 'datetime-local',
                        value: toLocalISOString(date),
                        onChange: handleWebDateChange,
                        style: {
                            border: 'none',
                            width: '100%',
                            height: '40px',
                            fontSize: '16px',
                            color: '#111827',
                            backgroundColor: 'transparent',
                            outline: 'none',
                            cursor: 'pointer'
                        }
                    })}
                </View>
            ) : (
                <TouchableOpacity 
                    onPress={() => { setTempDate(date); setShowDatePicker(true); }} 
                    activeOpacity={0.8}
                    className="bg-white p-5 rounded-3xl border border-gray-200 flex-row justify-between items-center shadow-sm mb-6"
                >
                    <View>
                        <Text className="text-xs font-bold text-gray-400 mb-1">날짜와 시간</Text>
                        <Text className="text-xl font-extrabold text-[#4F46E5]">
                            {formatDateKr(date)}  {formatTimeKr(date)}
                        </Text>
                    </View>
                    <View className="w-10 h-10 bg-indigo-50 rounded-full items-center justify-center">
                        <FontAwesome5 name="calendar-alt" size={18} color="#4F46E5" />
                    </View>
                </TouchableOpacity>
            )}

            <Text className="font-bold text-gray-500 mb-2">장소</Text>
            <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6" placeholder="정확한 주소를 입력해주세요" value={location} onChangeText={setLocation} />

            <Text className="font-bold text-gray-500 mb-2">참가비</Text>
            <View className="flex-row gap-2 mb-6">
                <TextInput 
                    className={`flex-1 bg-gray-50 p-4 rounded-xl border ${isFree ? 'border-gray-200 bg-gray-100' : 'border-indigo-500 bg-white'}`} 
                    placeholder="금액 입력 (원)" 
                    keyboardType="number-pad"
                    value={isFree ? '' : fee} 
                    onChangeText={handleFeeChange}
                    editable={!isFree}
                />
                <TouchableOpacity 
                    onPress={toggleFree}
                    className={`px-5 rounded-xl border items-center justify-center ${isFree ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
                >
                    <Text className={`font-bold ${isFree ? 'text-white' : 'text-gray-500'}`}>참가비 없음</Text>
                </TouchableOpacity>
            </View>

            <Text className="font-bold text-gray-500 mb-2">상세 내용</Text>
            <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 h-24 mb-8" multiline placeholder="실력, 분위기 등 추가 정보를 입력하세요." value={description} onChangeText={setDescription} textAlignVertical="top" />

            <TouchableOpacity onPress={handleSubmit} disabled={loading} className="bg-indigo-600 py-4 rounded-xl items-center shadow-lg shadow-indigo-200">
            {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">모집 등록</Text>}
            </TouchableOpacity>
            
            {/* 아까 테스트용으로 넣으셨던 부분입니다. 필요 없으시면 지우세요! */}
            <Text className="bg-red-500 text-5xl p-10 mt-10 text-white text-center font-bold">여기보세요!!!!</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal (Mobile Only) */}
      {Platform.OS !== 'web' && (
        <Modal visible={showDatePicker} transparent animationType="fade">
            <View className="flex-1 justify-end bg-black/60">
                <View className="bg-white rounded-t-[32px] p-6 pb-10 shadow-2xl">
                    <View className="flex-row justify-between items-center mb-6 px-2">
                      <Text className="text-xl font-bold">시간 선택</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)} className="bg-gray-100 px-4 py-2 rounded-full"><Text className="text-gray-500 font-bold text-xs">취소</Text></TouchableOpacity>
                    </View>
                    <DateTimePicker value={tempDate} mode="datetime" display="spinner" onChange={handleDateChange} textColor="#111827" locale="ko-KR" minimumDate={new Date()} className="h-48" />
                    <TouchableOpacity onPress={() => { setDate(tempDate); setShowDatePicker(false); }} className="mt-6 bg-[#4F46E5] py-4 rounded-2xl items-center shadow-lg shadow-indigo-200"><Text className="text-white font-bold text-lg">설정</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}