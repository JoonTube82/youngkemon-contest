import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// 파이어베이스(Firebase) 서버 연결 설정
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBpU9kkUtAtEyAxcjuWFvz2Z0gU--MWAgY",
  authDomain: "vocamon-award.firebaseapp.com",
  projectId: "vocamon-award",
  storageBucket: "vocamon-award.firebasestorage.app",
  messagingSenderId: "1048535638025",
  appId: "1:1048535638025:web:7b5712078d3aab525098d8"
};

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ==========================================
// ⭐ [신규] 학급 코드 상태 관리 및 레지스트리
// ==========================================
let currentClassCode = "대회초 6-1"; // 기본값 (기존 데이터 보호용)

export const setClassCode = (code) => {
    currentClassCode = code;
};

export const getClassCode = () => {
    return currentClassCode;
};

// 공식 개설된 학급 목록을 저장하고 확인하는 방 (오타 방지용)
export const getClassesCollection = () => collection(db, 'class_registry');
export const getClassDoc = (code) => doc(db, 'class_registry', code);

// ==========================================
// ⭐ 학급 코드에 따른 동적 데이터베이스 접근
// ==========================================
export const getStudentsCollection = () => {
    // "대회초 6-1"이면 기존 방 사용, 아니면 새로운 방 생성/접근
    const colName = currentClassCode === "대회초 6-1" ? "contest_data" : `contest_data_${currentClassCode}`;
    return collection(db, colName);
};

export const getStudentDoc = (studentId) => {
    const colName = currentClassCode === "대회초 6-1" ? "contest_data" : `contest_data_${currentClassCode}`;
    return doc(db, colName, studentId);
};

export const getWordListCollection = () => {
    const colName = currentClassCode === "대회초 6-1" ? "wordList" : `wordList_${currentClassCode}`;
    return collection(db, colName);
};

export const getWordDoc = (wordId) => {
    const colName = currentClassCode === "대회초 6-1" ? "wordList" : `wordList_${currentClassCode}`;
    return doc(db, colName, wordId);
};

// (이전 코드 호환성을 위한 빈 객체 유지)
export const STUDENT_GENDER = {};
