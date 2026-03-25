<?php
// visor_mapa.php — Mapa interactivo GEOGRÁFICO v9 (Blindado contra Caché SW)
// Este archivo reemplaza a mapa.php para evitar bloqueos de Service Worker antiguos.

session_start([
    'cookie_httponly' => true,
    'cookie_secure'   => true,
    'cookie_samesite' => 'Lax'
]);

// ---- CSRF Protection ----
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

if (empty($_SESSION['user'])) {
    header('Location: index.html');
    exit;
}

// PHP Fallbacks con sintaxis ultra-compatible
$pId = isset($_GET['id']) ? intval($_GET['id']) : 0;
$pNm = isset($_GET['nombre']) ? htmlspecialchars($_GET['nombre'], ENT_QUOTES) : 'Parcela';
$pLt = isset($_GET['lat']) ? floatval($_GET['lat']) : 0;
$pLn = isset($_GET['lng']) ? floatval($_GET['lng']) : 0;
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>🌿 Mapa — <?php echo $pNm; ?></title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root { --bg: #0d1117; --green: #a3d65e; --header-h: 60px; }
        body, html { margin:0; padding:0; height:100%; font-family:'Inter', sans-serif; background:var(--bg); color:white; overflow:hidden; }
        .top-bar { height:var(--header-h); background:#161b22; display:flex; align-items:center; padding:0 1rem; gap:1rem; border-bottom:2px solid var(--green); z-index:1000; }
        .top-bar h1 { font-size:1rem; margin:0; flex:1; color:var(--green); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .btn-back { color:white; text-decoration:none; font-size:0.9rem; background:rgba(255,255,255,0.1); padding:0.5rem 0.8rem; border-radius:8px; }
        .btn-save { background:var(--green); color:#051005; border:none; padding:0.6rem 1.2rem; border-radius:8px; font-weight:700; cursor:pointer; }
        .btn-outline { background:transparent; color:white; border:1px solid rgba(255,255,255,0.3); padding:0.5rem 0.8rem; border-radius:8px; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:0.4rem; transition:all 0.2s; }
        .btn-outline:hover { background:rgba(255,255,255,0.1); border-color:white; }
        @media (max-width: 480px) {
            .btn-outline span { display: none; }
            .btn-outline { padding: 0.5rem; }
        }
        #map { height:calc(100% - var(--header-h)); width:100%; z-index:1; }
        #debug-log { position:absolute; top:70px; left:10px; z-index:9999; width:300px; max-height:220px; overflow-y:auto; background:rgba(0,0,0,0.9); color:#0f0; font-family:monospace; font-size:11px; padding:10px; border-radius:8px; border:1px solid #0f0; display:none; }
        .bottom-panel { position:absolute; bottom:20px; left:50%; transform:translateX(-50%); width:94%; max-width:650px; background:rgba(22,27,34,0.95); backdrop-filter:blur(15px); padding:0.8rem; border-radius:20px; border:1px solid rgba(163,214,94,0.3); z-index:1000; }
        .legend-row { display:flex; justify-content:space-around; gap:0.4rem; }
        .tool-btn { flex:1; display:flex; flex-direction:column; align-items:center; gap:0.3rem; background:none; border:2px solid transparent; padding:0.5rem 0.1rem; border-radius:10px; cursor:pointer; color:rgba(255,255,255,0.5); }
        .tool-btn.active { background:rgba(163,214,94,0.1); border-color:var(--green); color:white; }
        .dot { width:18px; height:18px; border-radius:50%; border:2px solid rgba(255,255,255,0.3); }
        .dot.hembra { background:#4caf50; } .dot.macho { background:#fff; border-color:#999; } .dot.injerto { background:#2196f3; } .dot.sin_injerto { background:#333; } .dot.marra { background:#f44336; }
        .tool-label { font-size:0.6rem; font-weight:700; text-transform:uppercase; }
        .tree-marker { border-radius:50%; border:2.5px solid white; box-shadow:0 0 5px rgba(0,0,0,0.5); }
        .tree-marker.hembra { background:#4caf50; } .tree-marker.macho { background:#fff; border-color:#999; } .tree-marker.injerto { background:#2196f3; } .tree-marker.sin_injerto { background:#333; } .tree-marker.marra { background:#f44336; }
        .toast { position:fixed; top:80px; left:50%; transform:translateX(-50%); background:#1e2a1e; border:1px solid var(--green); color:var(--green); padding:0.8rem 1.5rem; border-radius:12px; z-index:2000; }
        /* Stats Panel */
        .stats-panel { position:absolute; top:calc(var(--header-h) + 12px); right:12px; z-index:1000; background:rgba(22,27,34,0.92); backdrop-filter:blur(12px); border:1px solid rgba(163,214,94,0.35); border-radius:14px; padding:0.7rem 0.9rem; min-width:160px; }
        .stats-panel h4 { margin:0 0 0.4rem; font-size:0.75rem; color:var(--green); text-transform:uppercase; letter-spacing:0.5px; }
        .stats-total { font-size:1.4rem; font-weight:800; color:white; margin-bottom:0.5rem; text-align:center; }
        .stats-total small { font-size:0.65rem; font-weight:400; color:rgba(255,255,255,0.5); display:block; }
        .stats-row { display:flex; align-items:center; gap:0.4rem; padding:0.2rem 0; font-size:0.72rem; color:rgba(255,255,255,0.8); }
        .stats-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
        .stats-dot.hembra { background:#4caf50; } .stats-dot.macho { background:#fff; } .stats-dot.injerto { background:#2196f3; } .stats-dot.sin_injerto { background:#555; } .stats-dot.marra { background:#f44336; }
        .stats-count { margin-left:auto; font-weight:700; color:white; }

        /* GPS & Floating Buttons */
        .gps-btn { background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; padding:0.6rem; border-radius:12px; cursor:pointer; display:flex; align-items:center; gap:0.4rem; font-size:0.8rem; }
        .gps-btn.active { background:var(--green); color:#051005; border-color:var(--green); font-weight:700; }
        .gps-btn.active .gps-dot { background:#051005; box-shadow:0 0 8px #051005; }
        .gps-dot { width:8px; height:8px; background:var(--green); border-radius:50%; }

        .btn-plant-here { 
            position:fixed; bottom:110px; right:20px; z-index:1100;
            width:64px; height:64px; background:var(--green); color:#000;
            border:none; border-radius:50%; display:flex; align-items:center; justify-content:center;
            font-size:1.8rem; cursor:pointer; box-shadow:0 8px 25px rgba(163,214,94,0.4);
            border:4px solid rgba(22,27,34,0.8); transition: transform 0.2s;
        }
        .btn-plant-here:active { transform: scale(0.9); }
        .btn-plant-here:disabled { background:#555; color:#888; box-shadow:none; opacity:0.6; cursor:not-allowed; }

        .accuracy-badge {
            position:fixed; bottom:100px; left:20px; z-index:1100;
            background:rgba(0,0,0,0.7); backdrop-filter:blur(5px);
            padding:4px 10px; border-radius:20px; font-size:0.7rem; font-weight:600;
            color:var(--green); border:1px solid rgba(163,214,94,0.3);
        }

        /* User Marker Pulsing Effect */
        .user-location-marker {
            background: #2196f3; border: 2px solid white; border-radius: 50%;
            box-shadow: 0 0 10px rgba(33,150,243,0.8);
        }
        .user-location-accuracy { fill: #2196f3; fill-opacity: 0.15; stroke: #2196f3; stroke-width: 1; stroke-opacity: 0.5; }
        
        .pulse-marker {
            width: 12px; height: 12px; background: #2196f3; border-radius: 50%;
            border: 2px solid white; box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);
            animation: pulse-blue 2s infinite;
        }
        @keyframes pulse-blue {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
        }
    </style>
</head>
<body>
    <div class="top-bar">
        <a href="javascript:history.back()" class="btn-back">← Volver</a>
        <h1 id="page-title">🌿 <?php echo $pNm; ?></h1>
        <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="gps-btn" id="btn-gps"><div class="gps-dot"></div> 🛰️ <span>GPS</span></button>
            <button class="btn-outline" id="btn-export" title="Exportar Copia de Seguridad">📤 <span>Exportar</span></button>
            <button class="btn-outline" id="btn-import" title="Importar Copia de Seguridad">📥 <span>Importar</span></button>
            <button class="btn-save" id="btn-save">💾 Guardar</button>
        </div>
    </div>
    <button class="btn-plant-here" id="btn-plant-here" title="Plantar árbol en mi posición" disabled>🌳</button>
    <div class="accuracy-badge" id="accuracy-info" style="display:none;">🛰️ Buscando señal...</div>
    <div id="debug-log"><b>DEBUG v9 (Blindado)</b><br></div>
    <div id="map"></div>
    <div class="stats-panel" id="stats-panel">
        <h4>🌳 Resumen Árboles</h4>
        <div class="stats-total"><span id="stat-total">0</span><small>árboles totales</small></div>
        <div class="stats-row"><span class="stats-dot hembra"></span> Hembras <span class="stats-count" id="stat-hembra">0</span></div>
        <div class="stats-row"><span class="stats-dot macho"></span> Machos <span class="stats-count" id="stat-macho">0</span></div>
        <div class="stats-row"><span class="stats-dot injerto"></span> Injertados <span class="stats-count" id="stat-injerto">0</span></div>
        <div class="stats-row"><span class="stats-dot sin_injerto"></span> Sin Injertar <span class="stats-count" id="stat-sin_injerto">0</span></div>
        <div class="stats-row"><span class="stats-dot marra"></span> Marras <span class="stats-count" id="stat-marra">0</span></div>
    </div>
    <div class="bottom-panel">
        <div class="legend-row">
            <button class="tool-btn active" data-status="hembra"><span class="dot hembra"></span><span class="tool-label">Hembra</span></button>
            <button class="tool-btn" data-status="macho"><span class="dot macho"></span><span class="tool-label">Macho</span></button>
            <button class="tool-btn" data-status="injerto"><span class="dot injerto"></span><span class="tool-label">Injerto</span></button>
            <button class="tool-btn" data-status="sin_injerto"><span class="dot sin_injerto"></span><span class="tool-label">S. Inj.</span></button>
            <button class="tool-btn" data-status="marra"><span class="dot marra"></span><span class="tool-label">Marra</span></button>
            <button class="tool-btn" data-status="vacio" style="color:#ef5350;"><span style="font-size:1.1rem;">🗑️</span><span class="tool-label">Borrar</span></button>
        </div>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const urlParams = new URLSearchParams(window.location.search);
        const CONF = {
            id: parseInt(urlParams.get('id')) || <?php echo $pId; ?>,
            name: urlParams.get('nombre') || "<?php echo $pNm; ?>",
            lat: parseFloat(urlParams.get('lat')) || <?php echo $pLt; ?>,
            lng: parseFloat(urlParams.get('lng')) || <?php echo $pLn; ?>
        };
        function log(m, t="info"){
            const p = document.getElementById('debug-log');
            p.innerHTML += `<div style="color:${t==='error'?'#f88':(t!=='info'?'#ff0':'#cfc')}">[${new Date().toLocaleTimeString()}] ${m}</div>`;
            if(t==='error') p.style.display = 'block';
        }
        let map, markers = [], treeData = [], selectedStatus = 'hembra', currentParcela = null;
        
        // --- GPS Variables ---
        let watchId = null, userMarker = null, userAccuracyCircle = null, userLatLng = null;
        const btnGPS = document.getElementById('btn-gps');
        const btnPlantHere = document.getElementById('btn-plant-here');
        const accuracyInfo = document.getElementById('accuracy-info');

        async function init() {
            log("Iniciando v9 Blindada - ID:" + CONF.id);
            map = L.map('map', { zoomControl: false }).setView([CONF.lat || 38, CONF.lng || -3], (CONF.lat ? 19 : 6));
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20 }).addTo(map);
            try {
                const res = await fetch(`api.php?action=getById&collection=parcelas&id=${CONF.id}`, { credentials: 'include' });
                const row = await res.json();
                if(!row || row.error) throw new Error(row?row.error:"No encontrado");
                currentParcela = row;
                if(row.lat && row.lng && !CONF.lat) map.setView([row.lat, row.lng], 19);
                if(row.mapa_datos) { treeData = JSON.parse(row.mapa_datos) || []; renderMarkers(); }
            } catch(e) { log("Error: "+e.message, "error"); }
            map.on('click', e => {
                if(selectedStatus==='vacio') return;
                const nt = { lat:e.latlng.lat, lng:e.latlng.lng, status:selectedStatus };
                treeData.push(nt); addMarker(nt, treeData.length-1);
                updateStats();
            });
            document.querySelectorAll('.tool-btn').forEach(b => b.onclick = () => {
                document.querySelectorAll('.tool-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active'); selectedStatus = b.dataset.status;
            });
            document.getElementById('btn-save').onclick = save;
            document.getElementById('btn-export').onclick = exportTrees;
            document.getElementById('btn-import').onclick = importTrees;
            btnGPS.onclick = toggleGPS;
            btnPlantHere.onclick = plantAtGPS;
            document.getElementById('page-title').onclick = () => { const p = document.getElementById('debug-log'); p.style.display = p.style.display==='block'?'none':'block'; };
        }

        // --- GPS Logic ---
        function toggleGPS() {
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
                btnGPS.classList.remove('active');
                if (userMarker) map.removeLayer(userMarker);
                if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);
                btnPlantHere.disabled = true;
                accuracyInfo.style.display = 'none';
                log("GPS Detenido");
            } else {
                if (!navigator.geolocation) return alert("Tu dispositivo no soporta GPS");
                
                log("Iniciando seguimiento GPS...");
                btnGPS.classList.add('active');
                accuracyInfo.style.display = 'block';

                watchId = navigator.geolocation.watchPosition(
                    pos => {
                        const { latitude, longitude, accuracy } = pos.coords;
                        userLatLng = [latitude, longitude];
                        
                        // Actualizar UI de precisión
                        accuracyInfo.textContent = `🛰️ Precisión: ${Math.round(accuracy)}m`;
                        btnPlantHere.disabled = accuracy > 25; // Solo permitir si la precisión es aceptable (<25m)

                        if (!userMarker) {
                            userMarker = L.marker(userLatLng, {
                                icon: L.divIcon({ className: 'pulse-marker', iconSize: [12, 12], iconAnchor: [6, 6] })
                            }).addTo(map);
                            userAccuracyCircle = L.circle(userLatLng, { radius: accuracy, className: 'user-location-accuracy' }).addTo(map);
                            map.setView(userLatLng, 19); // Auto-centrar la primera vez
                        } else {
                            userMarker.setLatLng(userLatLng);
                            userAccuracyCircle.setLatLng(userLatLng);
                            userAccuracyCircle.setRadius(accuracy);
                        }
                    },
                    err => {
                        log("Error GPS: " + err.message, "error");
                        toggleGPS(); // Parar si hay error
                    },
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
                );
            }
        }

        function plantAtGPS() {
            if (!userLatLng || selectedStatus === 'vacio') return;
            log(`Plantando ${selectedStatus} en posición GPS...`);
            const nt = { lat: userLatLng[0], lng: userLatLng[1], status: selectedStatus };
            treeData.push(nt);
            addMarker(nt, treeData.length - 1);
            updateStats();
            showToast("🌳 Árbol colocado");
        }
        function exportTrees() {
            const data = {
                parcela: CONF.name,
                id: CONF.id,
                fecha: new Date().toISOString(),
                trees: treeData.filter(x => x !== null)
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeName = CONF.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.href = url;
            a.download = `arboles_${safeName}_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast("📤 Exportado");
        }
        function importTrees() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const data = JSON.parse(reader.result);
                        if (data.trees && Array.isArray(data.trees)) {
                            if (confirm(`Se han encontrado ${data.trees.length} árboles en el archivo. ¿Deseas reemplazar los árboles actuales de esta parcela por los del archivo?`)) {
                                treeData = data.trees;
                                renderMarkers();
                                showToast("📥 Importado. Pulsa GUARDAR para finalizar.");
                            }
                        } else {
                            alert("El archivo no parece contener datos válidos de árboles.");
                        }
                    } catch (err) {
                        alert("Error al procesar el archivo JSON.");
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
        function addMarker(t, i) {
            if(!t) return;
            const icon = L.divIcon({ className:`tree-marker ${t.status}`, iconSize:[20,20] });
            const m = L.marker([t.lat, t.lng], {icon}).addTo(map);
            m.on('click', e => {
                L.DomEvent.stopPropagation(e);
                if(selectedStatus==='vacio') { map.removeLayer(m); treeData[i]=null; }
                else { treeData[i].status=selectedStatus; m.getElement().className=`leaflet-marker-icon tree-marker ${selectedStatus} leaflet-zoom-animated leaflet-interactive`; }
                updateStats();
            });
            markers.push(m);
        }
        function renderMarkers() { markers.forEach(m => map.removeLayer(m)); markers=[]; treeData.forEach((t,i) => addMarker(t,i)); updateStats(); }
        function updateStats() {
            const active = treeData.filter(t => t !== null);
            const counts = { hembra:0, macho:0, injerto:0, sin_injerto:0, marra:0 };
            active.forEach(t => { if(counts.hasOwnProperty(t.status)) counts[t.status]++; });
            document.getElementById('stat-total').textContent = active.length;
            Object.keys(counts).forEach(k => { const el = document.getElementById('stat-'+k); if(el) el.textContent = counts[k]; });
        }
        const CSRF_TOKEN = '<?php echo $_SESSION['csrf_token'] ?? ''; ?>';

        async function save() {
            const btn = document.getElementById('btn-save'); btn.disabled=true; btn.textContent='...';
            try {
                const res = await fetch(`api.php?action=update&collection=parcelas&id=${CONF.id}`, {
                    method:'POST', credentials:'include', 
                    headers:{
                        'Content-Type':'application/json',
                        'X-CSRF-Token': CSRF_TOKEN
                    },
                    body: JSON.stringify({ nombre:CONF.name, lat:map.getCenter().lat, lng:map.getCenter().lng, mapa_datos:JSON.stringify(treeData.filter(x=>x!==null)) })
                });
                const r = await res.json();
                if(r.success) { showToast("✅ Guardado"); treeData=treeData.filter(x=>x!==null); renderMarkers(); }
                else throw new Error(r.error);
            } catch(e) { log("Error: "+e.message,"error"); alert(e.message); }
            btn.disabled=false; btn.textContent='💾 Guardar';
        }
        function showToast(m){ const t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(), 2000); }
        init();
    </script>
</body>
</html>
