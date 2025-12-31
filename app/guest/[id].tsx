import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Platform, 
  Modal, 
  TextInput,
  KeyboardAvoidingView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { shareLink } from '../../utils/share';
import { useGuest } from '../../hooks/useGuest'; // 훅 활용

const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '올라운더'];

type GuestPost = {
  id: string;
  hostCaptainId: string;
  teamName: string;
  gender: 'male' | 'female' | 'mixed';
  positions: string[] | string; 
  targetLevel: string;
  time: string;
  matchDate?: string;
  loc?: string;
  location?: string;
  note: string;
  status: string;
  applicants: any[];
  applicantIds?: string[];
  isDeleted?: boolean;
};

export default function GuestDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { applyForGuest, deletePost } = useGuest(); // 훅에서 로직 가져옴
  
  const [post, setPost] = useState<GuestPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);

  // 신청 모달 상태
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [myPosition, setMyPosition] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // 연락처 (신청 시 호스트에게 전송)
  const [myContact, setMyContact] = useState('');

  // [Logic] 데이터 불러오기
  const fetchPost = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, "guest_posts", id as string);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setPost({ id: docSnap.id, ...docSnap.data() } as GuestPost);
        } else {
          const msg = '존재하지 않는 게시글입니다.';
          Platform.OS === 'web' ? window.alert(msg) : Alert.alert('오류', msg);
          router.back();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    fetchPost();
  }, [id]);

  // [Logic] 날짜 포맷팅
  const formatTime = (isoString: string) => {
    try {
        const d = new Date(isoString);
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const hour = d.getHours();
        const min = d.getMinutes();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = days[d.getDay()];
        return `${month}월 ${day}일 (${dayName}) ${hour}:${min.toString().padStart(2, '0')}`;
    } catch { return isoString; }
  };

  const handleShare = async () => {
      if (!post) return;
      // @ts-ignore
      const posString = Array.isArray(post.positions) ? post.positions.join(', ') : post.positions;
      
      const shareUrl = `https://pipe-app.vercel.app/guest/${post.id}`;
      const shareMessage = `🏃‍♂️ [PIPE 게스트 모집] 함께 뛰실 분!
      
${post.teamName}팀에서 용병을 찾고 있어요.

🛡️ 필요 포지션: ${posString}
📅 일시: ${formatTime(post.time || post.matchDate || '')}
📍 장소: ${post.location || post.loc}
${post.note ? `📢 비고: ${post.note}` : ''}`;

      await shareLink({
          title: 'PIPE 게스트 모집',
          message: shareMessage,
          url: shareUrl
      });
  };

  // [Logic] 지원하기 제출 (Web 호환 수정)
  const handleApply = async () => {
    if (!myPosition) {
        const msg = '주 포지션을 선택해주세요.';
        return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('알림', msg);
    }
    if (!myContact) {
        const msg = '호스트가 연락할 전화번호를 입력해주세요.';
        return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('알림', msg);
    }
    
    setSubmitting(true);
    try {
        // useGuest 훅의 applyForGuest 함수 사용 (트랜잭션 처리됨)
        // @ts-ignore
        await applyForGuest(post, message, myContact);
        
        // 성공 시 상태 업데이트
        setShowApplyModal(false);
        fetchPost(); // 최신 상태 리로드 (applicants 배열 갱신 확인용)

    } catch (e) {
        // 에러는 useGuest 내부에서 alert 처리됨
    } finally {
        setSubmitting(false);
    }
  };

  // [Logic] 삭제하기 (Web 호환 수정)
  const handleDelete = async () => {
      // 지원자가 있는지 확인
      if (post && post.applicants && post.applicants.length > 0) {
          const msg = "이미 지원자가 있어 삭제할 수 없습니다.\n관리자에게 문의해주세요.";
          return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('삭제 불가', msg);
      }

      const confirmMsg = '정말 이 모집글을 삭제하시겠습니까?';
      if (Platform.OS === 'web') {
          if (window.confirm(confirmMsg)) {
              await deletePost(id as string);
              router.back();
          }
      } else {
          Alert.alert('삭제 확인', confirmMsg, [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: async () => {
                  await deletePost(id as string);
                  router.back();
              }}
          ]);
      }
  };

  if (loading || !post) {
      return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#111827" /></View>;
  }

  const isHost = user?.uid === post.hostCaptainId;
  const safeApplicantIds = post.applicantIds || [];
  const isApplied = safeApplicantIds.includes(user?.uid || '') || post.applicants?.some(a => a.uid === user?.uid);
  
  // 포지션 배열 처리
  const displayPositions = Array.isArray(post.positions) ? post.positions.join(', ') : post.positions;
  const displayLocation = post.location || post.loc || '';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <View className="flex-1">
        {/* Header */}
        <View className="px-5 py-3 border-b border-gray-100 flex-row justify-between items-center bg-white">
            <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                <FontAwesome5 name="arrow-left" size={20} color="#111827" />
            </TouchableOpacity>
            <Text className="font-bold text-[16px]">모집 상세</Text>
            <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
                <FontAwesome5 name="share-square" size={20} color="#111827" />
            </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            <View className="px-6 pt-8 pb-6 border-b border-gray-100">
                <View className="flex-row items-center mb-3">
                    <View className="bg-orange-50 px-2.5 py-1 rounded-md mr-2">
                        <Text className="text-orange-600 font-bold text-[12px]">게스트모집</Text>
                    </View>
                    <Text className="text-gray-500 font-medium text-[13px]">{post.gender === 'male' ? '남자부' : post.gender === 'female' ? '여자부' : '혼성'} · {post.targetLevel}</Text>
                </View>
                <Text className="text-[24px] font-extrabold text-gray-900 leading-tight mb-2">{post.teamName}</Text>
                <Text className="text-[15px] text-gray-600">{displayPositions} 포지션을 찾고 있어요.</Text>
            </View>

            <View className="px-6 py-6 border-b border-gray-100">
                <View className="flex-row items-start mb-5">
                    <View className="w-6 mt-0.5"><FontAwesome5 name="clock" size={16} color="#9CA3AF" /></View>
                    <View>
                        <Text className="text-gray-400 text-[12px] font-bold mb-0.5">일시</Text>
                        <Text className="text-gray-900 text-[16px] font-bold">{formatTime(post.time || post.matchDate || '')}</Text>
                    </View>
                </View>
                <View className="flex-row items-start">
                    <View className="w-6 mt-0.5"><FontAwesome5 name="map-marker-alt" size={16} color="#9CA3AF" /></View>
                    <View className="flex-1">
                        <Text className="text-gray-400 text-[12px] font-bold mb-0.5">장소</Text>
                        <Text className="text-gray-900 text-[16px] font-bold">{displayLocation}</Text>
                    </View>
                </View>
            </View>

            <View className="px-6 py-6">
                <Text className="text-gray-900 text-[16px] leading-relaxed">
                    {post.note || "상세 내용이 없습니다."}
                </Text>
            </View>
        </ScrollView>
      </View>

      {/* Bottom Action Bar */}
      <View className="px-5 py-5 border-t border-gray-100 bg-white">
          {isHost ? (
              <View className="flex-row gap-3">
                  <TouchableOpacity 
                    onPress={handleDelete}
                    className="flex-1 bg-gray-100 h-[52px] rounded-xl items-center justify-center"
                  >
                      <Text className="text-gray-600 font-bold text-[16px]">삭제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="flex-1 bg-gray-900 h-[52px] rounded-xl items-center justify-center"
                    onPress={() => {
                        // 신청자 관리 페이지로 이동
                        router.push(`/guest/applicants?id=${post.id}` as any);
                    }}
                  >
                      <Text className="text-white font-bold text-[16px]">신청자 관리</Text>
                  </TouchableOpacity>
              </View>
          ) : (
              <TouchableOpacity 
                onPress={() => !isApplied && setShowApplyModal(true)}
                disabled={isApplied}
                className={`w-full h-[56px] rounded-xl items-center justify-center ${isApplied ? 'bg-gray-300' : 'bg-gray-900 shadow-lg shadow-gray-200'}`}
              >
                  <Text className="text-white font-bold text-[17px]">
                      {isApplied ? '신청 완료 (대기중)' : '지원하기'}
                  </Text>
              </TouchableOpacity>
          )}
      </View>

      {/* Apply Modal */}
      <Modal visible={showApplyModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
              <TouchableOpacity className="flex-1 bg-black/40" onPress={() => setShowApplyModal(false)} />
              <View className="bg-white rounded-t-[24px] p-6 pb-10">
                  <Text className="text-xl font-bold text-gray-900 mb-6">게스트 지원하기</Text>
                  
                  <Text className="text-[14px] font-bold text-gray-500 mb-3">내 포지션</Text>
                  <View className="flex-row flex-wrap gap-2 mb-6">
                      {POSITIONS.map(pos => (
                          <TouchableOpacity 
                            key={pos}
                            onPress={() => setMyPosition(pos)}
                            className={`px-4 py-2 rounded-full border ${myPosition === pos ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'}`}
                          >
                              <Text className={`text-[13px] font-bold ${myPosition === pos ? 'text-white' : 'text-gray-600'}`}>{pos}</Text>
                          </TouchableOpacity>
                      ))}
                  </View>

                  <Text className="text-[14px] font-bold text-gray-500 mb-3">연락처 (필수)</Text>
                  <TextInput 
                      className="bg-gray-50 rounded-xl p-4 text-[16px] mb-6 border border-gray-100"
                      placeholder="010-0000-0000"
                      keyboardType="phone-pad"
                      value={myContact}
                      onChangeText={setMyContact}
                  />

                  <Text className="text-[14px] font-bold text-gray-500 mb-3">한마디 (선택)</Text>
                  <TextInput 
                      className="bg-gray-50 rounded-xl p-4 text-[16px] min-h-[80px] mb-6 border border-gray-100"
                      placeholder="실력, 경험 등 간단한 소개를 남겨주세요."
                      multiline
                      textAlignVertical="top"
                      value={message}
                      onChangeText={setMessage}
                  />

                  <TouchableOpacity 
                    onPress={handleApply}
                    disabled={submitting}
                    className="w-full bg-orange-600 h-[56px] rounded-xl items-center justify-center"
                  >
                      {submitting ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-[17px]">지원서 보내기</Text>}
                  </TouchableOpacity>
              </View>
          </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}