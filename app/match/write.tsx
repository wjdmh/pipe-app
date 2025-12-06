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
  Keyboard,
  ScrollView,
  LogBox
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { GooglePlacesAutocomplete, GooglePlacesAutocompleteRef } from 'react-native-google-places-autocomplete';
import tw from 'twrnc';

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

// ✅ 사용자 API 키
const GOOGLE_API_KEY = "AIzaSyDzsmyPhhVTB64k_P4aJjYBVUpuMPJZA_Q";

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
  const googlePlacesRef = useRef<GooglePlacesAutocompleteRef>(null);
  
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
  
  // ✅ [상태 추가] 검색 리스트 표시 여부 제어 (초기값 'auto' 아님 true로 설정해도 무관하나 auto가 안전)
  const [listViewDisplayed, setListViewDisplayed] = useState<'auto' | boolean>('auto');

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
    if (!type || !gender || !place) return Alert.alert('잠시만요', '필수 정보를 모두 입력해주세요.');

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('로그인이 필요합니다.');

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      
      if (!userData?.teamId) {
        Alert.alert('알림', '팀 프로필을 먼저 만들어주세요.');
        router.replace('/team/register');
        return;
      }

      const teamDoc = await getDoc(doc(db, "teams", userData.teamId));
      const teamData = teamDoc.data();

      await addDoc(collection(db, "matches"), {
        hostId: userData.teamId,
        team: teamData?.name || 'Unknown Team',
        affiliation: teamData?.affiliation || '',
        type,
        gender,
        time: date.toISOString(),
        loc: place,
        note: note || '',
        status: 'recruiting',
        createdAt: new Date().toISOString(),
        applicants: [],
        level: teamData?.level || 'B',
        isDeleted: false
      });

      Alert.alert('매칭 등록 완료! 🎉', '곧 좋은 상대를 찾아드릴게요.', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      console.error(error);
      Alert.alert('오류', '문제가 생겼어요. 다시 시도해주세요.');
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
        {/* ✅ [터치 씹힘 해결의 핵심] Parent ScrollView에 handled 설정 */}
        <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={tw`px-6 pt-6 pb-60`}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
        >
            {/* Title */}
            <View style={tw`mb-10`}>
                <Text style={tw`text-3xl font-extrabold text-gray-900 leading-tight mb-2`}>
                    새로운 경기를{'\n'}시작해볼까요?
                </Text>
                <Text style={tw`text-gray-400 text-base`}>아래 질문에 차근차근 답해주세요.</Text>
            </View>

            {/* Q1: Type */}
            <FadeInSection>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>1. 경기 방식</Text>
                <View style={tw`flex-row gap-3`}>
                    <SelectCard label="6인제" subLabel="정규 룰" icon="volleyball-ball" selected={type === '6man'} onPress={() => { setType('6man'); nextStep(2); }} />
                    <SelectCard label="9인제" subLabel="생활체육" icon="users" selected={type === '9man'} onPress={() => { setType('9man'); nextStep(2); }} />
                </View>
            </FadeInSection>

            {/* Q2: Gender */}
            {step >= 2 && (
            <FadeInSection delay={100}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>2. 참가 선수 성별</Text>
                <View style={tw`gap-3`}>
                <TouchableOpacity onPress={() => { setGender('mixed'); nextStep(3); }} activeOpacity={0.8} style={tw`w-full p-5 rounded-3xl border flex-row items-center shadow-sm ${gender === 'mixed' ? 'bg-indigo-50 border-[#4F46E5]' : 'bg-white border-gray-100'}`}>
                    <View style={tw`w-12 h-12 rounded-full items-center justify-center mr-4 ${gender === 'mixed' ? 'bg-[#4F46E5]' : 'bg-gray-50'}`}>
                        <FontAwesome5 name="restroom" size={20} color={gender === 'mixed' ? 'white' : '#9CA3AF'} />
                    </View>
                    <View>
                        <Text style={tw`text-lg font-bold ${gender === 'mixed' ? 'text-[#4F46E5]' : 'text-gray-800'}`}>혼성 (Mixed)</Text>
                        <Text style={tw`text-xs mt-1 ${gender === 'mixed' ? 'text-indigo-400' : 'text-gray-400'}`}>남녀 선수가 함께 뛰어요</Text>
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
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>3. 경기 일시</Text>
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
            <FadeInSection delay={100} zIndexValue={2000}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>4. 경기 장소</Text>
                
                {/* 검색창 컨테이너 */}
                <View style={[tw`bg-white rounded-3xl shadow-sm border border-gray-200 relative`, { minHeight: 60, zIndex: 2000 }]}>
                    <View style={tw`flex-row items-center px-4 pt-4`}>
                        <FontAwesome5 name="search" size={16} color="#4F46E5" style={tw`mr-3`} />
                        <Text style={tw`text-gray-400 font-bold text-xs`}>장소 검색</Text>
                    </View>

                    <GooglePlacesAutocomplete
                        ref={googlePlacesRef}
                        placeholder='예: 한신대학교 체육관'
                        
                        // ✅ [핵심 Fix] 리스트 표시 여부 제어
                        listViewDisplayed={listViewDisplayed}

                        onPress={(data, details = null) => {
                            if (googlePlacesRef.current) {
                                googlePlacesRef.current.setAddressText(data.description);
                            }
                            setPlace(data.description);
                            
                            // ✅ [핵심 Fix] 선택 시 리스트 강제 숨김
                            setListViewDisplayed(false); 
                            Keyboard.dismiss(); 
                            
                            nextStep(5);
                        }}
                        query={{
                            key: GOOGLE_API_KEY,
                            language: 'ko',
                            components: 'country:kr',
                        }}
                        
                        // ❌ 에러 발생 코드 삭제 (flatListProps, listProps 등 삭제)
                        // 상위 ScrollView에서 keyboardShouldPersistTaps='handled'를 처리하므로 삭제해도 안전함.

                        renderRow={(data) => (
                            <View style={tw`flex-row items-center py-3 bg-white`}>
                                <View style={tw`w-8 h-8 rounded-full bg-gray-50 items-center justify-center mr-3`}>
                                    <FontAwesome5 name="map-marker-alt" size={14} color="#64748b" />
                                </View>
                                <View style={tw`flex-1`}>
                                    {/* 글씨 검정색 강제 적용 */}
                                    <Text style={[tw`text-base font-medium`, { color: '#000000' }]}>
                                        {data.structured_formatting?.main_text || data.description}
                                    </Text>
                                    <Text style={[tw`text-xs mt-0.5`, { color: '#9CA3AF' }]}>
                                        {data.structured_formatting?.secondary_text || ''}
                                    </Text>
                                </View>
                            </View>
                        )}
                        styles={{
                            container: { flex: 0 },
                            textInputContainer: { 
                                backgroundColor: 'transparent', 
                                paddingHorizontal: 16, 
                                paddingBottom: 16 
                            },
                            textInput: { 
                                height: 50, 
                                fontSize: 18, 
                                fontWeight: 'bold',
                                backgroundColor: '#F9FAFB', 
                                borderRadius: 16,
                                paddingHorizontal: 16,
                                color: '#000000', // 입력 텍스트 검정 강제
                            },
                            listView: { 
                                position: 'absolute', 
                                top: 70, 
                                left: 0,
                                right: 0,
                                backgroundColor: 'white', 
                                borderRadius: 12,
                                elevation: 5, 
                                zIndex: 5000, 
                                shadowColor: "#000",
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.1,
                                shadowRadius: 10,
                                borderWidth: 1,
                                borderColor: '#F3F4F6',
                            },
                            row: { 
                                padding: 12, 
                                backgroundColor: 'white', 
                            },
                            separator: { 
                                height: 1, 
                                backgroundColor: '#F3F4F6' 
                            },
                            description: {
                                color: '#000000', 
                            }
                        }}
                        textInputProps={{
                            placeholderTextColor: "#9CA3AF",
                            returnKeyType: "search",
                            // ✅ [핵심 Fix] 텍스트 입력 시에는 다시 리스트가 보여야 함
                            onChangeText: (text) => {
                                setPlace(text);
                                setListViewDisplayed('auto');
                            },
                            autoCorrect: false
                        }}
                        enablePoweredByContainer={false}
                        fetchDetails={false}
                        minLength={2}
                        debounce={300}
                    />
                </View>
            </FadeInSection>
            )}

            {/* Q5: Note */}
            {step >= 5 && (
            <FadeInSection delay={100} zIndexValue={-1}>
                <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>5. 추가 전달사항 (선택)</Text>
                <View style={[tw`bg-white rounded-3xl border border-gray-200 p-1 mb-8 shadow-sm`, { zIndex: -1 }]}>
                    <RNTextInput
                    style={tw`bg-white p-5 text-lg text-gray-800 min-h-[140px] rounded-2xl`}
                    placeholder="주차, 참가비, 팀 실력 등 상대팀이 알아야 할 내용을 자유롭게 적어주세요."
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
                {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-extrabold text-xl`}>매칭 등록하기</Text>}
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
                    <Text style={tw`text-white font-bold text-lg`}>시간 설정 완료</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}