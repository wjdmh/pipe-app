import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

type NotificationData = {
  id: string;
  type: 'applicant' | 'match_upcoming' | 'result_req' | 'admin_reply' | 'dispute';
  title: string;
  message: string;
  link?: string; 
  createdAt: string;
};

export default function NotificationScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNoti, setSelectedNoti] = useState<NotificationData | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, "notifications"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: NotificationData[] = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as NotificationData));
        setNotifications(list);
        setLoading(false);
    }, (error) => setLoading(false));
    return () => unsubscribe();
  }, []);

  const handlePress = (item: NotificationData) => {
      if (item.type === 'match_upcoming' || item.type === 'applicant' || item.type === 'result_req') {
          if (item.link) router.push(item.link as any);
      } else {
          setSelectedNoti(item);
      }
  };

  const getIcon = (type: string) => {
      switch(type) {
          case 'applicant': return { name: 'user-plus', color: '#3182F6' }; 
          case 'match_upcoming': return { name: 'clock', color: '#eab308' };
          case 'result_req': return { name: 'edit', color: '#22c55e' };
          case 'admin_reply': return { name: 'envelope-open-text', color: '#ef4444' };
          default: return { name: 'bell', color: '#64748b' };
      }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
        <View className="px-5 py-4 border-b border-gray-100 flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-4"><FontAwesome5 name="arrow-left" size={20} color="#333D4B" /></TouchableOpacity>
            <Text className="text-xl font-extrabold text-[#191F28]">알림 센터</Text>
        </View>
        {loading ? <ActivityIndicator className="mt-10" /> : (
            <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                contentContainerClassName="p-5"
                ListEmptyComponent={
                    <View className="items-center mt-20">
                        <FontAwesome5 name="bell-slash" size={40} color="#cbd5e1" />
                        <Text className="text-[#8B95A1] mt-4">새로운 알림이 없습니다.</Text>
                    </View>
                }
                renderItem={({ item }) => {
                    const icon = getIcon(item.type);
                    return (
                        <TouchableOpacity onPress={() => handlePress(item)} className="flex-row bg-white p-4 rounded-2xl mb-3 border border-gray-100 shadow-sm items-start">
                            <View className="w-10 h-10 rounded-full bg-gray-50 items-center justify-center mr-3"><FontAwesome5 name={icon.name} size={18} color={icon.color} /></View>
                            <View className="flex-1">
                                <Text className="font-bold text-[#191F28] mb-1">{item.title}</Text>
                                <Text className="text-[#4E5968] text-sm leading-5" numberOfLines={2}>{item.message}</Text>
                                <Text className="text-[#8B95A1] text-xs mt-2">{item.createdAt.split('T')[0]}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />
        )}
        <Modal visible={!!selectedNoti} transparent animationType="fade">
            <View className="flex-1 justify-center items-center bg-black/60 px-6">
                <View className="bg-white w-full rounded-2xl p-6 max-h-[70%]">
                    <View className="mb-4">
                        <Text className="text-lg font-bold text-[#191F28] mb-2">{selectedNoti?.title}</Text>
                        <Text className="text-xs text-[#8B95A1]">{selectedNoti?.createdAt.split('T')[0]}</Text>
                    </View>
                    <ScrollView className="mb-6">
                        <Text className="text-[#4E5968] text-base leading-6">{selectedNoti?.message}</Text>
                    </ScrollView>
                    <TouchableOpacity onPress={() => setSelectedNoti(null)} className="bg-[#3182F6] py-3 rounded-xl items-center">
                        <Text className="text-white font-bold">닫기</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    </SafeAreaView>
  );
}