import { auth, getStudentsCollection, getStudentDoc, getWordListCollection, STUDENT_GENDER } from './firebase.js';
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
    volume: 0.5, // ⭐ 기본 소리 크기 (0.0 ~ 1.0)
    init: function() {
        Object.values(this.bgms).forEach(audio => { 
            audio.loop = true; 
            audio.volume = this.volume; // 로딩 시 볼륨 적용
        });
    },
    // ⭐ 소리 크기를 실시간으로 조절하는 함수 추가
    setVolume: function(val) {
        this.volume = parseFloat(val);
        Object.values(this.bgms).forEach(audio => { 
            audio.volume = this.volume; 
        });
        // 볼륨이 0이 되면 음소거 아이콘으로 변경
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
            this.bgms[type].volume = this.volume; // 재생 전 볼륨 확인
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
// ==========================================
// ★ 단어 읽어주기 (TTS) 기능 추가
// ==========================================
window.speakWord = (text, event) => {
    if (event) event.stopPropagation(); // 버튼 누를 때 다른 이벤트 겹침 방지
    if (!text && window.state.currentQuiz) text = window.state.currentQuiz.word;
    if (!text) return;
    
    window.speechSynthesis.cancel(); // 기존에 읽고 있던 소리 취소
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // 미국 영어 발음
    utterance.rate = 0.85;    // 6학년 학생들을 위해 기본 속도보다 아주 살짝 느리게 설정
    window.speechSynthesis.speak(utterance);
};

window.state = {
    user: null, 
    authUid: null,
    gameData: { level: 1, exp: 0, count: 0, wins: 0, caughtWords: {}, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} },
    quizzes: [],
    currentQuiz: null,
    currentChapter: 1,
    shake: 0,
    particles: [],
    monster: { hp: 100, shake: 0, tier: 1, name: "???" }
};

// ==========================================
// 2. 포켓몬 전투 공식 및 타입 설정
// ==========================================
const TYPE_EFFECTIVENESS = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

const getMatchup = (atk, def) => {
    if(!TYPE_EFFECTIVENESS[atk]) return 1;
    return TYPE_EFFECTIVENESS[atk][def] !== undefined ? TYPE_EFFECTIVENESS[atk][def] : 1;
};

const TYPE_COLORS = {
    normal: { bg: 'bg-[#A8A77A]', color: '#A8A77A', name: '노말' },
    fire: { bg: 'bg-[#EE8130]', color: '#EE8130', name: '불꽃' },
    water: { bg: 'bg-[#6390F0]', color: '#6390F0', name: '물' },
    electric: { bg: 'bg-[#F7D02C]', color: '#F7D02C', name: '전기' },
    grass: { bg: 'bg-[#7AC74C]', color: '#7AC74C', name: '풀' },
    ice: { bg: 'bg-[#96D9D6]', color: '#96D9D6', name: '얼음' },
    fighting: { bg: 'bg-[#C22E28]', color: '#C22E28', name: '격투' },
    poison: { bg: 'bg-[#A33EA1]', color: '#A33EA1', name: '독' },
    ground: { bg: 'bg-[#E2BF65]', color: '#E2BF65', name: '땅' },
    flying: { bg: 'bg-[#A98FF3]', color: '#A98FF3', name: '비행' },
    psychic: { bg: 'bg-[#F95587]', color: '#F95587', name: '에스퍼' },
    bug: { bg: 'bg-[#A6B91A]', color: '#A6B91A', name: '벌레' },
    rock: { bg: 'bg-[#B6A136]', color: '#B6A136', name: '바위' },
    ghost: { bg: 'bg-[#735797]', color: '#735797', name: '고스트' },
    dragon: { bg: 'bg-[#6F35FC]', color: '#6F35FC', name: '드래곤' },
    dark: { bg: 'bg-[#705746]', color: '#705746', name: '악' },
    steel: { bg: 'bg-[#B7B7CE]', color: '#B7B7CE', name: '강철' },
    fairy: { bg: 'bg-[#D685AD]', color: '#D685AD', name: '페어리' }
};

// ==========================================
// 3. 팝업(Alert/Confirm) 및 로그인 처리
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
        statusEl.className = isError ? "text-red-500 text-xs mt-2 font-bold" : "text-red-400 text-xs mt-2 animate-pulse";
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
        setStatus("도감 서버 준비 완료! 트레이너를 선택하세요.");
        document.getElementById('login-btn').disabled = false;
    } else {
        window.state.authUid = null;
        document.getElementById('login-btn').disabled = true;
    }
});

window.handleLogin = async () => {
    if (!window.state.authUid) return window.showCustomAlert("서버와 연결되지 않았습니다.");
    const idInput = document.getElementById('user-id').value.trim();
    const pwInput = document.getElementById('user-pw').value.trim();
    const btn = document.getElementById('login-btn');
    if (!idInput || !pwInput) return window.showCustomAlert("트레이너 이름과 비밀번호를 모두 입력하세요!");
    btn.disabled = true;
    setStatus("트레이너 기록 조회 중...");
    
    try {
        const docRef = getStudentDoc(idInput);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.password !== pwInput) {
                btn.disabled = false; setStatus("비밀번호 오류", true);
                return window.showCustomAlert("비밀번호가 틀렸습니다!");
            }
            if (data.forceLogout) await setDoc(docRef, { forceLogout: false }, { merge: true });

            window.state.gameData = data.gameStats || { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
            if(window.state.gameData.wins === undefined) window.state.gameData.wins = 0;
            if(window.state.gameData.victories === undefined) window.state.gameData.victories = {};
            if(window.state.gameData.partnerWord === undefined) window.state.gameData.partnerWord = null;
            if(window.state.gameData.usedPokemonCooldown === undefined) window.state.gameData.usedPokemonCooldown = {};
            if(window.state.gameData.savedEncounters === undefined) window.state.gameData.savedEncounters = {};
            if(window.state.gameData.defenseLogs === undefined) window.state.gameData.defenseLogs = [];
            if(window.state.gameData.testScores === undefined) window.state.gameData.testScores = {};
            
            setStatus("접속 성공!"); enterGame(idInput);
        } else {
            const isConfirmed = await window.showCustomConfirm(`'${idInput}' 트레이너님!\n비밀번호[${pwInput}]로 계정을 새로 생성할까요?`);
            if (isConfirmed) {
                await setDoc(docRef, { id: idInput, password: pwInput, gameStats: window.state.gameData, createdAt: new Date().toISOString(), forceLogout: false });
                enterGame(idInput);
            } else { btn.disabled = false; setStatus("취소됨", true); }
        }
    } catch (error) { btn.disabled = false; }
};

function enterGame(id) {
    window.state.user = id;
    document.getElementById('player-name').innerText = id;
    document.getElementById('app-wrapper').classList.replace('max-w-[480px]', 'max-w-[1400px]');
    if (id === '마스터' || id === '선생님') document.getElementById('admin-btn').style.display = 'inline-block';
    
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('game-view').style.display = 'block';
    
    startMagicRPG();
    window.switchTab('rank'); 
    window.AudioManager.playBGM('town');
}

