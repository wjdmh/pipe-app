import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useGuest, GuestPost } from '../../hooks/useGuest';
import tw from 'twrnc';

type UserProfile = {
    uid: string;
    name: string;
    phone?: string;
    position?: string;
    gender?: string;
};

export default function GuestApplicantsScreen() {
    const router = useRouter();
    const { postId } = useLocalSearchParams(); // URL 파라미터로 postId 받음
    const { acceptGuest } = useGuest();
    
    const [post, setPost] = useState<GuestPost | null>(null);
    const [applicants, setApplicants] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        loadData();
    }, [postId]);

    const loadData = async () => {
        if (typeof postId !== 'string') return;
        try {
            // 1. 모집글 정보 가져오기
            const postSnap = await getDoc(doc(db, "guest_posts", postId));
            if (!postSnap.exists()) {
                Alert.alert('오류', '존재하지 않는 게시글입니다.');
                router.back();
                return;
            }
            const postData = { id: postSnap.id, ...postSnap.data() } as GuestPost;
            setPost(postData);

            // 2. 신청자들의 프로필 가져오기
            const applicantIds = postData.applicants || [];
            const profiles: UserProfile[] = [];

            for (const uid of applicantIds) {
                const userSnap = await getDoc(doc(db, "users", uid));
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    profiles.push({
                        uid: uid,
                        name: userData.name || '이름 없음',
                        phone: userData.phoneNumber || userData.phone,
                        position: userData.position || '포지션 미정',
                        gender: userData.gender
                    });
                }
            }
            setApplicants(profiles);
        } catch (e) {
            console.error(e);
            Alert.alert('오류', '데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async (user: UserProfile) => {
        if (!post) return;
        Alert.alert('용병 확정', `${user.name}님을 용병으로 확정하시겠습니까?\n확정 시 모집글은 마감됩니다.`, [
            { text: '취소', style: 'cancel' },
            { 
                text: '확정하기', 
                onPress: async () => {
                    setProcessing(true);
                    const success = await acceptGuest(post, user.uid);
                    if (success) {
                        Alert.alert('완료', '매칭이 확정되었습니다!');
                        router.replace('/guest/list'); // 목록으로 돌아가기
                    }
                    setProcessing(false);
                }
            }
        ]);
    };

    const handleCall = (phoneNumber?: string) => {
        if (phoneNumber) Linking.openURL(`tel:${phoneNumber}`);
        else Alert.alert('알림', '전화번호 정보가 없습니다.');
    };

    if (loading) return <View style={tw`flex-1 justify-center items-center`}><ActivityIndicator color="#4f46e5"/></View>;

    return (
        <SafeAreaView style={tw`flex-1 bg-white`}>
            <View style={tw`px-5 py-4 border-b border-gray-100 flex-row items-center`}>
                <TouchableOpacity onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={20} color="#191F28" /></TouchableOpacity>
                <Text style={tw`text-lg font-bold ml-4 text-gray-900`}>신청자 관리</Text>
            </View>

            <View style={tw`p-5 border-b border-gray-100 bg-gray-50`}>
                <Text style={tw`text-gray-500 text-xs mb-1`}>모집 정보</Text>
                <Text style={tw`text-lg font-bold text-gray-900`}>{post?.matchDate.split('T')[0]} / {post?.location}</Text>
                <Text style={tw`text-indigo-600 font-bold text-sm`}>현재 지원자: {applicants.length}명</Text>
            </View>

            <FlatList 
                data={applicants}
                keyExtractor={item => item.uid}
                contentContainerStyle={tw`p-5`}
                ListEmptyComponent={<Text style={tw`text-center text-gray-400 mt-10`}>아직 신청자가 없습니다.</Text>}
                renderItem={({ item }) => (
                    <View style={tw`bg-white p-4 rounded-xl border border-gray-200 mb-3 flex-row justify-between items-center shadow-sm`}>
                        <View>
                            <View style={tw`flex-row items-center mb-1`}>
                                <Text style={tw`text-lg font-bold text-gray-900 mr-2`}>{item.name}</Text>
                                <View style={tw`bg-gray-100 px-2 py-0.5 rounded`}>
                                    <Text style={tw`text-xs text-gray-600 font-bold`}>{item.position}</Text>
                                </View>
                            </View>
                            <Text style={tw`text-gray-500 text-sm`}>{item.phone || '연락처 비공개'}</Text>
                        </View>
                        
                        <View style={tw`flex-row gap-2`}>
                            <TouchableOpacity 
                                onPress={() => handleCall(item.phone)}
                                style={tw`w-10 h-10 bg-green-50 rounded-full items-center justify-center border border-green-100`}
                            >
                                <FontAwesome5 name="phone-alt" size={16} color="#16a34a" />
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={() => handleAccept(item)}
                                disabled={processing}
                                style={tw`px-4 h-10 bg-indigo-600 rounded-xl items-center justify-center shadow-sm`}
                            >
                                <Text style={tw`text-white font-bold text-sm`}>수락</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />
        </SafeAreaView>
    );
}