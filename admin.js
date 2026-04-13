import { db, getStudentsCollection, getStudentDoc, getWordListCollection, getWordDoc, STUDENT_LIST } from './firebase.js';
import { getDoc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// 1. 관리자 뷰 화면 토글 기능
// ==========================================
window.showAdminMainMenu = () => {
    document.getElementById('admin-main-menu').style.display = 'grid';
    ['admin-sec-dex', 'admin-sec-student', 'admin-sec-server', 'admin-sec-test'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

window.showAdminSection = (secId) => {
    document.getElementById('admin-main-menu').style.display = 'none';
    ['admin-sec-dex', 'admin-sec-student', 'admin-sec-server', 'admin-sec-test'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(secId);
    if (target) target.style.display = 'block';
    
    if (secId === 'admin-sec-test') {
        window.renderTestStudentCheckboxes();
        window.renderTestScores();
        window.renderPrisonList();
    }
};

window.toggleAdmin = () => {
    const adminView = document.getElementById('admin-view');
    const gameView = document.getElementById('game-view');
    if (adminView.style.display === 'block') { 
        adminView.style.display = 'none'; 
        gameView.style.display = 'block'; 
    } else { 
        adminView.style.display = 'block'; 
        gameView.style.display = 'none'; 
        window.showAdminMainMenu(); 
    }
};

// ==========================================
// 2. 단어 시험 및 함정(오답노트) 관리 기능
// ==========================================
window.renderTestStudentCheckboxes = () => {
    const container = document.getElementById('test-student-checkboxes');
    if (!container) return;
    let html = '';
    STUDENT_LIST.forEach(name => {
        if (!['마스터', '선생님'].includes(name)) {
            html += `
            <label class="flex items-center gap-1.5 p-1.5 bg-slate-700 border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-600">
                <input type="checkbox" value="${name}" class="test-student-cb w-4 h-4 text-emerald-500 bg-slate-800 border-slate-500 rounded focus:ring-emerald-500 cursor-pointer" checked>
                <span class="text-xs font-bold text-emerald-100 truncate">${name}</span>
            </label>
            `;
        }
    });
    container.innerHTML = html;
};

window.toggleTestStudents = (state) => {
    document.querySelectorAll('.test-student-cb').forEach(cb => cb.checked = state);
};

window.renderTestPaper = (chapter) => {
    document.getElementById('test-mode-desc').innerHTML = `<span class="text-indigo-600">${chapter}단원</span> 단어 시험이 시작되었습니다.<br>빈칸에 알맞은 영어 스펠링을 입력하세요.`;
    const listEl = document.getElementById('test-paper-list');
    const targetQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) == chapter);
    const shuffled = targetQuizzes.sort(() => 0.5 - Math.random());
    
    let html = '';
    shuffled.forEach((q, idx) => {
        html += `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200 gap-3">
            <div class="font-bold text-slate-700 text-lg flex-1"><span class="text-red-500 mr-2">${idx + 1}.</span>${q.meaning}</div>
            <div class="relative flex-1">
                <input type="password" class="test-answer-input w-full p-3 border-2 border-slate-600 rounded-xl outline-none font-bold text-lg focus:border-red-400 bg-slate-800 relative z-0" style="color: transparent; caret-color: white;" data-word="${q.word}" autocomplete="new-password" spellcheck="false" autocorrect="off" autocapitalize="off" onpaste="return false;" ondrop="return false;" oninput="this.nextElementSibling.firstElementChild.textContent = this.value || '스펠링 입력'; this.nextElementSibling.firstElementChild.style.color = this.value ? 'white' : '#9ca3af';">
                <div class="absolute inset-0 flex items-center pointer-events-none z-10 px-4 overflow-hidden">
                    <span class="text-slate-400 text-lg font-bold whitespace-pre truncate">스펠링 입력</span>
                </div>
            </div>
        </div>
        `;
    });
    listEl.innerHTML = html || '<p class="text-center text-slate-500 font-bold py-6">해당 단원에 등록된 단어가 없습니다.</p>';
};

window.submitTest = async () => {
    const inputs = document.querySelectorAll('.test-answer-input');
    let score = 0;
    let total = inputs.length;
    let wrongWords = [];
    
    inputs.forEach(input => {
        const correctWord = input.getAttribute('data-word').toLowerCase().trim();
        const userWord = input.value.trim(); 
        
        if (correctWord === userWord.toLowerCase()) {
            score++;
            input.classList.add('bg-green-400', 'border-green-400', 'text-green-700');
        } else {
            wrongWords.push(correctWord); 
            input.classList.add('bg-red-400', 'border-red-400', 'text-red-700');
            input.value = userWord === "" ? `미입력 (정답: ${correctWord})` : `${userWord} (정답: ${correctWord})`;
        }
        input.type = 'text'; input.style.color = 'inherit';
        input.nextElementSibling.style.display = 'none'; input.disabled = true;
    });
    
    const chapter = window.state.currentTestChapter;
    if (!window.state.gameData.testScores) window.state.gameData.testScores = {};
    window.state.gameData.testScores[chapter] = { score, total, wrongWords, unsubmitted: false };
    await window.saveProgress();
    
    const btn = document.getElementById('btn-submit-test');
    btn.disabled = true; btn.classList.replace('bg-red-600', 'bg-slate-400'); btn.style.display = 'none';
    document.getElementById('test-submit-msg').style.display = 'block';
};

window.startTest = async () => {
    const chapter = parseInt(document.getElementById('test-chapter-select').value);
    const checkedBoxes = Array.from(document.querySelectorAll('.test-student-cb:checked')).map(cb => cb.value);
    
    if (checkedBoxes.length === 0) return window.showCustomAlert("테스트를 진행할 대상 학생을 선택하세요.");
    if(await window.showCustomConfirm(`선택한 ${checkedBoxes.length}명의 학생에게 [${chapter}단원] 강제 시험을 시작하시겠습니까?\n진행 중인 게임 화면이 중단됩니다.`)) {
        try {
            window.showCustomAlert("시험 시작 신호를 전송 중입니다...");
            const snap = await getDocs(getStudentsCollection());
            const promises = [];
            snap.forEach(docSnap => {
                const id = docSnap.id;
                if (checkedBoxes.includes(id)) {
                    let stats = docSnap.data().gameStats || {};
                    if (!stats.testScores) stats.testScores = {};
                    stats.testScores[chapter] = { score: 0, total: 0, wrongWords: [], unsubmitted: true };

                    promises.push(setDoc(docSnap.ref, { 
                        testMode: { active: true, chapter: chapter },
                        gameStats: stats
                    }, { merge: true }));
                }
            });
            await Promise.all(promises);
            window.showCustomAlert(`[${chapter}단원] 시험이 시작되었습니다!`);
        } catch(e) { console.error(e); }
    }
};

window.endTest = async () => {
    if(await window.showCustomConfirm(`시험을 종료하시겠습니까?\n틀린 단어가 있는 학생은 오답 노트(함정)로 이동합니다.`)) {
        try {
            window.showCustomAlert("시험 종료 신호를 전송 중입니다...");
            const snap = await getDocs(getStudentsCollection());
            const promises = [];
            snap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.testMode && data.testMode.active) {
                    const chapter = data.testMode.chapter;
                    const scores = data.gameStats?.testScores?.[chapter];
                    
                    const oldWords = data.prisonMode?.wordsToType || {};
                    let wordsToType = {};
                    for (let w in oldWords) wordsToType[w] = 0; 
                    
                    let updates = { testMode: { active: false } };
                    if (scores && !scores.unsubmitted && scores.wrongWords && scores.wrongWords.length > 0) {
                        scores.wrongWords.forEach(w => { wordsToType[w] = 3; });
                        updates.prisonMode = { active: true, wordsToType: wordsToType };
                    } else {
                        updates.prisonMode = { active: false, wordsToType: wordsToType };
                    }
                    promises.push(setDoc(docSnap.ref, updates, { merge: true }));
                }
            });
            await Promise.all(promises);
            window.showCustomAlert("시험이 종료되었습니다.");
            window.renderTestScores(); window.renderPrisonList();
        } catch(e) { console.error(e); }
    }
};

