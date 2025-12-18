import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Linking 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';

// [타입 정의]
type Applicant = {
  uid: string;
  name: string;
  position: string;
  message: string;
  appliedAt: string;
  status?: 'pending' | 'accepted' | 'rejected'; // 상태 필드 추가
  phone?: string; // (선택) 연락처가 있다면
};

export default function GuestApplicantsScreen() {
  const { id } = useLocalSearchParams(); // 게시글 ID
  const router = useRouter();
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);

  // [Logic] 데이터 불러오기
  const fetchApplicants = async () => {
    if (!id) return;
    try {
      const docRef = doc(db, "guest_posts", id as string);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        // 최신순 정렬 (최근 신청이 위로)
        const list = (data.applicants || []).sort((a: any, b: any) => 
            new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
        );
        setApplicants(list);
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

  // [Logic] 상태 변경 (수락/거절)
  const handleStatusChange = async (targetUid: string, newStatus: 'accepted' | 'rejected') => {
    try {
        // 1. 로컬 상태 즉시 반영 (Optimistic Update)
        const updatedList = applicants.map(app => 
            app.uid === targetUid ? { ...app, status: newStatus } : app
        );
        setApplicants(updatedList);

        // 2. Firestore 업데이트 (전체 배열 덮어쓰기)
        const docRef = doc(db, "guest_posts", id as string);
        await updateDoc(docRef, { applicants: updatedList });

    } catch (e) {
        console.error(e);
        Alert.alert('오류', '상태 변경 중 문제가 발생했습니다.');
        fetchApplicants(); // 실패 시 롤백
    }
  };

  // [UI] 신청자 카드 렌더링
  const renderItem = ({ item }: { item: Applicant }) => {
    // 상태에 따른 UI 분기
    const isPending = !item.status || item.status === 'pending';
    const isAccepted = item.status === 'accepted';
    const isRejected = item.status === 'rejected';

    return (
      <View className="bg-white px-5 py-4 border-b border-gray-100 flex-row items-start">
        {/* 1. 프로필 아이콘 (임시) */}
        <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3 mt-1">
            <FontAwesome5 name="user" size={16} color="#9CA3AF" />
        </View>

        {/* 2. 정보 영역 */}
        <View className="flex-1 mr-2">
            <View className="flex-row items-center mb-1">
                <Text className="text-[15px] font-bold text-gray-900 mr-2">{item.name}</Text>
                <View className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                    <Text className="text-gray-500 text-[11px] font-bold">{item.position}</Text>
                </View>
            </View>
            <Text className="text-gray-600 text-[14px] leading-snug">
                {item.message || "한마디가 없습니다."}
            </Text>
            <Text className="text-gray-400 text-[11px] mt-1.5">
                {new Date(item.appliedAt).toLocaleDateString()} 신청
            </Text>
        </View>

        {/* 3. 액션 버튼 */}
        <View className="items-end justify-center">
            {isPending && (
                <View className="flex-row gap-2">
                    <TouchableOpacity 
                        onPress={() => handleStatusChange(item.uid, 'rejected')}
                        className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
                    >
                        <FontAwesome5 name="times" size={12} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => handleStatusChange(item.uid, 'accepted')}
                        className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center"
                    >
                        <FontAwesome5 name="check" size={12} color="#2563EB" />
                    </TouchableOpacity>
                </View>
            )}

            {isAccepted && (
                <View className="bg-blue-100 px-2 py-1 rounded">
                    <Text className="text-blue-700 text-[11px] font-bold">참가확정</Text>
                </View>
            )}

            {isRejected && (
                <View className="bg-gray-100 px-2 py-1 rounded">
                    <Text className="text-gray-400 text-[11px] font-bold">거절됨</Text>
                </View>
            )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-100 flex-row justify-between items-center bg-white">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
              <FontAwesome5 name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>
          <Text className="font-bold text-[16px]">신청자 관리</Text>
          <View className="w-8" />
      </View>

      {/* List */}
      <FlatList
        data={applicants}
        renderItem={renderItem}
        keyExtractor={item => item.uid}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
            !loading ? (
                <View className="items-center justify-center py-20">
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