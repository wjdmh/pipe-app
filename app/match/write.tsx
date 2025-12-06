import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput as RNTextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Animated, Modal, TouchableWithoutFeedback } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import tw from 'twrnc';

// ✅ 사용자 API 키 (유지)
const GOOGLE_API_KEY = "AIzaSyDzsmyPhhVTB64k_P4aJjYBVUpuMPJZA_Q";

// [Animation Component] 부드러운 등장을 위한 컴포넌트
const FadeInSection = ({ children, delay = 0, visible = true }: { children: React.ReactNode, delay?: number, visible?: boolean }) => {
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
  // zIndex를 설정하여 드롭다운이 잘리지 않도록 함
  return <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }], marginBottom: 40, zIndex: 10 }}>{children}</Animated.View>;
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

  // [UX] 단계 자동 스크롤 함수 (진동 제거됨)
  const nextStep = (next: number) => {
    if (step < next) {
        setStep(next);
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 400);
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={tw`px-6 pt-6 pb-40`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title Area */}
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

          {/* Q4: Location (UI 개선: 리스트 잘림 해결) */}
          {step >= 4 && (
            <FadeInSection delay={100}>
              <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>4. 경기 장소</Text>
              
              {/* overflow-hidden 제거 및 zIndex 상향 조정 */}
              <View style={[tw`bg-white rounded-3xl shadow-sm border border-gray-200 min-h-[120px]`, { zIndex: 100 }]}>
                  {/* 검색 아이콘이 포함된 헤더 느낌 */}
                  <View style={tw`flex-row items-center px-4 pt-4 pb-2`}>
                      <FontAwesome5 name="search" size={16} color="#4F46E5" style={tw`mr-3`} />
                      <Text style={tw`text-gray-400 font-bold text-xs`}>장소 검색 (키워드 입력)</Text>
                  </View>

                  <GooglePlacesAutocomplete
                    placeholder='예: 한신대학교 체육관'
                    onPress={(data, details = null) => {
                      setPlace(data.description);
                      nextStep(5);
                    }}
                    query={{
                      key: GOOGLE_API_KEY,
                      language: 'ko',
                      components: 'country:kr',
                    }}
                    renderRow={(data) => (
                        <View style={tw`flex-row items-center py-2`}>
                            <View style={tw`w-8 h-8 rounded-full bg-gray-50 items-center justify-center mr-3`}>
                                <FontAwesome5 name="map-marker-alt" size={14} color="#64748b" />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`text-base font-medium text-gray-800`}>{data.structured_formatting?.main_text || data.description}</Text>
                                <Text style={tw`text-xs text-gray-400`}>{data.structured_formatting?.secondary_text || ''}</Text>
                            </View>
                        </View>
                    )}
                    styles={{
                      textInputContainer: { backgroundColor: 'transparent', paddingHorizontal: 16, paddingBottom: 16 },
                      textInput: { 
                          height: 50, 
                          color: '#111827', 
                          fontSize: 18, 
                          fontWeight: 'bold',
                          backgroundColor: '#F9FAFB', 
                          borderRadius: 16,
                          paddingHorizontal: 16,
                      },
                      listView: { 
                          backgroundColor: 'white', 
                          marginHorizontal: 16,
                          borderRadius: 12, // 리스트 자체도 둥글게
                          elevation: 5, // 안드로이드 그림자
                          shadowColor: "#000", // iOS 그림자
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.1,
                          shadowRadius: 4,
                          marginBottom: 10,
                      },
                      row: { padding: 10, marginBottom: 0 },
                      separator: { height: 1, backgroundColor: '#F3F4F6' },
                    }}
                    textInputProps={{
                        placeholderTextColor: "#9CA3AF",
                        returnKeyType: "search",
                        onChangeText: (text) => setPlace(text),
                        autoCorrect: false
                    }}
                    enablePoweredByContainer={false}
                    fetchDetails={false}
                    minLength={2}
                    debounce={400}
                  />
              </View>
            </FadeInSection>
          )}

          {/* Q5: Note */}
          {step >= 5 && (
            <FadeInSection delay={100}>
              <Text style={tw`text-lg font-bold text-gray-800 mb-4`}>5. 추가 전달사항 (선택)</Text>
              <View style={tw`bg-white rounded-3xl border border-gray-200 p-1 mb-8 shadow-sm`}>
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
                style={tw`w-full bg-[#4F46E5] py-5 rounded-3xl items-center shadow-lg shadow-indigo-200 active:scale-95`}
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