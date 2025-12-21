import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Modal, 
  Alert,
  Platform 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
// 👇 [Fix] 경로 수정: ../../ -> ../../ (firebaseConfig는 최상위에 있으므로 그대로)
import { db } from '../../configs/firebaseConfig';
// 👇 [Fix] 경로 수정: ../../ -> ../ (UserContext는 app 폴더 안에 있으므로 한 단계만 위로)
import { useUser } from '../context/UserContext';

// [타입 정의]
type TeamData = {
  id: string;
  name: string;
  affiliation: string;
  description?: string;
  captainId: string;
  stats: { wins: number; losses: number; points: number; total: number };
  region?: string;
  members?: string[];
  gender: 'male' | 'female' | 'mixed';
};

type MatchHistory = {
  id: string;
  result: 'win' | 'loss' | 'draw' | 'unknown';
  opponentName: string;
  date: string;
};

export default function TeamDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useUser(); // 현재 로그인한 유저 정보

  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<MatchHistory[]>([]);
  
  // 관리자 메뉴 모달 상태
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  const teamId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    if (teamId) {
      fetchTeamData(teamId);
      // fetchMatchHistory(teamId); // 추후 매치 결과 로직 구현 시 활성화
    }
  }, [teamId]);

  // 팀 정보 가져오기
  const fetchTeamData = async (tid: string) => {
    try {
      setLoading(true);
      const docRef = doc(db, "teams", tid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setTeam({
            id: docSnap.id,
            name: data.name,
            affiliation: data.affiliation || '소속 없음',
            description: data.description,
            captainId: data.captainId,
            stats: data.stats || { wins: 0, losses: 0, points: 0, total: 0 },
            region: data.region,
            members: data.members || [],
            gender: data.gender || 'mixed',
        });
      } else {
        Alert.alert("오류", "팀 정보를 찾을 수 없습니다.");
        router.back();
      }
    } catch (e) {
      console.error("Team Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  // 관리자 권한 확인 (내 팀인지?)
  const isCaptain = user && team && user.uid === team.captainId;

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!team) return null;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* 1. Header */}
      <View className="px-5 py-3 flex-row items-center justify-between bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        
        {/* 관리자(팀장)에게만 보이는 설정 버튼 */}
        {isCaptain && (
            <TouchableOpacity onPress={() => setShowAdminMenu(true)} className="p-2 -mr-2">
                <FontAwesome5 name="cog" size={20} color="#4B5563" />
            </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        {/* 2. Hero Section (팀 브랜딩) */}
        <View className="items-center py-8 bg-indigo-50/50">
            <View className="w-24 h-24 rounded-full bg-white items-center justify-center shadow-sm border border-indigo-100 mb-4">
                <FontAwesome5 name="users" size={32} color="#4F46E5" />
            </View>
            <Text className="text-2xl font-black text-gray-900 mb-1">{team.name}</Text>
            <Text className="text-gray-500 font-medium mb-4">{team.affiliation} · {team.region || '지역 미정'}</Text>
            
            {/* 전적 요약 뱃지 */}
            <View className="flex-row gap-3">
                <View className="items-center px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-100">
                    <Text className="text-gray-400 text-xs font-bold mb-0.5">승점</Text>
                    <Text className="text-gray-900 text-lg font-black italic">{team.stats.points}</Text>
                </View>
                <View className="items-center px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-100">
                    <Text className="text-gray-400 text-xs font-bold mb-0.5">승률</Text>
                    <Text className="text-indigo-600 text-lg font-black italic">
                        {team.stats.total > 0 ? Math.round((team.stats.wins / team.stats.total) * 100) : 0}%
                    </Text>
                </View>
            </View>
        </View>

        {/* 3. Team Description */}
        <View className="px-5 py-6 border-b border-gray-100">
            <Text className="text-gray-900 font-bold text-lg mb-2">팀 소개</Text>
            <Text className="text-gray-600 leading-relaxed">
                {team.description || "아직 작성된 팀 소개가 없습니다."}
            </Text>
        </View>

        {/* 4. Match History (Empty State UX) */}
        <View className="px-5 py-6">
            <View className="flex-row justify-between items-center mb-4">
                <Text className="text-gray-900 font-bold text-lg">최근 전적</Text>
            </View>

            {history.length === 0 ? (
                <View className="bg-gray-50 rounded-2xl p-8 items-center justify-center border border-gray-100 border-dashed">
                    <FontAwesome5 name="volleyball-ball" size={32} color="#D1D5DB" style={{ marginBottom: 16 }} />
                    <Text className="text-gray-900 font-bold text-base mb-1">아직 진행한 매치가 없어요</Text>
                    <Text className="text-gray-500 text-sm text-center mb-6">
                        새로운 교류전을 시작하고{'\n'}첫 승리의 주인공이 되어보세요!
                    </Text>
                    
                    <TouchableOpacity 
                        onPress={() => router.push('/home')} // 매치 리스트(홈)로 이동
                        className="bg-indigo-600 px-6 py-3 rounded-xl shadow-sm active:scale-95"
                    >
                        <Text className="text-white font-bold">매치 둘러보기</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View>
                    <Text>전적 리스트가 여기에 표시됩니다.</Text>
                </View>
            )}
        </View>
      </ScrollView>

      {/* 5. Admin Bottom Sheet (Modal) */}
      <Modal
        visible={showAdminMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAdminMenu(false)}
      >
        <TouchableOpacity 
            className="flex-1 bg-black/40 justify-end"
            activeOpacity={1} 
            onPress={() => setShowAdminMenu(false)}
        >
            <View className="bg-white rounded-t-3xl p-6 pb-10">
                <View className="w-12 h-1 bg-gray-300 rounded-full self-center mb-6" />
                <Text className="text-xl font-bold text-gray-900 mb-6 px-2">팀 관리</Text>
                
                <TouchableOpacity className="flex-row items-center p-4 bg-gray-50 rounded-xl mb-3 active:bg-gray-100">
                    <View className="w-10 h-10 rounded-full bg-blue-100 items-center justify-center mr-4">
                        <FontAwesome5 name="edit" size={18} color="#2563EB" />
                    </View>
                    <View>
                        <Text className="text-gray-900 font-bold text-base">팀 정보 수정</Text>
                        <Text className="text-gray-500 text-xs">로고, 소개글, 지역 변경</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity className="flex-row items-center p-4 bg-gray-50 rounded-xl mb-3 active:bg-gray-100">
                    <View className="w-10 h-10 rounded-full bg-green-100 items-center justify-center mr-4">
                        <FontAwesome5 name="users-cog" size={18} color="#16A34A" />
                    </View>
                    <View>
                        <Text className="text-gray-900 font-bold text-base">멤버 관리</Text>
                        <Text className="text-gray-500 text-xs">가입 신청 수락, 멤버 방출</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity className="flex-row items-center p-4 bg-gray-50 rounded-xl mb-2 active:bg-gray-100">
                    <View className="w-10 h-10 rounded-full bg-orange-100 items-center justify-center mr-4">
                        <FontAwesome5 name="clipboard-list" size={18} color="#EA580C" />
                    </View>
                    <View>
                        <Text className="text-gray-900 font-bold text-base">매치 관리</Text>
                        <Text className="text-gray-500 text-xs">신청 내역 확인, 결과 입력</Text>
                    </View>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}