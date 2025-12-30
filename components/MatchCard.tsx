import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

// 매치 데이터 타입 정의
export interface MatchData {
  id: string;
  teamName?: string; // [Fix] 신규 코드: write.tsx에서 저장하는 필드명
  team?: string;     // [Fix] 기존 코드: home/index.tsx에서 참조하던 필드명 (하위 호환)
  type: '6man' | '9man';
  gender: 'male' | 'female' | 'mixed';
  level?: 'High' | 'Mid' | 'Low'; 
  time: string;
  loc: string;
  status: string;
  applicants?: any[]; 
  matchDate?: string; 
}

interface MatchCardProps {
  item: MatchData;
  onPress: () => void;
}

export default function MatchCard({ item, onPress }: MatchCardProps) {
  
  // 1. D-Day 계산
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

  // 2. 날짜 및 시간 포맷팅
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

  // 3. 상태 뱃지 처리
  const isRecruiting = item.status === 'recruiting';
  const statusColor = isRecruiting ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500';
  const statusText = isRecruiting ? '신청가능' : '마감';

  // 4. 태그 라벨 및 색상 설정
  const genderLabel = item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '혼성';
  const genderColor = item.gender === 'male' ? 'bg-blue-50 text-blue-600' : item.gender === 'female' ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600';
  
  const typeLabel = item.type === '6man' ? '6인제' : '9인제';
  const levelLabel = item.level === 'High' ? '상' : item.level === 'Mid' ? '중' : item.level === 'Low' ? '하' : null;

  // 5. [핵심 수정] 팀명 안전 처리 (버그 해결)
  // 데이터에 teamName(신규)이 있으면 우선 사용하고, 없으면 team(기존)을 사용
  const displayTeamName = item.teamName || item.team || '팀명 미정';

  return (
    <TouchableOpacity 
      activeOpacity={0.9}
      onPress={onPress}
      className="bg-white rounded-2xl p-5 mb-3 border border-gray-100 shadow-sm"
    >
      {/* [Header] D-Day | 날짜 | 상태 */}
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

      {/* [Body] 팀명 | 태그 영역 */}
      <View className="mb-4">
        <Text className="text-lg font-bold text-gray-900 mb-2 truncate" numberOfLines={1}>
            {displayTeamName}
        </Text>
        
        <View className="flex-row flex-wrap gap-1.5">
            {/* 성별 태그 */}
            <View className={`px-2 py-1 rounded-lg ${genderColor.split(' ')[0]}`}>
                <Text className={`text-[11px] font-bold ${genderColor.split(' ')[1]}`}>{genderLabel}</Text>
            </View>
            
            {/* 경기 방식 태그 */}
            <View className="bg-gray-100 px-2 py-1 rounded-lg">
                 <Text className="text-gray-600 text-[11px] font-bold">{typeLabel}</Text>
            </View>

            {/* 레벨 태그 (데이터가 있을 때만 표시) */}
            {levelLabel && (
                <View className="bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-100">
                    <Text className="text-yellow-700 text-[11px] font-bold">LV. {levelLabel}</Text>
                </View>
            )}
        </View>
      </View>

      {/* [Footer] 장소 */}
      <View className="flex-row items-center pt-3 border-t border-gray-50">
          <FontAwesome5 name="map-marker-alt" size={12} color="#9CA3AF" style={{marginRight: 6}} />
          <Text className="text-gray-500 text-xs font-medium truncate flex-1" numberOfLines={1}>
              {item.loc || '장소 미정'}
          </Text>
      </View>
    </TouchableOpacity>
  );
}