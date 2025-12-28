import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { GuestPost } from '../hooks/useGuest'; 

const POSITION_MAP: Record<string, string> = { 
  'OH': '레프트', 'OP': '라이트', 'MB': '센터', 'S': '세터', 'L': '리베로', 
  '세터': '세터', '레프트': '레프트', '라이트': '라이트', '센터': '센터', '리베로': '리베로', '올라운더': '올라운더'
};

interface GuestCardProps {
  item: GuestPost;
  onPress: () => void;
  variant?: 'simple' | 'detailed'; 
}

export default function GuestCard({ item, onPress, variant = 'detailed' }: GuestCardProps) {
  
  const getDDay = (dateStr: string) => {
    try {
      const target = new Date(dateStr);
      const today = new Date();
      target.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 0) return '종료';
      if (diff === 0) return 'D-Day';
      return `D-${Math.ceil(diff)}`;
    } catch { return '-'; }
  };

  const formatDateTime = (dateStr: string) => {
    try {
        const d = new Date(dateStr);
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const day = days[d.getDay()];
        const hour = d.getHours().toString().padStart(2, '0');
        const minute = d.getMinutes().toString().padStart(2, '0');
        return `${month}.${date} (${day}) ${hour}:${minute}`;
    } catch { return '-'; }
  };

  const total = item.recruitmentCount || 1;
  // applicants 배열 안전 처리
  const safeApplicants = Array.isArray(item.applicants) ? item.applicants : [];
  const current = safeApplicants.filter((a: any) => 
      typeof a === 'string' ? false : a.status === 'accepted'
  ).length;
  const isFull = current >= total;

  const isRecruiting = item.status === 'recruiting' && !isFull;
  const statusColor = isRecruiting ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500';
  const statusText = isRecruiting ? '모집중' : '마감';

  const genderLabel = item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '혼성';
  const genderColor = item.gender === 'male' ? 'bg-blue-50 text-blue-600' : item.gender === 'female' ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600';

  // 🚨 [Fix] positions 데이터 안전 변환 (String -> Array)
  // 데이터가 문자열로 오더라도 여기서 배열로 변환해버리므로 .map 오류가 절대 나지 않습니다.
  let safePositions: string[] = [];
  if (Array.isArray(item.positions)) {
      safePositions = item.positions;
  } else if (typeof item.positions === 'string') {
      // @ts-ignore
      safePositions = item.positions.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  return (
    <TouchableOpacity 
      activeOpacity={0.9}
      onPress={onPress}
      className="bg-white rounded-2xl p-5 mb-3 border border-gray-100 shadow-sm"
    >
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2">
            <View className="bg-gray-900 px-2 py-1 rounded-md">
                <Text className="text-white text-[10px] font-bold">{getDDay(item.time)}</Text>
            </View>
            <Text className="text-gray-900 text-sm font-bold tracking-tight">
                {formatDateTime(item.time)}
            </Text>
        </View>
        <View className={`px-2 py-1 rounded-md ${statusColor.split(' ')[0]}`}>
            <Text className={`text-[10px] font-bold ${statusColor.split(' ')[1]}`}>{statusText}</Text>
        </View>
      </View>

      <View className="mb-4">
        <Text className="text-lg font-bold text-gray-900 mb-2 truncate" numberOfLines={1}>
            {item.hostTeamName || '팀명 미정'}
        </Text>
        
        <View className="flex-row flex-wrap gap-1.5">
            <View className={`px-2 py-1 rounded-lg ${genderColor.split(' ')[0]}`}>
                <Text className={`text-[11px] font-bold ${genderColor.split(' ')[1]}`}>{genderLabel}</Text>
            </View>
            
            {/* ✅ 안전한 배열(safePositions) 사용 */}
            {safePositions.map((pos, idx) => (
                <View key={idx} className="bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">
                    <Text className="text-orange-600 text-[11px] font-bold">
                        {POSITION_MAP[pos] || pos}
                    </Text>
                </View>
            ))}
        </View>
      </View>

      <View className="flex-row justify-between items-end pt-3 border-t border-gray-50">
          <View>
              <View className="flex-row items-center mb-1">
                  <FontAwesome5 name="map-marker-alt" size={11} color="#9CA3AF" style={{marginRight: 6}} />
                  <Text className="text-gray-500 text-xs font-medium truncate max-w-[180px]" numberOfLines={1}>
                      {item.location}
                  </Text>
              </View>
              <View className="flex-row items-center">
                  <FontAwesome5 name="coins" size={11} color="#9CA3AF" style={{marginRight: 6}} />
                  <Text className="text-gray-500 text-xs font-medium">
                      {item.fee === '0' || item.fee === '무료' || !item.fee ? '참가비 무료' : `${item.fee}원`}
                  </Text>
              </View>
          </View>

          <View className="items-end">
              <Text className="text-xs text-gray-400 font-medium mb-1">
                  신청 <Text className="text-indigo-600 font-bold">{current}</Text>
                  <Text className="text-gray-300"> / </Text>
                  {total}명
              </Text>
          </View>
      </View>
    </TouchableOpacity>
  );
}