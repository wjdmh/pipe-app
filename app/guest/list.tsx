import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StatusBar, LogBox } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useGuest, GuestPost } from '../../hooks/useGuest';
import { auth } from '../../configs/firebaseConfig';

// ⚠️ VirtualizedLists 경고 무시
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);

const POSITIONS = { 'OH': '레프트', 'OP': '라이트', 'MB': '미들 블로커', 'S': '세터', 'L': '리베로' };

export default function GuestListScreen() {
  const router = useRouter();
  const { posts, loading, applyForGuest, cancelApplication } = useGuest();
  const [filterPos, setFilterPos] = useState<string>('all');

  const filteredPosts = posts.filter(p => filterPos === 'all' || (p.positions && p.positions.includes(filterPos)));

  const renderItem = ({ item }: { item: GuestPost }) => {
    const applicants = item.applicants || [];
    const isApplied = applicants.includes(auth.currentUser?.uid || '');
    const isMyPost = item.hostCaptainId === auth.currentUser?.uid;
    
    // 날짜 포맷팅
    let dateStr = item.matchDate;
    let timeStr = '';
    if(item.matchDate.includes('T')) {
        const d = new Date(item.matchDate);
        dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
        timeStr = `${d.getHours()}시`;
    }

    return (
      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={() => router.push(`/guest/${item.id}`)}
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
          <Text className="text-sm font-bold text-gray-500">
             회비: <Text className="text-indigo-600">{item.fee === '0' || item.fee === '무료' ? '무료' : `${item.fee}원`}</Text>
          </Text>
          
          {isMyPost ? (
            <TouchableOpacity 
              onPress={() => router.push({ pathname: '/guest/applicants', params: { postId: item.id } })}
              className="px-4 py-2 rounded-xl bg-slate-800 flex-row items-center"
            >
              <FontAwesome5 name="users" size={12} color="white" style={{ marginRight: 8 }} />
              <Text className="font-bold text-white text-xs">지원자 확인 ({applicants.length})</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              onPress={() => isApplied ? cancelApplication(item.id) : applyForGuest(item)}
              className={`px-4 py-2 rounded-xl ${isApplied ? 'bg-gray-200' : 'bg-indigo-600'}`}
            >
              <Text className={`font-bold ${isApplied ? 'text-gray-500' : 'text-white'}`}>
                {isApplied ? '신청 취소' : '게스트 지원'}
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
    </SafeAreaView>
  );
}