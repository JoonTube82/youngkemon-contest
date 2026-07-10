import { auth, getStudentsCollection, getStudentDoc, getWordListCollection, setClassCode, getClassDoc } from './firebase.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDoc, getDocs, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// 1. 오디오 및 기초 상태 (State) 세팅
// ==========================================
window.AudioManager = {
    bgms: {
        town: new Audio('bgm_town.mp3'),
        hunt: new Audio('bgm_hunt.mp3'),
        dex: new Audio('bgm_dex.mp3'),
        battle: new Audio('bgm_battle.mp3')
    },
    currentType: null,
    isMuted: false,
    volume: 0.5,
    init: function() {
        Object.values(this.bgms).forEach(audio => { 
            audio.loop = true; 
            audio.volume = this.volume; 
        });
    },
    setVolume: function(val) {
        this.volume = parseFloat(val);
        Object.values(this.bgms).forEach(audio => { 
            audio.volume = this.volume; 
        });
        const btn = document.getElementById('btn-mute');
        if(btn) btn.innerText = this.volume === 0 ? '🔇' : '🎵';
    },
    playBGM: function(type) {
        if (this.currentType === type) return;
        if (this.currentType && this.bgms[this.currentType]) {
            this.bgms[this.currentType].pause();
            this.bgms[this.currentType].currentTime = 0;
        }
        this.currentType = type;
        if (!this.isMuted && this.bgms[type]) {
            this.bgms[type].volume = this.volume;
            this.bgms[type].play().catch(e => console.log("BGM 재생 대기 중:", e));
        }
    },
    toggleMute: function() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('btn-mute');
        if (this.isMuted) {
            if (this.currentType && this.bgms[this.currentType]) this.bgms[this.currentType].pause();
            if (btn) btn.innerText = '🔇';
        } else {
            if (this.currentType && this.bgms[this.currentType]) {
                this.bgms[this.currentType].volume = this.volume;
                this.bgms[this.currentType].play().catch(e => console.log(e));
            }
            if (btn) btn.innerText = '🎵';
        }
    }
};
window.AudioManager.init();

window.speakText = (text, lang = 'en-US') => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang; 
    utterance.rate = 0.85; 
    window.speechSynthesis.speak(utterance);
};

window.speakWord = (event) => {
    if (event) event.stopPropagation(); 
    if (window.state.currentQuiz) {
        window.speakText(window.state.currentQuiz.word, 'en-US');
    }
};

window.state = {
    user: null, 
    authUid: null,
    gender: 'M', 
    chapterTitles: {}, 
    gameData: { level: 1, exp: 0, count: 0, wins: 0, caughtWords: {}, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} },
    quizzes: [],
    monsterMap: {}, 
    currentQuiz: null,
    currentChapter: 1,
    shake: 0,
    particles: [],
    monster: { hp: 100, shake: 0, tier: 1, name: "???" }
};

window.learnState = { 
    list: [], index: 0, isPlaying: false, timer1: null, timer2: null,
    quizList: [], quizIndex: 0, options: [], wrongWords: [], isReviewMode: false
};

const CHAPTER_TITLES = [
    "",
    "What Grade Are You In?", "What Do You Want to Be?", "When Is the Field Trip?",
    "He Has Short Curly Hair", "How Often Do You Exercise?", "I'm Going to Go on a Trip",
    "What Season Do You Like?", "I'm Faster Than You", "How Can I Get to the Museum?",
    "I'd Like to Have the Fruit Salad", "Do You Know About Songpyeon?", "We Should Save the World"
];

const TYPE_EFFECTIVENESS = {
    normal: { }, 
    fire: { fire: 0.5, water: 0.5, grass: 2 }, 
    water: { water: 0.5, grass: 0.5, fire: 2, ground: 2 }, 
    grass: { grass: 0.5, fire: 0.5, water: 2, ground: 2 }, 
    ground: { grass: 0.5, fire: 2 }, 
    dark: { dark: 0.5, light: 2, normal: 2 }, 
    light: { light: 0.5, dark: 2 } 
};

const getMatchup = (atk, def) => {
    if(!TYPE_EFFECTIVENESS[atk]) return 1;
    return TYPE_EFFECTIVENESS[atk][def] !== undefined ? TYPE_EFFECTIVENESS[atk][def] : 1;
};

const TYPE_COLORS = {
    normal: { bg: 'bg-[#A8A77A]', color: '#A8A77A', name: '노말' },
    fire: { bg: 'bg-[#EE8130]', color: '#EE8130', name: '불꽃' },
    water: { bg: 'bg-[#6390F0]', color: '#6390F0', name: '물' },
    grass: { bg: 'bg-[#7AC74C]', color: '#7AC74C', name: '풀' },
    ground: { bg: 'bg-[#E2BF65]', color: '#E2BF65', name: '땅' },
    dark: { bg: 'bg-[#705746]', color: '#705746', name: '어둠' },
    light: { bg: 'bg-[#FEF08A]', color: '#CA8A04', name: '빛' }
};

// ==========================================
// 2. 팝업, 학급 개설/접속 및 로그인 처리
// ==========================================
let confirmResolve = null;
window.showCustomAlert = (msg) => {
    document.getElementById('alert-msg').innerText = msg;
    document.getElementById('custom-alert').style.display = 'flex';
};
window.closeCustomAlert = () => { document.getElementById('custom-alert').style.display = 'none'; };

window.showCustomConfirm = (msg) => {
    return new Promise((resolve) => {
        document.getElementById('confirm-msg').innerText = msg;
        document.getElementById('custom-confirm').style.display = 'flex';
        confirmResolve = resolve;
    });
};
window.handleConfirmAction = (result) => {
    document.getElementById('custom-confirm').style.display = 'none';
    if (confirmResolve) confirmResolve(result);
};

const setStatus = (msg, isError = false) => {
    const statusEl = document.getElementById('login-status');
    if (statusEl) {
        statusEl.innerText = msg;
        statusEl.className = isError ? "text-red-500 text-xs mt-4 font-bold" : "text-slate-500 text-xs mt-4 font-bold animate-pulse";
    }
};

window.handleLogout = async () => {
    if (await window.showCustomConfirm("정말 로그아웃 하시겠습니까?")) location.reload();
};

const initAuth = async () => {
    try { await signInAnonymously(auth); } 
    catch (error) { setStatus("서버 접속 지연 중입니다.", true); }
};
initAuth();

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.state.authUid = user.uid;
        setStatus("서버 준비 완료! 학급 코드를 입력하세요.");
    } else {
        window.state.authUid = null;
    }
});

window.updateChapterTitlesUI = () => {
    for(let i=1; i<=12; i++) {
        const el = document.getElementById(`hunt-ch-title-${i}`);
        if(el) {
            const title = window.state.chapterTitles[i] || CHAPTER_TITLES[i];
            el.innerText = title;
        }
    }
};

window.checkClassCode = async () => {
    const codeInput = document.getElementById('class-code-join').value.trim();
    if (!codeInput) return window.showCustomAlert("학급 코드를 입력해주세요.");
    
    setStatus("학급 정보 확인 중...");
    
    try {
        const classSnap = await getDoc(getClassDoc(codeInput));
        if (codeInput !== "대회초 6-1" && !classSnap.exists()) {
            setStatus("존재하지 않는 학급", true);
            return window.showCustomAlert(`[${codeInput}] 학급이 존재하지 않습니다.\n오타가 없는지 확인하거나, 선생님께 문의하세요.`);
        }
        
        if(classSnap.exists()) {
            window.state.chapterTitles = classSnap.data().chapterTitles || {};
        } else {
            window.state.chapterTitles = {};
        }

        setClassCode(codeInput);
        window.updateChapterTitlesUI();
        
        document.getElementById('login-step-1').style.display = 'none';
        document.getElementById('login-step-2').style.display = 'block';
        document.getElementById('class-title-display').innerText = `🏫 [${codeInput}] 접속 중`;
        
        setStatus("모험가 명단 로딩 중...");
        await window.loadDynamicStudentList();
        setStatus("접속 대기 중...");
    } catch (error) {
        setStatus("서버 접속 오류", true);
        window.showCustomAlert(`오류가 발생했습니다: ${error.message}`);
    }
};

