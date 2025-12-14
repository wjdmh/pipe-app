import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../configs/firebaseConfig';
import { useGuest, GuestPost } from '../../hooks/useGuest';

const POSITIONS = { 'OH': '아웃사이드 히터', 'OP': '아포짓', 'MB': '미들 블로커', 'S': '세터', 'L': '리베로' };

export default function GuestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { applyForGuest, cancelApplication, deletePost } = useGuest();
  
  const [post, setPost] = useState<GuestPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => { loadPost(); }, [id]);

  const loadPost = async () => {
    if (typeof id !== 'string') return;
    try {
        const snap = await getDoc(doc(db, "guest_posts", id));
        if (snap.exists()) {
            setPost({ id: snap.id, ...snap.data() } as GuestPost);
        } else {
            Alert.alert('알림', '삭제되거나 문제가 있는 게시글에요.');
            router.back();
        }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleDelete = () => {
      Alert.alert('삭제 확인', '정말 이 모집글을 삭제할까요?', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
              if(!post) return;
              const success = await deletePost(post.id);
              if(success) { 
                  Alert.alert('완료', '삭제되었어요.'); 
                  router.back(); 
              }
          }}
      ]);
  };

  const handleAction = async () => {
      if(!post) return;
      setIsProcessing(true);
      
      // 이미 신청했으면 취소, 아니면 신청
      if (isApplied) await cancelApplication(post.id);
      else await applyForGuest(post);
      
      await loadPost(); // 상태 업데이트
      setIsProcessing(false);
  };

  if (loading) return <View className="flex-1 justify-center items-center"><ActivityIndicator /></View>;
  if (!post) return null;

  const isMyPost = post.hostCaptainId === auth.currentUser?.uid;
  const isApplied = post.applicants?.includes(auth.currentUser?.uid || '');
  
  // 날짜/시간 포맷팅
  let dateStr = post.matchDate;
  let timeStr = '';
  if (post.matchDate.includes('T')) {
      const d = new Date(post.matchDate);
      dateStr = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      timeStr = `${d.getHours()}시`;
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 py-4 border-b border-gray-100 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">모집 상세</Text>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerClassName="p-6 pb-32">
        <View className="flex-row gap-2 mb-4">
            <View className="bg-indigo-50 px-3 py-1 rounded-lg">
                <Text className="text-indigo-600 font-bold text-xs">{post.gender === 'male' ? '남성' : post.gender === 'female' ? '여성' : '혼성'}</Text>
            </View>
            {post.positions.map(p => (
                <View key={p} className="bg-orange-50 px-3 py-1 rounded-lg">
                    <Text className="text-orange-600 font-bold text-xs">{POSITIONS[p as keyof typeof POSITIONS] || p}</Text>
                </View>
            ))}
        </View>

        <Text className="text-2xl font-extrabold text-gray-900 mb-1">{post.hostTeamName}</Text>
        <Text className="text-gray-500 mb-6 font-bold">{post.status === 'recruiting' ? '현재 모집 중 🔥' : '모집이 마감되었어요'}</Text>

        <View className="bg-gray-50 p-5 rounded-2xl gap-4 mb-6">
            <View className="flex-row items-center">
                <View className="w-8"><FontAwesome5 name="clock" size={16} color="#64748b" /></View>
                <Text className="text-gray-700 font-bold text-base">{dateStr} {timeStr}</Text>
            </View>
            <View className="flex-row items-center">
                <View className="w-8"><FontAwesome5 name="map-marker-alt" size={16} color="#64748b" /></View>
                <Text className="text-gray-700 font-bold text-base">{post.location}</Text>
            </View>
            <View className="flex-row items-center">
                <View className="w-8"><FontAwesome5 name="coins" size={16} color="#64748b" /></View>
                <Text className="text-gray-700 font-bold text-base">
                    {post.fee === '0' || post.fee === '무료' ? '참가비 없음' : `${post.fee}원`}
                </Text>
            </View>
        </View>

        <Text className="text-lg font-bold text-gray-900 mb-2">상세 내용</Text>
        <View className="bg-white border border-gray-100 p-4 rounded-xl min-h-[100px]">
            <Text className="text-gray-600 leading-6">{post.description || '상세 내용이 없어요'}</Text>
        </View>
      </ScrollView>

      {/* 하단 버튼 영역 */}
      <View className="absolute bottom-0 w-full bg-white px-5 pt-4 pb-8 border-t border-gray-100">
        {isMyPost ? (
            <View className="flex-row gap-3">
                {/* [Issue 1 Solution] 신청자 관리 페이지로 이동 */}
                <TouchableOpacity onPress={() => router.push({ pathname: '/guest/applicants', params: { postId: post.id } })} className="flex-1 bg-slate-800 py-4 rounded-xl items-center">
                    <Text className="text-white font-bold">신청자 확인 ({post.applicants?.length || 0})</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} className="bg-red-50 px-5 rounded-xl items-center justify-center border border-red-100">
                    <FontAwesome5 name="trash" size={18} color="#ef4444" />
                </TouchableOpacity>
            </View>
        ) : (
            <TouchableOpacity 
                onPress={handleAction} 
                disabled={isProcessing || post.status !== 'recruiting'}
                className={`w-full py-4 rounded-xl items-center ${isApplied ? 'bg-gray-200' : post.status === 'recruiting' ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
                {isProcessing ? <ActivityIndicator color={isApplied ? 'gray' : 'white'} /> : 
                <Text className={`font-bold text-lg ${isApplied ? 'text-gray-500' : 'text-white'}`}>
                    {post.status !== 'recruiting' ? '모집 마감' : isApplied ? '신청 취소하기' : '용병 지원하기'}
                </Text>}
            </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}