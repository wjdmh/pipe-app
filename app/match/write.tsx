import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  Platform, 
  KeyboardAvoidingView, 
  Animated, 
  Modal, 
  Pressable, // [Change] TouchableWithoutFeedback 대체
  ScrollView,
  LogBox
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

// [Architect's Fix] 웹 대응 드라이버 설정
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// [Architect's Fix] SelectCard 리팩토링 (TouchableWithoutFeedback -> Pressable)
const SelectCard = ({ label, subLabel, icon, selected, onPress }: { label: string, subLabel?: string, icon: string, selected: boolean, onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { 
      toValue: 0.96, 
      useNativeDriver: USE_NATIVE_DRIVER, 
      speed: 20 
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { 
      toValue: 1, 
      useNativeDriver: USE_NATIVE_DRIVER, 
      speed: 20 
    }).start();
  };

  return (
    <Pressable 
      onPress={onPress}
      onPressIn={handlePressIn} 
      onPressOut={handlePressOut}
      style={{ flex: 1 }} // Pressable은 기본 스타일이 없으므로 flex: 1 명시
    >
      <Animated.View 
        className={`flex-1 p-5 rounded-2xl border shadow-sm items-center justify-center h-36 ${selected ? 'bg-indigo-50 border-[#4F46E5] shadow-indigo-100' : 'bg-white border-gray-100'}`}
        style={{ transform: [{ scale: scaleAnim }] }}
      >
        <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${selected ? 'bg-[#4F46E5]' : 'bg-gray-50'}`}>
            <FontAwesome5 name={icon} size={20} color={selected ? 'white' : '#9CA3AF'} />
        </View>
        <Text className={`text-base font-bold ${selected ? 'text-[#4F46E5]' : 'text-gray-800'}`}>{label}</Text>
        {subLabel && <Text className={`text-[10px] mt-1 ${selected ? 'text-indigo-400' : 'text-gray-400'}`}>{subLabel}</Text>}
      </Animated.View>
    </Pressable>
  );
};

// [Helper] 로컬 시간 ISO 문자열 변환 (웹 input용)
const toLocalISOString = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000; //ms
  const localISOTime = (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
  return localISOTime;
};

export default function WriteMatchScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Data States
  const [type, setType] = useState<'6man' | '9man' | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | 'mixed' | null>(null);
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  // UI States (Mobile Only)
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

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
    if (selectedDate) setTempDate(selectedDate);
  };

  // [Web] 날짜 변경 핸들러
  const handleWebDateChange = (e: any) => {
      const val = e.target.value;
      if (val) setDate(new Date(val));
  };

  const handleSubmit = async () => {
    if (!type) return Alert.alert('정보 입력', '경기 방식을 선택해주세요.');
    if (!gender) return Alert.alert('정보 입력', '성별을 선택해주세요.');
    if (!place.trim()) return Alert.alert('정보 입력', '경기 장소를 입력해주세요.');

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('로그인이 필요해요.');

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
      const userData = userSnap.data();
      
      if (!userData?.teamId) {
        Alert.alert('팀 등록 필요', '팀 프로필이 없어요. 팀을 먼저 등록해주세요.', [
            { text: '등록하기', onPress: () => router.replace('/team/register') }
        ]);
        return;
      }

      const teamRef = doc(db, "teams", userData.teamId);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) throw new Error('소속된 팀 정보를 찾을 수 없습니다.');
      const teamData = teamSnap.data();

      await updateDoc(teamRef, { lastActiveAt: serverTimestamp() });

      await addDoc(collection(db, "matches"), {
        hostId: userData.teamId,
        team: teamData.name || 'Unknown Team',
        affiliation: teamData.affiliation || '소속 미정',
        type,
        gender,
        time: date.toISOString(),
        loc: place.trim(),
        note: note.trim(),
        status: 'recruiting',
        createdAt: new Date().toISOString(),
        applicants: [],
        level: teamData.level || 'C',
        isDeleted: false
      });

      Alert.alert('작성 완료', '매칭 공고가 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      Alert.alert('등록 실패', error.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F9FAFB]" edges={['bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView 
            contentContainerClassName="p-6 pb-40"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
        >
            <View className="mb-8">
                <Text className="text-2xl font-extrabold text-gray-900 mb-2">새로운 매칭 만들기</Text>
                <Text className="text-gray-500 text-sm">팀원들과 함께할 즐거운 경기를 만들어보세요.</Text>
            </View>

            {/* 1. 경기 방식 */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">경기 방식</Text>
                <View className="flex-row gap-3">
                    <SelectCard 
                        label="6인제" subLabel="정규 룰" icon="volleyball-ball" 
                        selected={type === '6man'} onPress={() => setType('6man')} 
                    />
                    <SelectCard 
                        label="9인제" subLabel="생활체육" icon="users" 
                        selected={type === '9man'} onPress={() => setType('9man')} 
                    />
                </View>
            </View>

            {/* 2. 성별 */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">성별</Text>
                <View className="gap-3">
                    <TouchableOpacity onPress={() => setGender('mixed')} activeOpacity={0.8} className={`w-full p-4 rounded-2xl border flex-row items-center shadow-sm ${gender === 'mixed' ? 'bg-indigo-50 border-[#4F46E5]' : 'bg-white border-gray-100'}`}>
                        <View className={`w-10 h-10 rounded-full items-center justify-center mr-4 ${gender === 'mixed' ? 'bg-[#4F46E5]' : 'bg-gray-50'}`}>
                            <FontAwesome5 name="restroom" size={16} color={gender === 'mixed' ? 'white' : '#9CA3AF'} />
                        </View>
                        <View>
                            <Text className={`text-base font-bold ${gender === 'mixed' ? 'text-[#4F46E5]' : 'text-gray-800'}`}>혼성</Text>
                            <Text className={`text-xs ${gender === 'mixed' ? 'text-indigo-400' : 'text-gray-400'}`}>남녀 혼합 경기</Text>
                        </View>
                    </TouchableOpacity>
                    <View className="flex-row gap-3">
                        <SelectCard label="남자부" icon="male" selected={gender === 'male'} onPress={() => setGender('male')} />
                        <SelectCard label="여자부" icon="female" selected={gender === 'female'} onPress={() => setGender('female')} />
                    </View>
                </View>
            </View>

            {/* 3. 일시 */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">일시</Text>
                {Platform.OS === 'web' ? (
                    <View className="bg-white p-4 rounded-2xl border border-gray-200">
                        {React.createElement('input', {
                            type: 'datetime-local',
                            value: toLocalISOString(date),
                            onChange: handleWebDateChange,
                            style: {
                                border: 'none', width: '100%', height: '30px', fontSize: '16px',
                                color: '#111827', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer'
                            }
                        })}
                    </View>
                ) : (
                    <TouchableOpacity onPress={() => { setTempDate(date); setShowDateModal(true); }} activeOpacity={0.8} className="bg-white p-5 rounded-2xl border border-gray-200 flex-row justify-between items-center shadow-sm">
                        <View>
                            <Text className="text-xs font-bold text-gray-400 mb-1">선택된 시간</Text>
                            <Text className="text-lg font-bold text-[#191F28]">{formatDateKr(date)} {formatTimeKr(date)}</Text>
                        </View>
                        <FontAwesome5 name="calendar-alt" size={20} color="#4F46E5" />
                    </TouchableOpacity>
                )}
            </View>

            {/* 4. 장소 */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">장소</Text>
                <View className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <TextInput
                        className="p-4 text-base text-gray-800 h-14"
                        placeholder="체육관 이름 또는 주소 입력"
                        placeholderTextColor="#9CA3AF"
                        value={place}
                        onChangeText={setPlace}
                    />
                </View>
            </View>

            {/* 5. 안내 사항 */}
            <View className="mb-10">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">안내 사항 (선택)</Text>
                <View className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <TextInput
                        className="p-4 text-base text-gray-800 min-h-[120px]"
                        placeholder="주차 정보, 참가비, 팀 실력 등 상세 정보를 적어주세요."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        textAlignVertical="top"
                        value={note}
                        onChangeText={setNote}
                    />
                </View>
            </View>

            {/* 완료 버튼 */}
            <TouchableOpacity 
                onPress={handleSubmit} 
                disabled={loading} 
                className="w-full bg-[#4F46E5] py-4 rounded-2xl items-center shadow-lg shadow-indigo-200 active:scale-95"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">매칭 등록하기</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal (Mobile Only) */}
      {Platform.OS !== 'web' && (
        <Modal visible={showDateModal} transparent animationType="fade">
            <View className="flex-1 justify-end bg-black/60">
                <View className="bg-white rounded-t-3xl p-6 pb-10 shadow-2xl">
                    <View className="flex-row justify-between items-center mb-6 px-2">
                        <Text className="text-xl font-bold text-[#191F28]">시간 선택</Text>
                        <TouchableOpacity onPress={() => setShowDateModal(false)} className="bg-gray-100 px-4 py-2 rounded-full">
                            <Text className="text-gray-500 font-bold text-xs">취소</Text>
                        </TouchableOpacity>
                    </View>
                    <DateTimePicker value={tempDate} mode="datetime" display="spinner" onChange={handleDateChange} textColor="#111827" locale="ko-KR" minimumDate={new Date()} className="h-48" />
                    <TouchableOpacity onPress={() => { setDate(tempDate); setShowDateModal(false); }} className="mt-6 bg-[#4F46E5] py-4 rounded-2xl items-center shadow-lg shadow-indigo-200">
                        <Text className="text-white font-bold text-lg">확인</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}