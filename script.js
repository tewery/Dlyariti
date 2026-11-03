// ============================================
// ARROW PUZZLE 2.0
// 100 LEVELS + SOLVER + SAVE SYSTEM
// ============================================

const SIZE = 8;
const TOTAL_LEVELS = 100;
const SAVE_KEY = "arrowPuzzleSave_v2";

const COLORS = [
    "#63e6ff",
    "#ffcf5c",
    "#ff7ba5",
    "#a78bfa",
    "#75f0b1",
    "#ff956b",
    "#f6e879",
    "#76a9ff"
];

const DIRECTIONS = ["right", "left", "up", "down"];

const SYMBOLS = {
    right: "→",
    left: "←",
    up: "↑",
    down: "↓"
};

const VECTORS = {
    right: { row: 0, col: 1 },
    left: { row: 0, col: -1 },
    down: { row: 1, col: 0 },
    up: { row: -1, col: 0 }
};

// ============================================
// HTML ELEMENTS
// ============================================

const board = document.getElementById("board");
const remainingEl = document.getElementById("remaining");
const movesEl = document.getElementById("moves");
const timerEl = document.getElementById("timer");
const message = document.getElementById("message");

const modal = document.getElementById("modal");
const levelSelect = document.getElementById("levelSelect");

// ============================================
// GAME STATE
// ============================================

let arrows = [];
let solution = [];

let currentLevel = 1;
let moves = 0;
let seconds = 0;

let busy = false;
let hintedId = null;
let timerInterval = null;
let gameFinished = false;

let saveData = loadSave();

// ============================================
// SAVE SYSTEM
// ============================================

function loadSave() {

    const defaultSave = {
        completed: [],
        records: {},
        currentLevel: 1
    };

    try {

        const saved = localStorage.getItem(SAVE_KEY);

        if (!saved) return defaultSave;

        const parsed = JSON.parse(saved);

        return {
            completed: Array.isArray(parsed.completed)
                ? parsed.completed.filter(
                    n => Number.isInteger(n) &&
                    n >= 1 &&
                    n <= TOTAL_LEVELS
                )
                : [],

            records:
                parsed.records &&
                typeof parsed.records === "object"
                    ? parsed.records
                    : {},

            currentLevel:
                Number.isInteger(parsed.currentLevel)
                    ? parsed.currentLevel
                    : 1
        };

    } catch (error) {

        console.error("Ошибка загрузки сохранения:", error);

        return defaultSave;
    }
}

function saveGame() {

    try {

        localStorage.setItem(
            SAVE_KEY,
            JSON.stringify(saveData)
        );

    } catch (error) {

        console.error("Не удалось сохранить прогресс:", error);

        message.textContent =
            "Не удалось сохранить прогресс в браузере";
    }
}

function getUnlockedLevel() {

    const maxCompleted = Math.max(
        0,
        ...saveData.completed
    );

    return Math.min(
        TOTAL_LEVELS,
        maxCompleted + 1
    );
}

function updateProgress() {

    const completed = saveData.completed.length;

    document.getElementById("progressText").textContent =
        `${completed} / ${TOTAL_LEVELS}`;

    document.getElementById("progressBar").style.width =
        `${completed / TOTAL_LEVELS * 100}%`;

    updateLevelSelector();
}

function updateLevelSelector() {

    const unlocked = getUnlockedLevel();

    levelSelect.innerHTML = "";

    for (let i = 1; i <= TOTAL_LEVELS; i++) {

        const option = document.createElement("option");

        option.value = i;

        const completed = saveData.completed.includes(i);

        option.textContent =
            `Уровень ${i} ${completed ? "✓" : ""}`;

        option.disabled = i > unlocked;

        levelSelect.appendChild(option);
    }

    levelSelect.value = currentLevel;
}

// ============================================
// SEEDED RANDOM GENERATOR
// ============================================

// Один и тот же номер уровня всегда даёт
// одинаковую головоломку.

function createRandom(seed) {

    let state = seed >>> 0;

    return function() {

        state += 0x6D2B79F5;

        let t = state;

        t = Math.imul(
            t ^ (t >>> 15),
            t | 1
        );

        t ^= t + Math.imul(
            t ^ (t >>> 7),
            t | 61
        );

        return (
            (t ^ (t >>> 14)) >>> 0
        ) / 4294967296;
    };
}

