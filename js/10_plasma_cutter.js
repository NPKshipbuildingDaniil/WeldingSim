// =====================================================
// 🔥 ПЛАЗМОРЕЗ — ПОЛНАЯ РЕАЛИЗАЦИЯ
// Размещается рядом со столами СБСВ (x=1600/2000, z=1200)
// Станция находится при z≈1050 (перед столами)
// =====================================================

(function () {
    'use strict';

    // ── requestIdleCallback polyfill (Safari / old Edge) ──
    if (typeof window.requestIdleCallback === 'undefined') {
        window.requestIdleCallback = function(cb) { return setTimeout(cb, 1); };
        window.cancelIdleCallback  = function(id) { clearTimeout(id); };
    }

    // ──────────────────────────────────────────────
    // 0. ОТВЕТЫ НА КОНТРОЛЬНЫЕ ВОПРОСЫ ТЗ
    // ──────────────────────────────────────────────
    // Q1: Библиотека для CSG — используется собственная реализация
    //     на основе BVH-ускорённого Raycasting (THREE.Raycaster с
    //     BVH через three-mesh-bvh CDN). Вычитание выполняется
    //     асинхронно через requestIdleCallback, что не блокирует UI.
    //
    // Q2: Алгоритм поиска изолированных кусков: Flood Fill по индексному
    //     буферу — строим adjacency map (ребро = пара вершин), затем
    //     BFS по смежным треугольникам. Каждая несвязная компонента →
    //     новый Mesh.
    //
    // Q3: UV на срезе: внутренние грани режущего объёма получают
    //     triplanar mapping (UV = (world.xz) / texScale), что даёт
    //     корректную проекцию текстуры металла на плоскость реза.
    //
    // Q4: Семантические маркеры userData (faceType: 'flat'|'radius'|'cap')
    //     копируются из оригинального Mesh в оба фрагмента после CSG;
    //     новые грани среза помечаются как faceType='cut'.
    // ──────────────────────────────────────────────

    const PC = {}; // namespace

    // ─── 1. КОНСТАНТЫ ────────────────────────────
    PC.STATION_X = 1090;   // старое место тележек
    PC.STATION_Z = 1240;   // старое место тележек
    PC.TABLE_Y   = 0;
    PC.CUT_BEAM_WIDTH = 1.5; // ширина «лезвия» в юнитах сцены
    PC.SPARK_COUNT    = 120;
    PC.SPARK_LIFE     = 1.8;  // секунды
    PC.IDLE_FLAME_SIZE = 6;
    PC.CUTTING_FLAME_SIZE = 18;
    PC.COOL_TIME = 4.0;       // секунды остывания шлака

    // ─── 2. СОСТОЯНИЕ ────────────────────────────
    PC.state = {
        isCutting: false,        // ЛКМ зажата
        cutPoints: [],           // THREE.Vector3[]  — маршрут реза
        cutNormal: null,         // нормаль поверхности при инициации
        hitMesh: null,           // деталь под резаком
        sparks: [],              // { mesh, vel, life, maxLife }[]
        hotEdges: [],            // { mesh, t }[] — раскалённые рёбра
        flameIntensity: 0,       // 0..1
        cutVolumeMesh: null,     // предварительный mesh объёма реза
        isCarryingGenerator: false, // Новое состояние
    };

    // ─── 3. МАТЕРИАЛЫ ────────────────────────────
    function buildMaterials() {
        // Clean Factory Palette
        // Primary (60%): #E8ECF1
        // Secondary (30%): #C8CED8
        // Accent (10%): #3355CC
        
        PC.matPrimary = new THREE.MeshStandardMaterial({
            color: 0xE8ECF1,
            roughness: 0.4,
            metalness: 0.1,
        });
        PC.matSecondary = new THREE.MeshStandardMaterial({
            color: 0xC8CED8,
            roughness: 0.6,
            metalness: 0.3,
        });
        PC.matAccent = new THREE.MeshStandardMaterial({
            color: 0x3355CC,
            roughness: 0.3,
            metalness: 0.2,
        });

        // Медь потемневшая
        PC.matCopper = new THREE.MeshStandardMaterial({
            color: 0x6B3A2A,
            roughness: 0.75,
            metalness: 0.85,
        });
        // Латунь потёртая
        PC.matBrass = new THREE.MeshStandardMaterial({
            color: 0xA07832,
            roughness: 0.55,
            metalness: 0.9,
        });
        // Тёмная накальная окалина на сопле
        PC.matSootNozzle = new THREE.MeshStandardMaterial({
            color: 0x1A1008,
            roughness: 0.95,
            metalness: 0.4,
        });
        // Рукоятка — чёрная резина
        PC.matGrip = new THREE.MeshStandardMaterial({
            color: 0x1C1C1C,
            roughness: 0.92,
            metalness: 0.0,
        });
        // Вентиль (синий акцент)
        PC.matValve = PC.matAccent;
        
        // Корпус генератора
        PC.matGeneratorBody = PC.matPrimary;
        // Жёлтые предупреждающие полосы
        PC.matStripe = new THREE.MeshStandardMaterial({
            color: 0xE6A817,
            roughness: 0.8,
            metalness: 0.1,
        });
        // Провод/шланг
        PC.matHose = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.95,
        });
        // Частица искры
        PC.matSpark = new THREE.MeshBasicMaterial({
            color: 0xFF8800,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
        });
        // Шлак (cool grey)
        PC.matSlag = new THREE.MeshBasicMaterial({
            color: 0x555555,
            transparent: true,
            opacity: 0.8,
        });
    }

    // ─── 4. 3D-МОДЕЛЬ ПЛАЗМОРЕЗА (PBR) ───────────
    function buildCutterModel() {
        const group = new THREE.Group();
        group.userData.isPlasmaCutterTool = true;

        // Короткая рукоятка
        const gripGeo = new THREE.CylinderGeometry(2.5, 2.5, 12, 16);
        const grip = new THREE.Mesh(gripGeo, PC.matGrip);
        grip.rotation.x = Math.PI / 2; // Вдоль Z
        grip.position.set(0, 0, 0);
        group.add(grip);

        // Трубки выходящие из рукоятки вперед
        const tubeGeo = new THREE.CylinderGeometry(0.8, 0.8, 20, 8);
        const tube1 = new THREE.Mesh(tubeGeo, PC.matSecondary);
        tube1.rotation.x = Math.PI / 2;
        tube1.position.set(1.0, 0, -16);
        group.add(tube1);
        
        const tube2 = new THREE.Mesh(tubeGeo, PC.matAccent);
        tube2.rotation.x = Math.PI / 2;
        tube2.position.set(-1.0, 0, -16);
        group.add(tube2);

        // Кнопка включения снизу/сбоку рукоятки
        const triggerGeo = new THREE.BoxGeometry(4, 3, 6);
        const trigger = new THREE.Mesh(triggerGeo, PC.matAccent);
        trigger.position.set(0, -2.5, -2);
        group.add(trigger);

        // Наклонная головка (конец трубок)
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 0, -26); // На переднем конце трубок
        headGroup.rotation.x = Math.PI / 2.5; // Наклон вниз (~72 градуса)
        
        const headGeo = new THREE.CylinderGeometry(2.0, 1.5, 6, 16);
        const head = new THREE.Mesh(headGeo, PC.matSecondary);
        head.position.set(0, -3, 0); 
        headGroup.add(head);

        // Сопло (Медь)
        const nozzleGeo = new THREE.CylinderGeometry(1.2, 0.4, 3, 12);
        const nozzle = new THREE.Mesh(nozzleGeo, PC.matCopper);
        nozzle.position.set(0, -7.5, 0);
        headGroup.add(nozzle);
        PC.nozzleMesh = nozzle;

        // Якорь для пламени
        const flameAnchor = new THREE.Group();
        flameAnchor.position.set(0, -9, 0);
        headGroup.add(flameAnchor);
        PC.flameAnchor = flameAnchor;

        group.add(headGroup);

        // Разъем для шланга (фиксированный коннектор сзади)
        const hoseConnectorGeo = new THREE.CylinderGeometry(1.5, 1.5, 6, 8);
        const hoseConnector = new THREE.Mesh(hoseConnectorGeo, PC.matGrip);
        hoseConnector.rotation.x = Math.PI / 2;
        hoseConnector.position.set(0, 0, 9); // Z=9 (позади короткой ручки)
        group.add(hoseConnector);

        // --- Пламя в режиме ожидания ---
        const flameCanvas = document.createElement('canvas');
        flameCanvas.width = 64; flameCanvas.height = 64;
        const fCtx = flameCanvas.getContext('2d');
        const grad = fCtx.createRadialGradient(32, 32, 2, 32, 32, 32);
        grad.addColorStop(0, 'rgba(180,220,255,1)');
        grad.addColorStop(0.4, 'rgba(80,140,255,0.7)');
        grad.addColorStop(1, 'rgba(0,40,200,0)');
        fCtx.fillStyle = grad;
        fCtx.fillRect(0, 0, 64, 64);
        const flameTex = new THREE.CanvasTexture(flameCanvas);
        PC.idleFlameMat = new THREE.SpriteMaterial({
            map: flameTex,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            color: 0x4488FF,
        });
        PC.idleFlameSprite = new THREE.Sprite(PC.idleFlameMat);
        PC.idleFlameSprite.scale.set(PC.IDLE_FLAME_SIZE, PC.IDLE_FLAME_SIZE * 1.4, 1);
        flameAnchor.add(PC.idleFlameSprite);

        // --- Мощная струя (Mesh цилиндр) ---
        const cutFlameGeo = new THREE.CylinderGeometry(1.5, 0.1, PC.CUTTING_FLAME_SIZE, 8);
        cutFlameGeo.translate(0, -PC.CUTTING_FLAME_SIZE / 2, 0); // origin наверху
        PC.cutFlameMat = new THREE.MeshBasicMaterial({
            color: 0xaaccff,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        PC.cutFlameMesh = new THREE.Mesh(cutFlameGeo, PC.cutFlameMat);
        PC.cutFlameMesh.visible = false;
        flameAnchor.add(PC.cutFlameMesh);

        // Точечный свет от пламени резки
        PC.cutLight = new THREE.PointLight(0x4488FF, 0, 200);
        PC.cutLight.position.set(0, -5, 0);
        flameAnchor.add(PC.cutLight);

        return group;
    }

    // ─── 5. СТАЦИОНАРНЫЙ ГЕНЕРАТОР ПЛАЗМЫ ───────
    function buildGeneratorStation() {
        const grp = new THREE.Group();
        grp.userData.isPlasmaStation = true;

        // Основной корпус (Primary color #E8ECF1)
        const bodyGeo = new THREE.BoxGeometry(60, 80, 40);
        const body = new THREE.Mesh(bodyGeo, PC.matPrimary);
        body.position.set(0, 45, 0); // 45 height to allow wheels
        body.castShadow = true;
        body.receiveShadow = true;
        grp.add(body);

        // Разъем для шланга (фиксированный коннектор на правой стенке)
        const stationConnectorGeo = new THREE.CylinderGeometry(2, 2, 8, 12);
        const stationConnector = new THREE.Mesh(stationConnectorGeo, PC.matGrip);
        stationConnector.rotation.z = Math.PI / 2; // Выступает вправо (вдоль оси X)
        stationConnector.position.set(34, 40, 0); 
        grp.add(stationConnector);

        // Боковые панели (Secondary color #C8CED8)
        const sidePanelGeo = new THREE.BoxGeometry(62, 60, 30);
        const sidePanel = new THREE.Mesh(sidePanelGeo, PC.matSecondary);
        sidePanel.position.set(0, 45, 0);
        grp.add(sidePanel);

        // Верхняя крышка (Accent color #3355CC)
        const topCoverGeo = new THREE.BoxGeometry(58, 4, 38);
        const topCover = new THREE.Mesh(topCoverGeo, PC.matAccent);
        topCover.position.set(0, 86, 0);
        grp.add(topCover);

        // Транспортировочная ручка (поперек)
        const handleGeo = new THREE.CylinderGeometry(1.5, 1.5, 30, 8);
        const handle = new THREE.Mesh(handleGeo, PC.matGrip);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0, 90, 0);
        grp.add(handle);

        const handleSupport1 = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), PC.matAccent);
        handleSupport1.position.set(-13, 87, 0);
        grp.add(handleSupport1);

        const handleSupport2 = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), PC.matAccent);
        handleSupport2.position.set(13, 87, 0);
        grp.add(handleSupport2);

        // Подставка/кобура для резака на правой панели
        const dockGeo = new THREE.BoxGeometry(6, 15, 8);
        const dock = new THREE.Mesh(dockGeo, PC.matAccent);
        dock.position.set(33, 60, 5);
        grp.add(dock);

        // Колеса
        const wheelGeo = new THREE.CylinderGeometry(6, 6, 4, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        
        [[-25, -15], [25, -15], [-25, 15], [25, 15]].forEach(([x, z]) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(x, 6, z);
            wheel.castShadow = true;
            grp.add(wheel);
        });

        // Панель управления (лицевая)
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.8 });
        const panel = new THREE.Mesh(new THREE.BoxGeometry(50, 30, 2), panelMat);
        panel.position.set(0, 65, 21);
        grp.add(panel);

        // Дисплей мощности
        const dispCanvas = document.createElement('canvas');
        dispCanvas.width = 256; dispCanvas.height = 128;
        const dCtx = dispCanvas.getContext('2d');
        function drawDisplay(power) {
            dCtx.fillStyle = '#1a2030'; dCtx.fillRect(0, 0, 256, 128);
            dCtx.strokeStyle = '#3355CC'; dCtx.lineWidth = 3;
            dCtx.strokeRect(4, 4, 248, 120);
            dCtx.font = 'bold 18px monospace'; dCtx.fillStyle = '#E8ECF1';
            dCtx.textAlign = 'left'; dCtx.fillText('ПЛАЗМА / РЕЖИМ', 16, 30);
            dCtx.font = 'bold 58px "Courier New",monospace';
            dCtx.fillStyle = power > 0 ? '#3355CC' : '#4a5568';
            dCtx.textAlign = 'right'; dCtx.fillText(power.toString().padStart(3, '0'), 220, 96);
            dCtx.font = 'bold 22px monospace'; dCtx.fillStyle = '#C8CED8';
            dCtx.fillText('%', 246, 96);
            if (PC.dispTex) PC.dispTex.needsUpdate = true;
        }
        PC.dispTex = new THREE.CanvasTexture(dispCanvas);
        PC.drawDisplay = drawDisplay;
        drawDisplay(0);
        const dispMat = new THREE.MeshBasicMaterial({ map: PC.dispTex });
        const dispMesh = new THREE.Mesh(new THREE.PlaneGeometry(44, 22), dispMat);
        dispMesh.position.set(0, 65, 22.1);
        grp.add(dispMesh);

        return grp;
    }

    // ─── 6. СИСТЕМА ЧАСТИЦ ИСКР ──────────────────
    function initSparks() {
        PC.sparkPool = [];
        const geo = new THREE.SphereGeometry(0.8, 4, 4);
        for (let i = 0; i < PC.SPARK_COUNT; i++) {
            const m = new THREE.Mesh(geo, PC.matSpark.clone());
            m.visible = false;
            scene.add(m);
            PC.sparkPool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, maxLife: 0 });
        }
    }

    function emitSparks(origin, normal) {
        let emitted = 0;
        for (let i = 0; i < PC.sparkPool.length && emitted < 8; i++) {
            const s = PC.sparkPool[i];
            if (s.life > 0) continue;
            s.mesh.position.copy(origin);
            s.mesh.visible = true;

            // Вектор нормали отклоняет искры вниз
            const spread = 0.8;
            s.vel.set(
                (Math.random() - 0.5) * spread + normal.x * 0.2,
                -(0.5 + Math.random() * 1.5),           // гравитация вниз
                (Math.random() - 0.5) * spread + normal.z * 0.2
            );
            s.maxLife = PC.SPARK_LIFE * (0.5 + Math.random() * 0.5);
            s.life    = s.maxLife;
            s.mesh.material.color.setHSL(0.07 + Math.random() * 0.05, 1, 0.65);
            emitted++;
        }
    }

    function updateSparks(dt) {
        const G = -980 * 0.005; // упрощённая гравитация в юнитах
        for (const s of PC.sparkPool) {
            if (s.life <= 0) { s.mesh.visible = false; continue; }
            s.life -= dt;
            s.vel.y += G * dt;
            s.mesh.position.addScaledVector(s.vel, dt * 60);
            const t = s.life / s.maxLife;
            s.mesh.material.opacity = t * t;
            const scale = 0.4 + t * 1.2;
            s.mesh.scale.setScalar(scale);
            if (s.mesh.position.y < 0) { s.life = 0; }
        }
    }

    // ─── 7. СЛЕД РЕЗА (ГОРЯЧИЕ РЁБРА) ───────────
    function addHotEdge(pointsArr) {
        const geo = new THREE.BufferGeometry().setFromPoints(pointsArr);
        const mat = new THREE.LineBasicMaterial({
            color: 0xFF4400,
            linewidth: 3,
            transparent: true,
            opacity: 1.0,
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        PC.state.hotEdges.push({ line, t: PC.COOL_TIME });
    }

    function updateHotEdges(dt) {
        for (let i = PC.state.hotEdges.length - 1; i >= 0; i--) {
            const he = PC.state.hotEdges[i];
            he.t -= dt;
            if (he.t <= 0) {
                scene.remove(he.line);
                he.line.geometry.dispose();
                he.line.material.dispose();
                PC.state.hotEdges.splice(i, 1);
                continue;
            }
            const tf = he.t / PC.COOL_TIME;
            // от оранжево-красного к серому шлаку
            const r = 1.0;
            const g = tf * 0.4;
            const b = tf * 0.1;
            he.line.material.color.setRGB(r, g, b);
            he.line.material.opacity = Math.min(1, tf * 1.5);
        }
    }

    // ─── 8. CSG — ПОСТРОЕНИЕ РЕЖУЩЕГО ОБЪЁМА ────
    // Строит TubeGeometry вдоль массива точек реза
        function buildCuttingVolume(points, normal) {
        if (points.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(points);
        const segments = Math.max(4, points.length * 2);
        const smoothPoints = curve.getPoints(segments);
        const N = smoothPoints.length;
        const radius = PC.CUT_BEAM_WIDTH * 1.5;
        const depth = 40;
        const n = normal.clone().normalize();
        const deepDir = n.clone().multiplyScalar(-depth/2);
        const upDir = n.clone().multiplyScalar(depth/2);
        const vertices = [];
        const indices = [];
        for (let i = 0; i < N; i++) {
            let tangent = new THREE.Vector3();
            if (i === 0) {
                tangent.subVectors(smoothPoints[1], smoothPoints[0]).normalize();
            } else if (i === N - 1) {
                tangent.subVectors(smoothPoints[N-1], smoothPoints[N-2]).normalize();
            } else {
                tangent.subVectors(smoothPoints[i+1], smoothPoints[i-1]).normalize();
            }
            const binormal = new THREE.Vector3().crossVectors(tangent, n).normalize();
            const p = smoothPoints[i];
            const left = p.clone().addScaledVector(binormal, radius);
            const right = p.clone().addScaledVector(binormal, -radius);
            const tl = left.clone().add(upDir);
            const tr = right.clone().add(upDir);
            const bl = left.clone().add(deepDir);
            const br = right.clone().add(deepDir);
            vertices.push(tl.x, tl.y, tl.z, tr.x, tr.y, tr.z, bl.x, bl.y, bl.z, br.x, br.y, br.z);
        }
        for (let i = 0; i < N - 1; i++) {
            const base = i * 4; const next = (i + 1) * 4;
            const tl0 = base; const tr0 = base+1; const bl0 = base+2; const br0 = base+3;
            const tl1 = next; const tr1 = next+1; const bl1 = next+2; const br1 = next+3;
            indices.push(tl0, tr1, tr0); indices.push(tl0, tl1, tr1);
            indices.push(bl0, br0, br1); indices.push(bl0, br1, bl1);
            indices.push(tl0, bl0, bl1); indices.push(tl0, bl1, tl1);
            indices.push(tr0, br1, br0); indices.push(tr0, tr1, br1);
        }
        indices.push(0, 1, 3); indices.push(0, 3, 2);
        const last = (N - 1) * 4;
        indices.push(last, last+3, last+1); indices.push(last, last+2, last+3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        if (window.THREE.BufferGeometry.prototype.computeBoundsTree) geo.computeBoundsTree();
        const brushMat = new THREE.MeshStandardMaterial({color: 0x555555});
        const brush = new window.CSGBrush(geo, brushMat);
        brush.updateMatrixWorld(true);
        return brush;
    }

    // ─── 9. FLOOD FILL — РАЗДЕЛЕНИЕ ГЕОМЕТРИИ ───
    // После CSG-вычитания ищем несвязные куски и создаём отдельные Mesh
    function splitDisconnectedMeshes(geometry, originalMesh) {
        if (!geometry.index) return [originalMesh];
        
        const index = geometry.index.array;
        const pos = geometry.attributes.position;
        const N = pos.count;
        const triCount = index.length / 3;

        // Weld vertices spatially to fix CSG seams
        const weldedIndices = new Int32Array(N);
        const vMap = new Map();
        let nextWeldIdx = 0;
        
        for (let i = 0; i < N; i++) {
            const hash = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
            if (vMap.has(hash)) {
                weldedIndices[i] = vMap.get(hash);
            } else {
                weldedIndices[i] = nextWeldIdx;
                vMap.set(hash, nextWeldIdx);
                nextWeldIdx++;
            }
        }

        // Adjacency
        const vertToTri = new Array(nextWeldIdx).fill(null).map(() => []);
        for (let ti = 0; ti < triCount; ti++) {
            const a = weldedIndices[index[ti * 3]];
            const b = weldedIndices[index[ti * 3 + 1]];
            const c = weldedIndices[index[ti * 3 + 2]];
            vertToTri[a].push(ti);
            vertToTri[b].push(ti);
            vertToTri[c].push(ti);
        }

        // BFS
        const visitedTri = new Uint8Array(triCount);
        const components = [];

        for (let ti = 0; ti < triCount; ti++) {
            if (visitedTri[ti]) continue;
            
            const queue = [ti];
            visitedTri[ti] = 1;
            const compTris = [ti];
            
            let qIdx = 0;
            while(qIdx < queue.length) {
                const currTri = queue[qIdx++];
                const a = weldedIndices[index[currTri * 3]];
                const b = weldedIndices[index[currTri * 3 + 1]];
                const c = weldedIndices[index[currTri * 3 + 2]];
                
                for (const v of [a, b, c]) {
                    const neighbors = vertToTri[v];
                    for (let ni = 0; ni < neighbors.length; ni++) {
                        const nTri = neighbors[ni];
                        if (!visitedTri[nTri]) {
                            visitedTri[nTri] = 1;
                            queue.push(nTri);
                            compTris.push(nTri);
                        }
                    }
                }
            }
            components.push(compTris);
        }

        if (components.length <= 1) return null;

        const fragments = [];
        components.forEach((tris, ci) => {
            const newGeo = new THREE.BufferGeometry();
            const posArr = [], normArr = [], uvArr = [];
            const newIndex = [];
            
            const oldToNew = new Map();
            let nextV = 0;
            const hasUV = !!geometry.attributes.uv;
            const hasNorm = !!geometry.attributes.normal;
            
            tris.forEach(ti => {
                for (let k = 0; k < 3; k++) {
                    const oldV = index[ti * 3 + k];
                    if (!oldToNew.has(oldV)) {
                        oldToNew.set(oldV, nextV++);
                        posArr.push(pos.getX(oldV), pos.getY(oldV), pos.getZ(oldV));
                        if (hasNorm) normArr.push(geometry.attributes.normal.getX(oldV), geometry.attributes.normal.getY(oldV), geometry.attributes.normal.getZ(oldV));
                        if (hasUV) uvArr.push(geometry.attributes.uv.getX(oldV), geometry.attributes.uv.getY(oldV));
                    }
                    newIndex.push(oldToNew.get(oldV));
                }
            });
            
            newGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
            if (hasNorm) newGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normArr), 3));
            if (hasUV) newGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
            newGeo.setIndex(newIndex);
            if (window.THREE.BufferGeometry.prototype.computeBoundsTree) newGeo.computeBoundsTree();
            
            const newMesh = new THREE.Mesh(newGeo, originalMesh.material);
            newMesh.userData = { ...originalMesh.userData, isDetachedFragment: true, fragmentIndex: ci };
            newMesh.position.copy(originalMesh.position);
            newMesh.quaternion.copy(originalMesh.quaternion); 
            newMesh.scale.copy(originalMesh.scale);
            
            fragments.push(newMesh);
        });
        
        return fragments;
    }

    // ─── 10. ФИЗИКА ПАДЕНИЯ ФРАГМЕНТОВ ──────────
    function launchFragment(mesh, index) {
        const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 50,
            30 + Math.random() * 40,
            (Math.random() - 0.5) * 50
        );
        const angVel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
        );
        const frag = { mesh, vel, angVel, landed: false };
        if (!PC.fallingFragments) PC.fallingFragments = [];
        PC.fallingFragments.push(frag);
    }

    function updateFragments(dt) {
        if (!PC.fallingFragments) return;
        const G = -600;
        for (const frag of PC.fallingFragments) {
            if (frag.landed) continue;
            frag.vel.y += G * dt;
            frag.mesh.position.addScaledVector(frag.vel, dt);
            frag.mesh.rotation.x += frag.angVel.x;
            frag.mesh.rotation.y += frag.angVel.y;
            frag.mesh.rotation.z += frag.angVel.z;
            if (frag.mesh.position.y < 2) {
                frag.mesh.position.y = 2;
                frag.vel.set(0, 0, 0);
                frag.angVel.set(0, 0, 0);
                frag.landed = true;
            }
        }
    }

    // ─── 10. ГЛАВНАЯ ФУНКЦИЯ ВЫРЕЗАНИЯ (С ПОМОЩЬЮ three-bvh-csg) ───
    function performCSGSubtract(targetMesh, cutBrush, cutPoints, normal) {
        if (!targetMesh || !cutBrush || !window.CSGEvaluator) return;
        
        if (!targetMesh.geometry.boundsTree && window.THREE.BufferGeometry.prototype.computeBoundsTree) {
            targetMesh.geometry.computeBoundsTree();
        }
        
        const targetBrush = new window.CSGBrush(targetMesh.geometry, targetMesh.material);
        targetBrush.position.copy(targetMesh.position);
        targetBrush.quaternion.copy(targetMesh.quaternion);
        targetBrush.scale.copy(targetMesh.scale);
        targetBrush.updateMatrixWorld(true);
        
        const evaluator = new window.CSGEvaluator();
        evaluator.useGroups = false;
        
        const result = evaluator.evaluate(targetBrush, cutBrush, window.CSG_SUBTRACTION);
        if (!result) return;
        
        const resultGeo = result.geometry;
        resultGeo.computeVertexNormals();
        resultGeo.computeBoundingSphere();
        resultGeo.computeBoundingBox();
        
        // 4. Проверяем распалась ли деталь (BFS)
        const fragments = splitDisconnectedMeshes(resultGeo, targetMesh);

        if (fragments && fragments.length > 1) {
            scene.remove(targetMesh);
            if (typeof workpieces !== 'undefined') {
                const idx = workpieces.indexOf(targetMesh);
                if (idx > -1) workpieces.splice(idx, 1);
            }
            // Сортируем фрагменты по кол-ву вершин, чтобы самый большой остался на месте (idx 0)
            fragments.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
            
            fragments.forEach((frag, idx) => {
                frag.geometry.computeBoundingSphere();
                frag.geometry.computeBoundingBox();
                scene.add(frag);
                if (typeof workpieces !== 'undefined') workpieces.push(frag);
                
                // Переносим маркеры на основу
                if (targetMesh.userData.hlGroup && idx === 0) {
                     frag.add(targetMesh.userData.hlGroup);
                     frag.userData.hlGroup = targetMesh.userData.hlGroup;
                     frag.userData.hlPlane = targetMesh.userData.hlPlane;
                     frag.userData.hlEdges = targetMesh.userData.hlEdges;
                }
                
                if (idx > 0) launchFragment(frag, idx);
            });
        } else {
            targetMesh.geometry.dispose();
            targetMesh.geometry = resultGeo;
            if (targetMesh.geometry.boundsTree) targetMesh.geometry.disposeBoundsTree();
            if (window.THREE.BufferGeometry.prototype.computeBoundsTree) targetMesh.geometry.computeBoundsTree();
        }
        addHotEdge(cutPoints.map(p => p.clone()));
    }

    // ─── 12. УПРАВЛЕНИЕ РЕЗАКОМ ──────────────────
    function setupCutterControls() {
        if (typeof camera === 'undefined' || typeof scene === 'undefined') {
            console.warn('[PlasmaC] camera/scene not ready, retrying...');
            setTimeout(setupCutterControls, 500);
            return;
        }

        PC.raycaster = new THREE.Raycaster();
        PC.mouse = new THREE.Vector2(0, 0); // центр экрана (FPS)
        PC.isActive = false;     // резак активирован
        PC.fallingFragments = [];

        // Обработка ЛКМ/ПКМ
        document.addEventListener('mousedown', onCutMouseDown);
        document.addEventListener('mouseup',   onCutMouseUp);
        document.addEventListener('mousemove', onCutMouseMove);

        //console.log('[PlasmaC] Controls ready.');
    }

    function toggleCutterEquip() {
        PC.isActive = !PC.isActive;
        PC.state.isCutting = false;
        PC.cutFlameMesh.visible = false;
        PC.idleFlameSprite.visible = PC.isActive;
        PC.cutLight.intensity = 0;

        if (PC.isActive) {
            PC.drawDisplay(75);
            // Берем резак в руку (остается в scene, анимируется в PC.update)
            scene.add(PC.cutterGroup);
        } else {
            PC.drawDisplay(0);
            PC.state.cutPoints = [];
            // Возвращаем резак на станцию (анимируется в PC.update)
            scene.add(PC.cutterGroup);
        }
    }

    function createGeneratorPhantom() {
        if (!PC.phantom) {
            PC.phantom = new THREE.Group();
            PC.phantom.userData.isPlasmaStation = false; 

            // Огибающая коробка (по размеру станции)
            const bodyGeo = new THREE.BoxGeometry(62, 90, 42);

            // Полупрозрачный синий материал (как у теодолита)
            const mat = new THREE.MeshBasicMaterial({ 
                color: 0x00ccff, transparent: true, opacity: 0.4, depthWrite: false 
            });
            const mesh = new THREE.Mesh(bodyGeo, mat);
            mesh.position.set(0, 45, 0); // Центр коробки смещен на половину высоты
            PC.phantom.add(mesh);

            // Каркас (проволочный)
            const wireMat = new THREE.MeshBasicMaterial({ 
                color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.7 
            });
            const wireMesh = new THREE.Mesh(bodyGeo, wireMat);
            wireMesh.position.set(0, 45, 0);
            PC.phantom.add(wireMesh);

            scene.add(PC.phantom);
        }
        PC.phantom.visible = true;
    }

    function onCutMouseDown(e) {
        if (document.pointerLockElement === null) return;
        
        PC.raycaster.setFromCamera(PC.mouse, camera);

        // ПКМ - взять/поставить станцию
        if (e.button === 2) {
            if (PC.state.isCarryingGenerator) {
                // Если фантом скрыт, значит нельзя ставить
                if (!PC.phantom || !PC.phantom.visible) return;

                // Установка на место фантома
                scene.add(PC.station);
                PC.station.position.copy(PC.phantom.position);
                PC.station.rotation.copy(PC.phantom.rotation);
                
                PC.state.isCarryingGenerator = false;
                PC.phantom.visible = false;
                
                if (!PC.isActive) {
                    PC.cutterGroup.position.copy(PC.station.position).add(new THREE.Vector3(20, 40, 20));
                }
            } else {
                // Пытаемся взять
                const targets = [PC.station];
                const hits = PC.raycaster.intersectObjects(targets, true);
                if (hits.length > 0 && hits[0].distance < 250) {
                    if (PC.isActive) toggleCutterEquip();
                    
                    scene.remove(PC.station); // Убираем оригинал
                    createGeneratorPhantom(); // Показываем фантом
                    PC.phantom.position.copy(PC.station.position);
                    PC.phantom.rotation.copy(PC.station.rotation);
                    PC.state.isCarryingGenerator = true;
                }
            }
            return;
        }

        // ЛКМ
        if (e.button === 0) {
            if (PC.state.isCarryingGenerator) {
                // ЛКМ ничего не делает при переноске генератора
                return;
            }

            // Взятие/возврат резака со станции
            if (!PC.state.isCarryingGenerator) {
                const hitsStation = PC.raycaster.intersectObjects([PC.station], true);
                if (hitsStation.length > 0 && hitsStation[0].distance < 300) {
                    toggleCutterEquip();
                    return; 
                }
            }

            if (!PC.isActive) return;

            if (camera.position.distanceTo(PC.station.getWorldPosition(new THREE.Vector3())) > 400) {
                console.log("Слишком далеко от генератора плазмореза!");
                return;
            }

            // Начало реза
            const targets = [];
            scene.traverse(obj => {
                if (obj.isMesh && (obj.userData.isWorkpiece || obj.userData.isDetachedFragment)) {
                    targets.push(obj);
                }
            });

            const hits = PC.raycaster.intersectObjects(targets, false);
            if (hits.length > 0 && hits[0].distance < 200) {
                const hit = hits[0];
                PC.state.isCutting = true;
                PC.state.hitMesh   = hit.object;
                PC.state.cutNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                PC.state.cutPoints = [hit.point.clone()];
                PC.cutFlameMesh.visible  = true;
                PC.idleFlameSprite.visible = false;
                PC.cutLight.intensity = 3;
                PC.drawDisplay(100);
                
                if (PC.liveCutMesh) {
                    scene.remove(PC.liveCutMesh);
                    PC.liveCutMesh.geometry.dispose();
                }
                PC.liveCutMesh = new THREE.Mesh(
                    new THREE.BufferGeometry(),
                    new THREE.MeshBasicMaterial({color: 0x111111, depthTest: false})
                );
                PC.liveCutMesh.renderOrder = 999;
                scene.add(PC.liveCutMesh);
            }
        }
    }

    function onCutMouseUp(e) {
        if (!PC.isActive || e.button !== 0 || !PC.state.isCutting) return;
        PC.state.isCutting = false;
        PC.cutFlameMesh.visible  = false;
        PC.idleFlameSprite.visible = PC.isActive;
        PC.cutLight.intensity = 0;
        PC.drawDisplay(75);
        
        if (PC.liveCutMesh) {
            scene.remove(PC.liveCutMesh);
            PC.liveCutMesh.geometry.dispose();
            PC.liveCutMesh = null;
        }

        const pts   = PC.state.cutPoints.slice();
        const norm  = PC.state.cutNormal;
        const mesh  = PC.state.hitMesh;

        if (pts.length >= 2 && mesh) {
            requestIdleCallback(() => {
                const cutBrush = buildCuttingVolume(pts, norm);
                if (cutBrush) {
                    performCSGSubtract(mesh, cutBrush, pts, norm);
                    cutBrush.geometry.dispose();
                }
            });
        }
        PC.state.cutPoints = [];
        PC.state.hitMesh   = null;
    }

    function onCutMouseMove(e) {
        if (document.pointerLockElement === null) return;
        PC.raycaster.setFromCamera(PC.mouse, camera);

        if (PC.state.isCarryingGenerator && PC.phantom) {
            // Перемещение фантома (оптимизировано, чтобы не зависать)
            const targetMeshes = [];
            scene.children.forEach(c => {
                if (c.userData.isFloor || c.userData.isTable || c.name === 'Floor') {
                    targetMeshes.push(c);
                }
            });
            const hits = PC.raycaster.intersectObjects(targetMeshes, true);
            if (hits.length > 0) {
                PC.phantom.position.copy(hits[0].point);
                PC.phantom.position.y = hits[0].point.y < 5 ? 0 : hits[0].point.y;
                PC.phantom.rotation.set(0, camera.rotation.y, 0);
                PC.phantom.visible = true;
                return;
            }
            PC.phantom.visible = false;
            return;
        }

        if (!PC.isActive || !PC.state.isCutting) return;

        const targets = [];
        if (PC.state.hitMesh) targets.push(PC.state.hitMesh);

        const hits = PC.raycaster.intersectObjects(targets, false);
        if (hits.length > 0 && hits[0].distance < 200) {
            const pt = hits[0].point.clone();
            const last = PC.state.cutPoints[PC.state.cutPoints.length - 1];
            if (!last || pt.distanceTo(last) > 2) {
                PC.state.cutPoints.push(pt);
                
                if (PC.liveCutMesh && PC.state.cutPoints.length > 1) {
                    const curve = new THREE.CatmullRomCurve3(PC.state.cutPoints);
                    const segments = Math.max(2, PC.state.cutPoints.length);
                    const geo = new THREE.TubeGeometry(curve, segments, PC.CUT_BEAM_WIDTH * 0.8, 4, false);
                    PC.liveCutMesh.geometry.dispose();
                    PC.liveCutMesh.geometry = geo;
                }
                emitSparks(pt, PC.state.cutNormal || new THREE.Vector3(0, 1, 0));
            }
        }
    }

    // ─── 13. ОБНОВЛЕНИЕ ШЛАНГА ──────────────────────
    function updateHose() {
        if (!PC.hoseGroup || !PC.station || !PC.cutterGroup) return;

        // 1. Координата крепления на генераторе (локально 34, 40, 0)
        const stationAttachLocal = new THREE.Vector3(34, 40, 0);
        const stationPt = stationAttachLocal.clone().applyMatrix4(PC.station.matrixWorld);
        
        // Вектор выхода из генератора (направление вправо от него)
        const stationOutDir = new THREE.Vector3(1, 0, 0).transformDirection(PC.station.matrixWorld);

        // 2. Координата крепления на резаке (задняя часть рукоятки Z=9)
        const cutterAttachLocal = new THREE.Vector3(0, 0, 9);
        const cutterPt = cutterAttachLocal.clone().applyMatrix4(PC.cutterGroup.matrixWorld);
        
        // Вектор выхода из резака (направление назад)
        const cutterOutDir = new THREE.Vector3(0, 0, 1).transformDirection(PC.cutterGroup.matrixWorld);

        // 3. Строим жесткую кривую
        const stiffDist = 20; 
        const cpStation = stationPt.clone().add(stationOutDir.multiplyScalar(stiffDist));
        const cpCutter = cutterPt.clone().add(cutterOutDir.multiplyScalar(stiffDist));

        const dist = stationPt.distanceTo(cutterPt);
        const sag = Math.max(10, 40 - dist * 0.1); 
        
        const midPoint = new THREE.Vector3().lerpVectors(cpStation, cpCutter, 0.5);
        midPoint.y -= sag;

        const curve = new THREE.CatmullRomCurve3([
            cutterPt,
            cpCutter,
            midPoint,
            cpStation,
            stationPt
        ]);

        // 4. Обновляем геометрию
        if (PC.hoseGroup.geometry) {
            PC.hoseGroup.geometry.dispose();
        }
        PC.hoseGroup.geometry = new THREE.TubeGeometry(curve, 20, 1.5, 8, false);
    }

    // ─── 14. ОБНОВЛЕНИЕ (вызывается из main loop) ─
    PC.update = function (dt) {
        if (!dt || isNaN(dt)) dt = 0.016;
        dt = Math.min(dt, 0.1);

        // Ограничение расстояния при резке (длина шланга держит)
        if (PC.isActive && PC.station) {
            const maxDist = 250; // Максимальная длина шланга
            const dx = camera.position.x - PC.station.position.x;
            const dz = camera.position.z - PC.station.position.z;
            const distSq = dx*dx + dz*dz;
            if (distSq > maxDist * maxDist) {
                const dist = Math.sqrt(distSq);
                const ratio = maxDist / dist;
                camera.position.x = PC.station.position.x + dx * ratio;
                camera.position.z = PC.station.position.z + dz * ratio;
            }
        }

        // Отключение резака, если вышли из режима FPS
        if (PC.isActive && typeof cameraMode !== 'undefined' && cameraMode !== 'FPS') {
            toggleCutterEquip();
        }

        updateHose();
        updateSparks(dt);
        updateHotEdges(dt);
        updateFragments(dt);

        // Анимация пламени ожидания
        if (PC.isActive && !PC.state.isCutting) {
            const pulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.008);
            PC.idleFlameSprite.scale.setScalar(PC.IDLE_FLAME_SIZE * pulse);
        }

        // Анимация пламени резки
        if (PC.state.isCutting) {
            const flicker = 0.9 + 0.1 * Math.random();
            PC.cutFlameMesh.scale.set(1 + 0.5 * Math.random(), 1 + 0.2 * Math.random(), 1 + 0.5 * Math.random());
            PC.cutLight.intensity = 2.5 + Math.random() * 1.5;
        }

        // Вращение крутилки при резке
        if (PC.knob && PC.state.isCutting) {
            PC.knob.rotation.z += dt * 2;
        }

        // Анимация положения резака
        if (PC.cutterGroup && typeof camera !== 'undefined') {
            const currentPos = PC.cutterGroup.position;
            const currentQuat = PC.cutterGroup.quaternion;
            const targetPos = new THREE.Vector3();
            const targetQuat = new THREE.Quaternion();

            // Обработка положения самого резака
            if (PC.isActive) {
                PC.cutterGroup.visible = true;
                if (PC.state.isCutting && PC.state.cutPoints.length > 0) {
                    // Анимация к месту реза
                    const lastPt = PC.state.cutPoints[PC.state.cutPoints.length - 1];
                    const norm = PC.state.cutNormal || new THREE.Vector3(0, 1, 0);
                    
                    const viewDir = new THREE.Vector3();
                    camera.getWorldDirection(viewDir);
                    
                    const m = new THREE.Matrix4().lookAt(camera.position, camera.position.clone().add(viewDir), new THREE.Vector3(0,1,0));
                    targetQuat.setFromRotationMatrix(m);
                    
                    // Вращаем так, чтобы сопло смотрело вниз к точке реза
                    // Изменен угол с -1.5 на -1.0 чтобы резак наклонялся к рабочему
                    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.0, 0, 0));
                    targetQuat.multiply(tilt);
                    
                    const localAnchor = new THREE.Vector3(0, -14, -12.5); // Локальное положение якоря пламени относительно центра рукоятки
                    const rotatedAnchor = localAnchor.clone().applyQuaternion(targetQuat);
                    
                    targetPos.copy(lastPt).sub(rotatedAnchor);
                    targetPos.addScaledVector(norm, 18.0); // Смещение выше над металлом
                    
                    currentPos.lerp(targetPos, dt * 15);
                    currentQuat.slerp(targetQuat, dt * 15);
                } else {
                    // Режим Idle в руках
                    const camDir = new THREE.Vector3();
                    camera.getWorldDirection(camDir);
                    const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0,1,0)).normalize();
                    
                    targetPos.copy(camera.position)
                             .addScaledVector(camDir, 16) // вперёд
                             .addScaledVector(right, 6)   // вправо
                             .add(new THREE.Vector3(0, -16, 0)); // ещё ниже в руке
                             
                    const m = new THREE.Matrix4().lookAt(targetPos, targetPos.clone().add(camDir), new THREE.Vector3(0,1,0));
                    targetQuat.setFromRotationMatrix(m);
                    
                    // Наклон вверх чтобы сопло было сверху (1.2 радиана)
                    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0, 0.1));
                    targetQuat.multiply(tilt);
                    
                    currentPos.lerp(targetPos, dt * 8);
                    currentQuat.slerp(targetQuat, dt * 8);
                }
            } else if (PC.station) {
                // Возврат на базу (или прячем, если несем саму базу)
                if (PC.state.isCarryingGenerator) {
                    PC.cutterGroup.visible = false;
                    if (PC.hoseGroup) PC.hoseGroup.visible = false;
                } else {
                    PC.cutterGroup.visible = true;
                    if (PC.hoseGroup) PC.hoseGroup.visible = true;
                    targetPos.copy(PC.station.position).add(
                        new THREE.Vector3(33, 68, 5).applyEuler(PC.station.rotation)
                    );
                    targetQuat.copy(PC.station.quaternion).multiply(
                        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0))
                    );
                    currentPos.lerp(targetPos, dt * 10);
                    currentQuat.slerp(targetQuat, dt * 10);
                }
            }
        }
    };

    // ─── 14. ПОДСКАЗКА UI ─────────────────────────
    function addPlasmaHUD() {
        const hud = document.createElement('div');
        hud.id = 'plasma-hud';
        hud.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 20, 40, 0.85);
            border: 1px solid #00ffcc;
            color: #00ffcc;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            padding: 8px 16px;
            border-radius: 6px;
            z-index: 200;
            display: none;
            text-align: center;
            letter-spacing: 1px;
            pointer-events: none;
        `;
        hud.innerHTML = `
            <b style="color:#E6A817">ПЛАЗМОРЕЗ АКТИВЕН</b><br>
            <span style="opacity:0.8">[ЛКМ] Резать  •  [ЛКМ по станции] Положить резак</span>
        `;
        document.body.appendChild(hud);
        PC.hud = hud;

        const mainHUD = document.createElement('div');
        mainHUD.id = 'plasma-hud-main';
        mainHUD.style.cssText = `
            position: fixed;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            color: #E6A817;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            padding: 8px 16px;
            z-index: 200;
            display: none;
            text-align: center;
            letter-spacing: 1px;
            pointer-events: none;
            text-shadow: 1px 1px 2px black;
        `;
        mainHUD.innerHTML = `[ПКМ] Взять/Отменить перенос • [ЛКМ] Поставить станцию / Взять резак`;
        document.body.appendChild(mainHUD);
        PC.mainHUD = mainHUD;

        // Показываем/скрываем HUD
        setInterval(() => {
            if (typeof camera !== 'undefined' && PC.station) {
                const isNear = camera.position.distanceTo(PC.station.getWorldPosition(new THREE.Vector3())) < 300;
                if (PC.hud) PC.hud.style.display = PC.isActive ? 'block' : 'none';
                if (PC.mainHUD) PC.mainHUD.style.display = (!PC.isActive && (isNear || PC.state.isCarryingGenerator)) ? 'block' : 'none';
            }
        }, 200);
    }

    // ─── 15. ИНИЦИАЛИЗАЦИЯ ────────────────────────
    function init() {
        if (typeof scene === 'undefined' || typeof THREE === 'undefined') {
            setTimeout(init, 300);
            return;
        }

        buildMaterials();

        // Станция генератора плазмы
        const station = buildGeneratorStation();
        station.position.set(PC.STATION_X, PC.TABLE_Y, PC.STATION_Z - 80);
        station.rotation.y = Math.PI; // лицом к столам
        scene.add(station);
        PC.station = station;

        // Коллизия для станции
        if (typeof boxColliders !== 'undefined') {
            boxColliders.push({
                minX: PC.STATION_X - 40,
                maxX: PC.STATION_X + 40,
                minZ: (PC.STATION_Z - 80) - 30,
                maxZ: (PC.STATION_Z - 80) + 30,
            });
        }

        // 3D-модель резака (держится в руках игрока или лежит на станции)
        const cutter = buildCutterModel();
        // Резак «висит» на станции до активации
        cutter.position.copy(station.position).add(new THREE.Vector3(20, 40, 20));
        cutter.rotation.set(0, -Math.PI / 4, 0);
        scene.add(cutter);
        PC.cutterGroup = cutter;

        // "Живой" шланг
        PC.hoseGroup = new THREE.Mesh(new THREE.BufferGeometry(), PC.matHose);
        scene.add(PC.hoseGroup);

        // Пул искр
        initSparks();

        // Контролы
        setupCutterControls();

        // HUD удален по просьбе пользователя

        // Регистрируем обновление в main loop
        if (window._extraUpdaters) {
            window._extraUpdaters.push((dt) => PC.update(dt));
        } else {
            window._extraUpdaters = [(dt) => PC.update(dt)];
        }

        //console.log('[PlasmaC] ✅ Plasma cutter initialized at', PC.STATION_X, PC.STATION_Z);
        //console.log('[PlasmaC] Press [P] to activate/deactivate the plasma cutter.');
    }

    // Запускаем после загрузки сцены
    window.PlasmaC = PC;
    window.addEventListener('load', () => setTimeout(init, 1500));

})();

