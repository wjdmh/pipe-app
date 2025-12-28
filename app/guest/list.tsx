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
  Alert, 
  Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useGuest, GuestPost } from '../../hooks/useGuest';
import { auth } from '../../configs/firebaseConfig';
import { useUser } from '../context/UserContext'; // ✅ 유저 정보 가져오기 (연락처 자동완성용)

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

const POSITIONS = { 'OH': '레프트', 'OP': '라이트', 'MB': '미들 블로커', 'S': '세터', 'L': '리베로' };

export default function GuestListScreen() {
  const router = useRouter();
  const { user } = useUser(); // ✅ 내 정보 가져오기
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
    setApplyMessage('열심히 하겠습니다!'); // 기본 메시지
    setApplyContact(user?.phoneNumber || ''); // ✅ 내 연락처 자동 입력
    setModalVisible(true);
  };

  // 모달 내 "확인" 버튼 클릭 시 실제 신청
  const handleConfirmApply = async () => {
    if (!selectedPost) return;
    if (!applyContact.trim()) {
        Alert.alert("알림", "호스트가 연락할 수 있는 전화번호를 입력해주세요.");
        return;
    }

    // useGuest의 applyForGuest 호출 (인자: post, message, contact)
    // ⚠️ 다음 단계에서 useGuest.ts를 수정해야 이 부분이 정상 동작합니다.
    await applyForGuest(selectedPost, applyMessage, applyContact);
    
    setModalVisible(false);
    setApplyMessage('');
    setApplyContact('');
    setSelectedPost(null);
  };

  const renderItem = ({ item }: { item: GuestPost }) => {
    // applicants가 객체 배열인지 문자열 배열인지 체크 (하위 호환성)
    const isApplied = item.applicants?.some((a: any) => 
        typeof a === 'string' ? a === auth.currentUser?.uid : a.uid === auth.currentUser?.uid
    );
    const isMyPost = item.hostCaptainId === auth.currentUser?.uid;
    
    // 날짜 포맷팅
    let dateStr = item.matchDate;
    let timeStr = '';
    if(item.matchDate.includes('T')) {
        const d = new Date(item.matchDate);
        dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        timeStr = `${d.getHours()}시 ${d.getMinutes()}분`;
    }

    // 모집 인원 표시 (기본값 1명)
    // @ts-ignore (Phase 1-1에서 추가된 필드)
    const totalRecruit = item.recruitmentCount || 1;
    const currentAccepted = item.applicants?.filter((a: any) => typeof a !== 'string' && a.status === 'accepted').length || 0;
    const isFull = currentAccepted >= totalRecruit;

    return (
      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={() => router.push(`/guest/${item.id}` as any)}
        className="bg-white p-5 rounded-2xl mb-4 border border-gray-100 shadow-sm"
      >
        <View className="flex-row justify-between items-start mb-3">
          <View>
            <View className="flex-row items-center mb-1">
              <View className="bg-indigo-50 px-2 py-1 rounded-lg mr-2">
                <Text className="text-indigo-600 text-xs font-bold">{item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '무관'}</Text>
              </View>
              {item.positions && item.positions.map(pos => (
                <View key={pos} className="bg-orange-50 px-2 py-1 rounded-lg mr-1">
                  <Text className="text-orange-600 text-xs font-bold">{POSITIONS[pos as keyof typeof POSITIONS] || pos}</Text>
                </View>
              ))}
            </View>
            <Text className="text-lg font-bold text-gray-900">{item.hostTeamName}</Text>
          </View>
          {isMyPost && <View className="bg-gray-100 px-2 py-1 rounded"><Text className="text-xs text-gray-500">내 모집글</Text></View>}
        </View>

        <View className="flex-row items-center mb-1">
          <FontAwesome5 name="clock" size={12} color="#64748b" style={{ marginRight: 8 }} />
          <Text className="text-gray-600 text-sm">{dateStr} {timeStr}</Text>
        </View>
        <View className="flex-row items-center mb-4">
          <FontAwesome5 name="map-marker-alt" size={12} color="#64748b" style={{ marginRight: 8 }} />
          <Text className="text-gray-600 text-sm">{item.location}</Text>
        </View>

        <View className="border-t border-gray-100 pt-3 flex-row justify-between items-center">
          <View>
             <Text className="text-sm font-bold text-gray-500">
                회비: <Text className="text-indigo-600">{item.fee === '0' || item.fee === '무료' || !item.fee ? '무료' : `${item.fee}원`}</Text>
             </Text>
             <Text className="text-xs text-gray-400 mt-1">
                모집 현황: <Text className="font-bold text-gray-600">{currentAccepted} / {totalRecruit}명</Text>
             </Text>
          </View>
          
          {isMyPost ? (
            <TouchableOpacity 
              onPress={() => router.push({ pathname: '/guest/applicants', params: { id: item.id } })}
              className="px-4 py-2 rounded-xl bg-slate-800 flex-row items-center"
            >
              <FontAwesome5 name="users" size={12} color="white" style={{ marginRight: 8 }} />
              <Text className="font-bold text-white text-xs">신청자 확인 ({item.applicants?.length || 0})</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              onPress={() => isApplied ? cancelApplication(item.id) : openApplyModal(item)}
              disabled={isFull && !isApplied}
              className={`px-4 py-2 rounded-xl ${isApplied ? 'bg-gray-200' : isFull ? 'bg-gray-300' : 'bg-indigo-600'}`}
            >
              <Text className={`font-bold ${isApplied ? 'text-gray-500' : 'text-white'}`}>
                {isApplied ? '신청 취소' : isFull ? '모집 마감' : '게스트 지원'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
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

      {/* ✅ 신청 모달 (Apply Modal) */}
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