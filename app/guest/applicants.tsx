import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Linking,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, addDoc, collection, runTransaction, getFirestore } from 'firebase/firestore';
import { db, auth } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useUser } from '../context/UserContext'; // 호스트 정보(연락처) 가져오기 위함
import { sendPushNotification } from '../../utils/notificationHelper';

// [타입 정의] Phase 1에서 정의한 구조와 일치시킴
type Applicant = {
  uid: string;
  name: string;
  position?: string; // 예전 데이터 호환용
  contact?: string;  // 연락처
  message?: string;  // 한마디
  appliedAt: string;
  status: 'pending' | 'accepted' | 'rejected';
};

export default function GuestApplicantsScreen() {
  const { id } = useLocalSearchParams(); // 게시글 ID
  const router = useRouter();
  const { user: hostUser } = useUser(); // 현재 로그인한 호스트 정보
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [recruitmentCount, setRecruitmentCount] = useState(1); // 모집 인원
  const [postStatus, setPostStatus] = useState<'recruiting' | 'closed'>('recruiting');

  // [Logic] 데이터 불러오기
  const fetchApplicants = async () => {
    if (!id) return;
    try {
      const docRef = doc(db, "guest_posts", id as string);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // 권한 체크
        if (data.hostCaptainId !== auth.currentUser?.uid) {
            Alert.alert("권한 없음", "작성자만 접근할 수 있습니다.");
            router.back();
            return;
        }

        setRecruitmentCount(data.recruitmentCount || 1);
        setPostStatus(data.status);

        // 신청자 목록 파싱 (하위 호환성 고려)
        const rawApplicants = data.applicants || [];
        const parsedApplicants: Applicant[] = rawApplicants.map((app: any) => {
            if (typeof app === 'string') {
                // 구버전(문자열 UID) 데이터 -> 객체로 변환
                return {
                    uid: app,
                    name: '익명(Legacy)',
                    message: '정보 없음',
                    contact: '',
                    appliedAt: new Date().toISOString(),
                    status: 'pending'
                };
            }
            return app;
        });

        // 최신순 정렬
        parsedApplicants.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
        setApplicants(parsedApplicants);
      } else {
        Alert.alert('오류', '게시글을 찾을 수 없습니다.');
        router.back();
      }
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplicants();
  }, [id]);

  // [Logic] 알림 전송 헬퍼
  const sendNotificationToGuest = async (targetUid: string, type: 'accepted' | 'rejected', guestName: string) => {
      try {
          const hostContact = hostUser?.phoneNumber || "연락처 미등록";
          
          const title = type === 'accepted' ? '게스트 참가 확정! 🎉' : '게스트 선정 결과';
          // ✅ 핵심: 수락 시 호스트 연락처 포함
          const message = type === 'accepted' 
              ? `축하합니다! 매치 참가가 확정되었습니다.\n호스트 연락처: ${hostContact}\n라커룸에서 상세 정보를 확인하세요.`
              : `아쉽게도 이번 매치에는 함께하지 못하게 되었습니다.`;

          // 1. Firestore 알림 저장
          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type: type === 'accepted' ? 'guest_accepted' : 'normal', // 타입 구분 (라커룸 이동용)
              title,
              message,
              link: '/home/locker', // 라커룸으로 이동 유도
              createdAt: new Date().toISOString(),
              isRead: false
          });

          // 2. 푸시 전송
          const userSnap = await getDoc(doc(db, "users", targetUid));
          if (userSnap.exists()) {
              const token = userSnap.data().pushToken;
              if (token) {
                  await sendPushNotification(token, title, message, { link: '/home/locker' });
              }
          }
      } catch (e) { console.error("알림 전송 실패", e); }
  };

  // [Logic] 상태 변경 (수락/거절)
  const handleStatusChange = async (targetApplicant: Applicant, newStatus: 'accepted' | 'rejected') => {
    try {
        const docRef = doc(db, "guest_posts", id as string);

        // 트랜잭션으로 안전하게 처리 (동시성 제어 및 카운트 체크)
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw "게시글이 존재하지 않습니다.";
            
            const data = sfDoc.data();
            const currentList = data.applicants as Applicant[];
            
            // 현재 수락된 인원 계산 (자신 제외)
            const acceptedCount = currentList.filter(a => a.uid !== targetApplicant.uid && a.status === 'accepted').length;
            
            // 수락 시 정원 체크
            if (newStatus === 'accepted') {
                if (acceptedCount >= (data.recruitmentCount || 1)) {
                    throw "모집 인원이 꽉 찼습니다.";
                }
            }

            // 상태 업데이트
            const updatedList = currentList.map(app => {
                const appUid = typeof app === 'string' ? app : app.uid; // 호환성
                if (appUid === targetApplicant.uid) {
                    return { ...app, status: newStatus }; // 객체이면 status 업데이트
                }
                return app;
            });

            // 모집 마감 여부 판단 (이번 수락으로 꽉 찼는지)
            let newPostStatus = data.status;
            if (newStatus === 'accepted' && (acceptedCount + 1) >= (data.recruitmentCount || 1)) {
                newPostStatus = 'closed';
            } else if (newStatus === 'rejected' || (newStatus === 'accepted' && (acceptedCount + 1) < (data.recruitmentCount || 1))) {
                // 누군가 취소되거나 아직 자리가 남았으면 다시 모집중으로 (선택사항이나 안전하게)
                newPostStatus = 'recruiting';
            }

            transaction.update(docRef, { 
                applicants: updatedList,
                status: newPostStatus
            });
        });

        // 성공 시 UI 반영 및 알림
        // 1. 목록 갱신 (다시 fetch하여 최신 상태 유지)
        await fetchApplicants();

        // 2. 알림 발송
        await sendNotificationToGuest(targetApplicant.uid, newStatus, targetApplicant.name);
        
        Alert.alert(
            newStatus === 'accepted' ? '수락 완료' : '거절 완료', 
            newStatus === 'accepted' ? '게스트에게 호스트님의 연락처를 전송했습니다.' : '결과를 전송했습니다.'
        );

    } catch (e) {
        console.error(e);
        const msg = typeof e === 'string' ? e : '상태 변경 중 문제가 발생했습니다.';
        Alert.alert('오류', msg);
    }
  };

  // 전화 걸기
  const handleCall = (phoneNumber: string) => {
      if (!phoneNumber) return Alert.alert("알림", "연락처 정보가 없습니다.");
      Linking.openURL(`tel:${phoneNumber}`);
  };

  const renderItem = ({ item }: { item: Applicant }) => {
    const isAccepted = item.status === 'accepted';
    const isRejected = item.status === 'rejected';
    const isPending = item.status === 'pending';

    return (
      <View className="bg-white px-5 py-4 border-b border-gray-100 flex-row items-start">
        {/* 1. 프로필 아이콘 */}
        <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 mt-1 ${isAccepted ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <FontAwesome5 name="user" size={16} color={isAccepted ? '#2563EB' : '#9CA3AF'} />
        </View>

        {/* 2. 정보 영역 */}
        <View className="flex-1 mr-2">
            <View className="flex-row items-center mb-1">
                <Text className="text-[15px] font-bold text-gray-900 mr-2">{item.name}</Text>
                {/* 연락처 표시 (호스트니까 보임) */}
                {item.contact ? (
                    <TouchableOpacity onPress={() => handleCall(item.contact!)} className="flex-row items-center bg-gray-50 px-1.5 py-0.5 rounded">
                        <FontAwesome5 name="phone-alt" size={10} color="#6B7280" style={{marginRight:4}} />
                        <Text className="text-gray-500 text-[11px] font-bold">{item.contact}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            
            <Text className="text-gray-800 text-[14px] leading-snug font-medium mb-1">
                {item.message || "한마디가 없습니다."}
            </Text>
            
            <Text className="text-gray-400 text-[11px]">
                {new Date(item.appliedAt).toLocaleString()} 신청
            </Text>
        </View>

        {/* 3. 액션 버튼 */}
        <View className="items-end justify-center">
            {isPending && (
                <View className="flex-row gap-2">
                    <TouchableOpacity 
                        onPress={() => handleStatusChange(item, 'rejected')}
                        className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center border border-gray-200"
                    >
                        <FontAwesome5 name="times" size={14} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => handleStatusChange(item, 'accepted')}
                        className="w-9 h-9 rounded-full bg-indigo-50 items-center justify-center border border-indigo-100"
                    >
                        <FontAwesome5 name="check" size={14} color="#4F46E5" />
                    </TouchableOpacity>
                </View>
            )}

            {isAccepted && (
                <View className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                    <Text className="text-blue-700 text-xs font-bold">확정됨</Text>
                </View>
            )}

            {isRejected && (
                <View className="bg-gray-100 px-3 py-1.5 rounded-lg">
                    <Text className="text-gray-400 text-xs font-bold">거절됨</Text>
                </View>
            )}
        </View>
      </View>
    );
  };

  // 현재 수락 인원 계산
  const acceptedCount = applicants.filter(a => a.status === 'accepted').length;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 flex-row justify-between items-center bg-white">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
              <FontAwesome5 name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>
          <View>
              <Text className="font-bold text-[16px] text-center">신청자 관리</Text>
              <Text className="text-[10px] text-gray-400 text-center">
                  모집 {recruitmentCount}명 / 현재확정 {acceptedCount}명
              </Text>
          </View>
          <View className="w-8" />
      </View>
      
      {/* 상단 모집 상태 배너 */}
      {postStatus === 'closed' && (
          <View className="bg-gray-100 py-2 items-center">
              <Text className="text-xs font-bold text-gray-500">✅ 모집이 마감된 게시글입니다.</Text>
          </View>
      )}

      {/* List */}
      <FlatList
        data={applicants}
        renderItem={renderItem}
        keyExtractor={item => item.uid}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-20">
                    <FontAwesome5 name="inbox" size={40} color="#E5E7EB" style={{marginBottom: 10}} />
                    <Text className="text-gray-400 text-[14px]">아직 신청자가 없습니다.</Text>
                </View>
            ) : (
                <View className="py-20"><ActivityIndicator color="#111827" /></View>
            )
        }
      />
    </SafeAreaView>
  );
}