window.createClass = async () => {
    const codeInput = document.getElementById('class-code-create').value.trim();
    const masterPw = document.getElementById('class-master-pw').value.trim();
    
    if (!codeInput || !masterPw) return window.showCustomAlert("새 학급 코드와 마스터 비밀번호를 모두 입력하세요.");
    
    setStatus("새 학급 개설 중...");
    
    try {
        if (codeInput === "대회초 6-1") return window.showCustomAlert("해당 이름은 기본 학급으로 지정되어 사용할 수 없습니다.");

        const classRef = getClassDoc(codeInput);
        const classSnap = await getDoc(classRef);
        
        if (classSnap.exists()) {
            setStatus("개설 실패", true);
            return window.showCustomAlert("이미 존재하는 학급 코드입니다.\n다른 이름으로 개설해주세요.");
        }
        
        await setDoc(classRef, { createdAt: new Date().toISOString(), createdBy: window.state.authUid, chapterTitles: {} });
        
        setClassCode(codeInput);
        window.state.chapterTitles = {};
        window.updateChapterTitlesUI();
        
        const emptyStats = { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
        await setDoc(getStudentDoc('마스터'), {
            id: '마스터',
            password: masterPw,
            gender: 'M',
            isFirstLogin: false,
            gameStats: emptyStats,
            createdAt: new Date().toISOString(),
            forceLogout: false
        });
        
        window.showCustomAlert(`🎉 [${codeInput}] 학급이 성공적으로 개설되었습니다!\n이제 모험가 접속 탭에서 로그인할 수 있습니다.`);
        
        document.getElementById('class-code-create').value = '';
        document.getElementById('class-master-pw').value = '';
        
        window.switchLoginTab('join');
        document.getElementById('class-code-join').value = codeInput;
        setStatus("학급 개설 완료. 학급에 접속하세요!");
        
    } catch (error) {
        setStatus("서버 접속 오류", true);
        window.showCustomAlert(`개설 중 오류가 발생했습니다: ${error.message}`);
    }
};

window.backToClassSelect = () => {
    document.getElementById('login-step-1').style.display = 'block';
    document.getElementById('login-step-2').style.display = 'none';
    document.getElementById('user-id').innerHTML = '<option value="" disabled selected>모험가 선택하기</option>';
    document.getElementById('user-pw').value = '';
    setStatus("학급 코드를 입력하세요.");
};

window.loadDynamicStudentList = async () => {
    const loginSelect = document.getElementById('user-id');
    const adminSelect = document.getElementById('reset-pw-student'); 
    
    try {
        const snap = await getDocs(getStudentsCollection());
        let students = [];
        snap.forEach(doc => {
            if (!['마스터', '테스트'].includes(doc.id)) {
                students.push(doc.id);
            }
        });
        
        students.sort((a, b) => {
            const getNum = (id) => { const num = parseInt(id.split('.')[0]); return isNaN(num) ? 999 : num; };
            return getNum(a) - getNum(b);
        });
        
        students.push('마스터', '테스트');

        if(loginSelect) {
            loginSelect.innerHTML = '<option value="" disabled selected>모험가 선택하기</option>';
            students.forEach(s => {
                const opt = document.createElement('option'); opt.value = s; opt.innerText = s;
                loginSelect.appendChild(opt);
            });
        }
        if(adminSelect) {
            adminSelect.innerHTML = '<option value="" disabled selected>계정 선택</option>';
            students.forEach(s => {
                const opt = document.createElement('option'); opt.value = s; opt.innerText = s;
                adminSelect.appendChild(opt);
            });
        }
    } catch(e) { console.error("모험가 목록 로딩 실패", e); }
};

window.handleLogin = async () => {
    if (!window.state.authUid) return window.showCustomAlert("서버와 연결되지 않았습니다.");
    const idInput = document.getElementById('user-id').value.trim();
    const pwInput = document.getElementById('user-pw').value.trim();
    const btn = document.getElementById('login-btn');
    
    if (!idInput || !pwInput) return window.showCustomAlert("모험가 이름과 비밀번호를 모두 입력하세요!");
    btn.disabled = true;
    setStatus("모험가 기록 조회 중...");
    
    try {
        const docRef = getStudentDoc(idInput);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.password !== pwInput) {
                btn.disabled = false; setStatus("비밀번호 오류", true);
                return window.showCustomAlert("비밀번호가 틀렸습니다!");
            }
            
            if (data.isFirstLogin) {
                let newPw = prompt("🎉 환영합니다!\n앞으로 나만 사용할 [4자리 숫자] 비밀번호를 새로 설정해주세요.");
                if (!newPw || !/^\d{4}$/.test(newPw)) {
                    btn.disabled = false; setStatus("로그인 취소됨", true);
                    return window.showCustomAlert("비밀번호는 반드시 4자리 숫자로 입력해야 합니다!\n다시 로그인해주세요.");
                }
                await setDoc(docRef, { password: newPw, isFirstLogin: false }, { merge: true });
                window.showCustomAlert("비밀번호가 성공적으로 설정되었습니다!");
            }

            if (data.forceLogout) await setDoc(docRef, { forceLogout: false }, { merge: true });

            window.state.gender = data.gender || 'M';
            window.state.gameData = data.gameStats || { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
            if(window.state.gameData.wins === undefined) window.state.gameData.wins = 0;
            if(window.state.gameData.victories === undefined) window.state.gameData.victories = {};
            if(window.state.gameData.partnerWord === undefined) window.state.gameData.partnerWord = null;
            if(window.state.gameData.usedPokemonCooldown === undefined) window.state.gameData.usedPokemonCooldown = {};
            if(window.state.gameData.savedEncounters === undefined) window.state.gameData.savedEncounters = {};
            if(window.state.gameData.defenseLogs === undefined) window.state.gameData.defenseLogs = [];
            if(window.state.gameData.testScores === undefined) window.state.gameData.testScores = {};
            if(!window.state.gameData.caughtWords) window.state.gameData.caughtWords = {};
            
            setStatus("접속 성공!"); enterGame(idInput);
        } else {
            if (idInput === '테스트') {
                let demoCaughtWords = {};
                if(window.state.quizzes && window.state.quizzes.length > 0) {
                    window.state.quizzes.slice(0, 15).forEach(q => { 
                        const safeW = (q.word || '').toString().trim();
                        if(safeW) demoCaughtWords[safeW] = 12; 
                    });
                } else {
                    demoCaughtWords['apple'] = 12; demoCaughtWords['banana'] = 12; demoCaughtWords['cat'] = 12;
                }
                const demoStats = { 
                    level: 30, exp: 0, count: 180, 
                    caughtWords: demoCaughtWords, wins: 50, victories: {}, 
                    partnerWord: Object.keys(demoCaughtWords)[0] || null, 
                    usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} 
                };
                await setDoc(docRef, { id: idInput, password: pwInput, gender: 'M', isFirstLogin: false, gameStats: demoStats, createdAt: new Date().toISOString(), forceLogout: false });
                
                window.state.gender = 'M';
                window.state.gameData = demoStats;
                window.showCustomAlert("시연용 [테스트] 계정이 멋진 데이터와 함께 생성되었습니다!");
                enterGame(idInput);
            } else {
                btn.disabled = false; setStatus("계정 없음", true);
                window.showCustomAlert("등록되지 않은 모험가입니다.\n마스터에게 계정 생성을 요청하세요!");
            }
        }
    } catch (error) { 
        console.error("Login Error:", error);
        btn.disabled = false; 
        setStatus("서버 접속 오류", true);
        window.showCustomAlert(`로그인 중 오류가 발생했습니다!\n에러: ${error.message}`);
    }
};

function enterGame(id) {
    window.state.user = id;
    document.getElementById('player-name').innerText = id;
    document.getElementById('app-wrapper').classList.replace('max-w-[480px]', 'max-w-[1400px]');
    if (id === '마스터') document.getElementById('admin-btn').style.display = 'inline-block';
    
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('game-view').style.display = 'block';
    
    startMagicRPG();
    window.switchTab('rank'); 
    window.AudioManager.playBGM('town');
}
// ==========================================
// 4. 게임 핵심 흐름 (탭, 데이터 동기화)
// ==========================================
window.switchTab = (tabName) => {
    if(window.battleState && window.battleState.active && tabName !== 'arena') {
        return window.showCustomAlert("배틀 중에는 다른 탭으로 이동할 수 없습니다. 도망치기를 누르세요!");
    }

    if(tabName !== 'learn' && window.learnState.isPlaying) {
        window.exitLearn();
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-red-500', 'text-white');
        btn.classList.add('bg-slate-100', 'text-slate-500');
    });
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active', 'bg-red-500', 'text-white');
    
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const contentEl = document.getElementById(`content-${tabName}`);
    if (contentEl) contentEl.classList.add('active');
    
    if (tabName === 'hunt') window.loadChapterDominators(); 
    if (tabName === 'dex') window.renderDex();
    if (tabName === 'arena') {
        document.getElementById('arena-list-view').style.display = 'block';
        document.getElementById('arena-team-view').style.display = 'none';
        document.getElementById('arena-battle-view').style.display = 'none';
        document.getElementById('arena-battle-view').classList.remove('flex');
        const defenseView = document.getElementById('arena-defense-view');
        if (defenseView) defenseView.style.display = 'none';
        window.loadArena();
    }
    if (tabName === 'rank') window.renderRanking();
    if (tabName === 'learn') window.renderLearnChapterGrid();

    if (tabName === 'rank' || tabName === 'hunt') window.AudioManager.playBGM('town');
    else if (tabName === 'arena') window.AudioManager.playBGM('battle');
    else if (tabName === 'dex' || tabName === 'learn') window.AudioManager.playBGM('dex');
};

