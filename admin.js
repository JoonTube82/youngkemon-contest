import { db, getStudentsCollection, getStudentDoc, getWordListCollection, getWordDoc, STUDENT_LIST, getSettingsDoc } from './firebase.js';
import { getDoc, getDocs, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
    if (secId === 'admin-sec-student') {
        if (window.renderAdminStudentList) window.renderAdminStudentList();
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
            <label class="flex items-center gap-2 p-2 sm:p-3 bg-slate-700 border border-slate-600 rounded-xl cursor-pointer hover:bg-slate-600 transition-colors">
                <input type="checkbox" value="${name}" class="test-student-cb w-5 h-5 text-emerald-500 bg-slate-800 border-slate-500 rounded focus:ring-emerald-500 cursor-pointer" checked>
                <span class="text-sm sm:text-base font-bold text-emerald-100 truncate">${name}</span>
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
    const title = window.state.chapterTitles?.[chapter] || `${chapter}단원`;
    document.getElementById('test-mode-desc').innerHTML = `<span class="text-indigo-600">[${title}]</span> 단어 시험이 시작되었습니다.<br>빈칸에 알맞은 영어 스펠링을 입력하세요.`;
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
    const title = window.state.chapterTitles?.[chapter] || `${chapter}단원`;
    
    if (checkedBoxes.length === 0) return window.showCustomAlert("테스트를 진행할 대상 학생을 선택하세요.");
    if(await window.showCustomConfirm(`선택한 ${checkedBoxes.length}명의 학생에게 [${title}] 강제 시험을 시작하시겠습니까?\n진행 중인 게임 화면이 중단됩니다.`)) {
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
            window.showCustomAlert(`[${title}] 시험이 시작되었습니다!`);
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
                    const title = window.state.chapterTitles?.[ch] || `${ch}단원`;
                    
                    html += `<tr class="border-b border-slate-600 hover:bg-slate-700 transition-colors">
                        ${index === 0 ? `<td class="p-3 font-bold text-emerald-300 bg-slate-800 border-r border-slate-600 align-middle" rowspan="${chaptersTaken.length}">${student.id}</td>` : ''}
                        <td class="p-3 text-center text-slate-300 align-middle">${title}</td>
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
                    const title = window.state.chapterTitles?.[ch] || `${ch}단원`;
                    const wrongList = scoreData.wrongWords && scoreData.wrongWords.length > 0 ? scoreData.wrongWords.join(', ') : (scoreData.unsubmitted ? '미제출' : '없음');
                    const safeWrongList = `"${wrongList.replace(/"/g, '""')}"`;
                    csvContent += `${student.id},${title},${scoreData.score},${scoreData.total},${safeWrongList}\n`;
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
                id: data.id || docSnap.id, 
                password: data.password || "1234", 
                gender: data.gender || "male",
                createdAt: data.createdAt || new Date().toISOString(),
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

// ==========================================
// ⭐ 4. 엑셀 업로드 및 단원별 단어 일괄 동기화 (고도화 부문)
// ==========================================
// 선택한 단원의 현재 등록된 단어들을 포함하여 엑셀 생성 후 다운로드
window.downloadExcelTemplate = () => {
    const selectedChapter = parseInt(document.getElementById('new-c').value) || 1;
    
    // 현재 선택된 단원에 등록된 퀴즈 필터링
    const currentQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) === selectedChapter);
    
    // 헤더 및 가이드 라인 정의
    const data = [
        ["단원번호(숫자)", "영단어", "뜻"],
        ["[설명] 숫자만 입력", "[설명] 영단어 입력", "[설명] 한글 뜻 입력"],
        [`(※ 현재 ${selectedChapter}단원 관리 중입니다. 파일 업로드 시 이 단원의 기존 데이터는 삭제되고 아래 목록으로 대체됩니다.)`, "", ""]
    ];

    // 기존 데이터가 있다면 가이드 아래에 자동으로 채워줌
    currentQuizzes.forEach(q => {
        data.push([selectedChapter, q.word, q.meaning]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // 열 너비 깔끔하게 자동 세팅
    worksheet['!cols'] = [
        { wch: 25 }, // A열
        { wch: 30 }, // B열
        { wch: 30 }  // C열
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "VocaList");
    XLSX.writeFile(workbook, `${selectedChapter}단원_단어_일괄관리_양식.xlsx`);
};

// 엑셀 업로드 시 선택된 단원의 기존 데이터를 싹 지우고 동기화 (추가+삭제)
window.handleExcelUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const selectedChapter = parseInt(document.getElementById('new-c').value) || 1;

    const confirmMsg = `⚠️ 주의! 엑셀을 업로드하면 현재 서버에 저장된 [${selectedChapter}단원]의 모든 단어가 지워지고, 엑셀 파일에 적힌 단어들로만 새롭게 바뀝니다.\n\n정말로 진행하시겠습니까?`;
    if (!await window.showCustomConfirm(confirmMsg)) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);

            window.showCustomAlert("서버 데이터를 동기화하는 중입니다... 잠시 대기해주세요.");
            
            // 1단계: 선택된 단원의 기존 데이터를 지우기 위해 Firebase에서 대상 조회
            const existingQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) === selectedChapter);
            
            // 대량 처리를 위한 Firestore Batch 활성화
            let batch = writeBatch(db);
            let operationCount = 0;

            // 기존 단어 일괄 삭제 등록
            for (const q of existingQuizzes) {
                batch.delete(getWordDoc(q.id));
                operationCount++;
                if (operationCount >= 400) { // Firestore 처리 제한선 안전 분할
                    await batch.commit();
                    batch = writeBatch(db);
                    operationCount = 0;
                }
            }

            // 2단계: 엑셀 파일에서 읽어온 새로운 단어 목록 일괄 등록
            for (const row of json) {
                const chapter = parseInt(row["단원번호(숫자)"]);
                const word = row["영단어"] ? String(row["영단어"]).trim() : "";
                const meaning = row["뜻"] ? String(row["뜻"]).trim() : "";

                // 현재 관리 중인 단원 번호와 일치하고 글자가 유효할 때만 등록 (설명글 자동 패스)
                if (chapter === selectedChapter && word && meaning) {
                    const wordId = word.toLowerCase().replace(/\s+/g, '_');
                    batch.set(getWordDoc(wordId), {
                        word: word,
                        meaning: meaning,
                        chapter: chapter,
                        createdAt: Date.now()
                    });
                    operationCount++;

                    if (operationCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        operationCount = 0;
                    }
                }
            }

            // 남은 작업 최종 커밋
            if (operationCount > 0) {
                await batch.commit();
            }

            window.showCustomAlert(`🎉 [${selectedChapter}단원]의 단어장이 엑셀 내용과 완벽하게 동기화되었습니다!`);
            event.target.value = ''; 
            if(window.updateAdminList) window.updateAdminList(); 
        } catch (err) {
            console.error(err);
            window.showCustomAlert("엑셀 파일 분석 중 오류가 발생했습니다. 규격 양식을 확인해 주세요.");
        }
    };
    reader.readAsArrayBuffer(file);
};

