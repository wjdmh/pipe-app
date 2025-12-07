import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput as RNTextInput, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  Platform, 
  KeyboardAvoidingView, 
  Animated, 
  Modal, 
  TouchableWithoutFeedback, 
  ScrollView,
  LogBox
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import tw from 'twrnc';

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

/**
 * [Animation Component]
 */
const FadeInSection = ({ 
  children, 
  delay = 0, 
  visible = true, 
  zIndexValue = 0 
}: { 
  children: React.ReactNode, 
  delay?: number, 
  visible?: boolean, 
  zIndexValue?: number 
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 500, delay, useNativeDriver: true })
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;
  
  return (
    <Animated.View style={{ 
      opacity: fadeAnim, 
      transform: [{ translateY }], 
      marginBottom: 40, 
      zIndex: zIndexValue, 
      elevation: zIndexValue, 
      position: 'relative'
    }}>
      {children}
    </Animated.View>
  );
};

// [Design Component] 선택 카드
const SelectCard = ({ label, subLabel, icon, selected, onPress }: { label: string, subLabel?: string, icon: string, selected: boolean, onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 20 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    onPress();
  };

  return (
    <TouchableWithoutFeedback onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[
        tw`flex-1 p-5 rounded-3xl border shadow-sm items-center justify-center h-40`,
        { transform: [{ scale: scaleAnim }] },
        selected ? tw`bg-indigo-50 border-[#4F46E5] shadow-indigo-100` : tw`bg-white border-gray-100`
      ]}>
        <View style={tw`w-14 h-14 rounded-full items-center justify-center mb-3 ${selected ? 'bg-[#4F46E5]' : 'bg-gray-50'}`}>
            <FontAwesome5 name={icon} size={22} color={selected ? 'white' : '#9CA3AF'} />
        </View>
        <Text style={tw`text-lg font-bold ${selected ? 'text-[#4F46E5]' : 'text-gray-800'}`}>{label}</Text>
        {subLabel && <Text style={tw`text-xs mt-1 ${selected ? 'text-indigo-400' : 'text-gray-400'}`}>{subLabel}</Text>}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

export default function WriteMatchScreen() {
  const router = useRouter();
  
  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Data States
  const [type, setType] = useState<'6man' | '9man' | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | 'mixed' | null>(null);
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  // UI States
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  
  // [UX 개선] 단계 자동 스크롤
  const nextStep = (next: number) => {
    if (step < next) {
        setStep(next);
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 500); 
    }
  };

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

  const handleSubmit = async () => {
    // 1. 입력값 검증 (Validation)
    if (!type) return Alert.alert('정보 입력', '경기 방식을 선택해주세요.');
    if (!gender) return Alert.alert('정보 입력', '성별을 선택해주세요.');
    if (!place.trim()) return Alert.alert('정보 입력', '경기 장소를 입력해주세요.'); // [Fix] 공백 체크 추가

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('로그인이 필요해요.');

      // 2. 유저 정보 안전 조회
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) throw new Error('회원 정보를 찾을 수 없습니다.');
      const userData = userSnap.data();
      
      // 3. 팀 정보 유효성 검사
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

      // [Strategic Proposal] 팀 활동 시간 갱신 (유령 팀 방지)
      // 매칭을 생성한다는 것은 팀이 활발히 활동 중이라는 증거입니다.
      await updateDoc(teamRef, { 
          lastActiveAt: serverTimestamp() 
      });

      // 4. 데이터 쓰기
      const payload = {
        hostId: userData.teamId,
        team: teamData.name || 'Unknown Team',
        affiliation: teamData.affiliation || '소속 미정',
        type,
        gender,
        time: date.toISOString(),
        loc: place.trim(), // [Fix] 공백 제거
        note: note.trim(),
        status: 'recruiting',
        createdAt: new Date().toISOString(),
        applicants: [],
        level: teamData.level || 'C',
        isDeleted: false
      };

      await addDoc(collection(db, "matches"), payload);

      Alert.alert('작성 완료', '매칭 공고가 등록되었습니다.', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      console.error("Match Create Error:", error);
      const errorMsg = error.message || '알 수 없는 오류가 발생했습니다.';
      Alert.alert('등록 실패', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      {/* Header */}
      <View style={tw`px-5 h-14 flex-row items-center justify-between border-b border-gray-50 bg-white z-10`}>
        <TouchableOpacity onPress={() => router.back()} style={tw`p-2 -ml-2 rounded-full active:bg-gray-100`}>
          <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`font-bold text-base text-gray-800`}>매칭 만들기</Text>
        <View style={tw`w-8`} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={tw`px-6 pt-6 pb-60`}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
        >
            {/* Title */}
            <View style={tw`mb-10`}>
                <Text style={tw`text-3xl font-extrabold text-gray-900 leading-tight mb-2`}>
                    매칭 만들기
                </Text>
            </View>

            {/* Q1: Type */}
            <FadeInSection>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>경기 방식</Text>
                <View style={tw`flex-row gap-3`}>
                    <SelectCard label="6인제" subLabel="정규 룰" icon="volleyball-ball" selected={type === '6man'} onPress={() => { setType('6man'); nextStep(2); }} />
                    <SelectCard label="9인제" subLabel="생활체육" icon="users" selected={type === '9man'} onPress={() => { setType('9man'); nextStep(2); }} />
                </View>
            </FadeInSection>

            {/* Q2: Gender */}
            {step >= 2 && (
            <FadeInSection delay={100}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>성별</Text>
                <View style={tw`gap-3`}>
                <TouchableOpacity onPress={() => { setGender('mixed'); nextStep(3); }} activeOpacity={0.8} style={tw`w-full p-5 rounded-3xl border flex-row items-center shadow-sm ${gender === 'mixed' ? 'bg-indigo-50 border-[#4F46E5]' : 'bg-white border-gray-100'}`}>
                    <View style={tw`w-12 h-12 rounded-full items-center justify-center mr-4 ${gender === 'mixed' ? 'bg-[#4F46E5]' : 'bg-gray-50'}`}>
                        <FontAwesome5 name="restroom" size={20} color={gender === 'mixed' ? 'white' : '#9CA3AF'} />
                    </View>
                    <View>
                        <Text style={tw`text-lg font-bold ${gender === 'mixed' ? 'text-[#4F46E5]' : 'text-gray-800'}`}>혼성</Text>
                        <Text style={tw`text-xs mt-1 ${gender === 'mixed' ? 'text-indigo-400' : 'text-gray-400'}`}>남녀 혼합</Text>
                    </View>
                </TouchableOpacity>
                <View style={tw`flex-row gap-3`}>
                    <SelectCard label="남자부" icon="male" selected={gender === 'male'} onPress={() => { setGender('male'); nextStep(3); }} />
                    <SelectCard label="여자부" icon="female" selected={gender === 'female'} onPress={() => { setGender('female'); nextStep(3); }} />
                </View>
                </View>
            </FadeInSection>
            )}

            {/* Q3: Date & Time */}
            {step >= 3 && (
            <FadeInSection delay={100}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>일시</Text>
                <TouchableOpacity 
                    onPress={() => { setTempDate(date); setShowDateModal(true); }} 
                    activeOpacity={0.8}
                    style={tw`bg-white p-5 rounded-3xl border border-gray-200 flex-row justify-between items-center shadow-sm`}
                >
                <View>
                    <Text style={tw`text-xs font-bold text-gray-400 mb-1`}>날짜와 시간</Text>
                    <Text style={tw`text-xl font-extrabold text-[#4F46E5]`}>{formatDateKr(date)}  {formatTimeKr(date)}</Text>
                </View>
                <View style={tw`w-10 h-10 bg-indigo-50 rounded-full items-center justify-center`}>
                    <FontAwesome5 name="calendar-alt" size={18} color="#4F46E5" />
                </View>
                </TouchableOpacity>
            </FadeInSection>
            )}

            {/* Q4: Location */}
            {step >= 4 && (
            <FadeInSection delay={100}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>장소</Text>
                <View style={tw`bg-white rounded-3xl border border-gray-200 p-1 shadow-sm`}>
                    <RNTextInput
                        style={tw`bg-white p-5 text-lg text-gray-800 rounded-2xl`}
                        placeholder="체육관 이름 또는 주소 입력"
                        placeholderTextColor="#D1D5DB"
                        value={place}
                        onChangeText={(text) => setPlace(text)}
                        returnKeyType="next"
                        onSubmitEditing={() => nextStep(5)}
                    />
                </View>
            </FadeInSection>
            )}

            {/* Q5: Note */}
            {step >= 5 && (
            <FadeInSection delay={100}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>안내 사항 (선택)</Text>
                <View style={tw`bg-white rounded-3xl border border-gray-200 p-1 mb-8 shadow-sm`}>
                    <RNTextInput
                    style={tw`bg-white p-5 text-lg text-gray-800 min-h-[140px] rounded-2xl`}
                    placeholder="주차 정보, 참가비, 팀 실력 등"
                    placeholderTextColor="#D1D5DB"
                    multiline
                    textAlignVertical="top"
                    value={note}
                    onChangeText={setNote}
                    />
                </View>

                <TouchableOpacity 
                onPress={handleSubmit} 
                disabled={loading} 
                style={tw`w-full bg-[#4F46E5] py-5 rounded-3xl items-center shadow-lg shadow-indigo-200 active:scale-95 mb-10`}
                >
                {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-extrabold text-xl`}>완료</Text>}
                </TouchableOpacity>
            </FadeInSection>
            )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal visible={showDateModal} transparent animationType="fade">
        <View style={tw`flex-1 justify-end bg-black/60`}>
            <View style={tw`bg-white rounded-t-[32px] p-6 pb-10 shadow-2xl`}>
                <View style={tw`flex-row justify-between items-center mb-6 px-2`}>
                    <Text style={tw`text-xl font-bold text-gray-900`}>시간 선택</Text>
                    <TouchableOpacity onPress={() => setShowDateModal(false)} style={tw`bg-gray-100 px-4 py-2 rounded-full`}>
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
                        setShowDateModal(false);
                        nextStep(4);
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