function randomInt(random, min, max) {

    return Math.floor(
        random() * (max - min + 1)
    ) + min;
}

// ============================================
// ARROW GEOMETRY
// ============================================

function getCells(arrow) {

    const cells = [];

    for (let i = 0; i < arrow.len; i++) {

        let row = arrow.row;
        let col = arrow.col;

        if (
            arrow.dir === "right" ||
            arrow.dir === "left"
        ) {
            col += i;
        } else {
            row += i;
        }

        cells.push({ row, col });
    }

    return cells;
}

function getHead(arrow) {

    switch (arrow.dir) {

        case "right":
            return {
                row: arrow.row,
                col: arrow.col + arrow.len - 1
            };

        case "left":
            return {
                row: arrow.row,
                col: arrow.col
            };

        case "down":
            return {
                row: arrow.row + arrow.len - 1,
                col: arrow.col
            };

        case "up":
            return {
                row: arrow.row,
                col: arrow.col
            };
    }
}

// ============================================
// BOARD VALIDATION
// ============================================

function validateBoard(state) {

    const occupied = new Set();
    const ids = new Set();

    for (const arrow of state) {

        if (ids.has(arrow.id)) {
            throw new Error("Повторяется ID стрелки");
        }

        ids.add(arrow.id);

        if (!VECTORS[arrow.dir]) {
            throw new Error("Неверное направление");
        }

        if (
            !Number.isInteger(arrow.len) ||
            arrow.len < 2
        ) {
            throw new Error("Неверная длина стрелки");
        }

        const cells = getCells(arrow);

        for (const cell of cells) {

            if (
                cell.row < 0 ||
                cell.row >= SIZE ||
                cell.col < 0 ||
                cell.col >= SIZE
            ) {
                throw new Error(
                    "Стрелка выходит за пределы поля"
                );
            }

            const key = `${cell.row},${cell.col}`;

            if (occupied.has(key)) {

                throw new Error(
                    "Стрелки пересекаются"
                );
            }

            occupied.add(key);
        }
    }

    return true;
}

// ============================================
// BUILD BLOCKER MASKS
// ============================================

function buildBlockerMasks(state) {

    const occupied = new Map();

    state.forEach((arrow, index) => {

        for (const cell of getCells(arrow)) {

            occupied.set(
                `${cell.row},${cell.col}`,
                index
            );
        }
    });

    const masks = [];

    state.forEach((arrow, index) => {

        let mask = 0;

        const head = getHead(arrow);
        const vector = VECTORS[arrow.dir];

        let row = head.row + vector.row;
        let col = head.col + vector.col;

        while (
            row >= 0 &&
            row < SIZE &&
            col >= 0 &&
            col < SIZE
        ) {

            const otherIndex = occupied.get(
                `${row},${col}`
            );

            if (
                otherIndex !== undefined &&
                otherIndex !== index
            ) {

                mask |= (1 << otherIndex);
            }

            row += vector.row;
            col += vector.col;
        }

        masks[index] = mask;
    });

    return masks;
}

// ============================================
// SOLVER
// ============================================

// Возвращает последовательность ID стрелок.
// Если решения нет, возвращает null.

function findSolution(state, nodeLimit = 50000) {

    const count = state.length;

    if (count === 0) {
        return [];
    }

    if (count > 30) {
        throw new Error(
            "Слишком много стрелок для битовой маски"
        );
    }

    const masks = buildBlockerMasks(state);

    const initialMask =
        (1 << count) - 1;

    const memo = new Map();

    let visited = 0;

    function search(activeMask) {

        if (activeMask === 0) {
            return [];
        }

        if (memo.has(activeMask)) {
            return memo.get(activeMask);
        }

        visited++;

        if (visited > nodeLimit) {
            return null;
        }

        // Сначала пробуем стрелки,
        // у которых меньше блокирующих соседей.

        const available = [];

        for (let i = 0; i < count; i++) {

            const active =
                (activeMask & (1 << i)) !== 0;

            if (!active) continue;

            const blocked =
                (masks[i] & activeMask) !== 0;

            if (!blocked) {
                available.push(i);
            }
        }

        for (const index of available) {

            const nextMask =
                activeMask & ~(1 << index);

            const result = search(nextMask);

            if (result !== null) {

                const answer = [
                    state[index].id,
                    ...result
                ];

                memo.set(activeMask, answer);

                return answer;
            }
        }

        memo.set(activeMask, null);

        return null;
    }

    const result = search(initialMask);

    if (result === null) {
        return null;
    }

    return result;
}