let unsubscribeWords = null;
let unsubscribeStudent = null;

function startMagicRPG() {
    unsubscribeWords = onSnapshot(getWordListCollection(), (snapshot) => {
        window.state.quizzes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // ⭐ 철저한 예외 처리 적용된 맵 생성 (빈칸, 숫자, 특수문자 무시)
        window.state.monsterMap = {};
        const chapters = {};
        window.state.quizzes.forEach(q => {
            const ch = q.chapter || 1;
            const safeWord = (q.word || '').toString().toLowerCase().trim();
            if(!safeWord) return; // 비어있는 단어 무시 (에러 방어)
            if(!chapters[ch]) chapters[ch] = [];
            if(!chapters[ch].includes(safeWord)) chapters[ch].push(safeWord);
        });
        
        for(let ch in chapters) {
            chapters[ch].sort(); 
            const usedLines = new Set();
            chapters[ch].forEach(w => {
                let hash = 0;
                for (let i = 0; i < w.length; i++) {
                    hash = w.charCodeAt(i) + ((hash << 5) - hash);
                }
                let lineIndex = Math.abs(hash) % 62; 
                
                let attempts = 0;
                while(usedLines.has(lineIndex) && attempts < 62) {
                    lineIndex = (lineIndex + 1) % 62;
                    attempts++;
                }
                usedLines.add(lineIndex);
                window.state.monsterMap[w] = lineIndex; 
            });
        }

        window.refreshQuiz();
        if(window.updateAdminList) window.updateAdminList();
        if (document.getElementById('prison-mode-view').style.display === 'flex') {
            if(window.renderPrisonPaper) window.renderPrisonPaper();
        }
        if (document.getElementById('test-mode-view').style.display === 'flex') {
            if(window.renderTestPaper) window.renderTestPaper(window.state.currentTestChapter);
        }
    });

    unsubscribeStudent = onSnapshot(getStudentDoc(window.state.user), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.forceLogout) {
                window.showCustomAlert("⚠️ 데이터 동기화 및 업데이트를 위해 자동으로 로그아웃됩니다.");
                setTimeout(() => location.reload(), 2500); return;
            }

            if (data.gameStats && data.gameStats.testScores) window.state.gameData.testScores = data.gameStats.testScores;
            if (data.gender) window.state.gender = data.gender;

            if (data.testMode && data.testMode.active) {
                if (document.getElementById('test-mode-view').style.display !== 'flex') {
                    window.state.currentTestChapter = data.testMode.chapter;
                    if(window.renderTestPaper) window.renderTestPaper(data.testMode.chapter);
                    document.getElementById('test-mode-view').style.display = 'flex';
                }
            } else {
                const testView = document.getElementById('test-mode-view');
                const submitBtn = document.getElementById('btn-submit-test');
                if (testView.style.display === 'flex' && submitBtn && !submitBtn.disabled) {
                    const inputs = document.querySelectorAll('.test-answer-input');
                    let wrongWords = [];
                    inputs.forEach(input => {
                        const correctWord = (input.getAttribute('data-word') || '').toLowerCase().trim();
                        if (input.value.trim().toLowerCase() !== correctWord) wrongWords.push(correctWord);
                    });
                    if(window.submitTest) window.submitTest();
                    if (wrongWords.length > 0) {
                        let wordsToType = {};
                        wrongWords.forEach(w => { wordsToType[w] = 3; });
                        setDoc(getStudentDoc(window.state.user), { prisonMode: { active: true, wordsToType: wordsToType } }, { merge: true });
                    }
                }
                document.getElementById('test-mode-view').style.display = 'none';
                if (submitBtn) {
                    submitBtn.style.display = 'block'; submitBtn.disabled = false;
                    submitBtn.classList.remove('bg-slate-500');
                    submitBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'active:scale-95');
                    submitBtn.innerText = '제출하기';
                }
                const msgEl = document.getElementById('test-submit-msg');
                if (msgEl) msgEl.style.display = 'none';
            }

            if (data.prisonMode && data.prisonMode.active) {
                let activeWords = {}; let hasWords = false;
                for (let w in (data.prisonMode.wordsToType || {})) {
                    if (data.prisonMode.wordsToType[w] > 0) { activeWords[w] = data.prisonMode.wordsToType[w]; hasWords = true; }
                }
                if (hasWords) {
                    window.state.prisonWords = activeWords;
                    if (document.getElementById('prison-mode-view').style.display !== 'flex') {
                        document.getElementById('prison-mode-view').style.display = 'flex';
                        if(window.renderPrisonPaper) window.renderPrisonPaper();
                    }
                } else { document.getElementById('prison-mode-view').style.display = 'none'; }
            } else { document.getElementById('prison-mode-view').style.display = 'none'; }
        }
    });
    
    window.trainerIdleImg = new Image(); window.trainerIdleImg.src = window.state.gender === 'F' ? 'trainer2_idle.png' : 'trainer1_idle.png';
    window.trainerAttackImg = new Image(); window.trainerAttackImg.src = window.state.gender === 'F' ? 'trainer2_attack.png' : 'trainer1_attack.png';
    window.charImg = window.trainerIdleImg; window.trainerAttackOffset = 0; 

    window.updateUI(); window.loadChapterDominators(); 
    requestAnimationFrame(gameLoop);
}

window.saveProgress = async () => {
    if (!window.state.user) return;
    try { await setDoc(getStudentDoc(window.state.user), { gameStats: window.state.gameData }, { merge: true }); } 
    catch (e) {}
};

// ==========================================
// ★ 학습(Learn) 탭 기능
// ==========================================
window.renderLearnChapterGrid = () => {
    const container = document.querySelector('#learn-chapter-view > .grid');
    if (!container) return;
    let html = '';
    for(let i=1; i<=12; i++) {
        const title = window.state.chapterTitles[i] || CHAPTER_TITLES[i];
        
        html += `
        <div class="bg-white border-2 border-emerald-100 p-3 rounded-2xl shadow-sm flex flex-col items-center justify-between transition-all hover:shadow-md hover:border-emerald-300">
            <div class="text-center mb-2 w-full">
                <span class="text-emerald-500 font-black text-sm sm:text-base block mb-1">${i}단원</span>
                <span class="text-slate-700 font-black text-xs sm:text-sm leading-tight block h-8 overflow-hidden flex items-center justify-center">${title}</span>
            </div>
            <div class="flex gap-1 w-full mt-auto">
                <button onclick="window.openLearnPlay(${i})" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 py-2 rounded-lg text-xs font-bold transition-transform active:scale-95">학습</button>
                <button onclick="window.openLearnQuiz(${i})" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 py-2 rounded-lg text-xs font-bold transition-transform active:scale-95">테스트</button>
            </div>
        </div>`;
    }
    container.className = "grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar pb-4";
    container.innerHTML = html;
};

window.openLearnPlay = (ch) => {
    const chapterWords = window.state.quizzes.filter(q => parseInt(q.chapter || 1) === ch && (q.word || '').toString().trim());
    if(chapterWords.length === 0) return window.showCustomAlert(`${ch}단원에 정상적으로 등록된 단어가 없습니다.`);
    
    window.learnState.list = chapterWords;
    window.learnState.index = 0;
    window.learnState.isReviewMode = false;
    
    document.getElementById('learn-chapter-view').style.display = 'none';
    document.getElementById('learn-play-view').style.display = 'flex';
    document.getElementById('btn-learn-pause').innerText = '⏸ 일시정지';
    
    window.learnState.isPlaying = true;
    playLearnWordStep1();
};

window.openLearnQuiz = (ch) => {
    const chapterWords = window.state.quizzes.filter(q => parseInt(q.chapter || 1) === ch && (q.word || '').toString().trim());
    if(chapterWords.length === 0) return window.showCustomAlert(`${ch}단원에 정상적으로 등록된 단어가 없습니다.`);
    
    window.learnState.isPlaying = false;
    document.getElementById('learn-chapter-view').style.display = 'none';
    document.getElementById('learn-quiz-view').style.display = 'flex';
    
    window.learnState.quizList = [...chapterWords].sort(() => Math.random() - 0.5);
    window.learnState.quizIndex = 0;
    window.learnState.wrongWords = [];
    renderLearnQuiz();
};

const playLearnWordStep1 = () => {
    if (!window.learnState.isPlaying) return;
    
    if (window.learnState.index >= window.learnState.list.length) {
        if (window.learnState.isReviewMode) {
            window.showCustomAlert("오답 복습을 모두 마쳤습니다! 훌륭해요!");
        } else {
            window.showCustomAlert("단어 학습을 모두 마쳤습니다!\n이제 테스트에 도전해보세요.");
        }
        window.exitLearn();
        return;
    }
    
    const currentNum = window.learnState.index + 1;
    const totalNum = window.learnState.list.length;
    const modeTxt = window.learnState.isReviewMode ? "🚨 오답 복습 중..." : "자동 재생 중...";
    document.getElementById('learn-progress-txt').innerText = `${modeTxt} (${currentNum} / ${totalNum})`;
    
    const wordObj = window.learnState.list[window.learnState.index];
    const safeWord = (wordObj.word || '').toString();
    document.getElementById('learn-en-word').innerText = safeWord;
    document.getElementById('learn-kr-word').innerText = ""; 
    
    window.speakText(safeWord, 'en-US');
    
    window.learnState.timer1 = setTimeout(() => {
        playLearnWordStep2(wordObj);
    }, 1500);
};