window.renderPrisonPaper = () => {
    const listEl = document.getElementById('prison-paper-list');
    let html = '';
    const words = window.state.prisonWords || {};
    const sortedWords = Object.entries(words).filter(w => w[1] > 0).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (const [word, count] of sortedWords) {
        const quiz = window.state.quizzes.find(q => q.word.toLowerCase() === word.toLowerCase());
        const meaning = quiz ? quiz.meaning : "알 수 없음";

        html += `
        <div class="flex flex-col bg-purple-50 p-4 rounded-xl border-2 border-purple-200 gap-2 shadow-sm">
            <div class="flex justify-between items-center">
                <span class="font-black text-slate-700 text-lg">${meaning}</span>
                <span class="bg-purple-600 text-white text-xs px-2 py-1 rounded-lg font-bold shadow-sm">남은 횟수: ${count}</span>
            </div>
            <div class="text-sm font-bold text-purple-500 mb-1">정답: ${word}</div>
            <div class="flex gap-2">
                <div class="relative flex-1">
                    <input type="password" class="w-full p-3 border-2 border-slate-600 rounded-xl outline-none font-bold text-lg focus:border-purple-500 bg-slate-800 relative z-0" style="color: transparent; caret-color: white;" onkeyup="if(event.key==='Enter')window.checkPrisonWord(this, '${word}')" onpaste="return false;" ondrop="return false;" autocomplete="new-password" spellcheck="false" autocorrect="off" autocapitalize="off" oninput="this.nextElementSibling.firstElementChild.textContent = this.value || '단어를 정확히 입력하세요'; this.nextElementSibling.firstElementChild.style.color = this.value ? 'white' : '#9ca3af';">
                    <div class="absolute inset-0 flex items-center pointer-events-none z-10 px-4 overflow-hidden">
                        <span class="text-slate-400 text-lg font-bold whitespace-pre truncate">단어를 정확히 입력하세요</span>
                    </div>
                </div>
                <button onclick="window.checkPrisonWord(this.previousElementSibling.querySelector('input'), '${word}')" class="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl px-4 shrink-0 transition-colors shadow-sm">입력하기</button>
            </div>
        </div>
        `;
    }
    listEl.innerHTML = html;
    const firstInput = listEl.querySelector('input');
    if (firstInput) firstInput.focus();
};

