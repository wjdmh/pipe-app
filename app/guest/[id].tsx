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
  KeyboardAvoidingView,
  Share // 👇 [New] 공유 기능을 위해 추가
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
// 👇 [Path Check] 경로 유지
import { auth, db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

// [상수] 포지션 선택지
const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '올라운더'];

// [타입 정의]
type GuestPost = {
  id: string;
  hostCaptainId: string;
  teamName: string;
  gender: 'male' | 'female' | 'mixed';
  positions: string; 
  targetLevel: string;
  time: string;
  loc: string;
  note: string;
  status: string;
  applicants: any[];
};

export default function GuestDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const [post, setPost] = useState<GuestPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);

  // 신청 모달 상태
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [myPosition, setMyPosition] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // [Logic] 데이터 불러오기
  useEffect(() => {
    const fetchPost = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, "guest_posts", id as string);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setPost({ id: docSnap.id, ...docSnap.data() } as GuestPost);
        } else {
          Alert.alert('오류', '존재하지 않는 게시글입니다.');
          router.back();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
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

  // ✅ [Updated] 네이티브 공유 로직 적용 (v1.25)
  const handleShare = async () => {
      if (!post) return;

      // 앱/웹 공통 URL
      const shareUrl = `https://pipe-app.vercel.app/guest/${post.id}`;

      // 공유 텍스트 생성
      const shareMessage = `🏃‍♂️ [PIPE 게스트 모집] 함께 뛰실 분!

🛡️ 포지션: ${post.positions}
📅 ${formatTime(post.time)}
📍 ${post.loc}
👕 팀명: ${post.teamName} (${post.gender === 'male' ? '남' : post.gender === 'female' ? '여' : '혼성'})
${post.note ? `📢 비고: ${post.note}` : ''}

👇 게스트 지원하러 가기
${shareUrl}`;

      // 플랫폼별 분기 처리
      if (Platform.OS !== 'web') {
          // [App] 네이티브 공유 시트 호출
          try {
              await Share.share({
                  message: shareMessage,
                  url: Platform.OS === 'ios' ? shareUrl : undefined,
              });
          } catch (error) {
              Alert.alert("오류", "공유 기능을 실행할 수 없습니다.");
          }
      } else {
          // [Web] 클립보드 복사
          try {
              await navigator.clipboard.writeText(shareMessage);
              window.alert("초대장이 복사되었습니다!\n원하는 곳에 붙여넣기(Ctrl+V) 하세요.");
          } catch (err) {
              window.alert("복사에 실패했습니다. 수동으로 복사해주세요.");
          }
      }
  };

  // [Logic] 지원하기 제출
  const handleApply = async () => {
    if (!myPosition) return Alert.alert('알림', '주 포지션을 선택해주세요.');
    if (!user) {
        Alert.alert('로그인 필요', '로그인 후 이용해주세요.');
        return router.push('/auth/login' as any);
    }

    setSubmitting(true);
    try {
        const docRef = doc(db, "guest_posts", id as string);
        
        const applicationData = {
            uid: user.uid,
            name: user.displayName || '익명',
            position: myPosition,
            message: message.trim(),
            appliedAt: new Date().toISOString()
        };

        await updateDoc(docRef, {
            applicants: arrayUnion(applicationData)
        });

        Alert.alert('신청 완료', '호스트에게 신청을 보냈습니다.', [
            { text: '확인', onPress: () => {
                setShowApplyModal(false);
                setPost(prev => prev ? ({...prev, applicants: [...prev.applicants, applicationData]}) : null);
            }}
        ]);

    } catch (e) {
        Alert.alert('오류', '신청 중 문제가 발생했습니다.');
    } finally {
        setSubmitting(false);
    }
  };

  // [Logic] 삭제하기 (호스트 전용)
  const handleDelete = async () => {
      Alert.alert('삭제 확인', '정말 이 모집글을 삭제하시겠습니까?', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
              try {
                  await updateDoc(doc(db, "guest_posts", id as string), { isDeleted: true });
                  router.back();
              } catch(e) { Alert.alert('오류', '삭제 실패'); }
          }}
      ]);
  };

  if (loading || !post) {
      return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#111827" /></View>;
  }

  const isHost = user?.uid === post.hostCaptainId;
  const isApplied = post.applicants?.some(a => a.uid === user?.uid);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <View className="flex-1">
        {/* Header */}
        <View className="px-5 py-3 border-b border-gray-100 flex-row justify-between items-center bg-white">
            <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                <FontAwesome5 name="arrow-left" size={20} color="#111827" />
            </TouchableOpacity>
            <Text className="font-bold text-[16px]">모집 상세</Text>
            
            {/* 👇 [Updated] 공유 아이콘 변경 (share-square) */}
            <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
                <FontAwesome5 name="share-square" size={20} color="#111827" />
            </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
            {/* 1. Title Section */}
            <View className="px-6 pt-8 pb-6 border-b border-gray-100">
                <View className="flex-row items-center mb-3">
                    <View className="bg-orange-50 px-2.5 py-1 rounded-md mr-2">
                        <Text className="text-orange-600 font-bold text-[12px]">게스트모집</Text>
                    </View>
                    <Text className="text-gray-500 font-medium text-[13px]">{post.gender === 'male' ? '남자부' : post.gender === 'female' ? '여자부' : '혼성'} · {post.targetLevel}</Text>
                </View>
                <Text className="text-[24px] font-extrabold text-gray-900 leading-tight mb-2">{post.teamName}</Text>
                <Text className="text-[15px] text-gray-600">{post.positions} 포지션을 찾고 있어요.</Text>
            </View>

            {/* 2. Info Grid */}
            <View className="px-6 py-6 border-b border-gray-100">
                <View className="flex-row items-start mb-5">
                    <View className="w-6 mt-0.5"><FontAwesome5 name="clock" size={16} color="#9CA3AF" /></View>
                    <View>
                        <Text className="text-gray-400 text-[12px] font-bold mb-0.5">일시</Text>
                        <Text className="text-gray-900 text-[16px] font-bold">{formatTime(post.time)}</Text>
                    </View>
                </View>
                <View className="flex-row items-start">
                    <View className="w-6 mt-0.5"><FontAwesome5 name="map-marker-alt" size={16} color="#9CA3AF" /></View>
                    <View className="flex-1">
                        <Text className="text-gray-400 text-[12px] font-bold mb-0.5">장소</Text>
                        <Text className="text-gray-900 text-[16px] font-bold">{post.loc}</Text>
                    </View>
                </View>
            </View>

            {/* 3. Note */}
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
                    onPress={() => Alert.alert('준비중', '마감 기능은 준비 중입니다.')}
                  >
                      <Text className="text-white font-bold text-[16px]">마감하기</Text>
                  </TouchableOpacity>
              </View>
          ) : (
              <TouchableOpacity 
                onPress={() => !isApplied && setShowApplyModal(true)}
                disabled={isApplied}
                className={`w-full h-[56px] rounded-xl items-center justify-center ${isApplied ? 'bg-gray-300' : 'bg-gray-900 shadow-lg shadow-gray-200'}`}
              >
                  <Text className="text-white font-bold text-[17px]">
                      {isApplied ? '신청 완료' : '지원하기'}
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
                  
                  {/* 포지션 선택 */}
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

                  {/* 메시지 입력 */}
                  <Text className="text-[14px] font-bold text-gray-500 mb-3">한마디 (선택)</Text>
                  <TextInput 
                      className="bg-gray-50 rounded-xl p-4 text-[16px] min-h-[100px] mb-6 border border-gray-100"
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