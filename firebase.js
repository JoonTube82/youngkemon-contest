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
// 데이터베이스(Firestore) 접근 도우미 함수
// ==========================================
export const getStudentsCollection = () => collection(db, 'contest_data');
export const getStudentDoc = (studentId) => doc(db, 'contest_data', studentId);
export const getWordListCollection = () => collection(db, 'wordList');
export const getWordDoc = (wordId) => doc(db, 'wordList', wordId);

// (이전 코드 호환성을 위한 빈 객체 유지 - 이제 게임 내에서 전부 'male' 캐릭터로 자동 통일됩니다)
export const STUDENT_GENDER = {};
