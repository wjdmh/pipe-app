import React, { useState, useMemo } from 'react';
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
  Alert,
  Platform,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useGuest, GuestPost } from '../../hooks/useGuest';
import { auth } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext';
import GuestCard from '../../components/GuestCard'; 

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

// [Fix] DB 저장 값(한글)과 일치하도록 상수 통일
const POSITIONS = ['세터', '레프트', '라이트', '센터', '리베로', '올라운더'];

export default function GuestListScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { posts, loading, applyForGuest, cancelApplication } = useGuest();
  const [filterPos, setFilterPos] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  // 신청 모달 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<GuestPost | null>(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applyContact, setApplyContact] = useState('');

  // [Logic] 필터링 및 정렬 (지난 일정 숨김 + 최신순)
  const filteredPosts = useMemo(() => {
      const now = new Date();
      
      const active = posts.filter(p => {
          // 1. 시간 필터: 이미 지난 경기는 리스트에서 숨김
          const matchTime = new Date(p.matchDate || p.time);
          if (matchTime < now) return false;

          // 2. 포지션 필터
          if (filterPos === 'all') return true;
          // DB에 문자열("세터") 혹은 배열(["세터", "라이트"])로 저장될 수 있음
          const pPositions = Array.isArray(p.positions) ? p.positions : (p.positions ? [p.positions] : []);
          return pPositions.includes(filterPos);
      });

      // 3. 정렬: 경기 시간이 가까운 순서대로
      return active.sort((a, b) => {
          const timeA = new Date(a.matchDate || a.time).getTime();
          const timeB = new Date(b.matchDate || b.time).getTime();
          return timeA - timeB;
      });
  }, [posts, filterPos]);

  // 당겨서 새로고침 (실제 데이터는 useGuest에서 실시간이지만 UX를 위해 추가)
  const onRefresh = () => {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 1000);
  };

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
        const msg = "호스트가 연락할 수 있는 전화번호를 입력해주세요.";
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert("알림", msg);
        return;
    }

    await applyForGuest(selectedPost, applyMessage, applyContact);
    
    setModalVisible(false);
    setApplyMessage('');
    setApplyContact('');
    setSelectedPost(null);
  };

  const renderItem = ({ item }: { item: GuestPost }) => {
    const myUid = auth.currentUser?.uid;
    // applicants 배열 안전 처리
    const safeApplicants = Array.isArray(item.applicants) ? item.applicants : [];
    
    const isApplied = safeApplicants.some((a: any) => 
        typeof a === 'string' ? a === myUid : a.uid === myUid
    );
    const isMyPost = item.hostCaptainId === myUid;
    
    const totalRecruit = item.recruitmentCount || 1;
    // 확정된 인원 수 계산
    const currentAccepted = safeApplicants.filter((a: any) => typeof a !== 'string' && a.status === 'accepted').length;
    const isFull = currentAccepted >= totalRecruit;

    // 액션 버튼 정의
    let ActionButton = null;

    if (isMyPost) {
        // 내 글일 때: 관리 버튼
        ActionButton = (
            <TouchableOpacity 
                onPress={() => router.push({ pathname: '/guest/applicants', params: { id: item.id } })}
                className="bg-slate-800 px-4 py-2 rounded-xl flex-row items-center shadow-sm"
            >
                <FontAwesome5 name="users" size={10} color="white" style={{marginRight:6}} />
                <Text className="text-white font-bold text-xs">관리</Text>
            </TouchableOpacity>
        );
    } else {
        // 남의 글일 때
        if (isApplied) {
            ActionButton = (
                <TouchableOpacity 
                    onPress={() => cancelApplication(item.id)}
                    className="bg-gray-200 px-4 py-2 rounded-xl"
                >
                    <Text className="text-gray-600 font-bold text-xs">신청 취소</Text>
                </TouchableOpacity>
            );
        } else {
            ActionButton = (
                <TouchableOpacity 
                    onPress={() => isFull ? null : openApplyModal(item)}
                    disabled={isFull}
                    className={`px-4 py-2 rounded-xl shadow-sm ${isFull ? 'bg-gray-300' : 'bg-indigo-600'}`}
                >
                    <Text className="text-white font-bold text-xs">
                        {isFull ? '모집 마감' : '간편 지원'}
                    </Text>
                </TouchableOpacity>
            );
        }
    }

    return (
      <View className="mb-4">
        <GuestCard 
            item={item} 
            onPress={() => router.push(`/guest/${item.id}` as any)} 
            variant="detailed"
            actionButton={ActionButton}
        />
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View className="px-5 py-4 bg-white border-b border-gray-100 flex-row justify-between items-center">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">게스트 찾기</Text>
        <TouchableOpacity onPress={() => router.push('/guest/write')} className="p-2 -mr-2">
            <FontAwesome5 name="plus" size={20} color="#4f46e5" />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View className="bg-white px-5 py-3 mb-2 shadow-sm">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', ...POSITIONS]}
          keyExtractor={(i) => i}
          renderItem={({ item }) => (
            <TouchableOpacity 
              onPress={() => setFilterPos(item)}
              className={`mr-2 px-4 py-2 rounded-full border ${filterPos === item ? 'bg-indigo-600 border-indigo-600' : 'bg-gray-50 border-gray-200'}`}
            >
              <Text className={`text-xs font-bold ${filterPos === item ? 'text-white' : 'text-gray-500'}`}>
                {item === 'all' ? '전체' : item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator className="mt-20" size="large" color="#4f46e5" />
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20">
                <FontAwesome5 name="clipboard-list" size={48} color="#E5E7EB" style={{marginBottom:16}} />
                <Text className="text-center text-gray-400 font-bold mb-1">모집 중인 게스트 공고가 없습니다.</Text>
                <Text className="text-center text-gray-300 text-xs">지난 일정은 보이지 않습니다.</Text>
            </View>
          }
        />
      )}

      {/* Application Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
          <View className="flex-1 bg-black/60 justify-center items-center p-6">
              <View className="bg-white w-full rounded-2xl p-6 shadow-xl">
                  <Text className="text-xl font-bold text-gray-900 mb-1">게스트 지원하기</Text>
                  <Text className="text-sm text-gray-500 mb-6">{selectedPost?.hostTeamName || '팀'} 호스트에게 전달됩니다.</Text>

                  <Text className="text-xs font-bold text-gray-500 mb-1 ml-1">한마디 (각오 등)</Text>
                  <TextInput 
                      className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base mb-4"
                      placeholder="예) 레프트 포지션 자신 있습니다!"
                      value={applyMessage}
                      onChangeText={setApplyMessage}
                      multiline
                  />

                  <Text className="text-xs font-bold text-gray-500 mb-1 ml-1">연락처 (필수)</Text>
                  <TextInput 
                      className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-base mb-6"
                      placeholder="010-0000-0000"
                      keyboardType="phone-pad"
                      value={applyContact}
                      onChangeText={setApplyContact}
                  />

                  <TouchableOpacity onPress={handleConfirmApply} className="w-full bg-indigo-600 py-4 rounded-xl items-center mb-3">
                      <Text className="text-white font-bold text-lg">지원하기</Text>
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