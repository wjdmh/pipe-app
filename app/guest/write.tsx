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
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker'; 
import { db } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';

const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '올라운더'];

export default function GuestWriteScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, loading: userLoading } = useUser();
  
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);

  // Form States
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [targetLevel, setTargetLevel] = useState('Mid');
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('male');
  
  const [recruitmentCount, setRecruitmentCount] = useState(1);
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');

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

  // 이탈 방지
  useEffect(() => {
      const beforeRemoveListener = navigation.addListener('beforeRemove', (e) => {
          const hasUnsavedChanges = step > 1 || selectedPositions.length > 0 || location.length > 0 || note.length > 0;
          if (!hasUnsavedChanges || submitting) return;
          e.preventDefault();
          if (Platform.OS === 'web') {
              const confirm = window.confirm('작성 중인 내용이 있습니다. 정말 나가시겠습니까?');
              if (confirm) navigation.dispatch(e.data.action);
          } else {
              Alert.alert(
                  '작성 중인 내용이 있습니다',
                  '정말 나가시겠습니까?\n작성하신 내용은 저장되지 않습니다.',
                  [
                      { text: '계속 작성', style: 'cancel', onPress: () => {} },
                      { text: '나가기', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
                  ]
              );
          }
      });
      return beforeRemoveListener;
  }, [navigation, step, selectedPositions, location, note, submitting]);

  const onChangeDateMobile = (event: any, date?: Date) => {
      if (Platform.OS === 'android') setShowDatePicker(false);
      if (date) setSelectedDate(date);
  };
  const onChangeTimeMobile = (event: any, time?: Date) => {
      if (Platform.OS === 'android') setShowTimePicker(false);
      if (time) setSelectedTime(time);
  };
  
  // [Fix] 웹 날짜 처리: 단순 Date 객체 변환 시 타임존 이슈 방지
  const onChangeDateWeb = (e: any) => {
      const val = e.target.value; // "YYYY-MM-DD"
      if (!val) return;
      const [y, m, d] = val.split('-').map(Number);
      const newDate = new Date(selectedDate);
      newDate.setFullYear(y);
      newDate.setMonth(m - 1);
      newDate.setDate(d);
      setSelectedDate(newDate);
  };
  
  // [Fix] 웹 시간 처리
  const onChangeTimeWeb = (e: any) => {
      const val = e.target.value; // "HH:MM"
      if (!val) return;
      const [h, m] = val.split(':').map(Number);
      const newTime = new Date(selectedTime);
      newTime.setHours(h);
      newTime.setMinutes(m);
      setSelectedTime(newTime);
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

  const togglePosition = (pos: string) => {
      if (selectedPositions.includes(pos)) {
          setSelectedPositions(prev => prev.filter(p => p !== pos));
      } else {
          setSelectedPositions(prev => [...prev, pos]);
      }
  };

  const goNext = () => {
      if (step === 1 && selectedPositions.length === 0) {
          const msg = '최소 하나의 포지션을 선택해주세요.';
          return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('알림', msg);
      }
      if (step === 2 && !location.trim()) {
          const msg = '장소를 입력해주세요.';
          return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('알림', msg);
      }
      setStep(prev => prev + 1);
  };

  const submitPost = async () => {
      setSubmitting(true);
      try {
          const finalDate = new Date(selectedDate);
          finalDate.setHours(selectedTime.getHours());
          finalDate.setMinutes(selectedTime.getMinutes());
          
          const isoDate = finalDate.toISOString();

          await addDoc(collection(db, "guest_posts"), {
              hostCaptainId: user!.uid,
              hostTeamId: teamInfo.id, // [New] 표준 필드명
              hostTeamName: teamInfo.name, // [New] 표준 필드명
              
              teamId: teamInfo.id,     // Legacy 호환
              teamName: teamInfo.name, // Legacy 호환
              
              gender: gender,
              positions: selectedPositions, // Array 저장
              
              targetLevel: targetLevel,
              recruitmentCount: recruitmentCount, 
              
              time: isoDate,      // Legacy
              matchDate: isoDate, // [Fix] 정렬 기준 필드 추가
              
              loc: location,        // Legacy
              location: location,   // Standard
              
              note: note,
              status: 'recruiting',
              applicants: [], 
              applicantIds: [], 
              createdAt: serverTimestamp()
          });

          const msg = "게스트 모집글이 등록되었습니다.";
          if (Platform.OS === 'web') {
              window.alert(msg);
              router.replace('/home');
          } else {
              Alert.alert("등록 완료", msg, [{ text: '확인', onPress: () => router.replace('/home' as any) }]);
          }

      } catch (e) {
          console.error(e);
          const msg = "등록 중 문제가 발생했습니다.";
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert("오류", msg);
          setSubmitting(false);
      }
  };

  if (pageLoading || !teamInfo) {
      return <View className="flex-1 bg-white justify-center items-center"><ActivityIndicator color="#4F46E5" /></View>;
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']} style={{ paddingTop: Platform.OS === 'web' ? 20 : 0 }}>
      <View className="px-5 py-3 border-b border-gray-100 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => step === 1 ? router.back() : setStep(step - 1)} className="p-2 -ml-2">
              <FontAwesome5 name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-900">게스트 모집 ({step}/3)</Text>
          <View className="w-8" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView contentContainerStyle={{ padding: 20 }}>
              
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
                          <Text className="text-lg font-bold text-gray-900 mb-3">몇 명을 모집하나요?</Text>
                          <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-200 p-2 self-start">
                              <TouchableOpacity 
                                  onPress={() => setRecruitmentCount(prev => Math.max(1, prev - 1))}
                                  className="w-10 h-10 bg-white rounded-lg items-center justify-center border border-gray-200 shadow-sm"
                              >
                                  <FontAwesome5 name="minus" size={12} color="#111827" />
                              </TouchableOpacity>
                              <View className="w-16 items-center">
                                  <Text className="text-xl font-bold text-gray-900">{recruitmentCount}명</Text>
                              </View>
                              <TouchableOpacity 
                                  onPress={() => setRecruitmentCount(prev => prev + 1)}
                                  className="w-10 h-10 bg-white rounded-lg items-center justify-center border border-gray-200 shadow-sm"
                              >
                                  <FontAwesome5 name="plus" size={12} color="#111827" />
                              </TouchableOpacity>
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
                                          <input 
                                              type="date" 
                                              value={getWebDateValue()} 
                                              onChange={onChangeDateWeb} 
                                              style={{ 
                                                  border: 'none', background: 'transparent', width: '100%', height: '100%', 
                                                  fontSize: '16px', fontFamily: 'inherit', fontWeight: 'bold' 
                                              }} 
                                          />
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
                                          <input 
                                              type="time" 
                                              value={getWebTimeValue()} 
                                              onChange={onChangeTimeWeb} 
                                              style={{ 
                                                  border: 'none', background: 'transparent', width: '100%', height: '100%', 
                                                  fontSize: '16px', fontFamily: 'inherit', fontWeight: 'bold' 
                                              }} 
                                          />
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

              {step === 3 && (
                  <View className="gap-6">
                      <View>
                          <Text className="text-lg font-bold text-gray-900 mb-3">상세 내용 (비고)</Text>
                          <TextInput 
                              className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base min-h-[150px]"
                              placeholder={`게스트에게 전할 말을 자유롭게 적어주세요.`}
                              multiline
                              textAlignVertical="top"
                              value={note}
                              onChangeText={setNote}
                          />
                      </View>
                  </View>
              )}
          </ScrollView>

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

      {Platform.OS !== 'web' && (
          <>
              {Platform.OS === 'ios' && (
                  <Modal visible={showDatePicker} transparent animationType="fade">
                      <View className="flex-1 bg-black/40 justify-end">
                          <View className="bg-white p-4 rounded-t-2xl pb-8">
                              <View className="flex-row justify-between mb-4 border-b border-gray-100 pb-2"><Text className="text-lg font-bold">날짜 선택</Text><TouchableOpacity onPress={() => setShowDatePicker(false)}><Text className="text-blue-600 font-bold">완료</Text></TouchableOpacity></View>
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
                              <View className="flex-row justify-between mb-4 border-b border-gray-100 pb-2"><Text className="text-lg font-bold">시간 선택</Text><TouchableOpacity onPress={() => setShowTimePicker(false)}><Text className="text-blue-600 font-bold">완료</Text></TouchableOpacity></View>
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