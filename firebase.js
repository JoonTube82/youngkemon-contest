import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 학생 명단 내보내기 (export)
export const STUDENT_LIST = ["0.서영", "1.단엘", "2.라희", "3.민지", "4.정훈", "5.문경", "6.소윤", "7.하율", "8.현수", "9.시율", "10.은영", "11.이담", "12.훈태", "마스터", "테스트", "선생님", "테스트2"];

export const STUDENT_GENDER = {
    "0.서영": "female", "1.단엘": "male", "2.라희": "female", "3.민지": "female", 
    "4.정훈": "male", "5.문경": "male", "6.소윤": "female", "7.하율": "female", 
    "8.현수": "male", "9.시율": "male", "10.은영": "female", "11.이담": "male", 
    "12.훈태": "male", "마스터": "male", "테스트": "female", "선생님": "male", "테스트2": "female"
};

export const initStudentSelect = () => {
    const selectEl = document.getElementById('user-id');
    if (selectEl) {
        STUDENT_LIST.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.innerText = name;
            selectEl.appendChild(opt);
        });
    }
};

export const initAdminStudentSelect = () => {
    const selectEl = document.getElementById('reset-pw-student');
    if (selectEl) {
        STUDENT_LIST.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.innerText = name;
            selectEl.appendChild(opt);
        });
    }
};

// 선생님의 진짜 파이어베이스 정보
const firebaseConfig = {
    apiKey: "AIzaSyCxfI0Zh4mxbY13WigsFlNLDmA3ikkAIjE",
    authDomain: "grade6-english-rpg.firebaseapp.com",
    projectId: "grade6-english-rpg",
    storageBucket: "grade6-english-rpg.firebasestorage.app",
    messagingSenderId: "98075257077",
    appId: "1:98075257077:web:af48cfeda2300df967fdbc",
    measurementId: "G-DCBTPQ5T0N"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 데이터베이스 통신 함수들도 외부에서 쓰도록 내보내기
export const getStudentsCollection = () => collection(db, 'students');
export const getStudentDoc = (studentId) => doc(db, 'students', studentId);
export const getWordListCollection = () => collection(db, 'wordList');
export const getWordDoc = (wordId) => doc(db, 'wordList', wordId);
initStudentSelect();
 initAdminStudentSelect();