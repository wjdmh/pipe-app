import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Animated, Dimensions, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import tw from 'twrnc';

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
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={tw`flex-1 p-5 rounded-3xl border bg-white shadow-sm items-center justify-center ${selected ? 'border-[#3182F6] bg-[#F3F8FF]' : 'border-transparent'}`}>
    <View style={tw`w-12 h-12 rounded-full items-center justify-center mb-3 ${selected ? 'bg-[#3182F6]' : 'bg-[#F2F4F6]'}`}><FontAwesome5 name={icon} size={20} color={selected ? 'white' : '#8B95A1'} /></View>
    <Text style={tw`text-lg font-bold ${selected ? 'text-[#3182F6]' : 'text-[#333D4B]'}`}>{label}</Text>
    {subLabel && <Text style={tw`text-xs text-[#8B95A1] mt-1`}>{subLabel}</Text>}
  </TouchableOpacity>
);

export default function EditMatchScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<'6man' | '9man' | null>(null);
  const [gender, setGender] = useState<'male' | 'female' | 'mixed' | null>(null);
  const [date, setDate] = useState(new Date());
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');

  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  useEffect(() => {
    const loadData = async () => {
      if (typeof id !== 'string') return;
      try {
        const docSnap = await getDoc(doc(db, "matches", id));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setType(data.type);
          setGender(data.gender);
          setPlace(data.loc);
          setNote(data.note);
          
          // [Date Format Fix] ISO 문자열(time) 또는 timestamp를 Date 객체로 변환
          const dateStr = data.time && !isNaN(new Date(data.time).getTime()) ? data.time : data.timestamp;
          if (dateStr) setDate(new Date(dateStr));
          else setDate(new Date());
          
          setStep(5);
        } else {
          Alert.alert('오류', '존재하지 않는 게시물입니다.');
          router.back();
        }
      } catch (e) { Alert.alert('오류', '데이터를 불러오지 못했습니다.'); } finally { setLoading(false); }
    };
    loadData();
  }, [id]);

  const nextStep = (next: number) => {
    if (step < next) {
        setStep(next);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 300);
    }
  };

  const formatDateKr = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const formatTimeKr = (d: Date) => `${d.getHours() >= 12 ? '오후' : '오전'} ${d.getHours() % 12 || 12}시 ${d.getMinutes() > 0 ? `${d.getMinutes()}분` : ''}`;

  const handleUpdate = async () => {
    if (!type || !gender || !place) return Alert.alert('알림', '필수 정보를 입력해주세요.');
    if (typeof id !== 'string') return;
    setSubmitting(true);
    try {
      // [Date Format Fix] 수정 시에도 ISO 8601 포맷으로 저장
      const dbTimeStr = date.toISOString();
      await updateDoc(doc(db, "matches", id), { 
          type, 
          gender, 
          time: dbTimeStr, 
          timestamp: date.toISOString(), 
          loc: place, 
          note 
      });
      Alert.alert('수정 완료', '공고가 수정되었습니다.', [{ text: '확인', onPress: () => router.back() }]);
    } catch (e) { Alert.alert('실패', '수정 중 오류가 발생했습니다.'); } finally { setSubmitting(false); }
  };

  if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator /></View>;

  return (
    <SafeAreaView style={tw`flex-1 bg-[#F9FAFB]`}>
      <View style={tw`px-5 h-14 flex-row items-center justify-between bg-[#F9FAFB] z-10`}>
        <TouchableOpacity onPress={() => router.back()} style={tw`p-2 -ml-2 rounded-full`}><FontAwesome5 name="arrow-left" size={20} color="#191F28" /></TouchableOpacity>
        <Text style={tw`text-lg font-bold text-[#191F28]`}>공고 수정</Text>
        <View style={tw`w-8`} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={tw`flex-1`}>
        <ScrollView ref={scrollViewRef} contentContainerStyle={tw`px-6 pt-2 pb-32`} showsVerticalScrollIndicator={false}>
          <FadeInView>
            <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>1. 경기 방식</Text>
            <View style={tw`flex-row gap-3`}>
              <SelectCard label="6인제" subLabel="정규 룰" icon="volleyball-ball" selected={type === '6man'} onPress={() => setType('6man')} />
              <SelectCard label="9인제" subLabel="생활체육" icon="users" selected={type === '9man'} onPress={() => setType('9man')} />
            </View>
          </FadeInView>
          <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>2. 참가 선수</Text>
              <View style={tw`gap-3`}>
                <TouchableOpacity onPress={() => setGender('mixed')} activeOpacity={0.7} style={tw`w-full p-5 rounded-2xl bg-white border flex-row items-center shadow-sm ${gender === 'mixed' ? 'border-[#3182F6] bg-[#F3F8FF]' : 'border-transparent'}`}>
                    <View style={tw`w-10 h-10 rounded-full items-center justify-center mr-4 ${gender === 'mixed' ? 'bg-[#3182F6]' : 'bg-[#F2F4F6]'}`}><FontAwesome5 name="restroom" size={16} color={gender === 'mixed' ? 'white' : '#8B95A1'} /></View>
                    <View><Text style={tw`text-lg font-bold ${gender === 'mixed' ? 'text-[#3182F6]' : 'text-[#333D4B]'}`}>혼성 (Mixed)</Text></View>
                </TouchableOpacity>
                <View style={tw`flex-row gap-3`}>
                    <SelectCard label="남자부" icon="male" selected={gender === 'male'} onPress={() => setGender('male')} />
                    <SelectCard label="여자부" icon="female" selected={gender === 'female'} onPress={() => setGender('female')} />
                </View>
              </View>
          </FadeInView>
          <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>3. 일시</Text>
              <TouchableOpacity onPress={() => { setTempDate(date); setShowDateModal(true); }} style={tw`bg-white p-5 rounded-2xl border border-transparent shadow-sm`}>
                <Text style={tw`text-2xl font-bold text-[#3182F6]`}>{formatDateKr(date)} {formatTimeKr(date)}</Text>
              </TouchableOpacity>
          </FadeInView>
          <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>4. 장소</Text>
              <View style={tw`bg-white rounded-2xl border border-transparent shadow-sm`}><TextInput style={tw`p-5 text-lg text-[#191F28]`} value={place} onChangeText={setPlace} /></View>
          </FadeInView>
          <FadeInView delay={100}>
              <Text style={tw`text-lg font-bold text-[#333D4B] mb-3`}>5. 추가 전달사항</Text>
              <View style={tw`bg-white rounded-2xl border border-transparent shadow-sm mb-8`}><TextInput style={tw`p-5 text-lg text-[#191F28] min-h-[100px]`} multiline textAlignVertical="top" value={note} onChangeText={setNote} /></View>
              <TouchableOpacity onPress={handleUpdate} disabled={submitting} style={tw`w-full bg-[#3182F6] py-5 rounded-2xl items-center shadow-md shadow-blue-200`}>
                {submitting ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-xl`}>수정 완료</Text>}
              </TouchableOpacity>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={showDateModal} transparent animationType="fade">
        <View style={tw`flex-1 justify-end bg-black/60`}>
            <View style={tw`bg-white rounded-t-3xl p-6 pb-10`}>
                <View style={tw`flex-row justify-between items-center mb-6`}>
                    <Text style={tw`text-xl font-bold text-[#191F28]`}>시간 선택</Text>
                    <TouchableOpacity onPress={() => setShowDateModal(false)}><Text style={tw`text-[#8B95A1] font-bold`}>취소</Text></TouchableOpacity>
                </View>
                <DateTimePicker value={tempDate} mode="datetime" display="spinner" onChange={(e, d) => d && setTempDate(d)} textColor="#191F28" locale="ko-KR" style={tw`h-48`} />
                <TouchableOpacity onPress={() => { setDate(tempDate); setShowDateModal(false); }} style={tw`mt-6 bg-[#3182F6] py-4 rounded-xl items-center`}><Text style={tw`text-white font-bold text-lg`}>확인</Text></TouchableOpacity>
            </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}