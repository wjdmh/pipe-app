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
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
// 👇 [Path Check] app/match/write.tsx -> ../../configs (2단계 위)
import { db } from '../../configs/firebaseConfig';
// 👇 [Path Check] app/match/write.tsx -> ../context (1단계 위)
import { useUser } from '../context/UserContext';

export default function MatchWriteScreen() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  
  const [step, setStep] = useState(1); // 1: 기본정보, 2: 일시/장소, 3: 상세정보
  const [submitting, setSubmitting] = useState(false);
  const [teamInfo, setTeamInfo] = useState<any>(null);

  // Form State
  const [matchType, setMatchType] = useState<'6man' | '9man'>('6man');
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('male');
  const [level, setLevel] = useState<'High' | 'Mid' | 'Low'>('Mid');
  
  const [dateStr, setDateStr] = useState(''); // YYYY.MM.DD
  const [timeStr, setTimeStr] = useState(''); // HH:MM
  const [location, setLocation] = useState('');
  
  const [description, setDescription] = useState(''); // 비고 (참가비, 주차 등)

  // 1. 권한 및 팀 정보 체크
  useEffect(() => {
    if (userLoading) return;

    if (!user) {
        Alert.alert("알림", "로그인이 필요합니다.");
        return router.replace('/auth/login' as any);
    }
    
    if (!user.teamId) {
        Alert.alert("알림", "팀에 소속되어 있어야 매치를 생성할 수 있습니다.");
        return router.back();
    }

    // 팀 정보(이름 등) 가져오기
    const fetchMyTeam = async () => {
        try {
            const teamSnap = await getDoc(doc(db, "teams", user.teamId!));
            if (teamSnap.exists()) {
                const data = teamSnap.data();
                if (data.captainId !== user.uid) {
                    Alert.alert("권한 없음", "팀 대표(리더)만 매치를 개설할 수 있습니다.");
                    return router.back();
                }
                setTeamInfo({ id: teamSnap.id, ...data });
                // 기본값 설정
                setGender(data.gender === 'female' ? 'female' : 'male'); 
                setLocation(data.region || '');
            } else {
                Alert.alert("오류", "팀 정보를 찾을 수 없습니다.");
                router.back();
            }
        } catch (e) {
            console.error(e);
        }
    };
    fetchMyTeam();
  }, [user, userLoading]);

  // 2. 날짜 유효성 검사 및 포맷팅 (YYYY.MM.DD)
  const handleDateChange = (text: string) => {
    // 숫자만 입력받아서 포맷팅
    const numbers = text.replace(/[^0-9]/g, '');
    let formatted = numbers;
    if (numbers.length > 4) {
        formatted = numbers.substr(0, 4) + '.' + numbers.substr(4);
    }
    if (numbers.length > 6) {
        formatted = formatted.substr(0, 7) + '.' + numbers.substr(6);
    }
    if (numbers.length > 8) {
        formatted = formatted.substr(0, 10);
    }
    setDateStr(formatted);
  };

  // 3. 시간 유효성 검사 및 포맷팅 (HH:MM)
  const handleTimeChange = (text: string) => {
    const numbers = text.replace(/[^0-9]/g, '');
    let formatted = numbers;
    if (numbers.length > 2) {
        formatted = numbers.substr(0, 2) + ':' + numbers.substr(2);
    }
    if (numbers.length > 4) {
        formatted = formatted.substr(0, 5);
    }
    setTimeStr(formatted);
  };

  const goNext = () => {
    if (step === 2) {
        if (dateStr.length < 10 || timeStr.length < 5 || !location) {
            return Alert.alert("입력 확인", "날짜, 시간, 장소를 정확히 입력해주세요.");
        }
    }
    setStep(prev => prev + 1);
  };

  const submitMatch = async () => {
    if (!description.trim()) {
        return Alert.alert("입력 확인", "참가비, 주차 등 필수 정보를 입력해주세요.");
    }

    // 날짜 스트링을 ISO 포맷으로 변환 (정렬용)
    const [year, month, day] = dateStr.split('.').map(Number);
    const [hour, min] = timeStr.split(':').map(Number);
    const matchDate = new Date(year, month - 1, day, hour, min);
    
    if (isNaN(matchDate.getTime())) {
        return Alert.alert("오류", "날짜 형식이 올바르지 않습니다.");
    }

    setSubmitting(true);
    try {
        await addDoc(collection(db, "matches"), {
            teamId: teamInfo.id,
            teamName: teamInfo.name,
            writerId: user!.uid,
            type: matchType,
            gender: gender,
            level: level,
            time: matchDate.toISOString(), // ISO String for Query
            timeDisplay: `${dateStr} ${timeStr}`, // Display String
            loc: location,
            description: description,
            status: 'recruiting', // 모집중
            approvalRequired: true, // 승인제 강제
            createdAt: serverTimestamp(),
            applicants: [] // 신청자 목록 초기화
        });

        Alert.alert("등록 완료", "매치가 성공적으로 등록되었습니다.", [
            { text: "확인", onPress: () => router.replace('/home' as any) }
        ]);
    } catch (e) {
        console.error("Match Create Error:", e);
        Alert.alert("등록 실패", "매치 등록 중 오류가 발생했습니다.");
    } finally {
        setSubmitting(false);
    }
  };

  if (userLoading || !teamInfo) {
    return <View className="flex-1 bg-white justify-center items-center"><ActivityIndicator color="#4F46E5" /></View>;
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        {/* Header */}
        <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between">
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
                
                {/* --- Step 1: 기본 정보 --- */}
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

                {/* --- Step 2: 일시 및 장소 --- */}
                {step === 2 && (
                    <View className="gap-6">
                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">언제 경기하나요?</Text>
                            <View className="flex-row gap-3">
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-500 mb-1 ml-1">날짜 (YYYY.MM.DD)</Text>
                                    <TextInput 
                                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-lg font-bold text-center"
                                        placeholder="2024.01.01"
                                        keyboardType="number-pad"
                                        maxLength={10}
                                        value={dateStr}
                                        onChangeText={handleDateChange}
                                    />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-xs text-gray-500 mb-1 ml-1">시간 (HH:MM)</Text>
                                    <TextInput 
                                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-lg font-bold text-center"
                                        placeholder="14:00"
                                        keyboardType="number-pad"
                                        maxLength={5}
                                        value={timeStr}
                                        onChangeText={handleTimeChange}
                                    />
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
                            <Text className="text-xs text-gray-400 mt-2 ml-1">
                                * 상세한 주소를 적어주시면 상대팀에게 도움이 됩니다.
                            </Text>
                        </View>
                    </View>
                )}

                {/* --- Step 3: 상세 정보 --- */}
                {step === 3 && (
                    <View className="gap-6">
                        <View className="bg-blue-50 p-4 rounded-xl flex-row items-start">
                            <FontAwesome5 name="info-circle" size={16} color="#2563EB" style={{ marginTop: 2, marginRight: 8 }} />
                            <Text className="text-blue-700 text-sm font-medium leading-5 flex-1">
                                매치 신청이 들어오면 <Text className="font-bold">팀장이 직접 승인</Text>해야 매칭이 확정됩니다. 꼼꼼하게 작성해주세요!
                            </Text>
                        </View>

                        <View>
                            <Text className="text-lg font-bold text-gray-900 mb-3">필수 공지 (비고)</Text>
                            <TextInput 
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base min-h-[150px]"
                                placeholder={`참가비, 주차 정보, 준비물 등\n상대팀이 꼭 알아야 할 내용을 적어주세요.\n\n예시)\n- 참가비: 팀당 5만원\n- 주차: 체육관 지하주차장 이용 가능`}
                                multiline
                                textAlignVertical="top"
                                value={description}
                                onChangeText={setDescription}
                            />
                        </View>
                    </View>
                )}

            </ScrollView>

            {/* Footer Button */}
            <View className="p-5 border-t border-gray-100 bg-white">
                <TouchableOpacity 
                    onPress={step < 3 ? goNext : submitMatch}
                    disabled={submitting}
                    className={`w-full py-4 rounded-xl items-center shadow-sm active:scale-95 ${submitting ? 'bg-gray-400' : 'bg-gray-900'}`}
                >
                    {submitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-bold text-lg">
                            {step < 3 ? '다음' : '매치 등록하기'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}