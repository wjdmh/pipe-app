import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  BackHandler
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';

export default function MatchWriteScreen() {
  const router = useRouter();
  const navigation = useNavigation(); // 네비게이션 제어를 위한 Hook 추가
  const { user, loading: userLoading } = useUser();
  
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Form State
  const [matchType, setMatchType] = useState<'6man' | '9man'>('6man');
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('male');
  const [level, setLevel] = useState<'High' | 'Mid' | 'Low'>('Mid');
  
  // 날짜/시간 State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  
  // Picker Visibility State (Mobile Only)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  // 1. 권한 및 팀 정보 체크
  useEffect(() => {
    if (userLoading) return;

    const init = async () => {
        if (!user) {
            Alert.alert("알림", "로그인이 필요합니다.");
            return router.replace('/auth/login' as any);
        }
        
        if (!user.teamId) {
            Alert.alert("알림", "팀에 소속되어 있어야 매치를 생성할 수 있습니다.");
            return router.back();
        }

        try {
            const teamSnap = await getDoc(doc(db, "teams", user.teamId));
            if (teamSnap.exists()) {
                const data = teamSnap.data();
                if (data.captainId !== user.uid) {
                    Alert.alert("권한 없음", "팀 대표(리더)만 매치를 개설할 수 있습니다.");
                    return router.back();
                }

                setTeamInfo({ id: teamSnap.id, ...data });
                setGender(data.gender === 'female' ? 'female' : 'male'); 
                setLocation(data.region || '');
                setPageLoading(false);
            } else {
                Alert.alert("오류", "팀 정보를 찾을 수 없습니다.");
                router.back();
            }
        } catch (e) {
            console.error(e);
            Alert.alert("오류", "팀 정보를 불러오는 중 문제가 발생했습니다.");
            router.back();
        }
    };

    init();
  }, [user, userLoading]);

  // ✅ [NEW] 뒤로가기 방지 (이탈 방지) 로직
  useEffect(() => {
      const beforeRemoveListener = navigation.addListener('beforeRemove', (e) => {
          // 이미 제출 중이거나, 작성을 완료해서 이동하는 경우(submitting이 true일 땐 막지 않음 - 근데 여기선 router.replace로 이동하므로 별도 처리 필요)
          // 여기서는 '작성 중'인지 판단
          const hasUnsavedChanges = step > 1 || location.length > 0 || description.length > 0;
          
          if (!hasUnsavedChanges || submitting) {
              return; // 변경사항이 없거나 제출 완료 후 이동이면 그냥 통과
          }

          // 기본 뒤로가기 동작을 막음
          e.preventDefault();

          // 경고창 표시
          Alert.alert(
              '작성 중인 내용이 있습니다',
              '정말 나가시겠습니까?\n작성하신 내용은 저장되지 않습니다.',
              [
                  { text: '계속 작성', style: 'cancel', onPress: () => {} },
                  { 
                      text: '나가기', 
                      style: 'destructive', 
                      onPress: () => navigation.dispatch(e.data.action) // 원래 하려던 이동 수행
                  },
              ]
          );
      });

      return beforeRemoveListener;
  }, [navigation, step, location, description, submitting]);


  // [Logic] DatePicker 핸들러 (Mobile)
  const onChangeDateMobile = (event: any, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  // [Logic] TimePicker 핸들러 (Mobile)
  const onChangeTimeMobile = (event: any, time?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (time) setSelectedTime(time);
  };

  // [Logic] Web Input Handlers
  const onChangeDateWeb = (e: any) => {
      const val = e.target.value; 
      if (!val) return;
      const newDate = new Date(val);
      setSelectedDate(newDate);
  };
  
  const onChangeTimeWeb = (e: any) => {
      const val = e.target.value; 
      if (!val) return;
      const [h, m] = val.split(':').map(Number);
      const newTime = new Date();
      newTime.setHours(h);
      newTime.setMinutes(m);
      setSelectedTime(newTime);
  };

  const getDateDisplay = () => {
      const y = selectedDate.getFullYear();
      const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
      const d = selectedDate.getDate().toString().padStart(2, '0');
      const dayName = ['일', '월', '화', '수', '목', '금', '토'][selectedDate.getDay()];
      return `${y}.${m}.${d} (${dayName})`;
  };

  const getTimeDisplay = () => {
      const h = selectedTime.getHours().toString().padStart(2, '0');
      const m = selectedTime.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
  };

  const getWebDateValue = () => {
      const y = selectedDate.getFullYear();
      const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
      const d = selectedDate.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
  };

  const getWebTimeValue = () => {
      const h = selectedTime.getHours().toString().padStart(2, '0');
      const m = selectedTime.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
  };

  const goNext = () => {
    if (step === 2) {
        if (!location.trim()) {
            return Alert.alert("입력 확인", "장소를 입력해주세요.");
        }
    }
    setStep(prev => prev + 1);
  };

  const submitMatch = async () => {
    if (!description.trim()) {
        return Alert.alert("입력 확인", "참가비, 주차 등 필수 정보를 입력해주세요.");
    }

    const finalDate = new Date(selectedDate);
    finalDate.setHours(selectedTime.getHours());
    finalDate.setMinutes(selectedTime.getMinutes());
    
    setSubmitting(true); // 제출 시작 -> 이탈 방지 로직에서 예외 처리됨
    try {
        await addDoc(collection(db, "matches"), {
            teamId: teamInfo.id,
            teamName: teamInfo.name,
            writerId: user!.uid,
            type: matchType,
            gender: gender,
            level: level,
            time: finalDate.toISOString(), 
            timeDisplay: `${getDateDisplay()} ${getTimeDisplay()}`, 
            loc: location,
            description: description,
            status: 'recruiting',
            approvalRequired: true,
            createdAt: serverTimestamp(),
            applicants: []
        });

        const successMsg = "매치가 성공적으로 등록되었습니다.";
        if (Platform.OS === 'web') {
            window.alert(successMsg);
            router.replace('/home');
        } else {
            Alert.alert("등록 완료", successMsg, [
                { text: "확인", onPress: () => router.replace('/home' as any) }
            ]);
        }
    } catch (e) {
        console.error("Match Create Error:", e);
        Alert.alert("등록 실패", "매치 등록 중 오류가 발생했습니다.");
        setSubmitting(false); // 실패 시 다시 작성 모드로 복귀
    }
  };

  if (userLoading || pageLoading || !teamInfo) {
    return <View className="flex-1 bg-white justify-center items-center"><ActivityIndicator size="large" color="#4F46E5" /></View>;
  }

  return (
    <SafeAreaView 
        className="flex-1 bg-white" 
        edges={['top']}
        style={{ paddingTop: Platform.OS === 'web' ? 20 : 0 }}
    >
        {/* Header */}
        <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between">
            {/* 헤더의 뒤로가기 버튼도 navigation.goBack()을 호출하므로 beforeRemove가 작동함 */}
            <TouchableOpacity onPress={() => step === 1 ? router.back() : setStep(step - 1)} className="p-2 -ml-2">
                <FontAwesome5 name="arrow-left" size={20} color="#111827" />
            </TouchableOpacity>
            <Text className="text-lg font-bold text-gray-900">
                매치 개설 ({step}/3)
            </Text>
            <View className="w-8" />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                {/* Step 1 */}
                {step === 1 && (
                    <View className="gap-8">
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">어떤 경기를 하시나요?</Text>
                            <View className="flex-row gap-3">
                                <TouchableOpacity onPress={() => setMatchType('6man')} className={`flex-1 py-4 rounded-xl items-center border ${matchType === '6man' ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}>
                                    <Text className={`font-bold ${matchType === '6man' ? 'text-white' : 'text-gray-500'}`}>6인제</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setMatchType('9man')} className={`flex-1 py-4 rounded-xl items-center border ${matchType === '9man' ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}>
                                    <Text className={`font-bold ${matchType === '9man' ? 'text-white' : 'text-gray-500'}`}>9인제</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">성별을 선택해주세요</Text>
                            <View className="flex-row gap-2">
                                {['male', 'female', 'mixed'].map((g) => (
                                    <TouchableOpacity 
                                        key={g} 
                                        onPress={() => setGender(g as any)}
                                        className={`flex-1 py-3 rounded-xl items-center border ${gender === g ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`font-bold ${gender === g ? 'text-indigo-600' : 'text-gray-500'}`}>
                                            {g === 'male' ? '남자부' : g === 'female' ? '여자부' : '혼성'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">모집 레벨</Text>
                            <View className="flex-row gap-2">
                                {['High', 'Mid', 'Low'].map((l) => (
                                    <TouchableOpacity 
                                        key={l} 
                                        onPress={() => setLevel(l as any)}
                                        className={`flex-1 py-3 rounded-xl items-center border ${level === l ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={`font-bold ${level === l ? 'text-indigo-600' : 'text-gray-500'}`}>
                                            {l === 'High' ? '상' : l === 'Mid' ? '중' : '하'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                )}

                {/* Step 2 */}
                {step === 2 && (
                    <View className="gap-6">
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">언제 경기하나요?</Text>
                            <View className="flex-row gap-3">
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-500 mb-1 ml-1">날짜</Text>
                                    {Platform.OS === 'web' ? (
                                        <View className="bg-gray-50 rounded-xl border border-gray-200 h-[56px] justify-center px-2">
                                            {/* @ts-ignore */}
                                            <input type="date" value={getWebDateValue()} onChange={onChangeDateWeb} style={{ border: 'none', background: 'transparent', width: '100%', height: '100%', fontSize: '16px', fontFamily: 'inherit', fontWeight: 'bold' }} />
                                        </View>
                                    ) : (
                                        <TouchableOpacity onPress={() => setShowDatePicker(true)} className="bg-gray-50 p-4 rounded-xl border border-gray-200 items-center justify-center h-[56px]">
                                            <Text className="text-lg font-bold text-gray-900">{getDateDisplay()}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-500 mb-1 ml-1">시간</Text>
                                    {Platform.OS === 'web' ? (
                                        <View className="bg-gray-50 rounded-xl border border-gray-200 h-[56px] justify-center px-2">
                                            {/* @ts-ignore */}
                                            <input type="time" value={getWebTimeValue()} onChange={onChangeTimeWeb} style={{ border: 'none', background: 'transparent', width: '100%', height: '100%', fontSize: '16px', fontFamily: 'inherit', fontWeight: 'bold' }} />
                                        </View>
                                    ) : (
                                        <TouchableOpacity onPress={() => setShowTimePicker(true)} className="bg-gray-50 p-4 rounded-xl border border-gray-200 items-center justify-center h-[56px]">
                                            <Text className="text-lg font-bold text-gray-900">{getTimeDisplay()}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        </View>
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">어디서 하나요?</Text>
                            <TextInput 
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base"
                                placeholder="체육관 이름 또는 주소를 입력하세요"
                                value={location}
                                onChangeText={setLocation}
                            />
                            <Text className="text-xs text-gray-400 mt-2 ml-1">* 상세한 주소를 적어주시면 상대팀에게 도움이 됩니다.</Text>
                        </View>
                    </View>
                )}

                {/* Step 3 */}
                {step === 3 && (
                    <View className="gap-6">
                        <View className="bg-blue-50 p-4 rounded-xl flex-row items-start">
                            <FontAwesome5 name="info-circle" size={16} color="#2563EB" style={{ marginTop: 2, marginRight: 8 }} />
                            <Text className="text-blue-700 text-sm font-medium leading-5 flex-1">
                                매치 신청이 들어오면 <Text className="font-bold">팀장이 직접 승인</Text>해야 매칭이 확정됩니다.
                            </Text>
                        </View>
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">필수 공지 (비고)</Text>
                            <TextInput 
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base min-h-[150px]"
                                placeholder={`참가비, 주차 정보, 준비물 등\n상대팀이 꼭 알아야 할 내용을 적어주세요.`}
                                multiline
                                textAlignVertical="top"
                                value={description}
                                onChangeText={setDescription}
                            />
                        </View>
                    </View>
                )}
            </ScrollView>

            <View className="p-5 border-t border-gray-100 bg-white">
                <TouchableOpacity 
                    onPress={step < 3 ? goNext : submitMatch}
                    disabled={submitting}
                    className={`w-full py-4 rounded-xl items-center shadow-sm active:scale-95 ${submitting ? 'bg-gray-400' : 'bg-gray-900'}`}
                >
                    {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{step < 3 ? '다음' : '매치 등록하기'}</Text>}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>

        {Platform.OS !== 'web' && (
            <>
                {Platform.OS === 'ios' && (
                    <Modal visible={showDatePicker} transparent animationType="fade">
                        <View className="flex-1 bg-black/40 justify-end">
                            <View className="bg-white p-4 rounded-t-2xl pb-8">
                                <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-2"><Text className="text-lg font-bold text-gray-900">날짜 선택</Text><TouchableOpacity onPress={() => setShowDatePicker(false)}><Text className="text-blue-600 font-bold text-lg">완료</Text></TouchableOpacity></View>
                                <DateTimePicker value={selectedDate} mode="date" display="inline" onChange={onChangeDateMobile} locale="ko-KR" />
                            </View>
                        </View>
                    </Modal>
                )}
                {Platform.OS === 'android' && showDatePicker && <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onChangeDateMobile} />}
                {Platform.OS === 'ios' && (
                    <Modal visible={showTimePicker} transparent animationType="fade">
                        <View className="flex-1 bg-black/40 justify-end">
                            <View className="bg-white p-4 rounded-t-2xl pb-8">
                                <View className="flex-row justify-between items-center mb-4 border-b border-gray-100 pb-2"><Text className="text-lg font-bold text-gray-900">시간 선택</Text><TouchableOpacity onPress={() => setShowTimePicker(false)}><Text className="text-blue-600 font-bold text-lg">완료</Text></TouchableOpacity></View>
                                <DateTimePicker value={selectedTime} mode="time" display="spinner" onChange={onChangeTimeMobile} locale="ko-KR" />
                            </View>
                        </View>
                    </Modal>
                )}
                {Platform.OS === 'android' && showTimePicker && <DateTimePicker value={selectedTime} mode="time" display="default" onChange={onChangeTimeMobile} />}
            </>
        )}
    </SafeAreaView>
  );
}