/**
 * Gamble Tracker - app.js
 */

const DB_NAME = 'GambleDB_v3';
const DB_VERSION = 1;
const STORE_PLAYERS = 'players';
const STORE_HISTORY = 'history';

let db;
let setupPlayers = [];

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
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'vi-VN';

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const inputEl = document.getElementById('round-input');
        inputEl.value = transcript;
        document.getElementById('voice-btn').classList.remove('recording');
        document.getElementById('voice-review-hint').classList.remove('hidden');
    };
    recognition.onerror = () => document.getElementById('voice-btn').classList.remove('recording');
    recognition.onend = () => document.getElementById('voice-btn').classList.remove('recording');
}

// --- Modal Controls ---
window.openSummary = async () => {
    const players = await sandbox_gamble_getPlayers();
    document.getElementById('modal-player-count').textContent = `${players.length} NGƯỜI`;
    
    // Sort players by balance (winners on top)
    const sorted = [...players].sort((a, b) => b.balance - a.balance);

    document.getElementById('modal-players-list').innerHTML = sorted.map(p => `
        <div class="bg-white/5 border border-white/5 rounded-2xl px-5 py-4 flex justify-between items-center">
            <span class="font-semibold text-slate-200">${p.name}</span>
            <span class="font-black ${p.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
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

        if (history.length > 0) {
            document.getElementById('history-section').classList.remove('hidden');
            const reversedHistory = [...history].reverse();
            historyList.innerHTML = reversedHistory.map((h, i) => {
                const roundIndex = history.length - i;
                
                // Group details to show summary style
                let detailsHtml = h.details.map(d => `
                    <div class="flex justify-between text-xs py-1 border-b border-amber-500/5 last:border-0">
                        <span class="text-amber-200/60 font-medium">${d.name}</span>
                        <span class="font-bold ${d.amount > 0 ? 'text-yellow-400' : 'text-red-400'}">
                            ${d.amount > 0 ? '+' : ''}${d.amount.toLocaleString()}
                        </span>
                    </div>
                `).join('');

                return `
                <div class="history-card rounded-3xl p-6 relative shadow-lg">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center">
                            <div class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></div>
                            <span class="text-[10px] font-black text-amber-400 uppercase tracking-widest">Ván ${roundIndex}</span>
                            <span class="mx-2 text-amber-900/40">/</span>
                            <span class="text-[10px] font-bold text-amber-200/40">${h.date}</span>
                        </div>
                        <button onclick="handleDeleteRound(${h.id})" class="text-amber-900/60 hover:text-red-500 transition-colors">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                    <!-- <div class="text-sm text-amber-50/80 font-medium mb-4 italic leading-relaxed">"${h.raw_input}"</div> -->
                    <div class="space-y-1 bg-black/20 p-4 rounded-2xl border border-amber-500/10">
                        ${detailsHtml}
                    </div>
                </div>
                `;
            }).join('');
            lucide.createIcons();
        } else {
            document.getElementById('history-section').classList.add('hidden');
        }
    }
}

function renderSetupChips() {
    const chipContainer = document.getElementById('player-chips');
    chipContainer.innerHTML = setupPlayers.map((name, i) => `
        <div class="player-chip bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-2xl flex items-center text-xs font-bold uppercase tracking-wider">
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

// --- Event Listeners ---
document.getElementById('player-name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val && !setupPlayers.includes(val)) {
            setupPlayers.push(val);
            e.target.value = '';
            renderSetupChips();
        }
    }
});

document.getElementById('add-player-btn').addEventListener('click', () => {
    const el = document.getElementById('player-name-input');
    const val = el.value.trim();
    if (val && !setupPlayers.includes(val)) {
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

document.getElementById('voice-btn').addEventListener('click', () => {
    if (recognition) {
        document.getElementById('voice-btn').classList.add('recording');
        recognition.start();
    } else alert('Trình duyệt không hỗ trợ Mic!');
});

document.getElementById('submit-round-btn').addEventListener('click', async () => {
    const input = document.getElementById('round-input').value.trim();
    if (!input) return;
    
    try {
        const players = await sandbox_gamble_getPlayers();
        const sortedPlayers = [...players].sort((a,b) => b.name.length - a.name.length);
        
        const losers = [];
        let totalLoss = 0;

        for (const player of sortedPlayers) {
            const escapedName = player.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedName})\\s+(\\d+)`, 'gi');
            let match;
            while ((match = regex.exec(input)) !== null) {
                const amt = parseInt(match[2]);
                losers.push({ name: player.name, amount: amt });
                totalLoss += amt;
            }
        }

        if (losers.length === 0) throw new Error('Không nhận diện được người thua!');
        
        const loserNames = losers.map(l => l.name);
        const winners = players.filter(p => !loserNames.includes(p.name));
        if (winners.length === 0) throw new Error('Cần ít nhất một người thắng!');

        const winPerPerson = Math.round(totalLoss / winners.length);

        const tx = db.transaction([STORE_PLAYERS, STORE_HISTORY], 'readwrite');
        const pStore = tx.objectStore(STORE_PLAYERS);
        const hStore = tx.objectStore(STORE_HISTORY);

        for (const loser of losers) {
            const req = pStore.get(loser.name);
            req.onsuccess = () => {
                const p = req.result;
                p.balance -= loser.amount;
                pStore.put(p);
            };
        }
        for (const winner of winners) {
            const req = pStore.get(winner.name);
            req.onsuccess = () => {
                const p = req.result;
                p.balance += winPerPerson;
                pStore.put(p);
            };
        }

        const details = [
            ...losers.map(l => ({ name: l.name, amount: -l.amount })),
            ...winners.map(w => ({ name: w.name, amount: winPerPerson }))
        ];

        hStore.put({
            id: Date.now(),
            raw_input: input,
            details: details,
            date: new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})
        });

        tx.oncomplete = async () => {
            const lastRoundContainer = document.getElementById('last-round-container');
            const lastRoundDetails = document.getElementById('last-round-details');
            lastRoundContainer.classList.remove('hidden');
            lastRoundDetails.innerHTML = details.map(d => `
                <div class="flex justify-between text-sm py-1 border-b border-white/5 last:border-0">
                    <span class="text-slate-400 font-medium">${d.name}</span>
                    <span class="font-bold ${d.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}">
                        ${d.amount > 0 ? '+' : ''}${d.amount.toLocaleString()}
                    </span>
                </div>
            `).join('');
            
            document.getElementById('round-input').value = '';
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
        document.getElementById('round-input').value = '';
        document.getElementById('last-round-container').classList.add('hidden');
        await updateUI();
    }
});

window.addEventListener('load', async () => {
    await sandbox_gamble_initDB();
    await updateUI();
});