// ============================================
// DIFFICULTY
// ============================================

function getDifficulty(level) {

    const tier = Math.floor((level - 1) / 5);

    if (tier <= 0) return "Обучение";
    if (tier <= 1) return "Лёгкая";
    if (tier <= 3) return "Средняя";
    if (tier <= 7) return "Сложная";
    if (tier <= 11) return "Очень сложная";

    return "Эксперт";
}

function getTargetArrowCount(level) {

    return Math.min(
        16,
        4 + Math.floor((level - 1) / 5)
    );
}

// ============================================
// GENERATE RANDOM CANDIDATE
// ============================================

function makeCandidate(count, random) {

    const result = [];
    const occupied = new Set();

    for (let i = 0; i < count; i++) {

        let placed = false;

        for (let attempt = 0; attempt < 400; attempt++) {

            const dir = DIRECTIONS[
                randomInt(random, 0, 3)
            ];

            const len = randomInt(random, 2, 3);

            const vertical =
                dir === "up" ||
                dir === "down";

            const row = randomInt(
                random,
                0,
                vertical ? SIZE - len : SIZE - 1
            );

            const col = randomInt(
                random,
                0,
                vertical ? SIZE - 1 : SIZE - len
            );

            const arrow = {
                id: i + 1,
                row,
                col,
                len,
                dir
            };

            const cells = getCells(arrow);

            const overlaps = cells.some(cell =>
                occupied.has(`${cell.row},${cell.col}`)
            );

            if (overlaps) continue;

            cells.forEach(cell => {
                occupied.add(`${cell.row},${cell.col}`);
            });

            result.push(arrow);

            placed = true;

            break;
        }

        if (!placed) {
            return null;
        }
    }

    return result;
}

// ============================================
// GENERATE LEVEL
// ============================================

function generateLevel(level) {

    const random = createRandom(
        928371 + level * 7919
    );

    let targetCount = getTargetArrowCount(level);

    while (targetCount >= 4) {

        let bestCandidate = null;
        let bestSolution = null;
        let bestScore = -Infinity;

        for (let attempt = 0; attempt < 24; attempt++) {

            const candidate = makeCandidate(
                targetCount,
                random
            );

            if (!candidate) continue;

            try {
                validateBoard(candidate);
            } catch {
                continue;
            }

            const solution = findSolution(
                candidate,
                50000
            );

            // Невозможные или слишком сложные
            // для проверки варианты не принимаем.

            if (solution === null) continue;

            const masks = buildBlockerMasks(candidate);

            const initialMask =
                (1 << candidate.length) - 1;

            let blockedCount = 0;
            let totalDependencies = 0;

            masks.forEach(mask => {

                const activeBlockers =
                    mask & initialMask;

                if (activeBlockers !== 0) {
                    blockedCount++;
                }

                let value = activeBlockers;

                while (value !== 0) {
                    totalDependencies++;
                    value &= value - 1;
                }
            });

            // Чем больше зависимостей,
            // тем интереснее головоломка.

            const score =
                blockedCount * 100 +
                totalDependencies * 3 +
                random();

            if (score > bestScore) {

                bestScore = score;
                bestCandidate = candidate;
                bestSolution = solution;
            }
        }

        if (bestCandidate) {

            return {
                arrows: bestCandidate,
                solution: bestSolution,
                difficulty: getDifficulty(level)
            };
        }

        // Если сложный вариант не удалось
        // сгенерировать, пробуем проще.

        targetCount--;
    }

    // Аварийный безопасный уровень.

    const fallback = [
        { id: 1, row: 0, col: 0, len: 2, dir: "right" },
        { id: 2, row: 2, col: 0, len: 2, dir: "right" },
        { id: 3, row: 4, col: 0, len: 2, dir: "right" },
        { id: 4, row: 6, col: 0, len: 2, dir: "right" }
    ];

    return {
        arrows: fallback,
        solution: findSolution(fallback),
        difficulty: "Лёгкая"
    };
}