// ==========================================
// 4. 게임 핵심 흐름 (탭, 데이터 동기화, 모달)
// ==========================================
window.switchTab = (tabName) => {
    if(window.battleState && window.battleState.active && tabName !== 'arena') {
        return window.showCustomAlert("배틀 중에는 다른 탭으로 이동할 수 없습니다. 도망치기를 누르세요!");
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

    if (tabName === 'rank' || tabName === 'hunt') window.AudioManager.playBGM('town');
    else if (tabName === 'arena') window.AudioManager.playBGM('battle');
    else if (tabName === 'dex') window.AudioManager.playBGM('dex');
};

let unsubscribeWords = null;
let unsubscribeStudent = null;

function startMagicRPG() {
    unsubscribeWords = onSnapshot(getWordListCollection(), (snapshot) => {
        window.state.quizzes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

            // 시험 모드 감지
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
                        const correctWord = input.getAttribute('data-word').toLowerCase().trim();
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
                    submitBtn.classList.replace('bg-slate-400', 'bg-red-600');
                }
                const msgEl = document.getElementById('test-submit-msg');
                if (msgEl) msgEl.style.display = 'none';
            }

            // 함정 모드 감지
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
    
    const gender = STUDENT_GENDER[window.state.user] || "male";
    const tNum = gender === "female" ? "2" : "1";
    
    window.trainerIdleImg = new Image(); window.trainerIdleImg.src = `trainer${tNum}_idle.png`;
    window.trainerAttackImg = new Image(); window.trainerAttackImg.src = `trainer${tNum}_attack.png`;
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
// 5. 모달 및 부가 기능 (도감 파트너, 지배자, 랭킹)
// ==========================================
window.setPartner = (word) => {
    const count = window.state.gameData.caughtWords[word] || 0;
    if (count < 10) return window.showCustomAlert(`포획 횟수가 10회 이상인 진정한 파트너만 등록할 수 있습니다!\n(현재: ${count}회)`);

    const listEl = document.getElementById('partner-stage-list');
    let html = ''; let uniqueStages = []; let seenIds = new Set();

    [1, 2, 3].forEach(tier => {
        let fakeCount = tier === 1 ? 1 : (tier === 2 ? 5 : 10);
        const pInfo = getPokemonInfoForWord(word, fakeCount);
        if (!seenIds.has(pInfo.id)) { seenIds.add(pInfo.id); uniqueStages.push({ tier, pInfo }); }
    });

    uniqueStages.forEach(stage => {
        const apiData = LOCAL_POKEMON_DB[stage.pInfo.id] || { name: "알 수 없음", type: "normal" };
        html += `
        <div onclick="window.confirmPartner('${word}', ${stage.tier})" class="cursor-pointer bg-slate-900 border-2 border-slate-600 hover:border-yellow-400 rounded-2xl p-4 flex flex-col items-center hover:scale-105 transition-all shadow-md w-28 sm:w-32">
            <img src="${stage.pInfo.imgSrc}" crossorigin="anonymous" class="h-16 w-16 sm:h-20 sm:w-20 object-contain mb-2 drop-shadow-md" style="image-rendering:pixelated;">
            <span class="text-xs font-bold text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded mb-1">Lv.${stage.tier}</span>
            <span class="text-sm font-black text-white truncate w-full text-center">${apiData.name}</span>
        </div>`;
    });
    listEl.innerHTML = html;
    document.getElementById('partner-stage-modal').style.display = 'flex';
};

window.closePartnerStageModal = () => { document.getElementById('partner-stage-modal').style.display = 'none'; };

window.confirmPartner = (word, tier) => {
    window.state.gameData.partnerWord = word; window.state.gameData.partnerStage = tier;
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
            if (['테스트', '테스트2', '선생님', '마스터'].includes(sId)) return;
            const caught = doc.data().gameStats?.caughtWords || {};
            for (let word in caught) {
                const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === word.toLowerCase());
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
            if (maxCount > 0) domEl.innerHTML = `<span class="bg-yellow-900/60 text-yellow-400 px-2 py-0.5 rounded-md border border-yellow-700/50 font-bold shadow-sm">👑 지배자: ${dominator}</span>`;
            else domEl.innerHTML = `<span class="bg-slate-800/50 text-slate-500 px-2 py-0.5 rounded-md border border-slate-700/50 font-bold">👑 지배자: 없음</span>`;
        }
    } catch (e) { console.error("지배자 정보를 불러오는 중 오류", e); }
};

window.showTrainerProfile = async (studentId) => {
    document.getElementById('trainer-modal').style.display = 'flex';
    document.getElementById('trainer-modal-content').innerHTML = '<p class="text-slate-400 py-10 animate-pulse font-bold text-center text-lg">트레이너 정보를 불러오는 중...</p>';

    try {
        const docSnap = await getDoc(getStudentDoc(studentId));
        if(!docSnap.exists()) throw new Error();
        const stats = docSnap.data().gameStats || {};
        const caughtWords = stats.caughtWords || {};
        const wins = stats.wins || 0; const level = stats.level || 1;
        const tier = getTierInfo(wins);

        const sortedWords = Object.keys(caughtWords).sort((a,b)=>caughtWords[b]-caughtWords[a]).slice(0, 3);
        let top3Html = '';
        if (sortedWords.length === 0) top3Html = '<p class="text-slate-500 text-sm font-bold text-center py-6">포획한 영켓몬이 없습니다.</p>';
        else {
            top3Html = '<div class="flex justify-center gap-3">';
            sortedWords.forEach(word => {
                const count = caughtWords[word];
                const pInfo = getPokemonInfoForWord(word, count);
                top3Html += `
                    <div class="bg-slate-800 border border-slate-600 rounded-2xl p-3 flex flex-col items-center w-28 sm:w-32 shadow-md hover:scale-105 transition-transform">
                        <img src="${pInfo.imgSrc}" crossorigin="anonymous" class="h-16 sm:h-20 object-contain drop-shadow-md mb-2" style="image-rendering:pixelated;">
                        <span class="text-xs sm:text-sm font-black text-white truncate w-full text-center mt-1">${word}</span>
                        <span class="text-[10px] sm:text-xs text-yellow-400 font-bold mt-1">★ ${count}회</span>
                    </div>`;
            });
            top3Html += '</div>';
        }

        let maxCh = 1;
        for (let w in caughtWords) {
            const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === w.toLowerCase());
            if (quiz && quiz.chapter > maxCh) maxCh = quiz.chapter;
        }

        document.getElementById('trainer-modal-content').innerHTML = `
            <div class="mb-6 mt-2 text-center">
                <div class="text-6xl mb-3 drop-shadow-lg">${tier.icon}</div>
                <h3 class="text-3xl font-black ${tier.color} mb-2">${studentId}</h3>
                <p class="text-sm text-slate-300 font-bold">Lv.${level} • ${tier.name} 티어 (${wins}승)</p>
            </div>
            <div class="bg-slate-900/80 rounded-3xl p-5 mb-5 border border-slate-700 shadow-inner">
                <h4 class="text-sm sm:text-base font-bold text-slate-400 mb-4 text-left pl-1">✨ 주력 파트너 (Top 3)</h4>
                ${top3Html}
            </div>
            <div class="bg-slate-900/80 rounded-3xl p-5 border border-slate-700 shadow-inner flex justify-between items-center">
                <span class="text-sm sm:text-base font-bold text-slate-400 pl-1">🗺️ 최고 도달 단원</span>
                <span class="text-base sm:text-lg font-black text-indigo-400 px-4 py-1.5 bg-indigo-900/30 rounded-xl border border-indigo-500/30">${maxCh}단원</span>
            </div>`;
    } catch(e) { document.getElementById('trainer-modal-content').innerHTML = '<p class="text-red-500 py-10 font-bold text-center text-lg">정보를 불러올 수 없습니다.</p>'; }
};
window.closeTrainerProfile = () => { document.getElementById('trainer-modal').style.display = 'none'; };

window.showTipModal = () => { document.getElementById('tip-modal').style.display = 'flex'; };
window.closeTipModal = () => { document.getElementById('tip-modal').style.display = 'none'; };
window.showTierModal = () => { document.getElementById('tier-modal').style.display = 'flex'; };
window.closeTierModal = () => { document.getElementById('tier-modal').style.display = 'none'; };

