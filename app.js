/* ======================================================
   Garuto — Cuaderno de Campo Digital
   Application Logic & PHP/MySQL API Backend
   ====================================================== */

// ============================================================
// 1. API URL — Cambia si tu ruta es diferente
// ============================================================
const API_URL = 'api.php';

// ============================================================
// 2. AUTH — Managed via API
// ============================================================

// ============================================================
// 3. DataStore — PHP/MySQL API Client (async)
// ============================================================
class DataStore {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.queue = JSON.parse(localStorage.getItem('garuto_sync_queue') || '[]');
        
        // Auto-sync when online
        window.addEventListener('online', () => this.processQueue());
    }

    async _fetch(action, params = {}, body = null) {
        // If explicitly offline and action is mutative, queue it immediately
        const mutativeActions = ['add', 'borrar', 'uploadDoc', 'uploadPhoto', 'update'];
        if (!navigator.onLine && mutativeActions.includes(action)) {
            console.warn(`Modo Offline: Encolando acción ${action}`);
            this.queue.push({ action, params, body, timestamp: Date.now() });
            this._saveQueue();
            window.dispatchEvent(new CustomEvent('garuto-offline-queued', { 
                detail: { action, count: this.queue.length } 
            }));
            return { queued: true, message: 'Modo Offline: Operación guardada para sincronizar.' };
        }

        const url = new URL(this.apiUrl, window.location.href);
        url.searchParams.set('action', action);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }

        const options = { 
            method: (body || action === 'uploadDoc' || action === 'uploadPhoto') ? 'POST' : 'GET',
            credentials: 'include'
        };
        
        if (body instanceof FormData) {
            options.body = body;
        } else if (body) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        }

        try {
            const res = await fetch(url.toString(), options);
            
            // Handle HTTP errors (Server responded)
            if (!res.ok) {
                if (res.status === 401 && action !== 'login') {
                    window.dispatchEvent(new CustomEvent('garuto-unauthorized'));
                    throw new Error('Sesión expirada o no autorizada');
                }
                const errData = await res.json().catch(() => ({ error: `Error del servidor (${res.status})` }));
                const error = new Error(errData.error || `Error ${res.status}`);
                error.status = res.status;
                throw error;
            }

            return await res.json();
        } catch (err) {
            // If it's a REAL network failure (server unreachable, DNS, etc.) AND mutative, queue it
            const isNetworkError = err.name === 'TypeError' || err.message.includes('network') || err.message.includes('fetch');
            
            if (isNetworkError && mutativeActions.includes(action)) {
                console.warn(`Fallo de red detectado para ${action}. Encolando...`);
                this.queue.push({ action, params, body, timestamp: Date.now() });
                this._saveQueue();
                window.dispatchEvent(new CustomEvent('garuto-offline-queued', { 
                    detail: { action, count: this.queue.length } 
                }));
                return { queued: true, message: 'Fallo de conexión. Operación encolada.' };
            }
            
            // Re-throw server errors or auth errors so the UI can show them properly
            throw err;
        }
    }

    _saveQueue() {
        localStorage.setItem('garuto_sync_queue', JSON.stringify(this.queue));
    }

    async processQueue() {
        if (this.queue.length === 0 || !navigator.onLine) return;
        
        console.log(`Sincronizando ${this.queue.length} operaciones pendientes...`);
        window.dispatchEvent(new CustomEvent('garuto-sync-starting', { detail: { count: this.queue.length } }));

        const remaining = [];
        let successCount = 0;

        for (const item of this.queue) {
            try {
                // Re-ejecutar ignorando el check de offline interno (forzando fetch real)
                await this._realFetch(item.action, item.params, item.body);
                successCount++;
            } catch (err) {
                console.error('Error sincronizando item:', item, err);
                remaining.push(item);
            }
        }

        this.queue = remaining;
        this._saveQueue();

        window.dispatchEvent(new CustomEvent('garuto-sync-finished', { 
            detail: { success: successCount, remaining: this.queue.length } 
        }));
    }

    // Método privado para evitar el check de navigator.onLine en el processQueue
    async _realFetch(action, params = {}, body = null) {
        const url = new URL(this.apiUrl, window.location.href);
        url.searchParams.set('action', action);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        
        const options = { 
            method: (body || action === 'uploadDoc' || action === 'uploadPhoto') ? 'POST' : 'GET',
            credentials: 'include'
        };

        if (body instanceof FormData) {
            options.body = body;
        } else if (body) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        }

        const res = await fetch(url.toString(), options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // ---- CRUD Operations ----
    async getAll(collection) {
        // En getAll, si estamos offline, intentamos devolver una versión "stale" o vacía,
        // pero por ahora el ServiceWorker ya cachea los GETs.
        return this._fetch('getAll', { collection });
    }

    async getById(collection, id) {
        return this._fetch('getById', { collection, id });
    }

    async add(collection, item) {
        return this._fetch('add', { collection }, item);
    }

    async delete(collection, id) {
        return this._fetch('borrar', { collection, id });
    }

    async update(collection, id, item) {
        return this._fetch('update', { collection, id }, item);
    }

    // ---- Export ----
    async exportJSON() {
        const data = await this._fetch('export');
        return JSON.stringify(data, null, 2);
    }
}

// ============================================================
// 4. Datos del Planing Anual (Secano - Viso del Marqués)
// ============================================================
const PLANING_DATA = [
    {
        mes: 'Enero',
        icon: '❄️',
        tareas: [
            { t: 'Poda de formación o producción', i: '✂️' },
            { t: 'Tratamientos de invierno (Cobre)', i: '💊' },
            { t: 'Plantación de nuevos portainjertos', i: '🌱' }
        ],
        consejo: 'Época de reposo vegetativo. Ideal para podar y aplicar tratamientos cúpricos preventivos tras la poda para proteger los cortes.'
    },
    {
        mes: 'Febrero',
        icon: '🌧️',
        tareas: [
            { t: 'Finalizar podas pendientes', i: '✂️' },
            { t: 'Tratamientos de invierno', i: '💊' }
        ],
        consejo: 'Aprovecha para terminar las labores de poda antes de que empiece el movimiento de savia a finales de mes o principios de marzo.'
    },
    {
        mes: 'Marzo',
        icon: '🌱',
        tareas: [
            { t: 'Desborre y primeros brotes', i: '🌿' },
            { t: 'Laboreo superficial (cultivador)', i: '🚜' }
        ],
        consejo: 'Un pase ligero de cultivador ayuda a romper la capilaridad del suelo para evitar que la humedad del invierno se evapore. Cuidado con las heladas tardías.'
    },
    {
        mes: 'Abril',
        icon: '🌸',
        tareas: [
            { t: 'Floración y polinización', i: '🐝' },
            { t: 'Abonado foliar (Zinc, Boro)', i: '🧪' }
        ],
        consejo: 'Momento crítico para la polinización. Los tratamientos foliares con Zinc y Boro mejoran el cuajado del fruto. No aplicar insecticidas en floración.'
    },
    {
        mes: 'Mayo',
        icon: '☀️',
        tareas: [
            { t: 'Cuajado del fruto', i: '🌰' },
            { t: 'Vigilancia de plagas (Clytra)', i: '🐛' }
        ],
        consejo: 'Vigila la aparición de insectos como la Clytra que devoran brotes tiernos. El fruto está en plena fase de crecimiento.'
    },
    {
        mes: 'Junio',
        icon: '🌤️',
        tareas: [
            { t: 'Endurecimiento de cáscara', i: '🛡️' },
            { t: 'Poda en verde (quitar chupones)', i: '✂️' }
        ],
        consejo: 'Eliminar los chupones del tronco y centro del árbol favorece la aireación y evita que roben vigor al fruto. Vigilar chinches.'
    },
    {
        mes: 'Julio',
        icon: '🌡️',
        tareas: [
            { t: 'Llenado del grano', i: '💧' },
            { t: 'Vigilancia extrema de estrés hídrico', i: '🥵' }
        ],
        consejo: 'En secano, este es el mes más duro. Es el momento donde se decide si el pistacho estará lleno o vacío. Si dispones de cuba, un riego de apoyo puntual salva la cosecha.'
    },
    {
        mes: 'Agosto',
        icon: '🔥',
        tareas: [
            { t: 'Maduración final', i: '⏳' },
            { t: 'Preparación de terrenos y aperos', i: '🚜' }
        ],
        consejo: 'El árbol destina toda su energía a terminar de llenar y abrir el fruto. Prepara los paraguas, vibradores y mantos para la inminente recolección.'
    },
    {
        mes: 'Septiembre',
        icon: '🧺',
        tareas: [
            { t: 'Recolección (Según variedad)', i: '🚜' },
            { t: 'Despelletado y secado rápido', i: '♨️' }
        ],
        consejo: 'El fruto debe pelarse y secarse en menos de 24h desde su recolección para evitar manchas en la cáscara y evitar hongos (Aflatoxinas).'
    },
    {
        mes: 'Octubre',
        icon: '🍂',
        tareas: [
            { t: 'Abonado orgánico/mineral post-cosecha', i: '💩' },
            { t: 'Pases de grada profundos (si llueve)', i: '🚜' }
        ],
        consejo: 'El árbol necesita recuperar reservas. Un buen abonado al suelo ahora es vital para la fuerza de la brotación del año que viene.'
    },
    {
        mes: 'Noviembre',
        icon: '🌧️',
        tareas: [
            { t: 'Caída de hoja', i: '🍂' },
            { t: 'Tratamientos de otoño (Cobre)', i: '💊' }
        ],
        consejo: 'Al caer la hoja (50%), es recomendable aplicar cobre para cicatrizar las heridas de la hoja y los golpes de la recolección, previniendo Botryosphaeria.'
    },
    {
        mes: 'Diciembre',
        icon: '❄️',
        tareas: [
            { t: 'Análisis de suelos o foliares', i: '🧪' },
            { t: 'Mantenimiento de maquinaria', i: '🔧' }
        ],
        consejo: 'Descanso total del árbol. Tiempo perfecto para planificar abonados del año siguiente en base a análisis, y revisar toda la maquinaria agrícola.'
    }
];

// ============================================================
// 5. Application Controller
// ============================================================
class GarutoApp {
    constructor() {
        this.store = new DataStore(API_URL);
        this.currentUser = null;
        this.currentSection = 'dashboard';
        this.editingParcelaId = null;

        // Essential state objects
        this.charts = { costs: null, types: null };
        this.map = null;
        this.mapLayers = null;

        this._initAuth();
    }

    // New method to initialize the rest of the app ONLY after auth is confirmed
    _initAppCore() {
        if (this._appCoreInitialized) return;
        this._appCoreInitialized = true;

        this._initNavigation();
        this._initDashboardQuickActions();
        this._initForms();
        this._initRegistroQuickTools();
        this._initFilters();
        this._initMobile();
        this._initGallery();
        this._initWorkTimer();
        this._initDocs();
        this._initMaquinariaReparaciones();
        this._initPistachin();
        this._initUISounds();

        this._initMonthlyReminder();
        this._initConnectivity();
        this._initUnauthorizedHandler();
    }

    _initUnauthorizedHandler() {
        window.addEventListener('garuto-unauthorized', () => {
            if (this.currentUser) {
                this._toast('Tu sesión ha expirado', 'error');
                this._handleLogout();
            }
        });
    }

    // ---- Connectivity ----
    _initConnectivity() {
        let isFirstLoad = true;

        const updateUI = (showToast = true) => {
            const isOnline = navigator.onLine;
            const badge = document.getElementById('connection-badge');
            const badgeMini = document.getElementById('mobile-connection-badge');

            if (badge) {
                badge.className = `connection-badge ${isOnline ? 'online' : 'offline'}`;
                badge.querySelector('.label').textContent = isOnline ? 'Conectado' : 'Modo Offline';
            }
            if (badgeMini) {
                badgeMini.className = `connection-badge-mini ${isOnline ? 'online' : 'offline'}`;
            }

            if (!showToast) return;
            if (!isOnline) {
                this._toast('Has entrado en modo offline. Los cambios se guardarán localmente.', 'info');
            } else if (!isFirstLoad) {
                // Only show "connection restored" toast if we actually lost it before
                this._toast('✅ Conexión restaurada.', 'success');
            }
        };

        window.addEventListener('online', () => { isFirstLoad = false; updateUI(); });
        window.addEventListener('offline', () => { isFirstLoad = false; updateUI(); });
        
        // Custom events from DataStore
        window.addEventListener('garuto-offline-queued', (e) => {
            this._toast(`📶 Offline: ${e.detail.count} operaciones pendientes de sincronizar`, 'info');
        });

        window.addEventListener('garuto-sync-starting', (e) => {
             this._toast(`⚡ Sincronizando ${e.detail.count} cambios...`, 'info');
        });

        window.addEventListener('garuto-sync-finished', (e) => {
            if (e.detail.success > 0) {
                this._toast(`✅ Sincronización completada: ${e.detail.success} cambios subidos`, 'success');
                this._navigateTo(this.currentSection);
            }
        });

        // Init UI without toast on startup
        setTimeout(() => updateUI(false), 100);
    }

