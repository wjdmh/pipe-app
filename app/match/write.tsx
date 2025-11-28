import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Animated, Dimensions, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import tw from 'twrnc';

const { width } = Dimensions.get('window');

const FadeInView = ({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 600, delay, useNativeDriver: true })
    ]).start();
  }, []);

  return <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }], marginBottom: 32 }}>{children}</Animated.View>;
};

const SelectCard = ({ label, subLabel, icon, selected, onPress }: { label: string, subLabel?: string, icon: string, selected: boolean, onPress: () => void }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={tw`flex-1 p-5 rounded-3xl border bg-white shadow-sm items-center justify-center ${selected ? 'border-[#3182F6] bg-[#F3F8FF]' : 'border-transparent'}`}
  >
    <View style={tw`w-12 h-12 rounded-full items-center justify-center mb-3 ${selected ? 'bg-[#3182F6]' : 'bg-[#F2F4F6]'}`}>
        <FontAwesome5 name={icon} size={20} color={selected ? 'white' : '#8B95A1'} />
    </View>
    <Text style={tw`text-lg font-bold ${selected ? 'text-[#3182F6]' : 'text-[#333D4B]'}`}>{label}</Text>
    {subLabel && <Text style={tw`text-xs text-[#8B95A1] mt-1`}>{subLabel}</Text>}
  </TouchableOpacity>
);