// 단원 제목 변경 저장
window.saveChapterTitle = async () => {
    const chapter = document.getElementById('new-c').value;
    const newTitle = document.getElementById('custom-chapter-title').value.trim();
    
    if (!newTitle) return window.showCustomAlert("단원 제목을 입력하세요.");
    
    try {
        await setDoc(getSettingsDoc(), { [chapter]: newTitle }, { merge: true });
        window.showCustomAlert(`${chapter}단원 제목이 [${newTitle}](으)로 변경되었습니다!`);
        document.getElementById('custom-chapter-title').value = '';
    } catch (e) {
        window.showCustomAlert("제목 저장 중 오류가 발생했습니다.");
    }
};

// ==========================================
// 5. 단어 도감 관리 (개별 추가/삭제)
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
    if (await window.showCustomConfirm("도감에서 해당 단어를 삭제하시겠습니까?")) { 
        try { await deleteDoc(getWordDoc(id)); } catch(e){} 
    }
};

window.updateAdminList = () => {
    const list = document.getElementById('admin-list');
    if(!list) return;
    
    const selectedChapter = parseInt(document.getElementById('new-c').value) || 1;
    
    const titleInput = document.getElementById('custom-chapter-title');
    if(titleInput) {
        titleInput.value = window.state.chapterTitles?.[selectedChapter] || "";
    }

    const filteredQuizzes = window.state.quizzes.filter(q => (q.chapter || 1) === selectedChapter);

    if (filteredQuizzes.length === 0) {
        list.innerHTML = `<p class="text-center text-slate-400 py-8 text-base font-bold">해당 단원에 등록된 단어가 없습니다.</p>`;
        return;
    }

    list.innerHTML = filteredQuizzes.map(q => {
        const chapterNum = q.chapter || 1;
        return `
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-3">
            <div class="truncate flex items-center gap-3">
                <span class="bg-slate-100 text-slate-500 text-sm sm:text-base px-3 py-1.5 rounded-lg font-bold shrink-0">${chapterNum}단원</span>
                <span class="font-black text-red-600 text-xl sm:text-2xl">${q.word}</span>
                <span class="text-slate-600 text-base sm:text-lg font-bold">${q.meaning}</span>
            </div>
            <button onclick="window.delWord('${q.id}')" class="text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl font-bold text-sm sm:text-base shrink-0 transition-colors border border-transparent hover:border-red-200">삭제</button>
        </div>
    `}).join('');
};

