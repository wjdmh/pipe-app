import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  StatusBar, 
  Dimensions 
} from 'react-native';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

// [Type] 팀 데이터 타입 정의
interface TeamRankInfo {
  id: string;
  name: string;
  affiliation: string;
  gender: string;
  stats: { wins: number; losses: number; points: number; total: number };
  kusfId?: string;
  isDeleted?: boolean;
}

// --- [Data] KUSF 전체 데이터 ---
export const KUSF_TEAMS: TeamRankInfo[] = [
  // [남자부]
  { id: 'm1', name: '서울대학교 배구부', affiliation: '서울대학교', gender: 'male', stats: { wins: 8, losses: 1, points: 25, total: 9 } },
  { id: 'm2', name: '이리', affiliation: '대구가톨릭대', gender: 'male', stats: { wins: 7, losses: 2, points: 23, total: 9 } },
  { id: 'm3', name: 'SIV', affiliation: '서원대학교', gender: 'male', stats: { wins: 6, losses: 1, points: 19, total: 7 } },
  { id: 'm4', name: '플라잉', affiliation: '진주교육대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm5', name: 'A-Quick', affiliation: '전북대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm6', name: 'GVS', affiliation: '광주대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm7', name: '비상', affiliation: '한신대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm8', name: '창공', affiliation: '단국대학교', gender: 'male', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'm9', name: '미르', affiliation: '용인대학교', gender: 'male', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  { id: 'm10', name: '빽어택', affiliation: '경인교육대학교', gender: 'male', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  { id: 'm11', name: '발리스타', affiliation: '경남대학교', gender: 'male', stats: { wins: 3, losses: 3, points: 12, total: 6 } },
  { id: 'm12', name: 'SU-WINGS', affiliation: '삼육대학교', gender: 'male', stats: { wins: 3, losses: 2, points: 11, total: 5 } },
  { id: 'm13', name: '스파르타', affiliation: '가천대학교', gender: 'male', stats: { wins: 3, losses: 2, points: 11, total: 5 } },
  { id: 'm14', name: '백구회', affiliation: '경상국립대학교', gender: 'male', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'm15', name: '두두', affiliation: '대구대학교', gender: 'male', stats: { wins: 2, losses: 4, points: 10, total: 6 } },
  { id: 'm16', name: 'KU-VOLT', affiliation: '고려대학교', gender: 'male', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'm17', name: 'OVERNET', affiliation: '충남대학교', gender: 'male', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'm18', name: 'VAT', affiliation: '국민대학교', gender: 'male', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'm19', name: '청명', affiliation: '한양대학교(에리카)', gender: 'male', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'm20', name: 'BUTTER B', affiliation: '강남대학교', gender: 'male', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'm21', name: 'NVP', affiliation: '남서울대학교', gender: 'male', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'm22', name: 'PIN POIN', affiliation: '중앙대학교', gender: 'male', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'm23', name: 'DUV', affiliation: '동국대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm24', name: '리베로', affiliation: '광주교육대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm25', name: '백호', affiliation: '동아대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm26', name: '보스', affiliation: '신라대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm27', name: '어택라인', affiliation: '대구교육대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm28', name: '용봉', affiliation: '전남대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm29', name: 'M.P', affiliation: '영남대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm30', name: 'RECEVE', affiliation: '연세대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm31', name: '날자', affiliation: '가톨릭 관동대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm32', name: '스카이', affiliation: '한림대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm33', name: '청주대배구팀', affiliation: '청주대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm34', name: '한배짱', affiliation: '한양대학교', gender: 'male', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'm35', name: 'GRAMPUS', affiliation: '한국해양대학교', gender: 'male', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'm36', name: 'KNUVA', affiliation: '경북대학교', gender: 'male', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'm37', name: 'H.I.T', affiliation: '충북대학교', gender: 'male', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'm38', name: 'KUV', affiliation: '한국체육대학교', gender: 'male', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'm39', name: 'VAC', affiliation: '아주대학교', gender: 'male', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'm40', name: '미노네트', affiliation: '경기대학교', gender: 'male', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'm41', name: 'CV6', affiliation: '조선대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm42', name: 'K.O.V', affiliation: '경상국립대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm43', name: 'MOVE', affiliation: '목포대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm44', name: 'USPA', affiliation: '울산대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm45', name: 'W.B.L', affiliation: '우석대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm46', name: '돈스파이크', affiliation: '원광대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm47', name: '청공', affiliation: '동의대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm48', name: '커넥트', affiliation: '군산대', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm49', name: 'Ace Libe', affiliation: '인하대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm50', name: 'ATTACK', affiliation: '한남대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm51', name: 'ROUTE', affiliation: '상명대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm52', name: '나인레전드', affiliation: '공주대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm53', name: '레드스타', affiliation: '수원대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm54', name: '백어택', affiliation: '성균관대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm55', name: '밸런스', affiliation: '명지대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm56', name: '서강대배구반', affiliation: '서강대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm57', name: '서울교대 남자배', affiliation: '서울교육대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm58', name: '센터라인', affiliation: '순천향대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm59', name: '아마배구부', affiliation: '건국대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm60', name: '어택라인', affiliation: '상지대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm61', name: '플라잉', affiliation: '인천대학교', gender: 'male', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'm62', name: 'ALLSTARS', affiliation: '경일대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm63', name: 'KVC', affiliation: '경상국립대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm64', name: 'LEVO', affiliation: '계명대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm65', name: 'PHANTOM', affiliation: '전주대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm66', name: 'SPIKE', affiliation: '경북대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm67', name: 'WINGS', affiliation: '제주대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm68', name: '나르샤', affiliation: '대구가톨릭대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm69', name: '등짝스매시', affiliation: '국립한국농수산대', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm70', name: '스파이크', affiliation: '경성대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm71', name: '스파이크', affiliation: '한동대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm72', name: '한마', affiliation: '경남대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm73', name: 'AUVC', affiliation: '안산대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm74', name: 'BLOCK', affiliation: '건양대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm75', name: 'CAV', affiliation: '중앙대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm76', name: 'D-NINE', affiliation: '단국대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm77', name: 'DT', affiliation: '고려대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm78', name: 'FLAT', affiliation: '중부대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm79', name: 'HIKE', affiliation: '호서대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm80', name: 'HOVO', affiliation: '홍익대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm81', name: 'HUF SPIK', affiliation: '한국외국어대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm82', name: 'JUMP', affiliation: '서울시립대', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm83', name: 'S.U.V', affiliation: '상명대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm84', name: 'VOS', affiliation: '숭실대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm85', name: '미르', affiliation: '나사렛대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm86', name: '스파이크', affiliation: '청주교육대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm87', name: '원터치', affiliation: '가천대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm88', name: '하랑', affiliation: '성결대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm89', name: '한국교원대 배구', affiliation: '한국교원대학교', gender: 'male', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'm90', name: '배구팡', affiliation: '중앙대학교', gender: 'male', stats: { wins: 0, losses: 1, points: 1, total: 1 } },

  // [여자부]
  { id: 'f1', name: 'KUV', affiliation: '한국체육대학교', gender: 'female', stats: { wins: 9, losses: 0, points: 27, total: 9 } },
  { id: 'f2', name: '백호', affiliation: '동아대학교', gender: 'female', stats: { wins: 7, losses: 2, points: 23, total: 9 } },
  { id: 'f3', name: 'VOG', affiliation: '경상국립대학교', gender: 'female', stats: { wins: 6, losses: 2, points: 20, total: 8 } },
  { id: 'f4', name: 'EAVC', affiliation: '이화여자대학교', gender: 'female', stats: { wins: 5, losses: 3, points: 18, total: 8 } },
  { id: 'f5', name: 'LEVO', affiliation: '계명대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f6', name: '스파르타', affiliation: '가천대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f7', name: '창공', affiliation: '단국대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f8', name: '서울대학교 여자', affiliation: '서울대학교', gender: 'female', stats: { wins: 5, losses: 2, points: 17, total: 7 } },
  { id: 'f9', name: '스파이크', affiliation: '경성대학교', gender: 'female', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  { id: 'f10', name: 'SU-WINGS', affiliation: '삼육대학교', gender: 'female', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  { id: 'f11', name: '한배짱', affiliation: '한양대학교', gender: 'female', stats: { wins: 4, losses: 2, points: 14, total: 6 } },
  { id: 'f12', name: '한마', affiliation: '경남대학교', gender: 'female', stats: { wins: 3, losses: 3, points: 12, total: 6 } },
  { id: 'f13', name: '용봉', affiliation: '전남대학교', gender: 'female', stats: { wins: 3, losses: 3, points: 12, total: 6 } },
  { id: 'f14', name: '플라잉', affiliation: '진주교육대학교', gender: 'female', stats: { wins: 3, losses: 2, points: 11, total: 5 } },
  { id: 'f15', name: '미르', affiliation: '용인대학교', gender: 'female', stats: { wins: 3, losses: 2, points: 11, total: 5 } },
  { id: 'f16', name: 'RECEIVE', affiliation: '연세대학교', gender: 'female', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'f17', name: '아마배구부', affiliation: '건국대학교', gender: 'female', stats: { wins: 3, losses: 1, points: 10, total: 4 } },
  { id: 'f18', name: '어택라인', affiliation: '대구교육대학교', gender: 'female', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'f19', name: 'SPIKE', affiliation: '경북대학교', gender: 'female', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'f20', name: '서울교대 여자배', affiliation: '서울교육대학교', gender: 'female', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'f21', name: '하랑', affiliation: '성신여자대학교', gender: 'female', stats: { wins: 2, losses: 2, points: 8, total: 4 } },
  { id: 'f22', name: 'A-Quick', affiliation: '전북대학교', gender: 'female', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'f23', name: 'BUTTER B', affiliation: '강남대학교', gender: 'female', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'f24', name: 'SPIKE G', affiliation: '서강대학교', gender: 'female', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'f25', name: 'VAT', affiliation: '국민대학교', gender: 'female', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'f26', name: '백어택', affiliation: '성균관대학교', gender: 'female', stats: { wins: 2, losses: 1, points: 7, total: 3 } },
  { id: 'f27', name: 'GVS', affiliation: '광주대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f28', name: 'K.O.V', affiliation: '경상대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f29', name: '돈스파이크', affiliation: '원광대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f30', name: '순천대SPINK', affiliation: '순천대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f31', name: 'BLOCK', affiliation: '건양대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f32', name: 'S.U.V', affiliation: '상명대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f33', name: '빽어택', affiliation: '경인교육대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f34', name: '슈파이크', affiliation: '서울여자대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f35', name: '하랑', affiliation: '성결대학교', gender: 'female', stats: { wins: 1, losses: 2, points: 5, total: 3 } },
  { id: 'f36', name: 'M.P', affiliation: '영남대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f37', name: 'DT', affiliation: '고려대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f38', name: 'FVI', affiliation: '한림대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f39', name: 'KU-VOLT', affiliation: '고려대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f40', name: 'MOVIN', affiliation: '서울시립대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f41', name: 'NVP', affiliation: '남서울대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f42', name: 'OVERNET', affiliation: '충남대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f43', name: '비상', affiliation: '한신대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f44', name: '숙파이크', affiliation: '숙명여자대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f45', name: '스파이크', affiliation: '청주교육대학교', gender: 'female', stats: { wins: 1, losses: 1, points: 4, total: 2 } },
  { id: 'f46', name: 'ATTACK', affiliation: '한남대학교', gender: 'female', stats: { wins: 1, losses: 0, points: 3, total: 1 } },
  { id: 'f47', name: 'MOVE', affiliation: '목포대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f48', name: '나르샤', affiliation: '대구가톨릭대', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f49', name: '두두', affiliation: '대구대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f50', name: '리베로', affiliation: '광주교육대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f51', name: '백운', affiliation: '동서대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f52', name: '보스', affiliation: '신라대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f53', name: 'HINK', affiliation: '호서대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f54', name: 'HOVO', affiliation: '홍익대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f55', name: 'PIN POIN', affiliation: '중앙대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f56', name: 'ROUTE', affiliation: '상명대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f57', name: '날자', affiliation: '가톨릭관동대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f58', name: '러버쏠', affiliation: '중앙대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f59', name: '미노네트', affiliation: '경기대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f60', name: '밸런스', affiliation: '명지대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f61', name: '어택라인', affiliation: '경희대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f62', name: '원터치', affiliation: '가천대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f63', name: '천상', affiliation: '동덕여자대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f64', name: '청명', affiliation: '한양대학교(에리카)', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f65', name: '플라잉', affiliation: '인천대학교', gender: 'female', stats: { wins: 0, losses: 2, points: 2, total: 2 } },
  { id: 'f66', name: 'VISTO', affiliation: '경북대학교', gender: 'female', stats: { wins: 0, losses: 1, points: 1, total: 1 } },
  { id: 'f67', name: '발리스타', affiliation: '경남대학교', gender: 'female', stats: { wins: 0, losses: 1, points: 1, total: 1 } },
  { id: 'f68', name: '최후의 발악', affiliation: '숙명여자대학교', gender: 'female', stats: { wins: 0, losses: 1, points: 1, total: 1 } },
];

export default function RankingScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'male' | 'female'>('male');
  
  // 초기 상태 로딩
  const getInitialData = (gender: string) => KUSF_TEAMS.filter(t => t.gender === gender).sort((a, b) => b.stats.points - a.stats.points);
  const [rankingList, setRankingList] = useState<TeamRankInfo[]>(getInitialData('male'));

  useEffect(() => {
    setRankingList(getInitialData(activeTab));

    const q = query(
        collection(db, "teams"), 
        orderBy("stats.points", "desc"), 
        limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const dbTeams: any[] = [];
        snapshot.forEach(d => {
            dbTeams.push({ ...d.data(), id: d.id });
        });
        mergeAndSortTeams(dbTeams);
    });
    return () => unsubscribe();
  }, [activeTab]);

  const mergeAndSortTeams = (dbTeams: any[]) => {
    let baseList: TeamRankInfo[] = [...KUSF_TEAMS].filter(t => t.gender === activeTab);

    dbTeams.forEach(dbTeam => {
        if (dbTeam.gender !== activeTab) return;
        const index = baseList.findIndex(t => t.id === dbTeam.kusfId || t.name === dbTeam.name);

        if (index !== -1) {
            baseList[index] = { ...baseList[index], ...dbTeam, stats: dbTeam.stats || baseList[index].stats };
        } else {
            baseList.push({
                id: dbTeam.id,
                name: dbTeam.name,
                affiliation: dbTeam.affiliation,
                gender: dbTeam.gender,
                stats: dbTeam.stats || { wins: 0, losses: 0, points: 0, total: 0 },
                isDeleted: dbTeam.isDeleted
            });
        }
    });

    baseList.sort((a, b) => {
        if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
        if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
        return b.stats.total - a.stats.total;
    });

    setRankingList(baseList);
  };

  const topThree = rankingList.slice(0, 3);
  const restList = rankingList.slice(3);

  // [UI] 포디움 아이템
  const renderPodiumItem = (item: TeamRankInfo, place: 1 | 2 | 3) => {
    const rankColors = {
        1: { border: 'border-amber-300', bg: 'bg-white', text: 'text-amber-500', shadow: 'shadow-amber-200' },
        2: { border: 'border-slate-300', bg: 'bg-white', text: 'text-slate-500', shadow: 'shadow-slate-200' },
        3: { border: 'border-orange-300', bg: 'bg-white', text: 'text-orange-600', shadow: 'shadow-orange-200' },
    };
    
    const style = rankColors[place];
    const height = place === 1 ? 160 : 130;
    const translateY = place === 1 ? 0 : 15; 

    return (
      <TouchableOpacity 
        className="items-center justify-end px-1" 
        style={{ flex: 1, transform: [{ translateY }] }}
        // 👇 [Fix] router.push에 as any를 사용하여 타입 에러 우회
        onPress={() => router.push(`/team/${item.id}` as any)} 
        activeOpacity={0.9}
      >
        <View className="items-center mb-2 z-10">
            {place === 1 && <FontAwesome5 name="crown" size={18} color="#F59E0B" style={{ marginBottom: 4 }} />}
            <Text className={`font-black italic text-[16px] ${style.text}`}>
                {place}
            </Text>
        </View>

        <View 
            className={`w-full rounded-2xl items-center justify-start pt-5 px-2 border-t-4 shadow-sm ${style.bg} ${style.border}`}
            style={{ height }}
        >
            <View className="w-10 h-10 rounded-full bg-gray-50 items-center justify-center mb-2 shadow-sm border border-gray-100">
                <FontAwesome5 name="shield-alt" size={14} color={place === 1 ? '#F59E0B' : '#9CA3AF'} />
            </View>
            
            <View className="w-full items-center">
                <Text 
                    className="text-gray-900 font-bold text-[13px] text-center leading-4 mb-1" 
                    numberOfLines={2} 
                    ellipsizeMode="tail"
                >
                    {item.name}
                </Text>
                <Text 
                    className="text-gray-500 text-[11px] font-medium text-center leading-3" 
                    numberOfLines={1}
                >
                    {item.affiliation}
                </Text>
            </View>

            <View className="mt-auto mb-3 bg-gray-50 px-2 py-0.5 rounded-md">
                <Text className="text-gray-900 text-[12px] font-extrabold">
                    {item.stats.points} <Text className="text-[10px] font-normal text-gray-500">pts</Text>
                </Text>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  // [UI] 리스트 아이템
  const renderListItem = ({ item, index }: { item: TeamRankInfo, index: number }) => {
    const realRank = index + 4;
    const winRate = item.stats.total > 0 
        ? Math.round((item.stats.wins / item.stats.total) * 100) 
        : 0;

    return (
      <TouchableOpacity 
        // 👇 [Fix] 여기도 as any 추가
        onPress={() => router.push(`/team/${item.id}` as any)}
        activeOpacity={0.7}
        className="flex-row items-center py-4 px-5 border-b border-gray-50 bg-white"
      >
        <View className="w-[40px] mr-3 items-center justify-center">
            <Text className="text-[16px] font-black text-gray-300 italic">{realRank}</Text>
        </View>

        <View className="flex-1 justify-center pr-2">
            <View className="flex-row items-center mb-0.5">
                <Text className="text-[15px] font-bold text-gray-900 mr-2 shrink" numberOfLines={1}>
                    {item.name}
                </Text>
            </View>
            <Text className="text-[12px] font-medium text-gray-500" numberOfLines={1}>
                {item.affiliation} · <Text className="text-gray-700 font-bold">{item.stats.points}점</Text> ({item.stats.wins}승 {item.stats.losses}패)
            </Text>
        </View>

        <View className="ml-1 shrink-0">
            <View className={`px-2 py-1 rounded-md ${winRate >= 70 ? 'bg-red-50' : 'bg-blue-50'}`}>
                <Text className={`${winRate >= 70 ? 'text-red-600' : 'text-blue-600'} text-[11px] font-bold`}>
                    {winRate}%
                </Text>
            </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View className="bg-white px-5 pt-2 pb-2 flex-row items-center border-b border-gray-50">
        <TouchableOpacity 
            onPress={() => router.back()} 
            className="p-2 -ml-2 mr-2"
            activeOpacity={0.6}
        >
            <FontAwesome5 name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>
        <Text className="text-xl font-extrabold text-gray-900 tracking-tighter">SEASON RANKING</Text>
      </View>

      <View className="flex-row px-5 py-3 bg-white">
        <View className="flex-1 flex-row bg-gray-100 p-1 rounded-xl">
            <TouchableOpacity 
                onPress={() => setActiveTab('male')}
                activeOpacity={0.9}
                className={`flex-1 py-2 rounded-lg items-center justify-center ${activeTab === 'male' ? 'bg-white shadow-sm' : ''}`}
            >
                <Text className={`text-[14px] font-bold ${activeTab === 'male' ? 'text-gray-900' : 'text-gray-400'}`}>남자부</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                onPress={() => setActiveTab('female')}
                activeOpacity={0.9}
                className={`flex-1 py-2 rounded-lg items-center justify-center ${activeTab === 'female' ? 'bg-white shadow-sm' : ''}`}
            >
                <Text className={`text-[14px] font-bold ${activeTab === 'female' ? 'text-gray-900' : 'text-gray-400'}`}>여자부</Text>
            </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={restList}
        keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
        renderItem={renderListItem}
        contentContainerStyle={{ paddingBottom: 50 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
            <View className="bg-white px-4 pt-6 pb-8 mb-2">
                <View className="flex-row items-center justify-center mb-8">
                     <Text className="text-gray-900 font-extrabold text-lg tracking-tight">🏆 HALL OF FAME</Text>
                </View>
                
                <View className="flex-row items-end justify-center">
                    <View style={{ width: '32%' }}> 
                        {topThree[1] ? renderPodiumItem(topThree[1], 2) : <View style={{ height: 130 }} />} 
                    </View>

                    <View style={{ width: '34%', zIndex: 10 }}> 
                        {topThree[0] ? renderPodiumItem(topThree[0], 1) : <View style={{ height: 160 }} />} 
                    </View>

                    <View style={{ width: '32%' }}> 
                        {topThree[2] ? renderPodiumItem(topThree[2], 3) : <View style={{ height: 130 }} />} 
                    </View>
                </View>
            </View>
        }
        ListEmptyComponent={
            <View className="items-center justify-center py-20">
                <Text className="text-gray-300 font-bold">랭킹 데이터가 없습니다.</Text>
            </View>
        }
      />
    </SafeAreaView>
  );
}