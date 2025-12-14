import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminInquiries() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  const [replyText, setReplyText] = useState('');

  const fetchInquiries = async () => {
    try {
      const q = query(collection(db, "inquiries"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setInquiries(list);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchInquiries(); }, []);

  const handleReply = async () => {
      if(!replyText.trim()) return;
      try {
          // 1. 문의 상태 업데이트
          await updateDoc(doc(db, "inquiries", selectedInquiry.id), {
              status: 'replied',
              reply: replyText
          });

          // 2. 유저에게 알림 발송
          await addDoc(collection(db, "notifications"), {
              userId: selectedInquiry.uid,
              type: 'admin_reply',
              title: '문의에 대한 답변이 도착했습니다.',
              message: `관리자: ${replyText}`,
              createdAt: new Date().toISOString(),
              isRead: false
          });

          Alert.alert('완료', '답변이 전송되었습니다.');
          setReplyModalVisible(false);
          setReplyText('');
          fetchInquiries();
      } catch(e) {
          Alert.alert('오류', '전송 실패');
      }
  };

  return (
    <SafeAreaView className={`flex-1 bg-slate-900 px-5`}>
      <View className={`flex-row items-center mb-6 pt-2`}>
        <TouchableOpacity onPress={() => router.back()} className={`mr-4 bg-slate-800 p-2 rounded-lg`}>
            <FontAwesome name="arrow-left" size={16} color="white" />
        </TouchableOpacity>
        <Text className={`text-2xl font-bold text-white`}>Q&A 수신함</Text>
      </View>
      
      {loading ? <ActivityIndicator color="white" /> : (
        <FlatList
          data={inquiries}
          keyExtractor={item => item.id}
          ListEmptyComponent={<Text className={`text-slate-500 text-center mt-10`}>접수된 문의가 없습니다.</Text>}
          renderItem={({ item }) => (
            <View className={`bg-slate-800 p-4 rounded-xl mb-3 border ${item.status === 'replied' ? 'border-green-600' : 'border-slate-700'}`}>
                <View className={`flex-row justify-between mb-2`}>
                    <Text className={`text-indigo-400 font-bold`}>{item.email}</Text>
                    <Text className={`text-slate-500 text-xs`}>{item.createdAt?.split('T')[0]}</Text>
                </View>
                <Text className={`text-white leading-5`}>{item.text}</Text>
                
                {item.status === 'replied' ? (
                    <View className={`mt-3 bg-green-900/30 p-2 rounded-lg`}>
                        <Text className={`text-green-400 text-xs font-bold`}>답변 완료: {item.reply}</Text>
                    </View>
                ) : (
                    <View className={`mt-3 flex-row justify-end`}>
                        <TouchableOpacity 
                            onPress={() => { setSelectedInquiry(item); setReplyModalVisible(true); }}
                            className={`bg-indigo-600 px-4 py-2 rounded-lg`}
                        >
                            <Text className={`text-white text-xs font-bold`}>답변하기</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
          )}
        />
      )}

      {/* 답변 작성 모달 (키보드 회피 적용) */}
      <Modal visible={replyModalVisible} transparent animationType="fade">
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className={`flex-1 justify-center bg-black/70 px-6`}
          >
              <View className={`bg-slate-800 p-6 rounded-2xl`}>
                  <Text className={`text-white font-bold text-lg mb-4`}>답변 작성</Text>
                  <Text className={`text-slate-400 text-xs mb-2`}>To: {selectedInquiry?.email}</Text>
                  
                  <TextInput 
                    className={`bg-slate-900 text-white p-4 rounded-xl border border-slate-700 h-32 mb-4`}
                    multiline
                    textAlignVertical="top"
                    value={replyText}
                    onChangeText={setReplyText}
                    placeholder="답변 내용을 입력하세요..."
                    placeholderTextColor="#64748b"
                  />
                  
                  <View className={`flex-row gap-3`}>
                      <TouchableOpacity onPress={() => setReplyModalVisible(false)} className={`flex-1 bg-slate-700 p-3 rounded-xl items-center`}>
                          <Text className={`text-slate-300 font-bold`}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleReply} className={`flex-1 bg-indigo-600 p-3 rounded-xl items-center`}>
                          <Text className={`text-white font-bold`}>전송</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}