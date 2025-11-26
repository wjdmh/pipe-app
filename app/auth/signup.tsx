import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import tw from 'twrnc';

export default function SignupScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Phone, 2: Email, 3: Password
  const [loading, setLoading] = useState(false);

  // 입력 상태
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 애니메이션 값
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // 단계 전환 시 페이드 효과
  const nextStep = () => {
    Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true })
    ]).start();
    setTimeout(() => setStep(step + 1), 150);
  };

  const prevStep = () => {
    if (step > 1) {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start();
        setTimeout(() => setStep(step - 1), 150);
    } else {
        router.back();
    }
  };

  const handleSignup = async () => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email: email,
        phoneNumber: phone,
        createdAt: new Date().toISOString(),
        role: 'User'
      });

      Alert.alert(
        '환영합니다! 🎉', 
        '계정이 만들어졌어요.\n바로 로그인을 도와드릴게요.', 
        [{ text: '확인', onPress: () => router.replace('/home') }] // 가입 후 자동 로그인처럼 홈으로 이동 (혹은 로그인 화면으로)
      );
    } catch (error: any) {
      let msg = '가입을 진행할 수 없어요.';
      if (error.code === 'auth/email-already-in-use') msg = '이미 가입된 이메일이에요.';
      Alert.alert('잠시만요', msg);
    } finally {
      setLoading(false);
    }
  };

  // 단계별 유효성 검사
  const isStepValid = () => {
      if (step === 1) return phone.length >= 10;
      if (step === 2) return email.includes('@') && email.includes('.');
      if (step === 3) return password.length >= 6;
      return false;
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
      >
        {/* 헤더 (뒤로가기) */}
        <View style={tw`px-4 py-2`}>
            <TouchableOpacity onPress={prevStep} style={tw`p-2`}>
                <FontAwesome name="arrow-left" size={20} color="#333D4B" />
            </TouchableOpacity>
        </View>

        <View style={tw`flex-1 px-6 pt-6`}>
            {/* 프로그레스 바 (옵션) */}
            <View style={tw`h-1 bg-gray-100 mb-8 rounded-full overflow-hidden`}>
                <View style={[tw`h-full bg-[#3182F6]`, { width: `${(step / 3) * 100}%` }]} />
            </View>

            <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
                {step === 1 && (
                    <>
                        <Text style={tw`text-2xl font-bold text-[#191F28] mb-2`}>휴대폰 번호를{'\n'}입력해주세요.</Text>
                        <Text style={tw`text-[#8B95A1] text-base mb-8`}>매칭 조율을 위해 꼭 필요해요.</Text>
                        <TextInput
                            style={tw`text-2xl border-b-2 border-[#3182F6] pb-2 text-[#333D4B] font-bold`}
                            placeholder="010-1234-5678"
                            placeholderTextColor="#B0B8C1"
                            keyboardType="phone-pad"
                            autoFocus={true}
                            value={phone}
                            onChangeText={setPhone}
                        />
                    </>
                )}

                {step === 2 && (
                    <>
                        <Text style={tw`text-2xl font-bold text-[#191F28] mb-2`}>사용하실 이메일을{'\n'}알려주세요.</Text>
                        <TextInput
                            style={tw`text-2xl border-b-2 border-[#3182F6] pb-2 text-[#333D4B] font-bold mt-4`}
                            placeholder="example@email.com"
                            placeholderTextColor="#B0B8C1"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoFocus={true}
                            value={email}
                            onChangeText={setEmail}
                        />
                    </>
                )}

                {step === 3 && (
                    <>
                        <Text style={tw`text-2xl font-bold text-[#191F28] mb-2`}>마지막이에요.{'\n'}비밀번호를 설정해주세요.</Text>
                        <Text style={tw`text-[#8B95A1] text-base mb-8`}>6자리 이상 입력해주세요.</Text>
                        <TextInput
                            style={tw`text-2xl border-b-2 border-[#3182F6] pb-2 text-[#333D4B] font-bold`}
                            placeholder="비밀번호"
                            placeholderTextColor="#B0B8C1"
                            secureTextEntry
                            autoFocus={true}
                            value={password}
                            onChangeText={setPassword}
                        />
                    </>
                )}
            </Animated.View>
        </View>

        {/* Sticky CTA Button */}
        <View style={tw`p-4 border-t border-[#F2F4F6]`}>
            <TouchableOpacity
              onPress={step < 3 ? nextStep : handleSignup}
              disabled={!isStepValid() || loading}
              style={tw`w-full py-4 rounded-xl items-center ${isStepValid() ? 'bg-[#3182F6]' : 'bg-[#E5E8EB]'}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={tw`text-white font-bold text-lg ${isStepValid() ? '' : 'text-[#8B95A1]'}`}>
                  {step < 3 ? '다음' : '완료'}
                </Text>
              )}
            </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}