const playLearnWordStep2 = (wordObj) => {
    if (!window.learnState.isPlaying) return;
    
    document.getElementById('learn-kr-word').innerText = wordObj.meaning || '';
    window.speakText(wordObj.meaning || '', 'ko-KR');
    
    window.learnState.timer2 = setTimeout(() => {
        if (!window.learnState.isPlaying) return;
        window.learnState.index++;
        playLearnWordStep1();
    }, 2000);
};

window.toggleLearnPlay = () => {
    window.learnState.isPlaying = !window.learnState.isPlaying;
    const btn = document.getElementById('btn-learn-pause');
    
    if (window.learnState.isPlaying) {
        btn.innerText = '⏸ 일시정지';
        btn.classList.replace('bg-emerald-500', 'bg-emerald-600');
        clearTimeout(window.learnState.timer1);
        clearTimeout(window.learnState.timer2);
        playLearnWordStep1();
    } else {
        btn.innerText = '▶ 계속하기';
        btn.classList.replace('bg-emerald-600', 'bg-emerald-500');
        clearTimeout(window.learnState.timer1);
        clearTimeout(window.learnState.timer2);
        window.speechSynthesis.cancel();
    }
};

window.exitLearn = () => {
    window.learnState.isPlaying = false;
    clearTimeout(window.learnState.timer1);
    clearTimeout(window.learnState.timer2);
    window.speechSynthesis.cancel();
    
    document.getElementById('learn-chapter-view').style.display = 'block';
    document.getElementById('learn-play-view').style.display = 'none';
    document.getElementById('learn-quiz-view').style.display = 'none';
};

const renderLearnQuiz = () => {
    if(window.learnState.quizIndex >= window.learnState.quizList.length) {
        if(window.learnState.wrongWords.length > 0) {
            window.showCustomAlert(`테스트 완료!\n틀린 단어 ${window.learnState.wrongWords.length}개를 3번씩 복습합니다.`);
            let reviewList = [];
            window.learnState.wrongWords.forEach(w => {
                reviewList.push(w, w, w); 
            });
            window.learnState.list = reviewList;
            window.learnState.index = 0;
            window.learnState.isReviewMode = true;
            
            document.getElementById('learn-quiz-view').style.display = 'none';
            document.getElementById('learn-play-view').style.display = 'flex';
            document.getElementById('btn-learn-pause').innerText = '⏸ 일시정지';
            
            window.learnState.isPlaying = true;
            playLearnWordStep1();
        } else {
            window.showCustomAlert("🎉 100점입니다! 모든 단어를 완벽하게 맞췄습니다!");
            window.exitLearn();
        }
        return;
    }
    
    const currentWordObj = window.learnState.quizList[window.learnState.quizIndex];
    document.getElementById('learn-quiz-progress').innerText = `${window.learnState.quizIndex + 1} / ${window.learnState.quizList.length}`;
    document.getElementById('learn-quiz-meaning').innerText = currentWordObj.meaning;
    
    const correctSafeWord = (currentWordObj.word || '').toString();
    let options = [correctSafeWord];
    let wrongPool = window.state.quizzes.filter(q => (q.word || '').toString() !== correctSafeWord && (q.word || '').toString().trim());
    wrongPool.sort(() => Math.random() - 0.5);
    
    options.push(...wrongPool.slice(0, 3).map(q => (q.word || '').toString()));
    options.sort(() => Math.random() - 0.5); 
    
    const optionsContainer = document.getElementById('learn-quiz-options');
    optionsContainer.innerHTML = '';
    
    options.forEach(opt => {
        let btn = document.createElement('button');
        btn.className = "w-full bg-white text-slate-800 py-6 rounded-2xl font-black text-lg sm:text-xl shadow-sm border-2 border-slate-300 transition-colors flex items-center justify-center break-all px-2 focus:outline-none select-none";
        btn.innerText = opt;
        btn.onclick = () => window.checkLearnQuiz(opt, currentWordObj, btn);
        optionsContainer.appendChild(btn);
    });
};

window.checkLearnQuiz = (selected, currentWordObj, btnEl) => {
    if (btnEl.disabled) return;
    const correctWord = (currentWordObj.word || '').toString();
    
    if (selected === correctWord) {
        const allBtns = document.getElementById('learn-quiz-options').querySelectorAll('button');
        allBtns.forEach(b => b.disabled = true);
        
        btnEl.className = "w-full bg-emerald-500 text-white py-6 rounded-2xl font-black text-lg sm:text-xl shadow-md border-2 border-emerald-600 transition-colors flex items-center justify-center break-all px-2 focus:outline-none select-none";
        
        setTimeout(() => {
            window.learnState.quizIndex++;
            renderLearnQuiz();
        }, 500);
    } else {
        btnEl.disabled = true; 
        btnEl.className = "w-full bg-red-500 text-white py-6 rounded-2xl font-black text-lg sm:text-xl shadow-inner border-2 border-red-600 opacity-70 transition-colors flex items-center justify-center break-all px-2 focus:outline-none select-none";
        
        if(!window.learnState.wrongWords.find(w => (w.word||'').toString() === correctWord)) {
            window.learnState.wrongWords.push(currentWordObj);
        }
    }
};

// ==========================================
// 5. 부가 기능 (도감 파트너, 지배자 등)
// ==========================================
window.setPartner = (word) => {
    const safeWord = (word || '').toString();
    const count = window.state.gameData.caughtWords[safeWord] || 0;
    if (count < 10) return window.showCustomAlert(`포획 횟수가 10회 이상인 진정한 파트너만 등록할 수 있습니다!\n(현재: ${count}회)`);

    const listEl = document.getElementById('partner-stage-list');
    let html = ''; let uniqueStages = []; let seenIds = new Set();

    [1, 2, 3].forEach(tier => {
        let fakeCount = tier === 1 ? 1 : (tier === 2 ? 5 : 10);
        const pInfo = getPokemonInfoForWord(safeWord, fakeCount);
        if (!seenIds.has(pInfo.id)) { seenIds.add(pInfo.id); uniqueStages.push({ tier, pInfo }); }
    });

    uniqueStages.forEach(stage => {
        const apiData = LOCAL_POKEMON_DB[stage.pInfo.id] || { name: "알 수 없음", type: "normal" };
        html += `
        <div onclick="window.confirmPartner('${safeWord.replace(/'/g, "\\'")}', ${stage.tier})" class="cursor-pointer bg-slate-50 border-2 border-slate-200 hover:border-yellow-400 rounded-2xl p-4 flex flex-col items-center hover:scale-105 transition-all shadow-md w-28 sm:w-32">
            <img src="${stage.pInfo.imgSrc}" crossorigin="anonymous" class="h-16 w-16 sm:h-20 sm:w-20 object-contain mb-2 drop-shadow-md" style="image-rendering:pixelated;">
            <span class="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded mb-1 border border-yellow-200">Lv.${stage.tier}</span>
            <span class="text-sm font-black text-slate-800 truncate w-full text-center">${apiData.name}</span>
        </div>`;
    });
    listEl.innerHTML = html;
    document.getElementById('partner-stage-modal').style.display = 'flex';
};

window.closePartnerStageModal = () => { document.getElementById('partner-stage-modal').style.display = 'none'; };

window.confirmPartner = (word, tier) => {
    window.state.gameData.partnerWord = (word || '').toString(); 
    window.state.gameData.partnerStage = tier;
    window.saveProgress(); window.renderDex(); window.closePartnerStageModal();
    window.showCustomAlert(`[${word}] 파트너가 성공적으로 전시되었습니다!`);
};