export default function WriteMatchScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [type, setType] = useState<'6man' | '9man' | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | 'mixed' | null>(null);
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  const nextStep = (next: number) => {
    if (step < next) {
        setStep(next);
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 300);
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
    if (!type || !gender || !place) return Alert.alert('잠시만요', '아직 입력하지 않은 정보가 있어요.');

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

      const dbTimeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      await addDoc(collection(db, "matches"), {
        hostId: userData.teamId,
        team: teamData?.name || 'Unknown Team',
        affiliation: teamData?.affiliation || '',
        type,
        gender,
        time: dbTimeStr,
        timestamp: date.toISOString(),
        loc: place,
        note: note || '',
        status: 'recruiting',
        createdAt: new Date().toISOString(),
        applicants: [],
        level: teamData?.level || 'B'
      });

      Alert.alert('등록 완료 🎉', '새로운 매칭을 만들었어요. 곧 좋은 상대를 찾아드릴게요!', [
        { text: '확인', onPress: () => router.back() }
      ]);

    } catch (error: any) {
      Alert.alert('오류', '문제가 생겼어요. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-[#F9FAFB]`}>
      <View style={tw`px-5 h-14 flex-row items-center justify-between bg-[#F9FAFB] z-10`}>
        <TouchableOpacity onPress={() => router.back()} style={tw`p-2 -ml-2 rounded-full active:bg-gray-200`}>
          <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
        </TouchableOpacity>
        <View style={tw`w-8`} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
        keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={tw`px-6 pt-2 pb-32`}
          showsVerticalScrollIndicator={false}
        >
          <View style={tw`mb-8`}>
            <Text style={tw`text-3xl font-extrabold text-[#191F28] leading-tight`}>
              새로운 매칭을{'\n'}시작해볼까요?
            </Text>
          </View>

          {/* Step 1: Type (UX 라이팅 수정) */}
          <FadeInView>
            <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>1. 몇 인제 경기를 원하시나요?</Text>
            <View style={tw`flex-row gap-3`}>
              <SelectCard 
                label="6인제" 
                subLabel="정규 룰"
                icon="volleyball-ball" 
                selected={type === '6man'} 
                onPress={() => { setType('6man'); nextStep(2); }} 
              />
              <SelectCard 
                label="9인제" 
                subLabel="생활체육"
                icon="users" 
                selected={type === '9man'} 
                onPress={() => { setType('9man'); nextStep(2); }} 
              />
            </View>
          </FadeInView>

          {/* Step 2: Gender (UX 라이팅 수정) */}
          {step >= 2 && (
            <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>2. 어떤 성별의 경기를 원하시나요?</Text>
              <View style={tw`gap-3`}>
                <TouchableOpacity
                    onPress={() => { setGender('mixed'); nextStep(3); }}
                    activeOpacity={0.7}
                    style={tw`w-full p-5 rounded-2xl bg-white border flex-row items-center shadow-sm ${gender === 'mixed' ? 'border-[#3182F6] bg-[#F3F8FF]' : 'border-transparent'}`}
                >
                    <View style={tw`w-10 h-10 rounded-full items-center justify-center mr-4 ${gender === 'mixed' ? 'bg-[#3182F6]' : 'bg-[#F2F4F6]'}`}>
                        <FontAwesome5 name="restroom" size={16} color={gender === 'mixed' ? 'white' : '#8B95A1'} />
                    </View>
                    <View>
                        <Text style={tw`text-lg font-bold ${gender === 'mixed' ? 'text-[#3182F6]' : 'text-[#333D4B]'}`}>혼성 (Mixed)</Text>
                        <Text style={tw`text-xs text-[#8B95A1]`}>남녀 선수가 함께 뛰어요</Text>
                    </View>
                </TouchableOpacity>

                <View style={tw`flex-row gap-3`}>
                    <SelectCard label="남자부" icon="male" selected={gender === 'male'} onPress={() => { setGender('male'); nextStep(3); }} />
                    <SelectCard label="여자부" icon="female" selected={gender === 'female'} onPress={() => { setGender('female'); nextStep(3); }} />
                </View>
              </View>
            </FadeInView>
          )}

          {/* Step 3: Date & Time */}
          {step >= 3 && (
            <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>3. 언제 모일까요?</Text>
              <TouchableOpacity 
                onPress={() => {
                    setTempDate(date);
                    setShowDateModal(true);
                }}
                style={tw`bg-white p-5 rounded-2xl border border-transparent shadow-sm active:bg-gray-50`}
              >
                <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-[#8B95A1] font-medium`}>경기 날짜와 시간</Text>
                    <FontAwesome5 name="chevron-right" size={12} color="#B0B8C1" />
                </View>
                <Text style={tw`text-2xl font-bold text-[#3182F6]`}>
                    {formatDateKr(date)} {formatTimeKr(date)}
                </Text>
              </TouchableOpacity>
            </FadeInView>
          )}

          {/* Step 4: Location (UX 라이팅 및 힌트 수정) */}
          {step >= 4 && (
            <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>4. 어디서 할까요?</Text>
              <View style={tw`bg-white rounded-2xl border border-transparent shadow-sm overflow-hidden`}>
                  <TextInput
                    style={tw`p-5 text-lg text-[#191F28]`}
                    placeholder="예: 한신대학교 체육관"
                    placeholderTextColor="#B0B8C1"
                    value={place}
                    onChangeText={setPlace}
                    returnKeyType="next"
                    onSubmitEditing={() => nextStep(5)}
                  />
                  <View style={tw`px-5 pb-4 bg-gray-50`}>
                      <Text style={tw`text-xs text-[#8B95A1] leading-5`}>
                        * 상세주소를 입력하면 매칭 확률이 올라가요.{'\n'}
                        위치를 쉽게 찾을 수 있게 정확히 알려주세요!
                      </Text>
                  </View>
              </View>
            </FadeInView>
          )}

          {/* Step 5: Note */}
          {step >= 5 && (
            <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>5. 전할 말이 있나요? (선택)</Text>
              <View style={tw`bg-white rounded-2xl border border-transparent shadow-sm mb-8`}>
                  <TextInput
                    style={tw`p-5 text-lg text-[#191F28] min-h-[100px]`}
                    placeholder="주차 정보, 비용, 실력 등 하고 싶은 말을 자유롭게 적어주세요."
                    placeholderTextColor="#B0B8C1"
                    multiline
                    textAlignVertical="top"
                    value={note}
                    onChangeText={setNote}
                  />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                style={tw`w-full bg-[#3182F6] py-5 rounded-2xl items-center shadow-md shadow-blue-200 active:scale-95`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={tw`text-white font-bold text-xl`}>매칭 등록 완료</Text>
                )}
              </TouchableOpacity>
            </FadeInView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showDateModal} transparent animationType="fade">
        <View style={tw`flex-1 justify-end bg-black/60`}>
            <View style={tw`bg-white rounded-t-3xl p-6 pb-10`}>
                <View style={tw`flex-row justify-between items-center mb-6`}>
                    <Text style={tw`text-xl font-bold text-[#191F28]`}>시간 선택</Text>
                    <TouchableOpacity onPress={() => setShowDateModal(false)}>
                        <Text style={tw`text-[#8B95A1] font-bold`}>취소</Text>
                    </TouchableOpacity>
                </View>
                <DateTimePicker
                    value={tempDate}
                    mode="datetime"
                    display="spinner"
                    onChange={(e, d) => d && setTempDate(d)}
                    textColor="#191F28"
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
                    style={tw`mt-6 bg-[#3182F6] py-4 rounded-xl items-center`}
                >
                    <Text style={tw`text-white font-bold text-lg`}>확인</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}