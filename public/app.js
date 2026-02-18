/**
 * Gamble Tracker - app.js
 */

const DB_NAME = 'GambleDB_v3';
const DB_VERSION = 1;
const STORE_PLAYERS = 'players';
const STORE_HISTORY = 'history';

let db;
let setupPlayers = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

/**
 * Initialize IndexedDB
 */
async function sandbox_gamble_initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_PLAYERS)) {
                db.createObjectStore(STORE_PLAYERS, { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Reset functions
 */
async function sandbox_gamble_clearAll() {
    const tx = db.transaction([STORE_PLAYERS, STORE_HISTORY], 'readwrite');
    tx.objectStore(STORE_PLAYERS).clear();
    tx.objectStore(STORE_HISTORY).clear();
    return new Promise(resolve => tx.oncomplete = resolve);
}

/**
 * Round Deletion
 */
async function sandbox_gamble_deleteRound(historyId) {
    const tx = db.transaction([STORE_PLAYERS, STORE_HISTORY], 'readwrite');
    const historyStore = tx.objectStore(STORE_HISTORY);
    const playerStore = tx.objectStore(STORE_PLAYERS);

    const historyEntry = await new Promise(resolve => {
        const req = historyStore.get(historyId);
        req.onsuccess = () => resolve(req.result);
    });

    if (!historyEntry) return;

    // Reverse Main Details
    for (const detail of historyEntry.details) {
        const pReq = playerStore.get(detail.name);
        await new Promise(resolve => {
            pReq.onsuccess = () => {
                const p = pReq.result;
                if (p) {
                    p.balance -= detail.amount;
                    playerStore.put(p);
                }
                resolve();
            };
        });
    }

    // Reverse Bonus Entries (Crucial for correct totals)
    if (historyEntry.bonus) {
        for (const b of historyEntry.bonus) {
            const pReq = playerStore.get(b.name);
            await new Promise(resolve => {
                pReq.onsuccess = () => {
                    const p = pReq.result;
                    if (p) {
                        p.balance -= b.amount;
                        playerStore.put(p);
                    }
                    resolve();
                };
            });
        }
    }

    historyStore.delete(historyId);
    return new Promise(resolve => tx.oncomplete = resolve);
}

/**
 * Data Fetching
 */
async function sandbox_gamble_getPlayers() {
    const tx = db.transaction(STORE_PLAYERS, 'readonly');
    return new Promise(r => tx.objectStore(STORE_PLAYERS).getAll().onsuccess = e => r(e.target.result));
}

async function sandbox_gamble_getHistory() {
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    return new Promise(r => tx.objectStore(STORE_HISTORY).getAll().onsuccess = e => {
        const sorted = e.target.result.sort((a,b) => a.id - b.id);
        r(sorted);
    });
}

// --- Voice Recognition ---
let recognition;
let isRecording = false;
let activeMicBtn = null;
let pendingMicBtn = null;

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'vi-VN';

    recognition.onstart = () => {
        isRecording = true;
        if (activeMicBtn) {
            activeMicBtn.classList.add('recording');
            const micIcon = activeMicBtn.querySelector('[data-lucide="mic"]');
            const stopIcon = activeMicBtn.querySelector('[data-lucide="square"]');
            if (micIcon) micIcon.classList.add('hidden');
            if (stopIcon) stopIcon.classList.remove('hidden');
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (activeMicBtn) {
            const targetInputId = activeMicBtn.id === 'voice-lose-btn' ? 'lose-input' : 'win-input';
            const inputEl = document.getElementById(targetInputId);
            inputEl.value = transcript;
            inputEl.dispatchEvent(new Event('input')); // Trigger any input listeners
            document.getElementById('voice-review-hint').classList.remove('hidden');
        }
    };

    recognition.onerror = () => stopRecordingUI();
    
    recognition.onend = () => {
        stopRecordingUI();
        if (pendingMicBtn) {
            const btn = pendingMicBtn;
            pendingMicBtn = null;
            startRecording(btn);
        }
    };
}

function stopRecordingUI() {
    isRecording = false;
    if (activeMicBtn) {
        activeMicBtn.classList.remove('recording');
        const micIcon = activeMicBtn.querySelector('[data-lucide="mic"]');
        const stopIcon = activeMicBtn.querySelector('[data-lucide="square"]');
        if (micIcon) micIcon.classList.remove('hidden');
        if (stopIcon) stopIcon.classList.add('hidden');
    }
    activeMicBtn = null;
}

function startRecording(btn) {
    if (isRecording) {
        if (activeMicBtn === btn) {
            recognition.stop();
        } else {
            pendingMicBtn = btn;
            recognition.stop();
        }
        return;
    }
    activeMicBtn = btn;
    recognition.start();
}

// --- Modal Controls ---
window.openSummary = async () => {
    const players = await sandbox_gamble_getPlayers();
    document.getElementById('modal-player-count').textContent = `${players.length} NGƯỜI`;
    
    // Sort players by balance (winners on top)
    const sorted = [...players].sort((a, b) => b.balance - a.balance);

    document.getElementById('modal-players-list').innerHTML = sorted.map(p => `
        <div class="bg-red-900/20 border border-amber-500/10 rounded-2xl px-5 py-4 flex justify-between items-center">
            <span class="font-semibold text-amber-50">${p.name}</span>
            <span class="font-black ${p.balance >= 0 ? 'text-yellow-400' : 'text-red-500'}">
                ${p.balance > 0 ? '+' : ''}${p.balance.toLocaleString()}
            </span>
        </div>
    `).join('');

    const modal = document.getElementById('summary-modal');
    modal.classList.add('active');
    setTimeout(() => {
        modal.querySelector('.modal-content').style.transform = 'translateY(0)';
    }, 10);
};

window.closeSummary = () => {
    const modal = document.getElementById('summary-modal');
    modal.querySelector('.modal-content').style.transform = 'translateY(100%)';
    setTimeout(() => {
        modal.classList.remove('active');
    }, 300);
};

// --- UI Logic ---
async function updateUI() {
    const players = await sandbox_gamble_getPlayers();
    const history = await sandbox_gamble_getHistory();

    const setupSection = document.getElementById('setup-section');
    const gameSection = document.getElementById('game-section');
    const summaryDock = document.getElementById('summary-dock');
    const historyList = document.getElementById('history-list');

    if (players.length === 0) {
        setupSection.classList.remove('hidden');
        gameSection.classList.add('hidden');
        summaryDock.classList.add('hidden');
        renderSetupChips();
    } else {
        setupSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        summaryDock.classList.remove('hidden');

        // Populate structured input list for Input mode
        const structuredList = document.getElementById('structured-input-list');
        if (structuredList && structuredList.children.length !== players.length) {
            structuredList.innerHTML = players.map(p => `
                <div class="flex items-center bg-red-900/10 border border-amber-500/5 rounded-xl px-4 py-2 hover:border-amber-500/20 transition-all">
                    <span class="text-[11px] font-bold text-amber-50/60 flex-grow uppercase whitespace-normal leading-tight pr-2">${p.name}</span>
                    <input type="number" 
                        data-player="${p.name}"
                        class="player-structured-input w-20 bg-red-950/40 border-none rounded-lg px-2 py-1.5 text-xs text-amber-50 text-right focus:ring-1 focus:ring-amber-500/40 placeholder:text-white/5" 
                        placeholder="+/- tiền">
                </div>
            `).join('');
        }

        // Populate dynamic bonus selects
        document.querySelectorAll('.bonus-player-select').forEach(select => {
            const currentVal = select.value;
            select.innerHTML = `<option value="" class="bg-red-950 text-amber-100">Chọn người...</option>` + 
                players.map(p => `<option value="${p.name}" class="bg-red-950 text-amber-100">${p.name}</option>`).join('');
            select.value = currentVal;
        });

        if (history.length > 0) {
            document.getElementById('history-section').classList.remove('hidden');
            const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
            if (currentPage > totalPages) currentPage = totalPages || 1;

            const reversedHistory = [...history].reverse();
            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
            const paginatedHistory = reversedHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);

            historyList.innerHTML = paginatedHistory.map((h, i) => {
                const roundIndex = history.length - (startIndex + i);
                
                // Calculate net results for summary view
                const netResults = {};
                players.forEach(p => netResults[p.name] = 0);
                h.details.forEach(d => netResults[d.name] += d.amount);
                if (h.bonus) h.bonus.forEach(b => netResults[b.name] += b.amount);

                // Sort net results: winners first
                const sortedNet = Object.entries(netResults)
                    .filter(([_, amt]) => amt !== 0)
                    .sort((a,b) => b[1] - a[1]);

                const mentionedLosers = h.details.filter(d => d.type === 'loser');
                const mentionedWinners = h.details.filter(d => d.type === 'winner');
                const remainingGroup = h.details.filter(d => d.type === 'remaining');
                const bonusEntries = h.bonus || [];

                let detailedHtml = '';
                if (mentionedLosers.length > 0) {
                    detailedHtml += `<div class="mb-2"><p class="text-[9px] font-bold text-red-400 uppercase mb-0.5 opacity-80">Mất tiền:</p>` + 
                        mentionedLosers.map(d => `<div class="flex justify-between text-[11px] leading-relaxed"><span>${d.name}</span><span class="text-red-500">-${Math.abs(d.amount).toLocaleString()}</span></div>`).join('') + `</div>`;
                }
                if (mentionedWinners.length > 0) {
                    detailedHtml += `<div class="mb-2"><p class="text-[9px] font-bold text-yellow-400 uppercase mb-0.5 opacity-80">Nhận tiền:</p>` + 
                        mentionedWinners.map(d => `<div class="flex justify-between text-[11px] leading-relaxed"><span>${d.name}</span><span class="text-yellow-400">+${Math.abs(d.amount).toLocaleString()}</span></div>`).join('') + `</div>`;
                }
                if (remainingGroup.length > 0) {
                    const amt = remainingGroup[0].amount;
                    detailedHtml += `<div class="pt-1.5 border-t border-amber-500/10 mt-1.5"><p class="text-[9px] font-bold text-white uppercase mb-0.5 opacity-40">Ôm bàn (${amt >= 0 ? '+' : ''}${amt.toLocaleString()}):</p>` + 
                        `<div class="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-amber-50/60 uppercase font-medium">` + 
                        remainingGroup.map(d => `<span>${d.name}</span>`).join('<span class="opacity-20">•</span>') + `</div></div>`;
                }
                if (bonusEntries.length > 0) {
                    detailedHtml += `<div class="mt-2 pt-2 border-t border-amber-500/10"><p class="text-[9px] font-bold text-tet-gold uppercase mb-1">Bonus / Phạt:</p>` + 
                        bonusEntries.map(b => `<div class="flex justify-between text-[11px] leading-relaxed text-amber-200/50"><span>${b.name}</span><span>${b.amount > 0 ? '+' : ''}${b.amount.toLocaleString()}</span></div>`).join('') + `</div>`;
                }

                return `
                <div class="history-card rounded-3xl p-6 relative shadow-lg group">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3">
                            <!-- Selection Checkbox -->
                            <label class="relative flex items-center cursor-pointer">
                                <input type="checkbox" onchange="toggleCardDeleteBtn(${h.id}, this.checked)" class="sr-only peer">
                                <div class="w-4 h-4 rounded-md border border-amber-500/30 bg-red-950/40 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-all flex items-center justify-center">
                                    <i data-lucide="check" class="w-2.5 h-2.5 text-red-950 opacity-0 peer-checked:opacity-100"></i>
                                </div>
                            </label>
                            
                            <div class="flex items-center">
                                <div class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></div>
                                <span class="text-[10px] font-black text-amber-400 uppercase tracking-widest">Ván ${roundIndex}</span>
                                <span class="mx-2 text-white/20">/</span>
                                <span class="text-[10px] font-bold text-amber-100/40">${h.date}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 relative z-10">
                            <button onclick="toggleHistoryDetails(${h.id})" class="text-[9px] font-black text-amber-500/60 hover:text-amber-400 uppercase tracking-widest border border-amber-500/20 px-2 py-1 rounded-lg transition-all">Chi tiết</button>
                        </div>
                    </div>

                    <!-- Summary View -->
                    <div id="summary-${h.id}" class="grid grid-cols-2 gap-x-4 gap-y-1.5 pb-2">
                        ${sortedNet.map(([name, amt]) => `
                            <div class="flex justify-between text-[11px]">
                                <span class="text-amber-50/60">${name}</span>
                                <span class="font-bold ${amt > 0 ? 'text-yellow-400' : 'text-red-500'}">
                                    ${amt > 0 ? '+' : ''}${amt.toLocaleString()}
                                </span>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Detailed View -->
                    <div id="details-${h.id}" class="hidden mt-4 mb-4 space-y-1 bg-black/30 p-4 rounded-2xl border border-amber-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
                        ${detailedHtml}
                    </div>

                    <!-- Selected Action Bar (Discreet) -->
                    <div id="delete-action-${h.id}" class="hidden absolute bottom-3 right-4 animate-in fade-in zoom-in duration-200">
                        <button onclick="handleDeleteRound(${h.id})" 
                            class="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 px-3 py-1.5 rounded-xl transition-all shadow-xl">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            <span class="text-[9px] font-black uppercase tracking-tighter">Xóa ván</span>
                        </button>
                    </div>
                </div>
                `;
            }).join('');

            // Paging Controls
            if (totalPages > 1) {
                historyList.innerHTML += `
                    <div class="flex items-center justify-center gap-4 mt-8 pb-4">
                        <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''} 
                            class="w-10 h-10 flex items-center justify-center rounded-xl bg-red-950/40 border border-amber-500/10 text-amber-500 disabled:opacity-20 disabled:grayscale transition-all hover:bg-amber-500/10">
                            <i data-lucide="chevron-left" class="w-5 h-5"></i>
                        </button>
                        <span class="text-[10px] font-black text-amber-500/50 uppercase tracking-widest">${currentPage} / ${totalPages}</span>
                        <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''} 
                            class="w-10 h-10 flex items-center justify-center rounded-xl bg-red-950/40 border border-amber-500/10 text-amber-500 disabled:opacity-20 disabled:grayscale transition-all hover:bg-amber-500/10">
                            <i data-lucide="chevron-right" class="w-5 h-5"></i>
                        </button>
                    </div>
                `;
            }

            lucide.createIcons();
        } else {
            document.getElementById('history-section').classList.add('hidden');
        }
    }
}

window.toggleCardDeleteBtn = (id, isChecked) => {
    const btn = document.getElementById(`delete-action-${id}`);
    if (isChecked) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
};

window.toggleHistoryDetails = (id) => {
    const summary = document.getElementById(`summary-${id}`);
    const details = document.getElementById(`details-${id}`);
    const isHidden = details.classList.contains('hidden');
    
    if (isHidden) {
        details.classList.remove('hidden');
        summary.classList.add('opacity-30');
    } else {
        details.classList.add('hidden');
        summary.classList.remove('opacity-30');
    }
};

function renderSetupChips() {
    const chipContainer = document.getElementById('player-chips');
    chipContainer.innerHTML = setupPlayers.map((name, i) => `
        <div class="player-chip bg-amber-500/20 border border-amber-500/40 text-tet-light px-4 py-2 rounded-2xl flex items-center text-xs font-bold uppercase tracking-wider shadow-sm">
            ${name}
            <button onclick="removeSetupPlayer(${i})" class="ml-3 text-slate-100 hover:text-white transition-colors">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
    const startBtn = document.getElementById('start-game-btn');
    if (setupPlayers.length >= 2) startBtn.classList.remove('hidden');
    else startBtn.classList.add('hidden');
}

window.removeSetupPlayer = (index) => {
    setupPlayers.splice(index, 1);
    renderSetupChips();
};

window.handleDeleteRound = async (id) => {
    if (confirm('Dữ liệu ván này sẽ bị xóa và số tiền sẽ được hoàn lại. Xác nhận?')) {
        await sandbox_gamble_deleteRound(id);
        await updateUI();
    }
};

window.changePage = (delta) => {
    currentPage += delta;
    updateUI();
    document.getElementById('history-section').scrollIntoView({ behavior: 'smooth' });
};

// --- Event Listeners ---
document.getElementById('player-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val) {
            if (setupPlayers.some(p => p.toLowerCase() === val.toLowerCase())) {
                alert('Tên người chơi này đã tồn tại!');
                return;
            }
            setupPlayers.push(val);
            e.target.value = '';
            renderSetupChips();
        }
    }
});

document.getElementById('add-player-btn').addEventListener('click', () => {
    const el = document.getElementById('player-name-input');
    const val = el.value.trim();
    if (val) {
        if (setupPlayers.some(p => p.toLowerCase() === val.toLowerCase())) {
            alert('Tên người chơi này đã tồn tại!');
            return;
        }
        setupPlayers.push(val);
        el.value = '';
        renderSetupChips();
    }
});

document.getElementById('start-game-btn').addEventListener('click', async () => {
    if (setupPlayers.length < 2) return;
    const tx = db.transaction(STORE_PLAYERS, 'readwrite');
    const store = tx.objectStore(STORE_PLAYERS);
    for (const name of setupPlayers) {
        store.put({ name, balance: 0 });
    }
    await new Promise(r => tx.oncomplete = r);
    await updateUI();
});

// Voice context specific listeners
document.getElementById('voice-lose-btn').addEventListener('click', function() { startRecording(this); });
document.getElementById('voice-win-btn').addEventListener('click', function() { startRecording(this); });

// Tab switching logic
let currentMode = 'basic';
document.getElementById('tab-mode-basic').addEventListener('click', () => {
    currentMode = 'basic';
    document.getElementById('mode-basic-content').classList.remove('hidden');
    document.getElementById('mode-advanced-content').classList.add('hidden');
    document.getElementById('instr-voice').classList.remove('hidden');
    document.getElementById('instr-input').classList.add('hidden');
    document.getElementById('tab-mode-basic').className = 'flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl bg-amber-500 text-red-950 transition-all shadow-lg';
    document.getElementById('tab-mode-advanced').className = 'flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-amber-500/40 hover:text-amber-500 transition-all';
    
    // Switch Icon to Mic
    const icon = document.getElementById('game-mode-icon');
    icon.setAttribute('data-lucide', 'mic-2');
    lucide.createIcons();
});
document.getElementById('tab-mode-advanced').addEventListener('click', () => {
    currentMode = 'advanced';
    document.getElementById('mode-basic-content').classList.add('hidden');
    document.getElementById('mode-advanced-content').classList.remove('hidden');
    document.getElementById('instr-voice').classList.add('hidden');
    document.getElementById('instr-input').classList.remove('hidden');
    document.getElementById('tab-mode-basic').className = 'flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl text-amber-500/40 hover:text-amber-500 transition-all';
    document.getElementById('tab-mode-advanced').className = 'flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl bg-amber-500 text-red-950 transition-all shadow-lg';
    
    // Switch Icon to Keyboard/Input
    const icon = document.getElementById('game-mode-icon');
    icon.setAttribute('data-lucide', 'keyboard');
    lucide.createIcons();
});

// Bonus dynamic rows
function addBonusRow(shouldUpdateUI = true) {
    const container = document.getElementById('bonus-rows');
    const rowId = Date.now() + Math.random(); // Added random to avoid collisions in same millisecond
    const row = document.createElement('div');
    row.className = 'flex gap-2 animate-in fade-in slide-in-from-left-2 duration-200';
    row.id = `bonus-row-${rowId}`;
    row.innerHTML = `
        <div class="flex-grow">
            <select class="bonus-player-select w-full bg-red-900/40 border border-amber-500/20 rounded-xl px-3 py-3 text-xs text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500/40 appearance-none cursor-pointer">
                <!-- Populated in updateUI -->
            </select>
        </div>
        <div class="w-24">
            <input type="number" class="bonus-amount-input w-full bg-red-900/40 border border-amber-500/20 rounded-xl px-3 py-3 text-xs text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500/40 placeholder:text-white/10" placeholder="+/- tiền">
        </div>
        <button onclick="document.getElementById('bonus-row-${rowId}').remove()" class="w-10 flex items-center justify-center text-red-500/40 hover:text-red-500">
            <i data-lucide="minus-circle" class="w-4 h-4"></i>
        </button>
    `;
    container.appendChild(row);
    lucide.createIcons();
    if (shouldUpdateUI) updateUI();
}

document.getElementById('add-bonus-row-btn').addEventListener('click', addBonusRow);

// Winners toggle listener
document.getElementById('win-toggle').addEventListener('change', function() {
    const input = document.getElementById('win-input');
    const voiceBtn = document.getElementById('voice-win-btn');
    input.disabled = !this.checked;
    voiceBtn.disabled = !this.checked;
});

// Bonus toggle listener
document.getElementById('bonus-toggle').addEventListener('change', function() {
    const container = document.getElementById('bonus-container');
    container.classList.toggle('hidden', !this.checked);
    if (this.checked && document.getElementById('bonus-rows').children.length === 0) {
        addBonusRow(); // First row
        addBonusRow(); // Second row (default 2 rows)
    }
});

document.getElementById('submit-round-btn').addEventListener('click', async () => {
    const loseInput = document.getElementById('lose-input');
    const winInput = document.getElementById('win-input');
    const loseVal = loseInput.value.trim();
    const winToggle = document.getElementById('win-toggle').checked;
    const winVal = winToggle ? winInput.value.trim() : '';
    const bonusToggle = document.getElementById('bonus-toggle').checked;
    
    // Collect Bonus Data
    const bonuses = [];
    if (bonusToggle) {
        document.querySelectorAll('#bonus-rows > div').forEach(row => {
            const name = row.querySelector('.bonus-player-select').value;
            const amt = parseInt(row.querySelector('.bonus-amount-input').value);
            if (name && !isNaN(amt)) {
                bonuses.push({ name, amount: amt });
            }
        });
    }

    if (currentMode === 'basic' && !loseVal && !winVal && bonuses.length === 0) return;
    if (currentMode === 'advanced' && bonuses.length === 0 && document.querySelectorAll('.player-structured-input').length === 0) return;
    
    try {
        const players = await sandbox_gamble_getPlayers();
        const sortedPlayers = [...players].sort((a,b) => b.name.length - a.name.length);
        
        const specified = [];
        let totalSpecifiedAmt = 0;
        const seenNames = new Set();

        const parseInput = (text, isWinInput) => {
            for (const player of sortedPlayers) {
                const escapedName = player.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedName})\\s+(-?\\d+)`, 'gi');
                let match;
                while ((match = regex.exec(text)) !== null) {
                    let amt = parseInt(match[2]);
                    const balanceShift = isWinInput ? -amt : amt;
                    specified.push({ name: player.name, amount: balanceShift });
                    totalSpecifiedAmt += balanceShift;
                    seenNames.add(player.name);
                }
            }
        };

        if (currentMode === 'basic') {
            parseInput(loseVal, false);
            if (winToggle) parseInput(winVal, true);
        } else {
            // Input mode: Numeric inputs from structured list
            document.querySelectorAll('.player-structured-input').forEach(input => {
                const name = input.getAttribute('data-player');
                const val = input.value.trim();
                if (val !== '') {
                    const amt = parseInt(val);
                    // Conversion: Positive Win (+50) -> subtracted amount -50 (p.balance -= -50 => +50)
                    // Match parseInput(winVal, true) logic: balanceShift = -amt
                    const balanceShift = -amt;
                    specified.push({ name, amount: balanceShift });
                    totalSpecifiedAmt += balanceShift;
                    seenNames.add(name);
                }
            });
        }

        if (specified.length === 0 && bonuses.length === 0) throw new Error('Không có thông tin ván bài!');
        
        const remaining = players.filter(p => !seenNames.has(p.name));
        const winPerRemaining = remaining.length > 0 ? Math.round(totalSpecifiedAmt / remaining.length) : 0;

        // Group all adjustments by player to avoid IDB race conditions
        const playerAdjustments = {};
        players.forEach(p => playerAdjustments[p.name] = 0);
        
        specified.forEach(s => playerAdjustments[s.name] -= s.amount);
        remaining.forEach(r => playerAdjustments[r.name] += winPerRemaining);
        bonuses.forEach(b => playerAdjustments[b.name] += b.amount);

        const tx = db.transaction([STORE_PLAYERS, STORE_HISTORY], 'readwrite');
        const pStore = tx.objectStore(STORE_PLAYERS);
        const hStore = tx.objectStore(STORE_HISTORY);

        // Apply consolidated adjustments
        for (const name in playerAdjustments) {
            const adj = playerAdjustments[name];
            if (adj === 0) continue;
            
            const req = pStore.get(name);
            req.onsuccess = () => {
                const p = req.result;
                if (p) {
                    p.balance += adj;
                    pStore.put(p);
                }
            };
        }

        const historyDetails = [
            ...specified.map(s => ({ name: s.name, amount: -s.amount, type: s.amount > 0 ? 'loser' : 'winner' })),
            ...remaining.map(r => ({ name: r.name, amount: winPerRemaining, type: 'remaining' }))
        ];

        hStore.put({
            id: Date.now(),
            raw_input: currentMode === 'basic' ? `${loseVal}${winVal ? ' | ' + winVal : ''}` : 'Bảng nhập liệu',
            details: historyDetails,
            bonus: bonuses,
            date: new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})
        });

        tx.oncomplete = async () => {
            const lastRoundContainer = document.getElementById('last-round-container');
            const lastRoundDetails = document.getElementById('last-round-details');
            lastRoundContainer.classList.remove('hidden');
            
            const mentionedLosers = historyDetails.filter(d => d.type === 'loser');
            const mentionedWinners = historyDetails.filter(d => d.type === 'winner');
            const remainingGroup = historyDetails.filter(d => d.type === 'remaining');

            let html = '';
            if (mentionedLosers.length > 0) {
                html += `<div class="mb-2"><p class="text-[10px] font-bold text-red-400 uppercase mb-1">Mất tiền:</p>` + 
                    mentionedLosers.map(d => `<div class="flex justify-between text-xs"><span>${d.name}</span><span class="text-red-500">-${Math.abs(d.amount).toLocaleString()}</span></div>`).join('') + `</div>`;
            }
            if (mentionedWinners.length > 0) {
                html += `<div class="mb-2"><p class="text-[10px] font-bold text-yellow-400 uppercase mb-1">Nhận tiền:</p>` + 
                    mentionedWinners.map(d => `<div class="flex justify-between text-xs"><span>${d.name}</span><span class="text-yellow-400">+${Math.abs(d.amount).toLocaleString()}</span></div>`).join('') + `</div>`;
            }
            if (remainingGroup.length > 0) {
                const amt = remainingGroup[0].amount;
                html += `<div class="pt-2 border-t border-white/5"><p class="text-[10px] font-bold opacity-50 uppercase mb-1">Ôm bàn (${amt >= 0 ? '+' : ''}${amt.toLocaleString()})</p>` + 
                    `<div class="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-amber-50/60 uppercase font-medium">` + 
                    remainingGroup.map(d => `<span>${d.name}</span>`).join('<span class="opacity-20">•</span>') + `</div></div>`;
            }
            
            if (bonuses.length > 0) {
                html += `<div class="mt-4 pt-3 border-t border-amber-500/20"><p class="text-[10px] font-bold text-tet-gold uppercase mb-1">Thưởng / Phạt Thêm:</p>` + 
                    bonuses.map(b => `<div class="flex justify-between text-xs font-medium text-amber-200/50"><span>${b.name}</span><span>${b.amount > 0 ? '+' : ''}${b.amount.toLocaleString()}</span></div>`).join('') + `</div>`;
            }

            lastRoundDetails.innerHTML = html;
            
            // Reset UI smoothly
            loseInput.value = '';
            winInput.value = '';
            document.querySelectorAll('.player-structured-input').forEach(i => i.value = '');
            document.getElementById('bonus-rows').innerHTML = '';
            
            // Re-render only necessary parts or call updateUI once
            addBonusRow(false); // Silent add
            addBonusRow(false); // Silent add
            
            document.getElementById('voice-review-hint').classList.add('hidden');
            await updateUI();
        };
    } catch (e) {
        alert(e.message);
    }
});

document.getElementById('show-summary-btn').addEventListener('click', openSummary);

document.getElementById('reset-btn').addEventListener('click', async () => {
    if (confirm('Xác nhận Reset? Toàn bộ dữ liệu sẽ bị xóa vĩnh viễn.')) {
        await sandbox_gamble_clearAll();
        setupPlayers = [];
        
        // Reset basic mode inputs
        document.getElementById('lose-input').value = '';
        document.getElementById('win-input').value = '';
        document.getElementById('win-input').disabled = true;
        document.getElementById('win-toggle').checked = false;
        document.getElementById('voice-win-btn').disabled = true;

        // Reset bonus state
        const bonusToggle = document.getElementById('bonus-toggle');
        bonusToggle.checked = false;
        document.getElementById('bonus-container').classList.add('hidden');
        document.getElementById('bonus-rows').innerHTML = '';

        // UI containers
        document.getElementById('last-round-container').classList.add('hidden');
        
        // Re-render
        await updateUI();
    }
});

window.addEventListener('load', async () => {
    await sandbox_gamble_initDB();
    await updateUI();
});