window.checkPrisonWord = async (inputEl, targetWord) => {
    const val = inputEl.value.trim().toLowerCase();
    if (val === targetWord.toLowerCase()) {
        inputEl.value = '';
        if(inputEl.nextElementSibling) { inputEl.nextElementSibling.firstElementChild.textContent = '단어를 정확히 입력하세요'; inputEl.nextElementSibling.firstElementChild.style.color = '#9ca3af'; }
        inputEl.classList.add('bg-green-100', 'border-green-400');
        setTimeout(() => { inputEl.classList.remove('bg-green-100', 'border-green-400'); }, 300);

        window.state.prisonWords[targetWord]--;
        
        let remainingCount = 0;
        for (let w in window.state.prisonWords) { if (window.state.prisonWords[w] > 0) remainingCount++; }
        
        if (remainingCount === 0) {
            await setDoc(getStudentDoc(window.state.user), { prisonMode: { active: false, wordsToType: window.state.prisonWords } }, { merge: true });
            document.getElementById('prison-mode-view').style.display = 'none';
            window.showCustomAlert("🎉 함정에서 무사히 탈출했습니다!");
        } else {
            await setDoc(getStudentDoc(window.state.user), { prisonMode: { active: true, wordsToType: window.state.prisonWords } }, { merge: true });
            window.renderPrisonPaper();
        }
    } else {
        inputEl.classList.add('bg-red-100', 'border-red-400');
        setTimeout(() => { inputEl.classList.remove('bg-red-100', 'border-red-400'); }, 300);
    }
};

