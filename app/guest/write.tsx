import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  Platform, 
  KeyboardAvoidingView, 
  ScrollView,
  Modal,
  LogBox
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

// 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

// [상수 데이터]
const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '포지션 무관'];
const LEVELS = ['S급(선출)', 'A급(상급)', 'B급(중급)', 'C급(초급)', '초심'];

export default function WriteGuestPostScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // [Form Data]
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('mixed');
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<string>('C급(초급)'); 
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  // [UI States]
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // [Helper] 날짜 포맷 함수
  const formatDateTime = (d: Date) => {
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour = d.getHours();
    const min = d.getMinutes();
    const ampm = hour >= 12 ? '오후' : '오전';
    const formatHour = hour % 12 || 12;
    return `${month}월 ${day}일 ${ampm} ${formatHour}:${min.toString().padStart(2, '0')}`;
  };

  const toLocalISOString = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - offset)).toISOString().slice(0, 16);
  };

  const safeAlert = (title: string, msg: string, options?: any) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n${msg}`);
        if (options && options[0]?.onPress) options[0].onPress();
    } else {
        Alert.alert(title, msg, options);
    }
  };

  // [Logic] 포지션 토글
  const togglePosition = (pos: string) => {
    setSelectedPositions(prev => {
        const next = new Set(prev);
        if (next.has(pos)) next.delete(pos);
        else next.add(pos);
        return next;
    });
  };

  // [Logic] 제출 핸들러
  const handleSubmit = async () => {
    if (selectedPositions.size === 0) return safeAlert('필수 입력', '모집할 포지션을 최소 1개 선택해주세요.');
    if (!place.trim()) return safeAlert('필수 입력', '경기 장소를 입력해주세요.');
    
    // 과거 날짜 체크
    if (date < new Date()) return safeAlert('시간 확인', '미래의 시간을 선택해주세요.');

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('로그인이 필요합니다.');

      // 1. 유저 & 팀 정보 확인
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
      
      const userData = userSnap.data();
      if (!userData?.teamId) {
        safeAlert('알림', '팀 소속만 용병을 모집할 수 있습니다.', [
            { text: '팀 등록하러 가기', onPress: () => router.replace('/team/register') },
            { text: '취소', style: 'cancel' }
        ]);
        return;
      }

      const teamSnap = await getDoc(doc(db, "teams", userData.teamId));
      if (!teamSnap.exists()) throw new Error('팀 정보를 찾을 수 없습니다.');
      const teamData = teamSnap.data();

      // 2. 데이터 저장 (guest_posts)
      await addDoc(collection(db, "guest_posts"), {
        hostCaptainId: user.uid, // 작성자
        hostTeamId: userData.teamId,
        teamName: teamData.name || 'Unknown Team',
        gender,
        positions: Array.from(selectedPositions).join(', '), // 배열 -> 문자열
        targetLevel: level,
        time: date.toISOString(),
        loc: place.trim(),
        note: note.trim(),
        status: 'recruiting', 
        createdAt: new Date().toISOString(),
        applicants: [],
        isDeleted: false
      });

      safeAlert('등록 완료', '용병 모집글이 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      console.error(error);
      safeAlert('등록 실패', error.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F9FAFB]" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView 
            contentContainerClassName="p-6 pb-40" 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
        >
            
            {/* Header */}
            <View className="mb-8">
                <Text className="text-2xl font-extrabold text-gray-900 mb-2">용병 모집하기</Text>
                <Text className="text-gray-500 text-sm">우리 팀에 필요한 파트너를 찾아보세요.</Text>
            </View>

            {/* 1. 성별 (Card Style) */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">경기 성별</Text>
                <View className="flex-row bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
                    {['male', 'female', 'mixed'].map((type) => (
                        <TouchableOpacity 
                            key={type}
                            onPress={() => setGender(type as any)}
                            className={`flex-1 py-3 rounded-xl items-center ${gender === type ? 'bg-gray-900 shadow-sm' : ''}`}
                        >
                            <Text className={`text-sm font-bold ${gender === type ? 'text-white' : 'text-gray-400'}`}>
                                {type === 'male' ? '남자부' : type === 'female' ? '여자부' : '혼성'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* 2. 모집 포지션 (Card Style) */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">필요 포지션 (중복 가능)</Text>
                <View className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-row flex-wrap gap-2">
                    {POSITIONS.map(pos => {
                        const isSelected = selectedPositions.has(pos);
                        return (
                            <TouchableOpacity
                                key={pos}
                                onPress={() => togglePosition(pos)}
                                className={`px-4 py-2.5 rounded-full border ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-gray-50 border-gray-200'}`}
                            >
                                <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-500'}`}>{pos}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* 3. 희망 실력 (Card Style) */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">희망 실력</Text>
                <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        {LEVELS.map(lv => (
                            <TouchableOpacity
                                key={lv}
                                onPress={() => setLevel(lv)}
                                className={`mr-2 px-4 py-2.5 rounded-full border ${level === lv ? 'bg-orange-50 border-orange-500' : 'bg-gray-50 border-gray-200'}`}
                            >
                                <Text className={`text-xs font-bold ${level === lv ? 'text-orange-600' : 'text-gray-400'}`}>{lv}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>

            {/* 4. 일시 (Card Style) */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">경기 일시</Text>
                {Platform.OS === 'web' ? (
                    <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                        <input 
                            type="datetime-local"
                            value={toLocalISOString(date)}
                            onChange={(e) => setDate(new Date(e.target.value))}
                            style={{
                                width: '100%', border: 'none', fontSize: '15px', outline: 'none', backgroundColor: 'transparent'
                            }}
                        />
                    </View>
                ) : (
                    <TouchableOpacity 
                        onPress={() => { setTempDate(date); setShowDateModal(true); }}
                        className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex-row justify-between items-center"
                    >
                        <Text className="text-base text-gray-900 font-bold">{formatDateTime(date)}</Text>
                        <FontAwesome5 name="calendar-alt" size={18} color="#6B7280" />
                    </TouchableOpacity>
                )}
            </View>

            {/* 5. 장소 (Card Style) */}
            <View className="mb-6">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">경기 장소</Text>
                <View className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <TextInput 
                        className="p-4 text-base text-gray-900 h-14"
                        placeholder="체육관 이름 또는 주소"
                        placeholderTextColor="#9CA3AF"
                        value={place}
                        onChangeText={setPlace}
                    />
                </View>
            </View>

            {/* 6. 상세 내용 (Card Style) */}
            <View className="mb-8">
                <Text className="text-sm font-bold text-gray-600 mb-3 ml-1">상세 내용 (선택)</Text>
                <View className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                    <TextInput 
                        className="p-4 text-base text-gray-900 min-h-[120px]"
                        placeholder="참가비, 주차 여부 등 추가 정보를 입력하세요."
                        placeholderTextColor="#9CA3AF"
                        multiline
                        textAlignVertical="top"
                        value={note}
                        onChangeText={setNote}
                    />
                </View>
            </View>

            {/* 하단 버튼 */}
            <TouchableOpacity 
                onPress={handleSubmit}
                disabled={loading}
                className="w-full bg-blue-600 py-4 rounded-2xl items-center justify-center shadow-lg shadow-blue-200 active:scale-95 mb-6"
            >
                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">모집글 등록</Text>}
            </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal (Mobile) */}
      {Platform.OS !== 'web' && (
        <Modal visible={showDateModal} transparent animationType="fade">
            <View className="flex-1 justify-end bg-black/50">
                <View className="bg-white rounded-t-3xl p-6 pb-10 shadow-xl">
                    <View className="flex-row justify-between items-center mb-6">
                        <Text className="text-xl font-bold text-gray-900">시간 선택</Text>
                        <TouchableOpacity onPress={() => setShowDateModal(false)} className="bg-gray-100 px-3 py-1.5 rounded-lg">
                            <Text className="text-gray-500 font-bold text-xs">취소</Text>
                        </TouchableOpacity>
                    </View>
                    <DateTimePicker 
                        value={tempDate} 
                        mode="datetime" 
                        display="spinner" 
                        onChange={(_, d) => d && setTempDate(d)} 
                        textColor="#111827"
                        locale="ko-KR"
                        minimumDate={new Date()}
                        className="h-48"
                    />
                    <TouchableOpacity 
                        onPress={() => { setDate(tempDate); setShowDateModal(false); }}
                        className="mt-6 bg-blue-600 py-4 rounded-2xl items-center"
                    >
                        <Text className="text-white font-bold text-lg">확인</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}