// ============================================
// LOAD LEVEL
// ============================================

function startGame(levelNumber) {

    if (
        levelNumber < 1 ||
        levelNumber > TOTAL_LEVELS ||
        levelNumber > getUnlockedLevel()
    ) {
        return;
    }

    clearInterval(timerInterval);

    currentLevel = levelNumber;

    busy = false;
    gameFinished = false;
    hintedId = null;

    moves = 0;
    seconds = 0;

    const generated = generateLevel(currentLevel);

    arrows = generated.arrows.map((arrow, index) => ({
        ...arrow,
        color: COLORS[index % COLORS.length],
        removed: false
    }));

    solution = generated.solution;

    validateBoard(arrows);

    if (
        solution === null ||
        solution.length !== arrows.length
    ) {
        throw new Error(
            "Генератор создал некорректный уровень"
        );
    }

    console.log(
        `Уровень ${currentLevel}`,
        "Стрелок:",
        arrows.length,
        "Решение:",
        solution
    );

    document.getElementById("level").textContent =
        currentLevel;

    document.getElementById("difficulty").textContent =
        generated.difficulty;

    movesEl.textContent = "0";
    timerEl.textContent = "00:00";

    message.textContent =
        "Найди стрелку со свободным путём";

    modal.classList.add("hidden");

    saveData.currentLevel = currentLevel;
    saveGame();

    updateProgress();
    updateRecords();
    renderBoard();

    startTimer();
}

// ============================================
// RENDER BOARD
// ============================================

function renderBoard() {

    board.innerHTML = "";

    arrows.forEach(arrow => {

        if (arrow.removed) return;

        const button = document.createElement("button");

        button.className = "arrow";

        button.textContent = SYMBOLS[arrow.dir];

        button.style.setProperty(
            "--arrow-color",
            arrow.color
        );

        if (
            arrow.dir === "right" ||
            arrow.dir === "left"
        ) {

            button.style.gridRow = arrow.row + 1;

            button.style.gridColumn =
                `${arrow.col + 1} / span ${arrow.len}`;

        } else {

            button.style.gridColumn = arrow.col + 1;

            button.style.gridRow =
                `${arrow.row + 1} / span ${arrow.len}`;

        }

        if (arrow.id === hintedId) {
            button.classList.add("hinted");
        }

        button.addEventListener("click", () => {
            removeArrow(arrow, button);
        });

        board.appendChild(button);
    });

    remainingEl.textContent =
        arrows.filter(a => !a.removed).length;
}

// ============================================
// CHECK BLOCKER
// ============================================

function getBlocker(arrow) {

    const head = getHead(arrow);
    const vector = VECTORS[arrow.dir];

    let row = head.row + vector.row;
    let col = head.col + vector.col;

    while (
        row >= 0 &&
        row < SIZE &&
        col >= 0 &&
        col < SIZE
    ) {

        const blocker = arrows.find(other => {

            if (
                other.removed ||
                other.id === arrow.id
            ) {
                return false;
            }

            return getCells(other).some(cell =>
                cell.row === row &&
                cell.col === col
            );
        });

        if (blocker) return blocker;

        row += vector.row;
        col += vector.col;
    }

    return null;
}

// ============================================
// REMOVE ARROW
// ============================================

function removeArrow(arrow, element) {

    if (
        busy ||
        gameFinished ||
        arrow.removed
    ) {
        return;
    }

    moves++;

    movesEl.textContent = moves;

    const blocker = getBlocker(arrow);

    if (blocker) {

        message.textContent =
            `🚫 Путь перекрыт стрелкой №${blocker.id}`;

        element.classList.add("blocked");

        setTimeout(() => {
            element.classList.remove("blocked");
        }, 350);

        return;
    }

    busy = true;
    hintedId = null;

    message.textContent =
        "Отлично! Стрелка свободна ✨";

    element.classList.add(
        "exiting",
        `exit-${arrow.dir}`
    );

    setTimeout(() => {

        arrow.removed = true;

        busy = false;

        renderBoard();

        if (arrows.every(a => a.removed)) {
            finishLevel();
        }

    }, 450);
}

