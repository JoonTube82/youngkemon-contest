import { db, getStudentsCollection, getStudentDoc, getWordListCollection, getWordDoc, getClassDoc, getClassCode } from './firebase.js';
import { getDoc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ==========================================
// 1. 관리자 뷰 화면 토글 로직
// ==========================================
window.showAdminMainMenu = () => {
    document.getElementById('admin-main-menu').style.display = 'grid';
    ['admin-sec-dex', 'admin-sec-title', 'admin-sec-student', 'admin-sec-server', 'admin-sec-test'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

window.showAdminSection = (secId) => {
    document.getElementById('admin-main-menu').style.display = 'none';
    ['admin-sec-dex', 'admin-sec-title', 'admin-sec-student', 'admin-sec-server', 'admin-sec-test'].forEach(id => {
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
        window.renderAdminStudentList();
    }
    if (secId === 'admin-sec-title') {
        window.renderAdminTitleInputs();
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
// ⭐ 2. 단원 제목 직접 설정 로직 (신규)
// ==========================================
const DEFAULT_CHAPTER_TITLES = [
    "",
    "What Grade Are You In?", "What Do You Want to Be?", "When Is the Field Trip?",
    "He Has Short Curly Hair", "How Often Do You Exercise?", "I'm Going to Go on a Trip",
    "What Season Do You Like?", "I'm Faster Than You", "How Can I Get to the Museum?",
    "I'd Like to Have the Fruit Salad", "Do You Know About Songpyeon?", "We Should Save the World"
];

window.renderAdminTitleInputs = () => {
    const container = document.getElementById('admin-title-inputs');
    if(!container) return;
    
    let html = '';
    for(let i=1; i<=12; i++) {
        const currentTitle = window.state.chapterTitles[i] || DEFAULT_CHAPTER_TITLES[i];
        html += `
        <div class="flex items-center gap-2 bg-slate-800 p-2 rounded-xl border border-slate-600">
            <span class="text-xs font-bold text-yellow-400 bg-yellow-900/50 px-2 py-1 rounded-lg w-16 text-center shrink-0">${i}단원</span>
            <input type="text" id="admin-ch-title-${i}" value="${currentTitle}" class="flex-1 p-2 bg-slate-100 border border-slate-300 rounded-lg outline-none text-sm font-bold text-slate-800 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 transition-all">
        </div>
        `;
    }
    container.innerHTML = html;
};

window.saveChapterTitles = async () => {
    const classCode = getClassCode();
    // "대회초 6-1" 조건을 지우고 학급 코드가 없을 때만 에러를 띄우게 변경합니다.
    if(!classCode) {
        return window.showCustomAlert("학급 코드를 찾을 수 없습니다.");
    }
    
    const newTitles = {};
    for(let i=1; i<=12; i++) {
        const inputEl = document.getElementById(`admin-ch-title-${i}`);
        if(inputEl) {
            newTitles[i] = inputEl.value.trim() || DEFAULT_CHAPTER_TITLES[i];
        }
    }
    
    try {
        window.showCustomAlert("단원 제목을 서버에 저장 중입니다...");
        const classRef = getClassDoc(classCode);
        await setDoc(classRef, { chapterTitles: newTitles }, { merge: true });
        
        window.state.chapterTitles = newTitles;
        if(window.updateChapterTitlesUI) window.updateChapterTitlesUI(); // 풀숲 UI 즉시 업데이트
        
        window.showCustomAlert("학급 단원 제목이 성공적으로 변경되었습니다!\n새로 접속하는 학생들의 화면에도 즉시 반영됩니다.");
    } catch(e) {
        window.showCustomAlert("저장 중 오류 발생: " + e.message);
    }
};


// ==========================================
// 3. 단어 도감 직접 추가 및 삭제 로직
// ==========================================
window.addWord = async () => {
    const cInput = document.getElementById('new-c');
    const wInput = document.getElementById('new-w'); 
    const mInput = document.getElementById('new-m');
    const c = parseInt(cInput.value) || 1;
    const w = wInput.value.trim(); 
    const m = mInput.value.trim();
    if (!w || !m) return;
    try {
        const wordId = w.toLowerCase().replace(/\s+/g, '_');
        await setDoc(getWordDoc(wordId), { word: w, meaning: m, chapter: c, createdAt: Date.now() });
        wInput.value = ''; mInput.value = ''; wInput.focus();
        window.updateAdminList();
    } catch (error) {}
};

window.delWord = async (id) => {
    if (await window.showCustomConfirm("도감에서 삭제할까요?")) { 
        try { 
            await deleteDoc(getWordDoc(id)); 
            window.updateAdminList();
        } catch(e){} 
    }
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

// ==========================================
// 4. 엑셀 업로드 및 다운로드 로직 (SheetJS 연동)
// ==========================================
window.downloadWordExcel = async () => {
    if(!window.XLSX) return window.showCustomAlert("엑셀 라이브러리를 불러오지 못했습니다.");
    window.showCustomAlert("단어장 데이터를 엑셀로 추출 중입니다...");
    try {
        const snap = await getDocs(getWordListCollection());
        let words = [];
        snap.forEach(doc => words.push(doc.data()));
        words.sort((a,b) => (a.chapter || 1) - (b.chapter || 1));

        let ws_data = [["단원(숫자)", "영단어", "뜻"]];
        words.forEach(w => { ws_data.push([w.chapter || 1, w.word, w.meaning]); });

        const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "단어장");
        window.XLSX.writeFile(wb, "영켓몬_단어장_백업.xlsx");
        window.closeCustomAlert();
    } catch(e) { window.showCustomAlert("오류 발생: " + e.message); }
};

window.excelDataTemp = [];
window.handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const bstr = evt.target.result;
            const wb = window.XLSX.read(bstr, {type: 'binary'});
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = window.XLSX.utils.sheet_to_json(ws, {header: 1});
            
            let newWords = [];
            for(let i=1; i<data.length; i++) {
                const row = data[i];
                if(row.length >= 3 && row[1] && row[2]) {
                    newWords.push({ chapter: parseInt(row[0])||1, word: row[1].toString().trim(), meaning: row[2].toString().trim() });
                }
            }
            window.excelDataTemp = newWords;
            
            const previewContainer = document.getElementById('excel-preview-container');
            const previewList = document.getElementById('excel-preview-list');
            const previewTitle = document.getElementById('excel-preview-title');
            
            previewTitle.innerText = `업로드 미리보기 (총 ${newWords.length}개)`;
            let html = '';
            newWords.slice(0, 50).forEach(w => { html += `<div>[${w.chapter}단원] ${w.word} : ${w.meaning}</div>`; });
            if(newWords.length > 50) html += `<div>... 외 ${newWords.length - 50}개</div>`;
            
            previewList.innerHTML = html; previewContainer.style.display = 'block';
        } catch(err) { window.showCustomAlert("엑셀 파일을 읽는 중 오류가 발생했습니다."); }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; 
};

window.applyExcelData = async () => {
    if(!window.excelDataTemp || window.excelDataTemp.length === 0) return window.showCustomAlert("적용할 데이터가 없습니다.");
    if(!await window.showCustomConfirm(`기존 도감을 모두 삭제하고 엑셀 데이터(${window.excelDataTemp.length}개)로 덮어쓰시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    window.showCustomAlert("기존 데이터를 삭제하고 새 데이터를 적용 중입니다... (잠시만 기다려주세요)");
    try {
        const snap = await getDocs(getWordListCollection());
        const deletePromises = [];
        snap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
        await Promise.all(deletePromises);

        const addPromises = [];
        window.excelDataTemp.forEach(w => {
            const wordId = w.word.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2,5); 
            addPromises.push(setDoc(getWordDoc(wordId), {
                chapter: w.chapter, word: w.word, meaning: w.meaning, createdAt: Date.now()
            }));
        });
        await Promise.all(addPromises);
        
        document.getElementById('excel-preview-container').style.display = 'none';
        window.excelDataTemp = [];
        window.showCustomAlert("엑셀 데이터 적용이 완료되었습니다!");
        window.updateAdminList();
    } catch(e) { window.showCustomAlert("적용 중 오류 발생: " + e.message); }
};

// ==========================================
// ⭐ 5. 모험가 계정 성별 토글 및 삭제 로직
// ==========================================
window.addStudentAccount = async () => {
    const nameInput = document.getElementById('new-student-name');
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    const pw = "0000"; 
    
    if(!name) return window.showCustomAlert("이름을 입력하세요.");
    
    try {
        const docRef = getStudentDoc(name);
        const docSnap = await getDoc(docRef);
        if(docSnap.exists()) return window.showCustomAlert("이미 존재하는 계정입니다.");
        
        const emptyStats = { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
        
        await setDoc(docRef, { 
            id: name, 
            password: pw, 
            gender: 'M', // 기본 성별 남자로 설정
            isFirstLogin: true, 
            gameStats: emptyStats, 
            createdAt: new Date().toISOString(), 
            forceLogout: false 
        });
        
        nameInput.value = '';
        window.showCustomAlert(`${name} 모험가 계정이 생성되었습니다!\n초기 비밀번호는 0000 입니다.`);
        
        if (window.renderAdminStudentList) window.renderAdminStudentList();
        if (typeof window.loadDynamicStudentList === 'function') window.loadDynamicStudentList();
        
    } catch(e) { 
        window.showCustomAlert("계정 추가 오류: " + e.message); 
    }
};

window.renderAdminStudentList = async () => {
    const container = document.getElementById('admin-student-list');
    if(!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400">목록을 불러오는 중...</p>';
    try {
        const snap = await getDocs(getStudentsCollection());
        let html = '';
        let students = [];
        snap.forEach(doc => {
            if(!['마스터', '테스트'].includes(doc.id)) students.push({id: doc.id, data: doc.data()});
        });
        
        students.sort((a,b) => {
            const numA = parseInt(a.id.split('.')[0]); const numB = parseInt(b.id.split('.')[0]);
            return (isNaN(numA) ? 999 : numA) - (isNaN(numB) ? 999 : numB);
        });

        if(students.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400">등록된 모험가가 없습니다.</p>'; return;
        }

        students.forEach(s => {
            // ⭐ 성별 데이터 렌더링
            const gender = s.data.gender || 'M';
            const genderEmoji = gender === 'F' ? '👧' : '👦';
            const genderColor = gender === 'F' ? 'bg-pink-100 text-pink-600 border-pink-300 hover:bg-pink-200' : 'bg-blue-100 text-blue-600 border-blue-300 hover:bg-blue-200';
            
            html += `
            <div class="flex justify-between items-center bg-slate-800 p-2 rounded-lg border border-slate-600 mb-2">
                <div class="flex items-center gap-2">
                    <button onclick="window.toggleStudentGender('${s.id}', '${gender}')" class="text-lg w-8 h-8 flex items-center justify-center rounded-full border shadow-sm transition-colors ${genderColor}" title="클릭하여 성별 변경">${genderEmoji}</button>
                    <div>
                        <span class="font-bold text-blue-300 text-sm">${s.id}</span>
                        <span class="text-[10px] text-slate-400 ml-2 block sm:inline">비번: ${s.data.password}</span>
                    </div>
                </div>
                <button onclick="window.deleteStudentAccount('${s.id}')" class="text-red-400 text-xs font-bold bg-red-900/30 px-3 py-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-colors shrink-0">삭제</button>
            </div>`;
        });
        container.innerHTML = html;
    } catch(e) { container.innerHTML = '<p class="text-red-400 text-xs">불러오기 실패</p>'; }
};

// ⭐ 성별 클릭 시 파이어베이스 실시간 업데이트 함수
window.toggleStudentGender = async (studentId, currentGender) => {
    const newGender = currentGender === 'F' ? 'M' : 'F';
    try {
        await setDoc(getStudentDoc(studentId), { gender: newGender }, { merge: true });
        window.renderAdminStudentList(); // 리스트 새로고침
    } catch(e) {
        window.showCustomAlert("성별 변경 중 오류가 발생했습니다.");
    }
};

window.deleteStudentAccount = async (id) => {
    if(await window.showCustomConfirm(`정말 [${id}] 모험가 계정과 모든 데이터를 삭제하시겠습니까?`)) {
        try {
            await deleteDoc(getStudentDoc(id));
            window.showCustomAlert(`${id} 계정이 완벽히 삭제되었습니다.`);
            window.renderAdminStudentList();
            if (typeof window.loadDynamicStudentList === 'function') {
                window.loadDynamicStudentList();
            }
        } catch(e) {}
    }
};

window.resetStudentPassword = async () => {
    const selectEl = document.getElementById('reset-pw-student');
    const studentId = selectEl.value;
    if (!studentId) return window.showCustomAlert("비밀번호를 재설정할 계정을 선택하세요.");

    const newPw = prompt(`[${studentId}] 새로운 비밀번호를 입력하세요.\n(빈칸으로 두면 '1234'로 설정됩니다)`);
    if (newPw === null) return; 

    const finalPw = newPw.trim() === "" ? "1234" : newPw.trim();
    try {
        await setDoc(getStudentDoc(studentId), { password: finalPw, isFirstLogin: true }, { merge: true });
        window.showCustomAlert(`${studentId}의 비밀번호가 변경되었습니다!\n다음에 로그인할 때 본인이 다시 비번을 설정하게 됩니다.`);
        selectEl.value = ""; 
        window.renderAdminStudentList();
    } catch (error) { window.showCustomAlert("비밀번호 변경 중 오류가 발생했습니다."); }
};

// ==========================================
// 6. 서버 전체 초기화 및 로그아웃
// ==========================================
window.resetAllStudentsData = async () => {
    const confirmed = await window.showCustomConfirm("정말로 모든 모험가의 게임 데이터를 초기화하시겠습니까? (비밀번호 및 성별 유지)");
    if (!confirmed) return;

    try {
        window.showCustomAlert("데이터 초기화 중입니다... 잠시만 기다려주세요.");
        const snap = await getDocs(getStudentsCollection());
        const emptyStats = { level: 1, exp: 0, count: 0, caughtWords: {}, wins: 0, victories: {}, partnerWord: null, usedPokemonCooldown: {}, savedEncounters: {}, defenseLogs: [], testScores: {} };
        
        const promises = [];
        snap.forEach(docSnap => {
            if(!['마스터', '테스트'].includes(docSnap.id)) {
                const data = docSnap.data();
                promises.push(setDoc(docSnap.ref, { 
                    id: data.id || docSnap.id, 
                    password: data.password || "1234", 
                    gender: data.gender || 'M', // 초기화 시에도 성별 유지
                    createdAt: data.createdAt || new Date().toISOString(),
                    gameStats: emptyStats, forceLogout: true
                }));
            }
        });
        await Promise.all(promises);
        window.showCustomAlert("새로운 시즌이 시작되었습니다! 데이터가 초기화되었습니다.");
        setTimeout(() => { location.reload(); }, 2000); 
    } catch (error) { window.showCustomAlert("초기화 중 오류가 발생했습니다."); }
};

window.forceLogoutAll = async () => {
    const confirmed = await window.showCustomConfirm("접속 중인 모든 계정을 강제로 로그아웃하시겠습니까?\n(업데이트 적용을 위해 사용합니다)");
    if (!confirmed) return;

    try {
        window.showCustomAlert("전체 로그아웃 신호를 전송 중입니다...");
        const snap = await getDocs(getStudentsCollection());
        const promises = [];
        snap.forEach(docSnap => { 
            if(!['마스터'].includes(docSnap.id)) promises.push(setDoc(docSnap.ref, { forceLogout: true }, { merge: true })); 
        });
        await Promise.all(promises);
        window.showCustomAlert("전원 강제 로그아웃 신호 전송이 완료되었습니다.");
    } catch (error) { window.showCustomAlert("로그아웃 처리 중 오류가 발생했습니다."); }
};

// ==========================================
// 7. 단어 시험(기습 테스트) 관리 및 성적표
// ==========================================
window.renderTestStudentCheckboxes = async () => {
    const container = document.getElementById('test-student-checkboxes');
    if (!container) return;
    
    try {
        const snap = await getDocs(getStudentsCollection());
        let html = '';
        let students = [];
        snap.forEach(docSnap => {
            if (!['마스터', '테스트'].includes(docSnap.id)) students.push(docSnap.id);
        });
        students.sort((a,b) => parseInt(a.split('.')[0] || 999) - parseInt(b.split('.')[0] || 999));
        
        students.forEach(name => {
            html += `
            <label class="flex items-center gap-1.5 p-1.5 bg-slate-700 border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-600">
                <input type="checkbox" value="${name}" class="test-student-cb w-4 h-4 text-emerald-500 bg-slate-800 border-slate-500 rounded focus:ring-emerald-500 cursor-pointer" checked>
                <span class="text-xs font-bold text-emerald-100 truncate">${name}</span>
            </label>
            `;
        });
        container.innerHTML = html;
    } catch(e) {}
};

window.toggleTestStudents = (state) => { document.querySelectorAll('.test-student-cb').forEach(cb => cb.checked = state); };

window.startTest = async () => {
    const chapter = parseInt(document.getElementById('test-chapter-select').value);
    const checkedBoxes = Array.from(document.querySelectorAll('.test-student-cb:checked')).map(cb => cb.value);
    
    if (checkedBoxes.length === 0) return window.showCustomAlert("테스트를 진행할 대상 모험가를 선택하세요.");
    if(await window.showCustomConfirm(`선택한 ${checkedBoxes.length}명의 모험가에게 [${chapter}단원] 강제 시험을 시작하시겠습니까?\n진행 중인 게임 화면이 중단됩니다.`)) {
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
    if(await window.showCustomConfirm(`시험을 종료하시겠습니까?\n틀린 단어가 있는 모험가는 오답 노트(함정)로 이동합니다.`)) {
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

window.renderTestScores = async () => {
    const tbody = document.getElementById('test-scores-tbody');
    if(!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4">데이터를 불러오는 중...</td></tr>`;
    
    try {
        const snap = await getDocs(getStudentsCollection());
        let students = [];
        snap.forEach(docSnap => {
            const id = docSnap.id;
            if (!['마스터', '테스트'].includes(id)) students.push({ id, data: docSnap.data() });
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
        tbody.innerHTML = html || '<tr><td colspan="4" class="text-center py-4 text-slate-400">모험가 데이터가 없습니다.</td></tr>';
    } catch(e) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-red-500">오류 발생</td></tr>'; }
};

window.downloadTestScoresCSV = async () => {
    try {
        window.showCustomAlert("엑셀 데이터를 생성 중입니다...");
        const snap = await getDocs(getStudentsCollection());
        let students = [];
        snap.forEach(docSnap => {
            const id = docSnap.id;
            if (!['마스터', '테스트'].includes(id)) students.push({ id, data: docSnap.data() });
        });

        students.sort((a, b) => {
            const getNum = (id) => { const num = parseInt(id.split('.')[0]); return isNaN(num) ? 999 : num; };
            return getNum(a.id) - getNum(b.id);
        });

        let csvContent = "\uFEFF"; 
        csvContent += "모험가명,단원,점수,총점,틀린단어\n";
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
// 8. 함정(오답 노트) 관리
// ==========================================
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
            listEl.innerHTML = '<p class="text-center text-slate-400 text-sm py-4 font-bold">함정에 갇힌 모험가가 없습니다.</p>';
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
    if (await window.showCustomConfirm(`${studentId} 모험가를 함정에서 강제로 탈출시키겠습니까?`)) {
        const docSnap = await getDoc(getStudentDoc(studentId));
        const oldWords = docSnap.data().prisonMode?.wordsToType || {};
        let wordsToType = {};
        for (let w in oldWords) wordsToType[w] = 0;
        
        await setDoc(getStudentDoc(studentId), { prisonMode: { active: false, wordsToType: wordsToType } }, { merge: true });
        window.showCustomAlert(`${studentId} 모험가 강제 탈출 처리 완료!`);
        window.renderPrisonList();
    }
};
