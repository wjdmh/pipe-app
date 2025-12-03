import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import tw from 'twrnc';
import { useGuest, GuestPost } from '../../hooks/useGuest';
import { auth } from '../../configs/firebaseConfig';

const POSITIONS = { 'L': '레프트', 'R': '라이트', 'C': '센터', 'S': '세터', 'Li': '리베로' };

export default function GuestListScreen() {
  const router = useRouter();
  const { posts, loading, applyForGuest, cancelApplication } = useGuest();
  const [filterPos, setFilterPos] = useState<string>('all');

  const filteredPosts = posts.filter(p => filterPos === 'all' || (p.positions && p.positions.includes(filterPos)));

  const renderItem = ({ item }: { item: GuestPost }) => {
    const isApplied = item.applicants?.includes(auth.currentUser?.uid || '');
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
      <View style={tw`bg-white p-5 rounded-2xl mb-4 border border-gray-100 shadow-sm`}>
        <View style={tw`flex-row justify-between items-start mb-3`}>
          <View>
            <View style={tw`flex-row items-center mb-1`}>
              <View style={tw`bg-indigo-50 px-2 py-1 rounded-lg mr-2`}>
                {/* [Fix] item.targetGender -> item.gender 로 수정 */}
                <Text style={tw`text-indigo-600 text-xs font-bold`}>{item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '무관'}</Text>
              </View>
              {item.positions && item.positions.map(pos => (
                <View key={pos} style={tw`bg-orange-50 px-2 py-1 rounded-lg mr-1`}>
                  <Text style={tw`text-orange-600 text-xs font-bold`}>{POSITIONS[pos as keyof typeof POSITIONS] || pos}</Text>
                </View>
              ))}
            </View>
            <Text style={tw`text-lg font-bold text-gray-900`}>{item.hostTeamName}</Text>
          </View>
          {isMyPost && <View style={tw`bg-gray-100 px-2 py-1 rounded`}><Text style={tw`text-xs text-gray-500`}>내 모집글</Text></View>}
        </View>

        <View style={tw`flex-row items-center mb-1`}>
          <FontAwesome5 name="clock" size={12} color="#64748b" style={tw`mr-2`} />
          <Text style={tw`text-gray-600 text-sm`}>{dateStr} {timeStr}</Text>
        </View>
        <View style={tw`flex-row items-center mb-4`}>
          <FontAwesome5 name="map-marker-alt" size={12} color="#64748b" style={tw`mr-2`} />
          <Text style={tw`text-gray-600 text-sm`}>{item.location}</Text>
        </View>

        <View style={tw`border-t border-gray-100 pt-3 flex-row justify-between items-center`}>
          <Text style={tw`text-sm font-bold text-gray-500`}>회비: <Text style={tw`text-indigo-600`}>{item.fee}</Text></Text>
          
          {!isMyPost && (
            <TouchableOpacity 
              onPress={() => isApplied ? cancelApplication(item.id) : applyForGuest(item)}
              style={tw`px-4 py-2 rounded-xl ${isApplied ? 'bg-gray-200' : 'bg-indigo-600'}`}
            >
              <Text style={tw`font-bold ${isApplied ? 'text-gray-500' : 'text-white'}`}>
                {isApplied ? '신청 취소' : '용병 지원'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <StatusBar barStyle="dark-content" />
      <View style={tw`px-5 py-4 bg-white border-b border-gray-100 flex-row justify-between items-center`}>
        <TouchableOpacity onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={20} color="#191F28" /></TouchableOpacity>
        <Text style={tw`text-lg font-bold text-gray-900`}>용병 찾기</Text>
        <TouchableOpacity onPress={() => router.push('/guest/write')}><FontAwesome5 name="plus" size={20} color="#4f46e5" /></TouchableOpacity>
      </View>

      <View style={tw`bg-white px-5 py-3 mb-2`}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', ...Object.keys(POSITIONS)]}
          keyExtractor={(i) => i}
          renderItem={({ item }) => (
            <TouchableOpacity 
              onPress={() => setFilterPos(item)}
              style={tw`mr-2 px-3 py-1.5 rounded-full border ${filterPos === item ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
            >
              <Text style={tw`text-xs font-bold ${filterPos === item ? 'text-white' : 'text-gray-500'}`}>
                {item === 'all' ? '전체' : POSITIONS[item as keyof typeof POSITIONS]}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={tw`mt-10`} color="#4f46e5" />
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={tw`p-5 pb-20`}
          ListEmptyComponent={<Text style={tw`text-center text-gray-400 mt-10`}>현재 모집 중인 용병 공고가 없습니다.</Text>}
        />
      )}
    </SafeAreaView>
  );
}