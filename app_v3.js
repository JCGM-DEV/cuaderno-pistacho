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
        this.csrfToken = ''; // Will be set on login/checkSession
        
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
            credentials: 'include',
            headers: {}
        };

        if (this.csrfToken) {
            options.headers['X-CSRF-Token'] = this.csrfToken;
        }
        
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
            credentials: 'include',
            headers: {}
        };

        if (this.csrfToken) {
            options.headers['X-CSRF-Token'] = this.csrfToken;
        }

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

    // ---- Export / Import ----
    async exportJSON() {
        const data = await this._fetch('export');
        return JSON.stringify(data, null, 2);
    }

    async importJSON(jsonData) {
        return this._fetch('import', {}, jsonData);
    }

    async exportSIEX() {
        const url = `${this.apiUrl}?action=exportSIEX`;
        window.location.href = url; // Standard download
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
        
        // Data state initialization (prevent "undefined" errors)
        this.finanzas = [];
        this.maquinaria = [];
        this.almacen = [];
        this.registros_galeria = [];
        this.cosechas_ventas = [];
        this._appCoreInitialized = false;

        this._initAuth();
    }

    // New method to initialize the rest of the app ONLY after auth is confirmed
    _initAppCore() {
        if (this._appCoreInitialized) return;
        this._appCoreInitialized = true;
        
        // Load data in background
        this._loadInitialData();

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
        this._initFinanzas();
        this._initCosechas();
        this._initPistachin();
        this._initUISounds();

        this._initMonthlyReminder();
        this._initConnectivity();
        this._initUnauthorizedHandler();
        this._initSignaturePad();
        this._initPasswordManager();
    }

    _initPasswordManager() {
        const form = document.getElementById('form-change-password');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleChangePassword();
            });
        }
        
        const userForm = document.getElementById('form-manage-user');
        if (userForm) {
            userForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSaveUser();
            });
        }

        // Add button to ajustes section dynamically if not there
        const ajustesGrid = document.querySelector('#section-ajustes .dashboard-grid');
        if (ajustesGrid) {
            // Card: Seguridad (Todos)
            const securityCard = document.createElement('div');
            securityCard.className = 'card premium-card animate-fade-in-up';
            securityCard.style.borderLeft = '4px solid var(--gold-500)';
            securityCard.innerHTML = `
                <h3>🔐 Seguridad de la Cuenta</h3>
                <p style="color:var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.2rem;">Mantén tu cuenta protegida cambiando tu contraseña periódicamente.</p>
                <button class="btn btn-secondary btn-full" onclick="app._toggleModal('modal-password', true)">
                    Cambiar Mi Contraseña
                </button>
            `;
            ajustesGrid.appendChild(securityCard);

            // Card: Gestión de Usuarios (Admin solamente)
            if (this.currentUser && this.currentUser.role === 'admin') {
                const adminCard = document.createElement('div');
                adminCard.className = 'card premium-card animate-fade-in-up';
                adminCard.style.borderLeft = '4px solid var(--primary)';
                adminCard.innerHTML = `
                    <h3>👥 Gestión de Usuarios</h3>
                    <p style="color:var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.2rem;">Administra el personal, sus roles y accesos a la plataforma.</p>
                    <button class="btn btn-primary btn-full" onclick="app._openUserManagement()">
                        Administrar Usuarios
                    </button>
                `;
                ajustesGrid.appendChild(adminCard);
            }
        }
    }

    // ---- User Management (Admin CRUD) ----
    async _openUserManagement() {
        this._toggleModal('modal-usuarios-lista', true);
        this._renderUserList();
    }

    async _renderUserList() {
        const tbody = document.getElementById('usuarios-table-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando usuarios...</td></tr>';

        try {
            const res = await this.store._fetch('getUsers');
            if (!res.success) throw new Error(res.error);

            tbody.innerHTML = '';
            res.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${u.username}</strong></td>
                    <td>${u.display_name}</td>
                    <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-secondary'}">${u.role.toUpperCase()}</span></td>
                    <td>
                        <button class="btn btn-icon" onclick="app._openUserForm(${JSON.stringify(u).replace(/"/g, '&quot;')})" title="Editar">✏️</button>
                        <button class="btn btn-icon" onclick="app._handleDeleteUser(${u.id})" title="Eliminar" style="color:var(--danger)">🗑️</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error: ${err.message}</td></tr>`;
        }
    }

    _openUserForm(user = null) {
        const modal = document.getElementById('modal-usuario-form');
        const title = document.getElementById('user-form-title');
        const form = document.getElementById('form-manage-user');

        form.reset();
        document.getElementById('manage-user-id').value = user ? user.id : '';
        document.getElementById('manage-user-username').value = user ? user.username : '';
        document.getElementById('manage-user-display').value = user ? user.display_name : '';
        document.getElementById('manage-user-email').value = user ? (user.email || '') : '';
        document.getElementById('manage-user-phone').value = user ? (user.telefono || '') : '';
        document.getElementById('manage-user-role').value = user ? user.role : 'usuario';
        
        // El username no debería cambiarse si es admin para evitar líos?
        // document.getElementById('manage-user-username').disabled = !!user;

        title.textContent = user ? `👤 Editar Usuario: ${user.username}` : '👤 Nuevo Usuario';
        this._toggleModal('modal-usuario-form', true);
    }

    async _handleSaveUser() {
        const id = document.getElementById('manage-user-id').value;
        const username = document.getElementById('manage-user-username').value;
        const display_name = document.getElementById('manage-user-display').value;
        const email = document.getElementById('manage-user-email').value;
        const telefono = document.getElementById('manage-user-phone').value;
        const password = document.getElementById('manage-user-password').value;
        const role = document.getElementById('manage-user-role').value;

        try {
            const res = await this.store._fetch('saveUser', {}, {
                id, username, display_name, email, telefono, password, role
            });
            if (res.success) {
                this._toast(id ? '✅ Usuario actualizado' : '✅ Usuario creado', 'success');
                this._toggleModal('modal-usuario-form', false);
                this._renderUserList();
            }
        } catch (err) {
            this._toast(err.message || 'Error al guardar usuario', 'error');
        }
    }

    async _handleDeleteUser(id) {
        if (!await this._confirm('¿Estás seguro de que deseas eliminar este usuario? No se puede deshacer.')) return;

        try {
            const res = await this.store._fetch(`deleteUser&id=${id}`);
            if (res.success) {
                this._toast('✅ Usuario eliminado', 'success');
                this._renderUserList();
            }
        } catch (err) {
            this._toast(err.message || 'Error al eliminar usuario', 'error');
        }
    }

    async _handleChangePassword() {
        const oldPass = document.getElementById('pass-old').value;
        const newPass = document.getElementById('pass-new').value;
        const confirmPass = document.getElementById('pass-confirm').value;

        if (newPass !== confirmPass) {
            this._toast('Las contraseñas no coinciden', 'error');
            return;
        }

        try {
            const res = await this.store._fetch('changePassword', {}, { oldPassword: oldPass, newPassword: newPass });
            if (res.success) {
                this._toast('✅ Contraseña actualizada correctamente', 'success');
                this._toggleModal('modal-password', false);
                document.getElementById('form-change-password').reset();
            }
        } catch (err) {
            this._toast(err.message || 'Error al cambiar contraseña', 'error');
        }
    }

    async _loadInitialData() {
        try {
            const [fin, maq, alm, p, r] = await Promise.all([
                this.store.getAll('finanzas'),
                this.store.getAll('maquinaria'),
                this.store.getAll('inventario'),
                this.store.getAll('parcelas'),
                this.store.getAll('registros')
            ]);
            this.finanzas = fin || [];
            this.maquinaria = maq || [];
            this.almacen = alm || [];
            // Refresh dashboard once data is in
            if (this.currentSection === 'dashboard') this._renderDashboard();
        } catch (err) {
            console.error('Error loading initial data:', err);
        }
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

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleLogin();
            });
        }

        if (logoutBtn) logoutBtn.addEventListener('click', () => this._handleLogout());
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
                this.store.csrfToken = res.csrfToken;
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
                this.store.csrfToken = res.csrfToken;
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
        this.store.csrfToken = '';

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
        try {
            this._navigateTo(this.currentSection);
        } catch (err) {
            console.error('Error in initial navigation:', err);
        }
        
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
        if (!this.currentUser) {
            this._handleLogout();
            return;
        }
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
            case 'mercado': this._renderMercado(); break;
            case 'perfil': 
                this._renderProfile(); 
                if (this.resizeSignaturePad) this.resizeSignaturePad();
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
            case 'finanzas': this._renderFinanzas(); break;
            case 'cosechas': this._renderCosechas(); break;
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

    // ---- Toast (Premium Notifications) ----
    _confirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirm');
            document.getElementById('modal-confirm-msg').textContent = message;
            modal.classList.add('active');

            const handleCancel = () => { cleanup(); resolve(false); };
            const handleOk = () => { cleanup(); resolve(true); };

            const btnCancel = document.getElementById('btn-confirm-cancel');
            const btnOk = document.getElementById('btn-confirm-ok');

            btnCancel.addEventListener('click', handleCancel);
            btnOk.addEventListener('click', handleOk);

            function cleanup() {
                modal.classList.remove('active');
                btnCancel.removeEventListener('click', handleCancel);
                btnOk.removeEventListener('click', handleOk);
            }
        });
    }

    _toast(message, type = 'success', duration = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || '🔔'}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Auto remove with fade out
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    _toggleModal(modalId, show) {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (show) modal.classList.add('active');
            else modal.classList.remove('active');
        }
    }

    // ===============================
    // DASHBOARD
    // ===============================
    async _renderDashboard() {
        try {
            let parcelas = await this.store.getAll('parcelas') || []; if (!Array.isArray(parcelas)) parcelas = [];
            let trabajos = await this.store.getAll('trabajos') || []; if (!Array.isArray(trabajos)) trabajos = [];
            let registros = await this.store.getAll('registros') || []; if (!Array.isArray(registros)) registros = [];
            let finanzas = await this.store.getAll('finanzas') || []; if (!Array.isArray(finanzas)) finanzas = [];
            this.finanzas = finanzas; // Sync global state

            // Stats
            const elP = document.getElementById('stat-parcelas');
            const elR = document.getElementById('stat-registros');
            if (elP) { elP.textContent = parcelas.length; elP.classList.remove('skeleton'); }
            if (elR) { elR.textContent = registros.length; elR.classList.remove('skeleton'); }

            const totalHa = parcelas.reduce((sum, p) => sum + (parseFloat(p.superficie) || 0), 0);
            const elHa = document.getElementById('stat-ha');
            if (elHa) { elHa.textContent = totalHa.toFixed(2); elHa.classList.remove('skeleton'); }

            // This month
            const now = new Date();
            const mesActual = now.getMonth();
            const anioActual = now.getFullYear();
            const esteMes = registros.filter(r => {
                const d = new Date(r.fecha);
                return d.getMonth() === mesActual && d.getFullYear() === anioActual;
            });
            const elMes = document.getElementById('stat-mes');
            if (elMes) { elMes.textContent = esteMes.length; elMes.classList.remove('skeleton'); }

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

            // Global Balance (From Finanzas table)
            const globalBalance = (finanzas || []).reduce((sum, f) => {
                const val = parseFloat(f.monto) || 0;
                return f.tipo === 'ingreso' ? sum + val : sum - val;
            }, 0);

            const saldoEl = document.getElementById('stat-saldo');
            if (saldoEl) {
                saldoEl.innerHTML = `${globalBalance.toFixed(2)} <span class="currency-symbol">€</span>`;
                saldoEl.style.color = globalBalance >= 0 ? '#a3d65e' : '#ef5350';
                saldoEl.classList.remove('skeleton');
            }

            // Economic Balance (Current Year - for KPIs)
            const currentYear = new Date().getFullYear();
            const yearRecords = registros.filter(r => new Date(r.fecha).getFullYear() === currentYear);
            
            // Sumar también gastos/ingresos de finanzas del año actual
            const yearFinanzas = (finanzas || []).filter(f => new Date(f.fecha).getFullYear() === currentYear);
            const totalBalance = yearFinanzas.reduce((sum, f) => {
                const val = parseFloat(f.monto) || 0;
                return f.tipo === 'ingreso' ? sum - val : sum + val; // Balance format for KPIs (expense positive)
            }, 0);
            
            const moneyEl = document.getElementById('stat-money');
            if (totalBalance > 0) {
                moneyEl.innerHTML = `-${totalBalance.toFixed(2)} <span class="currency-symbol">€</span>`;
                moneyEl.style.color = '#ef5350'; 
            } else if (totalBalance < 0) {
                moneyEl.innerHTML = `+${Math.abs(totalBalance).toFixed(2)} <span class="currency-symbol">€</span>`;
                moneyEl.style.color = '#a3d65e';
            } else {
                moneyEl.innerHTML = `0.00 <span class="currency-symbol">€</span>`;
                if (moneyEl) moneyEl.style.color = 'var(--text-accent)';
            }
            if (moneyEl) {
                 moneyEl.classList.remove('skeleton');
            }

            // Fase 3: Precio Mercado Widget
            const precioEl = document.getElementById('stat-precio-mercado');
            if (precioEl) {
                precioEl.innerText = '5.40 €'; 
                precioEl.classList.remove('skeleton');
            }

            this._renderDashboardKPIs(parcelas, yearRecords, totalBalance);

            // Fase 3: Insights Históricos
            await this._generateHistoricalInsights(registros);

            // Render Charts
            this._renderCharts(registros, trabajos);

            // Background Logic (Awaited to catch errors if needed, but not blocking stats)
            if (this._fetchWeather && this._checkPestAlerts) {
                await Promise.allSettled([
                    this._fetchWeather(),
                    this._checkPestAlerts()
                ]);
            }

        } catch (err) {
            console.error('Error cargando dashboard:', err);
            this._toast('Error carga dashboard: ' + err.message, 'error');
        }
    }

    // ===============================
    // FASE 2: INTELIGENCIA Y AUTOMATIZACIÓN
    // ===============================

    /**
     * Motor de Alertas de Plagas (Pistachín AI)
     */
    async _checkPestAlerts() {
        const container = document.getElementById('pest-alerts-container');
        if (!container) return;
        container.innerHTML = '';

        const now = new Date();
        const month = now.getMonth(); 
        
        const currentTemp = 22; 
        const currentHumidity = 65;
        const alerts = [];

        // Psila del Pistacho: Marzo a Agosto
        if (month >= 2 && month <= 8 && currentTemp > 18 && currentHumidity > 50) {
            alerts.push({
                pest: 'Psila del Pistacho', icon: '🦟',
                desc: 'Condiciones de alta humedad y temperatura óptimas (Alerta de Marzo).',
                action: 'Ver Tratamientos'
            });
        }

        // Clytra: Marzo a Mayo
        if (month >= 2 && month <= 5 && currentTemp > 20) {
            alerts.push({
                pest: 'Clytra (Escarabajuelo)', icon: '🪲',
                desc: 'Alerta por inicio de brotación temprana detectada.',
                action: 'Guía Vigilancia'
            });
        }

        if (alerts.length === 0) return;

        alerts.forEach(alert => {
            const div = document.createElement('div');
            div.className = 'pest-alert-card';
            div.innerHTML = `
                <div class="pest-alert-icon">${alert.icon}</div>
                <div class="pest-alert-content">
                    <h4>⚠️ ALERTA: ${alert.pest}</h4>
                    <p>${alert.desc}</p>
                </div>
                <button class="pest-alert-action" onclick="app._showPestDetail('${alert.pest.includes('Psila') ? 'psila' : 'clytra'}')">${alert.action}</button>
            `;
            container.appendChild(div);
        });
    }

    _showPestDetail(type) {
        const modal = document.getElementById('modal-pest-detail');
        if (!modal) return;

        const data = {
            psila: {
                t: 'Psila del Pistacho (Agonoscena pistaciae)',
                i: '🦟',
                d: 'La psila es una de las plagas más comunes. Succionan la savia y segregan una melaza pegajosa que favorece la aparición de negrilla.',
                r: '<ul><li><b>Tratamiento Químico:</b> Abamectina 1.8%, Spirotetramat o Sulfoxaflor.</li><li><b>Ecológico:</b> Jabón potásico o aceites para lavar la melaza.</li><li><b>Control Biológico:</b> Respetar poblaciones de Anthocoris nemoralis.</li></ul>'
            },
            clytra: {
                t: 'Clytra (Escarabajuelo del Pistacho)',
                i: '🪲',
                d: 'Aparecen con la brotación. Los adultos se alimentan de las hojas tiernas, pudiendo defoliar injertos jóvenes en pocos días.',
                r: '<ul><li><b>Tratamiento:</b> Deltametrina o Lambda-Cialotrin.</li><li><b>Manual:</b> En árboles jóvenes, recogida manual de adultos en las primeras horas del día.</li><li><b>Prevención:</b> Vigilar especialmente parcelas cercanas a monte o pastos.</li></ul>'
            }
        };

        const pest = data[type];
        if (!pest) return;

        document.getElementById('pest-modal-title').innerText = pest.t;
        document.getElementById('pest-modal-icon').innerText = pest.i;
        document.getElementById('pest-modal-desc').innerText = pest.d;
        document.getElementById('pest-modal-treatments').innerHTML = pest.r;

        modal.style.display = 'flex';
    }

    // ===============================
    // FASE 3: INTELIGENCIA Y MERCADO
    // ===============================

    async _renderMarket() {
        const listContainer = document.getElementById('market-prices-list');
        const adviceEl = document.getElementById('market-advice');
        if (!listContainer) return;

        // Mock de datos de lonja (Tendencia simulada)
        const prices = [
            { name: 'Kerman (Cerrado 18/20)', price: '5.40€', trend: '+0.05', up: true },
            { name: 'Kerman (Cerrado 20/22)', price: '5.10€', trend: '-0.02', up: false },
            { name: 'Larnaka (Grano)', price: '12.50€', trend: '+0.15', up: true },
            { name: 'Pistacho Ecológico', price: '7.85€', trend: '+0.10', up: true }
        ];

        listContainer.innerHTML = prices.map(p => `
            <div class="market-price-item">
                <span class="price-name">${p.name}</span>
                <div>
                    <span class="price-value">${p.price}</span>
                    <span class="price-trend ${p.up ? 'trend-up' : 'trend-down'}">${p.up ? '▲' : '▼'} ${p.trend}</span>
                </div>
            </div>
        `).join('');

        adviceEl.innerText = "Pistachín AI dice: La demanda de Larnaka está subiendo en Europa. Si tienes stock seco, podría ser buen momento para negociar contratos de exportación. El Kerman convencional se mantiene estable.";

        this._renderMarketChart();
    }

    _renderMarketChart() {
        const ctx = document.getElementById('market-trend-chart');
        if (!ctx) return;
        
        if (this.marketChart) this.marketChart.destroy();

        this.marketChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                datasets: [{
                    label: 'Pistacho Kerman (€/kg)',
                    data: [4.8, 4.9, 5.0, 5.2, 5.15, 5.4],
                    borderColor: '#a3d65e',
                    backgroundColor: 'rgba(163, 214, 94, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                }
            }
        });
    }

    async _generateHistoricalInsights(registros) {
        const container = document.getElementById('insights-container');
        if (!container) return;
        container.innerHTML = ''; 

        const hasOldData = registros.some(r => new Date(r.fecha).getFullYear() < new Date().getFullYear());
        let message = "";
        if (!hasOldData) {
            message = "Pistachín AI sugiere: Según el histórico de la zona, el abonado de fondo en parcelas de secano debería completarse antes del final de Marzo para aprovechar la humedad acumulada.";
        } else {
            message = "Análisis Histórico: El año pasado en estas fechas iniciaste la poda de formación. La parcela 'La Solana' respondió mejor al tratamiento fito de Abril que de Mayo. Sugerimos adelantar este año.";
        }

        container.innerHTML = `
            <div class="historical-insight-card animate-fade-in-up">
                <div class="insight-icon">💡</div>
                <div class="insight-content">
                    <h4>Insight Inteligente</h4>
                    <p>${message}</p>
                </div>
            </div>
        `;
    }

    _openScanner() {
        document.getElementById('modal-scanner').style.display = 'flex';
        if (typeof Html5Qrcode === 'undefined') {
            this._toast('Librería de escaneo no cargada', 'error');
            return;
        }
        if (!this.html5QrCode) this.html5QrCode = new Html5Qrcode("scanner-reader");
        const config = { fps: 10, qrbox: { width: 250, height: 150 } };
        this.html5QrCode.start({ facingMode: "environment" }, config, (t) => this._onScanSuccess(t))
            .catch(err => { console.error(err); this._toast('Error acceso cámara', 'error'); this._stopScanner(); });
    }

    _stopScanner() {
        document.getElementById('modal-scanner').style.display = 'none';
        if (this.html5QrCode && this.html5QrCode.isScanning) this.html5QrCode.stop().catch(() => {});
    }

    _onScanSuccess(decodedText) {
        this._stopScanner();
        const db = {
            "8412345678901": { n: "Abamectina 1.8% CE", r: "25048" },
            "8411122233344": { n: "Glifosato Premium", r: "18920" }
        };
        const prod = db[decodedText];
        if (prod) {
            document.getElementById('reg-fito-producto').value = prod.n;
            document.getElementById('reg-fito-nregistro').value = prod.r;
            this._toast(`✅ Detectado: ${prod.n}`, 'success');
        } else {
            document.getElementById('reg-fito-nregistro').value = decodedText;
            this._toast('Código reconocido', 'warning');
        }
    }

    _showTraceabilityQR(lote) {
        if (typeof QRCode === 'undefined') { this._toast('Librería QR no cargada', 'error'); return; }
        const container = document.getElementById('qrcode');
        container.innerHTML = '';
        document.getElementById('modal-qr').style.display = 'flex';
        new QRCode(container, { text: `https://tituta.es/garuco/t/${lote}`, width: 200, height: 200 });
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

        const canvasCosts = document.getElementById('chart-costs');
        if (!canvasCosts) return;
        const ctxCosts = canvasCosts.getContext('2d');
        if (!ctxCosts) return;

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
        const canvasTypes = document.getElementById('chart-types');
        if (!canvasTypes) return;
        const ctxTypes = canvasTypes.getContext('2d');
        if (!ctxTypes) return;

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
            // Coordenadas de Viso del Marqués
            const LAT = 38.52;
            const LON = -3.73;
            // Enhanced API Query
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,uv_index,visibility,weather_code&hourly=precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=Europe%2FMadrid`;
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error al obtener el clima');
            
            const data = await res.json();
            this.latestWeather = data; // Store for Pistachín
            const current = data.current;
            const daily = data.daily;
            
            // Actualizar UI - Valores principales
            if (document.getElementById('weather-status')) document.getElementById('weather-status').textContent = 'Actualizado ahora';
            if (document.getElementById('weather-temp')) document.getElementById('weather-temp').textContent = Math.round(current.temperature_2m);
            if (document.getElementById('weather-wind')) {
                const windDir = this._getWindDirection(current.wind_direction_10m);
                document.getElementById('weather-wind').textContent = `${Math.round(current.wind_speed_10m)} km/h ${windDir}`;
            }
            if (document.getElementById('weather-humidity')) document.getElementById('weather-humidity').textContent = `${current.relative_humidity_2m}%`;
            
            // Probabilidad de lluvia (próxima hora)
            const rainProb = data.hourly.precipitation_probability[0];
            if (document.getElementById('weather-rain')) document.getElementById('weather-rain').textContent = `${rainProb}%`;

            // NUEVOS CAMPOS
            if (document.getElementById('weather-uv')) document.getElementById('weather-uv').textContent = current.uv_index.toFixed(1);
            if (document.getElementById('weather-visibility')) document.getElementById('weather-visibility').textContent = `${(current.visibility / 1000).toFixed(1)} km`;
            
            if (document.getElementById('weather-sun')) {
                const sunrise = daily.sunrise[0].split('T')[1];
                const sunset = daily.sunset[0].split('T')[1];
                document.getElementById('weather-sun').textContent = `${sunrise} / ${sunset}`;
            }
            
            // Elegir icono principal
            const elIcon = document.getElementById('weather-icon');
            if (elIcon) elIcon.innerHTML = this._getWeatherIcon(current.weather_code);
            
            // Generar consejo agronómico
            this._generateWeatherAdvice(current, rainProb);
            
            // Previsión a 7 días
            const weekContainer = document.getElementById('weather-week-forecast');
            if (weekContainer && daily) {
                let weekHTML = '';
                const daysName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                
                for(let i=0; i<7; i++) {
                    const dateArr = daily.time[i].split('-');
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
            if (document.getElementById('weather-status')) document.getElementById('weather-status').textContent = 'Error de conexión';
        }
    }

    _getWindDirection(degree) {
        const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
        return sectors[Math.round(degree / 45) % 8];
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
        } else if (current.uv_index > 7) {
            advice = '☀️ Índice UV muy alto. Evite trabajos físicos intensos en las horas centrales y use protección solar.';
            type = 'warning';
        } else if (current.visibility < 1000) {
            advice = '🌫️ Visibilidad muy reducida. Precaución en el transporte de maquinaria pesada por caminos y carreteras.';
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

        // Capas base profesionales
        const osm = L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
        
        const ignPnoa = L.tileLayer.wms('https://www.ign.es/wms-inspire/pnoa-ma', {
            layers: 'OI.OrthoimageCoverage',
            format: 'image/png',
            transparent: true,
            attribution: '© Instituto Geográfico Nacional'
        });

        const catastroWms = L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
            layers: 'Catastro',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            attribution: '© Sede Electrónica del Catastro'
        });

        const sigpacOfficial = L.tileLayer.wms('https://wms.mapa.gob.es/sigpac/wms', {
            layers: 'PARCELA,RECINTO',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            attribution: '© SIGPAC / MAPA'
        });

        const sigpacMirror = L.tileLayer.wms('https://sigpac-hubcloud.es/wms', {
            layers: 'parcela,recinto',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            attribution: '© SIGPAC Mirror'
        });

        const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',{
            maxZoom: 20,
            subdomains:['mt0','mt1','mt2','mt3'],
            attribution: '© Google Maps'
        });

        // Añadir Google Satélite por defecto
        googleSat.addTo(this.map);
        sigpacOfficial.addTo(this.map); // Superponer SIGPAC por defecto

        // Control de capas (Visible en la esquina superior derecha)
        const baseMaps = {
            "Satélite (Google)": googleSat,
            "Ortofoto Real (IGN/PNOA)": ignPnoa,
            "Mapa (OpenStreetMap)": osm
        };

        const overlayMaps = {
            "Líneas de Parcelas (Catastro)": catastroWms,
            "SIGPAC (Oficial - Puede fallar)": sigpacOfficial,
            "SIGPAC (Espejo)": sigpacMirror
        };

        L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed: false }).addTo(this.map);
        
        // Activar Catastro por defecto (SIGPAC está caído actualmente)
        catastroWms.addTo(this.map);
        
        this._toast('💡 Tip: Usa el selector arriba a la derecha para ver Ortofoto PNOA del IGN', 'info');

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
                this._toast('🛰️ [v3] Capturado. Buscando en SIGPAC...', 'info');
                
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
        console.log('[v3 DEBUG] _fetchSigpacData starting for:', lat, lng);
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
            console.error('Error fetching SIGPAC from API:', err);
            
            // Intento final: Fetch directo desde el navegador (CORS permitiendo)
            try {
                this._toast('Reintentando conexión directa...', 'info');
                const directUrl = `https://sigpac-hubcloud.es/servicioconsultassigpac/query/recinfobypoint/4326/${lng}/${lat}.json`;
                const res = await fetch(directUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data[0]) {
                        const p = data[0];
                        const refInput = document.getElementById('parcela-sigpac');
                        const supInput = document.getElementById('parcela-superficie');
                        if (refInput) refInput.value = `${p.provincia}/${p.municipio}/${p.agregado}/${p.zona}/${p.poligono}/${p.parcela}/${p.recinto}`;
                        if (supInput) supInput.value = p.superficie;
                        this._toast('✅ Datos recuperados vía espejo', 'success');
                        return;
                    }
                }
            } catch (directErr) {
                console.error('Error in direct SIGPAC fallback:', directErr);
            }

            this._toast('❌ Error al conectar con SIGPAC: ' + err.message, 'error');
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
        const variedad = document.getElementById('parcela-variedad') ? document.getElementById('parcela-variedad').value : '';
        const superficie = document.getElementById('parcela-superficie').value;
        const sigpac = document.getElementById('parcela-sigpac').value.trim();
        const notas = document.getElementById('parcela-notas').value.trim();
        const lat = document.getElementById('parcela-lat').value;
        const lng = document.getElementById('parcela-lng').value;

        if (!nombre) return;

        const data = {
            nombre,
            variedad: variedad || null,
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
                                    ${p.variedad ? '🌰 ' + this._escapeHTML(p.variedad) + ' · ' : ''}
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
                    if (await this._confirm(`¿Eliminar la parcela "${parcela.nombre}"?`)) {
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
            if (document.getElementById('parcela-variedad')) {
                document.getElementById('parcela-variedad').value = parcela.variedad || '';
            }
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
                    if (await this._confirm('¿Borrar este documento?')) {
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
                    if (await this._confirm(`¿Eliminar el tipo de trabajo "${trabajo.nombre}"?`)) {
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

            let parcelas = await this.store.getAll('parcelas') || []; if (!Array.isArray(parcelas)) parcelas = [];
            let trabajos = await this.store.getAll('trabajos') || []; if (!Array.isArray(trabajos)) trabajos = [];
            let maquinaria = await this.store.getAll('maquinaria') || []; if (!Array.isArray(maquinaria)) maquinaria = [];
            let inventario = await this.store.getAll('inventario') || []; if (!Array.isArray(inventario)) inventario = [];

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
                const trabajo = this._trabajosCached ? this._trabajosCached.find(t => t.id == selectedId) : null;
                const tipoLegal = trabajo ? trabajo.tipo_legal : null;
                const nombre = trabajo ? trabajo.nombre.toLowerCase() : '';

                console.log('Change Work:', { selectedId, tipoLegal, nombre });

                const isTreatment = tipoLegal === 'fitosanitario' || tipoLegal === 'herbicida' || nombre.includes('herbi') || nombre.includes('fito');
                const isAbono = tipoLegal === 'abono' || nombre.includes('abono');
                const isCosecha = tipoLegal === 'cosecha' || nombre.includes('cosecha');

                const fitoCont = document.getElementById('siex-fito-container');
                const abonoCont = document.getElementById('siex-abono-container');
                const cosechCont = document.getElementById('siex-cosecha-container');

                if (fitoCont) fitoCont.style.display = isTreatment ? 'block' : 'none';
                if (abonoCont) abonoCont.style.display = isAbono ? 'block' : 'none';
                if (cosechCont) cosechCont.style.display = isCosecha ? 'block' : 'none';
                
                console.log('Visibility:', { isTreatment, isAbono, isCosecha });
            };

            trabajoSelect.addEventListener('change', this._trabajoChangeHandler);
            
            // Ejecutar una vez para inicializar el estado correcto
            this._trabajoChangeHandler();

        } catch (err) {
            console.error('Error cargando selects:', err);
            this._toast('Error al cargar datos del formulario. Por favor, recarga la página.', 'error');
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
        let pFito = null, nRegFito = null, dFito = null, plFito = null, carnet = null, nAplicador = null;
        let nutr = null, cantA = null, agua = null;
        let kgC = null, loteC = null;
        let invId = null, cantUsada = null;

        if (trabajo) {
            const nombre = trabajo.nombre.toLowerCase();
            if (trabajo.tipo_legal === 'fitosanitario' || trabajo.tipo_legal === 'herbicida' || nombre.includes('herbi') || nombre.includes('fito')) {
                invId = document.getElementById('reg-fito-inventario').value || null;
                cantUsada = document.getElementById('reg-fito-cantidad').value || null;
                pFito = document.getElementById('reg-fito-producto').value.trim() || null;
                nRegFito = document.getElementById('reg-fito-nregistro').value.trim() || null;
                dFito = document.getElementById('reg-fito-dosis').value.trim() || null;
                plFito = document.getElementById('reg-fito-plaga').value.trim() || null;
                nAplicador = document.getElementById('reg-fito-aplicador').value.trim() || null;
                carnet = document.getElementById('reg-fito-carnet').value.trim() || null;
            } else if (trabajo.tipo_legal === 'abono' || trabajo.nombre.toLowerCase().includes('abono')) {
                invId = document.getElementById('reg-abono-inventario').value || null;
                cantUsada = document.getElementById('reg-abono-cantidad-num').value || null;
                nutr = document.getElementById('reg-abono-nutrientes').value.trim() || null;
                cantA = document.getElementById('reg-abono-cantidad').value.trim() || null;
                agua = document.getElementById('reg-abono-agua').value ? parseFloat(document.getElementById('reg-abono-agua').value) : null;
                nAplicador = document.getElementById('reg-abono-aplicador').value.trim() || null;
                carnet = document.getElementById('reg-abono-carnet').value.trim() || null;
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
                nombre_aplicador: nAplicador,
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
            this._toast('❌ Error al guardar registro: ' + err.message, 'error');
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

        const btnPrint = document.getElementById('btn-print');
        if (btnPrint) btnPrint.addEventListener('click', () => window.print());

        const btnPdf = document.getElementById('btn-pdf-oficial');
        if (btnPdf) btnPdf.addEventListener('click', () => this._generateOfficialPDF());

        const btnSiex = document.getElementById('btn-export-siex');
        if (btnSiex) btnSiex.addEventListener('click', () => this._exportSIEX());

        const btnExport = document.getElementById('btn-export');
        if (btnExport) btnExport.addEventListener('click', () => this._exportData());

        // Backup / Import
        const btnImport = document.getElementById('btn-import');
        if (btnImport) {
            btnImport.addEventListener('click', () => document.getElementById('import-file').click());
        }
        const fileInput = document.getElementById('import-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this._importData(e.target.files[0]));
        }

        // Phase 2: Scanner & QR
        const btnScan = document.getElementById('btn-scan-fito');
        if (btnScan) btnScan.addEventListener('click', () => this._openScanner());

        const btnCloseScanner = document.getElementById('btn-close-scanner');
        if (btnCloseScanner) btnCloseScanner.addEventListener('click', () => this._stopScanner());

        const btnCloseQr = document.getElementById('btn-close-qr');
        if (btnCloseQr) btnCloseQr.addEventListener('click', () => document.getElementById('modal-qr').style.display = 'none');

        const btnShowQR = document.getElementById('btn-show-trace-qr');
        if (btnShowQR) btnShowQR.addEventListener('click', () => this._showTraceabilityQR('LOT-2026-DEMO'));

        // Detail Modal Listeners
        const btnCloseDetail = document.getElementById('btn-close-record-detail');
        const btnCancelDetail = document.getElementById('btn-cancel-edit-record');
        const modalDetail = document.getElementById('modal-record-detail');
        const formEdit = document.getElementById('form-edit-record');

        if (btnCloseDetail) btnCloseDetail.addEventListener('click', () => modalDetail.style.display = 'none');
        if (btnCancelDetail) btnCancelDetail.addEventListener('click', () => modalDetail.style.display = 'none');
        
        if (formEdit) {
            formEdit.addEventListener('submit', (e) => {
                e.preventDefault();
                this._saveRecordEdit();
            });
        }

        // Perfil
        const formPerfil = document.getElementById('form-perfil-detallado');
        if (formPerfil) {
            formPerfil.addEventListener('submit', (e) => {
                e.preventDefault();
                this._saveProfile();
            });
        }
        const btnClearSig = document.getElementById('btn-clear-signature');
        if (btnClearSig) {
            btnClearSig.addEventListener('click', () => {
                const canvas = document.getElementById('signature-pad');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            });
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
                parcelas.map(p => `<option value="${p.id}">${this._escapeHTML(p.nombre)}${p.variedad ? ' (' + this._escapeHTML(p.variedad) + ')' : ''}</option>`).join('');

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
                    <tr class="clickable-row" data-id="${r.id}">
                        <td>${this._formatDate(r.fecha)}</td>
                        <td>${parcela ? this._escapeHTML(parcela.nombre) : '<em>Eliminada</em>'}${parcela && parcela.variedad ? ' <small style="opacity:0.7">('+this._escapeHTML(parcela.variedad)+')</small>' : ''}</td>
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
                            ${r.nombre_aplicador || r.carnet_aplicador ? `<br><small>🧑‍🔬 <b>Aplicador:</b> ${this._escapeHTML(r.nombre_aplicador || '-')} ${r.carnet_aplicador ? `(${this._escapeHTML(r.carnet_aplicador)})` : ''}</small>` : ''}
                            ${r.kg_recolectados ? `<br><small>🧺 <b>Cosecha:</b> ${r.kg_recolectados} kg (Lote: ${this._escapeHTML(r.lote_trazabilidad || '-')})</small>` : ''}
                            ${!r.notas && !r.producto_fito && !r.nutrientes && !r.kg_recolectados && !maq && !r.nombre_aplicador && !r.carnet_aplicador ? '—' : ''}
                            ${hasFotos ? `<button class="btn-view-fotos" data-id="${r.id}" title="Ver fotos" type="button" style="margin-left:5px; padding:0; background:none; border:none; cursor:pointer;">📷</button>` : ''}
                        </td>
                        <td class="no-print">
                            <button class="btn btn-danger btn-sm btn-delete-registro" data-id="${r.id}" title="Eliminar registro">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Click handling for detail
            tbody.querySelectorAll('tr.clickable-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    // Don't open if clicked on actions or fotos button
                    if (e.target.closest('.no-print') || e.target.closest('.btn-view-fotos')) return;
                    this._showRecordDetail(row.dataset.id);
                });
            });

            countEl.textContent = `${registros.length} registro${registros.length !== 1 ? 's' : ''}`;

            tbody.querySelectorAll('.btn-view-fotos').forEach(btn => {
                btn.addEventListener('click', () => {
                    const regId = btn.dataset.id;
                    const regFotos = fotos.filter(f => f.registroId == regId);
                    if (regFotos.length > 0) {
                        const r = registros.find(reg => reg.id == regId);
                        const t = trabajos.find(trab => trab.id == r.trabajoId);
                        const p = parcelas.find(par => par.id == r.parcelaId);
                        
                        this._openGalleryLightbox(regFotos, `${t ? t.nombre : 'Trabajo'} en ${p ? p.nombre : 'Parcela'} (${this._formatDate(r.fecha)})`);
                    }
                });
            });

            tbody.querySelectorAll('.btn-delete-registro').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (await this._confirm('¿Eliminar este registro?')) {
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
            console.error('Error rendering records:', err);
        }
    }

    async _showRecordDetail(id) {
        try {
            const r = (await this.store.getAll('registros')).find(reg => reg.id == id);
            if (!r) return;

            const parcelas = await this.store.getAll('parcelas');
            const trabajos = await this.store.getAll('trabajos');
            const maquinaria = await this.store.getAll('maquinaria');
            const fotos = await this.store.getAll('fotos');

            const p = parcelas.find(par => par.id == r.parcelaId);
            const t = trabajos.find(trab => trab.id == r.trabajoId);

            // Populate Main Fields
            document.getElementById('det-id').value = r.id;
            document.getElementById('det-registro-title').textContent = `Registro #${r.id.toString().padStart(4, '0')}`;
            document.getElementById('det-registro-subtitle').textContent = t ? `${t.icono} ${t.nombre}` : 'Trabajo Detallado';
            
            document.getElementById('det-fecha').value = r.fecha;
            
            const selParcela = document.getElementById('det-parcela');
            selParcela.innerHTML = `<option value="${r.parcelaId}">${p ? p.nombre : 'Parcela Desconocida'}</option>`;
            
            const selTrabajo = document.getElementById('det-trabajo');
            selTrabajo.innerHTML = `<option value="${r.trabajoId}">${t ? t.nombre : 'Trabajo Desconocido'}</option>`;

            document.getElementById('det-personas').value = r.num_personas || 1;
            document.getElementById('det-nombres-personas').value = r.nombres_personas || '';
            document.getElementById('det-coste').value = r.coste || '';
            document.getElementById('det-notas').value = r.notas || '';

            // Specialty Sections
            const secMaq = document.getElementById('det-sec-maq');
            const secFito = document.getElementById('det-sec-fito');
            const secCosecha = document.getElementById('det-sec-cosecha');

            secMaq.style.display = 'block'; // Always visible as common
            const selMaq = document.getElementById('det-maquinaria');
            selMaq.innerHTML = '<option value="">Ninguna</option>' + 
                maquinaria.map(m => `<option value="${m.id}" ${r.maquinariaId == m.id ? 'selected' : ''}>${m.nombre}</option>`).join('');
            document.getElementById('det-horas').value = r.duracion_horas || '';

            // Handle Fito/Abono
            if (t && (t.nombre.toLowerCase().includes('tratamiento') || t.nombre.toLowerCase().includes('abono') || t.nombre.toLowerCase().includes('fito'))) {
                secFito.style.display = 'block';
                document.getElementById('det-label-prod').textContent = t.nombre.toLowerCase().includes('abono') ? 'Abono/Nutriente' : 'Producto Fito';
                document.getElementById('det-producto').value = r.producto_fito || r.nutrientes || '';
                document.getElementById('det-cantidad').value = r.cantidad_usada || r.cantidad_abono || '';
                document.getElementById('det-dosis').value = r.dosis || '';
                document.getElementById('det-aplicador').value = r.nombre_aplicador || '';
                document.getElementById('det-carnet').value = r.carnet_aplicador || '';
                document.getElementById('det-reg-fito').value = r.num_registro_fito || '';
                document.getElementById('det-agua').value = r.agua_riego || '';
                document.getElementById('det-plaga').value = r.plaga || '';
            } else {
                secFito.style.display = 'none';
            }

            // Handle Cosecha
            if (t && t.nombre.toLowerCase().includes('cosech')) {
                secCosecha.style.display = 'block';
                document.getElementById('det-kg').value = r.kg_recolectados || '';
                document.getElementById('det-lote').value = r.lote_trazabilidad || '';
            } else {
                secCosecha.style.display = 'none';
            }

            // Render Photos
            const gridFotos = document.getElementById('det-photos-grid');
            const regFotos = fotos.filter(f => f.registroId == r.id);
            if (regFotos.length > 0) {
                gridFotos.innerHTML = regFotos.map(f => `
                    <div class="det-photo-thumb" onclick="app._openGalleryLightbox([{filename:'${f.filename}'}], 'Foto del Registro')">
                        <img src="uploads/${f.filename}" alt="Foto">
                    </div>
                `).join('');
            } else {
                gridFotos.innerHTML = '<p style="grid-column: 1/-1; font-size: 0.8rem; color: var(--text-muted);">Sin fotos adjuntas</p>';
            }

            document.getElementById('modal-record-detail').style.display = 'flex';
        } catch (err) {
            console.error(err);
            this._toast('Error al cargar detalle', 'error');
        }
    }

    async _saveRecordEdit() {
        const id = document.getElementById('det-id').value;
        const workType = document.getElementById('det-registro-subtitle').textContent.toLowerCase();

        try {
            const data = {
                parcelaId: document.getElementById('det-parcela').value,
                trabajoId: document.getElementById('det-trabajo').value,
                fecha: document.getElementById('det-fecha').value,
                num_personas: document.getElementById('det-personas').value,
                nombres_personas: document.getElementById('det-nombres-personas').value,
                coste: parseFloat(document.getElementById('det-coste').value.toString().replace(',', '.')) || 0,
                notas: document.getElementById('det-notas').value,
                maquinariaId: document.getElementById('det-maquinaria').value || null,
                duracion_horas: parseFloat(document.getElementById('det-horas').value.toString().replace(',', '.')) || null
            };

            // Specialized fields logic
            if (workType.includes('abono')) {
                data.nutrientes = document.getElementById('det-producto').value;
                data.cantidad_abono = document.getElementById('det-cantidad').value;
                data.producto_fito = null;
                data.cantidad_usada = null;
            } else {
                data.producto_fito = document.getElementById('det-producto').value;
                data.cantidad_usada = document.getElementById('det-cantidad').value;
                data.nutrientes = null;
                data.cantidad_abono = null;
            }
            
            data.dosis = document.getElementById('det-dosis').value;
            data.nombre_aplicador = document.getElementById('det-aplicador').value;
            data.carnet_aplicador = document.getElementById('det-carnet').value;
            data.num_registro_fito = document.getElementById('det-reg-fito').value;
            data.plaga = document.getElementById('det-plaga').value;
            data.agua_riego = parseFloat(document.getElementById('det-agua').value) || null;
            
            data.kg_recolectados = parseFloat(document.getElementById('det-kg').value.toString().replace(',', '.')) || null;
            data.lote_trazabilidad = document.getElementById('det-lote').value;

            const numericId = parseInt(id);
            console.log(`Guardando cambios para registro: ${numericId}`, data);
            const res = await this.store.update('registros', numericId, data);
            
            if (res && res.queued) {
                this._toast('Cambios guardados localmente (Modo Offline)', 'warning');
            } else {
                this._toast('Registro actualizado con éxito', 'success');
            }
            
            document.getElementById('modal-record-detail').style.display = 'none';
            
            await this._renderRecords();
            this._renderDashboard(); // Update costs on dashboard

        } catch (err) {
            console.error(err);
            this._toast('Error al guardar cambios', 'error');
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
            a.download = `cuaderno-garuto-full-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this._toast('✅ Copia de seguridad descargada correctamente', 'success');
        } catch (err) {
            this._toast('Error al exportar datos: ' + err.message, 'error');
        }
    }

    async _exportSIEX() {
        this.store.exportSIEX();
    }

    // ---- Perfil & Firma ----
    _initSignaturePad() {
        const canvas = document.getElementById('signature-pad');
        if (!canvas) return;

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                // Ajustar resolución interna al tamaño de pantalla
                canvas.width = rect.width;
                canvas.height = rect.height;
                const savedSig = localStorage.getItem('garuto_signature');
                if (savedSig) {
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    img.src = savedSig;
                }
            }
        };

        setTimeout(resizeCanvas, 300);
        window.addEventListener('resize', resizeCanvas);

        const ctx = canvas.getContext('2d');
        let painting = false;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startPosition = (e) => {
            painting = true;
            ctx.beginPath();
            const pos = getPos(e);
            ctx.moveTo(pos.x, pos.y);
            // console.log('Firma iniciada en:', pos);
        };

        const finishedPosition = () => {
            painting = false;
            ctx.closePath();
        };

        const draw = (e) => {
            if (!painting) return;
            const pos = getPos(e);
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#000000';

            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };

        canvas.addEventListener('mousedown', startPosition);
        canvas.addEventListener('mouseup', finishedPosition);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseleave', finishedPosition);

        canvas.addEventListener('touchstart', (e) => { 
            if (e.target === canvas) e.preventDefault();
            startPosition(e); 
        }, { passive: false });
        canvas.addEventListener('touchend', finishedPosition);
        canvas.addEventListener('touchmove', (e) => { 
            if (e.target === canvas) e.preventDefault();
            draw(e); 
        }, { passive: false });
        
        this.resizeSignaturePad = resizeCanvas;
    }

    async _saveProfile() {
        if (!this.currentUser) return;
        const data = {
            id: this.currentUser.id,
            username: this.currentUser.username,
            display_name: document.getElementById('perf-display-name').value,
            nif: document.getElementById('perf-nif').value,
            direccion: document.getElementById('perf-direccion').value,
            num_rea: document.getElementById('perf-num-rea').value,
            num_roma: document.getElementById('perf-num-roma').value,
            email: document.getElementById('perf-email').value,
            role: this.currentUser.role
        };

        try {
            const res = await this.store._fetch('saveUser', {}, data);
            if (res.success) {
                this._toast('✅ Perfil actualizado correctamente', 'success');
                const canvas = document.getElementById('signature-pad');
                const signature = canvas.toDataURL();
                localStorage.setItem('garuto_signature', signature);
                Object.assign(this.currentUser, data);
                if (document.getElementById('user-display-name-sidebar')) {
                    document.getElementById('user-display-name-sidebar').textContent = data.display_name;
                }
            }
        } catch (err) {
            this._toast('Error al guardar perfil: ' + err.message, 'error');
        }
    }

    _renderProfile() {
        const u = this.currentUser;
        if (!u) return;
        document.getElementById('perf-display-name').value = u.displayName || u.display_name || '';
        document.getElementById('perf-nif').value = u.nif || '';
        document.getElementById('perf-direccion').value = u.direccion || '';
        document.getElementById('perf-num-rea').value = u.num_rea || '';
        document.getElementById('perf-num-roma').value = u.num_roma || '';
        document.getElementById('perf-email').value = (u.email || '').replace('null', '');

        const savedSig = localStorage.getItem('garuto_signature');
        if (savedSig) {
            const canvas = document.getElementById('signature-pad');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = savedSig;
        }
    }

    async _generateOfficialPDF() {
        this._toast('⌛ Generando Cuaderno Oficial...', 'info');
        
        try {
            const [registros, parcelas, trabajos] = await Promise.all([
                this.store.getAll('registros'),
                this.store.getAll('parcelas'),
                this.store.getAll('trabajos')
            ]);

            const filtered = registros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

            const container = document.createElement('div');
            container.style.padding = '10px';
            container.style.fontFamily = 'Helvetica, Arial, sans-serif';
            container.style.width = '180mm'; // Ajuste para A4
            container.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 3px solid #1a241a; padding-bottom: 10px; margin-bottom: 20px;">
                    <div>
                        <h1 style="margin:0; color:#1a241a; font-size: 22px; font-weight: 800;">CUADERNO DE EXPLOTACIÓN AGRÍCOLA</h1>
                        <p style="margin:5px 0; color:#444; font-size: 11px;">Documento técnico generado por <strong>Garuto</strong></p>
                    </div>
                    <div style="text-align:right;">
                        <p style="margin:0; font-weight:bold; font-size:12px;">Fecha Emisión: ${new Date().toLocaleDateString()}</p>
                        <p style="margin:2px 0; font-size: 11px; color: #555;">Titular: ${this.currentUser.displayName} (${this.currentUser.nif || 'NIF no esp.'})</p>
                        <p style="margin:2px 0; font-size: 10px; color: #777;">REA: ${this.currentUser.num_rea || '-'} | ROMA: ${this.currentUser.num_roma || '-'}</p>
                    </div>
                </div>

                <h2 style="font-size: 14px; background: #2d382d; color: white; padding: 6px 12px; margin-bottom: 10px;">1. IDENTIFICACIÓN DE LA EXPLOTACIÓN Y PARCELAS</h2>
                <table style="width:100%; border-collapse: collapse; margin-bottom: 25px; font-size: 11px;">
                    <thead>
                        <tr style="background: #e1e9e1;">
                            <th style="border:1px solid #1a241a; padding:8px; text-align:left; color: #000;">Nombre Parcela</th>
                            <th style="border:1px solid #1a241a; padding:8px; text-align:left; color: #000;">Variedad</th>
                            <th style="border:1px solid #1a241a; padding:8px; text-align:left; color: #000;">Sup. (ha)</th>
                            <th style="border:1px solid #1a241a; padding:8px; text-align:left; color: #000;">Ref. SIGPAC</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${parcelas.map(p => `
                            <tr>
                                <td style="border:1px solid #ccc; padding:8px; font-weight: 600;">${p.nombre}</td>
                                <td style="border:1px solid #ccc; padding:8px;">${p.variedad || '-'}</td>
                                <td style="border:1px solid #ccc; padding:8px;">${p.superficie}</td>
                                <td style="border:1px solid #ccc; padding:8px;">${p.referencia_sigpac || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2 style="font-size: 14px; background: #2d382d; color: white; padding: 6px 12px; margin-bottom: 10px;">2. REGISTRO DE ACTIVIDADES, TRATAMIENTOS Y ABONADOS</h2>
                <table style="width:100%; border-collapse: collapse; font-size: 9px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #e1e9e1;">
                            <th style="border:1px solid #1a241a; padding:5px; width: 60px; color: #000;">Fecha</th>
                            <th style="border:1px solid #1a241a; padding:5px; width: 80px; color: #000;">Parcela</th>
                            <th style="border:1px solid #1a241a; padding:5px; color: #000;">Labor / Actividad</th>
                            <th style="border:1px solid #1a241a; padding:5px; color: #000;">Insumo (Fito/Abono)</th>
                            <th style="border:1px solid #1a241a; padding:5px; width: 90px; color: #000;">Nº Reg / Cantidad</th>
                            <th style="border:1px solid #1a241a; padding:5px; color: #000;">Aplicador</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length > 0 ? filtered.map(r => {
                            const p = parcelas.find(par => par.id == r.parcelaId);
                            const t = trabajos.find(trab => trab.id == r.trabajoId);
                            const insumo = r.producto_fito || r.nutrientes || r.material_reparacion || '-';
                            const infoReg = r.num_registro_fito ? 'Reg:'+r.num_registro_fito+' ('+(r.dosis||'')+')' : (r.cantidad_abono || r.cantidad_usada || '-');
                            return `
                                <tr>
                                    <td style="border:1px solid #ccc; padding:5px; white-space: nowrap;">${this._formatDate(r.fecha)}</td>
                                    <td style="border:1px solid #ccc; padding:5px;"><strong>${p ? p.nombre : '-'}</strong></td>
                                    <td style="border:1px solid #ccc; padding:5px;">${t ? t.nombre : '-'}</td>
                                    <td style="border:1px solid #ccc; padding:5px;">${insumo}</td>
                                    <td style="border:1px solid #ccc; padding:5px;">${infoReg}</td>
                                    <td style="border:1px solid #ccc; padding:5px;">${r.nombre_aplicador || '-'}</td>
                                </tr>
                            `;
                        }).join('') : '<tr><td colspan="6" style="text-align:center; padding: 20px;">No hay registros históricos disponibles.</td></tr>'}
                    </tbody>
                </table>
                <div style="margin-top: 30px; display: flex; justify-content: flex-end; align-items: flex-end; gap: 20px;">
                    <div style="text-align: center;">
                        <p style="font-size: 10px; margin-bottom: 5px;">Firma del Titular:</p>
                        <div style="border: 1px solid #ccc; width: 200px; height: 80px;">
                            <img src="${document.getElementById('signature-pad').toDataURL()}" style="width: 100%; height: 100%; object-fit: contain;">
                        </div>
                    </div>
                </div>
                <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; text-align: center; color: #888; font-size: 9px;">
                    Este documento es un extracto digital de la base de datos de Garuto — Pistachos de Calidad.<br>
                    Generado el ${new Date().toLocaleString()} por el usuario ${this.currentUser.displayName}.
                </div>
            `;

            const opt = {
                margin:       10,
                filename:     `cuaderno-oficial-garuto-${new Date().getFullYear()}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(container).save().then(() => {
                this._toast('✅ PDF generado y descargado', 'success');
            });

        } catch (err) {
            console.error('Error generando PDF:', err);
            this._toast('Error al generar PDF: ' + err.message, 'error');
        }
    }

    async _importData(file) {
        if (!file) return;
        if (!await this._confirm('⚠️ ATENCIÓN: Esta operación borrará TODOS los datos actuales y los sustituirá por los de la copia de seguridad. ¿Estás seguro de continuar?')) {
            return;
        }

        try {
            this._toast('Restaurando sistema...', 'info');
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const res = await this.store.importJSON(data);
                    if (res.success) {
                        this._toast('✅ Sistema restaurado correctamente. Recargando...', 'success');
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        throw new Error(res.error || 'Error desconocido');
                    }
                } catch (err) {
                    this._toast('❌ Error al procesar el archivo: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        } catch (err) {
            this._toast('Error al importar datos', 'error');
        }
    }

    // ===============================
    // GALERÍA DE FOTOS
    // ===============================
    _initGallery() {
        this._galleryYear = null; 
        this._isComparisonMode = false;
        this._comparisonPhotos = [null, null];
        
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

        const btnComp = document.getElementById('btn-toggle-comparison');
        if (btnComp) btnComp.addEventListener('click', () => this._toggleGalleryComparison());

        this._initGalleryUploads();
    }

    _toggleGalleryComparison() {
        this._isComparisonMode = !this._isComparisonMode;
        const view = document.getElementById('comparison-view');
        const btn = document.getElementById('btn-toggle-comparison');
        
        if (this._isComparisonMode) {
            view.style.display = 'block';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
            this._comparisonPhotos = [null, null];
            this._renderComparisonSlots();
            this._toast('Modo Comparativa: Selecciona dos fotos de la galería abajo', 'info');
        } else {
            view.style.display = 'none';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        }
        
        // Re-render grid to update click behavior/styles
        const parcelaId = document.getElementById('gallery-parcela').value;
        if (parcelaId) this._renderPhotoGrid(parcelaId);
    }

    _renderComparisonSlots() {
        for (let i = 1; i <= 2; i++) {
            const slot = document.getElementById(`comp-slot-${i}`);
            const photo = this._comparisonPhotos[i-1];
            if (photo) {
                slot.innerHTML = `
                    <img src="${photo.url}" alt="Comp ${i}">
                    <div class="comparison-label">${photo.anio} - ${photo.descripcion || 'Sin descripción'}</div>
                `;
            } else {
                slot.innerHTML = `<p>Selecciona la ${i === 1 ? 'primera' : 'segunda'} foto...</p>`;
            }
        }
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
                parcelas.map(p => `<option value="${p.id}">${this._escapeHTML(p.nombre)}${p.variedad ? ' (' + this._escapeHTML(p.variedad) + ')' : ''}</option>`).join('');

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
                <div class="photo-card ${this._isComparisonMode ? 'selecting' : ''}" data-id="${f.id}">
                    <div class="photo-card-img-wrapper">
                        <img src="uploads/${f.filename}?t=${Date.now()}" alt="${this._escapeHTML(f.descripcion || '')}" loading="lazy">
                        ${f.trabajoIcono ? `<span class="photo-card-type-badge">${f.trabajoIcono}</span>` : ''}
                    </div>
                    <div class="photo-card-info">
                        <div class="photo-card-main">
                            <span class="photo-card-desc">${f.descripcion ? this._escapeHTML(f.descripcion) : (f.trabajoNombre || 'Sin descripción')}</span>
                            <span class="photo-card-meta">
                                📅 ${f.registroFecha ? this._formatDate(f.registroFecha) : f.anio}
                                ${f.trabajoNombre ? ` · 🔧 ${this._escapeHTML(f.trabajoNombre)}` : ''}
                            </span>
                        </div>
                        <button class="photo-card-delete" data-id="${f.id}" title="Eliminar foto">🗑️</button>
                    </div>
                </div>
            `).join('');

            // Click handling
            gridEl.querySelectorAll('.photo-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.photo-card-delete')) return;
                    
                    const id = card.dataset.id;
                    const photo = filtered.find(f => f.id == id);
                    if (!photo) return;

                    const photoUrl = `uploads/${photo.filename}`;

                    if (this._isComparisonMode) {
                        this._selectPhotoForComparison({
                            url: photoUrl,
                            anio: photo.anio,
                            descripcion: photo.descripcion || photo.trabajoNombre
                        });
                    } else {
                        if (this._openLightbox) {
                            this._openLightbox(photoUrl, photo.descripcion || photo.trabajoNombre);
                        } else {
                            window.open(photoUrl, '_blank');
                        }
                    }
                });
            });

            // Delete buttons
            gridEl.querySelectorAll('.photo-card-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (await this._confirm('¿Eliminar esta foto?')) {
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

    _selectPhotoForComparison(photo) {
        if (!this._comparisonPhotos[0]) {
            this._comparisonPhotos[0] = photo;
            this._toast('Primera foto seleccionada. Elige la segunda.', 'info');
        } else if (!this._comparisonPhotos[1]) {
            this._comparisonPhotos[1] = photo;
            this._toast('Comparativa lista', 'success');
        } else {
            this._comparisonPhotos[1] = photo;
        }
        this._renderComparisonSlots();
    }



    _openLightbox(src, desc) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox fade-in';
        lightbox.innerHTML = `
            <button class="lightbox-close">✕</button>
            <div class="lightbox-content">
                <img src="${src}" alt="Foto">
                ${desc ? `<div class="lightbox-desc">${this._escapeHTML(desc)}</div>` : ''}
            </div>
        `;

        const close = () => {
            lightbox.classList.add('fade-out');
            setTimeout(() => lightbox.remove(), 300);
        };

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close') || e.target.classList.contains('lightbox-content')) {
                close();
            }
        });

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', handler);
            }
        });

        document.body.appendChild(lightbox);
    }

    _openGalleryLightbox(fotos, title) {
        let currentIndex = 0;
        
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox gallery-lightbox fade-in';
        
        const render = () => {
            const f = fotos[currentIndex];
            // Match both {filename: '...'} and {src: '...'} or just a string
            let url = '';
            if (f.filename) url = `uploads/${f.filename}`;
            else if (f.src) url = f.src;
            else url = f;
            
            url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();

            lightbox.innerHTML = `
                <button class="lightbox-close">✕</button>
                <div class="lightbox-gallery-container">
                    <div class="lightbox-header">
                        <h3>${this._escapeHTML(title)}</h3>
                        <span class="lightbox-counter">${currentIndex + 1} / ${fotos.length}</span>
                    </div>
                    <div class="lightbox-main">
                        ${fotos.length > 1 ? `<button class="lightbox-prev">❮</button>` : ''}
                        <img src="${url}" alt="Foto ${currentIndex + 1}">
                        ${fotos.length > 1 ? `<button class="lightbox-next">❯</button>` : ''}
                    </div>
                    ${f.descripcion ? `<div class="lightbox-desc">${this._escapeHTML(f.descripcion)}</div>` : ''}
                </div>
            `;
        };

        render();

        const close = () => {
            lightbox.classList.add('fade-out');
            setTimeout(() => lightbox.remove(), 300);
        };

        lightbox.addEventListener('click', (e) => {
            if (e.target.classList.contains('lightbox-close') || e.target === lightbox) {
                close();
            } else if (e.target.classList.contains('lightbox-prev')) {
                currentIndex = (currentIndex - 1 + fotos.length) % fotos.length;
                render();
            } else if (e.target.classList.contains('lightbox-next')) {
                currentIndex = (currentIndex + 1) % fotos.length;
                render();
            }
        });

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', handler);
            } else if (e.key === 'ArrowLeft' && fotos.length > 1) {
                currentIndex = (currentIndex - 1 + fotos.length) % fotos.length;
                render();
            } else if (e.key === 'ArrowRight' && fotos.length > 1) {
                currentIndex = (currentIndex + 1) % fotos.length;
                render();
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

    // ===============================
    // MERCADO (PRECIOS Y TENDENCIAS)
    // ===============================
    async _renderMercado() {
        const pricesList = document.getElementById('market-prices-list');
        const adviceEl = document.getElementById('market-advice');
        if (!pricesList) return;

        // Datos simulados (Fase 3)
        const data = [
            { n: 'Kerman (Pistacho)', p: '6.45', t: 'up' },
            { n: 'Larnaka (Pistacho)', p: '7.10', t: 'stable' },
            { n: 'Sirora (Pistacho)', p: '6.80', t: 'down' }
        ];

        pricesList.innerHTML = data.map(i => `
            <div class="market-item">
                <span>${i.n}</span>
                <span class="market-price ${i.t}">${i.p}€/kg ${i.t === 'up' ? '📈' : i.t === 'down' ? '📉' : '➖'}</span>
            </div>
        `).join('');

        if (adviceEl) {
            adviceEl.innerHTML = `Pistachín AI dice: El mercado de <b>Larnaka</b> está fuerte. Si tienes stock, es buen momento para cerrar tratos.`;
        }

        this._renderMarketChart();
    }

    _renderMarketChart() {
        const canvas = document.getElementById('market-trend-chart');
        if (!canvas) {
            console.warn("Market chart canvas not found");
            return;
        }

        try {
            if (this.marketChart) this.marketChart.destroy();

            this.marketChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Pistacho Kerman (€/kg)',
                        data: [5.8, 6.0, 6.2, 6.1, 6.3, 6.45],
                        borderColor: '#a3d65e',
                        backgroundColor: 'rgba(163, 214, 94, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { 
                        y: { beginAtZero: false, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                        x: { grid: { display: false }, ticks: { color: '#888' } }
                    }
                }
            });
        } catch (err) {
            console.error("Error rendering market chart:", err);
        }
    }

    async _renderRegistrarSelects() {
        try {
            const inventario = await this.store.getAll('inventario');
            
            // 1. Selector de Fitosanitarios
            const selectFito = document.getElementById('reg-fito-inventario');
            if (selectFito) {
                const currentVal = selectFito.value;
                selectFito.innerHTML = '<option value="">-- Elige del inventario o escribe abajo --</option>' + 
                    inventario.filter(i => i.tipo === 'fitosanitario' || i.tipo === 'herbicida').map(i => 
                        `<option value="${this._escapeHTML(i.nombre)}" ${i.nombre === currentVal ? 'selected' : ''}>${this._escapeHTML(i.nombre)} (${i.stock} ${i.unidad})</option>`
                    ).join('');
            }

            // 2. Selector de Fertilizantes
            const selectAbono = document.getElementById('reg-abono-inventario');
            if (selectAbono) {
                const currentVal = selectAbono.value;
                selectAbono.innerHTML = '<option value="">-- Elige del inventario o escribe abajo --</option>' + 
                    inventario.filter(i => i.tipo === 'abono').map(i => 
                        `<option value="${this._escapeHTML(i.nombre)}" ${i.nombre === currentVal ? 'selected' : ''}>${this._escapeHTML(i.nombre)} (${i.stock} ${i.unidad})</option>`
                    ).join('');
            }
        } catch (err) {
            console.error("Error rendering registrar selects:", err);
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
            this._renderRegistrarSelects();
            this._toast(`Producto "${nombre}" añadido al almacén`);
        } catch (err) {
            this._toast('❌ Error al añadir al almacén: ' + err.message, 'error');
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
                    if (await this._confirm('¿Eliminar producto?')) {
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
        const precio = document.getElementById('maq-precio').value;
        const fecha = document.getElementById('maq-fecha').value || new Date().toISOString().split('T')[0];

        if (!nombre) return;

        try {
            await this.store.add('maquinaria', {
                nombre, 
                tipo, 
                coste_hora: parseFloat(coste) || 0,
                precio_compra: parseFloat(precio) || 0,
                fecha_compra: fecha
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
                            <span class="list-item-meta">${m.tipo ? this._escapeHTML(m.tipo) + ' · ' : ''}${m.coste_hora} €/h${m.precio_compra > 0 ? ' · 💰 Val: ' + m.precio_compra + '€' : ''}</span>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-secondary btn-sm btn-reparaciones-maquinaria" data-id="${m.id}" data-nombre="${this._escapeHTML(m.nombre)}">🔧 Reparaciones</button>
                        <button class="btn btn-danger btn-sm btn-delete-maquinaria" data-id="${m.id}">🗑️</button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-delete-maquinaria').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const item = btn.closest('.list-item');
                    const nombre = item.querySelector('.list-item-name').textContent;
                    
                    if (await this._confirm(`¿Dar de baja la máquina "${nombre}"?`)) {
                        const precioStr = prompt(`Si la has vendido o tiene un valor de recuperación, introduce el importe cobrado (€). Si no, pon 0:`, "0");
                        if (precioStr !== null) {
                            const precio = parseFloat(precioStr) || 0;
                            try {
                                // 1. Registrar ingreso en finanzas si hay precio
                                if (precio > 0) {
                                    await this.store.add('finanzas', {
                                        fecha: new Date().toISOString().split('T')[0],
                                        tipo: 'ingreso',
                                        categoria: 'maquinaria',
                                        monto: precio,
                                        descripcion: `Baja/Venta de Maquinaria: ${nombre}`
                                    });
                                }
                                // 2. Borrar la máquina (o marcar como inactiva si quisiéramos históricos, pero el usuario pidió borrar/dar de baja)
                                await this.store.delete('maquinaria', id);
                                this._renderMaquinaria();
                                this._toast(`Máquina "${nombre}" dada de baja`);
                                this._renderDashboard();
                            } catch (err) {
                                this._toast('Error al procesar la baja', 'error');
                            }
                        }
                    }
                };
            });

            container.querySelectorAll('.btn-reparaciones-maquinaria').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._openReparacionesModal(btn.dataset.id, btn.dataset.nombre);
                });
            });

            // AGREGAR: Botón para comprar maquinaria si no está
            const section = document.getElementById('section-maquinaria');
            if (section && !section.querySelector('.maquinaria-financial-actions')) {
                const header = section.querySelector('.section-header-premium');
                const div = document.createElement('div');
                div.className = 'section-actions maquinaria-financial-actions';
                div.style.marginLeft = 'auto'; 
                div.innerHTML = `
                    <button class="btn btn-primary" onclick="app._showMaquinariaBuyModal()">🛒 Comprar Máquina</button>
                `;
                if (header) header.appendChild(div);
            }

        } catch (err) { console.error(err); }
    }

    _showMaquinariaBuyModal() {
        document.getElementById('form-movimiento').reset();
        document.getElementById('fin-fecha').valueAsDate = new Date();
        document.getElementById('fin-tipo').value = 'gasto';
        document.getElementById('fin-categoria').value = 'maquinaria';
        document.getElementById('fin-descripcion').value = 'Compra de maquinaria: ';
        this._toggleModal('modal-movimiento', true);
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
        const tipo = document.getElementById('reparacion-tipo').value;

        if (!maqId || !fecha || !coste || !desc) return;

        try {
            await this.store.add('maquinaria_reparaciones', {
                maquinariaId: maqId,
                fecha,
                coste: parseFloat(coste) || 0,
                descripcion: desc,
                tipo: tipo
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
                container.innerHTML = '<p class="empty-msg">No hay registros para esta máquina.</p>';
                return;
            }

            container.innerHTML = repairs.map(r => `
                <div class="list-item" data-id="${r.id}">
                    <div class="list-item-info">
                        <span class="list-item-icon">${r.tipo === 'recambio' ? '⚙️' : (r.tipo === 'mantenimiento' ? '🧼' : '🔧')}</span>
                        <div>
                            <span class="list-item-name">${this._escapeHTML(r.descripcion)}</span>
                            <span class="list-item-meta">${this._formatDate(r.fecha)} · <b style="color:var(--danger)">${r.coste} €</b></span>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn btn-danger btn-sm btn-delete-reparacion" data-id="${r.id}" data-maq-id="${maquinariaId}">🗑️</button>
                    </div>
                </div>
            `).join('');

            container.querySelectorAll('.btn-delete-reparacion').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (await this._confirm('¿Eliminar este registro de gasto?')) {
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
    // FINANZAS
    // ===============================
    _initFinanzas() {
        const btn = document.getElementById('btn-nuevo-movimiento');
        if (btn) btn.onclick = () => {
             document.getElementById('form-movimiento').reset();
             document.getElementById('fin-fecha').valueAsDate = new Date();
             this._toggleModal('modal-movimiento', true);
        };
        const form = document.getElementById('form-movimiento');
        if (form) form.onsubmit = (e) => this._handleSaveMovimiento(e);
        const filter = document.getElementById('filter-finanzas-tipo');
        if (filter) filter.onchange = () => this._renderFinanzas();
    }

    async _renderFinanzas() {
        try {
            this.finanzas = await this.store.getAll('finanzas');
            const filter = document.getElementById('filter-finanzas-tipo').value;
            const list = document.getElementById('lista-finanzas');
            
            let filtered = [...this.finanzas].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
            if (filter !== 'todos') {
                filtered = filtered.filter(f => f.tipo === filter);
            }

            const totalIngresos = this.finanzas.filter(f => f.tipo === 'ingreso').reduce((s, f) => s + parseFloat(f.monto), 0);
            const totalGastos = this.finanzas.filter(f => f.tipo === 'gasto').reduce((s, f) => s + parseFloat(f.monto), 0);
            const balance = totalIngresos - totalGastos;

            const elI = document.getElementById('finanzas-total-ingresos');
            const elG = document.getElementById('finanzas-total-gastos');
            const elB = document.getElementById('finanzas-total-balance');

            if (elI) elI.textContent = `${totalIngresos.toFixed(2)} €`;
            if (elG) elG.textContent = `${totalGastos.toFixed(2)} €`;
            if (elB) {
                elB.textContent = `${balance.toFixed(2)} €`;
                elB.style.color = balance >= 0 ? '#a3d65e' : '#ef5350';
            }

            if (!list) return;

            if (filtered.length === 0) {
                list.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay movimientos registrados.</td></tr>';
                return;
            }

            list.innerHTML = filtered.map(f => `
                <tr>
                    <td>${this._formatDate(f.fecha)}</td>
                    <td><span class="list-item-badge">${f.categoria}</span></td>
                    <td>${f.descripcion || '-'}</td>
                    <td class="text-right ${f.tipo === 'ingreso' ? 'monto-ingreso' : 'monto-gasto'}">
                        ${f.tipo === 'ingreso' ? '+' : '-'}${parseFloat(f.monto).toFixed(2)} €
                    </td>
                    <td class="text-center">
                        <button class="btn-icon-danger" onclick="app._deleteFinanza(${f.id})" title="Borrar">🗑️</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) { console.error(e); }
    }

    async _handleSaveMovimiento(e) {
        e.preventDefault();
        const data = {
            fecha: document.getElementById('fin-fecha').value,
            tipo: document.getElementById('fin-tipo').value,
            categoria: document.getElementById('fin-categoria').value,
            monto: parseFloat(document.getElementById('fin-monto').value),
            descripcion: document.getElementById('fin-descripcion').value
        };
        try {
            await this.store.add('finanzas', data);
            this._toggleModal('modal-movimiento', false);
            this._toast('Movimiento guardado', 'success');
            this._renderFinanzas();
            this._renderDashboard();
        } catch (err) { this._toast(err.message, 'error'); }
    }

    async _deleteFinanza(id) {
        if (!await this._confirm('¿Seguro que quieres borrar este movimiento?')) return;
        try {
            await this.store.delete('finanzas', id);
            this._toast('Movimiento borrado', 'success');
            this._renderFinanzas();
            this._renderDashboard();
        } catch (err) { this._toast(err.message, 'error'); }
    }

    // ===============================
    // COSECHAS
    // ===============================
    _initCosechas() {
        const btnVenta = document.getElementById('btn-nueva-venta');
        if (btnVenta) btnVenta.onclick = () => this._showVentaModal();
        const formVenta = document.getElementById('form-venta');
        if (formVenta) formVenta.onsubmit = (e) => this._handleSaveVenta(e);

        const btnCosecha = document.getElementById('btn-nueva-cosecha');
        if (btnCosecha) btnCosecha.onclick = () => this._showNuevaCosechaModal();
        const formCosecha = document.getElementById('form-nueva-cosecha');
        if (formCosecha) formCosecha.onsubmit = (e) => this._handleSaveNuevaCosecha(e);
        
        const kg = document.getElementById('venta-kg');
        const pr = document.getElementById('venta-precio');
        const tot = document.getElementById('venta-total');
        if (kg && pr && tot) {
            const calc = () => { tot.value = (parseFloat(kg.value || 0) * parseFloat(pr.value || 0)).toFixed(2); };
            kg.oninput = calc; pr.oninput = calc;
        }
    }

    async _showVentaModal() {
        try {
            const select = document.getElementById('venta-registroId');
            const registros = await this.store.getAll('registros');
            const trabajos = await this.store.getAll('trabajos');
            const cosechas = registros.filter(r => {
                const t = trabajos.find(tr => tr.id == r.trabajoId);
                return t && t.tipo_legal === 'cosecha';
            });
            
            if (cosechas.length === 0) {
                select.innerHTML = '<option value="">-- No hay cosechas registradas --</option>';
            } else {
                select.innerHTML = cosechas.map(r => `
                    <option value="${r.id}">${this._formatDate(r.fecha)} - ${r.notas || 'Sin notas'} (${r.kg_recolectados || 0}kg recolectados)</option>
                `).join('');
            }

            
            document.getElementById('form-venta').reset();
            document.getElementById('venta-fecha').valueAsDate = new Date();
            this._toggleModal('modal-venta', true);
        } catch (err) { console.error(err); }
    }

    async _showNuevaCosechaModal() {
        try {
            const select = document.getElementById('cosecha-parcelaId');
            const parcelas = await this.store.getAll('parcelas');
            
            if (parcelas.length === 0) {
                this._toast('Necesitas crear al menos una parcela primero.', 'warning');
                return;
            }

            select.innerHTML = parcelas.map(p => `
                <option value="${p.id}">${p.nombre} (${p.variedad || 'Sin variedad'})</option>
            `).join('');
            
            document.getElementById('form-nueva-cosecha').reset();
            document.getElementById('cosecha-fecha').valueAsDate = new Date();
            this._toggleModal('modal-nueva-cosecha', true);
        } catch (err) { console.error(err); }
    }

    async _handleSaveNuevaCosecha(e) {
        e.preventDefault();
        try {
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;

            const trabajos = await this.store.getAll('trabajos');
            let trabajoCosecha = trabajos.find(t => t.tipo_legal === 'cosecha' || (t.nombre && t.nombre.toLowerCase().includes('cosech')));
            
            if (!trabajoCosecha && trabajos.length > 0) {
                // Fallback al primero si no existe (aunque acabo de crearlo en BD)
                trabajoCosecha = trabajos[0];
                console.warn("Utilizando trabajo fallback para cosecha:", trabajoCosecha.nombre);
            }

            if (!trabajoCosecha) {
                throw new Error("No existe ningún tipo de trabajo en la base de datos. Por favor, crea uno primero.");
            }

            const data = {
                id: Date.now().toString(),
                parcelaId: document.getElementById('cosecha-parcelaId').value,
                trabajoId: trabajoCosecha.id,
                fecha: document.getElementById('cosecha-fecha').value,
                horas: 0,
                trabajadores: 0,
                jornal_precio: 0,
                kg_recolectados: parseFloat(document.getElementById('cosecha-kg').value),
                notas: document.getElementById('cosecha-notas').value,
                timestamp: Date.now(),
                sync_status: 'pending'
            };

            await this.store.add('registros', data);
            
            this._toggleModal('modal-nueva-cosecha', false);
            this._toast('Cosecha registrada con éxito 🎉');
            this._renderCosechas(); 
            btn.disabled = false;
        } catch (err) {
            this._toast('Error al guardar la cosecha: ' + err.message, 'error');
            e.target.querySelector('button[type="submit"]').disabled = false;
        }
    }

    async _renderCosechas() {
        try {
            this.cosechas_ventas = await this.store.getAll('cosechas_ventas');
            const listVentas = document.getElementById('lista-cosechas-ventas');
            const listCampo = document.getElementById('lista-cosechas-campo');
            const summary = document.getElementById('cosechas-summary-grid');
            const registros = await this.store.getAll('registros');
            const parcelas = await this.store.getAll('parcelas');
            const trabajos = await this.store.getAll('trabajos');

            // 1. Renderizar Cosecha en Campo (desde la tabla registros)
            if (listCampo) {
                const cosechaWorkIds = trabajos.filter(t => t.tipo_legal === 'cosecha' || (t.nombre && t.nombre.toLowerCase().includes('cosech'))).map(t => t.id);
                const recordsCosecha = registros.filter(r => cosechaWorkIds.includes(parseInt(r.trabajoId))).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

                if (recordsCosecha.length === 0) {
                    listCampo.innerHTML = '<tr><td colspan="5" class="empty-msg">No hay recolecciones registradas en campo.</td></tr>';
                } else {
                    listCampo.innerHTML = recordsCosecha.map(r => {
                        const parc = parcelas.find(p => p.id == r.parcelaId);
                        return `
                            <tr>
                                <td>${this._formatDate(r.fecha)}</td>
                                <td>${parc ? parc.nombre : '<em>Eliminada</em>'}</td>
                                <td class="text-center">${parc && parc.variedad ? '🌰 ' + parc.variedad : '—'}</td>
                                <td class="font-bold">${r.kg_recolectados || 0} kg</td>
                                <td class="text-center">
                                    <button class="btn-icon-danger" onclick="app._deleteRegistroCosecha(${r.id})" title="Borrar registro">🗑️</button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            // 2. Renderizar Registro de Ventas
            if (summary) summary.innerHTML = ''; 
            if (!listVentas) return;

            if (this.cosechas_ventas.length === 0) {
                listVentas.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay ventas registradas.</td></tr>';
                return;
            }

            listVentas.innerHTML = this.cosechas_ventas.map(v => {
                const reg = registros.find(r => r.id == v.registroId);
                const parc = reg ? parcelas.find(p => p.id == reg.parcelaId) : null;
                return `
                    <tr>
                        <td>${this._formatDate(v.fecha)}</td>
                        <td>${parc ? parc.nombre : 'N/A'}${parc && parc.variedad ? ' <small style="opacity:0.7">('+parc.variedad+')</small>' : ''}</td>
                        <td>${v.kg_vendidos} kg</td>
                        <td>${parseFloat(v.precio_kg).toFixed(4)} €/kg</td>
                        <td class="text-right monto-ingreso">${parseFloat(v.total_bruto).toFixed(2)} €</td>
                        <td class="text-center">
                            <button class="btn-icon-danger" onclick="app._deleteVenta(${v.id})" title="Borrar">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) { console.error(e); }
    }

    async _deleteRegistroCosecha(id) {
        if (!await this._confirm('¿Seguro que quieres borrar este registro de cosecha del campo?')) return;
        try {
            await this.store.delete('registros', id);
            this._toast('Registro de cosecha eliminado', 'info');
            this._renderCosechas();
            this._renderDashboard();
        } catch (err) { this._toast(err.message, 'error'); }
    }

    async _handleSaveVenta(e) {
        e.preventDefault();
        const data = {
            registroId: document.getElementById('venta-registroId').value,
            fecha: document.getElementById('venta-fecha').value,
            kg_vendidos: parseFloat(document.getElementById('venta-kg').value),
            precio_kg: parseFloat(document.getElementById('venta-precio').value),
            total_bruto: parseFloat(document.getElementById('venta-total').value),
            notas: document.getElementById('venta-notas').value
        };
        try {
            await this.store.add('cosechas_ventas', data);
            this._toggleModal('modal-venta', false);
            this._toast('Venta registrada', 'success');
            this._renderCosechas();
            this._renderDashboard();
        } catch (err) { this._toast(err.message, 'error'); }
    }

    async _deleteVenta(id) {
        if (!await this._confirm('¿Seguro que quieres borrar esta venta?')) return;
        try {
            await this.store.delete('cosechas_ventas', id);
            this._toast('Venta borrada', 'success');
            this._renderCosechas();
            this._renderDashboard();
        } catch (err) { this._toast(err.message, 'error'); }
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

        this._initEventListeners();
        
        // Carga inicial de alertas y sugerencias
        setTimeout(() => {
            this.checkAlerts();
            this._renderQuickActions();
        }, 1500);
    }

    _initEventListeners() {
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
            const lowStock = inventario.filter(i => parseFloat(i.cantidad || i.stock) < 5);
            if (lowStock.length > 0) {
                this.alerts.push({
                    type: 'warning',
                    msg: `📉 <b>Bajo stock</b>: Tienes ${lowStock.length} productos con pocas unidades (ej: ${lowStock[0].nombre}).`
                });
            }

            // 2. Alerta de Clima (Integración nueva)
            if (this.app.latestWeather) {
                const cur = this.app.latestWeather.current;
                const rainProb = this.app.latestWeather.hourly.precipitation_probability[0];
                
                if (rainProb > 50) {
                    this.alerts.push({
                        type: 'weather',
                        msg: `🌧️ <b>Alerta de Lluvia</b>: Se espera un ${rainProb}% de probabilidad. Pospón tratamientos foliares.`
                    });
                }
                if (cur.temperature_2m > 35) {
                    this.alerts.push({
                        type: 'weather',
                        msg: `🔥 <b>Calor Extremo</b>: ${Math.round(cur.temperature_2m)}°C. Vigila el estrés hídrico.`
                    });
                }
                if (cur.wind_speed_10m > 25) {
                    this.alerts.push({
                        type: 'weather',
                        msg: `💨 <b>Viento Fuerte</b>: ${Math.round(cur.wind_speed_10m)} km/h. No apliques fitosanitarios.`
                    });
                }
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

        const navigateTo = (section, msg) => {
            this.app._navigateTo(section);
            response = msg;
        };

        // --- 1. ACCIONES DINÁMICAS (NAVEGACIÓN + GUÍA + HOW-TO) ---
        
        // Agregar al Almacén / Inventario / Stock
        if ((query.includes('agregar') || query.includes('añadir') || query.includes('nuevo')) && 
            (query.includes('almacén') || query.includes('inventario') || query.includes('producto') || query.includes('insumo') || query.includes('stock'))) {
            navigateTo('almacen', "¡Claro! Te he llevado al <b>Almacén</b>. Para agregar algo nuevo:<br>1. Pulsa el botón verde <b>'+ Nuevo Producto'</b> arriba a la derecha.<br>2. Elige el tipo (Abono, Fito, etc.) y ponle un nombre.<br>3. Indica el stock inicial y el precio. ¡Yo me encargaré de descontarlo cuando lo uses!");
        }
        // Registrar Labor / Trabajo
        else if ((query.includes('registrar') || query.includes('anotar') || query.includes('apuntar')) && 
                 (query.includes('labor') || query.includes('trabajo') || query.includes('poda') || query.includes('riego') || query.includes('fito'))) {
            navigateTo('registrar', "Listo, estamos en <b>Registro de Labores</b>. Aquí puedes:<br>1. Seleccionar la parcela y el tipo de trabajo.<br>2. <b>Consejo:</b> Usa el cronómetro para registrar el tiempo exacto.<br>3. Si es un tratamiento, elige el producto del inventario para que yo actualice el stock automáticamente.");
        }
        // Nueva Parcela / Añadir Parcela
        else if ((query.includes('nueva') || query.includes('añadir')) && query.includes('parcela')) {
            navigateTo('parcelas', "Vamos a añadir esa parcela. Te he llevado a la sección correspondiente. Pulsa en <b>'+ Nueva Parcela'</b>. <br>Recuerda que puedo usar el <b>GPS</b> para detectar el SIGPAC y la superficie automáticamente por ti.");
        }
        // Maquinaria / Nueva Máquina
        else if ((query.includes('nueva') || query.includes('añadir')) && query.includes('maquina')) {
            navigateTo('maquinaria', "Entrando al garaje... Pulsa en <b>'+ Nueva Máquina'</b> para darla de alta. No olvides poner el <b>coste por hora</b> si quieres que calcule la rentabilidad de tus trabajos.");
        }
        // Finanzas / Gasto / Ingreso / Venta
        else if ((query.includes('nuevo') || query.includes('añadir') || query.includes('registrar')) && 
                 (query.includes('gasto') || query.includes('ingreso') || query.includes('movimiento') || query.includes('venta'))) {
            navigateTo('finanzas', "Te he abierto el <b>Libro de Finanzas</b>. Pulsa en <b>'+ Nuevo Movimiento'</b> para anotar un gasto o ingreso manual. <br>Si es una venta de cosecha, también puedes ir a la sección de Cosechas.");
        }

        // --- 2. CONSULTAS DE DATOS ---

        // Clima
        else if (query.includes('clima') || query.includes('tiempo') || query.includes('meteo') || query.includes('llover') || query.includes('trabajar')) {
            const adviceBox = document.querySelector('.advice-box');
            response = adviceBox ? `He analizado el cielo de Viso del Marqués: <b>${adviceBox.textContent}</b>.` : "El tiempo parece estable para trabajar hoy en el campo. ¡A por ello!";
        } 
        // Economía
        else if (query.includes('gasto') || query.includes('dinero') || query.includes('coste') || query.includes('económico') || query.includes('saldo') || query.includes('balance')) {
            const finanzas = await this.app.store.getAll('finanzas');
            const totalIngresos = finanzas.filter(f => f.tipo === 'ingreso').reduce((s, f) => s + parseFloat(f.monto), 0);
            const totalGastos = finanzas.filter(f => f.tipo === 'gasto').reduce((s, f) => s + parseFloat(f.monto), 0);
            const balance = totalIngresos - totalGastos;
            response = `Tu saldo global es <b>${balance.toFixed(2)}€</b>. Has ingresado <b>${totalIngresos.toFixed(2)}€</b> y gastado <b>${totalGastos.toFixed(2)}€</b>.`;
        }
        // Parcelas
        else if (query.includes('parcela') || query.includes('hectárea') || query.includes('superficie')) {
            const parcelas = await this.app.store.getAll('parcelas');
            const totalHas = parcelas.reduce((sum, p) => sum + (parseFloat(p.superficie) || 0), 0);
            response = `Gestionas <b>${parcelas.length} parcelas</b> (${totalHas.toFixed(2)} Has).`;
            if (parcelas.length > 0) {
                const mayor = [...parcelas].sort((a,b) => b.superficie - a.superficie)[0];
                response += ` La más grande es "${mayor.nombre}".`;
            }
        }
        // Ayuda / Capacidades / Quién eres
        else if (query.includes('qué puedes') || query.includes('quién eres') || query.includes('ayuda') || query.includes('control')) {
            response = "Soy <b>Pistachín</b>, tu asistente de control total. Puedo llevarte a cualquier sección, explicarte cómo usar Garuto, analizar tu stock y avisarte si olvidas una tarea crítica. ¡Solo dime qué quieres hacer!";
        }
        // Saludo
        else if (query.includes('hola') || query.includes('qué tal') || query.includes('buenos')) {
            response = "¡Hola! Todo bajo control por aquí. Soy Pistachín, listo para ayudarte con tu explotación de pistachos. ¿En qué puedo ayudarte hoy?";
        }
        else {
            response = "Entendido. Como asistente de Garuto, tengo acceso a todos tus registros. Puedo guiarte por la app, analizar tu inventario o calcular tus balances. ¿Quieres que te enseñe cómo añadir un producto o registrar una labor?";
        }

        this._addMessage(response, 'bot');
    }

}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GarutoApp();
});
