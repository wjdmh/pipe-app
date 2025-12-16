import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../configs/firebaseConfig';
import { FontAwesome5 } from '@expo/vector-icons';

// [수정 완료] 불필요한 'expo-clipboard' import 구문을 삭제했습니다.

export default function GuestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (auth.currentUser) setCurrentUser(auth.currentUser);
    fetchPost();
  }, [id]);

  const fetchPost = async () => {
    if (typeof id !== 'string') return;
    try {
      const docRef = doc(db, "guest_posts", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setPost({ id: docSnap.id, ...docSnap.data() });
      } else {
        Alert.alert('오류', '존재하지 않는 게시글입니다.');
        router.back();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!post) return;

    // 1. 공유할 메시지 만들기
    // 날짜 포맷팅 안전 처리
    let dateStr = '날짜 미정';
    try {
        if(post.matchDate) {
            const d = new Date(post.matchDate);
            dateStr = d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
        }
    } catch(e) {}

    const positionsStr = post.positions?.join(', ') || '전 포지션';
    const title = `🏐 [용병모집] ${dateStr} @${post.location}`;
    const message = `${title}\n\n포지션: ${positionsStr}\n성별: ${post.gender === 'male' ? '남성' : post.gender === 'female' ? '여성' : '혼성'}\n참가비: ${post.fee === '0' || post.fee === '무료' ? '무료' : `${post.fee}원`}\n\n함께 배구하실 분 구해요! 👇`;
    
    // 링크 (웹 배포 주소가 있다면 교체, 없으면 임시 텍스트)
    // 실제 배포된 웹 주소가 있다면 여기에 넣으세요. 예: `https://myapp.com/guest/${id}`
    const url = Platform.OS === 'web' ? window.location.href : `https://pipe-app.web.app/guest/${id}`; 

    try {
        if (Platform.OS === 'web') {
            // 웹: 브라우저 내장 클립보드 API 사용 (라이브러리 불필요)
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(`${message}\n${url}`);
                window.alert('📋 공유 내용이 클립보드에 복사되었습니다.\n카카오톡 등에 붙여넣기 하세요!');
            } else {
                window.alert('이 브라우저에서는 공유 기능을 지원하지 않습니다.\n주소창의 링크를 복사해주세요.');
            }
        } else {
            // 앱: 네이티브 공유 시트 (카톡, 인스타 등 선택 가능)
            await Share.share({
                title: title,
                message: `${message}\n${url}`, // 안드로이드는 메시지에 URL 포함 권장
                url: url, // iOS는 URL 필드 별도 지원
            });
        }
    } catch (error) {
        console.error("Share Error:", error);
    }
  };

  const handleDelete = async () => {
      Alert.alert('게시글 삭제', '정말 삭제하시겠습니까?', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => {
              try {
                  await deleteDoc(doc(db, "guest_posts", id as string));
                  Alert.alert('삭제 완료', '게시글이 삭제되었습니다.');
                  router.replace('/guest/list');
              } catch(e) { Alert.alert('오류', '삭제 실패'); }
          }}
      ]);
  };

  const isOwner = currentUser?.uid === post?.hostCaptainId;

  if (loading) return <View className="flex-1 justify-center items-center bg-white"><ActivityIndicator color="#4F46E5"/></View>;
  if (!post) return null;

  const matchDate = new Date(post.matchDate);

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-5 pt-12 pb-4 flex-row justify-between items-center border-b border-gray-100 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
        </TouchableOpacity>
        <View className="flex-row gap-4">
            {/* 공유 버튼 */}
            <TouchableOpacity onPress={handleShare} className="p-2">
                <FontAwesome5 name="share-alt" size={20} color="#191F28" />
            </TouchableOpacity>
            {isOwner && (
                <TouchableOpacity onPress={() => router.push(`/guest/write?id=${id}`)} className="p-2">
                    <FontAwesome5 name="edit" size={20} color="#191F28" />
                </TouchableOpacity>
            )}
            {isOwner && (
                <TouchableOpacity onPress={handleDelete} className="p-2">
                    <FontAwesome5 name="trash" size={20} color="#FF6B6B" />
                </TouchableOpacity>
            )}
        </View>
      </View>

      <ScrollView contentContainerClassName="pb-32">
        {/* Main Info */}
        <View className="p-6 border-b border-gray-100">
            <View className="flex-row items-center mb-2">
                <Text className="text-[#4F46E5] font-bold text-sm bg-indigo-50 px-3 py-1 rounded-full mr-2">
                    {post.positions?.join(', ')}
                </Text>
                <Text className="text-gray-500 text-sm font-medium">
                    {post.gender === 'male' ? '남성' : post.gender === 'female' ? '여성' : '혼성'}
                </Text>
            </View>
            <Text className="text-2xl font-extrabold text-gray-900 mb-6 leading-tight">
                {post.hostTeamName}에서{'\n'}용병을 찾고 있어요
            </Text>

            <View className="gap-4">
                <View className="flex-row items-start">
                    <View className="w-8 pt-1"><FontAwesome5 name="calendar-alt" size={18} color="#9CA3AF" /></View>
                    <View>
                        <Text className="text-gray-900 font-bold text-lg">
                            {matchDate.getMonth()+1}월 {matchDate.getDate()}일 ({['일','월','화','수','목','금','토'][matchDate.getDay()]})
                        </Text>
                        <Text className="text-gray-500">
                            {matchDate.getHours() >= 12 ? '오후' : '오전'} {matchDate.getHours() % 12 || 12}시 {matchDate.getMinutes() > 0 ? `${matchDate.getMinutes()}분` : ''}
                        </Text>
                    </View>
                </View>
                <View className="flex-row items-start">
                    <View className="w-8 pt-1"><FontAwesome5 name="map-marker-alt" size={18} color="#9CA3AF" /></View>
                    <View className="flex-1">
                        <Text className="text-gray-900 font-bold text-lg">{post.location}</Text>
                    </View>
                </View>
                <View className="flex-row items-start">
                    <View className="w-8 pt-1"><FontAwesome5 name="coins" size={18} color="#9CA3AF" /></View>
                    <Text className="text-gray-900 font-bold text-lg">
                        {post.fee === '0' || post.fee === '무료' ? '참가비 없음' : `${Number(post.fee).toLocaleString()}원`}
                    </Text>
                </View>
            </View>
        </View>

        {/* Description */}
        <View className="p-6">
            <Text className="font-bold text-gray-900 mb-3 text-lg">상세 내용</Text>
            <Text className="text-gray-600 leading-6 text-base">{post.description || '작성된 상세 내용이 없습니다.'}</Text>
        </View>
      </ScrollView>

      {/* Footer Action */}
      <View className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-5 pb-8 shadow-lg">
        {!isOwner ? (
            <TouchableOpacity 
                onPress={() => router.push(`/guest/applicants?id=${post.id}`)}
                className="w-full bg-[#4F46E5] py-4 rounded-2xl items-center shadow-lg shadow-indigo-200 active:scale-95"
            >
                <Text className="text-white font-bold text-lg">신청하기</Text>
            </TouchableOpacity>
        ) : (
             <TouchableOpacity 
                onPress={() => router.push(`/guest/applicants?id=${post.id}&mode=owner`)}
                className="w-full bg-gray-900 py-4 rounded-2xl items-center active:scale-95"
            >
                <Text className="text-white font-bold text-lg">신청자 관리</Text>
            </TouchableOpacity>
        )}
      </View>
    </View>
  );
}