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
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker'; // ✅ [New] 달력 모듈
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';

// 포지션 목록
const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '올라운더'];

export default function GuestWriteScreen() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Form States
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [targetLevel, setTargetLevel] = useState('Mid');
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('male');
  
  // ✅ [New] 날짜/시간 State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');

  // 1. 권한 체크 (팀 소속 여부 & 주장 권한)
  useEffect(() => {
      if (userLoading) return;

      const init = async () => {
          if (!user?.teamId) {
              Alert.alert("알림", "팀에 소속되어 있어야 게스트를 모집할 수 있습니다.");
              return router.back();
          }

          try {
              const teamSnap = await getDoc(doc(db, "teams", user.teamId));
              if (teamSnap.exists()) {
                  const data = teamSnap.data();
                  
                  // [Optional] 주장이 아니어도 모집 가능하게 할지 결정 필요. 일단은 주장만 가능하도록 설정.
                  if (data.captainId !== user.uid) {
                      Alert.alert("권한 없음", "팀 대표만 게스트 모집글을 작성할 수 있습니다.");
                      return router.back();
                  }

                  setTeamInfo({ id: teamSnap.id, ...data });
                  setGender(data.gender === 'female' ? 'female' : 'male');
                  setLocation(data.region || '');
                  setPageLoading(false);
              }
          } catch(e) {
              console.error(e);
              router.back();
          }
      };
      init();
  }, [user, userLoading]);

  // [Logic] Date/Time Handlers
  const onChangeDate = (event: any, date?: Date) => {
      if (Platform.OS === 'android') setShowDatePicker(false);
      if (date) setSelectedDate(date);
  };

  const onChangeTime = (event: any, time?: Date) => {
      if (Platform.OS === 'android') setShowTimePicker(false);
      if (time) setSelectedTime(time);
  };

  const getDateDisplay = () => {
      const y = selectedDate.getFullYear();
      const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
      const d = selectedDate.getDate().toString().padStart(2, '0');
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${y}.${m}.${d} (${days[selectedDate.getDay()]})`;
  };

  const getTimeDisplay = () => {
      const h = selectedTime.getHours().toString().padStart(2, '0');
      const m = selectedTime.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
  };

  // [Logic] 포지션 토글
  const togglePosition = (pos: string) => {
      if (selectedPositions.includes(pos)) {
          setSelectedPositions(prev => prev.filter(p => p !== pos));
      } else {
          setSelectedPositions(prev => [...prev, pos]);
      }
  };

  const goNext = () => {
      if (step === 1 && selectedPositions.length === 0) {
          return Alert.alert('알림', '최소 하나의 포지션을 선택해주세요.');
      }
      if (step === 2 && !location.trim()) {
          return Alert.alert('알림', '장소를 입력해주세요.');
      }
      setStep(prev => prev + 1);
  };

  const submitPost = async () => {
      setSubmitting(true);
      try {
          // 날짜 병합
          const finalDate = new Date(selectedDate);
          finalDate.setHours(selectedTime.getHours());
          finalDate.setMinutes(selectedTime.getMinutes());

          await addDoc(collection(db, "guest_posts"), {
              hostCaptainId: user!.uid,
              teamId: teamInfo.id,
              teamName: teamInfo.name,
              gender: gender,
              positions: selectedPositions.join(', '), // 배열을 문자열로 저장
              targetLevel: targetLevel,
              time: finalDate.toISOString(),
              loc: location,
              note: note,
              status: 'recruiting',
              applicants: [],
              createdAt: serverTimestamp()
          });

          const msg = "게스트 모집글이 등록되었습니다.";
          if (Platform.OS === 'web') {
              alert(msg);
              router.replace('/home');
          } else {
              Alert.alert("등록 완료", msg, [{ text: '확인', onPress: () => router.replace('/home' as any) }]);
          }

      } catch (e) {
          Alert.alert("오류", "등록 중 문제가 발생했습니다.");
      } finally {
          setSubmitting(false);
      }
  };

  if (pageLoading || !teamInfo) {
      return <View className="flex-1 bg-white justify-center items-center"><ActivityIndicator color="#4F46E5" /></View>;
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']} style={{ paddingTop: Platform.OS === 'web' ? 20 : 0 }}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => step === 1 ? router.back() : setStep(step - 1)} className="p-2 -ml-2">
              <FontAwesome5 name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900">게스트 모집 ({step}/3)</Text>
          <View className="w-8" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView contentContainerStyle={{ padding: 20 }}>
              
              {/* Step 1: 모집 정보 */}
              {step === 1 && (
                  <View className="gap-8">
                      <View>
                          <Text className="text-lg font-bold text-gray-900 mb-3">어떤 포지션을 찾으시나요?</Text>
                          <View className="flex-row flex-wrap gap-2">
                              {POSITIONS.map(pos => (
                                  <TouchableOpacity 
                                      key={pos}
                                      onPress={() => togglePosition(pos)}
                                      className={`px-4 py-3 rounded-xl border ${selectedPositions.includes(pos) ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'}`}
                                  >
                                      <Text className={`font-bold ${selectedPositions.includes(pos) ? 'text-white' : 'text-gray-500'}`}>{pos}</Text>
                                  </TouchableOpacity>
                              ))}
                          </View>
                      </View>

                      <View>
                          <Text className="text-lg font-bold text-gray-900 mb-3">희망 실력 (게스트)</Text>
                          <View className="flex-row gap-2">
                              {['High', 'Mid', 'Low'].map(l => (
                                  <TouchableOpacity 
                                    key={l}
                                    onPress={() => setTargetLevel(l)}
                                    className={`flex-1 py-3 rounded-xl items-center border ${targetLevel === l ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-gray-200'}`}
                                  >
                                      <Text className={`font-bold ${targetLevel === l ? 'text-indigo-600' : 'text-gray-500'}`}>{l === 'High' ? '상' : l === 'Mid' ? '중' : '하'}</Text>
                                  </TouchableOpacity>
                              ))}
                          </View>
                      </View>

                      <View>
                          <Text className="text-lg font-bold text-gray-900 mb-3">경기 성별</Text>
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
                  </View>
              )}

              {/* Step 2: 일시 및 장소 (개편됨) */}
              {step === 2 && (
                  <View className="gap-6">
                      <View>
                          <Text className="text-lg font-bold text-gray-900 mb-3">언제 경기하나요?</Text>
                          <View className="flex-row gap-3">
                              {/* 날짜 */}
                              <View className="flex-1">
                                  <Text className="text-xs text-gray-500 mb-1 ml-1">날짜</Text>
                                  {Platform.OS === 'web' ? (
                                      <View className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden h-[56px] justify-center">
                                          <DateTimePicker value={selectedDate} mode="date" onChange={onChangeDate} style={{ width: '100%', height: '100%', opacity: 1 }} />
                                      </View>
                                  ) : (
                                      <TouchableOpacity onPress={() => setShowDatePicker(true)} className="bg-gray-50 p-4 rounded-xl border border-gray-200 items-center justify-center h-[56px]">
                                          <Text className="text-lg font-bold text-gray-900">{getDateDisplay()}</Text>
                                      </TouchableOpacity>
                                  )}
                              </View>
                              {/* 시간 */}
                              <View className="flex-1">
                                  <Text className="text-xs text-gray-500 mb-1 ml-1">시간</Text>
                                  {Platform.OS === 'web' ? (
                                      <View className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden h-[56px] justify-center">
                                          <DateTimePicker value={selectedTime} mode="time" onChange={onChangeTime} style={{ width: '100%', height: '100%' }} />
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
                      </View>
                  </View>
              )}

              {/* Step 3: 상세 내용 */}
              {step === 3 && (
                  <View className="gap-6">
                      <View>
                          <Text className="text-lg font-bold text-gray-900 mb-3">상세 내용 (비고)</Text>
                          <TextInput 
                              className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base min-h-[150px]"
                              placeholder={`게스트에게 전할 말을 자유롭게 적어주세요.\n\n예시)\n- 참가비 없음\n- 즐겁게 운동하실 분 환영합니다!`}
                              multiline
                              textAlignVertical="top"
                              value={note}
                              onChangeText={setNote}
                          />
                      </View>
                  </View>
              )}
          </ScrollView>

          {/* Footer Button */}
          <View className="p-5 border-t border-gray-100 bg-white">
              <TouchableOpacity 
                  onPress={step < 3 ? goNext : submitPost}
                  disabled={submitting}
                  className={`w-full py-4 rounded-xl items-center ${submitting ? 'bg-gray-400' : 'bg-gray-900'}`}
              >
                  {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{step < 3 ? '다음' : '모집 시작하기'}</Text>}
              </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>

      {/* --- Modals for Mobile --- */}
      {Platform.OS !== 'web' && (
          <>
              {Platform.OS === 'ios' && (
                  <Modal visible={showDatePicker} transparent animationType="fade">
                      <View className="flex-1 bg-black/40 justify-end">
                          <View className="bg-white p-4 rounded-t-2xl pb-8">
                              <View className="flex-row justify-between mb-4 border-b border-gray-100 pb-2"><Text className="text-lg font-bold">날짜 선택</Text><TouchableOpacity onPress={() => setShowDatePicker(false)}><Text className="text-blue-600 font-bold">완료</Text></TouchableOpacity></View>
                              <DateTimePicker value={selectedDate} mode="date" display="inline" onChange={onChangeDate} locale="ko-KR" />
                          </View>
                      </View>
                  </Modal>
              )}
              {Platform.OS === 'android' && showDatePicker && <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onChangeDate} />}
              
              {Platform.OS === 'ios' && (
                  <Modal visible={showTimePicker} transparent animationType="fade">
                      <View className="flex-1 bg-black/40 justify-end">
                          <View className="bg-white p-4 rounded-t-2xl pb-8">
                              <View className="flex-row justify-between mb-4 border-b border-gray-100 pb-2"><Text className="text-lg font-bold">시간 선택</Text><TouchableOpacity onPress={() => setShowTimePicker(false)}><Text className="text-blue-600 font-bold">완료</Text></TouchableOpacity></View>
                              <DateTimePicker value={selectedTime} mode="time" display="spinner" onChange={onChangeTime} locale="ko-KR" />
                          </View>
                      </View>
                  </Modal>
              )}
              {Platform.OS === 'android' && showTimePicker && <DateTimePicker value={selectedTime} mode="time" display="default" onChange={onChangeTime} />}
          </>
      )}
    </SafeAreaView>
  );
}