window.loadChapterDominators = async () => {
    try {
        const snap = await getDocs(getStudentsCollection());
        const chapterScores = {};
        for(let i=1; i<=12; i++) chapterScores[i] = {};

        snap.forEach(doc => {
            const sId = doc.id;
            if (['마스터', '테스트'].includes(sId)) return;
            const caught = doc.data().gameStats?.caughtWords || {};
            
            // ⭐ 안전한 단어 매칭
            for (let word in caught) {
                const safeWord = (word || '').toString().toLowerCase();
                const quiz = window.state.quizzes.find(q => (q.word || '').toString().toLowerCase() === safeWord);
                if (quiz) {
                    const ch = quiz.chapter || 1;
                    if (!chapterScores[ch][sId]) chapterScores[ch][sId] = 0;
                    chapterScores[ch][sId] += caught[word];
                }
            }
        });

        for(let i=1; i<=12; i++) {
            const domEl = document.getElementById(`dom-ch${i}`);
            if (!domEl) continue;
            let maxCount = 0; let dominator = "없음";
            for (let sId in chapterScores[i]) {
                if (chapterScores[i][sId] > maxCount) { maxCount = chapterScores[i][sId]; dominator = sId; }
            }
            if (maxCount > 0) {
                domEl.innerHTML = `<span class="inline-block mt-1 bg-yellow-400 text-yellow-900 px-2 py-1 rounded border-b-2 border-yellow-600 font-black text-[11px] shadow-sm">👑 지배자: ${dominator}</span>`;
            } else {
                domEl.innerHTML = `<span class="inline-block mt-1 bg-slate-200 text-slate-500 px-2 py-1 rounded border-b-2 border-slate-300 font-bold text-[10px]">👑 지배자: 없음</span>`;
            }
        }
    } catch (e) { console.error("지배자 정보를 불러오는 중 오류", e); }
};

window.showAdventurerProfile = async (studentId) => {
    document.getElementById('trainer-modal').style.display = 'flex';
    document.getElementById('trainer-modal-content').innerHTML = '<p class="text-slate-500 py-10 animate-pulse font-bold text-center text-lg">모험가 정보를 불러오는 중...</p>';

    try {
        const docSnap = await getDoc(getStudentDoc(studentId));
        if(!docSnap.exists()) throw new Error();
        const data = docSnap.data();
        const stats = data.gameStats || {};
        const caughtWords = stats.caughtWords || {};
        const wins = stats.wins || 0; const level = stats.level || 1;
        const tier = getTierInfo(wins);
        const genderEmoji = (data.gender === 'F') ? '👧' : '👦';

        const sortedWords = Object.keys(caughtWords).sort((a,b)=>caughtWords[b]-caughtWords[a]).slice(0, 3);
        let top3Html = '';
        if (sortedWords.length === 0) top3Html = '<p class="text-slate-500 text-sm font-bold text-center py-6">포획한 영켓몬이 없습니다.</p>';
        else {
            top3Html = '<div class="flex justify-center gap-3">';
            sortedWords.forEach(w => {
                const safeWord = (w || '').toString();
                const count = caughtWords[safeWord];
                const pInfo = getPokemonInfoForWord(safeWord, count);
                top3Html += `
                    <div class="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col items-center w-28 sm:w-32 shadow-sm hover:scale-105 transition-transform">
                        <img src="${pInfo.imgSrc}" crossorigin="anonymous" class="h-16 sm:h-20 object-contain drop-shadow-md mb-2" style="image-rendering:pixelated;">
                        <span class="text-xs sm:text-sm font-black text-slate-800 truncate w-full text-center mt-1">${safeWord}</span>
                        <span class="text-[10px] sm:text-xs text-yellow-600 font-bold mt-1">★ ${count}회</span>
                    </div>`;
            });
            top3Html += '</div>';
        }

        let maxCh = 1;
        for (let w in caughtWords) {
            const safeWord = (w || '').toString().toLowerCase();
            const quiz = window.state.quizzes.find(q => (q.word || '').toString().toLowerCase() === safeWord);
            if (quiz && quiz.chapter > maxCh) maxCh = quiz.chapter;
        }

        document.getElementById('trainer-modal-content').innerHTML = `
            <div class="mb-6 mt-2 text-center">
                <div class="text-6xl mb-3 drop-shadow-sm">${tier.icon}</div>
                <h3 class="text-3xl font-black ${tier.color} mb-2">${genderEmoji} ${studentId}</h3>
                <p class="text-sm text-slate-500 font-bold">Lv.${level} • ${tier.name} 티어 (${wins}승)</p>
            </div>
            <div class="bg-slate-50 rounded-3xl p-5 mb-5 border border-slate-200 shadow-sm">
                <h4 class="text-sm sm:text-base font-bold text-slate-600 mb-4 text-left pl-1">✨ 주력 파트너 (Top 3)</h4>
                ${top3Html}
            </div>
            <div class="bg-slate-50 rounded-3xl p-5 border border-slate-200 shadow-sm flex justify-between items-center">
                <span class="text-sm sm:text-base font-bold text-slate-600 pl-1">🗺️ 최고 도달 단원</span>
                <span class="text-base sm:text-lg font-black text-indigo-700 px-4 py-1.5 bg-indigo-100 rounded-xl border border-indigo-200">${maxCh}단원</span>
            </div>`;
    } catch(e) { document.getElementById('trainer-modal-content').innerHTML = '<p class="text-red-500 py-10 font-bold text-center text-lg">정보를 불러올 수 없습니다.</p>'; }
};
window.closeAdventurerProfile = () => { document.getElementById('trainer-modal').style.display = 'none'; };

window.showTipModal = () => { document.getElementById('tip-modal').style.display = 'flex'; };
window.closeTipModal = () => { document.getElementById('tip-modal').style.display = 'none'; };
window.showTierModal = () => { document.getElementById('tier-modal').style.display = 'flex'; };
window.closeTierModal = () => { document.getElementById('tier-modal').style.display = 'none'; };

window.showCheatSheet = () => {
    const ch = window.state.currentChapter || 1;
    document.getElementById('cheat-sheet-title').innerText = `${ch}단원`;
    const listEl = document.getElementById('cheat-sheet-list');
    const filteredQuizzes = window.state.quizzes.filter(q => parseInt(q.chapter || 1) === ch && (q.word || '').toString().trim());
    
    if (filteredQuizzes.length === 0) listEl.innerHTML = '<p class="text-center text-slate-500 py-10 text-sm font-bold">등록된 영단어가 없습니다.</p>';
    else {
        let html = '';
       filteredQuizzes.forEach(q => {
            const safeW = (q.word || '').toString();
            html += `
            <div class="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col gap-1 select-none">
                <div class="font-black text-indigo-700 text-lg flex items-center justify-between">
                    ${safeW}
                    <button onclick="window.speakText('${safeW.replace(/'/g, "\\'")}', 'en-US')" class="hover:scale-125 transition-transform" title="발음 듣기">🔊</button>
                </div>
                <div class="text-sm text-slate-600 font-bold">${q.meaning}</div>
            </div>`;
        });
        listEl.innerHTML = html;
    }
    document.getElementById('cheat-sheet-modal').style.display = 'flex';
};
window.closeCheatSheet = () => { document.getElementById('cheat-sheet-modal').style.display = 'none'; };
// ==========================================
// 6. 전투 및 사냥터 (풀숲) 로직
// ==========================================
window.enterStage = (chapter) => {
    const currentLevel = window.state.gameData.level || 1;
    if (chapter >= 4 && chapter <= 6 && currentLevel < 5) return window.showCustomAlert("이 지역은 모험가 레벨 5 이상부터 진입할 수 있습니다!");
    if (chapter >= 7 && chapter <= 9 && currentLevel < 10) return window.showCustomAlert("이 지역은 모험가 레벨 10 이상부터 진입할 수 있습니다!");
    if (chapter >= 10 && chapter <= 12 && currentLevel < 15) return window.showCustomAlert("이 지역은 모험가 레벨 15 이상부터 진입할 수 있습니다!");

    window.state.currentChapter = chapter;
    document.getElementById('hunt-map-view').style.display = 'none';
    document.getElementById('hunt-battle-view').style.display = 'flex';
    document.getElementById('hunt-battle-view').classList.replace('hidden', 'flex'); 
    
    window.trainerIdleImg.src = window.state.gender === 'F' ? 'trainer2_idle.png' : 'trainer1_idle.png';
    window.charImg = window.trainerIdleImg;
    
    window.refreshQuiz(); window.AudioManager.playBGM('hunt');
};

window.exitStage = () => {
    document.getElementById('hunt-map-view').style.display = 'block';
    document.getElementById('hunt-battle-view').style.display = 'none';
    document.getElementById('hunt-battle-view').classList.replace('flex', 'hidden');
    window.AudioManager.playBGM('town');
};