window.renderPrisonList = async () => {
    const listEl = document.getElementById('prison-management-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<p class="text-center text-slate-400 text-xs py-2 animate-pulse">불러오는 중...</p>';
    try {
        const snap = await getDocs(getStudentsCollection());
        let prisoners = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.prisonMode && data.prisonMode.active) {
                let activeWords = {};
                let hasWords = false;
                for (let w in (data.prisonMode.wordsToType || {})) {
                    if (data.prisonMode.wordsToType[w] > 0) {
                        activeWords[w] = data.prisonMode.wordsToType[w];
                        hasWords = true;
                    }
                }
                if (hasWords) prisoners.push({ id: docSnap.id, words: activeWords });
            }
        });
        
        if (prisoners.length === 0) {
            listEl.innerHTML = '<p class="text-center text-slate-400 text-sm py-4 font-bold">함정에 갇힌 학생이 없습니다.</p>';
            return;
        }
        
        let html = '';
        prisoners.forEach(p => {
            const wordsSummary = Object.keys(p.words).map(w => `${w}(${p.words[w]}회)`).join(', ');
            html += `
            <div class="flex justify-between items-center bg-slate-700 p-3 rounded-xl border border-slate-600 mb-2">
                <div class="truncate pr-2 flex-1">
                    <span class="font-bold text-emerald-300 mr-2">${p.id}</span>
                    <span class="text-xs text-slate-300 truncate">${wordsSummary}</span>
                </div>
                <button onclick="window.forceEscape('${p.id}')" class="bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow hover:bg-indigo-600 transition-colors shrink-0">강제 탈출</button>
            </div>
            `;
        });
        listEl.innerHTML = html;
    } catch(e) { listEl.innerHTML = '<p class="text-red-400 text-xs py-2 text-center">오류 발생</p>'; }
};

window.forceEscape = async (studentId) => {
    if (await window.showCustomConfirm(`${studentId} 학생을 함정에서 강제로 탈출시키겠습니까?`)) {
        const docSnap = await getDoc(getStudentDoc(studentId));
        const oldWords = docSnap.data().prisonMode?.wordsToType || {};
        let wordsToType = {};
        for (let w in oldWords) wordsToType[w] = 0;
        
        await setDoc(getStudentDoc(studentId), { prisonMode: { active: false, wordsToType: wordsToType } }, { merge: true });
        window.showCustomAlert(`${studentId} 학생 강제 탈출 처리 완료!`);
        window.renderPrisonList();
    }
};