// ==========================================
// 6. 학생 관리 (추가/삭제/비밀번호 초기화)
// ==========================================
window.renderAdminStudentList = () => {
    const listEl = document.getElementById('admin-student-list');
    if (!listEl) return;
    
    let html = '';
    STUDENT_LIST.forEach(name => {
        const isPrivileged = ['마스터', '선생님', '테스트', '테스트2'].includes(name);
        
        html += `
        <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-md border border-slate-200 mb-2">
            <span class="font-black text-slate-800 text-base sm:text-lg">${name}</span>
            ${!isPrivileged ? `<button onclick="window.removeStudent('${name}')" class="text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl font-bold text-sm sm:text-base shrink-0 transition-colors border border-transparent hover:border-red-200">삭제</button>` : `<span class="text-sm text-slate-400 font-bold p-2 bg-slate-100 rounded-lg">기본 계정</span>`}
        </div>`;
    });
    listEl.innerHTML = html || '<p class="text-center text-slate-400 py-6 text-base font-bold">등록된 학생이 없습니다.</p>';
};

window.addStudent = async () => {
    const nameInput = document.getElementById('new-student-name');
    const genderInput = document.getElementById('new-student-gender');
    const name = nameInput.value.trim();
    const gender = genderInput.value;
    
    if (!name) return window.showCustomAlert("추가할 학생의 이름을 입력하세요.");
    if (STUDENT_LIST.includes(name)) return window.showCustomAlert("이미 존재하는 학생 이름입니다.");
    
    try {
        const emptyStats = { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
        await setDoc(getStudentDoc(name), { 
            id: name, 
            password: "RESET", 
            isPwSet: false,    
            gender: gender,
            gameStats: emptyStats, 
            createdAt: new Date().toISOString(), 
            forceLogout: false 
        });
        nameInput.value = '';
        window.showCustomAlert(`[${name}] 학생이 정상적으로 등록되었습니다!\n(최초 로그인 시 학생이 스스로 4자리 암호를 설정합니다)`);
    } catch (e) { window.showCustomAlert("학생 추가 중 오류가 발생했습니다."); }
};

window.removeStudent = async (name) => {
    if (await window.showCustomConfirm(`정말로 [${name}] 학생을 삭제하시겠습니까?\n모든 게임 데이터와 성적이 영구적으로 사라집니다.`)) {
        try {
            await deleteDoc(getStudentDoc(name));
            window.showCustomAlert(`[${name}] 학생이 완벽하게 삭제되었습니다.`);
        } catch (e) { window.showCustomAlert("학생 삭제 중 오류가 발생했습니다."); }
    }
};

window.resetStudentPassword = async () => {
    const selectEl = document.getElementById('reset-pw-student');
    const studentId = selectEl.value;
    if (!studentId) return window.showCustomAlert("비밀번호를 초기화할 학생을 선택하세요.");

    if (await window.showCustomConfirm(`[${studentId}] 학생의 비밀번호를 초기화하시겠습니까?\n(다음 접속 시 학생이 직접 새 4자리 숫자를 설정하게 됩니다.)`)) {
        try {
            await setDoc(getStudentDoc(studentId), { password: "RESET", isPwSet: false }, { merge: true });
            window.showCustomAlert(`[${studentId}] 학생의 비밀번호가 초기화되었습니다!`);
            selectEl.value = ""; 
        } catch (error) { window.showCustomAlert("비밀번호 초기화 중 오류가 발생했습니다."); }
    }
};
