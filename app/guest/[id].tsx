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
  Linking
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { shareLink } from '../../utils/share';
import { useGuest } from '../../hooks/useGuest'; 

const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '올라운더'];

// --- [타입 정의] ---
type Applicant = {
    uid: string;
    name: string;
    contact?: string; // 연락처
    status: 'pending' | 'accepted' | 'rejected';
    position?: string;
};

type GuestPost = {
  id: string;
  hostCaptainId: string;
  hostTeamName?: string; // 표준
  teamName?: string;     // Legacy
  gender: 'male' | 'female' | 'mixed';
  positions: string[] | string; 
  targetLevel: string;
  time: string;          // Legacy
  matchDate?: string;    // 표준
  loc?: string;          // Legacy
  location?: string;     // 표준
  note: string;
  status: string;
  recruitmentCount?: number;
  applicants: Applicant[] | string[]; // Object[] or String[]
  applicantIds?: string[];
};

export default function GuestDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { applyForGuest, deletePost } = useGuest();
  
  const [post, setPost] = useState<GuestPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);

  // 호스트 연락처 (확정된 게스트에게만 노출)
  const [hostContact, setHostContact] = useState<string | null>(null);

  // 신청 모달 상태
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [myPosition, setMyPosition] = useState('');
  const [message, setMessage] = useState('');
  const [myContact, setMyContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- [Data Fetching] ---
  const fetchPost = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, "guest_posts", id as string);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const rawData = docSnap.data();
          // [Fix] Spread 순서 변경 및 타입 단언 위치 조정으로 중복 할당 오류 해결
          const postData = { ...rawData, id: docSnap.id } as GuestPost;
          setPost(postData);
          
          // [Logic] 내가 확정된 게스트라면 -> 호스트 연락처 가져오기
          const currentUser = auth.currentUser;
          if (currentUser) {
              const myApp = (postData.applicants || []).find((a: any) => 
                  typeof a === 'object' && a.uid === currentUser.uid
              ) as Applicant | undefined;
              
              if (myApp?.status === 'accepted') {
                  // 호스트 정보 가져오기
                  const hostUserSnap = await getDoc(doc(db, "users", postData.hostCaptainId));
                  if (hostUserSnap.exists()) {
                      const hostData = hostUserSnap.data();
                      setHostContact(hostData.phoneNumber || hostData.phone || "연락처 미공개");
                  }
              }
          }

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

  // --- [Helpers] ---
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

  const handleCall = (phoneNumber: string) => {
      if (!phoneNumber) return;
      Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleShare = async () => {
      if (!post) return;
      // @ts-ignore
      const posString = Array.isArray(post.positions) ? post.positions.join(', ') : post.positions;
      const dateStr = formatTime(post.matchDate || post.time || '');
      const locStr = post.location || post.loc || '미정';
      
      const shareUrl = `https://pipe-app.vercel.app/guest/${post.id}`;
      const shareMessage = `🏃‍♂️ [PIPE 게스트 모집]\n${post.hostTeamName || post.teamName}팀에서 용병을 찾아요!\n\n📅 ${dateStr}\n📍 ${locStr}\n🛡️ ${posString}\n\n함께 뛰려면 클릭하세요! 👇`;

      await shareLink({
          title: 'PIPE 게스트 모집',
          message: shareMessage,
          url: shareUrl
      });
  };

  // --- [Actions] ---
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
        // @ts-ignore
        await applyForGuest(post, message, myContact);
        setShowApplyModal(false);
        fetchPost(); // Refresh
    } catch (e) {
        // useGuest handles alert
    } finally {
        setSubmitting(false);
    }
  };

  const handleDelete = async () => {
      // 1. 지원자 존재 여부 확인 (안전 장치)
      if (post && post.applicants && post.applicants.length > 0) {
          const msg = "이미 지원자가 있어 삭제할 수 없습니다.\n관리자에게 문의하거나, 지원자를 먼저 정리해주세요.";
          return Platform.OS === 'web' ? window.alert(msg) : Alert.alert('삭제 불가', msg);
      }

      const confirmMsg = '정말 이 모집글을 삭제하시겠습니까?';
      const executeDelete = async () => {
          await deletePost(id as string);
          router.back();
      };

      if (Platform.OS === 'web') {
          if (window.confirm(confirmMsg)) executeDelete();
      } else {
          Alert.alert('삭제 확인', confirmMsg, [
              { text: '취소', style: 'cancel' },
              { text: '삭제', style: 'destructive', onPress: executeDelete }
          ]);
      }
  };

  // --- [Rendering] ---
  if (loading || !post) {
      return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#111827" /></View>;
  }

  const isHost = user?.uid === post.hostCaptainId;
  const safeApplicantIds = post.applicantIds || [];
  // 내 신청 상태 확인
  const myApplication = (post.applicants || []).find((a: any) => 
      typeof a === 'object' ? a.uid === user?.uid : a === user?.uid
  ) as Applicant | undefined;
  
  const isApplied = !!myApplication;
  const isAccepted = myApplication?.status === 'accepted';

  // 확정된 인원 필터링 (호스트용)
  const acceptedApplicants = (post.applicants || []).filter((a: any) => 
      typeof a === 'object' && a.status === 'accepted'
  ) as Applicant[];

  const displayPositions = Array.isArray(post.positions) ? post.positions.join(', ') : post.positions;
  const displayLocation = post.location || post.loc || '';
  const teamNameDisplay = post.hostTeamName || post.teamName || '팀명 미정';

  // 지난 경기 여부 (현재 시간과 비교)
  const matchTime = new Date(post.matchDate || post.time || '');
  const isPast = matchTime < new Date();

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
            {/* Status Banner */}
            {isPast ? (
                <View className="bg-gray-100 px-6 py-3 flex-row items-center">
                    <FontAwesome5 name="history" size={14} color="#6B7280" />
                    <Text className="ml-2 font-bold text-gray-600">지난 일정입니다.</Text>
                </View>
            ) : isAccepted ? (
                <View className="bg-blue-50 px-6 py-4 border-b border-blue-100">
                    <Text className="text-blue-800 font-bold text-lg mb-1">🎉 참가가 확정되었습니다!</Text>
                    <Text className="text-blue-600 text-sm">경기 시간에 늦지 않게 도착해주세요.</Text>
                    
                    {/* 호스트 연락처 노출 (확정자 전용) */}
                    {hostContact && (
                        <TouchableOpacity 
                            onPress={() => handleCall(hostContact)}
                            className="mt-3 bg-white p-3 rounded-xl flex-row items-center self-start border border-blue-200 shadow-sm"
                        >
                            <FontAwesome5 name="phone-alt" size={14} color="#2563EB" />
                            <Text className="ml-2 font-bold text-gray-800">호스트에게 전화하기 ({hostContact})</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : null}

            {/* Main Info */}
            <View className="px-6 pt-8 pb-6 border-b border-gray-100">
                <View className="flex-row items-center mb-3">
                    <View className="bg-orange-50 px-2.5 py-1 rounded-md mr-2">
                        <Text className="text-orange-600 font-bold text-[12px]">게스트모집</Text>
                    </View>
                    <Text className="text-gray-500 font-medium text-[13px]">{post.gender === 'male' ? '남자부' : post.gender === 'female' ? '여자부' : '혼성'} · {post.targetLevel}</Text>
                </View>
                <Text className="text-[24px] font-extrabold text-gray-900 leading-tight mb-2">{teamNameDisplay}</Text>
                <Text className="text-[15px] text-gray-600">{displayPositions} 포지션을 찾고 있어요.</Text>
                
                {/* 모집 현황 (호스트에게만 자세히 보임) */}
                <View className="mt-4 flex-row items-center">
                    <View className="bg-gray-100 h-2 flex-1 rounded-full overflow-hidden">
                        <View 
                            className="bg-gray-900 h-full" 
                            style={{ width: `${Math.min(((acceptedApplicants.length) / (post.recruitmentCount || 1)) * 100, 100)}%` }} 
                        />
                    </View>
                    <Text className="ml-3 text-xs font-bold text-gray-500">
                        {acceptedApplicants.length} / {post.recruitmentCount || 1}명 확정
                    </Text>
                </View>
            </View>

            {/* Time & Location */}
            <View className="px-6 py-6 border-b border-gray-100">
                <View className="flex-row items-start mb-5">
                    <View className="w-6 mt-0.5"><FontAwesome5 name="clock" size={16} color="#9CA3AF" /></View>
                    <View>
                        <Text className="text-gray-400 text-[12px] font-bold mb-0.5">일시</Text>
                        <Text className="text-gray-900 text-[16px] font-bold">{formatTime(post.matchDate || post.time || '')}</Text>
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

            {/* Description */}
            <View className="px-6 py-6 border-b border-gray-100">
                <Text className="text-gray-900 text-[16px] leading-relaxed">
                    {post.note || "상세 내용이 없습니다."}
                </Text>
            </View>

            {/* [Host Only] Confirmed Guest List */}
            {isHost && (
                <View className="px-6 py-6 bg-gray-50">
                    <Text className="text-gray-900 font-bold text-lg mb-4">확정된 게스트 ({acceptedApplicants.length}명)</Text>
                    {acceptedApplicants.length > 0 ? (
                        acceptedApplicants.map((applicant, idx) => (
                            <View key={idx} className="bg-white p-4 rounded-xl border border-gray-200 mb-2 flex-row justify-between items-center shadow-sm">
                                <View>
                                    <Text className="font-bold text-gray-900 text-[15px]">{applicant.name}</Text>
                                    <Text className="text-xs text-indigo-500 font-bold">참가 확정됨</Text>
                                </View>
                                {applicant.contact && (
                                    <TouchableOpacity 
                                        onPress={() => handleCall(applicant.contact!)}
                                        className="bg-gray-100 p-2.5 rounded-lg"
                                    >
                                        <FontAwesome5 name="phone-alt" size={14} color="#4B5563" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))
                    ) : (
                        <Text className="text-gray-400 text-sm">아직 확정된 인원이 없습니다.</Text>
                    )}
                    
                    <TouchableOpacity 
                        onPress={() => router.push(`/guest/applicants?id=${post.id}` as any)}
                        className="mt-4 bg-white border border-gray-300 py-3 rounded-xl items-center"
                    >
                        <Text className="text-gray-700 font-bold">전체 신청자 관리하기</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
      </View>

      {/* Bottom Action Bar */}
      {!isPast && (
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
                        onPress={() => router.push(`/guest/applicants?id=${post.id}` as any)}
                      >
                          <Text className="text-white font-bold text-[16px]">신청자 확인 ({post.applicants?.length || 0})</Text>
                      </TouchableOpacity>
                  </View>
              ) : (
                  <TouchableOpacity 
                    onPress={() => !isApplied && setShowApplyModal(true)}
                    disabled={isApplied}
                    className={`w-full h-[56px] rounded-xl items-center justify-center ${isApplied ? (isAccepted ? 'bg-blue-600' : 'bg-gray-300') : 'bg-gray-900 shadow-lg shadow-gray-200'}`}
                  >
                      <Text className="text-white font-bold text-[17px]">
                          {isAccepted ? '참가 확정 (연락처 확인)' : isApplied ? '신청 완료 (대기중)' : '지원하기'}
                      </Text>
                  </TouchableOpacity>
              )}
          </View>
      )}

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