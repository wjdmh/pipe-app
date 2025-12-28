import React, { useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  StatusBar, 
  LogBox, 
  Modal, 
  TextInput, 
  Alert 
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useGuest, GuestPost } from '../../hooks/useGuest';
import { auth } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';
import GuestCard from '../../components/GuestCard'; // ✅ 공통 컴포넌트 도입

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

const POSITIONS = { 'OH': '레프트', 'OP': '라이트', 'MB': '센터', 'S': '세터', 'L': '리베로' };

export default function GuestListScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { posts, loading, applyForGuest, cancelApplication } = useGuest();
  const [filterPos, setFilterPos] = useState<string>('all');

  // 신청 모달 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<GuestPost | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applyContact, setApplyContact] = useState('');

  const filteredPosts = posts.filter(p => filterPos === 'all' || (p.positions && p.positions.includes(filterPos)));

  // 신청 버튼 클릭 시 모달 열기
  const openApplyModal = (post: GuestPost) => {
    if (!auth.currentUser) {
        Alert.alert("로그인 필요", "게스트 신청을 위해 로그인이 필요합니다.");
        return router.push('/auth/login');
    }
    
    setSelectedPost(post);
    setApplyMessage('열심히 하겠습니다!'); 
    setApplyContact(user?.phoneNumber || ''); 
    setModalVisible(true);
  };

  // 모달 내 "확인" 버튼 클릭 시 실제 신청
  const handleConfirmApply = async () => {
    if (!selectedPost) return;
    if (!applyContact.trim()) {
        Alert.alert("알림", "호스트가 연락할 수 있는 전화번호를 입력해주세요.");
        return;
    }

    await applyForGuest(selectedPost, applyMessage, applyContact);
    
    setModalVisible(false);
    setApplyMessage('');
    setApplyContact('');
    setSelectedPost(null);
  };

  const renderItem = ({ item }: { item: GuestPost }) => {
    // applicants가 객체 배열인지 문자열 배열인지 체크 (하위 호환성)
    const myUid = auth.currentUser?.uid;
    const isApplied = item.applicants?.some((a: any) => 
        typeof a === 'string' ? a === myUid : a.uid === myUid
    );
    const isMyPost = item.hostCaptainId === myUid;
    
    // 모집 인원 체크
    const totalRecruit = item.recruitmentCount || 1;
    const currentAccepted = item.applicants?.filter((a: any) => typeof a !== 'string' && a.status === 'accepted').length || 0;
    const isFull = currentAccepted >= totalRecruit;

    return (
      <View className="mb-4">
        {/* ✅ 1. 공통 디자인 카드 (클릭 시 상세 이동) */}
        <GuestCard 
            item={item} 
            onPress={() => router.push(`/guest/${item.id}` as any)} 
            variant="detailed"
        />

        {/* ✅ 2. 액션 버튼 영역 (카드 하단에 부착) */}
        {/* 기존 기능 누락 방지를 위해 '간편 지원/취소' 버튼을 유지합니다 */}
        {!isMyPost && (
            <View className="absolute bottom-3 right-5 flex-row">
                 {isApplied ? (
                    <TouchableOpacity 
                        onPress={() => cancelApplication(item.id)}
                        className="bg-gray-200 px-4 py-2 rounded-xl"
                    >
                        <Text className="text-gray-600 font-bold text-xs">신청 취소</Text>
                    </TouchableOpacity>
                 ) : (
                    <TouchableOpacity 
                        onPress={() => isFull ? null : openApplyModal(item)}
                        disabled={isFull}
                        className={`px-4 py-2 rounded-xl shadow-sm ${isFull ? 'bg-gray-300' : 'bg-indigo-600'}`}
                    >
                        <Text className="text-white font-bold text-xs">
                            {isFull ? '모집 마감' : '간편 지원'}
                        </Text>
                    </TouchableOpacity>
                 )}
            </View>
        )}
        
        {/* 내 게시글일 경우 관리 버튼 표시 */}
        {isMyPost && (
            <View className="absolute bottom-3 right-5">
                <TouchableOpacity 
                    onPress={() => router.push({ pathname: '/guest/applicants', params: { id: item.id } })}
                    className="bg-slate-800 px-4 py-2 rounded-xl flex-row items-center shadow-sm"
                >
                    <FontAwesome5 name="users" size={10} color="white" style={{marginRight:6}} />
                    <Text className="text-white font-bold text-xs">관리</Text>
                </TouchableOpacity>
            </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar barStyle="dark-content" />
      <View className="px-5 py-4 bg-white border-b border-gray-100 flex-row justify-between items-center">
        <TouchableOpacity onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={20} color="#191F28" /></TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">게스트로 참여하기</Text>
        <TouchableOpacity onPress={() => router.push('/guest/write')}><FontAwesome5 name="plus" size={20} color="#4f46e5" /></TouchableOpacity>
      </View>

      <View className="bg-white px-5 py-3 mb-2">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', ...Object.keys(POSITIONS)]}
          keyExtractor={(i) => i}
          renderItem={({ item }) => (
            <TouchableOpacity 
              onPress={() => setFilterPos(item)}
              className={`mr-2 px-3 py-1.5 rounded-full border ${filterPos === item ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
            >
              <Text className={`text-xs font-bold ${filterPos === item ? 'text-white' : 'text-gray-500'}`}>
                {item === 'all' ? '전체' : POSITIONS[item as keyof typeof POSITIONS]}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" color="#4f46e5" />
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerClassName="p-5 pb-20"
          ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">현재 게스트를 모집 중인 팀이 없어요.</Text>}
        />
      )}

      {/* ✅ 신청 모달 (Phase 1 기능 유지) */}
      <Modal visible={modalVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-2xl p-6">
                  <Text className="text-xl font-bold text-gray-900 mb-1">게스트 신청</Text>
                  <Text className="text-sm text-gray-500 mb-6">호스트에게 전달할 정보를 입력해주세요.</Text>

                  <Text className="text-xs font-bold text-gray-500 mb-1 ml-1">한마디 (각오 등)</Text>
                  <TextInput 
                      className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base mb-4"
                      placeholder="예) 레프트 포지션 자신 있습니다!"
                      value={applyMessage}
                      onChangeText={setApplyMessage}
                  />

                  <Text className="text-xs font-bold text-gray-500 mb-1 ml-1">연락처</Text>
                  <TextInput 
                      className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base mb-6"
                      placeholder="010-0000-0000"
                      keyboardType="phone-pad"
                      value={applyContact}
                      onChangeText={setApplyContact}
                  />

                  <TouchableOpacity onPress={handleConfirmApply} className="w-full bg-indigo-600 py-4 rounded-xl items-center mb-3">
                      <Text className="text-white font-bold text-lg">신청하기</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={() => setModalVisible(false)} className="w-full py-2 items-center">
                      <Text className="text-gray-400 font-bold">취소</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
  );
}