    _initAuth() {
        const loginForm = document.getElementById('login-form');
        const logoutBtn = document.getElementById('btn-logout');
        const logoutBtnMobile = document.getElementById('btn-logout-mobile');
        const logoutBtnDashboard = document.getElementById('btn-logout-dashboard');

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleLogin();
        });

        logoutBtn.addEventListener('click', () => this._handleLogout());
        if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', () => this._handleLogout());
        if (logoutBtnDashboard) logoutBtnDashboard.addEventListener('click', () => this._handleLogout());

        // Check backend session on init
        this._checkBackendSession();
    }

    async _checkBackendSession() {
        try {
            const res = await this.store._fetch('checkSession');
            if (res.authenticated) {
                this.currentUser = res.user;
                this._showApp();
            } else {
                this._handleLogout();
            }
        } catch (err) {
            console.error('Error checking session:', err);
            this._handleLogout();
        }
    }

    async _handleLogin() {
        const username = document.getElementById('login-user').value.trim();
        const password = document.getElementById('login-pass').value.trim();
        const errorEl = document.getElementById('login-error');
        const loginBtn = document.getElementById('login-btn');

        loginBtn.disabled = true;
        loginBtn.textContent = '⌛ Entrando...';

        try {
            const res = await this.store._fetch('login', {}, { username, password });
            if (res.success) {
                this.currentUser = res.user;
                errorEl.hidden = true;
                this._showApp();
            }
        } catch (err) {
            errorEl.hidden = false;
            // Show the actual error message from the server
            errorEl.innerHTML = `<span>⚠️</span> ${err.message}`;
            document.getElementById('login-pass').value = '';
            errorEl.style.animation = 'none';
            void errorEl.offsetHeight;
            errorEl.style.animation = '';
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
        }
    }

    async _handleLogout() {
        try {
            await this.store._fetch('logout');
        } catch (e) {}

        this.currentUser = null;

        const appEl = document.getElementById('app');
        appEl.hidden = true;
        appEl.style.display = ''; // Clear any inline style set by _showApp

        const loginScreen = document.getElementById('login-screen');
        loginScreen.hidden = false;
        loginScreen.style.display = ''; // Let CSS control

        document.getElementById('login-form').reset();
        document.getElementById('login-error').hidden = true;
    }

    _showApp() {
        // First, initialize the core logic and data fetching
        this._initAppCore();

        const loginScreen = document.getElementById('login-screen');
        const appScreen = document.getElementById('app');

        if (loginScreen) {
            loginScreen.hidden = true;
            loginScreen.style.display = ''; // Clear any inline style
        }
        if (appScreen) {
            appScreen.hidden = false;
            appScreen.style.display = ''; // Clear any inline style — this is the critical fix
        }

        const sidebarNameEl = document.getElementById('user-display-name-sidebar');
        const headerNameEl = document.getElementById('user-display-name-header');
        const mobileNameEl = document.getElementById('user-display-name-mobile');
        if (sidebarNameEl) sidebarNameEl.textContent = this.currentUser.displayName;
        if (headerNameEl) headerNameEl.textContent = this.currentUser.displayName;
        if (mobileNameEl) mobileNameEl.textContent = this.currentUser.displayName;
        if (document.getElementById('user-greeting-name')) document.getElementById('user-greeting-name').textContent = this.currentUser.displayName;
        this._navigateTo(this.currentSection);
        
        try {
            this._initMap(); // Initialize map once app is visible
        } catch (err) {
            console.error('Error al inicializar mapa:', err);
        }
    }

    // ---- Navigation ----
    _initNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this._navigateTo(section);
                this._closeMobileSidebar();
            });
        });
    }

    _initDashboardQuickActions() {
        const settingsBtn = document.getElementById('btn-settings-dashboard');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this._navigateTo('ajustes'));
        }
    }

    _initUISounds() {
        if (this._soundsInitialized) return;
        this._soundsInitialized = true;

        const clickableSelector = 'a, button, .nav-item, .btn, .btn-sidebar-secondary, .btn-sidebar-logout';
        document.addEventListener('click', (e) => {
            const target = e.target.closest(clickableSelector);
            if (!target) return;
            if (target.disabled) return;
            this._playClickSound();
        });
    }

    _playClickSound() {
        try {
            if (!this._audioContext) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                this._audioContext = new Ctx();
            }

            const ctx = this._audioContext;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(980, now);
            osc.frequency.exponentialRampToValueAtTime(640, now + 0.045);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.035, now + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.055);
        } catch (err) {
            // Ignore audio failures silently
        }
    }

    _navigateTo(sectionId) {
        this.currentSection = sectionId;

        // Limpiar estados activos
        document.querySelectorAll('.nav-item, .btn-sidebar-secondary').forEach(n => n.classList.remove('active'));
        
        // Activar item en el nav principal si existe
        const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
        if (navItem) navItem.classList.add('active');

        // Activar botón en el footer si existe (Ayuda/Configuración)
        const footerBtn = document.getElementById(`nav-${sectionId}-footer`);
        if (footerBtn) footerBtn.classList.add('active');

        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        const section = document.getElementById(`section-${sectionId}`);
        if (section) section.classList.add('active');

        this._refreshSection(sectionId);
    }

    _refreshSection(sectionId) {
        switch (sectionId) {
            case 'dashboard': 
                this._updateDashboardHeader();
                this._renderDashboard(); 
                break;
            case 'parcelas': this._renderParcelas(); break;
            case 'trabajos': this._renderTrabajos(); break;
            case 'registrar': this._populateRegistroSelects(); break;
            case 'almacen': this._renderAlmacen(); break;
            case 'maquinaria': this._renderMaquinaria(); break;
            case 'consultar':
                this._populateFilterSelects();
                this._renderRecords();
                break;
            case 'galeria':
                this._populateGalleryParcelas();
                break;
            case 'planing':
                this._initPlaning();
                break;
            case 'ajustes':
                // Settings no necesita cargar datos previos
                break;
        }
    }

    _updateDashboardHeader() {
        const dateEl = document.getElementById('dashboard-date');
        const nameEl = document.getElementById('user-greeting-name');
        const sidebarNameEl = document.getElementById('user-display-name-sidebar');
        const headerNameEl = document.getElementById('user-display-name-header');
        const mobileNameEl = document.getElementById('user-display-name-mobile');
        
        if (dateEl) {
            const now = new Date();
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            dateEl.textContent = `Resumen de Campo - ${now.toLocaleDateString('es-ES', options)}`;
        }
        
        const name = this.currentUser && this.currentUser.displayName ? this.currentUser.displayName : 'Agricultor';
        
        if (nameEl) nameEl.textContent = name;
        if (sidebarNameEl) sidebarNameEl.textContent = name;
        if (headerNameEl) headerNameEl.textContent = name;
        if (mobileNameEl) mobileNameEl.textContent = name;
        
        // Saludo dinámico según la hora
        const hour = new Date().getHours();
        const greetingBlock = document.querySelector('.greeting-text');
        if (greetingBlock) {
            let greet = "Buenos días";
            if (hour >= 13 && hour < 20) greet = "Buenas tardes";
            else if (hour >= 20 || hour < 5) greet = "Buenas noches";
            greetingBlock.innerHTML = `¡${greet}, <span id="user-greeting-name">${name}</span>!`;
        }
    }

    // ---- Mobile ----
    _initMobile() {
        const hamburger = document.getElementById('hamburger-btn');
        const overlay = document.getElementById('sidebar-overlay');

        hamburger.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
            overlay.classList.toggle('active');
        });

        overlay.addEventListener('click', () => this._closeMobileSidebar());
    }

    _closeMobileSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }

    // ---- Toast ----
    _toast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${message}`;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }

    // ===============================
    // DASHBOARD
    // ===============================
    async _renderDashboard() {
        try {
            const parcelas = await this.store.getAll('parcelas');
            const trabajos = await this.store.getAll('trabajos');
            const registros = await this.store.getAll('registros');

            // Stats
            const elP = document.getElementById('stat-parcelas');
            const elR = document.getElementById('stat-registros');
            if (elP) elP.textContent = parcelas.length;
            if (elR) elR.textContent = registros.length;

            // This month
            const now = new Date();
            const mesActual = now.getMonth();
            const anioActual = now.getFullYear();
            const esteMes = registros.filter(r => {
                const d = new Date(r.fecha);
                return d.getMonth() === mesActual && d.getFullYear() === anioActual;
            });
            document.getElementById('stat-mes').textContent = esteMes.length;

            // Recent Records
            const recentEl = document.getElementById('recent-records');
            const sorted = [...registros].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8);

            if (sorted.length === 0) {
                recentEl.innerHTML = '<p class="empty-msg">No hay registros todavía. ¡Registra tu primer trabajo!</p>';
            } else {
                recentEl.innerHTML = sorted.map(r => {
                    const trabajo = trabajos.find(t => t.id == r.trabajoId);
                    const parcela = parcelas.find(p => p.id == r.parcelaId);
                    return `
                        <div class="recent-item">
                            <span class="recent-item-icon">${trabajo ? trabajo.icono : '📋'}</span>
                            <div class="recent-item-info">
                                <span class="recent-item-title">${trabajo ? trabajo.nombre : 'Trabajo eliminado'}</span>
                                <span class="recent-item-sub">${parcela ? parcela.nombre : 'Parcela eliminada'}${r.notas ? ' — ' + r.notas : ''}</span>
                            </div>
                            <span class="recent-item-date">${this._formatDate(r.fecha)}</span>
                        </div>
                    `;
                }).join('');
            }

            // Economic Balance (Current Year)
            const currentYear = new Date().getFullYear();
            const yearRecords = registros.filter(r => new Date(r.fecha).getFullYear() === currentYear);
            
            // Sumar también gastos de reparación de maquinaria
            let repairCosts = 0;
            try {
                const allRepairs = await this.store.getAll('maquinaria_reparaciones');
                repairCosts = allRepairs
                    .filter(r => new Date(r.fecha).getFullYear() === currentYear)
                    .reduce((sum, r) => sum + (parseFloat(r.coste) || 0), 0);
            } catch (e) {
                console.warn("No se pudieron cargar reparaciones para el balance:", e);
            }

            const totalBalance = yearRecords.reduce((sum, r) => sum + (parseFloat(r.coste) || 0), 0) + repairCosts;
            
            const moneyEl = document.getElementById('stat-money');
            if (totalBalance > 0) {
                moneyEl.textContent = `-${totalBalance.toFixed(2)} €`;
                moneyEl.style.color = '#ef5350'; // Red for expenses
            } else if (totalBalance < 0) {
                moneyEl.textContent = `+${Math.abs(totalBalance).toFixed(2)} €`;
                moneyEl.style.color = '#a3d65e'; // Green for income
            } else {
                moneyEl.textContent = '0.00 €';
                moneyEl.style.color = 'var(--text-accent)';
            }

            this._renderDashboardKPIs(parcelas, yearRecords, totalBalance);

            // Render Charts
            this._renderCharts(registros, trabajos);

            // Fetch Weather
            this._fetchWeather();

        } catch (err) {
            console.error('Error cargando dashboard:', err);
            this._toast('Error al conectar con el servidor', 'error');
        }
    }

    _renderDashboardKPIs(parcelas, yearRecords, totalBalance) {
        const totalHa = parcelas.reduce((sum, p) => sum + (parseFloat(p.superficie) || 0), 0);
        const totalHours = yearRecords.reduce((sum, r) => sum + (parseFloat(r.duracion_horas) || 0), 0);
        const totalKg = yearRecords.reduce((sum, r) => sum + (parseFloat(r.kg_recolectados) || 0), 0);

        const safePerHa = (value) => totalHa > 0 ? value / totalHa : null;
        const costPerTask = yearRecords.length > 0 ? totalBalance / yearRecords.length : null;
        const balancePerHa = safePerHa(totalBalance);
        const hoursPerHa = safePerHa(totalHours);
        const kgPerHa = safePerHa(totalKg);

        const setKpi = (id, value, formatter) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = value === null ? '--' : formatter(value);
        };

        setKpi('kpi-balance-ha', balancePerHa, (v) => `${v > 0 ? '-' : '+'}${Math.abs(v).toFixed(2)} €/ha`);
        setKpi('kpi-coste-labor', costPerTask, (v) => `${v > 0 ? '-' : '+'}${Math.abs(v).toFixed(2)} €`);
        setKpi('kpi-horas-ha', hoursPerHa, (v) => `${v.toFixed(2)} h/ha`);
        setKpi('kpi-kg-ha', kgPerHa, (v) => `${v.toFixed(1)} kg/ha`);
    }

    _renderCharts(registros, trabajos) {
        if (typeof Chart === 'undefined' || !this.charts) return;

        const currentYear = new Date().getFullYear();
        const yearRecords = registros.filter(r => new Date(r.fecha).getFullYear() === currentYear);

        // 1. Chart Costs (By Month)
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const monthlyCosts = new Array(12).fill(0);
        
        yearRecords.forEach(r => {
            const m = new Date(r.fecha).getMonth();
            monthlyCosts[m] += parseFloat(r.coste) || 0;
        });

        const ctxCosts = document.getElementById('chart-costs').getContext('2d');
        if (this.charts.costs) this.charts.costs.destroy();
        
        const gradient = ctxCosts.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(163, 214, 94, 0.4)');
        gradient.addColorStop(1, 'rgba(163, 214, 94, 0.0)');

        this.charts.costs = new Chart(ctxCosts, {
            type: 'line', // Line chart like the mockup
            data: {
                labels: monthNames,
                datasets: [{
                    label: 'Gastos (€)',
                    data: monthlyCosts,
                    fill: true,
                    backgroundColor: gradient,
                    borderColor: '#a3d65e',
                    borderWidth: 3,
                    tension: 0.4, // Smooth curve
                    pointRadius: 4,
                    pointBackgroundColor: '#a3d65e',
                    pointBorderColor: 'rgba(255,255,255,0.5)',
                    pointBorderWidth: 2,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(20, 30, 15, 0.9)',
                        titleColor: '#a3d65e',
                        bodyColor: '#fff',
                        padding: 12,
                        cornerRadius: 10,
                        displayColors: false
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(255,255,255,0.03)' }, 
                        ticks: { color: '#666', font: { size: 10 } } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#666', font: { size: 10 } } 
                    }
                }
            }
        });

        // 2. Chart Types (Doughnut)
        const typeCounts = {};
        trabajos.forEach(t => { typeCounts[t.id] = { label: t.nombre, count: 0 }; });
        registros.forEach(r => {
            if (typeCounts[r.trabajoId]) typeCounts[r.trabajoId].count++;
        });

        const filteredTypes = Object.values(typeCounts).filter(t => t.count > 0);
        const ctxTypes = document.getElementById('chart-types').getContext('2d');
        if (this.charts.types) this.charts.types.destroy();
        this.charts.types = new Chart(ctxTypes, {
            type: 'doughnut',
            data: {
                labels: filteredTypes.map(t => t.label),
                datasets: [{
                    data: filteredTypes.map(t => t.count),
                    backgroundColor: [
                        '#a3d65e', '#ffb74d', '#4db6ac', '#81c784', '#64b5f6', 
                        '#e57373', '#ba68c8', '#90a4ae', '#ffd54f'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#888', padding: 20, usePointStyle: true, font: { size: 10 } }
                    }
                },
                cutout: '70%'
            }
        });
    }

    // ===============================
    // WEATHER METEOROLOGÍA
    // ===============================
    async _fetchWeather() {
        const weatherEl = document.getElementById('weather-status');
        if (!weatherEl) return;
        
        try {
            // Coordenadas de Viso del Marqués (Aprox: 38.52, -3.73)
            const LAT = 38.52;
            const LON = -3.73;
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FMadrid`;
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error al obtener el clima');
            
            const data = await res.json();
            const current = data.current;
            
            // Actualizar UI
            document.getElementById('weather-status').textContent = 'Actualizado ahora';
            document.getElementById('weather-temp').textContent = Math.round(current.temperature_2m);
            document.getElementById('weather-wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
            document.getElementById('weather-humidity').textContent = `${current.relative_humidity_2m}%`;
            
            // Probabilidad de lluvia (próxima hora)
            const rainProb = data.hourly.precipitation_probability[0];
            document.getElementById('weather-rain').textContent = `${rainProb}%`;
            
            // Elegir icono
            const iconEl = document.getElementById('weather-icon');
            const svgRain = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M16 14v6"></path><path d="M8 14v6"></path><path d="M12 16v6"></path></svg>`;
            const svgSun = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
            const svgCloudSun = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="M20 12h2"></path><path d="m19.07 4.93-1.41 1.41"></path><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"></path><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"></path></svg>`;
            
            if (current.precipitation > 0) iconEl.innerHTML = svgRain;
            else if (current.temperature_2m > 30) iconEl.innerHTML = svgSun;
            else iconEl.innerHTML = svgCloudSun;
            
            // Generar consejo agronómico basado en clima
            this._generateWeatherAdvice(current, rainProb);
            
            // Generar previsión a 7 días
            const daily = data.daily;
            const weekContainer = document.getElementById('weather-week-forecast');
            if (weekContainer && daily) {
                let weekHTML = '';
                const daysName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                
                for(let i=0; i<7; i++) {
                    const dateArr = daily.time[i].split('-'); // YYYY-MM-DD
                    const dateObj = new Date(dateArr[0], dateArr[1]-1, dateArr[2]);
                    const dayName = i === 0 ? 'Hoy' : daysName[dateObj.getDay()];
                    const icon = this._getWeatherIcon(daily.weather_code[i]);
                    const max = Math.round(daily.temperature_2m_max[i]);
                    const min = Math.round(daily.temperature_2m_min[i]);
                    
                    weekHTML += `
                        <div class="forecast-day">
                            <span class="forecast-dayname">${dayName}</span>
                            <span class="forecast-icon">${icon}</span>
                            <div class="forecast-temps">
                                <span class="forecast-max">${max}°</span>
                                <span class="forecast-min">${min}°</span>
                            </div>
                        </div>
                    `;
                }
                weekContainer.innerHTML = weekHTML;
            }
            
        } catch (err) {
            console.error('Error meteo:', err);
            document.getElementById('weather-status').textContent = 'Error de conexión';
        }
    }

    _generateWeatherAdvice(current, rainProb) {
        const adviceEl = document.getElementById('weather-advice');
        let advice = '';
        let type = 'info'; // info, warning, danger
        
        if (current.wind_speed_10m > 20) {
            advice = '🌬️ Viento fuerte. Evitar tratamientos foliares o herbicidas hoy por riesgo de deriva.';
            type = 'warning';
        } else if (rainProb > 40) {
            advice = '🌧️ Alta probabilidad de lluvia. Buen momento para asegurar la humedad del suelo tras abonar, pero suspenda tratamientos foliares.';
            type = 'info';
        } else if (current.relative_humidity_2m > 85 && current.temperature_2m > 15) {
            advice = '🍄 Humedad alta y calor. Alto riesgo de presión fúngica (Botryosphaeria/Alternaria). Vigile la plantación.';
            type = 'warning';
        } else if (current.temperature_2m > 35) {
            advice = '🔥 Calor extremo. El árbol puede sufrir estrés térmico severo y cerrar estomas. Riegos de apoyo nocturnos recomendados.';
            type = 'danger';
        } else if (current.temperature_2m < 2 && current.temperature_2m > -1) {
            advice = '❄️ Riesgo de heladas. Atención al estado fenológico si está en floración o brotación.';
            type = 'warning';
        } else {
            advice = '✅ Condiciones estables. Buen momento para labores agrícolas en secano.';
            type = 'info';
        }
        
        adviceEl.innerHTML = `<div class="advice-box advice-${type}">${advice}</div>`;
    }
    
    _getWeatherIcon(code) {
        const sun = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        const cloudSun = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="M20 12h2"></path><path d="m19.07 4.93-1.41 1.41"></path><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"></path><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"></path></svg>`;
        const fog = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="16" x2="20" y2="16"></line><line x1="4" y1="8" x2="20" y2="8"></line></svg>`;
        const rain = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M16 14v6"></path><path d="M8 14v6"></path><path d="M12 16v6"></path></svg>`;
        const snow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="m20 16-4-4 4-4"></path><path d="m4 8 4 4-4 4"></path><path d="m16 4-4 4-4-4"></path><path d="m8 20 4-4 4 4"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`;
        const storm = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
        const cloud = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>`;
        
        if (code === 0) return sun;
        if ([1, 2, 3].includes(code)) return cloudSun;
        if ([45, 48].includes(code)) return fog;
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return rain;
        if ([71, 73, 75, 77, 85, 86].includes(code)) return snow;
        if ([95, 96, 99].includes(code)) return storm;
        return cloud;
    }

    // ===============================
    // PARCELAS
    // ===============================
    // ===============================
    // MAPS
    // ===============================
    _initMap() {
        if (typeof L === 'undefined' || this.map) return;

        // Centrado en Viso del Marqués por defecto
        const center = [38.524, -3.562];
        this.map = L.map('map').setView(center, 13);

        // Capa base: Satélite (Sinergise / Sentinel) o OpenStreetMap + Capa Híbrida
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        // Capa satelital de Google (común en apps agrícolas por su detalle)
        const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{
            maxZoom: 20,
            subdomains:['mt0','mt1','mt2','mt3'],
            attribution: '© Google Maps'
        });
        googleSat.addTo(this.map);

        this.mapLayers = L.layerGroup().addTo(this.map);

        // Fix Leaflet resize inside hidden sections
        const observer = new MutationObserver(() => {
            if (this.currentSection === 'parcelas') {
                setTimeout(() => this.map.invalidateSize(), 100);
            }
        });
        observer.observe(document.getElementById('section-parcelas'), { attributes: true, attributeFilter: ['style', 'class'] });

        // Al hacer click en el mapa, rellenar coordenadas en el formulario
        this.map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            const latInput = document.getElementById('parcela-lat');
            const lngInput = document.getElementById('parcela-lng');
            if (latInput && lngInput) {
                latInput.value = lat.toFixed(6);
                lngInput.value = lng.toFixed(6);
                this._toast('Coordenadas capturadas del mapa. Buscando datos SIGPAC...', 'info');
                
                // Buscar datos SIGPAC automáticamente
                this._fetchSigpacData(lat, lng);

                // Efecto visual de pulsación (extensión fadeOut personalizada)
                const marker = L.circleMarker([lat, lng], { radius: 10, color: '#a3d65e' }).addTo(this.map);
                setTimeout(() => this.map.removeLayer(marker), 1000);
            }
        });
    }

    async _renderMapMarkers() {
        if (!this.map || !this.mapLayers) return;
        this.mapLayers.clearLayers();

        try {
            const parcelas = await this.store.getAll('parcelas');
            parcelas.forEach(p => {
                if (p.lat && p.lng) {
                    const marker = L.marker([p.lat, p.lng])
                        .bindPopup(`
                            <strong>🌿 ${this._escapeHTML(p.nombre)}</strong><br>
                            Superficie: ${p.superficie} ha<br>
                            Ref: ${p.referencia_sigpac || 'N/A'}
                        `);
                    this.mapLayers.addLayer(marker);
                }
            });
        } catch (err) {
            console.error('Error cargando marcadores:', err);
        }
    }

    async _fetchSigpacData(lat, lng) {
        try {
            const data = await this.store._fetch('getSigpacInfo', { lat, lng });
            if (data.success) {
                const refInput = document.getElementById('parcela-sigpac');
                const supInput = document.getElementById('parcela-superficie');
                
                if (refInput) {
                    refInput.value = data.referencia;
                    refInput.classList.add('highlight-flash'); // Visual feedback
                }
                if (supInput) {
                    supInput.value = data.superficie;
                    supInput.classList.add('highlight-flash');
                }
                
                this._toast('✅ Datos SIGPAC recuperados', 'success');
                setTimeout(() => {
                    if(refInput) refInput.classList.remove('highlight-flash');
                    if(supInput) supInput.classList.remove('highlight-flash');
                }, 2000);
            } else {
                console.warn('SIGPAC Warning:', data.error);
                this._toast('⚠️ ' + (data.error || 'No se encontraron datos SIGPAC aquí'), 'warning');
            }
        } catch (err) {
            console.error('Error fetching SIGPAC:', err);
            this._toast('❌ Error al conectar con SIGPAC', 'error');
        }
    }
    // ===============================
    // PARCELAS / REGISTRO
    // ===============================
    _initForms() {
        // Almacén form — Prioritario para evitar recargas
        const formAlm = document.getElementById('form-almacen');
        if (formAlm) {
            formAlm.addEventListener('submit', (e) => {
                e.preventDefault();
                this._addAlmacen();
            });
        }

        // Maquinaria form — Prioritario 
        const formMaq = document.getElementById('form-maquinaria');
        if (formMaq) {
            formMaq.addEventListener('submit', (e) => {
                e.preventDefault();
                this._addMaquinaria();
            });
        }

        // Formularios originales
        const formPar = document.getElementById('form-parcela');
        if (formPar) {
            formPar.addEventListener('submit', (e) => {
                e.preventDefault();
                this._addParcela();
            });
        }

        const formTra = document.getElementById('form-trabajo');
        if (formTra) {
            formTra.addEventListener('submit', (e) => {
                e.preventDefault();
                this._addTrabajo();
            });
        }

        const formReg = document.getElementById('form-registro');
        if (formReg) {
            formReg.addEventListener('submit', (e) => {
                e.preventDefault();
                this._addRegistro();
            });
        }

        const regFecha = document.getElementById('reg-fecha');
        if (regFecha) regFecha.valueAsDate = new Date();

        // Geolocalización - Detectar posición
        const btnDetect = document.getElementById('btn-detect-pos');
        if (btnDetect) {
            btnDetect.addEventListener('click', () => {
                if (!navigator.geolocation) {
                    this._toast('Tu navegador no soporta geolocalización', 'error');
                    return;
                }
                btnDetect.disabled = true;
                btnDetect.textContent = '⌛ Detectando...';
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude } = pos.coords;
                        document.getElementById('parcela-lat').value = latitude.toFixed(6);
                        document.getElementById('parcela-lng').value = longitude.toFixed(6);
                        
                        this._toast('Ubicación detectada. Buscando datos SIGPAC...', 'info');
                        this._fetchSigpacData(latitude, longitude);

                        if (this.map) {
                            this.map.setView([latitude, longitude], 18);
                            L.marker([latitude, longitude]).addTo(this.map).bindPopup('¡Estás aquí!').openPopup();
                        }
                        btnDetect.disabled = false;
                        btnDetect.textContent = '📍 Detectar Mi Ubicación';
                    },
                    (err) => {
                        this._toast('No se pudo obtener tu ubicación: ' + err.message, 'error');
                        btnDetect.disabled = false;
                        btnDetect.textContent = '📍 Detectar Mi Ubicación';
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            });
        }

        try {
            this._initFormPhotos();
        } catch (err) {
            console.error("Error inicializando fotos:", err);
        }
    }

    _initRegistroQuickTools() {
        const form = document.getElementById('form-registro');
        if (!form) return;

        const toggle = document.getElementById('btn-quick-reg-toggle');
        const btnToday = document.getElementById('quick-set-today');
        const btnHour = document.getElementById('quick-set-hour');
        const btnClear = document.getElementById('quick-clear-extra');

        if (toggle) {
            toggle.addEventListener('click', () => {
                form.classList.toggle('quick-mode');
                const isQuick = form.classList.contains('quick-mode');
                toggle.textContent = isQuick ? '✅ Modo Rápido Activo' : '⚡ Modo Parte Rápido';
            });
        }

        if (btnToday) {
            btnToday.addEventListener('click', () => {
                const fecha = document.getElementById('reg-fecha');
                if (fecha) fecha.valueAsDate = new Date();
            });
        }

        if (btnHour) {
            btnHour.addEventListener('click', () => {
                const dur = document.getElementById('reg-duracion');
                if (dur) dur.value = '1';
            });
        }

        if (btnClear) {
            btnClear.addEventListener('click', () => {
                ['reg-notas', 'reg-coste', 'reg-nombres-personas', 'reg-fito-producto', 'reg-fito-nregistro', 'reg-fito-cantidad', 'reg-fito-dosis', 'reg-fito-plaga', 'reg-fito-carnet', 'reg-abono-nutrientes', 'reg-abono-cantidad-num', 'reg-abono-cantidad', 'reg-abono-agua', 'reg-cosecha-kg', 'reg-cosecha-lote']
                    .forEach((id) => {
                        const el = document.getElementById(id);
                        if (el) el.value = '';
                    });
            });
        }
    }

    // ===============================
    // WORK TIMER (CRONÓMETRO)
    // ===============================
    _initWorkTimer() {
        this.timerInterval = null;
        this.timerState = {
            isRunning: false,
            startTime: null,
            elapsedSeconds: 0
        };

        // Cargar estado persistente
        const saved = localStorage.getItem('garuto_timer');
        if (saved) {
            try {
                this.timerState = JSON.parse(saved);
                if (this.timerState.isRunning && this.timerState.startTime) {
                    this._startTimerDisplay();
                } else {
                    this._updateTimerUI();
                }
            } catch (e) {
                console.error("Error cargando timer:", e);
            }
        }

        const btn = document.getElementById('btn-timer-toggle');
        if (btn) {
            btn.addEventListener('click', () => this._toggleTimer());
        }
    }

    _toggleTimer() {
        const btn = document.getElementById('btn-timer-toggle');
        
        if (this.timerState.isRunning) {
            // Detener
            clearInterval(this.timerInterval);
            
            const now = Date.now();
            const sessionSecs = Math.floor((now - this.timerState.startTime) / 1000);
            const totalSecs = this.timerState.elapsedSeconds + sessionSecs;
            
            // Convertir a horas decimales (Ej: 1h 30m -> 1.5)
            const hours = (totalSecs / 3600).toFixed(2);
            document.getElementById('reg-duracion').value = hours;
            
            // Resetear estado
            this.timerState = { isRunning: false, startTime: null, elapsedSeconds: 0 };
            btn.classList.remove('active');
            this._updateTimerUI();
            this._toast('Trabajo finalizado. Tiempo volcado al formulario.', 'info');
        } else {
            // Iniciar
            this.timerState.isRunning = true;
            this.timerState.startTime = Date.now();
            this.timerState.elapsedSeconds = 0;
            this._startTimerDisplay();
            this._toast('Cronómetro en marcha. ¡Buen trabajo!', 'success');
        }
        localStorage.setItem('garuto_timer', JSON.stringify(this.timerState));
    }

    _startTimerDisplay() {
        const btn = document.getElementById('btn-timer-toggle');
        const label = document.getElementById('timer-label');
        const icon = document.getElementById('timer-icon');
        
        if (btn) btn.classList.add('active');
        if (label) label.textContent = 'Parar';
        if (icon) icon.textContent = '⏹️';

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this._updateTimerUI();
        }, 1000);
        this._updateTimerUI();
    }

    _updateTimerUI() {
        const display = document.getElementById('timer-display');
        const btn = document.getElementById('btn-timer-toggle');
        const label = document.getElementById('timer-label');
        const icon = document.getElementById('timer-icon');

        if (!display) return;

        let totalSeconds = this.timerState.elapsedSeconds || 0;
        if (this.timerState.isRunning && this.timerState.startTime) {
            totalSeconds += Math.floor((Date.now() - this.timerState.startTime) / 1000);
        } else {
            if (btn) btn.classList.remove('active');
            if (label) label.textContent = 'Iniciar';
            if (icon) icon.textContent = '▶️';
        }

        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        display.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _initFormPhotos() {
        this._regSelectedFiles = [];
        
        const takePhotoBtn = document.getElementById('reg-btn-take-photo');
        const pickPhotoBtn = document.getElementById('reg-btn-pick-photo');
        const cameraInput = document.getElementById('reg-foto-camera');
        const galleryInput = document.getElementById('reg-foto-gallery');

        takePhotoBtn.addEventListener('click', () => cameraInput.click());
        pickPhotoBtn.addEventListener('click', () => galleryInput.click());

        const handleFiles = (files) => {
            Array.from(files).forEach(f => this._regSelectedFiles.push(f));
            this._renderRegPreview();
        };

        cameraInput.addEventListener('change', () => { handleFiles(cameraInput.files); cameraInput.value = ''; });
        galleryInput.addEventListener('change', () => { handleFiles(galleryInput.files); galleryInput.value = ''; });
    }

    _renderRegPreview() {
        const container = document.getElementById('reg-upload-preview');
        if (this._regSelectedFiles.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = this._regSelectedFiles.map((file, idx) => {
            const url = URL.createObjectURL(file);
            return `
                <div class="upload-preview-item">
                    <img src="${url}" alt="Preview">
                    <button class="remove-preview" data-idx="${idx}" type="button">✕</button>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.remove-preview').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this._regSelectedFiles.splice(idx, 1);
                this._renderRegPreview();
            });
        });
    }

    async _addParcela() {
        const nombre = document.getElementById('parcela-nombre').value.trim();
        const superficie = document.getElementById('parcela-superficie').value;
        const sigpac = document.getElementById('parcela-sigpac').value.trim();
        const notas = document.getElementById('parcela-notas').value.trim();
        const lat = document.getElementById('parcela-lat').value;
        const lng = document.getElementById('parcela-lng').value;

        if (!nombre) return;

        const data = {
            nombre,
            superficie: superficie ? parseFloat(superficie) : null,
            referencia_sigpac: sigpac || null,
            notas: notas || '',
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null
        };

        try {
            if (this.editingParcelaId) {
                await this.store.update('parcelas', this.editingParcelaId, data);
                this._toast(`Parcela "${nombre}" actualizada correctamente`);
                this.editingParcelaId = null;
                document.getElementById('form-parcela-title').textContent = 'Añadir Nueva Parcela';
                document.getElementById('btn-save-parcela').textContent = 'Añadir Parcela';
                document.getElementById('btn-cancel-edit-parcela').hidden = true;
            } else {
                await this.store.add('parcelas', data);
                this._toast(`Parcela "${nombre}" añadida correctamente`);
            }

            document.getElementById('form-parcela').reset();
            await this._renderParcelas();
        } catch (err) {
            this._toast('Error al guardar parcela', 'error');
        }
    }

    async _renderParcelas() {
        try {
            const parcelas = await this.store.getAll('parcelas');
            const registros = await this.store.getAll('registros');
            const container = document.getElementById('parcelas-list');

            // Calcular y mostrar total de hectáreas
            const totalHa = parcelas.reduce((sum, p) => sum + (parseFloat(p.superficie) || 0), 0);
            const totalHaEl = document.getElementById('parcelas-total-ha');
            if (totalHaEl) totalHaEl.textContent = `📐 Total: ${totalHa.toFixed(2)} ha`;

            if (parcelas.length === 0) {
                container.innerHTML = '<p class="empty-msg">No hay parcelas registradas. ¡Añade tu primera parcela!</p>';
                if (totalHaEl) totalHaEl.textContent = '📐 Total: 0 ha';
                return;
            }

            container.innerHTML = parcelas.map(p => {
                const regCount = registros.filter(r => r.parcelaId == p.id).length;
                return `
                    <div class="list-item" data-id="${p.id}">
                        <div class="list-item-info">
                            <span class="list-item-icon">🗺️</span>
                            <div>
                                <span class="list-item-name">${this._escapeHTML(p.nombre)}</span>
                                <span class="list-item-meta">
                                    ${p.superficie ? p.superficie + ' ha' : ''}
                                    ${p.referencia_sigpac ? ' · SIGPAC: ' + this._escapeHTML(p.referencia_sigpac) : ''}
                                    ${p.notas ? ' · ' + this._escapeHTML(p.notas) : ''}
                                </span>
                            </div>
                        </div>
                        <div class="list-item-actions">
                            <span class="list-item-badge click-to-consultar" data-id="${p.id}" style="cursor: pointer; border: 1px solid rgba(163, 214, 94, 0.4); transition: background 0.2s;" title="Ver estos registros en Consultar" onmouseover="this.style.background='rgba(163, 214, 94, 0.2)'" onmouseout="this.style.background='rgba(163, 214, 94, 0.1)'" >${regCount} registros</span>
                            <button class="btn btn-secondary btn-sm btn-edit-parcela" data-id="${p.id}" title="Editar parcela">
                                ✏️
                            </button>
                            <button class="btn-tree-map btn-mapa-parcela" data-id="${p.id}" data-nombre="${encodeURIComponent(p.nombre)}" data-lat="${p.lat||''}" data-lng="${p.lng||''}" title="Mapa de árboles">
                                🌿 Mapa
                            </button>
                            <button class="btn btn-secondary btn-sm btn-docs-parcela" data-id="${p.id}" data-nombre="${this._escapeHTML(p.nombre)}" title="Ver documentos">
                                📂 Docs
                            </button>
                            <button class="btn btn-danger btn-sm btn-delete-parcela" data-id="${p.id}" title="Eliminar parcela">
                                🗑️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.btn-edit-parcela').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._editParcela(btn.dataset.id);
                });
            });

            container.querySelectorAll('.click-to-consultar').forEach(el => {
                el.addEventListener('click', () => {
                    this._navigateTo('consultar');
                    setTimeout(() => {
                        const select = document.getElementById('consult-parcela');
                        if (select) {
                            select.value = el.dataset.id;
                            this._renderRecords();
                        }
                    }, 300); // Dar margen para que cargue la lista tras la navegación
                });
            });

            container.querySelectorAll('.btn-docs-parcela').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._openDocsModal(btn.dataset.id, btn.dataset.nombre);
                });
            });

            container.querySelectorAll('.btn-delete-parcela').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const parcela = parcelas.find(p => p.id == id);
                    if (confirm(`¿Eliminar la parcela "${parcela.nombre}"?`)) {
                        try {
                            const res = await this.store.delete('parcelas', id);
                            if (res.queued) {
                                this._toast(`📶 Parcela "${parcela.nombre}" se eliminará al recuperar conexión`, 'info');
                            } else {
                                this._toast(`Parcela "${parcela.nombre}" eliminada`, 'info');
                                await this._renderParcelas();
                            }
                        } catch (err) {
                            this._toast(err.message || 'Error al eliminar parcela', 'error');
                        }
                    }
                });
            });

            container.querySelectorAll('.btn-mapa-parcela').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const nombre = btn.dataset.nombre;
                    const lat = btn.dataset.lat;
                    const lng = btn.dataset.lng;
                    window.location.href = `visor_mapa.php?id=${id}&nombre=${nombre}&lat=${lat}&lng=${lng}`;
                });
            });

            // Actualizar Marcadores en el Mapa
            if (this._renderMapMarkers) this._renderMapMarkers();

        } catch (err) {
            console.error('Error cargando parcelas:', err);
        }
    }

    async _editParcela(id) {
        try {
            const parcela = await this.store.getById('parcelas', id);
            if (!parcela) return;

            this.editingParcelaId = id;
            document.getElementById('parcela-nombre').value = parcela.nombre || '';
            document.getElementById('parcela-superficie').value = parcela.superficie || '';
            document.getElementById('parcela-sigpac').value = parcela.referencia_sigpac || '';
            document.getElementById('parcela-notas').value = parcela.notas || '';
            document.getElementById('parcela-lat').value = parcela.lat || '';
            document.getElementById('parcela-lng').value = parcela.lng || '';

            document.getElementById('form-parcela-title').textContent = 'Editar Parcela';
            document.getElementById('btn-save-parcela').textContent = 'Guardar Cambios';
            document.getElementById('btn-cancel-edit-parcela').hidden = false;

            // Scroll to form
            document.getElementById('form-parcela').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('Error al cargar parcela para editar:', err);
            this._toast('Error al cargar datos de la parcela', 'error');
        }
    }

    _cancelEditParcela() {
        this.editingParcelaId = null;
        document.getElementById('form-parcela').reset();
        document.getElementById('form-parcela-title').textContent = 'Añadir Nueva Parcela';
        document.getElementById('btn-save-parcela').textContent = 'Añadir Parcela';
        document.getElementById('btn-cancel-edit-parcela').hidden = true;
    }

    // ===============================
    // DOCUMENTACIÓN DE PARCELAS
    // ===============================
    _initDocs() {
        const modal = document.getElementById('modal-docs');
        const closeBtn = document.getElementById('close-modal-docs');
        const form = document.getElementById('form-doc');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this._addDocumento();
            });
        }

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    }

    async _openDocsModal(parcelaId, parcelaNombre) {
        document.getElementById('docs-parcela-name').textContent = parcelaNombre;
        document.getElementById('doc-parcela-id').value = parcelaId;
        document.getElementById('modal-docs').classList.add('active');
        this._renderDocs(parcelaId);
    }

    async _renderDocs(parcelaId) {
        const container = document.getElementById('docs-list');
        container.innerHTML = '<p class="empty-msg">Cargando documentos...</p>';

        try {
            const allDocs = await this.store.getAll('documentacion');
            const docs = allDocs.filter(d => d.parcelaId == parcelaId);

            if (docs.length === 0) {
                container.innerHTML = '<p class="empty-msg">No hay documentos para esta parcela todavía.</p>';
                return;
            }

            container.innerHTML = docs.map(d => {
                const isFile = d.filename;
                const fileExt = isFile ? d.filename.split('.').pop().toLowerCase() : '';
                const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExt);
                const fileIcon = isImg ? '🖼️' : (fileExt === 'pdf' ? '📜' : '📄');
                const fileUrl = isFile ? `uploads/docs/${d.filename}` : d.url;

                return `
                    <div class="doc-card">
                        <div>
                            <span class="doc-card-title">${fileIcon} ${this._escapeHTML(d.titulo)}</span>
                            ${d.descripcion ? `<p class="doc-card-desc">${this._escapeHTML(d.descripcion)}</p>` : ''}
                        </div>
                        <div class="doc-card-actions">
                            ${fileUrl ? `<a href="${fileUrl}" target="_blank" class="btn-doc-link">${isFile ? '📂 Ver archivo' : '🌐 Ver enlace'}</a>` : '<span></span>'}
                            <button class="btn-delete-doc" data-id="${d.id}" title="Borrar documento">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.btn-delete-doc').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('¿Borrar este documento?')) {
                        try {
                            const res = await this.store.delete('documentacion', btn.dataset.id);
                            if (res.queued) {
                                this._toast('📶 El documento se borrará al recuperar conexión', 'info');
                            } else {
                                this._toast('Documento eliminado', 'info');
                                this._renderDocs(parcelaId);
                            }
                        } catch (err) {
                            this._toast(err.message || 'Error al borrar documento', 'error');
                        }
                    }
                });
            });

        } catch (err) {
            container.innerHTML = '<p class="empty-msg">Error al cargar documentos.</p>';
        }
    }

    async _addDocumento() {
        const parcelaId = document.getElementById('doc-parcela-id').value;
        const titulo = document.getElementById('doc-titulo').value.trim();
        const descripcion = document.getElementById('doc-desc').value.trim();
        const url = document.getElementById('doc-url').value.trim();
        const fileInput = document.getElementById('doc-archivo');
        const file = fileInput.files[0];

        if (!titulo || !parcelaId) return;

        try {
            if (file) {
                // Modo Subida de Archivo — usando store._fetch para incluir credenciales de sesión
                const formData = new FormData();
                formData.append('archivo', file);
                formData.append('parcelaId', parcelaId);
                formData.append('titulo', titulo);
                formData.append('descripcion', descripcion);

                // Use store._fetch so session cookies are included automatically
                await this.store._fetch('uploadDoc', {}, formData);
            } else {
                // Modo Enlace
                await this.store.add('documentacion', {
                    parcelaId: parseInt(parcelaId),
                    titulo,
                    descripcion: descripcion || null,
                    url: url || null
                });
            }

            document.getElementById('form-doc').reset();
            this._renderDocs(parcelaId);
            this._toast('Documento añadido correctamente');
        } catch (err) {
            console.error('Error en _addDocumento:', err);
            this._toast(err.message || 'Error al añadir documento', 'error');
        }
    }

    // ===============================
    // TRABAJOS
    // ===============================
    async _addTrabajo() {
        const nombre = document.getElementById('trabajo-nombre').value.trim();
        const icono = document.getElementById('trabajo-icono').value.trim() || '🔧';
        const tipoLegal = document.getElementById('trabajo-tipo-legal').value;

        if (!nombre) return;

        try {
            await this.store.add('trabajos', { nombre, icono, tipo_legal: tipoLegal, predefinido: 0 });
            document.getElementById('form-trabajo').reset();
            await this._renderTrabajos();
            this._toast(`Tipo de trabajo "${nombre}" añadido`);
        } catch (err) {
            this._toast('Error al añadir trabajo', 'error');
        }
    }

    async _renderTrabajos() {
        try {
            const trabajos = await this.store.getAll('trabajos');
            const registros = await this.store.getAll('registros');
            const container = document.getElementById('trabajos-list');

            if (trabajos.length === 0) {
                container.innerHTML = '<p class="empty-msg">No hay tipos de trabajo registrados.</p>';
                return;
            }

            container.innerHTML = trabajos.map(t => {
                const usageCount = registros.filter(r => r.trabajoId == t.id).length;
                const isPredefinido = t.predefinido == 1 || t.predefinido === true;
                return `
                    <div class="list-item" data-id="${t.id}">
                        <div class="list-item-info">
                            <span class="list-item-icon">${t.icono}</span>
                            <div>
                                <span class="list-item-name">${this._escapeHTML(t.nombre)}</span>
                                <span class="list-item-meta">
                                    ${isPredefinido ? '🔒 Predefinido' : '✏️ Personalizado'}
                                </span>
                            </div>
                        </div>
                        <div class="list-item-actions">
                            <span class="list-item-badge">${usageCount} usos</span>
                            ${!isPredefinido ? `
                                <button class="btn btn-danger btn-sm btn-delete-trabajo" data-id="${t.id}" title="Eliminar tipo de trabajo">
                                    🗑️
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.btn-delete-trabajo').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const trabajo = trabajos.find(t => t.id == id);
                    if (confirm(`¿Eliminar el tipo de trabajo "${trabajo.nombre}"?`)) {
                        try {
                            await this.store.delete('trabajos', id);
                            await this._renderTrabajos();
                            this._toast(`Tipo de trabajo "${trabajo.nombre}" eliminado`, 'info');
                        } catch (err) {
                            this._toast(err.message || 'Error al eliminar trabajo', 'error');
                        }
                    }
                });
            });
        } catch (err) {
            console.error('Error cargando trabajos:', err);
        }
    }

    // ===============================
    // REGISTRAR TRABAJO
    // ===============================
    async _populateRegistroSelects() {
        try {
            const parcelaSelect = document.getElementById('reg-parcela');
            const trabajoSelect = document.getElementById('reg-trabajo');
            const maquinariaSelect = document.getElementById('reg-maquinaria');
            const fitoInvSelect = document.getElementById('reg-fito-inventario');
            const abonoInvSelect = document.getElementById('reg-abono-inventario');

            const parcelas = await this.store.getAll('parcelas');
            const trabajos = await this.store.getAll('trabajos');
            const maquinaria = await this.store.getAll('maquinaria');
            const inventario = await this.store.getAll('inventario');

            parcelaSelect.innerHTML = '<option value="">Selecciona parcela...</option>' +
                parcelas.map(p => `<option value="${p.id}">${this._escapeHTML(p.nombre)}</option>`).join('');

            trabajoSelect.innerHTML = '<option value="">Selecciona trabajo...</option>' +
                trabajos.map(t => `<option value="${t.id}">${t.icono} ${this._escapeHTML(t.nombre)}</option>`).join('');

            maquinariaSelect.innerHTML = '<option value="">Ninguna / Manual</option>' +
                maquinaria.map(m => `<option value="${m.id}">🚜 ${this._escapeHTML(m.nombre)} (${m.coste_hora}€/h)</option>`).join('');

            const fitoOptions = inventario.filter(i => i.tipo === 'fitosanitario' || i.tipo === 'herbicida')
                .map(i => `<option value="${i.id}">${this._escapeHTML(i.nombre)} (Stock: ${i.stock} ${i.unidad})</option>`).join('');
            fitoInvSelect.innerHTML = '<option value="">-- Elige del inventario o escribe abajo --</option>' + fitoOptions;

            const abonoOptions = inventario.filter(i => i.tipo === 'abono')
                .map(i => `<option value="${i.id}">${this._escapeHTML(i.nombre)} (Stock: ${i.stock} ${i.unidad})</option>`).join('');
            abonoInvSelect.innerHTML = '<option value="">-- Elige del inventario o escribe abajo --</option>' + abonoOptions;

            // Sync inventory selects with manual inputs
            fitoInvSelect.addEventListener('change', () => {
                const item = inventario.find(i => i.id == fitoInvSelect.value);
                if (item) document.getElementById('reg-fito-producto').value = item.nombre;
            });
            abonoInvSelect.addEventListener('change', () => {
                const item = inventario.find(i => i.id == abonoInvSelect.value);
                if (item) document.getElementById('reg-abono-nutrientes').value = item.nombre;
            });

            if (!document.getElementById('reg-fecha').value) {
                document.getElementById('reg-fecha').valueAsDate = new Date();
            }

            // Lógica para mostrar/ocultar campos SIEX según tipo de trabajo
            this._trabajosCached = trabajos; // Guardar para uso en el event listener
            
            if (this._trabajoChangeHandler) {
                trabajoSelect.removeEventListener('change', this._trabajoChangeHandler);
            }

            this._trabajoChangeHandler = () => {
                const selectedId = trabajoSelect.value;
                const trabajo = this._trabajosCached.find(t => t.id == selectedId);
                const tipoLegal = trabajo ? trabajo.tipo_legal : null;

                document.getElementById('siex-fito-container').style.display = tipoLegal === 'fitosanitario' ? 'block' : 'none';
                document.getElementById('siex-abono-container').style.display = tipoLegal === 'abono' ? 'block' : 'none';
                document.getElementById('siex-cosecha-container').style.display = tipoLegal === 'cosecha' ? 'block' : 'none';
            };

            trabajoSelect.addEventListener('change', this._trabajoChangeHandler);
            
            // Ejecutar una vez para inicializar el estado correcto
            this._trabajoChangeHandler();

        } catch (err) {
            console.error('Error cargando selects:', err);
        }
    }

    async _addRegistro() {
        const parcelaId = document.getElementById('reg-parcela').value;
        const trabajoId = document.getElementById('reg-trabajo').value;
        const fecha = document.getElementById('reg-fecha').value;
        const maquinariaId = document.getElementById('reg-maquinaria').value;
        const duracion = document.getElementById('reg-duracion').value;
        const notas = document.getElementById('reg-notas').value.trim();
        const coste = document.getElementById('reg-coste').value;
        const numPersonas = document.getElementById('reg-num-personas').value;
        const nombresPersonas = document.getElementById('reg-nombres-personas').value.trim();

        if (!parcelaId || !trabajoId || !fecha) {
            this._toast('Por favor, completa todos los campos obligatorios', 'error');
            return;
        }

        const trabajo = this._trabajosCached ? this._trabajosCached.find(t => t.id == trabajoId) : null;
        let pFito = null, nRegFito = null, dFito = null, plFito = null, carnet = null;
        let nutr = null, cantA = null, agua = null;
        let kgC = null, loteC = null;
        let invId = null, cantUsada = null;

        if (trabajo) {
            if (trabajo.tipo_legal === 'fitosanitario') {
                invId = document.getElementById('reg-fito-inventario').value || null;
                cantUsada = document.getElementById('reg-fito-cantidad').value || null;
                pFito = document.getElementById('reg-fito-producto').value.trim() || null;
                nRegFito = document.getElementById('reg-fito-nregistro').value.trim() || null;
                dFito = document.getElementById('reg-fito-dosis').value.trim() || null;
                plFito = document.getElementById('reg-fito-plaga').value.trim() || null;
                carnet = document.getElementById('reg-fito-carnet').value.trim() || null;
            } else if (trabajo.tipo_legal === 'abono') {
                invId = document.getElementById('reg-abono-inventario').value || null;
                cantUsada = document.getElementById('reg-abono-cantidad-num').value || null;
                nutr = document.getElementById('reg-abono-nutrientes').value.trim() || null;
                cantA = document.getElementById('reg-abono-cantidad').value.trim() || null;
                agua = document.getElementById('reg-abono-agua').value ? parseFloat(document.getElementById('reg-abono-agua').value) : null;
            } else if (trabajo.tipo_legal === 'cosecha') {
                kgC = document.getElementById('reg-cosecha-kg').value ? parseFloat(document.getElementById('reg-cosecha-kg').value) : null;
                loteC = document.getElementById('reg-cosecha-lote').value.trim() || null;
            }
        }

        try {
            const newRegistro = await this.store.add('registros', {
                parcelaId: parseInt(parcelaId),
                trabajoId: parseInt(trabajoId),
                maquinariaId: maquinariaId ? parseInt(maquinariaId) : null,
                duracion_horas: duracion ? parseFloat(duracion) : null,
                inventarioId: invId ? parseInt(invId) : null,
                cantidad_usada: cantUsada ? parseFloat(cantUsada) : null,
                fecha,
                notas: notas || '',
                coste: coste ? parseFloat(coste) : 0.00,
                num_personas: numPersonas ? parseInt(numPersonas) : 1,
                nombres_personas: nombresPersonas || null,
                producto_fito: pFito,
                num_registro_fito: nRegFito,
                dosis: dFito,
                plaga: plFito,
                carnet_aplicador: carnet,
                nutrientes: nutr,
                cantidad_abono: cantA,
                agua_riego: agua,
                kg_recolectados: kgC,
                lote_trazabilidad: loteC
            });

            const parcela = await this.store.getById('parcelas', parcelaId);
            const trabajo = await this.store.getById('trabajos', trabajoId);

            // Upload photos if any
            if (this._regSelectedFiles && this._regSelectedFiles.length > 0) {
                const saveBtn = document.getElementById('btn-save-registro');
                const statusEl = document.getElementById('reg-upload-status');
                saveBtn.hidden = true;
                statusEl.hidden = false;

                let uploaded = 0;
                const anio = fecha.split('-')[0];

                for (const file of this._regSelectedFiles) {
                    try {
                        const formData = new FormData();
                        formData.append('foto', file);
                        formData.append('parcelaId', parcelaId);
                        formData.append('registroId', newRegistro.id);
                        formData.append('anio', anio);
                        formData.append('descripcion', notas || `${trabajo.nombre} en ${parcela.nombre}`);

                        const res = await fetch(`${API_URL}?action=uploadPhoto`, {
                            method: 'POST',
                            body: formData
                        });
                        if (res.ok) uploaded++;
                    } catch (e) { console.error('Error subiendo foto:', e); }
                }

                saveBtn.hidden = false;
                statusEl.hidden = true;
                this._regSelectedFiles = [];
                this._renderRegPreview();

                if (uploaded > 0) {
                    this._toast(`Registro y ${uploaded} fotos guardados: ${trabajo.icono} ${trabajo.nombre}`);
                } else {
                    this._toast(`Registro guardado pero fallaron las fotos`, 'warning');
                }
            } else {
                this._toast(`${trabajo.icono} ${trabajo.nombre} en "${parcela.nombre}" registrado`);
            }

            document.getElementById('form-registro').reset();
            document.getElementById('reg-fecha').valueAsDate = new Date();
            
            // Re-evaluar selects al resetear el form (para que se oculten los sub-formularios)
            if (this._trabajosCached) {
                const trabajoSelect = document.getElementById('reg-trabajo');
                trabajoSelect.dispatchEvent(new Event('change'));
            }
            
        } catch (err) {
            this._toast('Error al guardar registro', 'error');
        }
    }

    // ===============================
    // CONSULTAR REGISTROS
    // ===============================
    _initFilters() {
        document.getElementById('btn-filter').addEventListener('click', () => this._renderRecords());
        document.getElementById('btn-clear-filters').addEventListener('click', () => {
            document.getElementById('filter-parcela').value = '';
            document.getElementById('filter-trabajo').value = '';
            document.getElementById('filter-desde').value = '';
            document.getElementById('filter-hasta').value = '';
            this._renderRecords();
        });

        document.getElementById('btn-print').addEventListener('click', () => window.print());
        document.getElementById('btn-export').addEventListener('click', () => this._exportData());
        
        const btnExportSiex = document.getElementById('btn-export-siex');
        if (btnExportSiex) {
            btnExportSiex.addEventListener('click', () => this._exportSIEX());
        }
    }

    async _populateFilterSelects() {
        try {
            const parcelas = await this.store.getAll('parcelas');
            const trabajos = await this.store.getAll('trabajos');

            const fp = document.getElementById('filter-parcela');
            const ft = document.getElementById('filter-trabajo');

            const fpVal = fp.value;
            const ftVal = ft.value;

            fp.innerHTML = '<option value="">Todas las parcelas</option>' +
                parcelas.map(p => `<option value="${p.id}">${this._escapeHTML(p.nombre)}</option>`).join('');

            ft.innerHTML = '<option value="">Todos los trabajos</option>' +
                trabajos.map(t => `<option value="${t.id}">${t.icono} ${this._escapeHTML(t.nombre)}</option>`).join('');

            fp.value = fpVal;
            ft.value = ftVal;
        } catch (err) {
            console.error('Error cargando filtros:', err);
        }
    }

    async _renderRecords() {
        try {
            const filterParcela = document.getElementById('filter-parcela').value;
            const filterTrabajo = document.getElementById('filter-trabajo').value;
            const filterDesde = document.getElementById('filter-desde').value;
            const filterHasta = document.getElementById('filter-hasta').value;

            let registros = await this.store.getAll('registros');
            const trabajos = await this.store.getAll('trabajos');
            const parcelas = await this.store.getAll('parcelas');
            const maquinaria = await this.store.getAll('maquinaria');
            const fotos = await this.store.getAll('fotos');

            // Apply filters
            if (filterParcela) registros = registros.filter(r => r.parcelaId == filterParcela);
            if (filterTrabajo) registros = registros.filter(r => r.trabajoId == filterTrabajo);
            if (filterDesde) registros = registros.filter(r => r.fecha >= filterDesde);
            if (filterHasta) registros = registros.filter(r => r.fecha <= filterHasta);

            // Sort by date descending
            registros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            const tbody = document.getElementById('records-tbody');
            const countEl = document.getElementById('records-count');

            if (registros.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No hay registros que coincidan con los filtros</td></tr>';
                countEl.textContent = '0 registros';
                return;
            }

            tbody.innerHTML = registros.map(r => {
                const trabajo = trabajos.find(t => t.id == r.trabajoId);
                const parcela = parcelas.find(p => p.id == r.parcelaId);
                const maq = maquinaria.find(m => m.id == r.maquinariaId);
                const hasFotos = fotos.some(f => f.registroId == r.id);
                
                return `
                    <tr>
                        <td>${this._formatDate(r.fecha)}</td>
                        <td>${parcela ? this._escapeHTML(parcela.nombre) : '<em>Eliminada</em>'}</td>
                        <td>${trabajo ? trabajo.icono + ' ' + this._escapeHTML(trabajo.nombre) : '<em>Eliminado</em>'}</td>
                        <td>
                            ${r.num_personas ? r.num_personas : 1} 🧑‍🌾
                            ${r.nombres_personas ? `<br><small style="color:var(--text-secondary)">${this._escapeHTML(r.nombres_personas)}</small>` : ''}
                        </td>
                        <td>
                            ${r.coste && r.coste != 0 ? 
                                `<span style="color: ${r.coste > 0 ? '#ef5350' : '#a3d65e'}">
                                    ${r.coste > 0 ? '-' : '+'}${Math.abs(r.coste).toFixed(2)} €
                                </span>` 
                            : '—'}
                        </td>
                        <td>
                            ${r.notas ? this._escapeHTML(r.notas) : ''}
                            ${maq ? `<br><small>🚜 <b>Máquina:</b> ${this._escapeHTML(maq.nombre)} ${r.duracion_horas ? `(${r.duracion_horas}h)` : ''}</small>` : ''}
                            ${r.producto_fito ? `<br><small>🧪 <b>Fito:</b> ${this._escapeHTML(r.producto_fito)} ${r.cantidad_usada ? `(${r.cantidad_usada})` : ''} (Dosis: ${this._escapeHTML(r.dosis || '-')})</small>` : ''}
                            ${r.nutrientes ? `<br><small>🌾 <b>Abono:</b> ${this._escapeHTML(r.nutrientes)} ${r.cantidad_usada ? `(${r.cantidad_usada})` : ''} (${this._escapeHTML(r.cantidad_abono || '-')})</small>` : ''}
                            ${r.kg_recolectados ? `<br><small>🧺 <b>Cosecha:</b> ${r.kg_recolectados} kg (Lote: ${this._escapeHTML(r.lote_trazabilidad || '-')})</small>` : ''}
                            ${!r.notas && !r.producto_fito && !r.nutrientes && !r.kg_recolectados && !maq ? '—' : ''}
                            ${hasFotos ? `<button class="btn-view-fotos" data-id="${r.id}" title="Ver foto adjunta" type="button" style="margin-left: 5px; background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 0;">📷</button>` : ''}
                        </td>
                        <td class="no-print">
                            <button class="btn btn-danger btn-sm btn-delete-registro" data-id="${r.id}" title="Eliminar registro">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            countEl.textContent = `${registros.length} registro${registros.length !== 1 ? 's' : ''}`;

            tbody.querySelectorAll('.btn-view-fotos').forEach(btn => {
                btn.addEventListener('click', () => {
                    const regId = btn.dataset.id;
                    const f = fotos.find(f => f.registroId == regId);
                    if (f) {
                        const r = registros.find(reg => reg.id == regId);
                        const t = trabajos.find(trab => trab.id == r.trabajoId);
                        const p = parcelas.find(par => par.id == r.parcelaId);
                        const url = `uploads/${f.filename}?t=${Date.now()}`;
                        this._openLightbox(url, f.descripcion || `${t ? t.nombre : 'Trabajo'} en ${p ? p.nombre : 'Parcela'} (${f.anio})`);
                    }
                });
            });

            tbody.querySelectorAll('.btn-delete-registro').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('¿Eliminar este registro?')) {
                        try {
                            await this.store.delete('registros', btn.dataset.id);
                            await this._renderRecords();
                            this._toast('Registro eliminado', 'info');
                        } catch (err) {
                            this._toast(err.message || 'Error al eliminar registro', 'error');
                        }
                    }
                });
            });
        } catch (err) {
            console.error('Error cargando registros:', err);
        }
    }

    // ---- Export ----
    async _exportData() {
        try {
            const json = await this.store.exportJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cuaderno-campo-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this._toast('Datos exportados correctamente');
        } catch (err) {
            this._toast('Error al exportar datos', 'error');
        }
    }

    // ===============================
    // GALERÍA DE FOTOS
    // ===============================
    _initGallery() {
        this._galleryYear = null; // null = show all
        
        // Parcela selector
        const parcelaSelect = document.getElementById('gallery-parcela');
        parcelaSelect.addEventListener('change', () => {
            const id = parcelaSelect.value;
            const content = document.getElementById('gallery-content');
            if (id) {
                content.hidden = false;
                this._loadGallery(id);
            } else {
                content.hidden = true;
            }
        });

        this._initGalleryUploads();
    }

    _initGalleryUploads() {
        const takePhotoBtn = document.getElementById('gal-btn-take-photo');
        const pickPhotoBtn = document.getElementById('gal-btn-pick-photo');
        const cameraInput = document.getElementById('gal-foto-camera');
        const galleryInput = document.getElementById('gal-foto-gallery');

        takePhotoBtn.addEventListener('click', () => cameraInput.click());
        pickPhotoBtn.addEventListener('click', () => galleryInput.click());

        const handleUpload = (files) => {
            if (files.length > 0) this._uploadGalleryPhotos(Array.from(files));
        };

        cameraInput.addEventListener('change', () => { handleUpload(cameraInput.files); cameraInput.value = ''; });
        galleryInput.addEventListener('change', () => { handleUpload(galleryInput.files); galleryInput.value = ''; });
    }

    async _uploadGalleryPhotos(files) {
        if (!files || files.length === 0) return;

        const parcelaId = document.getElementById('gallery-parcela').value;
        const anio = document.getElementById('gal-foto-anio').value;
        const descripcion = document.getElementById('gal-foto-desc').value.trim();

        if (!parcelaId) {
            this._toast('Selecciona una parcela primero', 'error');
            return;
        }

        const btnTake = document.getElementById('gal-btn-take-photo');
        const btnPick = document.getElementById('gal-btn-pick-photo');
        const statusEl = document.getElementById('gal-upload-status');

        btnTake.disabled = true;
        btnPick.disabled = true;
        statusEl.hidden = false;

        let uploaded = 0;
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('foto', file);
                formData.append('parcelaId', parcelaId);
                formData.append('anio', anio);
                formData.append('descripcion', descripcion);

                const res = await fetch(`${API_URL}?action=uploadPhoto`, {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) uploaded++;
            } catch (err) {
                console.error('Error subiendo:', file.name, err);
            }
        }

        document.getElementById('gal-foto-desc').value = '';
        btnTake.disabled = false;
        btnPick.disabled = false;
        statusEl.hidden = true;

        if (uploaded > 0) {
            this._toast(`${uploaded} foto${uploaded > 1 ? 's' : ''} subida${uploaded > 1 ? 's' : ''} correctamente`);
            await this._renderPhotoGrid(parcelaId);
        } else {
            this._toast('Error al subir las fotos', 'error');
        }
    }

    async _populateGalleryParcelas() {
        try {
            const parcelas = await this.store.getAll('parcelas');
            const select = document.getElementById('gallery-parcela');
            const currentVal = select.value;

            select.innerHTML = '<option value="">Elige una parcela...</option>' +
                parcelas.map(p => `<option value="${p.id}">${this._escapeHTML(p.nombre)}</option>`).join('');

            if (currentVal) {
                select.value = currentVal;
                if (select.value) {
                    document.getElementById('gallery-content').hidden = false;
                    this._loadGallery(currentVal);
                }
            }
        } catch (err) {
            console.error('Error cargando parcelas para galería:', err);
        }
    }

    async _loadGallery(parcelaId) {
        // Populate year selector for upload
        const yearSelect = document.getElementById('gal-foto-anio');
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear; y >= currentYear - 10; y--) years.push(y);
        yearSelect.innerHTML = years.map(y =>
            `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
        ).join('');

        // Load photos and render
        await this._renderPhotoGrid(parcelaId);
    }

    async _renderPhotoGrid(parcelaId) {
        try {
            const res = await fetch(`${API_URL}?action=getPhotos&parcelaId=${parcelaId}`);
            const fotos = await res.json();

            // Year tabs
            const yearsSet = [...new Set(fotos.map(f => f.anio))].sort((a, b) => b - a);
            const tabsEl = document.getElementById('year-tabs');

            if (yearsSet.length > 0) {
                tabsEl.innerHTML = `<button class="year-tab year-tab-all ${this._galleryYear === null ? 'active' : ''}" data-year="">📷 Todos</button>` +
                    yearsSet.map(y =>
                        `<button class="year-tab ${this._galleryYear == y ? 'active' : ''}" data-year="${y}">${y}</button>`
                    ).join('');

                tabsEl.querySelectorAll('.year-tab').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this._galleryYear = btn.dataset.year ? parseInt(btn.dataset.year) : null;
                        this._renderPhotoGrid(parcelaId);
                    });
                });
            } else {
                tabsEl.innerHTML = '';
            }

            // Filter by year
            let filtered = fotos;
            if (this._galleryYear !== null) {
                filtered = fotos.filter(f => f.anio == this._galleryYear);
            }

            const gridEl = document.getElementById('photo-grid');

            if (filtered.length === 0) {
                gridEl.innerHTML = '<p class="empty-msg">No hay fotos' +
                    (this._galleryYear ? ` para el año ${this._galleryYear}` : ' para esta parcela') +
                    '. ¡Sube la primera!</p>';
                return;
            }

            gridEl.innerHTML = filtered.map(f => `
                <div class="photo-card" data-id="${f.id}">
                    <img src="uploads/${f.filename}?t=${Date.now()}" alt="${this._escapeHTML(f.descripcion || '')}" loading="lazy">
                    <div class="photo-card-overlay" style="display: flex; justify-content: space-between; align-items: flex-end;">
                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; padding-right: 10px;">
                            <span class="photo-card-desc" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${f.descripcion ? this._escapeHTML(f.descripcion) : ''}</span>
                            <span class="photo-card-date">${f.anio}</span>
                        </div>
                        <button class="photo-card-delete" data-id="${f.id}" title="Eliminar foto" style="flex-shrink: 0; z-index: 10;">🗑️</button>
                    </div>
                </div>
            `).join('');

            // Click to open lightbox
            gridEl.querySelectorAll('.photo-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.photo-card-delete')) return;
                    const img = card.querySelector('img');
                    const foto = filtered.find(f => f.id == card.dataset.id);
                    this._openLightbox(img.src, foto?.descripcion || '');
                });
            });

            // Delete buttons
            gridEl.querySelectorAll('.photo-card-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('¿Eliminar esta foto?')) {
                        try {
                            await this.store.delete('fotos', btn.dataset.id);
                            await this._renderPhotoGrid(parcelaId);
                            this._toast('Foto eliminada', 'info');
                        } catch (err) {
                            this._toast('Error al eliminar foto', 'error');
                        }
                    }
                });
            });

        } catch (err) {
            console.error('Error cargando fotos:', err);
        }
    }



    _openLightbox(src, desc) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <button class="lightbox-close">✕</button>
            <img src="${src}" alt="Foto">
            ${desc ? `<div class="lightbox-desc">${this._escapeHTML(desc)}</div>` : ''}
        `;

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                lightbox.remove();
            }
        });

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                lightbox.remove();
                document.removeEventListener('keydown', handler);
            }
        });

        document.body.appendChild(lightbox);
    }

    // ===============================
    // PLANING ANUAL
    // ===============================
    async _initPlaning() {
        const grid = document.getElementById('planing-grid');
        
        // Inicializar selector de año si está vacío
        const yearSelect = document.getElementById('planing-year');
        if (yearSelect && yearSelect.options.length === 0) {
            const currentYear = new Date().getFullYear();
            for (let y = currentYear - 2; y <= currentYear + 1; y++) {
                yearSelect.innerHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
            }
            yearSelect.addEventListener('change', () => this._renderPlaning());
        }

        await this._renderPlaning();
        
        // Auto-scroll al mes actual
        setTimeout(() => {
            const currentMonthCard = grid.querySelector('.month-active');
            if (currentMonthCard) {
                currentMonthCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);
    }

    async _renderPlaning() {
        const grid = document.getElementById('planing-grid');
        const currentMonthIndex = new Date().getMonth(); // 0 = Enero, 11 = Diciembre
        const selectedYear = parseInt(document.getElementById('planing-year').value) || new Date().getFullYear();

        // 1. Obtener progreso de la Base de Datos para el año seleccionado
        let progreso = [];
        try {
            const allProgreso = await this.store.getAll('planing_progreso');
            if (allProgreso && !allProgreso.error) {
                progreso = allProgreso.filter(p => parseInt(p.anio) === selectedYear);
            }
        } catch(e) { console.warn("Tabla planing_progreso no disponible aún", e); }

        grid.innerHTML = PLANING_DATA.map((data, mesIdx) => {
            const isActive = mesIdx === currentMonthIndex;
            const cardClass = isActive ? 'planing-card month-active' : 'planing-card';
            
            const badgesHTML = data.tareas.map((t, tareaIdx) => {
                // Comprobar si esta tarea está completada en la BD
                const isCompleted = progreso.some(p => parseInt(p.mes_idx) === mesIdx && parseInt(p.tarea_idx) === tareaIdx && (p.completado == 1 || p.completado === true));
                
                return `
                    <div class="planing-task-item" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
                        <input type="checkbox" class="planing-checkbox" 
                            data-mes="${mesIdx}" data-tarea="${tareaIdx}" 
                            id="task-${mesIdx}-${tareaIdx}" 
                            ${isCompleted ? 'checked' : ''}>
                        <label for="task-${mesIdx}-${tareaIdx}" style="cursor: pointer; display: flex; align-items: center; ${isCompleted ? 'opacity: 0.5;' : ''}">
                            <span class="planing-badge" style="${isCompleted ? 'text-decoration: line-through;' : ''}">${t.i} ${this._escapeHTML(t.t)}</span>
                        </label>
                    </div>
                `;
            }).join('');

            return `
                <div class="${cardClass}" id="planing-m-${mesIdx}">
                    <div class="planing-header">
                        <div class="planing-month">
                            <span class="planing-icon">${data.icon}</span>
                            <h2>${data.mes}</h2>
                        </div>
                        ${isActive ? '<span class="planing-status">Mes Actual</span>' : ''}
                    </div>
                    <div class="planing-body">
                        <div class="planing-badges">
                            ${badgesHTML}
                        </div>
                        <p class="planing-desc">${this._escapeHTML(data.consejo)}</p>
                    </div>
                </div>
            `;
        }).join('');

        // 2. Añadir Event Listeners a los checkboxes
        grid.querySelectorAll('.planing-checkbox').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const mesIdx = parseInt(e.target.dataset.mes);
                const tareaIdx = parseInt(e.target.dataset.tarea);
                const completado = e.target.checked;
                
                // Actualizar estilo visual inmediatamente
                const labelIcon = e.target.nextElementSibling.querySelector('.planing-badge');
                if (completado) {
                    e.target.nextElementSibling.style.opacity = '0.5';
                    labelIcon.style.textDecoration = 'line-through';
                } else {
                    e.target.nextElementSibling.style.opacity = '1';
                    labelIcon.style.textDecoration = 'none';
                }

                // Guardar en Base de Datos
                try {
                    await this.store.add('planing_progreso', {
                        anio: selectedYear,
                        mes_idx: mesIdx,
                        tarea_idx: tareaIdx,
                        completado: completado
                    });
                } catch(err) {
                    console.error("Error guardando progreso", err);
                    this._toast("Error al guardar en el servidor", "error");
                    // Revertir visual si falla
                    e.target.checked = !completado;
                }
            });
        });
    }

    // ===============================
    // EXPORTACIÓN SIEX / CSV
    // ===============================
    async _exportSIEX() {
        try {
            const registros = await this.store.getAll('registros');
            const parcelas = await this.store.getAll('parcelas');
            const trabajos = await this.store.getAll('trabajos');

            // Ordenar por fecha cronológica (para SIEX suele ser mejor así o inverso, hacemos cronológico)
            registros.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            // Cabeceras CSV (Ajustadas a campos principales de cuaderno de campo)
            let csvContent = "\uFEFF"; // BOM para Excel UTF-8
            csvContent += "Fecha;Parcela;Ref_SIGPAC;Superficie_ha;Trabajo;Tipo_Legal;Maquinaria;Horas;Notas;Coste;Trabajadores;Producto_Fito;Num_Reg_Fito;Dosis_Fito;Plaga;Carnet_Aplicador;Nutrientes_Abono;Cantidad_Abono;Agua_Riego_m3;Kg_Recolectados;Lote_Cosecha\n";

            registros.forEach(r => {
                    const p = parcelas.find(x => x.id == r.parcelaId) || {};
                    const t = trabajos.find(x => x.id == r.trabajoId) || {};
                    const m = maquinaria.find(x => x.id == r.maquinariaId) || {};
    
                    // Función helper para escapar comas/punto-y-comas en CSV
                    const clean = (str) => {
                        if (str === null || str === undefined) return "";
                        let s = String(str).replace(/"/g, '""');
                        if (s.includes(';') || s.includes('"') || s.includes('\n')) {
                            s = `"${s}"`;
                        }
                        return s;
                    };
    
                    const row = [
                        this._formatDate(r.fecha),
                        clean(p.nombre),
                        clean(p.referencia_sigpac),
                        clean(p.superficie),
                        clean(t.nombre),
                        clean(t.tipo_legal || 'general'),
                        clean(m.nombre),
                        clean(r.duracion_horas),
                        clean(r.notas),
                        clean(r.coste),
                    clean(r.nombres_personas ? `${r.num_personas} (${r.nombres_personas})` : r.num_personas),
                    clean(r.producto_fito),
                    clean(r.num_registro_fito),
                    clean(r.dosis),
                    clean(r.plaga),
                    clean(r.carnet_aplicador),
                    clean(r.nutrientes),
                    clean(r.cantidad_abono),
                    clean(r.agua_riego),
                    clean(r.kg_recolectados),
                    clean(r.lote_trazabilidad)
                ];

                csvContent += row.join(';') + "\n";
            });

            // Descargar archivo
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `cuaderno_campo_SIEX_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this._toast('Archivo SIEX (CSV) generado correctamente');

        } catch(err) {
            console.error(err);
            this._toast('Error exportando datos SIEX', 'error');
        }
    }

    // ===============================
    // ALMACÉN
    // ===============================
    async _addAlmacen() {
        const nombre = document.getElementById('alm-nombre').value.trim();
        const tipo = document.getElementById('alm-tipo').value;
        const stock = document.getElementById('alm-stock').value;
        const unidad = document.getElementById('alm-unidad').value.trim();

        const ubicacion = document.getElementById('alm-ubicacion').value.trim();

        if (!nombre) return;

        try {
            await this.store.add('inventario', {
                nombre, tipo, stock: parseFloat(stock) || 0, unidad, ubicacion
            });
            document.getElementById('form-almacen').reset();
            await this._renderAlmacen();
            this._toast(`Producto "${nombre}" añadido al almacén`);
        } catch (err) {
            this._toast('Error al añadir al almacén', 'error');
        }
    }

    async _renderAlmacen() {
        try {
            const inventario = await this.store.getAll('inventario');
            const container = document.getElementById('almacen-list');

            if (inventario.length === 0) {
                container.innerHTML = '<p class="empty-msg">No hay productos en el almacén.</p>';
                return;
            }

            container.innerHTML = inventario.map(i => `
                <div class="list-item" data-id="${i.id}">
                    <div class="list-item-info">
                        <span class="list-item-icon">${i.tipo === 'abono' ? '🌾' : i.tipo === 'herbicida' ? '☠️' : '🧪'}</span>
                        <div>
                            <span class="list-item-name">${this._escapeHTML(i.nombre)}</span>
                            <span class="list-item-meta">
                                ${i.stock} ${i.unidad} · ${this._escapeHTML(i.tipo)}
                                ${i.ubicacion ? ` · 📍 ${this._escapeHTML(i.ubicacion)}` : ''}
                            </span>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-danger btn-sm btn-delete-almacen" data-id="${i.id}">🗑️</button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-delete-almacen').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('¿Eliminar producto?')) {
                        await this.store.delete('inventario', btn.dataset.id);
                        this._renderAlmacen();
                    }
                });
            });
        } catch (err) { console.error(err); }
    }

    // ===============================
    // MAQUINARIA
    // ===============================
    async _addMaquinaria() {
        const nombre = document.getElementById('maq-nombre').value.trim();
        const tipo = document.getElementById('maq-tipo').value.trim();
        const coste = document.getElementById('maq-coste').value;

        if (!nombre) return;

        try {
            await this.store.add('maquinaria', {
                nombre, tipo, coste_hora: parseFloat(coste) || 0
            });
            document.getElementById('form-maquinaria').reset();
            await this._renderMaquinaria();
            this._toast(`Máquina "${nombre}" añadida`);
        } catch (err) {
            this._toast('Error al añadir maquinaria', 'error');
        }
    }

    async _renderMaquinaria() {
        try {
            const maquinaria = await this.store.getAll('maquinaria');
            const container = document.getElementById('maquinaria-list');

            if (maquinaria.length === 0) {
                container.innerHTML = '<p class="empty-msg">No hay maquinaria registrada.</p>';
                return;
            }

            container.innerHTML = maquinaria.map(m => `
                <div class="list-item" data-id="${m.id}">
                    <div class="list-item-info">
                        <span class="list-item-icon">🚜</span>
                        <div>
                            <span class="list-item-name">${this._escapeHTML(m.nombre)}</span>
                            <span class="list-item-meta">${m.tipo ? this._escapeHTML(m.tipo) + ' · ' : ''}${m.coste_hora} €/h</span>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-secondary btn-sm btn-reparaciones-maquinaria" data-id="${m.id}" data-nombre="${this._escapeHTML(m.nombre)}">🔧 Reparaciones</button>
                        <button class="btn btn-danger btn-sm btn-delete-maquinaria" data-id="${m.id}">🗑️</button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-delete-maquinaria').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('¿Eliminar máquina?')) {
                        await this.store.delete('maquinaria', btn.dataset.id);
                        this._renderMaquinaria();
                    }
                });
            });

            container.querySelectorAll('.btn-reparaciones-maquinaria').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._openReparacionesModal(btn.dataset.id, btn.dataset.nombre);
                });
            });
        } catch (err) { console.error(err); }
    }

    _initMaquinariaReparaciones() {
        const modal = document.getElementById('modal-reparaciones');
        const closeBtn = document.getElementById('close-modal-reparaciones');
        const form = document.getElementById('form-reparacion');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this._addReparacion();
            });
        }

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    }

    async _openReparacionesModal(maquinariaId, maquinariaNombre) {
        document.getElementById('reparaciones-maquina-name').textContent = maquinariaNombre;
        document.getElementById('reparacion-maquina-id').value = maquinariaId;
        document.getElementById('reparacion-fecha').valueAsDate = new Date();
        document.getElementById('modal-reparaciones').classList.add('active');
        this._renderReparaciones(maquinariaId);
    }

    async _addReparacion() {
        const maqId = document.getElementById('reparacion-maquina-id').value;
        const fecha = document.getElementById('reparacion-fecha').value;
        const coste = document.getElementById('reparacion-coste').value;
        const desc = document.getElementById('reparacion-desc').value.trim();

        if (!maqId || !fecha || !coste || !desc) return;

        try {
            await this.store.add('maquinaria_reparaciones', {
                maquinariaId: maqId,
                fecha,
                coste: parseFloat(coste) || 0,
                descripcion: desc
            });
            document.getElementById('form-reparacion').reset();
            document.getElementById('reparacion-maquina-id').value = maqId; // Restore ID
            document.getElementById('reparacion-fecha').valueAsDate = new Date(); // Restore date
            await this._renderReparaciones(maqId);
            this._toast('Gasto de reparación añadido');
            
            // Si estamos en dashboard, refrescar para actualizar balance
            if (this.currentSection === 'dashboard') this._renderDashboard();
        } catch (err) {
            this._toast('Error al añadir reparación', 'error');
        }
    }

    async _renderReparaciones(maquinariaId) {
        const container = document.getElementById('reparaciones-list');
        container.innerHTML = '<p class="empty-msg">Cargando reparaciones...</p>';

        try {
            const allRep = await this.store.getAll('maquinaria_reparaciones');
            const repairs = allRep.filter(r => r.maquinariaId == maquinariaId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            if (repairs.length === 0) {
                container.innerHTML = '<p class="empty-msg">No hay registros de reparación para esta máquina.</p>';
                return;
            }

            container.innerHTML = repairs.map(r => `
                <div class="list-item" data-id="${r.id}">
                    <div class="list-item-info">
                        <span class="list-item-icon">🔧</span>
                        <div>
                            <span class="list-item-name">${this._escapeHTML(r.descripcion)}</span>
                            <span class="list-item-meta">${this._formatDate(r.fecha)} · <strong>${r.coste} €</strong></span>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-danger btn-sm btn-delete-reparacion" data-id="${r.id}" data-maq-id="${maquinariaId}">🗑️</button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-delete-reparacion').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('¿Eliminar este registro de gasto?')) {
                        await this.store.delete('maquinaria_reparaciones', btn.dataset.id);
                        this._renderReparaciones(btn.dataset.maqId);
                        if (this.currentSection === 'dashboard') this._renderDashboard();
                    }
                });
            });
        } catch (err) { console.error(err); }
    }

    // ---- Utilities ----
    _formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }



    // ===============================
    // RECORDATORIOS Y NOTIFICACIONES
    // ===============================
    _initMonthlyReminder() {
        const modal = document.getElementById('modal-planning-reminder');
        const closeBtn = document.getElementById('close-modal-reminder');
        const understoodBtn = document.getElementById('btn-close-reminder');
        const notifyBtn = document.getElementById('btn-enable-notifications');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        }
        if (understoodBtn) {
            understoodBtn.addEventListener('click', () => modal.classList.remove('active'));
        }
        if (notifyBtn) {
            notifyBtn.addEventListener('click', () => this._requestNotificationPermission());
        }

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });

        // Verificar si toca mostrarlo (tras un pequeño delay)
        setTimeout(() => this._checkMonthlyReminder(), 2000);
    }

    async _checkMonthlyReminder() {
        // Solo para usuarios logueados
        if (!localStorage.getItem('garuto_user')) return;

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
        const lastMonth = localStorage.getItem('last_planning_reminder_month');

        if (lastMonth !== monthKey) {
            const data = PLANING_DATA[now.getMonth()];
            this._showMonthlyReminder(data);
            localStorage.setItem('last_planning_reminder_month', monthKey);
        }
    }

    _showMonthlyReminder(data) {
        const titleEl = document.getElementById('reminder-title');
        const bodyEl = document.getElementById('reminder-body');
        
        if (!titleEl || !bodyEl) return;

        titleEl.innerHTML = `<span>${data.icon}</span> Tareas de ${data.mes}`;
        
        bodyEl.innerHTML = `
            <div style="background: rgba(163, 214, 94, 0.1); padding: 1.2rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px dashed var(--pistachio-400);">
                <p style="color: var(--pistachio-300); font-weight: 600; font-size: 1rem; line-height: 1.5; margin: 0;">
                    "${data.consejo}"
                </p>
            </div>
            <h4 style="margin-bottom: 1rem; color: var(--text-primary); font-size: 1.1rem;">🛠️ Labores Críticas:</h4>
            <ul style="list-style: none; padding: 0; margin: 0;">
                ${data.tareas.map(t => `
                    <li style="display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                        <span style="font-size: 1.4rem; line-height: 1;">${t.i}</span>
                        <span style="font-size: 0.95rem;">${this._escapeHTML(t.t)}</span>
                    </li>
                `).join('')}
            </ul>
        `;

        document.getElementById('modal-planning-reminder').classList.add('active');

        // Además, intentar enviar notificación de sistema si hay permiso
        this._sendSystemNotification(data);
    }

    async _requestNotificationPermission() {
        if (!('Notification' in window)) {
            this._toast('Tu navegador no soporta notificaciones', 'error');
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            this._toast('✅ Notificaciones activadas', 'success');
            // Probar una
            new Notification('Garuto', {
                body: '¡Perfecto! Te avisaré de las tareas importantes cada mes.',
                icon: 'icon-192x192.png'
            });
        } else {
            this._toast('No se han podido activar las notificaciones', 'warning');
        }
    }

    async _sendSystemNotification(data) {
        if (Notification.permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.ready;
                registration.showNotification(`Garuto: Tareas de ${data.mes}`, {
                    body: data.consejo,
                    icon: 'icon-192x192.png',
                    vibrate: [200, 100, 200],
                    tag: 'monthly-planning',
                    data: { url: window.location.href }
                });
            } catch (err) {
                console.warn("Error enviando notificación SW:", err);
            }
        }
    }

    // ===============================
    // ASISTENTE IA: PISTACHÍN
    // ===============================
    _initPistachin() {
        this.pistachin = new PistachinBot(this);
    }
}

