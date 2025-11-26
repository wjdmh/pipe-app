import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

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

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
        collection(db, "notifications"), 
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: NotificationData[] = [];
        snapshot.forEach(doc => {
            list.push({ id: doc.id, ...doc.data() } as NotificationData);
        });
        setNotifications(list);
        setLoading(false);
    }, (error) => {
        console.error("알림 로드 실패 (인덱스 필요 가능성):", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handlePress = async (item: NotificationData) => {
      try {
          // 확인된 알림 삭제
          await deleteDoc(doc(db, "notifications", item.id));
      } catch (e) {
          console.error("알림 삭제 실패", e);
      }

      if (item.link) {
          // 딥링크 처리 (쿼리 파라미터 포함)
          if (item.link.includes('?')) {
              const [path, query] = item.link.split('?');
              const params = Object.fromEntries(new URLSearchParams(query) as any);
              router.push({ pathname: path as any, params });
          } else {
              router.push(item.link as any);
          }
      }
  };

  const getIcon = (type: string) => {
      switch(type) {
          case 'applicant': return { name: 'user-plus', color: '#4f46e5' }; 
          case 'match_upcoming': return { name: 'clock-o', color: '#eab308' };
          case 'result_req': return { name: 'pencil-square-o', color: '#22c55e' };
          case 'admin_reply': return { name: 'envelope-o', color: '#ef4444' };
          default: return { name: 'bell-o', color: '#64748b' };
      }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`px-5 py-4 border-b border-slate-100 flex-row items-center`}>
            <TouchableOpacity onPress={() => router.back()} style={tw`mr-4`}>
                <FontAwesome name="arrow-left" size={20} color="#334155" />
            </TouchableOpacity>
            <Text style={tw`text-xl font-extrabold text-slate-800`}>알림 센터</Text>
        </View>

        {loading ? <ActivityIndicator style={tw`mt-10`} /> : (
            <FlatList
                data={notifications}
                keyExtractor={item => item.id}
                contentContainerStyle={tw`p-5`}
                ListEmptyComponent={
                    <View style={tw`items-center mt-20`}>
                        <FontAwesome name="bell-slash-o" size={40} color="#cbd5e1" />
                        <Text style={tw`text-slate-400 mt-4`}>새로운 알림이 없습니다.</Text>
                    </View>
                }
                renderItem={({ item }) => {
                    const icon = getIcon(item.type);
                    return (
                        <TouchableOpacity 
                            onPress={() => handlePress(item)}
                            style={tw`flex-row bg-white p-4 rounded-2xl mb-3 border border-slate-100 shadow-sm items-start`}
                        >
                            <View style={tw`w-10 h-10 rounded-full bg-slate-50 items-center justify-center mr-3`}>
                                <FontAwesome name={icon.name as any} size={18} color={icon.color} />
                            </View>
                            <View style={tw`flex-1`}>
                                <Text style={tw`font-bold text-slate-800 mb-1`}>{item.title}</Text>
                                <Text style={tw`text-slate-500 text-sm leading-5`}>{item.message}</Text>
                                <Text style={tw`text-slate-300 text-xs mt-2`}>{item.createdAt.split('T')[0]} {item.createdAt.split('T')[1].slice(0,5)}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                }}
            />
        )}
    </SafeAreaView>
  );
}