window.refreshQuiz = () => {
    const input = document.getElementById('spell-in');
    const hint = document.getElementById('hint-msg');
    if (!window.state.quizzes || window.state.quizzes.length === 0) return;

    const chapterQuizzes = window.state.quizzes.filter(q => parseInt(q.chapter || 1) === window.state.currentChapter && (q.word || '').toString().trim());
    if (chapterQuizzes.length === 0) {
        document.getElementById('quiz-txt').innerText = "해당 단원에 보카몬이 없습니다.";
        if(input) input.disabled = true; return;
    }
    if(input) input.disabled = false;

    if (!window.state.gameData.savedEncounters) window.state.gameData.savedEncounters = {};
    const savedWord = window.state.gameData.savedEncounters[window.state.currentChapter];
    
    let foundQuiz = null;
    if (savedWord) foundQuiz = chapterQuizzes.find(q => (q.word || '').toString().toLowerCase() === savedWord.toString().toLowerCase());

    if (foundQuiz) window.state.currentQuiz = foundQuiz;
    else {
        let availableQuizzes = chapterQuizzes;
        if (window.state.currentQuiz && chapterQuizzes.length > 1) {
            availableQuizzes = chapterQuizzes.filter(q => (q.word || '').toString().toLowerCase() !== (window.state.currentQuiz.word || '').toString().toLowerCase());
        }
        window.state.currentQuiz = availableQuizzes[Math.floor(Math.random() * availableQuizzes.length)];
        window.state.gameData.savedEncounters[window.state.currentChapter] = (window.state.currentQuiz.word || '').toString();
        window.saveProgress();
    }

    document.getElementById('quiz-txt').innerText = window.state.currentQuiz.meaning || "알 수 없음";
    
    if(hint) { 
        hint.innerHTML = "정답 영단어를 입력하면 몬스터를 포획합니다!"; 
        hint.className = "text-slate-500 text-lg mt-4 font-bold"; 
    }

    const word = (window.state.currentQuiz.word || '').toString();
    const catchCount = window.state.gameData.caughtWords?.[word] || 0;
    const pInfo = getPokemonInfoForWord(word, catchCount);
    window.state.monster.name = word;
    window.state.monster.tier = pInfo.tier;
    window.state.monster.auraLevel = pInfo.auraLevel;
    window.monsterImg = new Image();
    window.monsterImg.src = pInfo.imgSrc;
};

window.checkMagic = () => {
    if (!window.state.currentQuiz) return;
    const input = document.getElementById('spell-in');
    const hint = document.getElementById('hint-msg');
    const correctWord = (window.state.currentQuiz.word || '').toString();
    
    if (input.value.trim().toLowerCase() === correctWord.toLowerCase()) { 
        handleAttack(); window.refreshQuiz(); input.value = ''; input.focus();
    } else {
        window.state.shake = 15;
        
        let arr = correctWord.split('');
        let scrambled = correctWord;
        let attempts = 0;
        
        if (correctWord.length > 1) {
            while (scrambled === correctWord && attempts < 10) {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                scrambled = arr.join('');
                attempts++;
            }
        }
        
        const scrambledText = arr.map(char => char.toLowerCase()).join(' &nbsp; ');
        hint.innerHTML = `<span class="text-xl text-red-500 font-bold">단어 힌트:</span><br><span class="text-4xl text-red-600 font-black tracking-widest mt-2 inline-block">${scrambledText}</span>`;
        hint.className = "mt-4"; 
        
        input.value = ''; input.focus();
    }

    const fakeText = document.getElementById('fake-text');
    if (fakeText) { fakeText.textContent = '영단어를 입력하세요'; fakeText.style.color = '#9ca3af'; }
};

function handleAttack() {
    const word = (window.state.currentQuiz.word || '').toString();
    if (!window.state.gameData.caughtWords) window.state.gameData.caughtWords = {};
    window.state.gameData.caughtWords[word] = (window.state.gameData.caughtWords[word] || 0) + 1;
    window.state.gameData.count++; window.state.monster.hp -= 100; window.state.monster.shake = 25;
    for (let i = 0; i < 20; i++) window.state.particles.push({ x: 280, y: 220, vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20, life: 1.0, color: "#ef4444" });
    
    window.trainerAttackImg.src = window.state.gender === 'F' ? 'trainer2_attack.png' : 'trainer1_attack.png';
    window.charImg = window.trainerAttackImg; 
    window.trainerAttackOffset = 30; 
    setTimeout(() => { window.charImg = window.trainerIdleImg; window.trainerAttackOffset = 0; }, 300);

    const catchCount = window.state.gameData.caughtWords[word];
    let defeatExp = catchCount > 10 ? 1 : 40;
    let hitExp = catchCount > 10 ? 0 : 15;

    if (window.state.monster.hp <= 0) { 
        window.state.gameData.exp += defeatExp; window.state.monster.hp = 100; 
        if (window.state.gameData.savedEncounters) delete window.state.gameData.savedEncounters[window.state.currentChapter];
    } else { window.state.gameData.exp += hitExp; }

    let reqExp = 100 + (window.state.gameData.level * 100);
    if (window.state.gameData.exp >= reqExp) {
        window.state.gameData.exp -= reqExp; window.state.gameData.level++;
        document.getElementById('modal').style.display = 'flex';
        document.getElementById('modal-desc').innerText = `레벨 ${window.state.gameData.level} 모험가가 되었습니다!`;
    }
    window.updateUI(); window.saveProgress();
}

// ==========================================
// 8. 아레나(배틀) 관련 로직 (무한 재도전 적용)
// ==========================================
window.submitBattleQuiz = (isTimeout = false) => {
    const inputEl = document.getElementById('b-spell-in');
    const inputVal = inputEl.value.trim().toLowerCase();
    const correctWord = window.battleState.expectedWord.toLowerCase();
    const success = (!isTimeout && inputVal === correctWord);

    const myMon = window.battleState.myTeam[window.battleState.myIdx];
    const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];

    // ⭐ 1. 틀렸지만 아직 시간이 남았을 때 (무한 재도전 기회 부여)
    if (!isTimeout && !success) {
        inputEl.value = '';
        inputEl.classList.add('border-red-500', 'bg-red-50');
        const fakeText = document.getElementById('b-fake-text');
        fakeText.textContent = '다시 입력하세요!';
        fakeText.style.color = '#ef4444';
        
        setTimeout(() => {
            inputEl.classList.remove('border-red-500', 'bg-red-50');
            if(!inputEl.value) {
                fakeText.textContent = '스펠링 입력';
                fakeText.style.color = '#9ca3af';
            }
        }, 500);
        return; // 함수 종료 (창을 닫지 않고 대기)
    }

    // ⭐ 2. 정답을 맞혔거나 시간이 다 끝났을 때 (최종 판정 후 창 닫기)
    clearTimeout(window.battleState.quizTimeout);
    document.getElementById('battle-quiz-modal').style.display = 'none';

    if (window.battleState.isShieldMode) {
        if (success) { 
            logBattleMsg("🛡️ 완벽한 방어! 데미지를 입지 않았다!", true); 
        } else {
            let dmg = Math.floor(oppMon.atk * 7); 
            myMon.hp -= dmg; showDmgText(dmg, false, true);
            logBattleMsg("💥 방어 실패! 엄청난 데미지를 입었다!", true);
        }
    } else {
        if (success) {
            let dmg = Math.floor(myMon.atk * 7); 
            oppMon.hp -= dmg; showDmgText(dmg, true, true);
            logBattleMsg("⚡ 스페셜 어택 명중! 효과가 굉장했다!", true);
        } else { 
            logBattleMsg("💦 시간 초과! 스페셜 어택이 실패했다...", false); 
        }
    }

    window.battleState.active = true; 
    updateBattleUI();
    const isGameOver = checkFaint();
    
    if(!isGameOver) {
        window.battleState.oppTimer = setInterval(() => { if(window.battleState.active) opponentAttack(); }, 200);
    }
};

const recordDefenseLog = async (oppId, attackerWon) => {
    try {
        const oppRef = getStudentDoc(oppId);
        const oppSnap = await getDoc(oppRef);
        if (oppSnap.exists()) {
            const oppData = oppSnap.data(); const oppStats = oppData.gameStats || {}; const logs = oppStats.defenseLogs || [];
            logs.unshift({ attacker: window.state.user, result: attackerWon ? 'lose' : 'win', timestamp: Date.now(), claimed: false });
            if (logs.length > 30) logs.length = 30; 
            await setDoc(oppRef, { gameStats: { ...oppStats, defenseLogs: logs } }, { merge: true });
        }
    } catch(e) { console.error("방어 기록 전송 실패", e); }
};

const endBattle = (isWin) => {
    window.battleState.active = false; clearInterval(window.battleState.oppTimer);

    let msg = "";
    if (isWin) {
        window.state.gameData.wins = (window.state.gameData.wins || 0) + 1;
        if (!window.state.gameData.victories) window.state.gameData.victories = {};
        window.state.gameData.victories[window.battleState.oppId] = Date.now();
        
        if (!window.state.gameData.usedPokemonCooldown) window.state.gameData.usedPokemonCooldown = {};
        const nowMs = Date.now();
        window.battleState.mySelection.forEach(word => { window.state.gameData.usedPokemonCooldown[word] = nowMs; });
        
        const isPrivileged = ['마스터', '테스트'].includes(window.state.user);
        let extraMsg = "";
        if (!isPrivileged) {
            if (window.battleState.oppId === '마스터') extraMsg = "\n(관장 배틀은 내일 다시 도전할 수 있습니다.)";
            else extraMsg = "\n(해당 모험가와는 3일 후 재대결 가능합니다.)";
        }

        msg = `🎉 배틀 승리!\n멋진 컨트롤이었습니다!\n출전한 파트너들은 오늘 하루 휴식합니다.\n총 🏆${window.state.gameData.wins}승 달성!${extraMsg}`;
        window.saveProgress(); window.updateUI();
    } else { msg = `💥 배틀 패배...\n상대방의 보카몬이 더 강합니다.\n단어를 더 잡아 레벨을 올리세요!`; }
    
    recordDefenseLog(window.battleState.oppId, isWin);
    window.showCustomAlert(msg);
    setTimeout(() => { window.cancelBattleSelect(); }, 500);
};