window.showCheatSheet = () => {
    const ch = window.state.currentChapter || 1;
    document.getElementById('cheat-sheet-title').innerText = `${ch}단원`;
    const listEl = document.getElementById('cheat-sheet-list');
    const filteredQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) === ch);
    
    if (filteredQuizzes.length === 0) listEl.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm">등록된 영단어가 없습니다.</p>';
    else {
        let html = '';
       filteredQuizzes.forEach(q => {
            html += `
            <div class="bg-slate-900/80 rounded-xl p-3 border border-slate-700 shadow-inner flex flex-col gap-1 select-none">
                <div class="font-black text-indigo-400 text-lg flex items-center justify-between">
                    ${q.word}
                    <button onclick="window.speakWord('${q.word}', event)" class="hover:scale-125 transition-transform" title="발음 듣기">🔊</button>
                </div>
                <div class="text-sm text-slate-300 font-bold">${q.meaning}</div>
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
    if (chapter >= 4 && chapter <= 6 && currentLevel < 5) return window.showCustomAlert("이 지역은 트레이너 레벨 5 이상부터 진입할 수 있습니다!");
    if (chapter >= 7 && chapter <= 9 && currentLevel < 10) return window.showCustomAlert("이 지역은 트레이너 레벨 10 이상부터 진입할 수 있습니다!");
    if (chapter >= 10 && chapter <= 12 && currentLevel < 15) return window.showCustomAlert("이 지역은 트레이너 레벨 15 이상부터 진입할 수 있습니다!");

    window.state.currentChapter = chapter;
    document.getElementById('hunt-map-view').style.display = 'none';
    document.getElementById('hunt-battle-view').style.display = 'flex';
    document.getElementById('hunt-battle-view').classList.replace('hidden', 'flex'); 
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
    if (window.state.quizzes.length === 0) return;

    const chapterQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) === window.state.currentChapter);
    if (chapterQuizzes.length === 0) {
        document.getElementById('quiz-txt').innerText = "해당 단원에 포켓몬이 없습니다.";
        if(input) input.disabled = true; return;
    }
    if(input) input.disabled = false;

    if (!window.state.gameData.savedEncounters) window.state.gameData.savedEncounters = {};
    const savedWord = window.state.gameData.savedEncounters[window.state.currentChapter];
    
    let foundQuiz = null;
    if (savedWord) foundQuiz = chapterQuizzes.find(q => q.word.toLowerCase() === savedWord.toLowerCase());

    if (foundQuiz) window.state.currentQuiz = foundQuiz;
    else {
        let availableQuizzes = chapterQuizzes;
        if (window.state.currentQuiz && chapterQuizzes.length > 1) {
            availableQuizzes = chapterQuizzes.filter(q => q.word.toLowerCase() !== window.state.currentQuiz.word.toLowerCase());
        }
        window.state.currentQuiz = availableQuizzes[Math.floor(Math.random() * availableQuizzes.length)];
        window.state.gameData.savedEncounters[window.state.currentChapter] = window.state.currentQuiz.word;
        window.saveProgress();
    }

    document.getElementById('quiz-txt').innerText = window.state.currentQuiz.meaning;
    if(hint) { hint.innerText = "정답 영단어를 입력하면 몬스터볼을 던집니다!"; hint.className = "text-slate-400 text-[10px] mt-4 font-normal italic"; }

    const word = window.state.currentQuiz.word;
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
    
    if (input.value.trim().toLowerCase() === window.state.currentQuiz.word.toLowerCase()) { 
        handleAttack(); window.refreshQuiz(); input.value = ''; input.focus();
    } else {
        window.state.shake = 15;
        hint.innerText = `틀렸어요! (정답 힌트: ${window.state.currentQuiz.word.charAt(0)}...)`;
        hint.className = "text-red-500 text-[12px] mt-4 font-bold animate-bounce";
        input.value = ''; input.focus();
    }

    const fakeText = document.getElementById('fake-text');
    if (fakeText) { fakeText.textContent = '영단어를 입력하세요'; fakeText.style.color = '#9ca3af'; }
};

function handleAttack() {
    const word = window.state.currentQuiz.word;
    if (!window.state.gameData.caughtWords) window.state.gameData.caughtWords = {};
    window.state.gameData.caughtWords[word] = (window.state.gameData.caughtWords[word] || 0) + 1;
    window.state.gameData.count++; window.state.monster.hp -= 100; window.state.monster.shake = 25;
    for (let i = 0; i < 20; i++) window.state.particles.push({ x: 280, y: 220, vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20, life: 1.0, color: "#ef4444" });
    
    window.charImg = window.trainerAttackImg; window.trainerAttackOffset = 30; 
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
        document.getElementById('modal-desc').innerText = `레벨 ${window.state.gameData.level} 트레이너가 되었습니다!`;
    }
    window.updateUI(); window.saveProgress();
}

// ==========================================
// 7. UI 업데이트 (도감, 랭킹 등)
// ==========================================
const getTierInfo = (wins) => {
    if (wins >= 200) return { name: '마스터', icon: '👑', color: 'text-purple-600', bgClass: 'tier-master', badgeClass: 'bg-purple-100 border-purple-300' };
    if (wins >= 150) return { name: '다이아', icon: '💎', color: 'text-sky-500', bgClass: 'tier-diamond', badgeClass: 'bg-sky-50 border-sky-200' };
    if (wins >= 100) return { name: '플래티넘', icon: '💠', color: 'text-emerald-500', bgClass: 'tier-platinum', badgeClass: 'bg-emerald-50 border-emerald-200' };
    if (wins >= 60) return { name: '골드', icon: '🥇', color: 'text-yellow-600', bgClass: 'tier-gold', badgeClass: 'bg-yellow-50 border-yellow-300' };
    if (wins >= 30) return { name: '실버', icon: '🥈', color: 'text-slate-500', bgClass: 'tier-silver', badgeClass: 'bg-slate-100 border-slate-300' };
    if (wins >= 10) return { name: '브론즈', icon: '🥉', color: 'text-amber-700', bgClass: 'tier-bronze', badgeClass: 'bg-amber-100 border-amber-300' };
    return { name: '아이언', icon: '⚙️', color: 'text-slate-600', bgClass: 'tier-iron', badgeClass: 'bg-slate-100 border-slate-200' };
};

window.updateUI = () => {
    document.getElementById('lvl-txt').innerText = window.state.gameData.level;
    document.getElementById('cnt-txt').innerText = window.state.gameData.count; 
    
    let reqExp = 100 + (window.state.gameData.level * 100);
    let expPercent = Math.min(100, (window.state.gameData.exp / reqExp) * 100);
    document.getElementById('exp-bar').style.width = expPercent + "%";
    
    const wins = window.state.gameData.wins || 0; const tier = getTierInfo(wins);
    const winsTxt = document.getElementById('wins-txt');
    if (winsTxt) {
        winsTxt.innerText = `${tier.icon} ${wins}승`;
        winsTxt.className = `text-base font-black ml-2 px-2 py-0.5 rounded-xl border ${tier.color} ${tier.badgeClass}`;
    }

    const profileCard = document.getElementById('profile-card');
    const playerName = document.getElementById('player-name');
    if (profileCard) {
        profileCard.className = `rounded-3xl p-5 mb-4 shadow-lg flex justify-between items-start border-b-4 transition-all duration-500 ${tier.bgClass}`;
        if (wins >= 200) playerName.classList.add('name-master');
        else playerName.classList.remove('name-master');
    }

    const badge = document.getElementById('rank-badge');
    const lvl = window.state.gameData.level;
    if (lvl >= 50) { badge.innerText = "🪽 레전드"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-yellow-500 text-white font-black uppercase shadow-sm tracking-wider"; }
    else if (lvl >= 40) { badge.innerText = "🟣 마스터"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-black uppercase tracking-wider"; }
    else if (lvl >= 30) { badge.innerText = "✨ 엘리트"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold uppercase tracking-wider"; }
    else if (lvl >= 20) { badge.innerText = "🛡️ 베테랑"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold uppercase tracking-wider"; }
    else if (lvl >= 15) { badge.innerText = "🔵 에이스"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold uppercase tracking-wider"; }
    else if (lvl >= 10) { badge.innerText = "🏕️ 캠퍼"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold uppercase tracking-wider"; }
    else if (lvl >= 5) { badge.innerText = "🟢 루키"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold uppercase tracking-wider"; }
    else { badge.innerText = "🔴 비기너"; badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold uppercase tracking-wider"; }
};

window.renderDex = async () => {
    const dexList = document.getElementById('dex-list');
    const caughtWords = window.state.gameData.caughtWords || {};
    const keys = Object.keys(caughtWords);
    document.getElementById('dex-total').innerText = keys.length;
    
    if (keys.length === 0) {
        dexList.innerHTML = `<p class="text-center text-slate-400 py-10 text-sm">아직 포획한 영켓몬이 없습니다.<br>사냥터에서 영단어를 맞혀보세요!</p>`; return;
    }
    
    const sortedKeys = keys.sort((a, b) => caughtWords[b] - caughtWords[a]);
    const cardDataList = sortedKeys.map(word => {
        const count = caughtWords[word];
        const meaning = window.state.quizzes.find(q => q.word.toLowerCase() === word.toLowerCase())?.meaning || "알 수 없음";
        const pInfo = getPokemonInfoForWord(word, count);
        const apiData = LOCAL_POKEMON_DB[pInfo.id] || { name: "알 수 없음", type: "normal" };
        return { word, count, meaning, pInfo, apiData };
    });
    
    let html = '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">';
    cardDataList.forEach(item => {
        const typeInfo = TYPE_COLORS[item.apiData.type] || TYPE_COLORS['normal'];
        let auraBg = 'bg-white/30';
        if (item.pInfo.auraLevel === 1) auraBg = 'bg-blue-400/50 shadow-[0_0_15px_rgba(96,165,250,0.8)]';
        if (item.pInfo.auraLevel === 2) auraBg = 'bg-red-400/50 shadow-[0_0_20px_rgba(248,113,113,0.8)] animate-pulse';
        
        const isPartner = window.state.gameData.partnerWord === item.word;
        const borderClass = isPartner ? 'border-yellow-400 ring-2 ring-yellow-400/50 scale-105' : 'border-white/40 hover:scale-105';
        const partnerBadge = isPartner ? '<div class="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-300 to-yellow-500 text-yellow-900 text-[10px] px-2 py-0.5 rounded-full font-black shadow-md z-10 border border-yellow-200">👑 파트너</div>' : '';

        html += `
        <div onclick="window.setPartner('${item.word}')" class="cursor-pointer relative flex flex-col items-center justify-center p-3 rounded-2xl ${typeInfo.bg} bg-opacity-80 border-2 ${borderClass} transition-all">
            ${partnerBadge}
            <div class="w-full flex justify-between items-center mb-1 px-1">
                <span class="text-[10px] text-white bg-black/20 px-1.5 py-0.5 rounded-md font-bold">LV ${item.pInfo.tier}</span>
                <span class="text-[10px] bg-white text-slate-700 px-1.5 py-0.5 rounded-md font-bold">★ ${item.count}</span>
            </div>
            <div class="h-24 w-24 flex items-center justify-center my-1 relative ${auraBg} rounded-full p-1 transition-all">
                <img src="${item.pInfo.imgSrc}" crossorigin="anonymous" class="max-w-full max-h-full object-contain" style="image-rendering: pixelated;" />
            </div>
<div class="w-full text-center bg-white rounded-xl py-2 mt-2 shadow-sm">
                <div class="font-black text-slate-800 text-base capitalize truncate px-1 flex justify-center items-center gap-1">
                    ${item.word}
                    <button onclick="window.speakWord('${item.word}', event)" class="hover:scale-125 transition-transform text-sm" title="발음 듣기">🔊</button>
                </div>
                <div class="text-slate-500 text-xs truncate px-1">${item.meaning}</div>
                <div class="mt-1 flex items-center justify-center gap-1">
                    <span class="text-[9px] text-white ${typeInfo.bg} rounded px-1 font-bold shadow-sm">${typeInfo.name}</span>
                    <span class="text-[9px] text-slate-600 font-bold">${item.apiData.name}</span>
                </div>
            </div>
        </div>`;
    });
    dexList.innerHTML = html + '</div>';
};

window.renderRanking = async () => {
    const listEl = document.getElementById('rank-list');
    listEl.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm animate-pulse col-span-full">랭킹 정보를 가져오는 중...</p>';
    try {
        const snap = await getDocs(getStudentsCollection());
        let students = [];
        snap.forEach(doc => {
            if (!['테스트', '테스트2'].includes(doc.id)) {
                const data = doc.data(); const stats = data.gameStats || {};
                const caughtWords = stats.caughtWords || {};
                let maxCh = 0; let bestWord = null; let bestCount = 0; let partnerStage = null;
                
                if (stats.partnerWord && caughtWords[stats.partnerWord]) {
                    bestWord = stats.partnerWord; bestCount = caughtWords[stats.partnerWord]; partnerStage = stats.partnerStage || null;
                } else {
                    for (let word in caughtWords) {
                        if (caughtWords[word] > bestCount) { bestCount = caughtWords[word]; bestWord = word; }
                    }
                }

                if (bestWord) {
                    const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === bestWord.toLowerCase());
                    if (quiz) maxCh = quiz.chapter || 1;
                }

                students.push({ id: doc.id, wins: stats.wins || 0, caught: Object.keys(caughtWords).length, level: stats.level || 1, bestWord, bestCount, maxCh, partnerStage });
            }
        });

        students.sort((a, b) => {
            const getPriority = (id) => {
                if (id === '마스터') return -2; if (id === '선생님') return -1;
                const num = parseInt(id.split('.')[0]); return isNaN(num) ? 999 : num;
            };
            return getPriority(a.id) - getPriority(b.id);
        });

        let html = '';
        students.forEach((student) => {
            const tier = getTierInfo(student.wins);
            const isMe = student.id === window.state.user;
            let pInfoHtml = '<span class="text-5xl opacity-20">🥚</span>';
            let chapterBadge = '';
            
            if (student.bestWord) {
                let pInfo;
                if (student.partnerStage) {
                    const fakeCount = student.partnerStage === 1 ? 1 : (student.partnerStage === 2 ? 5 : 10);
                    pInfo = getPokemonInfoForWord(student.bestWord, fakeCount);
                } else pInfo = getPokemonInfoForWord(student.bestWord, student.bestCount);
                
                pInfoHtml = `<img src="${pInfo.imgSrc}" class="max-w-full max-h-full object-contain drop-shadow-md" style="image-rendering:pixelated;">`;
                chapterBadge = `<div class="absolute -bottom-2 -right-3 text-[11px] sm:text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold shadow-sm border border-indigo-400 z-10">${student.maxCh}단원</div>`;
            }

            html += `
            <div onclick="window.showTrainerProfile('${student.id}')" class="cursor-pointer border-2 border-white/10 ${tier.bgClass} rounded-2xl p-4 flex flex-col relative overflow-visible shadow-lg hover:scale-105 transition-transform hover:shadow-indigo-500/20 group ${isMe ? 'ring-2 ring-red-400' : ''}">
                ${isMe ? '<div class="absolute -top-2 -left-2 bg-red-500 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-md z-10 border border-white/20">나</div>' : ''}
                <div class="flex justify-between items-start mb-3">
                    <div class="truncate pr-1 w-full">
                        <div class="text-base sm:text-lg font-black text-white drop-shadow-md truncate w-full">${student.id}</div>
                        <div class="text-xs sm:text-sm text-white/80 font-bold drop-shadow mt-0.5">Lv.${student.level}</div>
                    </div>
                    <div class="flex flex-col items-end shrink-0 pl-1">
                        <div class="text-xs font-black ${tier.color} bg-black/40 px-2 py-1 rounded-lg border border-white/10 whitespace-nowrap backdrop-blur-sm drop-shadow">${tier.icon} ${tier.name}</div>
                    </div>
                </div>
                <div class="h-24 w-24 sm:h-28 sm:w-28 mx-auto my-2 flex items-center justify-center relative bg-black/30 rounded-full border border-white/10 group-hover:bg-black/50 transition-colors shadow-inner">
                    ${pInfoHtml} ${chapterBadge}
                </div>
                <div class="mt-auto pt-4 flex justify-between border-t border-white/20">
                    <div class="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-lg border border-white/10">
                        <span class="text-xs sm:text-sm">📖</span> <span class="text-xs sm:text-sm font-bold text-white drop-shadow-sm">${student.caught}</span>
                    </div>
                    <div class="flex items-center gap-1 bg-black/30 px-2 py-1 rounded-lg border border-white/10">
                        <span class="text-xs sm:text-sm">⚔️</span> <span class="text-xs sm:text-sm font-bold text-white drop-shadow-sm">${student.wins}</span>
                    </div>
                </div>
            </div>`;
        });
        listEl.innerHTML = html || '<p class="text-center py-10 col-span-full">랭킹 정보가 없습니다.</p>';
    } catch (e) { listEl.innerHTML = '<p class="text-center text-red-500 py-10 col-span-full">네트워크 오류</p>'; }
};

// ==========================================
// 8. 아레나(배틀) 관련 로직 (스킬 게이지 및 체력 보정 추가)
// ==========================================
const checkDailyLimit = () => {
    const myId = window.state.user;
    if (['선생님', '마스터', '테스트', '테스트2'].includes(myId)) return false;
    
    const victories = window.state.gameData.victories || {};
    const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let studentWins = 0; let masterWin = false; let teacherWin = false;
    for (let opp in victories) { 
        if (victories[opp] >= startOfToday) {
            if (opp === '마스터') masterWin = true;
            else if (opp === '선생님') teacherWin = true;
            else if (opp !== '테스트' && opp !== '테스트2') studentWins++;
        }
    }
    return studentWins >= 3 && masterWin && teacherWin;
};

window.battleState = { active: false, oppId: null, oppStats: null, mySelection: [], myTeam: [], oppTeam: [], myIdx: 0, oppIdx: 0, oppTimer: null, myEnergy: 0, oppEnergy: 0, energyMax: 35 };

window.showOppMonDetail = (word, count) => {
    const pInfo = getPokemonInfoForWord(word, count);
    const apiData = LOCAL_POKEMON_DB[pInfo.id] || { name: "알 수 없음", type: "normal" };
    const typeInfo = TYPE_COLORS[apiData.type] || TYPE_COLORS['normal'];
    const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === word.toLowerCase());
    const meaning = quiz ? quiz.meaning : "알 수 없음";

    const msg = `✨ ${word} ✨\n\n📖 뜻: ${meaning}\n🔥 속성: ${typeInfo.name}\n👾 종류: ${apiData.name} (LV.${pInfo.tier})\n⭐ 잡은 횟수: ${count}회`;
    window.showCustomAlert(msg);
};

window.loadArena = async () => {
    const listEl = document.getElementById('arena-list');
    const myWords = Object.keys(window.state.gameData.caughtWords || {});
    if (myWords.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-400 py-10">포획한 몬스터가 없어 도전할 수 없습니다.<br>사냥터에서 단어를 잡아보세요!</p>'; return;
    }

    if (checkDailyLimit()) {
        listEl.innerHTML = `<div class="text-center py-10"><div class="text-5xl mb-4">💤</div><h3 class="text-xl font-bold text-indigo-400 mb-2">오박사님의 휴식 권고</h3><p class="text-sm text-slate-400">오늘의 배틀 에너지를 모두 소모했습니다! (학생 3승 + 관장 2승 달성)<br>풀숲에서 영단어를 더 포획하며 내일을 준비하세요!</p></div>`; return;
    }

    listEl.innerHTML = '<p class="text-center text-indigo-400 py-10 text-sm animate-pulse">상대를 찾고 있습니다...</p>';
    try {
        const snap = await getDocs(getStudentsCollection());
        let opponents = [];
        const myId = window.state.user;
        const isPrivileged = ['선생님', '마스터', '테스트', '테스트2'].includes(myId);
        
        const victories = window.state.gameData.victories || {};
        const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        let studentWinsToday = 0;
        for (let opp in victories) {
            if (victories[opp] >= startOfToday && !['마스터', '선생님', '테스트', '테스트2'].includes(opp)) studentWinsToday++;
        }

        snap.forEach(doc => {
            const oppId = doc.id;
            if (oppId === myId || oppId === '테스트2') return; 
            if (oppId === '테스트' && !isPrivileged) return;
            opponents.push({ id: oppId, data: doc.data() });
        });

        opponents.sort((a, b) => {
            const getPriority = (id) => {
                if (id === '마스터') return -2; if (id === '선생님') return -1;
                const num = parseInt(id.split('.')[0]); return isNaN(num) ? 999 : num;
            };
            return getPriority(a.id) - getPriority(b.id);
        });

        let html = '';
        opponents.forEach(opp => {
            const oppId = opp.id; const docData = opp.data;
            const isBoss = (oppId === '선생님' || oppId === '마스터');
            let canBattle = true; let cooldownMsg = "";

            if (!isPrivileged) {
                const lastWinTime = victories[oppId] || 0;
                if (isBoss) {
                    if (lastWinTime >= startOfToday) { canBattle = false; cooldownMsg = `내일 재도전 가능`; }
                } else {
                    const cooldownMs = 3 * 24 * 60 * 60 * 1000; const elapsed = Date.now() - lastWinTime;
                    if (lastWinTime > 0 && elapsed < cooldownMs) {
                        canBattle = false; cooldownMsg = `재도전까지 ${Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000))}일`;
                    } else if (studentWinsToday >= 3) {
                        canBattle = false; cooldownMsg = `오늘 학생 배틀 완료`;
                    }
                }
            }

            const oppStats = docData.gameStats || {};
            const oppCaughtWords = oppStats.caughtWords || {};
            let oppDefenseWords = oppStats.defenseTeam || [];
            oppDefenseWords = oppDefenseWords.filter(w => oppCaughtWords[w] >= 10);
            if (oppDefenseWords.length === 0) oppDefenseWords = Object.keys(oppCaughtWords).sort((a,b)=>oppCaughtWords[b]-oppCaughtWords[a]).slice(0,3);

            let top3Html = '<div class="flex gap-2 ml-2 sm:ml-4 items-center">';
            if (oppDefenseWords.length > 0) {
                oppDefenseWords.forEach(word => {
                    const count = oppCaughtWords[word];
                    const pInfo = getPokemonInfoForWord(word, count);
                    top3Html += `<div onclick="window.showOppMonDetail('${word}', ${count})" class="cursor-pointer w-12 h-12 sm:w-14 sm:h-14 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center border border-white/20 p-1.5 transition-transform hover:scale-110 shadow-inner" title="${word} 상세정보"><img src="${pInfo.imgSrc}" crossorigin="anonymous" class="max-w-full max-h-full object-contain drop-shadow-md scale-100" style="image-rendering:pixelated;"></div>`;
                });
            } else top3Html += `<span class="text-xs text-slate-400 pl-2">포획 없음</span>`;
            top3Html += '</div>';

            let btnHtml = canBattle 
                ? `<button onclick="window.prepareBattle('${oppId}')" class="bg-red-500 hover:bg-red-600 text-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base shadow-md transition-transform active:scale-95 shrink-0">배틀 신청</button>`
                : `<button disabled class="bg-slate-200 text-slate-400 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm shadow-inner cursor-not-allowed text-center leading-tight shrink-0">🏆 완료<br><span class="text-[10px]">${cooldownMsg}</span></button>`;

            html += `<div class="flex justify-between items-center ${isBoss?'bg-yellow-900/40 border-yellow-500/50':'bg-[#1f2937] border-slate-600'} p-4 sm:p-5 rounded-2xl shadow-lg border mb-4 hover:border-red-400 transition-colors overflow-hidden">
                <div class="flex items-center gap-3 sm:gap-4 overflow-hidden">
                    <div class="text-3xl sm:text-4xl shrink-0 drop-shadow-md">${isBoss?'👑':'👦'}</div>
                    <div class="flex flex-col sm:flex-row sm:items-center shrink-0 min-w-0">
                        <div class="min-w-[70px] truncate"><div class="font-bold text-white truncate text-base sm:text-lg">${oppId}</div><div class="text-xs sm:text-sm ${isBoss?'text-yellow-400':'text-slate-400'} font-bold mt-0.5">${isBoss?'체육관 관장':'트레이너'}</div></div>
                        ${top3Html}
                    </div>
                </div>
                ${btnHtml}
            </div>`;
        });
        listEl.innerHTML = html || '<p class="text-center py-10">현재 도전 가능한 상대가 없습니다.</p>';
    } catch(e) { listEl.innerHTML = '<p class="text-center text-red-500 py-10">네트워크 오류</p>'; }
};

window.openDefenseSetup = () => {
    document.getElementById('arena-list-view').style.display = 'none';
    document.getElementById('arena-defense-view').style.display = 'block';
    if(!window.state.gameData.defenseTeam) window.state.gameData.defenseTeam = [];
    window.defenseSelectionTemp = [...window.state.gameData.defenseTeam];
    renderDefenseSelection();
};

window.cancelDefenseSelect = () => {
    document.getElementById('arena-list-view').style.display = 'block';
    document.getElementById('arena-defense-view').style.display = 'none';
    window.loadArena();
};

const renderDefenseSelection = () => {
    const listEl = document.getElementById('arena-defense-list');
    const caughtWords = window.state.gameData.caughtWords || {};
    const eligibleWords = Object.keys(caughtWords).filter(w => caughtWords[w] >= 10).sort((a,b) => caughtWords[b] - caughtWords[a]);
    
    if (eligibleWords.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-400 py-10 col-span-3 text-sm">10회 이상 포획한 포켓몬이 없습니다.<br>단어를 더 사냥하세요!</p>';
        document.getElementById('btn-save-defense').disabled = true;
        document.getElementById('btn-save-defense').className = "w-full bg-slate-300 text-slate-500 py-3 rounded-2xl font-bold text-lg shadow-sm transition-all";
        document.getElementById('defense-sel-cnt').innerText = "0"; return;
    }

    let html = '';
    eligibleWords.forEach(word => {
        const count = caughtWords[word];
        const pInfo = getPokemonInfoForWord(word, count);
        const apiData = LOCAL_POKEMON_DB[pInfo.id] || { name: "알 수 없음", type: "normal" };
        const typeInfo = TYPE_COLORS[apiData.type] || TYPE_COLORS['normal'];
        const isSelected = window.defenseSelectionTemp.includes(word);
        
        let clickEvent = `onclick="window.toggleDefenseSelection('${word}')"`;
        let wrapperClass = isSelected ? 'border-green-500 bg-green-50 scale-105' : 'border-transparent bg-slate-50 hover:bg-slate-100 cursor-pointer';
        
        html += `
        <div ${clickEvent} class="relative border-4 rounded-2xl p-2 flex flex-col items-center justify-center transition-all ${wrapperClass}">
            <div class="h-16 flex items-center justify-center"><img src="${pInfo.imgSrc}" class="max-h-full drop-shadow-sm" style="image-rendering:pixelated;"></div>
            <div class="text-[10px] font-black text-slate-700 truncate w-full text-center mt-1">${word}</div>
            <div class="flex items-center gap-1 mt-1"><span class="text-[8px] text-white ${typeInfo.bg} px-1 rounded">${typeInfo.name}</span><span class="text-[9px] font-bold text-slate-500">★${count}</span></div>
        </div>`;
    });
    listEl.innerHTML = html;
    document.getElementById('defense-sel-cnt').innerText = window.defenseSelectionTemp.length;
    
    const btn = document.getElementById('btn-save-defense');
    if (window.defenseSelectionTemp.length > 0) {
        btn.disabled = false; btn.className = "w-full bg-green-500 text-white py-3 rounded-2xl font-bold text-lg shadow-md active:scale-95 transition-all hover:bg-green-600";
    } else {
        btn.disabled = true; btn.className = "w-full bg-slate-300 text-slate-500 py-3 rounded-2xl font-bold text-lg shadow-sm transition-all";
    }
};

window.toggleDefenseSelection = (word) => {
    const idx = window.defenseSelectionTemp.indexOf(word);
    if (idx > -1) window.defenseSelectionTemp.splice(idx, 1);
    else {
        if (window.defenseSelectionTemp.length >= 3) return window.showCustomAlert("최대 3마리까지만 방어 포켓몬으로 선택 가능합니다!");
        window.defenseSelectionTemp.push(word);
    }
    renderDefenseSelection();
};

window.saveDefenseTeam = () => {
    window.state.gameData.defenseTeam = [...window.defenseSelectionTemp];
    window.saveProgress(); window.showCustomAlert("방어 팀이 성공적으로 설정되었습니다!"); window.cancelDefenseSelect();
};

window.prepareBattle = async (oppId) => {
    const myId = window.state.user;
    const isPrivileged = ['선생님', '마스터', '테스트', '테스트2'].includes(myId);
    if (!isPrivileged && checkDailyLimit()) return window.showCustomAlert("오늘의 배틀 에너지를 모두 소모했습니다!\n내일 다시 도전하세요.");

    const docSnap = await getDoc(getStudentDoc(oppId));
    if (!docSnap.exists()) return window.showCustomAlert("상대 정보를 불러올 수 없습니다.");
    
    const oppStats = docSnap.data().gameStats || {};
    const oppWords = Object.keys(oppStats.caughtWords || {});
    if(oppWords.length === 0) return window.showCustomAlert("상대방이 아직 포켓몬을 잡지 않았습니다!");

    window.battleState.oppId = oppId; window.battleState.oppStats = oppStats; window.battleState.mySelection = [];
    document.getElementById('arena-list-view').style.display = 'none'; document.getElementById('arena-team-view').style.display = 'block';
    document.getElementById('arena-team-title').innerText = `VS ${oppId}`;
    renderTeamSelection();
};

window.cancelBattleSelect = () => {
    if(window.battleState.oppTimer) clearInterval(window.battleState.oppTimer);
    clearTimeout(window.battleState.quizTimeout);
    window.battleState.active = false;
    document.getElementById('battle-quiz-modal').style.display = 'none';
    document.getElementById('arena-list-view').style.display = 'block'; document.getElementById('arena-team-view').style.display = 'none';
    document.getElementById('arena-battle-view').style.display = 'none'; document.getElementById('arena-battle-view').classList.remove('flex');
    window.loadArena(); window.AudioManager.playBGM('town');
};

const renderTeamSelection = () => {
    const listEl = document.getElementById('arena-team-list');
    const caughtWords = window.state.gameData.caughtWords || {};
    const sortedWords = Object.keys(caughtWords).sort((a,b)=>caughtWords[b]-caughtWords[a]);
    
    let html = '';
    const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const usedCooldown = window.state.gameData.usedPokemonCooldown || {};

    sortedWords.forEach(word => {
        const count = caughtWords[word];
        const pInfo = getPokemonInfoForWord(word, count);
        const apiData = LOCAL_POKEMON_DB[pInfo.id] || { name: "알 수 없음", type: "normal" };
        const typeInfo = TYPE_COLORS[apiData.type] || TYPE_COLORS['normal'];
        const isSelected = window.battleState.mySelection.includes(word);
        
        const lastUsed = usedCooldown[word] || 0; const isFatigued = lastUsed >= startOfToday;
        
        let clickEvent = `onclick="window.toggleTeamSelection('${word}')"`;
        let wrapperClass = isSelected ? 'border-red-500 bg-red-50 scale-105' : 'border-transparent bg-slate-50 hover:bg-slate-100 cursor-pointer';
        let imgClass = 'max-h-full drop-shadow-sm'; let badgeHtml = '';

        if (isFatigued) {
            clickEvent = ''; wrapperClass = 'border-slate-300 bg-slate-200 opacity-60 cursor-not-allowed';
            imgClass += ' grayscale'; badgeHtml = `<div class="absolute -top-2 -right-2 bg-slate-600 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow-md z-10 border border-slate-400">💤 오늘 휴식</div>`;
        }
        
        html += `
        <div ${clickEvent} class="relative border-4 rounded-2xl p-2 flex flex-col items-center justify-center transition-all ${wrapperClass}">
            ${badgeHtml}
            <div class="h-16 flex items-center justify-center"><img src="${pInfo.imgSrc}" class="${imgClass}" style="image-rendering:pixelated;"></div>
            <div class="text-[10px] font-black text-slate-700 truncate w-full text-center mt-1">${word}</div>
            <div class="flex items-center gap-1 mt-1"><span class="text-[8px] text-white ${typeInfo.bg} px-1 rounded">${typeInfo.name}</span><span class="text-[9px] font-bold text-slate-500">★${count}</span></div>
        </div>`;
    });
    listEl.innerHTML = html;
    document.getElementById('team-sel-cnt').innerText = window.battleState.mySelection.length;
    
    const btn = document.getElementById('btn-start-real-battle');
    if (window.battleState.mySelection.length > 0) {
        btn.disabled = false; btn.className = "w-full bg-red-500 text-white py-3 rounded-2xl font-bold text-lg shadow-md active:scale-95 transition-all hover:bg-red-600";
    } else {
        btn.disabled = true; btn.className = "w-full bg-slate-300 text-slate-500 py-3 rounded-2xl font-bold text-lg shadow-sm transition-all";
    }
};

window.toggleTeamSelection = (word) => {
    const idx = window.battleState.mySelection.indexOf(word);
    if (idx > -1) window.battleState.mySelection.splice(idx, 1);
    else {
        if (window.battleState.mySelection.length >= 3) return window.showCustomAlert("최대 3마리까지만 선택 가능합니다!");
        window.battleState.mySelection.push(word);
    }
    renderTeamSelection();
};

const createBattleMon = (word, count, trainerLevel = 1) => {
    const pInfo = getPokemonInfoForWord(word, count);
    const apiData = LOCAL_POKEMON_DB[pInfo.id] || { name: "알 수 없음", type: "normal" };
    const effectiveCount = Math.min(count, 15);
    const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === word.toLowerCase());
    const chapter = quiz ? (quiz.chapter || 1) : 1; const chapterBonus = 1 + (chapter * 0.1);

    let maxHp = Math.floor((100 + (effectiveCount * 20)) * chapterBonus);
    let atk = Math.floor((10 + (effectiveCount * 3)) * chapterBonus);
    maxHp += (trainerLevel * 5); atk += (trainerLevel * 1);

    return { word, name: apiData.name, type: apiData.type, imgSrc: pInfo.imgSrc, hp: maxHp, maxHp, atk };
};

window.startRealBattle = () => {
    document.getElementById('arena-team-view').style.display = 'none';
    const battleView = document.getElementById('arena-battle-view');
    battleView.style.display = 'flex'; battleView.classList.add('flex');

    const myCaught = window.state.gameData.caughtWords || {}; const myLevel = window.state.gameData.level || 1;
    window.battleState.myTeam = window.battleState.mySelection.map(w => {
        let mon = createBattleMon(w, myCaught[w], myLevel);
        // 💡 아레나 전용 체력 5배 뻥튀기! (순식간에 안 죽게 만듭니다)
        mon.hp *= 5; mon.maxHp *= 5; 
        return mon;
    });
    
    // [방법 B] 방어자 레벨 상한선 설정 (내 레벨 + 5)
    const oppCaught = window.battleState.oppStats.caughtWords || {}; 
    const oppLevel = Math.min((window.battleState.oppStats.level || 1), myLevel + 5);
    let oppDefenseWords = window.battleState.oppStats.defenseTeam || [];
    oppDefenseWords = oppDefenseWords.filter(w => oppCaught[w] >= 10);
    if (oppDefenseWords.length === 0) oppDefenseWords = Object.keys(oppCaught).sort((a,b)=>oppCaught[b]-oppCaught[a]).slice(0,3);
    
    window.battleState.oppTeam = oppDefenseWords.map(w => {
        let mon = createBattleMon(w, oppCaught[w], oppLevel);
        // 💡 방어팀은 조금 더 단단하게 보정 (6배 뻥튀기)
        mon.hp = Math.floor(mon.hp * 6); mon.maxHp = Math.floor(mon.maxHp * 6); mon.atk = Math.floor(mon.atk * 1.2);
        return mon;
    });

    window.battleState.myIdx = 0; window.battleState.oppIdx = 0; 
    window.battleState.myEnergy = 0; window.battleState.oppEnergy = 0; window.battleState.energyMax = 35; // 35대 때리면 게이지 꽉 참
    window.battleState.active = true;
    updateBattleUI(); logBattleMsg(`배틀 시작! 가랏, ${window.battleState.myTeam[0].word}!`);
    if(window.battleState.oppTimer) clearInterval(window.battleState.oppTimer);
    window.battleState.oppTimer = setInterval(() => { if(window.battleState.active) opponentAttack(); }, 200);
};

const updateBattleUI = () => {
    if(!window.battleState.active) return;
    const myMon = window.battleState.myTeam[window.battleState.myIdx]; const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];

    document.getElementById('my-b-img').src = myMon.imgSrc; document.getElementById('my-b-name').innerText = myMon.word;
    document.getElementById('my-b-hp').style.width = `${Math.max(0, (myMon.hp / myMon.maxHp) * 100)}%`;
    const myTypeInfo = TYPE_COLORS[myMon.type] || TYPE_COLORS['normal'];
    document.getElementById('my-b-type').innerText = myTypeInfo.name; document.getElementById('my-b-type').style.backgroundColor = myTypeInfo.color;
    document.getElementById('my-b-remain').innerText = window.battleState.myTeam.length - window.battleState.myIdx;

    document.getElementById('opp-b-img').src = oppMon.imgSrc; document.getElementById('opp-b-name').innerText = oppMon.word;
    document.getElementById('opp-b-hp').style.width = `${Math.max(0, (oppMon.hp / oppMon.maxHp) * 100)}%`;
    const oppTypeInfo = TYPE_COLORS[oppMon.type] || TYPE_COLORS['normal'];
    document.getElementById('opp-b-type').innerText = oppTypeInfo.name; document.getElementById('opp-b-type').style.backgroundColor = oppTypeInfo.color;

    // 💡 게이지 바 UI 업데이트
    document.getElementById('my-b-energy').style.width = `${(window.battleState.myEnergy / window.battleState.energyMax) * 100}%`;
    document.getElementById('opp-b-energy').style.width = `${(window.battleState.oppEnergy / window.battleState.energyMax) * 100}%`;

    const ultBtn = document.getElementById('btn-ultimate');
    if (window.battleState.myEnergy >= window.battleState.energyMax) ultBtn.classList.add('ultimate-ready');
    else ultBtn.classList.remove('ultimate-ready');
};

const logBattleMsg = (msg, isStrong = false) => {
    const logEl = document.getElementById('battle-log');
    logEl.innerText = msg; logEl.className = `text-center font-bold text-sm h-6 ${isStrong ? 'text-red-500 scale-110 transition-transform' : 'text-slate-600'}`;
    setTimeout(() => { logEl.classList.remove('scale-110'); }, 300);
};

const showDmgText = (dmg, isOpponent, isCrit = false) => {
    const text = document.createElement('div');
    text.innerText = isCrit ? `💥-${dmg}` : `-${dmg}`;
    let colorClass = isOpponent ? 'text-red-500' : 'text-slate-700';
    if (isCrit) colorClass = 'text-yellow-400 text-3xl drop-shadow-[0_0_10px_rgba(250,204,21,1)] z-[100] font-black';
    text.className = `dmg-text ${isCrit ? '' : 'text-xl'} ${colorClass}`;
    text.style.top = isOpponent ? '20%' : '70%'; text.style.left = isOpponent ? '70%' : '20%';
    document.getElementById('arena-battle-view').appendChild(text);
    setTimeout(() => text.remove(), 1000);
};

window.tapAttack = () => {
    if(!window.battleState.active) return;
    const myMon = window.battleState.myTeam[window.battleState.myIdx]; const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];
    
    const multiplier = getMatchup(myMon.type, oppMon.type);
    let dmg = Math.floor((myMon.atk * multiplier) * (0.8 + Math.random()*0.4));
    const trainerLevel = window.state.gameData.level || 1; const critChance = 0.05 + (trainerLevel * 0.01);
    const isCrit = Math.random() < critChance;
    
    if (isCrit) dmg = Math.floor(dmg * 1.5);
    oppMon.hp -= dmg; showDmgText(dmg, true, isCrit);

    // 💡 게이지 채우기
    window.battleState.myEnergy = Math.min(window.battleState.energyMax, window.battleState.myEnergy + 1);

    const oppImg = document.getElementById('opp-b-img');
    oppImg.classList.remove('animate-hit'); void oppImg.offsetWidth; oppImg.classList.add('animate-hit');

    if(isCrit) logBattleMsg("크리티컬 히트!!", true);
    else if(multiplier > 1) logBattleMsg("효과가 굉장했다!", true);
    else if(multiplier < 1) logBattleMsg("효과가 별로인 것 같다...", false);
    
    updateBattleUI(); checkFaint();
};

const opponentAttack = () => {
    if(!window.battleState.active) return;
    const myMon = window.battleState.myTeam[window.battleState.myIdx]; const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];
    
    const multiplier = getMatchup(oppMon.type, myMon.type);
    let dmg = Math.floor((oppMon.atk * multiplier) * (0.8 + Math.random()*0.4));
    const oppLevel = window.battleState.oppStats.level || 1; const critChance = 0.05 + (oppLevel * 0.01);
    const isCrit = Math.random() < critChance;
    
    if (isCrit) dmg = Math.floor(dmg * 1.5);
    myMon.hp -= dmg; showDmgText(dmg, false, isCrit);

    // 💡 상대 게이지 채우기 (목표치를 energyMax + 10 으로 늘림!)
    window.battleState.oppEnergy = Math.min(window.battleState.energyMax + 10, window.battleState.oppEnergy + 1);

    const myImg = document.getElementById('my-b-img');
    myImg.classList.remove('animate-hit'); void myImg.offsetWidth; myImg.classList.add('animate-hit');

    if(isCrit) logBattleMsg("상대방의 크리티컬 히트!!", true);
    
    // 💡 10번을 더 때려야(energyMax + 10) 필살기 발동!
    if (window.battleState.oppEnergy >= window.battleState.energyMax + 10) {
        triggerOpponentUltimate();
    } else {
        updateBattleUI(); checkFaint();
    }
};

const checkFaint = () => {
    const myMon = window.battleState.myTeam[window.battleState.myIdx]; const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];
    if(oppMon.hp <= 0) {
        window.battleState.oppIdx++;
        if(window.battleState.oppIdx >= window.battleState.oppTeam.length) { endBattle(true); return true; } 
        else { logBattleMsg(`상대의 ${window.battleState.oppTeam[window.battleState.oppIdx].word}(이)가 나왔다!`); updateBattleUI(); }
    } else if (myMon.hp <= 0) {
        window.battleState.myIdx++;
        if(window.battleState.myIdx >= window.battleState.myTeam.length) { endBattle(false); return true; } 
        else { logBattleMsg(`가랏, ${window.battleState.myTeam[window.battleState.myIdx].word}!`); updateBattleUI(); }
    }
    return false;
};

// ==========================================
// 💡 [신규] 스페셜 어택 및 실드(방어) 로직
// ==========================================
window.useUltimate = () => {
    if (window.battleState.myEnergy < window.battleState.energyMax || !window.battleState.active) return;
    
    window.battleState.active = false; // 배틀 일시정지!
    clearInterval(window.battleState.oppTimer);
    window.battleState.myEnergy = 0; 
    updateBattleUI();

    const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];
    const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === oppMon.word.toLowerCase());
    const meaning = quiz ? quiz.meaning : "알 수 없음";

    document.getElementById('b-quiz-title').innerText = "⚡ 스페셜 어택!";
    document.getElementById('b-quiz-desc').innerText = "제한 시간 10초! 정확한 영단어를 입력하세요!";
    document.getElementById('b-quiz-word').innerText = meaning;
    document.getElementById('b-spell-in').value = '';
    document.getElementById('b-fake-text').textContent = '스펠링 입력';
    document.getElementById('b-fake-text').style.color = '#9ca3af';

    document.getElementById('battle-quiz-modal').style.display = 'flex';
    document.getElementById('b-spell-in').focus();
    
    window.battleState.expectedWord = oppMon.word;
    window.battleState.isShieldMode = false;
    startQuizTimer(10000); // 10초 타이머
};

const triggerOpponentUltimate = () => {
    window.battleState.active = false; // 배틀 일시정지!
    clearInterval(window.battleState.oppTimer);
    window.battleState.oppEnergy = 0;
    updateBattleUI();

    const myMon = window.battleState.myTeam[window.battleState.myIdx];
    const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === myMon.word.toLowerCase());
    const meaning = quiz ? quiz.meaning : "알 수 없음";

    document.getElementById('b-quiz-title').innerText = "🛡️ 방어 태세 (실드)!";
    document.getElementById('b-quiz-desc').innerText = "적의 필살기가 날아옵니다! 10초 안에 내 파트너의 단어를 입력해 막아내세요!";
    document.getElementById('b-quiz-word').innerText = meaning;
    document.getElementById('b-spell-in').value = '';
    document.getElementById('b-fake-text').textContent = '스펠링 입력';
    document.getElementById('b-fake-text').style.color = '#9ca3af';

    document.getElementById('battle-quiz-modal').style.display = 'flex';
    document.getElementById('b-spell-in').focus();
    
    window.battleState.expectedWord = myMon.word;
    window.battleState.isShieldMode = true;
    startQuizTimer(10000); // 10초 타이머
};

const startQuizTimer = (duration) => {
    const bar = document.getElementById('b-timer-bar');
    bar.style.transition = 'none'; bar.style.width = '100%';
    void bar.offsetWidth; // 강제 새로고침
    bar.style.transition = `width ${duration}ms linear`;
    bar.style.width = '0%';

    window.battleState.quizTimeout = setTimeout(() => {
        window.submitBattleQuiz(true); // 시간 초과
    }, duration);
};

window.submitBattleQuiz = (isTimeout = false) => {
    clearTimeout(window.battleState.quizTimeout);
    document.getElementById('battle-quiz-modal').style.display = 'none';
    
    const inputVal = document.getElementById('b-spell-in').value.trim().toLowerCase();
    const correctWord = window.battleState.expectedWord.toLowerCase();
    const success = (!isTimeout && inputVal === correctWord);

    const myMon = window.battleState.myTeam[window.battleState.myIdx];
    const oppMon = window.battleState.oppTeam[window.battleState.oppIdx];

    if (window.battleState.isShieldMode) {
        if (success) { logBattleMsg("🛡️ 완벽한 방어! 데미지를 입지 않았다!", true); } 
        else {
            let dmg = Math.floor(oppMon.atk * 7); // 방어 실패 시 7배 데미지
            myMon.hp -= dmg; showDmgText(dmg, false, true);
            logBattleMsg("💥 방어 실패! 엄청난 데미지를 입었다!", true);
        }
    } else {
        if (success) {
            let dmg = Math.floor(myMon.atk * 7); // 공격 성공 시 7배 데미지
            oppMon.hp -= dmg; showDmgText(dmg, true, true);
            logBattleMsg("⚡ 스페셜 어택 명중! 효과가 굉장했다!", true);
        } else { logBattleMsg("💦 스펠링을 틀려 스페셜 어택이 빗나갔다...", false); }
    }

    updateBattleUI();
    const isGameOver = checkFaint();
    
    if(!isGameOver) {
        // 배틀 다시 재생!
        window.battleState.active = true;
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
        
        const isPrivileged = ['선생님', '마스터', '테스트', '테스트2'].includes(window.state.user);
        let extraMsg = "";
        if (!isPrivileged) {
            if (window.battleState.oppId === '선생님' || window.battleState.oppId === '마스터') extraMsg = "\n(관장 배틀은 내일 다시 도전할 수 있습니다.)";
            else extraMsg = "\n(해당 학생과는 3일 후 재대결 가능합니다.)";
        }

        msg = `🎉 배틀 승리!\n멋진 컨트롤이었습니다!\n출전한 파트너들은 오늘 하루 휴식합니다.\n총 🏆${window.state.gameData.wins}승 달성!${extraMsg}`;
        window.saveProgress(); window.updateUI();
    } else { msg = `💥 배틀 패배...\n상대방의 포켓몬이 더 강합니다.\n단어를 더 잡아 레벨을 올리세요!`; }
    
    recordDefenseLog(window.battleState.oppId, isWin);
    window.showCustomAlert(msg);
    setTimeout(() => { window.cancelBattleSelect(); }, 500);
};

window.openDefenseLogs = () => {
    document.getElementById('defense-log-modal').style.display = 'flex';
    const listEl = document.getElementById('defense-log-list');
    const logs = window.state.gameData.defenseLogs || [];
    
    if (logs.length === 0) {
        listEl.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm">아직 체육관 방어 기록이 없습니다.</p>'; return;
    }

    let html = '';
    const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    logs.forEach(log => {
        const date = new Date(log.timestamp); const isToday = log.timestamp >= startOfToday; const pad = (n) => n.toString().padStart(2, '0');
        const timeStr = isToday ? `오늘 ${pad(date.getHours())}:${pad(date.getMinutes())}` : `${date.getMonth()+1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        
        if (log.result === 'win') {
            html += `
            <div class="bg-green-900/30 border border-green-500/30 rounded-xl p-3 sm:p-4 shadow-sm">
                <div class="text-[10px] text-green-400 font-bold mb-1">${timeStr}</div>
                <div class="text-sm sm:text-base font-bold text-green-300">🛡️ ${log.attacker}의 도전을 완벽하게 방어했습니다!</div>
            </div>`;
        } else {
            let rewardHtml = !log.claimed ? `<button onclick="window.claimDefenseReward(${log.timestamp})" class="mt-2 w-full bg-pink-600 hover:bg-pink-700 text-white text-xs py-2 rounded-lg font-bold shadow-md transition-transform active:scale-95">🎁 위로 경험치(+20) 받기</button>` : `<div class="mt-2 text-[10px] text-slate-500 font-bold text-right">✅ 위로 보상 획득 완료</div>`;

            html += `
            <div class="bg-red-900/30 border border-red-500/30 rounded-xl p-3 sm:p-4 shadow-sm">
                <div class="text-[10px] text-red-400 font-bold mb-1">${timeStr}</div>
                <div class="text-sm sm:text-base font-bold text-red-300">💔 ${log.attacker}에게 체육관이 돌파당했습니다...</div>
                <div class="text-xs text-slate-300 mt-1">하지만 파트너 포켓몬이 끝까지 맞서 싸운 덕분에 위로 경험치를 얻었습니다!</div>
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
        document.getElementById('modal-desc').innerText = `레벨 ${window.state.gameData.level} 트레이너가 되었습니다!`;
    }
    window.updateUI(); window.saveProgress(); window.openDefenseLogs();
};

// ==========================================
// 9. 캔버스 (게임 화면 그리기)
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
    let bgColor = "#052e16"; let emoji = "🌲"; let groundColor = "#065f46";
    if (ch >= 4 && ch <= 6) { bgColor = "#082f49"; emoji = "🌊"; groundColor = "#075985"; }
    else if (ch >= 7 && ch <= 9) { bgColor = "#431407"; emoji = "🌋"; groundColor = "#7c2d12"; }
    else if (ch >= 10 && ch <= 12) { bgColor = "#2e1065"; emoji = "🏙️"; groundColor = "#4c1d95"; }

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
    ctx.fillStyle="#9ca3af"; ctx.font="bold 18px 'Jua'"; ctx.textAlign="center"; ctx.fillText(window.state.currentQuiz?.meaning || "???", 0, -65-(window.state.monster.tier*20));
    const cc = window.state.gameData.caughtWords?.[window.state.monster.name] || 0;
    ctx.fillStyle="#ef4444"; ctx.font="bold 15px 'Jua'"; ctx.fillText(`★ 잡은 횟수: ${cc}회`, 0, 35+(window.state.monster.tier*20)); ctx.restore();
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
    const sorted = [...window.state.quizzes].sort((a,b)=>((a.createdAt||0)-(b.createdAt||0))||a.word.localeCompare(b.word));
    let idx = sorted.findIndex(q=>q.word.toLowerCase()===word.toLowerCase());
    if (idx === -1) {
        let hash = 0; for (let i = 0; i < word.length; i++) hash = word.charCodeAt(i) + ((hash << 5) - hash);
        idx = Math.abs(hash);
    }

    // 1. 진화 단계 설정 (5회 2단계, 10회 3단계)
    const tier = count >= 10 ? 3 : (count >= 5 ? 2 : 1);

    // 2. ⭐ 준비한 오리지널 몬스터 세트(진화 라인) 개수
    // (현재 파란 몬스터, 불꽃 용 등 2세트 = 총 6장만 있다면 이 숫자를 2로 설정)
    // 나중에 20세트(60장)를 만드시면 이 숫자를 20으로 꼭 바꿔주세요!
    const TOTAL_SETS = 1; 

    // 3. 단어 스펠링을 바탕으로 몬스터 종류 무작위 고정 배정
    const lineIndex = idx % TOTAL_SETS;

    // 4. 실제 불러올 이미지 번호 자동 계산
    // 예: 0번 세트의 1단계는 mon_1, 1번 세트의 3단계는 mon_6
    const imageNumber = (lineIndex * 3) + tier;

    return {
        id: imageNumber,
        tier: tier,
        auraLevel: Math.max(0, tier - 3),
        imgSrc: `./media/mon_${imageNumber}.png` // ⭐ USB 제출용 로컬 폴더로 경로 변경 완벽 적용
    };
}

// ⭐ 오리지널 몬스터 이름 및 속성 설정
// 형식 -> 이미지번호:이름:속성 (속성은 fire, water, grass, electric, dark, fairy 등)
// 아래는 2세트(6번 이미지)까지의 예시입니다. 이미지를 추가할 때마다 이어서 적어주세요.
const DB_STR = "1:물방울쥐:water|2:물보라쥐:water|3:해일마우스:water|4:불꽃용:fire|5:화염드래곤:fire|6:볼케이노드래곤:fire";

const LOCAL_POKEMON_DB = (() => {
    const db = {};
    DB_STR.split('|').forEach(item => {
        const parts = item.split(':');
        if (parts.length === 3) db[parts[0]] = { name: parts[1], type: parts[2] };
    });
    return db;
})();