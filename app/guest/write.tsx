import React, { useState, useEffect } from 'react';
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
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

// [상수] 선택 옵션 데이터
const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '포지션 무관'];
const LEVELS = ['S급(선출)', 'A급(상급)', 'B급(중급)', 'C급(초급)', '초심'];

export default function WriteGuestPostScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // [Form Data]
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('mixed');
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<string>('C급(초급)'); // 단일 선택 (희망 실력)
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  // [UI States]
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // [Helper] 날짜 포맷
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

  // [Logic] 포지션 토글
  const togglePosition = (pos: string) => {
    setSelectedPositions(prev => {
        const next = new Set(prev);
        if (next.has(pos)) next.delete(pos);
        else next.add(pos);
        return next;
    });
  };

  // [Logic] 제출
  const handleSubmit = async () => {
    if (selectedPositions.size === 0) return alert('모집할 포지션을 최소 1개 선택해주세요.');
    if (!place.trim()) return alert('경기 장소를 입력해주세요.');
    
    // 과거 날짜 체크
    if (date < new Date()) return alert('미래의 시간을 선택해주세요.');

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('로그인이 필요합니다.');

      // 1. 유저 & 팀 정보 확인
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
      
      const userData = userSnap.data();
      if (!userData?.teamId) {
        Alert.alert('알림', '팀 소속만 용병을 모집할 수 있습니다.', [
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
        hostCaptainId: user.uid, // 작성자(보안용)
        hostTeamId: userData.teamId,
        teamName: teamData.name || 'Unknown Team',
        gender,
        positions: Array.from(selectedPositions).join(', '), // 배열을 문자열로 변환 저장
        targetLevel: level,
        time: date.toISOString(),
        loc: place.trim(),
        note: note.trim(),
        status: 'recruiting', // recruiting | finished
        createdAt: new Date().toISOString(),
        applicants: [], // 신청자 목록
        isDeleted: false
      });

      Alert.alert('등록 완료', '용병 모집글이 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      Alert.alert('오류', error.message);
    } finally {
      setLoading(false);
    }
  };

  const alert = (msg: string) => {
    if(Platform.OS === 'web') window.alert(msg);
    else Alert.alert('알림', msg);
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            
            {/* Header */}
            <View className="mb-8">
                <Text className="text-2xl font-extrabold text-gray-900 mb-1">용병 모집하기</Text>
                <Text className="text-gray-500 text-[14px]">우리 팀에 필요한 파트너를 찾아보세요.</Text>
            </View>

            {/* 1. 성별 */}
            <View className="mb-8">
                <Text className="text-[15px] font-bold text-gray-900 mb-3">경기 성별</Text>
                <View className="flex-row bg-gray-100 p-1 rounded-xl">
                    {['male', 'female', 'mixed'].map((type) => (
                        <TouchableOpacity 
                            key={type}
                            onPress={() => setGender(type as any)}
                            className={`flex-1 py-2.5 rounded-lg items-center ${gender === type ? 'bg-white shadow-sm' : ''}`}
                        >
                            <Text className={`text-[14px] font-bold ${gender === type ? 'text-gray-900' : 'text-gray-400'}`}>
                                {type === 'male' ? '남자부' : type === 'female' ? '여자부' : '혼성'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* 2. 모집 포지션 (다중 선택) */}
            <View className="mb-8">
                <Text className="text-[15px] font-bold text-gray-900 mb-3">필요 포지션 (중복 가능)</Text>
                <View className="flex-row flex-wrap gap-2">
                    {POSITIONS.map(pos => {
                        const isSelected = selectedPositions.has(pos);
                        return (
                            <TouchableOpacity
                                key={pos}
                                onPress={() => togglePosition(pos)}
                                className={`px-4 py-2.5 rounded-full border ${isSelected ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`text-[13px] font-bold ${isSelected ? 'text-white' : 'text-gray-500'}`}>{pos}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* 3. 희망 실력 */}
            <View className="mb-8">
                <Text className="text-[15px] font-bold text-gray-900 mb-3">희망 실력</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                    {LEVELS.map(lv => (
                        <TouchableOpacity
                            key={lv}
                            onPress={() => setLevel(lv)}
                            className={`mr-2 px-4 py-2.5 rounded-full border ${level === lv ? 'bg-orange-50 border-orange-500' : 'bg-white border-gray-200'}`}
                        >
                            <Text className={`text-[13px] font-bold ${level === lv ? 'text-orange-600' : 'text-gray-500'}`}>{lv}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* 4. 일시 */}
            <View className="mb-8">
                <Text className="text-[15px] font-bold text-gray-900 mb-3">경기 일시</Text>
                {Platform.OS === 'web' ? (
                    <input 
                        type="datetime-local"
                        value={toLocalISOString(date)}
                        onChange={(e) => setDate(new Date(e.target.value))}
                        style={{
                            width: '100%', padding: '12px', borderRadius: '12px',
                            border: '1px solid #E5E7EB', fontSize: '15px', outline: 'none'
                        }}
                    />
                ) : (
                    <TouchableOpacity 
                        onPress={() => { setTempDate(date); setShowDateModal(true); }}
                        className="w-full p-4 rounded-xl border border-gray-200 bg-white"
                    >
                        <Text className="text-[16px] text-gray-900 font-medium">{formatDateTime(date)}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* 5. 장소 */}
            <View className="mb-8">
                <Text className="text-[15px] font-bold text-gray-900 mb-3">경기 장소</Text>
                <TextInput 
                    className="w-full p-4 rounded-xl border border-gray-200 bg-white text-[16px]"
                    placeholder="체육관 이름 또는 주소"
                    value={place}
                    onChangeText={setPlace}
                />
            </View>

            {/* 6. 상세 내용 */}
            <View className="mb-8">
                <Text className="text-[15px] font-bold text-gray-900 mb-3">상세 내용 (선택)</Text>
                <TextInput 
                    className="w-full p-4 rounded-xl border border-gray-200 bg-white text-[15px] min-h-[100px]"
                    placeholder="참가비, 주차 여부 등 추가 정보를 입력하세요."
                    multiline
                    textAlignVertical="top"
                    value={note}
                    onChangeText={setNote}
                />
            </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* 하단 버튼 */}
      <View className="absolute bottom-0 w-full px-5 py-5 bg-white border-t border-gray-100">
          <TouchableOpacity 
            onPress={handleSubmit}
            disabled={loading}
            className="w-full bg-gray-900 h-[56px] rounded-xl items-center justify-center shadow-sm"
          >
              {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-[16px]">모집글 등록</Text>}
          </TouchableOpacity>
      </View>

      {/* Date Picker Modal (Mobile) */}
      {Platform.OS !== 'web' && (
        <Modal visible={showDateModal} transparent animationType="fade">
            <View className="flex-1 justify-end bg-black/50">
                <View className="bg-white rounded-t-3xl p-6 pb-10">
                    <View className="flex-row justify-between items-center mb-6">
                        <Text className="text-lg font-bold text-gray-900">시간 선택</Text>
                        <TouchableOpacity onPress={() => setShowDateModal(false)}><Text className="text-gray-500 p-2">취소</Text></TouchableOpacity>
                    </View>
                    <DateTimePicker 
                        value={tempDate} 
                        mode="datetime" 
                        display="spinner" 
                        onChange={(_, d) => d && setTempDate(d)} 
                        textColor="#111827"
                        locale="ko-KR"
                        minimumDate={new Date()}
                    />
                    <TouchableOpacity 
                        onPress={() => { setDate(tempDate); setShowDateModal(false); }}
                        className="mt-4 bg-gray-900 py-3.5 rounded-xl items-center"
                    >
                        <Text className="text-white font-bold">확인</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}