window.openDefenseLogs = () => {
    document.getElementById('defense-log-modal').style.display = 'flex';
    const listEl = document.getElementById('defense-log-list');
    const logs = window.state.gameData.defenseLogs || [];
    
    if (logs.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-500 font-bold py-10 text-sm">아직 체육관 방어 기록이 없습니다.</p>'; return;
    }

    let html = '';
    const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    logs.forEach(log => {
        const date = new Date(log.timestamp); const isToday = log.timestamp >= startOfToday; const pad = (n) => n.toString().padStart(2, '0');
        const timeStr = isToday ? `오늘 ${pad(date.getHours())}:${pad(date.getMinutes())}` : `${date.getMonth()+1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        
        if (log.result === 'win') {
            html += `
            <div class="bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4 shadow-sm">
                <div class="text-[10px] text-green-600 font-black mb-1">${timeStr}</div>
                <div class="text-sm sm:text-base font-black text-green-700">🛡️ ${log.attacker}의 도전을 완벽하게 방어했습니다!</div>
            </div>`;
        } else {
            let rewardHtml = !log.claimed ? `<button onclick="window.claimDefenseReward(${log.timestamp})" class="mt-2 w-full bg-pink-500 hover:bg-pink-600 text-white text-xs py-2 rounded-lg font-bold shadow-md transition-transform active:scale-95">🎁 위로 경험치(+20) 받기</button>` : `<div class="mt-2 text-[10px] text-slate-500 font-bold text-right">✅ 위로 보상 획득 완료</div>`;

            html += `
            <div class="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 shadow-sm">
                <div class="text-[10px] text-red-500 font-black mb-1">${timeStr}</div>
                <div class="text-sm sm:text-base font-black text-red-700">💔 ${log.attacker}에게 체육관이 돌파당했습니다...</div>
                <div class="text-xs text-slate-600 font-bold mt-1">하지만 파트너 보카몬이 끝까지 맞서 싸운 덕분에 위로 경험치를 얻었습니다!</div>
                ${rewardHtml}
            </div>`;
        }
    });
    listEl.innerHTML = html;
};
window.closeDefenseLogs = () => { document.getElementById('defense-log-modal').style.display = 'none'; };

window.claimDefenseReward = (timestamp) => {
    const logs = window.state.gameData.defenseLogs || [];
    const log = logs.find(l => l.timestamp === timestamp);
    if (!log || log.claimed || log.result !== 'lose') return;
    
    log.claimed = true; window.state.gameData.exp += 20;
    
    let reqExp = 100 + (window.state.gameData.level * 100);
    if (window.state.gameData.exp >= reqExp) {
        window.state.gameData.exp -= reqExp; window.state.gameData.level++;
        document.getElementById('modal').style.display = 'flex';
        document.getElementById('modal-desc').innerText = `레벨 ${window.state.gameData.level} 모험가가 되었습니다!`;
    }
    window.updateUI(); window.saveProgress(); window.openDefenseLogs();
};

// ==========================================
// 9. 캔버스 (게임 화면 그리기) - 라이트 모드
// ==========================================
function gameLoop() {
    const canvas = document.getElementById('gameCanvas');
    const battleView = document.getElementById('hunt-battle-view');
    
    if (!canvas || window.getComputedStyle(document.getElementById('content-hunt')).display === 'none' || window.getComputedStyle(battleView).display === 'none') { 
        requestAnimationFrame(gameLoop); return; 
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,400,350); 
    
    const ch = window.state.currentChapter || 1;
    let bgColor = "#f0fdf4"; let emoji = "🌲"; let groundColor = "#bbf7d0"; 
    if (ch >= 4 && ch <= 6) { bgColor = "#f0f9ff"; emoji = "🌊"; groundColor = "#bae6fd"; } 
    else if (ch >= 7 && ch <= 9) { bgColor = "#fff7ed"; emoji = "🌋"; groundColor = "#fed7aa"; } 
    else if (ch >= 10 && ch <= 12) { bgColor = "#faf5ff"; emoji = "🏙️"; groundColor = "#e9d5ff"; } 

    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 400, 350);

    ctx.save(); ctx.globalAlpha = 0.15; ctx.font = "150px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(emoji, 200, 140); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = groundColor;
    ctx.beginPath(); ctx.ellipse(100, 260, 65, 20, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(280, 240, 80, 25, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();

    const float = Math.sin(Date.now()/500)*10;
    const ms = (Math.random()-0.5)*window.state.shake; if(window.state.shake>0) window.state.shake*=0.8;
    ctx.save(); ctx.translate(100+ms + (window.trainerAttackOffset || 0), 200+float); if(window.charImg.complete) ctx.drawImage(window.charImg, -75, -75, 150, 150); ctx.restore();
    const mns = (Math.random()-0.5)*window.state.monster.shake; if(window.state.monster.shake>0) window.state.monster.shake*=0.8;
    ctx.save(); ctx.translate(280+mns, 220); 
    if (window.monsterImg?.complete) {
        const scale = 1 + (window.state.monster.tier*0.4); const w = 48*scale, h = 48*scale;
        ctx.imageSmoothingEnabled = false;
        if (window.state.monster.auraLevel > 0) {
            const auraSize = Math.max(w,h)*0.6;
            const grad = ctx.createRadialGradient(0,-20,auraSize*0.3, 0,-20,auraSize);
            grad.addColorStop(0, window.state.monster.auraLevel === 2 ? 'rgba(239,68,68,0.7)' : 'rgba(96,165,250,0.7)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.save(); ctx.beginPath(); ctx.arc(0,-20,auraSize,0,Math.PI*2); ctx.fillStyle=grad; ctx.globalCompositeOperation='lighter'; ctx.fill(); ctx.restore();
        }
        ctx.drawImage(window.monsterImg, -w/2, -h/2-20, w, h);
    }
    ctx.fillStyle="#334155"; ctx.font="bold 18px 'Jua'"; ctx.textAlign="center"; ctx.fillText(window.state.currentQuiz?.meaning || "???", 0, -65-(window.state.monster.tier*20));
    const cc = window.state.gameData.caughtWords?.[window.state.monster.name] || 0;
    ctx.fillStyle="#dc2626"; ctx.font="bold 15px 'Jua'"; ctx.fillText(`★ 잡은 횟수: ${cc}회`, 0, 35+(window.state.monster.tier*20)); ctx.restore();
    window.state.particles.forEach((p,i)=>{
        p.x+=p.vx; p.y+=p.vy; p.life-=0.05; ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,6,6);
        if(p.life<=0) window.state.particles.splice(i,1);
    });
    ctx.globalAlpha=1; requestAnimationFrame(gameLoop);
}

// ==========================================
// 10. 오리지널 보카몬(VocaMon) 매핑 로직
// ==========================================
function getPokemonInfoForWord(word, count) {
    const safeWord = (word || '').toString().toLowerCase();
    let lineIndex = window.state.monsterMap ? window.state.monsterMap[safeWord] : undefined;

    if (lineIndex === undefined) {
        let hash = 0; 
        for (let i = 0; i < safeWord.length; i++) {
            hash = safeWord.charCodeAt(i) + ((hash << 5) - hash);
        }
        lineIndex = Math.abs(hash) % 62;
    }

    const targetTier = count >= 10 ? 3 : (count >= 5 ? 2 : 1);

    const VOCAMON_LINES = [
        [1,2,3], [21,22,23], [42,43,44], [63,64,65], [84,85,86], [105,106,107], [125,126,127],
        [4,5,6], [24,25,26], [45,46,47], [66,67,68], [87,88,89], [108,109,110], [128,129,130],
        [7,8], [27,28], [48,49], [69,70,71], [90,91], [111,112], [131,132,133],
        [9,10], [29,30], [50,51], [72,73], [92,93], [113,114], [134,135],
        [11,12], [31,32], [52,53], [74,75], [94,95], [115,116], [136,137],
        [13,14], [33,34], [54,55], [76,77], [96,97], [117,118], [138,139],
        [15,16], [35,36], [56,57], [78,79], [98,99], [119,120], [140,141],
        [17], [37,38], [58], [80,81], [100,101], [121], [142,143],
        [18], [39], [59], [82], [102], [122], [144],
        [19], [40], [60], [83], [103], [123],
        [20], [41], [61], [104], [124],
        [62]
    ];

    const line = VOCAMON_LINES[lineIndex];
    const pIdx = Math.min(targetTier - 1, line.length - 1);
    const imageNumber = line[pIdx];
    const auraLevel = Math.max(0, targetTier - line.length);

    return {
        id: imageNumber,
        tier: Math.min(targetTier, line.length), 
        auraLevel: auraLevel,
        imgSrc: `./media/mon_${imageNumber}.png` 
    };
}

// ==========================================
// ⭐ 11. 시험(테스트) 및 함정(감옥) 모드 로직 
// ==========================================
window.renderTestPaper = (chapter) => {
    const listEl = document.getElementById('test-paper-list');
    if (!listEl) return;
    
    if (!window.state.quizzes || window.state.quizzes.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-500 font-bold py-4">단어 데이터가 없습니다.</p>';
        return;
    }

    const chapterWords = window.state.quizzes.filter(q => parseInt(q.chapter || 1) === parseInt(chapter) && (q.word || '').toString().trim());
    
    if (chapterWords.length === 0) {
        listEl.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-500 rounded-xl p-4 text-center font-bold">출제할 단어가 없습니다!<br>관리자 화면에서 [${chapter}단원] 영단어를 먼저 추가해주세요.</div>`;
        document.getElementById('btn-submit-test').style.display = 'none';
        return;
    }

    document.getElementById('btn-submit-test').style.display = 'block';

    const shuffled = [...chapterWords].sort(() => Math.random() - 0.5);
    let html = '';
    shuffled.forEach((q, idx) => {
        html += `
        <div class="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 mb-3 flex flex-col gap-2 shadow-sm">
            <div class="flex justify-between items-center">
                <span class="text-xs font-black text-black bg-slate-200 px-2 py-1 rounded-lg tracking-wider">Q ${idx + 1}</span>
            </div>
            <div class="text-lg sm:text-xl font-black text-slate-800 break-keep mt-1">${q.meaning}</div>
            <input type="text" class="test-answer-input w-full p-4 border-2 border-slate-400 rounded-xl font-bold text-xl text-slate-900 bg-white outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all shadow-inner placeholder-slate-400" style="color: #0f172a !important; text-shadow: none !important; -webkit-text-stroke: 0 !important;" placeholder="영단어 스펠링 입력" data-word="${(q.word||'').toString()}" autocapitalize="off" autocomplete="off" spellcheck="false">
        </div>`;
    });
    listEl.innerHTML = html;
    document.getElementById('test-mode-desc').innerHTML = `[${chapter}단원] 시험이 시작되었습니다.<br>빈칸에 알맞은 영어 스펠링을 입력하세요.`;
};

window.submitTest = async () => {
    const btn = document.getElementById('btn-submit-test');
    if (btn && btn.disabled) return; 
    
    if (btn) {
        btn.disabled = true;
        btn.classList.remove('bg-red-600', 'hover:bg-red-700', 'active:scale-95');
        btn.classList.add('bg-slate-500');
        btn.innerText = '제출 처리 중...';
    }

    const inputs = document.querySelectorAll('.test-answer-input');
    let total = inputs.length;
    let score = 0;
    let wrongWords = [];

    inputs.forEach(input => {
        const correctWord = (input.getAttribute('data-word') || '').toString().trim().toLowerCase();
        const userWord = input.value.trim().toLowerCase();
        if (userWord === correctWord) score++;
        else wrongWords.push(correctWord);
    });

    const chapter = window.state.currentTestChapter || 1;
    
    try {
        const docRef = getStudentDoc(window.state.user);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            let data = docSnap.data();
            let stats = data.gameStats || {};
            if (!stats.testScores) stats.testScores = {};
            
            stats.testScores[chapter] = {
                score: score,
                total: total,
                wrongWords: wrongWords,
                unsubmitted: false
            };
            
            await setDoc(docRef, { gameStats: stats }, { merge: true });
        }
        
        inputs.forEach(input => {
            const correctWord = (input.getAttribute('data-word') || '').toString().trim().toLowerCase();
            const userWord = input.value.trim().toLowerCase();
            
            input.disabled = true;
            input.classList.replace('bg-white', 'bg-slate-100'); 
            
            if (userWord === correctWord) {
                input.style.setProperty('color', '#059669', 'important'); 
                input.classList.replace('border-slate-400', 'border-emerald-500');
                input.value = `${correctWord} (정답!)`;
            } else {
                input.style.setProperty('color', '#dc2626', 'important'); 
                input.classList.replace('border-slate-400', 'border-red-500');
                input.value = `${userWord || '미입력'} ➔ 정답: ${correctWord}`;
            }
        });
        
        if (btn) btn.style.display = 'none';
        const msgEl = document.getElementById('test-submit-msg');
        if (msgEl) {
            msgEl.innerHTML = `✅ 정상적으로 제출되었습니다! (${total}문제 중 ${score}점)<br><span class="text-sm text-slate-500">선생님이 시험을 종료할 때까지 화면을 끄지 말고 대기하세요.</span>`;
            msgEl.style.display = 'block';
        }
    } catch (error) {
        console.error("Test Submit Error:", error);
        alert("서버 통신 중 오류가 발생했습니다. 다시 눌러주세요.");
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('bg-slate-500');
            btn.classList.add('bg-red-600', 'hover:bg-red-700', 'active:scale-95');
            btn.innerText = '제출하기';
        }
    }
};