// ============================================
// HINT
// ============================================

document.getElementById("hint").addEventListener("click", () => {

    if (busy || gameFinished) return;

    const nextId = solution.find(id => {

        return arrows.some(a =>
            a.id === id && !a.removed
        );

    });

    const nextArrow = arrows.find(a =>
        a.id === nextId && !a.removed
    );

    if (!nextArrow) return;

    hintedId = nextArrow.id;

    message.textContent =
        "💡 Попробуй убрать подсвеченную стрелку";

    renderBoard();
});

// ============================================
// TIMER
// ============================================

function startTimer() {

    clearInterval(timerInterval);

    timerInterval = setInterval(() => {

        if (busy || gameFinished) return;

        seconds++;

        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;

        timerEl.textContent =
            String(min).padStart(2, "0") +
            ":" +
            String(sec).padStart(2, "0");

    }, 1000);
}

// ============================================
// RECORDS
// ============================================

function updateRecords() {

    const record = saveData.records[currentLevel];

    document.getElementById("bestTime").textContent =
        record
            ? formatTime(record.bestTime)
            : "—";

    document.getElementById("bestMoves").textContent =
        record
            ? record.bestMoves
            : "—";
}

function formatTime(value) {

    const min = Math.floor(value / 60);
    const sec = value % 60;

    return (
        String(min).padStart(2, "0") +
        ":" +
        String(sec).padStart(2, "0")
    );
}

// ============================================
// CALCULATE STARS
// ============================================

function calculateStars() {

    const count = arrows.length;

    if (moves <= count + 2) return 3;

    if (moves <= count * 1.5) return 2;

    return 1;
}

// ============================================
// COMPLETE LEVEL
// ============================================

function finishLevel() {

    if (gameFinished) return;

    gameFinished = true;

    clearInterval(timerInterval);

    const stars = calculateStars();

    if (!saveData.completed.includes(currentLevel)) {

        saveData.completed.push(currentLevel);

        saveData.completed.sort((a, b) => a - b);
    }

    const previous =
        saveData.records[currentLevel] || {
            bestTime: Infinity,
            bestMoves: Infinity,
            stars: 0
        };

    saveData.records[currentLevel] = {

        bestTime: Math.min(
            previous.bestTime,
            seconds
        ),

        bestMoves: Math.min(
            previous.bestMoves,
            moves
        ),

        stars: Math.max(
            previous.stars,
            stars
        )
    };

    saveGame();

    updateProgress();
    updateRecords();

    document.getElementById("stars").textContent =
        "★".repeat(stars) +
        "☆".repeat(3 - stars);

    document.getElementById("result").textContent =
        `Ходы: ${moves} · Время: ${formatTime(seconds)}`;

    const nextButton =
        document.getElementById("nextLevel");

    if (currentLevel === TOTAL_LEVELS) {

        document.getElementById("winTitle").textContent =
            "Ты прошёл всю игру!";

        nextButton.textContent =
            "Все 100 уровней пройдены!";

        nextButton.disabled = true;

    } else {

        document.getElementById("winTitle").textContent =
            "Уровень пройден!";

        nextButton.textContent =
            "Следующий уровень →";

        nextButton.disabled = false;
    }

    modal.classList.remove("hidden");
}

// ============================================
// BUTTONS
// ============================================

document.getElementById("restart").addEventListener("click", () => {

    startGame(currentLevel);

});

document.getElementById("nextLevel").addEventListener("click", () => {

    if (currentLevel >= TOTAL_LEVELS) return;

    startGame(currentLevel + 1);

});

levelSelect.addEventListener("change", () => {

    const selected = Number(levelSelect.value);

    startGame(selected);

});

// ============================================
// INITIALIZATION
// ============================================

function initializeGame() {

    const savedLevel = saveData.currentLevel;

    const unlocked = getUnlockedLevel();

    currentLevel = Math.min(
        Math.max(1, savedLevel),
        unlocked
    );

    updateProgress();

    startGame(currentLevel);

}

initializeGame();