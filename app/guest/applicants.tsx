import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Linking,
  Platform,
  RefreshControl
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, runTransaction, addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { sendPushNotification } from '../../utils/notificationHelper';

type Applicant = {
  uid: string;
  name: string;
  position?: string;
  contact?: string;  
  message?: string;
  appliedAt: string;
  status: 'pending' | 'accepted' | 'rejected';
};

export default function GuestApplicantsScreen() {
  const { id } = useLocalSearchParams(); 
  const router = useRouter();
  const { user: hostUser } = useUser(); 
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // 새로고침 상태
  const [recruitmentCount, setRecruitmentCount] = useState(1); 
  const [postStatus, setPostStatus] = useState<'recruiting' | 'closed'>('recruiting');

  const fetchApplicants = async () => {
    if (!id) return;
    try {
      const docRef = doc(db, "guest_posts", id as string);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.hostCaptainId !== auth.currentUser?.uid) {
            const msg = "권한이 없습니다.";
            Platform.OS === 'web' ? window.alert(msg) : Alert.alert("권한 없음", msg);
            router.back();
            return;
        }

        setRecruitmentCount(data.recruitmentCount || 1);
        setPostStatus(data.status);

        const rawApplicants = data.applicants || [];
        const parsedApplicants: Applicant[] = rawApplicants.map((app: any) => {
            if (typeof app === 'string') {
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

        parsedApplicants.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
        setApplicants(parsedApplicants);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchApplicants();
  }, [id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchApplicants();
  }, []);

  // [Logic] 알림 전송
  const sendNotificationToGuest = async (targetUid: string, type: 'accepted' | 'rejected') => {
      try {
          const hostContact = hostUser?.phoneNumber || "연락처 미등록";
          const title = type === 'accepted' ? '게스트 참가 확정! 🎉' : '게스트 선정 결과';
          const message = type === 'accepted' 
              ? `참가가 확정되었습니다. 호스트 연락처: ${hostContact}\n라커룸에서 상세 정보를 확인하세요.`
              : `아쉽게도 이번 매치에는 함께하지 못하게 되었습니다.`;

          await addDoc(collection(db, "notifications"), {
              userId: targetUid,
              type: type === 'accepted' ? 'guest_accepted' : 'normal',
              title,
              message,
              link: '/home/locker',
              createdAt: new Date().toISOString(),
              isRead: false
          });

          // Push 로직 생략 (기존과 동일)
      } catch (e) { console.error("알림 전송 실패", e); }
  };

  const handleStatusChange = async (targetApplicant: Applicant, newStatus: 'accepted' | 'rejected') => {
    try {
        const docRef = doc(db, "guest_posts", id as string);

        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw "게시글이 존재하지 않습니다.";
            
            const data = sfDoc.data();
            const currentList = data.applicants as Applicant[];
            
            const acceptedCount = currentList.filter(a => a.uid !== targetApplicant.uid && a.status === 'accepted').length;
            
            if (newStatus === 'accepted' && acceptedCount >= (data.recruitmentCount || 1)) {
                throw "모집 인원이 꽉 찼습니다.";
            }

            const updatedList = currentList.map(app => {
                const appUid = typeof app === 'string' ? app : app.uid;
                if (appUid === targetApplicant.uid) {
                    return { ...app, status: newStatus };
                }
                return app;
            });

            transaction.update(docRef, { applicants: updatedList });
        });

        await fetchApplicants();
        await sendNotificationToGuest(targetApplicant.uid, newStatus);
        
        const msg = newStatus === 'accepted' ? '수락되었습니다.' : '거절되었습니다.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('완료', msg);

    } catch (e) {
        const msg = typeof e === 'string' ? e : '오류가 발생했습니다.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('오류', msg);
    }
  };

  const handleCall = (phoneNumber: string) => {
      if (!phoneNumber) return;
      Linking.openURL(`tel:${phoneNumber}`);
  };

  const renderItem = ({ item }: { item: Applicant }) => {
    const isAccepted = item.status === 'accepted';
    
    return (
      <View className="bg-white px-5 py-4 border-b border-gray-100 flex-row items-start">
        <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 mt-1 ${isAccepted ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <FontAwesome5 name="user" size={16} color={isAccepted ? '#2563EB' : '#9CA3AF'} />
        </View>

        <View className="flex-1 mr-2">
            <View className="flex-row items-center mb-1">
                <Text className="text-[15px] font-bold text-gray-900 mr-2">{item.name}</Text>
                {/* 연락처 표시 (호스트 전용) */}
                {item.contact ? (
                    <TouchableOpacity onPress={() => handleCall(item.contact!)} className="flex-row items-center bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <FontAwesome5 name="phone-alt" size={10} color="#6B7280" style={{marginRight:4}} />
                        <Text className="text-gray-600 text-[12px] font-bold">{item.contact}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
            <Text className="text-gray-800 text-[14px] leading-snug font-medium mb-1">
                {item.message || "한마디가 없습니다."}
            </Text>
            <View className="flex-row items-center">
                 <Text className="text-gray-400 text-[11px] mr-2">{new Date(item.appliedAt).toLocaleString()}</Text>
                 {item.position && <Text className="text-indigo-500 text-[11px] font-bold">포지션: {item.position}</Text>}
            </View>
        </View>

        <View className="items-end justify-center">
            {item.status === 'pending' && (
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
            {isAccepted && <View className="bg-blue-50 px-3 py-1 rounded-lg"><Text className="text-blue-700 text-xs font-bold">확정됨</Text></View>}
            {item.status === 'rejected' && <View className="bg-gray-100 px-3 py-1 rounded-lg"><Text className="text-gray-400 text-xs font-bold">거절됨</Text></View>}
        </View>
      </View>
    );
  };

  const acceptedCount = applicants.filter(a => a.status === 'accepted').length;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      <View className="px-5 py-3 border-b border-gray-100 flex-row justify-between items-center bg-white">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
              <FontAwesome5 name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>
          <View>
              <Text className="font-bold text-[16px] text-center">신청자 관리</Text>
              <Text className="text-[10px] text-gray-400 text-center">
                  모집 {recruitmentCount}명 / 확정 {acceptedCount}명
              </Text>
          </View>
          <View className="w-8" />
      </View>
      
      <FlatList
        data={applicants}
        renderItem={renderItem}
        keyExtractor={item => item.uid}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-20">
                    <Text className="text-gray-400 text-[14px]">아직 신청자가 없습니다.</Text>
                </View>
            ) : <ActivityIndicator className="mt-10" />
        }
      />
    </SafeAreaView>
  );
}