window.renderPrisonPaper = () => {
    const listEl = document.getElementById('prison-paper-list');
    if (!listEl) return;
    
    const words = window.state.prisonWords || {};
    let html = '';
    
    for (let word in words) {
        const count = words[word];
        if (count > 0) {
            const safeW = (word || '').toString();
            const quiz = window.state.quizzes.find(q => (q.word || '').toString().toLowerCase() === safeW.toLowerCase());
            const meaning = quiz ? quiz.meaning : '알 수 없음';
            const safeId = safeW.replace(/[^a-zA-Z0-9]/g, '');
            
            html += `
            <div class="bg-slate-100 p-4 rounded-2xl border-2 border-slate-300 flex flex-col gap-2 shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-base sm:text-lg font-black text-slate-800 break-keep pr-2">${meaning}</span>
                    <span class="bg-purple-100 text-purple-700 text-[10px] sm:text-xs px-2.5 py-1 rounded-md font-bold shrink-0 shadow-sm border border-purple-300">남은 횟수: ${count}번</span>
                </div>
                <div class="flex gap-2">
                    <input type="text" id="prison-in-${safeId}" class="prison-answer-input w-full p-4 border-2 border-slate-400 rounded-xl font-bold text-xl text-slate-900 bg-white outline-none focus:border-purple-500 transition-all shadow-inner placeholder-slate-400" style="color: #0f172a !important; text-shadow: none !important; -webkit-text-stroke: 0 !important;" placeholder="[${safeW}] 정확히 입력하세요" onkeyup="if(event.key==='Enter') window.checkPrisonInput(this, '${safeW.replace(/'/g, "\\'")}')" autocapitalize="off" autocomplete="off" spellcheck="false" onpaste="return false;" ondrop="return false;">
                    <button onclick="window.checkPrisonInput(document.getElementById('prison-in-${safeId}'), '${safeW.replace(/'/g, "\\'")}')" class="bg-purple-500 hover:bg-purple-600 text-white font-bold text-lg px-6 rounded-xl shadow-md transition-transform active:scale-95 shrink-0">입력</button>
                </div>
            </div>`;
        }
    }
    listEl.innerHTML = html;
};

window.checkPrisonInput = async (inputEl, word) => {
    const val = inputEl.value.trim().toLowerCase();
    const safeWord = (word || '').toString().toLowerCase();

    if (val === safeWord) {
        inputEl.value = '';
        inputEl.setAttribute('placeholder', `[${word}] 정확히 입력하세요`);
        
        try {
            const docRef = getStudentDoc(window.state.user);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                let data = docSnap.data();
                let prisonMode = data.prisonMode || {};
                let wordsToType = prisonMode.wordsToType || {};
                
                if (wordsToType[word] > 0) {
                    wordsToType[word]--;
                }
                
                let active = false;
                for (let w in wordsToType) {
                    if (wordsToType[w] > 0) active = true;
                }
                
                prisonMode.active = active;
                prisonMode.wordsToType = wordsToType;
                
                await setDoc(docRef, { prisonMode: prisonMode }, { merge: true });
                
                if (!active) {
                    window.showCustomAlert("🎉 축하합니다!\n모든 오답을 완벽하게 복습하여 함정에서 탈출했습니다!");
                } else {
                    window.state.prisonWords = wordsToType;
                    window.renderPrisonPaper();
                }
            }
        } catch (error) {
            console.error("Prison check error:", error);
        }
    } else {
        inputEl.value = '';
        inputEl.setAttribute('placeholder', "틀렸습니다! 다시 입력하세요.");
        inputEl.classList.add('border-red-500', 'bg-red-100', 'placeholder-red-500');
        
        setTimeout(() => {
            inputEl.classList.remove('border-red-500', 'bg-red-100', 'placeholder-red-500');
            if(!inputEl.value) {
                inputEl.setAttribute('placeholder', `[${word}] 정확히 입력하세요`);
            }
        }, 800);
    }
};