window.renderTestScores = async () => {
    const tbody = document.getElementById('test-scores-tbody');
    if(!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4">데이터를 불러오는 중...</td></tr>`;
    
    try {
        const snap = await getDocs(getStudentsCollection());
        let students = [];
        snap.forEach(docSnap => {
            const id = docSnap.id;
            if (!['마스터', '선생님'].includes(id)) students.push({ id, data: docSnap.data() });
        });
        
        students.sort((a, b) => {
            const getNum = (id) => { const num = parseInt(id.split('.')[0]); return isNaN(num) ? 999 : num; };
            return getNum(a.id) - getNum(b.id);
        });

        let html = '';
        students.forEach(student => {
            const scores = student.data.gameStats?.testScores || {};
            const chaptersTaken = Object.keys(scores).sort((a,b) => parseInt(a) - parseInt(b));
            
            if (chaptersTaken.length === 0) {
                html += `<tr class="border-b border-slate-600 hover:bg-slate-700 transition-colors">
                    <td class="p-3 font-bold text-emerald-300 bg-slate-800 border-r border-slate-600 align-middle">${student.id}</td>
                    <td class="p-3 text-center text-slate-500" colspan="3">응시 기록 없음</td>
                </tr>`;
            } else {
                chaptersTaken.forEach((ch, index) => {
                    const scoreData = scores[ch];
                    const isPerfect = scoreData.score === scoreData.total && scoreData.total > 0;
                    const wrongList = scoreData.wrongWords && scoreData.wrongWords.length > 0 ? scoreData.wrongWords.join(', ') : (scoreData.unsubmitted ? '미제출' : '없음 (만점!)');
                    const wrongClass = isPerfect ? 'text-emerald-400 font-bold' : (scoreData.unsubmitted ? 'text-slate-500' : 'text-red-400 font-bold');
                    
                    html += `<tr class="border-b border-slate-600 hover:bg-slate-700 transition-colors">
                        ${index === 0 ? `<td class="p-3 font-bold text-emerald-300 bg-slate-800 border-r border-slate-600 align-middle" rowspan="${chaptersTaken.length}">${student.id}</td>` : ''}
                        <td class="p-3 text-center text-slate-300 align-middle">${ch}단원</td>
                        <td class="p-3 text-center font-bold ${isPerfect ? 'text-sky-400' : 'text-slate-300'} align-middle">${scoreData.score}/${scoreData.total}</td>
                        <td class="p-3 ${wrongClass} break-words whitespace-normal max-w-[200px] align-middle leading-snug">${wrongList}</td>
                    </tr>`;
                });
            }
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="text-center py-4 text-slate-400">학생 데이터가 없습니다.</td></tr>';
    } catch(e) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">오류 발생</td></tr>'; }
};

window.downloadTestScoresCSV = async () => {
    try {
        window.showCustomAlert("엑셀 데이터를 생성 중입니다...");
        const snap = await getDocs(getStudentsCollection());
        let students = [];
        snap.forEach(docSnap => {
            const id = docSnap.id;
            if (!['마스터', '선생님'].includes(id)) students.push({ id, data: docSnap.data() });
        });

        students.sort((a, b) => {
            const getNum = (id) => { const num = parseInt(id.split('.')[0]); return isNaN(num) ? 999 : num; };
            return getNum(a.id) - getNum(b.id);
        });

        let csvContent = "\uFEFF"; 
        csvContent += "트레이너명,단원,점수,총점,틀린단어\n";
        let hasData = false;

        students.forEach(student => {
            const scores = student.data.gameStats?.testScores || {};
            const chaptersTaken = Object.keys(scores).sort((a,b) => parseInt(a) - parseInt(b));
            
            if (chaptersTaken.length > 0) {
                hasData = true;
                chaptersTaken.forEach(ch => {
                    const scoreData = scores[ch];
                    const wrongList = scoreData.wrongWords && scoreData.wrongWords.length > 0 ? scoreData.wrongWords.join(', ') : (scoreData.unsubmitted ? '미제출' : '없음');
                    const safeWrongList = `"${wrongList.replace(/"/g, '""')}"`;
                    csvContent += `${student.id},${ch},${scoreData.score},${scoreData.total},${safeWrongList}\n`;
                });
            } else { csvContent += `${student.id},기록없음,-,-,-\n`; }
        });

        if (!hasData) return window.showCustomAlert("다운로드할 성적 데이터가 없습니다.");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "영켓몬_시험성적표.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.closeCustomAlert();
    } catch (error) { window.showCustomAlert("엑셀 다운로드 중 오류가 발생했습니다."); }
};

// ==========================================
// 3. 서버 및 학생 계정 관리
// ==========================================
window.resetAllStudentsData = async () => {
    const confirmed = await window.showCustomConfirm("정말로 모든 학생의 게임 데이터를 초기화하시겠습니까? (비밀번호는 유지됩니다)");
    if (!confirmed) return;

    try {
        window.showCustomAlert("데이터 초기화 중입니다... 잠시만 기다려주세요.");
        const snap = await getDocs(getStudentsCollection());
        const emptyStats = { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
        
        const promises = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            promises.push(setDoc(docSnap.ref, { 
                id: data.id || docSnap.id, password: data.password || "1234", createdAt: data.createdAt || new Date().toISOString(),
                gameStats: emptyStats, forceLogout: true
            }));
        });
        await Promise.all(promises);
        window.showCustomAlert("새로운 시즌이 시작되었습니다! 데이터가 초기화되었습니다.");
        setTimeout(() => { location.reload(); }, 2000); 
    } catch (error) { window.showCustomAlert("초기화 중 오류가 발생했습니다."); }
};

window.forceLogoutAll = async () => {
    const confirmed = await window.showCustomConfirm("접속 중인 모든 학생을 강제로 로그아웃하시겠습니까?\n(업데이트 적용을 위해 사용합니다)");
    if (!confirmed) return;

    try {
        window.showCustomAlert("전체 로그아웃 신호를 전송 중입니다...");
        const snap = await getDocs(getStudentsCollection());
        const promises = [];
        snap.forEach(docSnap => { promises.push(setDoc(docSnap.ref, { forceLogout: true }, { merge: true })); });
        await Promise.all(promises);
        window.showCustomAlert("전원 강제 로그아웃 신호 전송이 완료되었습니다.");
    } catch (error) { window.showCustomAlert("로그아웃 처리 중 오류가 발생했습니다."); }
};

window.resetStudentPassword = async () => {
    const selectEl = document.getElementById('reset-pw-student');
    const studentId = selectEl.value;
    if (!studentId) return window.showCustomAlert("비밀번호를 재설정할 학생을 선택하세요.");

    const newPw = prompt(`[${studentId}] 새로운 비밀번호를 입력하세요.\n(빈칸으로 두면 '1234'로 설정됩니다)`);
    if (newPw === null) return; 

    const finalPw = newPw.trim() === "" ? "1234" : newPw.trim();
    try {
        await setDoc(getStudentDoc(studentId), { password: finalPw }, { merge: true });
        window.showCustomAlert(`${studentId}의 비밀번호가 변경되었습니다!`);
        selectEl.value = ""; 
    } catch (error) { window.showCustomAlert("비밀번호 변경 중 오류가 발생했습니다."); }
};

// ==========================================
// 4. 단어 도감 관리
// ==========================================
window.addWord = async () => {
    const cInput = document.getElementById('new-c');
    const wInput = document.getElementById('new-w'); const mInput = document.getElementById('new-m');
    const c = parseInt(cInput.value) || 1;
    const w = wInput.value.trim(); const m = mInput.value.trim();
    if (!w || !m) return;
    try {
        const wordId = w.toLowerCase().replace(/\s+/g, '_');
        await setDoc(getWordDoc(wordId), { word: w, meaning: m, chapter: c, createdAt: Date.now() });
        wInput.value = ''; mInput.value = ''; wInput.focus();
    } catch (error) {}
};

window.delWord = async (id) => {
    if (await window.showCustomConfirm("도감에서 삭제할까요?")) { try { await deleteDoc(getWordDoc(id)); } catch(e){} }
};

window.updateAdminList = () => {
    const list = document.getElementById('admin-list');
    if(!list) return;
    
    const selectedChapter = parseInt(document.getElementById('new-c').value) || 1;
    const filteredQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) === selectedChapter);

    if (filteredQuizzes.length === 0) {
        list.innerHTML = `<p class="text-center text-slate-400 py-6 text-sm font-bold">해당 단원에 등록된 단어가 없습니다.</p>`;
        return;
    }

    list.innerHTML = filteredQuizzes.map(q => {
        const chapterNum = q.chapter || 1;
        return `
        <div class="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100 mb-2">
            <div class="truncate flex items-center gap-2">
                <span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded font-bold shrink-0">${chapterNum}단원</span>
                <span class="font-black text-red-600 text-lg">${q.word}</span>
                <span class="text-slate-600 text-sm">${q.meaning}</span>
            </div>
            <button onclick="window.delWord('${q.id}')" class="text-red-400 p-2 font-bold text-xs shrink-0">삭제</button>
        </div>
    `}).join('');
};