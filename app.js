// ⚠️ ВСТАВЬТЕ ВАШИ API КЛЮЧИ ОТ ВОЗ
const API_CLIENT_ID = "YOUR_CLIENT_ID";
const API_CLIENT_SECRET = "YOUR_CLIENT_SECRET";

let currentLang = "ru";
let currentYear = "2026";
let currentToken = null;
let entitiesCache = new Map();

// DOM элементы
const yearSelect = document.getElementById("yearSelect");
const langSelect = document.getElementById("languageSelect");
const searchInput = document.getElementById("searchInput");
const contentArea = document.getElementById("contentArea");
const categoriesContainer = document.getElementById("categoriesContainer");
const pageTitle = document.getElementById("pageTitle");
const footerText = document.getElementById("footerText");

// Получение токена
async function getAccessToken() {
    if (currentToken) return currentToken;
    const tokenUrl = "https://icdapihome2-eme0b9bdf4fafkbg.northeurope-01.azurewebsites.net/icdapi/token";
    const credentials = btoa(`${API_CLIENT_ID}:${API_CLIENT_SECRET}`);
    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });
    if (!response.ok) throw new Error("Token error");
    const data = await response.json();
    currentToken = data.access_token;
    return currentToken;
}

// Запрос entity
async function fetchEntity(uri) {
    if (entitiesCache.has(uri)) return entitiesCache.get(uri);
    const token = await getAccessToken();
    const url = `https://id.who.int/icd/release/11/${currentYear}-01/mms/entity?uri=${encodeURIComponent(uri)}&useHtml=false&language=${currentLang}`;
    const resp = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    entitiesCache.set(uri, data);
    return data;
}

// Получить детей
async function fetchChildren(uri) {
    const token = await getAccessToken();
    const url = `https://id.who.int/icd/release/11/${currentYear}-01/mms/children?uri=${encodeURIComponent(uri)}&useHtml=false&language=${currentLang}`;
    const resp = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.destinationEntities || [];
}

// Обновить весь интерфейс (тексты, кнопки категорий, загрузить данные)
function updateUI() {
    const t = translations[currentLang];
    if (!t) return;
    pageTitle.textContent = t.pageTitle;
    searchInput.placeholder = t.searchPlaceholder;
    footerText.textContent = t.footer;
    
    // перерисовать кнопки категорий
    categoriesContainer.innerHTML = "";
    for (const [key, label] of Object.entries(t.categories)) {
        const btn = document.createElement("div");
        btn.className = "cat-btn";
        btn.textContent = label;
        btn.dataset.cat = key;
        btn.addEventListener("click", () => {
            document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            filterByCategory(key);
        });
        categoriesContainer.appendChild(btn);
    }
}

// Простая фильтрация карточек по категории (по заголовку)
function filterByCategory(catKey) {
    const t = translations[currentLang];
    const targetText = t.categories[catKey] || "";
    const cards = document.querySelectorAll(".card");
    let visible = false;
    cards.forEach(card => {
        const titleElem = card.querySelector(".title");
        const title = titleElem?.innerText || "";
        if (title.toLowerCase().includes(targetText.split(" ")[0].toLowerCase()) || 
            (catKey === "F0" && title.includes("органич"))) {
            card.style.display = "block";
            visible = true;
        } else {
            card.style.display = "none";
        }
    });
    if (!visible && cards.length === 0) loadMentalHealthRoot();
}

// Загрузка корня психиатрии
async function loadMentalHealthRoot() {
    contentArea.innerHTML = `<div class="loading">${translations[currentLang].loading}</div>`;
    try {
        const token = await getAccessToken();
        const rootUri = "http://id.who.int/icd/entity/1585113570";
        const children = await fetchChildren(rootUri);
        displayCards(children);
    } catch(e) {
        contentArea.innerHTML = `<div class="error">${translations[currentLang].error}</div>`;
        console.error(e);
    }
}

// Отображение карточек с подгрузкой детей при клике
async function displayCards(entities) {
    const t = translations[currentLang];
    if (!entities.length) {
        contentArea.innerHTML = `<div class="error">${t.noData}</div>`;
        return;
    }
    contentArea.innerHTML = "";
    for (const entity of entities) {
        const code = entity.title?.split(" ")[0] || entity.code || "—";
        const titleText = entity.title || entity.definition?.short || "—";
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.uri = entity.uri;
        card.innerHTML = `
            <div class="card-header">
                <span class="code">${code}</span>
                <span class="title">${titleText}</span>
                <span class="arrow">▼</span>
            </div>
            <div class="children"></div>
        `;
        const header = card.querySelector(".card-header");
        const childrenDiv = card.querySelector(".children");
        header.addEventListener("click", async () => {
            const isOpen = childrenDiv.classList.contains("open");
            if (!isOpen) {
                childrenDiv.innerHTML = `<div class="loading">${t.loading}</div>`;
                try {
                    const subChildren = await fetchChildren(entity.uri);
                    childrenDiv.innerHTML = "";
                    if (subChildren.length === 0) {
                        childrenDiv.innerHTML = `<div style="padding:0.5rem">${t.noChildren}</div>`;
                    } else {
                        for (const sub of subChildren) {
                            const subCode = sub.title?.split(" ")[0] || "—";
                            const subTitle = sub.title || "—";
                            const item = document.createElement("div");
                            item.className = "child-item";
                            item.innerHTML = `<div class="child-code">${subCode}</div><div class="child-title">${subTitle}</div>`;
                            childrenDiv.appendChild(item);
                        }
                    }
                } catch(e) {
                    childrenDiv.innerHTML = `<div class="error">${t.error}</div>`;
                }
            }
            childrenDiv.classList.toggle("open");
            const arrow = header.querySelector(".arrow");
            arrow.textContent = childrenDiv.classList.contains("open") ? "▲" : "▼";
        });
        contentArea.appendChild(card);
    }
}

// Поиск
async function performSearch(query) {
    if (!query.trim()) {
        loadMentalHealthRoot();
        return;
    }
    const t = translations[currentLang];
    contentArea.innerHTML = `<div class="loading">${t.loading}</div>`;
    try {
        const token = await getAccessToken();
        const url = `https://id.who.int/icd/release/11/${currentYear}-01/mms/search?q=${encodeURIComponent(query)}&language=${currentLang}&useHtml=false`;
        const resp = await fetch(url, {
            headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (!resp.ok) throw new Error("Search failed");
        const data = await resp.json();
        const results = data.destinationEntities || [];
        if (results.length === 0) {
            contentArea.innerHTML = `<div class="error">${t.noData}</div>`;
        } else {
            displayCards(results.slice(0, 30));
        }
    } catch(e) {
        contentArea.innerHTML = `<div class="error">${t.error}</div>`;
    }
}

// Сброс при смене языка/года
async function refresh() {
    entitiesCache.clear();
    currentToken = null;
    updateUI();
    await loadMentalHealthRoot();
}

// Обработчики событий
langSelect.addEventListener("change", (e) => {
    currentLang = e.target.value;
    refresh();
});
yearSelect.addEventListener("change", (e) => {
    currentYear = e.target.value;
    refresh();
});
searchInput.addEventListener("input", (e) => performSearch(e.target.value));

// Старт
if (API_CLIENT_ID === "YOUR_CLIENT_ID") {
    contentArea.innerHTML = `<div class="error">⚠️ Вставьте API ключи ВОЗ в файл app.js</div>`;
} else {
    refresh();
}