/**
 * Clase para el Asistente Inteligente Pistachín
 */
class PistachinBot {
    constructor(parentApp) {
        this.app = parentApp;
        this.isOpen = false;
        
        this.container = document.getElementById('pistachin-chat');
        this.toggleBtn = document.getElementById('pistachin-toggle');
        this.closeBtn = document.getElementById('pistachin-close');
        this.form = document.getElementById('pistachin-form');
        this.input = document.getElementById('pistachin-input');
        this.messagesArea = document.getElementById('pistachin-messages');
        this.quickActionsArea = document.getElementById('pistachin-quick-actions');
        this.alerts = [];

        this._initEvents();
        
        // Carga inicial de alertas y sugerencias
        setTimeout(() => {
            this.checkAlerts();
            this._renderQuickActions();
        }, 1500);
    }

    _initEvents() {
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.closeBtn.addEventListener('click', () => this.close());
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSend();
        });
    }

    _renderQuickActions() {
        const actions = [
            { label: '📊 Resumen económico', query: 'cuanto he gastado este año' },
            { label: '🌤️ Previsión campo', query: 'mejor momento para trabajar' },
            { label: '💾 Exportar SIEX', query: 'como exportar cuaderno' },
            { label: '📍 Mis parcelas', query: 'resumen de mis parcelas' },
            { label: '💡 Consejo del mes', query: 'que tengo que hacer este mes' }
        ];

        this.quickActionsArea.innerHTML = actions.map(a => `
            <button class="quick-action-btn" data-query="${a.query}">${a.label}</button>
        `).join('');

        this.quickActionsArea.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.input.value = btn.dataset.query;
                this.handleSend();
            });
        });
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.container.classList.toggle('active', this.isOpen);
        if (this.isOpen) {
            this.input.focus();
            this._scrollToBottom();
            if (this.alerts.length > 0) this._showPendingAlerts();
        }
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('active');
    }

    handleSend() {
        const text = this.input.value.trim();
        if (!text) return;

        this._addMessage(text, 'user');
        this.input.value = '';
        setTimeout(() => this.processQuery(text), 600);
    }

    _addMessage(text, side) {
        const msg = document.createElement('div');
        msg.className = `message ${side}`;
        msg.innerHTML = text;
        this.messagesArea.appendChild(msg);
        this._scrollToBottom();
    }

    async checkAlerts() {
        try {
            const inventario = await this.app.store.getAll('inventario');
            const registros = await this.app.store.getAll('registros');
            this.alerts = [];

            // 1. Alerta de Stock
            const lowStock = inventario.filter(i => parseFloat(i.stock) < 10);
            if (lowStock.length > 0) {
                this.alerts.push({
                    type: 'stock',
                    msg: `⚠️ **Aviso de Almacén**: Tienes poco stock de ${lowStock.length} productos. Especialmente <b>${lowStock[0].nombre}</b>.`
                });
            }

            // 2. Alerta de Tarea Pendiente (Planing)
            const currentMonth = new Date().getMonth();
            const year = new Date().getFullYear();
            const planning = PLANING_DATA[currentMonth];
            
            for (const tarea of planning.tareas) {
                const done = registros.some(r => {
                    const rDate = new Date(r.fecha);
                    return rDate.getMonth() === currentMonth && rDate.getFullYear() === year && 
                           (r.notas.toLowerCase().includes(tarea.t.toLowerCase()) || r.notas.toLowerCase().includes('poda'));
                });
                
                if (!done) {
                    this.alerts.push({
                        type: 'planning',
                        msg: `🕒 **Labor de ${planning.mes}**: No he encontrado registros de "${tarea.t}". ¿La has realizado ya?`
                    });
                    break; // Solo una sugerencia de planning a la vez
                }
            }

            this._updateFABStatus();
        } catch (err) {
            console.error('Pistachin error:', err);
        }
    }

    _updateFABStatus() {
        if (this.alerts.length > 0) {
            this.toggleBtn.classList.add('has-alert');
        } else {
            this.toggleBtn.classList.remove('has-alert');
        }
    }

    _showPendingAlerts() {
        if (this.alerts.length === 0) return;
        
        setTimeout(() => {
            this._addMessage("¡Hola! He analizado los datos y te sugiero:", 'bot');
            this.alerts.forEach((alert, index) => {
                setTimeout(() => this._addMessage(alert.msg, 'bot'), (index + 1) * 800);
            });
            this.toggleBtn.classList.remove('has-alert');
        }, 400);
    }

    _scrollToBottom() {
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    }

    async processQuery(text) {
        const query = text.toLowerCase();
        let response = "";

        // --- 1. CLIMA DINÁMICO ---
        if (query.includes('clima') || query.includes('tiempo') || query.includes('meteo') || query.includes('llover') || query.includes('trabajar')) {
            const adviceBox = document.querySelector('.advice-box');
            if (adviceBox) {
                response = `He consultado el servicio meteorológico: <b>${adviceBox.textContent}</b>.`;
            } else {
                response = "Parece que hoy hará un tiempo estable en Viso del Marqués. ¡Buen día para el campo!";
            }
        } 
        // --- 2. RESUMEN GASTOS / ECONOMÍA ---
        else if (query.includes('gasto') || query.includes('dinero') || query.includes('coste') || query.includes('económico')) {
            const registros = await this.app.store.getAll('registros');
            const esteAno = new Date().getFullYear();
            const total = registros.reduce((sum, r) => {
                const rYear = new Date(r.fecha).getFullYear();
                return rYear === esteAno ? sum + (parseFloat(r.coste) || 0) : sum;
            }, 0);
            response = `En lo que va de año (${esteAno}), el coste total registrado en actividades es de <b>${total.toFixed(2)}€</b>.`;
        }
        // --- 3. RESUMEN DE PARCELAS ---
        else if (query.includes('parcela') || query.includes('hectárea') || query.includes('superficie')) {
            const parcelas = await this.app.store.getAll('parcelas');
            const totalHas = parcelas.reduce((sum, p) => sum + (parseFloat(p.superficie) || 0), 0);
            response = `Gestionas un total de <b>${parcelas.length} parcelas</b> con una superficie de <b>${totalHas.toFixed(2)} Has</b>.`;
            if (parcelas.length > 0) {
                const mayor = [...parcelas].sort((a,b) => b.superficie - a.superficie)[0];
                response += ` Tu parcela más grande es "${mayor.nombre}" (${mayor.superficie} Has).`;
            }
        }
        // --- 4. ULTIMO RIEGO O TAREA ESPECIFICA ---
        else if (query.includes('cuándo') || query.includes('ultimo') || query.includes('último')) {
            const registros = await this.app.store.getAll('registros');
            const trabajos = await this.app.store.getAll('trabajos');
            
            let searchType = "";
            if (query.includes('riego')) searchType = "riego";
            else if (query.includes('poda')) searchType = "poda";
            else if (query.includes('abono')) searchType = "abono";
            else if (query.includes('fito')) searchType = "fitosanitario";

            if (searchType) {
                const tIds = trabajos.filter(t => t.nombre.toLowerCase().includes(searchType) || t.tipo_legal === searchType).map(t => t.id);
                const match = registros.filter(r => tIds.includes(parseInt(r.trabajoId))).sort((a,b) => new Date(b.fecha) - new Date(a.fecha))[0];
                
                if (match) {
                    const parcela = await this.app.store.getById('parcelas', match.parcelaId);
                    response = `El último registro de ${searchType} fue el <b>${new Date(match.fecha).toLocaleDateString()}</b> en la parcela "${parcela.nombre}".`;
                } else {
                    response = `No he encontrado registros recientes de ${searchType} en el cuaderno de campo.`;
                }
            } else {
                response = "¿Sobre qué labor quieres saber la última fecha? Pregúntame por ejemplo por el último riego.";
            }
        }
        // --- 5. SIEX / EXPORTAR ---
        else if (query.includes('siex') || query.includes('exportar') || query.includes('cuaderno')) {
            response = "Para el SIEX, recuerda que los tratamientos fitosanitarios deben llevar el <b>nº de registro</b>. Puedes exportar todo desde Ajustes > Exportar CSV.";
        }
        // --- 6. CONSEJO / PLANING ---
        else if (query.includes('hacer') || query.includes('consejo') || query.includes('plan')) {
            const month = new Date().getMonth();
            const plan = PLANING_DATA[month];
            response = `Estamos en ${plan.mes}. Mi consejo: <i>"${plan.consejo}"</i>. Las tareas clave son: ${plan.tareas.map(t => t.t).join(', ')}.`;
        }
        // --- 7. NAVEGACIÓN ---
        else if (query.includes('ir a') || query.includes('llévame') || query.includes('pantalla')) {
            if (query.includes('parcela')) { this.app._navigateTo('parcelas'); response = "¡Vamos a las parcelas!"; }
            else if (query.includes('almacén') || query.includes('inventario')) { this.app._navigateTo('almacen'); response = "Entrando al almacén..."; }
            else if (query.includes('registrar')) { this.app._navigateTo('registrar'); response = "Listo para anotar una labor."; }
            else if (query.includes('maquinaria')) { this.app._navigateTo('maquinaria'); response = "Abriendo el garaje de maquinaria."; }
            else { response = "Dime dónde quieres ir: Parcelas, Inventario, Registro, Maquinaria..."; }
        }
        // --- SALUDO ---
        else if (query.includes('hola') || query.includes('qué tal')) {
            response = "¡Hola! Todo en orden por aquí. Listo para ayudarte con tu explotación de pistachos. <img src=\"nut.png\" style=\"width: 18px; vertical-align: middle;\">";
        }
        else {
            response = "Interesante pregunta... como asistente especializado en pistachos, puedo darte datos de tus parcelas, resumen de gastos o consejos según el mes. ¿Qué prefieres?";
        }

        this._addMessage(response, 'bot');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GarutoApp();
});
