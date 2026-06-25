// --- Standard Logic ---
        // Minimap
        const mapCanvas = document.getElementById('minimap');
        const mapCtx = mapCanvas ? mapCanvas.getContext('2d') : null;

        
        document.getElementById('copy-data-btn').addEventListener('click', (e) => {
            const output = document.getElementById('worker-data-output');
            output.select();
            navigator.clipboard.writeText(output.value).then(() => {
                // Visual feedback only
                const btn = e.target;
                const originalText = btn.innerText;
                btn.innerText = "Скопировано!";
                setTimeout(() => btn.innerText = originalText, 1000);
            });
        });
        document.getElementById('close-data-modal').addEventListener('click', () => {
            document.getElementById('data-modal').style.display = 'none';
            if (cameraMode === 'FPS') controls.lock();
        });

        function drawMap() {
    if (!window.OSState.isMapOpen || !mapCtx) return;
    const container = document.getElementById('os-map-container');
    if (!container) return;
    
    if (mapCanvas.width !== container.clientWidth || mapCanvas.height !== container.clientHeight) {
        mapCanvas.width = container.clientWidth;
        mapCanvas.height = container.clientHeight;
    }
    
    const cw = mapCanvas.width;
    const ch = mapCanvas.height;
    const mapW = maxX - minX; const mapH = maxY - minY;
    const scale = Math.min((cw - 60)/mapW, (ch - 60)/mapH);
    const offsetX = cw/2 - (minX + mapW/2) * scale; 
    const offsetY = ch/2 - (minY + mapH/2) * scale;
    
    // Фон карты
    mapCtx.fillStyle = '#E8ECF1'; 
    mapCtx.fillRect(0, 0, cw, ch);

    // Сетка фона (для стиля OS)
    mapCtx.strokeStyle = '#A8AEB8';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    for(let i=0; i<cw; i+=40) { mapCtx.moveTo(i,0); mapCtx.lineTo(i,ch); }
    for(let i=0; i<ch; i+=40) { mapCtx.moveTo(0,i); mapCtx.lineTo(cw,i); }
    mapCtx.stroke();
    
    // Зоны с заливкой и подписями
    zones.forEach(z => {
        const x = z.minX * scale + offsetX; 
        const y = z.minZ * scale + offsetY;
        const w = (z.maxX - z.minX) * scale; 
        const h = (z.maxZ - z.minZ) * scale;
        
        // Заливка зоны
        mapCtx.fillStyle = 'rgba(51, 85, 204, 0.05)'; 
        mapCtx.fillRect(x, y, w, h);
        
        // Рамка зоны
        mapCtx.strokeStyle = 'rgba(125, 138, 154, 0.5)'; 
        mapCtx.lineWidth = 1;
        mapCtx.strokeRect(x, y, w, h);
        
        // Подпись зоны
        mapCtx.save();
        
        // Определяем размер шрифта в зависимости от размера зоны
        const zoneDiagonal = Math.sqrt(w * w + h * h);
        let fontSize = Math.max(8, Math.min(14, zoneDiagonal / 8));
        
        mapCtx.font = `bold ${fontSize}px Arial`;
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'middle';
        
        // Центр зоны
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        
        // Разбиваем длинные названия на строки
        const words = z.name.split(' ');
        let lines = [];
        let currentLine = '';
        const maxWidth = w - 10;
        
        words.forEach(word => {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = mapCtx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });
        if (currentLine) lines.push(currentLine);
        
        // Рисуем текст с тенью
        const lineHeight = fontSize + 2;
        const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
        
        lines.forEach((line, i) => {
            const textY = startY + i * lineHeight;
            
            // Тень текста
            mapCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            mapCtx.fillText(line, centerX + 1, textY + 1); // Белая тень для читаемости на светлом
            
            // Основной текст
            mapCtx.fillStyle = '#3355CC';
            mapCtx.fillText(line, centerX, textY);
        });
        
        mapCtx.restore();
    });
    
    // Стены (только из wallsForMap - без мебели)
    mapCtx.strokeStyle = '#7D8A9A'; // Строгий приглушенный синий
    mapCtx.lineWidth = 2; 
    mapCtx.lineCap = 'round';
    mapCtx.lineJoin = 'round';
    mapCtx.beginPath();
    wallsForMap.forEach(w => {
        mapCtx.moveTo(w.x1 * scale + offsetX, w.z1 * scale + offsetY);
        mapCtx.lineTo(w.x2 * scale + offsetX, w.z2 * scale + offsetY);
    });
    mapCtx.stroke();
    
    // Рабочие (синие точки)
    workers.forEach(w => {
        const wx = w.position.x * scale + offsetX;
        const wz = w.position.z * scale + offsetY;
        
        // Внешний круг
        mapCtx.fillStyle = 'rgba(59, 130, 246, 0.5)';
        mapCtx.beginPath();
        mapCtx.arc(wx, wz, 6, 0, Math.PI * 2);
        mapCtx.fill();
        
        // Внутренний круг
        mapCtx.fillStyle = '#3b82f6';
        mapCtx.beginPath();
        mapCtx.arc(wx, wz, 4, 0, Math.PI * 2);
        mapCtx.fill();
    });
    
    // Супервайзер (если видим в режиме бога)
    if (supervisorMesh && supervisorMesh.visible) {
        const sx = supervisorMesh.position.x * scale + offsetX;
        const sy = supervisorMesh.position.z * scale + offsetY;
        
        mapCtx.fillStyle = 'rgba(224, 48, 48, 0.5)';
        mapCtx.beginPath();
        mapCtx.arc(sx, sy, 7, 0, Math.PI * 2);
        mapCtx.fill();
        
        mapCtx.fillStyle = '#E03030';
        mapCtx.beginPath();
        mapCtx.arc(sx, sy, 5, 0, Math.PI * 2);
        mapCtx.fill();
    }

    // Позиция игрока (треугольник)
    const px = camera.position.x * scale + offsetX; 
    const py = camera.position.z * scale + offsetY;
    const dir = new THREE.Vector3(); 
    camera.getWorldDirection(dir);
    const angle = Math.atan2(dir.z, dir.x);
    
    mapCtx.save(); 
    mapCtx.translate(px, py); 
    mapCtx.rotate(angle);
    
    // Цвет зависит от режима
    if (currentIdentity) {
        mapCtx.fillStyle = '#5AAFDD'; // Светло-синий (акцент)
    } else {
        mapCtx.fillStyle = '#E03030'; // Красный если супервайзер
    }
    
    // Треугольник игрока
    mapCtx.beginPath();
    mapCtx.moveTo(12, 0); 
    mapCtx.lineTo(-6, 6); 
    mapCtx.lineTo(-3, 0);
    mapCtx.lineTo(-6, -6); 
    mapCtx.closePath();
    mapCtx.fill();
    
    // Обводка
    mapCtx.strokeStyle = '#1e293b';
    mapCtx.lineWidth = 1;
    mapCtx.stroke();
    
    mapCtx.restore();
    
    // Легенда карты (Moved to Bottom Right & Styling)
    const legW = 140; 
    const legH = 80;
    const legX = mapCanvas.width - legW - 10;
    const legY = mapCanvas.height - legH - 10;

    mapCtx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Белая легенда
    mapCtx.fillRect(legX, legY, legW, legH);
    mapCtx.strokeStyle = '#A8AEB8';
    mapCtx.lineWidth = 1;
    mapCtx.strokeRect(legX, legY, legW, legH);
    
    mapCtx.font = 'bold 11px sans-serif';
    mapCtx.textAlign = 'left';
    mapCtx.textBaseline = 'middle';
    
    const rowH = 22;
    const startY = legY + 12;
    const iconX = legX + 15;
    const textX = legX + 35;

    // Игрок
    mapCtx.fillStyle = '#E03030';
    mapCtx.beginPath();
    mapCtx.moveTo(iconX+4, startY);
    mapCtx.lineTo(iconX-4, startY+4);
    mapCtx.lineTo(iconX-4, startY-4);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.fillStyle = '#1e293b'; // Text color
    mapCtx.fillText('Вы', textX, startY);
    
    // Рабочий
    mapCtx.fillStyle = '#3b82f6';
    mapCtx.beginPath();
    mapCtx.arc(iconX, startY + rowH, 4, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.fillStyle = '#1e293b';
    mapCtx.fillText('Персонал', textX, startY + rowH);
    
    // Зона
    mapCtx.fillStyle = 'rgba(51, 85, 204, 0.15)';
    mapCtx.fillRect(iconX-5, startY + rowH*2 - 5, 10, 10);
    mapCtx.strokeStyle = 'rgba(125, 138, 154, 0.5)';
    mapCtx.strokeRect(iconX-5, startY + rowH*2 - 5, 10, 10);
    mapCtx.fillStyle = '#1e293b';
    mapCtx.fillText('Зоны', textX, startY + rowH*2);
}

        function checkCollision(pos) {
            if (cameraMode !== 'FPS') return false; // No collision in God Mode

            const radius = 30;

            // 1. Static Walls
            for (const wall of wallsForCollision) {
                const dx = wall.x2 - wall.x1; const dz = wall.z2 - wall.z1;
                const l2 = dx*dx + dz*dz;
                let t = ((pos.x - wall.x1) * dx + (pos.z - wall.z1) * dz) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = wall.x1 + t * dx; const projZ = wall.z1 + t * dz;
                const distSq = (pos.x - projX)**2 + (pos.z - projZ)**2;
                if (distSq < (radius + wall.thickness/2)**2) return true;
            }
  for (const box of boxColliders) {
                // Находим ближайшую точку на поверхности коробки к игроку
                // clamp(player, min, max)
                const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
                const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));

                // Расстояние от игрока до этой точки
                const dx = pos.x - closestX;
                const dz = pos.z - closestZ;
                const distSq = dx*dx + dz*dz;

                // Если расстояние меньше радиуса игрока — столкновение
                // Мы используем радиус немного меньше (20), чтобы можно было подходить вплотную к столу
                if (distSq < 20 * 20) {
                    return true;
                }
            }

            // 2. Dynamic Doors
            for (const door of doors) {
                const boxes = [];
                // Standard door returns object, Hangar returns array
                const col = door.getCollisionBox();
                if(Array.isArray(col)) boxes.push(...col);
                else boxes.push(col);

                for(const box of boxes) {
                    // Simple OBB check: transform player into box local space
                    const dx = pos.x - box.x;
                    const dz = pos.z - box.z;
                    // rotate by -box.angle
                    const localX = dx * Math.cos(-box.angle) - dz * Math.sin(-box.angle);
                    const localZ = dx * Math.sin(-box.angle) + dz * Math.cos(-box.angle);
                    
                    if (Math.abs(localX) < (box.width/2 + radius) && Math.abs(localZ) < (box.thickness/2 + radius)) {
                        return true;
                    }
                }
            }
            return false;
        }

        let prevTime = performance.now();
        
        // =====================================================
        // 🔥 WELDING SYSTEM — Variables & Constants
        // =====================================================
        const TOOL_NONE = 0;
        const TOOL_WELDER = 6;
        const _camCenter = new THREE.Vector2(0, 0); // Кэшированный центр экрана для raycaster
        let _frameNo = 0; // Счётчик кадров для оптимизации
        // Кэшированные векторы движения (избегаем аллокации каждый кадр)
        const _fpsDir     = new THREE.Vector3();
        const _fpsRight   = new THREE.Vector3();
        const _fpsUp      = new THREE.Vector3(0, 1, 0);
        const _fpsProposed = new THREE.Vector3();
        
        // Решение (Пункт 1 и 5): Перенос состояния в объект GameState и OSState
        window.OSState = { isMapOpen: false };
        window.GameState = {
            activeTool: TOOL_NONE,
            isMaskEquipped: false,
            isGlassDown: false,
            isCabinetOpen: false,
            isWeldingNow: false,
            weldTimer: 0,
            isStuck: false,
            stuckShakeAccumulator: 0,
            isZooming: false
        };

        window.hasWelder = false;
        let nextGroupId = 1;

        // Создаем глобальные геттеры/сеттеры для обратной совместимости с другими скриптами
        Object.defineProperty(window, 'isMapOpen', { get: () => window.OSState.isMapOpen, set: (v) => window.OSState.isMapOpen = v });
        Object.defineProperty(window, 'activeTool', { get: () => window.GameState.activeTool, set: (v) => window.GameState.activeTool = v });
        Object.defineProperty(window, 'isWeldingNow', { get: () => window.GameState.isWeldingNow, set: (v) => window.GameState.isWeldingNow = v });
        Object.defineProperty(window, 'isMaskEquipped', { get: () => window.GameState.isMaskEquipped, set: (v) => window.GameState.isMaskEquipped = v });
        Object.defineProperty(window, 'isGlassDown', { get: () => window.GameState.isGlassDown, set: (v) => window.GameState.isGlassDown = v });
        Object.defineProperty(window, 'isCabinetOpen', { get: () => window.GameState.isCabinetOpen, set: (v) => window.GameState.isCabinetOpen = v });
        Object.defineProperty(window, 'weldTimer', { get: () => window.GameState.weldTimer, set: (v) => window.GameState.weldTimer = v });
        Object.defineProperty(window, 'isStuck', { get: () => window.GameState.isStuck, set: (v) => window.GameState.isStuck = v });
        Object.defineProperty(window, 'stuckShakeAccumulator', { get: () => window.GameState.stuckShakeAccumulator, set: (v) => window.GameState.stuckShakeAccumulator = v });
        Object.defineProperty(window, 'isZooming', { get: () => window.GameState.isZooming, set: (v) => window.GameState.isZooming = v });

        // Оптимизация (Пункт 2): Кэш для Raycaster
        window._weldInteractables = [];
        
        let weldingTorch = null, weldLight = null, sparkSystem = null, smokeSystem = null, electrodeMesh = null;
        const STICK_THRESHOLD = 0.5; // cm (залипание при контакте < 5мм)
        const lastBeadPos = new THREE.Vector3(0, -9999, 0);
        const lastHitNormal = new THREE.Vector3(0, 1, 0);

        // Weld params (цех scale: module meters × 100 = cm)
        const WELD_PARAMS = {
            optimalDist: 1.0,    // 1cm optimal arc
            maxDist: 50.0,       // Максимальная дуга 50 см
            feedRate: 0.05,      // Ускорено для более плотного наслоения
            electrodeBurn: 0.001275, // Снижено на 15% (хватает на дольше)
            beadSpacing: 0.15,   // Плотный шаг (мостики удалены, шов формируется наслоением)
        };

        // ⚙️ НАСТРОЙКИ СВАРОЧНОГО АППАРАТА (ток / напряжение) — задаются через панель (ПКМ)
        const WELDER_SETTINGS = {
            current: 120,        // Сила тока I, А   (диапазон 40..250)
            voltage: 22,         // Напряжение U, В  (диапазон 15..35)
            I_MIN: 40, I_MAX: 250,
            U_MIN: 15, U_MAX: 35,
        };

        // Хранилище застывших брызг (дабы ограничивать кол-во)
        const spatterMarks = [];
        // Общие геометрия/материал для брызг — не аллоцируем на каждую каплю
        const _spatterGeo = new THREE.SphereGeometry(1, 4, 3);
        // Идеально гладкая базовая геометрия для чешуек шва без "полюсов" (исключает шпильки)
        const _baseBeadGeo = new THREE.IcosahedronGeometry(1, 2);
        const _spatterMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95, metalness: 0.3 });

        // Вычисление физического профиля шва из тока/напряжения и скорости перемещения.
        // heatInput ≈ I·U/v — чем медленнее ведём, тем больше тепловложение.
        function getWeldProfile(travelSpeedCmPerSec = 3, metalThickness = 4.0, electrodeDiam = 3.0) {
            const I = WELDER_SETTINGS.current;
            const U = WELDER_SETTINGS.voltage;
            const iN = clamp((I - WELDER_SETTINGS.I_MIN) / (WELDER_SETTINGS.I_MAX - WELDER_SETTINGS.I_MIN), 0, 1);
            const uN = clamp((U - WELDER_SETTINGS.U_MIN) / (WELDER_SETTINGS.U_MAX - WELDER_SETTINGS.U_MIN), 0, 1);

            const v = Math.max(travelSpeedCmPerSec, 0.15); // Позволяем трекать очень медленное движение
            const heatInput = (I * U) / v; // Дж/см

            // Оптимальные параметры по ГОСТ/РМРС
            let optI = 60;
            if (electrodeDiam >= 3.0) optI = 95;
            if (electrodeDiam >= 4.0) optI = 145;
            if (electrodeDiam >= 5.0) optI = 190;
            if (electrodeDiam >= 6.0) optI = 225;

            const overI = clamp((I - optI * 1.15) / (optI * 0.4), 0, 1);
            const lowI  = clamp((optI * 0.85 - I) / (optI * 0.4), 0, 1);

            let optU = 20 + (electrodeDiam - 2.5) * 2.5;
            const overU = clamp((U - optU * 1.1) / 6, 0, 1);
            const lowU  = clamp((optU * 0.9 - U) / 4, 0, 1);

            // Оценка перегрева: если тепловложение слишком велико для данной толщины металла
            const heatDensity = heatInput / metalThickness; 
            const overheat = clamp((heatDensity - 200) / 150, 0, 1);
            const burnThrough = heatDensity > 400; // Прожог металла

            const cQ = 1 - Math.max(overI, lowI);
            const vQ = 1 - Math.max(overU, lowU);
            let paramQuality = Math.min(cQ, vQ);

            // Проверка соответствия диаметра электрода и толщины металла
            const diamRatio = electrodeDiam / metalThickness;
            const diamTooLarge = diamRatio > 1.2; // Слишком толстый для тонкого металла
            const diamTooSmall = diamRatio < 0.35; // Слишком тонкий для толстого металла
            if (diamTooLarge || diamTooSmall) paramQuality *= 0.5;

            const spatter = Math.max(overI, overU, overheat * 0.8);

            // Проплавление: ток ↑, напряжение ↓ (короткая дуга)
            const penetration = clamp(0.12 + iN * 0.65 - uN * 0.12 - lowI * 0.25, 0.05, 0.9);
            
            const baseWidth = electrodeDiam * 0.12; 
            const beadWidth = clamp(baseWidth + uN * 0.3 + overI * 0.15 + overheat * 0.2, baseWidth * 0.8, baseWidth * 3.0);
            
            let beadHeight = clamp(electrodeDiam * 0.1 + lowI * 0.15 - uN * 0.1 - overheat * 0.15, 0.1, 0.6);
            if (v < 1.0) beadHeight *= (1.0 + (1.0 - v) * 0.6);
            if (burnThrough) beadHeight = 0.05; // Провал при прожоге

            return {
                I, U, iN, uN, overI, overU, lowI, paramQuality, spatter,
                heatInput, overheat, burnThrough, diamTooLarge, diamTooSmall, penetration, beadWidth, beadHeight, travelSpeedCmPerSec: v
            };
        }

        // Брызги металла — застывшие тёмно-серые капли вокруг шва (ТЗ: завышенный ток / длинная дуга)
        // Оптимизировано: общие geo/mat, низкополигональные сферы, ограниченное кол-во.
        const _spTmp = new THREE.Vector3();
        function spawnSpatter(hitPoint, hitNormal, targetParent, amount) {
            if (amount <= 0) return;
            const n = 1 + Math.floor(amount * 3);
            // Базис плоскости поверхности для разлёта
            const up = hitNormal.clone().normalize();
            let tangent = new THREE.Vector3(1, 0, 0);
            if (Math.abs(up.dot(tangent)) > 0.9) tangent.set(0, 0, 1);
            const t1 = new THREE.Vector3().crossVectors(up, tangent).normalize();
            const t2 = new THREE.Vector3().crossVectors(up, t1).normalize();
            for (let i = 0; i < n; i++) {
                const r = 0.12 + Math.random() * (0.12 + amount * 0.2);
                const ang = Math.random() * Math.PI * 2;
                const dist = (1.0 + amount * 5.0) * (0.4 + Math.random());
                const testPoint = hitPoint.clone()
                    .addScaledVector(t1, Math.cos(ang) * dist)
                    .addScaledVector(t2, Math.sin(ang) * dist);
                
                // Ищем поверхность под брызгой (луч строго вниз), чтобы они не левитировали
                const rayOrigin = testPoint.clone();
                rayOrigin.y += 5.0; // Приподнимаем, чтобы не застрять внутри
                const localRaycaster = new THREE.Raycaster(rayOrigin, new THREE.Vector3(0, -1, 0), 0, 500.0);
                localRaycaster.camera = camera; // <--- Указываем камеру для raycast
                
                const targets = window._weldInteractables || workpieces;
                const hits = localRaycaster.intersectObjects(targets, true).filter(h => {
                    const u = h.object.userData;
                    if (u.isWeldBead && u.coolTime != null) return false; // Брызги могут падать на остывшие швы
                    if (u.isSpatter || u.isHighlight || u.isHelper) return false;
                    if (h.object === sparkSystem || h.object === smokeSystem) return false;
                    
                    let p = h.object;
                    while(p) {
                        if (p.userData && p.userData.isTorch) return false;
                        if (currentIdentity && p === currentIdentity.mesh) return false;
                        p = p.parent;
                    }
                    return true;
                });
                
                if (hits.length > 0) {
                    const actualHit = hits[0];
                    const finalTarget = actualHit.object;
                    const sp = new THREE.Mesh(_spatterGeo, _spatterMat);
                    sp.scale.setScalar(r);
                    
                    sp.position.copy(actualHit.point);
                    let finalNormal = new THREE.Vector3(0,1,0);
                    if (actualHit.face) {
                        finalNormal = actualHit.face.normal.clone().transformDirection(finalTarget.matrixWorld).normalize();
                    }
                    sp.position.addScaledVector(finalNormal, r * 0.4);
                    
                    finalTarget.worldToLocal(sp.position);
                    const invQ = finalTarget.getWorldQuaternion(new THREE.Quaternion()).invert();
                    sp.quaternion.premultiply(invQ);
                    
                    sp.userData.isSpatter = true;
                    sp.userData.isWeldBead = true;
                    sp.matrixAutoUpdate = false;
                    sp.updateMatrix();
                    finalTarget.add(sp);
                    spatterMarks.push(sp);
                }
            }
            while (spatterMarks.length > 140) {
                const old = spatterMarks.shift();
                if (old && old.parent) old.parent.remove(old);
            }
        }

        // Ожоги на металле (цвета побежалости / нагар)
        const scorchMarks = [];
        const _scorchGeo = new THREE.PlaneGeometry(1, 1);
        const _scorchMat = new THREE.MeshBasicMaterial({ color: 0x1a0a00, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        const _oxidMat = new THREE.MeshBasicMaterial({ color: 0x1f3b8a, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

        function spawnScorch(hitPoint, hitNormal, radius, type = 'burn') {
            // 1. Генерируем случайный разброс в плоскости вокруг центра шва
            let tan = new THREE.Vector3(1, 0, 0);
            if (Math.abs(hitNormal.dot(tan)) > 0.9) tan.set(0, 0, 1);
            const t1 = new THREE.Vector3().crossVectors(hitNormal, tan).normalize();
            const t2 = new THREE.Vector3().crossVectors(hitNormal, t1).normalize();

            const angle = Math.random() * Math.PI * 2;
            const spread = Math.random() * radius * 3.0; // Радиус разброса
            
            const testPoint = hitPoint.clone()
                .addScaledVector(t1, Math.cos(angle) * spread)
                .addScaledVector(t2, Math.sin(angle) * spread);

            // 2. Бросаем локальный луч вниз, чтобы нащупать 3D-поверхность детали
            const rayOrigin = testPoint.clone().addScaledVector(hitNormal, 5.0); // Поднимаем точку над деталью
            const rayDir = hitNormal.clone().negate(); // Светим прямо вниз
            
            const localRaycaster = new THREE.Raycaster(rayOrigin, rayDir, 0, 10.0);
            
            // Ищем пересечения ИСКЛЮЧИТЕЛЬНО с деталями (workpieces)
            const hits = localRaycaster.intersectObjects(workpieces, true).filter(h => {
                // Игнорируем попадания в сам сварочный шов, искры или маркеры
                if (h.object.userData.isWeldBead || h.object.userData.isSpatter || h.object.userData.isHighlight) return false;
                let obj = h.object;
                while (obj && obj !== scene) {
                    if (obj.userData.isWorkpiece) return true;
                    obj = obj.parent;
                }
                return false;
            });

            // Если под этим местом есть деталь — проецируем текстуру
            if (hits.length > 0) {
                const actualHit = hits[0];
                const finalTarget = actualHit.object;
                const finalPoint = actualHit.point;
                let finalNormal = new THREE.Vector3(0,1,0);
                if (actualHit.face) {
                    finalNormal = actualHit.face.normal.clone().transformDirection(finalTarget.matrixWorld).normalize();
                } else {
                    finalNormal.copy(hitNormal);
                }

                // 3. Накладываем текстуру, идеально выравнивая по найденной поверхности
                const sc = new THREE.Mesh(_scorchGeo, type === 'oxid' ? _oxidMat : _scorchMat);
                
                const sRadius = radius * (2.0 + Math.random() * 2.0); // Рандомный размер пятен
                sc.scale.set(sRadius, sRadius, 1);
                
                // Приподнимаем на микро-значение (0.02) по нормали, чтобы избежать z-fighting (мерцания)
                sc.position.copy(finalPoint).addScaledVector(finalNormal, 0.02 + Math.random() * 0.02);
                
                let sTan = new THREE.Vector3(1, 0, 0);
                if (Math.abs(finalNormal.dot(sTan)) > 0.9) sTan.set(0, 0, 1);
                const st1 = new THREE.Vector3().crossVectors(finalNormal, sTan).normalize();
                const st2 = new THREE.Vector3().crossVectors(finalNormal, st1).normalize();
                
                // Добавляем случайный поворот ожога вокруг своей оси для разнообразия
                const randRot = Math.random() * Math.PI * 2;
                const rotTan = st1.clone().multiplyScalar(Math.cos(randRot)).add(st2.clone().multiplyScalar(Math.sin(randRot))).normalize();
                const rotBi = new THREE.Vector3().crossVectors(finalNormal, rotTan).normalize();
                
                sc.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rotTan, rotBi, finalNormal));
                
                // Конвертируем мировые координаты в локальные координаты родительской детали
                finalTarget.worldToLocal(sc.position);
                const invQ = finalTarget.getWorldQuaternion(new THREE.Quaternion()).invert();
                sc.quaternion.premultiply(invQ);
                
                sc.userData.isWeldBead = true; // Защищаем пятно от будущих лучей
                finalTarget.add(sc);
                scorchMarks.push(sc);
                
                // Очистка старых пятен (лимит 150)
                while (scorchMarks.length > 150) {
                    const old = scorchMarks.shift();
                    if (old && old.parent) old.parent.remove(old);
                }
            }
        }

        // Hot metal material for weld beads
        const hotMetalBase = new THREE.MeshStandardMaterial({
            color: 0x888888, roughness: 0.7, metalness: 0.6,
            emissive: new THREE.Color(0xffaa00), emissiveIntensity: 2.0
        });

        // Audio
        let audioCtx = null, weldOscillator = null, weldGain = null,
            weldFilter = null, weldNoise = null, noiseGain = null;

        // PIP camera (near 5cm, far 20000cm)
        const weldCamera = new THREE.PerspectiveCamera(7, 240 / 180, 5, 20000);
        scene.add(weldCamera);
        let isWeldCamActive = false, weldCamAngle = 0, camRotateDir = 0, pipRenderer = null;
        const pipSmoothedTarget = new THREE.Vector3();

        // Inventory render
        function renderInventories() {
            const slot1 = document.getElementById('slot1');
            if (slot1) {
                slot1.innerHTML = '<div class="k">1</div>';
                if (window.hasWelder) {
                    const item = document.createElement('div');
                    item.className = 'inventory-item';
                    item.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff7c1d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>';
                    slot1.appendChild(item);
                }
            }

            // Книги из архива (слоты 2..4)
            if (typeof bookInventory !== 'undefined') {
                [2, 3, 4].forEach(idx => {
                    const slot = document.getElementById('slot' + idx);
                    if (!slot) return;
                    slot.innerHTML = '<div class="k">' + idx + '</div>';
                    if (bookInventory[idx]) {
                        const item = document.createElement('div');
                        item.className = 'inventory-item book-item';
                        item.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c2d12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>';
                        slot.appendChild(item);
                    }
                });
            }

            // --- ОТДЕЛЬНАЯ ПАНЕЛЬ ИНФОРМАЦИИ ОБ ЭЛЕКТРОДАХ ---
            let elInfo = document.getElementById('electrode-info-panel');
            if (!elInfo) {
                elInfo = document.createElement('div');
                elInfo.id = 'electrode-info-panel';
                elInfo.style.cssText = 'margin-left: 20px; display: flex; align-items: center; gap: 10px; justify-content: center; background: rgba(15, 23, 42, 0.8); padding: 6px 16px 6px 8px; border-radius: 8px; border: 1px solid #334155; font-family: monospace; transition: all 0.2s ease; z-index: 100; pointer-events: auto;';
                const invFlex = document.querySelector('#inventory .flex');
                if (invFlex) invFlex.appendChild(elInfo);
            }
            
            if ((window.hasWelder && activeTool === TOOL_WELDER) || window.GameState.isCabinetOpen) {
                elInfo.style.display = 'flex';
                
                if (window.playerElectrodes && window.playerElectrodes.diam != null) {
                    const packColor = window.playerElectrodes.colorHex || '3b82f6';
                    const slotContent = `<div style="width:100%; height:100%; background: #${packColor}; border-radius: 4px; border: 1px solid rgba(255,255,255,0.4); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; color:white; box-shadow: inset 0 0 12px rgba(0,0,0,0.6), 2px 2px 5px rgba(0,0,0,0.5); transform: perspective(100px) rotateX(10deg) rotateY(-10deg);">Ø${window.playerElectrodes.diam}</div>`;
                    
                    elInfo.innerHTML = `
                        <div id="electrode-drop-slot" style="width: 44px; height: 44px; border: 2px solid #3b82f6; border-radius: 6px; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.3); flex-shrink: 0; transition: 0.2s;">
                            ${slotContent}
                        </div>
                        <div style="display: flex; flex-direction: column; justify-content: center;">
                            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Заряжено электродов:</div>
                            <div style="color: #60a5fa; font-size: 16px; font-weight: bold;">Ø ${window.playerElectrodes.diam} мм <span style="color:#fbbf24; margin-left:15px;">${window.playerElectrodes.count} шт.</span></div>
                            ${window.GameState.isCabinetOpen ? '<div style="color: #4ade80; font-size: 10px; margin-top: 4px; cursor: pointer; padding: 2px 0;" onclick="returnElectrodePack()">Кликните, чтобы вернуть</div>' : ''}
                        </div>`;
                    elInfo.style.borderColor = window.GameState.isCabinetOpen ? '#3b82f6' : '#334155';
                } else {
                    elInfo.innerHTML = `
                        <div id="electrode-drop-slot" style="width: 44px; height: 44px; border: 2px dashed #64748b; border-radius: 6px; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.3); flex-shrink: 0; transition: 0.2s;">
                        </div>
                        <div style="display: flex; flex-direction: column; justify-content: center;">
                            <div style="color: #ef4444; font-size: 14px; font-weight: bold;">НЕТ ЭЛЕКТРОДОВ</div>
                            <div style="color: #94a3b8; font-size: 11px;">Перетащите пачку в ячейку</div>
                        </div>`;
                    elInfo.style.borderColor = window.GameState.isCabinetOpen ? '#4ade80' : '#334155';
                }
            } else {
                elInfo.style.display = 'none';
            }
            // ---------------------------------------------------

            document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
            if (activeTool === TOOL_WELDER) {
                const s1 = document.getElementById('slot1');
                if (s1) s1.classList.add('active');
            }
        }

        function setTool(t) {
            if (t === TOOL_WELDER && !window.hasWelder) return;
            
            activeTool = t;
            
            if (t !== TOOL_WELDER) {
                window.hasWelder = false;
            }
            
            isWeldingNow = false;
            if (weldLight) weldLight.intensity = 0;
            const icon = document.getElementById('welderEquippedIcon');
            if (icon) icon.style.display = (t === TOOL_WELDER) ? 'grid' : 'none';
            if (weldingTorch) weldingTorch.visible = (t === TOOL_WELDER);
            renderInventories();
        }

        // Сброс всего состояния сварки (при телепорте / смене режима)
        function resetWeldingState() {
            setTool(TOOL_NONE);
            isWeldingNow = false;
            isMaskEquipped = false;
            isGlassDown = false;
            isWeldCamActive = false;
            if (weldLight) weldLight.intensity = 0;
            updateWeldingSound(false, 0);
            const overlay = document.getElementById('maskOverlay');
            if (overlay) overlay.classList.remove('show');
            const weldCamEl = document.getElementById('weldCamContainer');
            if (weldCamEl) weldCamEl.style.display = 'none';
            const ci = document.getElementById('cutInfo');
            if (ci) ci.style.display = 'none';
        }

        renderInventories();

        // PIP camera orbit buttons
        const _btnL = document.getElementById('camLeftBtn');
        const _btnR = document.getElementById('camRightBtn');
        if (_btnL) {
            _btnL.addEventListener('mousedown', e => { e.stopPropagation(); camRotateDir = 1; });
            _btnL.addEventListener('mouseup', () => camRotateDir = 0);
            _btnL.addEventListener('mouseleave', () => camRotateDir = 0);
        }
        if (_btnR) {
            _btnR.addEventListener('mousedown', e => { e.stopPropagation(); camRotateDir = -1; });
            _btnR.addEventListener('mouseup', () => camRotateDir = 0);
            _btnR.addEventListener('mouseleave', () => camRotateDir = 0);
        }
        // Legacy closeCabinetBtn listener removed — exitCabinetView() handles this now

        // =====================================================
        // 🗄️ ИНТЕРФЕЙС ШКАФА С ЭЛЕКТРОДАМИ
        // =====================================================
        let cabReturn = null;
        
        window.enterCabinetView = function(cab) {
            resetWeldingState();
            window.GameState.isCabinetOpen = true;
            cabReturn = { pos: camera.position.clone(), cab: cab };
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            cabReturn.look = camera.position.clone().add(forward);
            
            cameraMode = 'TRANSITION';
            controls.unlock();
            cab.userData.doorTarget = -Math.PI / 1.5; // Открываем дверцу
            
            startTransition(camera.position.clone(), cab.userData.viewPos.clone(),
                            cabReturn.look.clone(), cab.userData.lookPos.clone(), () => {
                cameraMode = 'CABINET';
                showCabinetUI();
            });
        };

        // Синхронизируем видимость 3D пачек с реальной базой данных
        window.syncCabinetPacks = function() {
            if (typeof electrodeCabinets !== 'undefined') {
                electrodeCabinets.forEach(cab => {
                    if (cab.userData.packs) {
                        cab.userData.packs.forEach(p => {
                            const diam = p.userData.diam;
                            const idx = p.userData.packIndex;
                            p.visible = (idx < ELECTRODE_DB[diam].current);
                        });
                    }
                });
            }
        };

        window.showCabinetUI = function() {
            let ui = document.getElementById('cabinetUI');
            if (!ui) {
                ui = document.createElement('div');
                ui.id = 'cabinetUI';
                ui.className = 'fixed inset-0 pointer-events-none z-50 flex hidden';
                ui.innerHTML = `
                    <button onclick="exitCabinetView()" class="pointer-events-auto absolute top-4 left-4 w-14 h-14 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] border-2 border-red-400 transition-transform hover:scale-105 flex items-center justify-center text-2xl">
                        ✕
                    </button>
                    <div id="drag-proxy" class="fixed hidden w-28 h-40 bg-slate-700/90 border-2 border-white rounded-lg shadow-2xl pointer-events-none flex flex-col items-center justify-center text-white font-bold text-xl transform -translate-x-1/2 -translate-y-1/2 z-[100]">
                        <div class="text-[10px] text-slate-300 mb-2">ЭЛЕКТРОДЫ</div>
                        <div id="drag-proxy-text">Ø 3.0</div>
                    </div>
                `;
                document.body.appendChild(ui);
                setupCabinetDragEvents();
            }
            ui.classList.remove('hidden');
            ui.style.display = 'flex';
            syncCabinetPacks();
            renderInventories();
        };
        

        let cabinetDraggedPack = null;
        window.setupCabinetDragEvents = function() {
            if (window.cabinetDragEventsSetup) return;
            window.cabinetDragEventsSetup = true;

            document.addEventListener('mousedown', (e) => {
                if (cameraMode !== 'CABINET' || e.button !== 0) return;
                
                // Игнорируем клик по самому инвентарю
                const dropZone = document.getElementById('electrode-drop-slot');
                if (dropZone) {
                    const rect = dropZone.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) return;
                }

                if (!cabReturn || !cabReturn.cab) return;
                
                raycaster.setFromCamera(new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), camera);
                const hits = raycaster.intersectObjects(cabReturn.cab.userData.packs, true);
                
                if (hits.length > 0) {
                    let hitPack = hits[0].object;
                    while (hitPack && !hitPack.userData.isPack) hitPack = hitPack.parent; // Поднимаемся к пачке
                    
                    if (hitPack && hitPack.visible) {
                        if (window.playerElectrodes && window.playerElectrodes.diam != null) {
                            const hintEl = document.getElementById('arch-hint'); // Используем системный алерт
                            if (hintEl) { hintEl.innerText = "Верните текущие электроды!"; hintEl.classList.add('show'); setTimeout(() => hintEl.classList.remove('show'), 2000); }
                            return;
                        }
                        
                        cabinetDraggedPack = hitPack;
                        hitPack.visible = false; // Прячем 3D модель
                        
                        // Показываем фейковую иконку прикрепленную к курсору
                        const proxy = document.getElementById('drag-proxy');
                        proxy.style.display = 'flex';
                        proxy.style.left = e.clientX + 'px';
                        proxy.style.top = e.clientY + 'px';
                        proxy.style.backgroundColor = '#' + hitPack.material.color.getHexString() + 'e6';
                        document.getElementById('drag-proxy-text').innerText = 'Ø ' + hitPack.userData.diam;
                    }
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (cabinetDraggedPack) {
                    const proxy = document.getElementById('drag-proxy');
                    proxy.style.left = e.clientX + 'px';
                    proxy.style.top = e.clientY + 'px';

                    // Подсвечиваем зону инвентаря при наведении
                    const dropZone = document.getElementById('electrode-drop-slot');
                    if (dropZone) {
                        const rect = dropZone.getBoundingClientRect();
                        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            dropZone.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
                            dropZone.style.borderColor = '#60a5fa';
                            dropZone.style.transform = 'scale(1.1)';
                        } else {
                            dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                            dropZone.style.borderColor = '#64748b';
                            dropZone.style.transform = 'scale(1)';
                        }
                    }
                }
            });

            document.addEventListener('mouseup', (e) => {
                if (cabinetDraggedPack) {
                    const dropZone = document.getElementById('electrode-drop-slot');
                    const proxy = document.getElementById('drag-proxy');
                    proxy.style.display = 'none';
                    
                    if (dropZone) {
                        dropZone.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                        dropZone.style.transform = 'scale(1)';
                        const rect = dropZone.getBoundingClientRect();
                        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            takeElectrodePack(cabinetDraggedPack.userData.diam, cabinetDraggedPack.material.color.getHexString());
                            cabinetDraggedPack = null;
                            return;
                        }
                    }
                    // Если бросили мимо - возвращаем 3D модель на полку
                    cabinetDraggedPack.visible = true;
                    cabinetDraggedPack = null;
                }
            });
        };

        window.takeElectrodePack = function(diam, colorHex = '3b82f6') {
            if (window.playerElectrodes && window.playerElectrodes.diam != null) return;
            if (ELECTRODE_DB[diam].current > 0) {
                ELECTRODE_DB[diam].current--; window.playerElectrodes = { diam: diam, count: 40, colorHex: colorHex };
                if (typeof electrodeMesh !== 'undefined' && electrodeMesh) electrodeMesh.scale.y = 1.0;
                if (weldingTorch && weldingTorch.userData.moltenDrop) weldingTorch.userData.moltenDrop.visible = false;
                const ci = document.getElementById('cutInfo'); if (ci) ci.style.display = 'none';
                syncCabinetPacks(); renderInventories();
            }
        };

        window.returnElectrodePack = function() {
            if (window.playerElectrodes.count > 0 && window.playerElectrodes.diam) {
                const diam = window.playerElectrodes.diam;
                if (ELECTRODE_DB[diam] && ELECTRODE_DB[diam].current < ELECTRODE_DB[diam].max) {
                    ELECTRODE_DB[diam].current++; window.playerElectrodes = { diam: null, count: 0, colorHex: null };
                    syncCabinetPacks(); renderInventories();
                }
            }
        };

        window.exitCabinetView = function() {
            window.GameState.isCabinetOpen = false;
            const ui = document.getElementById('cabinetUI');
            if (ui) {
                ui.classList.add('hidden');
                ui.style.display = 'none';
            }
            if (typeof electrodeCabinets !== 'undefined') electrodeCabinets.forEach(cab => { cab.userData.doorTarget = 0; });
            cameraMode = 'TRANSITION';
            
            const currentLook = new THREE.Vector3();
            camera.getWorldDirection(currentLook);
            currentLook.add(camera.position);

            startTransition(camera.position.clone(), cabReturn.pos.clone(), currentLook, cabReturn.look.clone(), () => {
                cameraMode = 'FPS'; controls.lock();
                renderInventories();
            });
        };

        // =====================================================
        // ⚙️ SETTLE WORKPIECES
        // =====================================================
        function settleWorkpieces(iterations = 8) {
            const processed = new Set();
            const leaders = [];
            workpieces.forEach(wp => {
                const ldr = getGroupLeader(wp);
                if (!processed.has(ldr)) { processed.add(ldr); leaders.push(ldr); }
            });
            for (let it = 0; it < iterations; it++) {
                leaders.sort((a, b) => a.position.y - b.position.y);
                leaders.forEach(ldr => {
                    if (dragging === ldr || ldr.userData.isStatic) return;
                    const s = computeSupportAt(ldr, ldr.position.x, ldr.position.z, workpieces);
                    ldr.position.y = s.supportY;
                    ldr.updateMatrixWorld(true);
                    const minY = getExactWorldMinY(ldr);
                    if (minY !== null) {
                        const surfY = s.supportY + s.offs.minY - EPS_Y_MAIN;
                        ldr.position.y += (surfY + EPS_Y_MAIN) - minY;
                        ldr.updateMatrixWorld(true);
                    }
                    updateGroupPositions(ldr);
                });
                for (let i = 0; i < leaders.length; i++)
                    for (let j = i + 1; j < leaders.length; j++)
                        getGroupMembers(leaders[i]).forEach(a =>
                            getGroupMembers(leaders[j]).forEach(b => resolveCollisionPrimary(a, b)));
            }
        }

        // =====================================================
        // 🔗 MERGE GROUPS (СВАРКА)
        // =====================================================
        function mergeGroups(wp1, wp2) {
            const id1 = wp1.userData.groupId, id2 = wp2.userData.groupId;
            if (!id1 && !id2) {
                const nid = nextGroupId++;
                wp1.userData.groupId = nid; wp2.userData.groupId = nid; // assign new group
            } else if (id1 && !id2) {
                wp2.userData.groupId = id1;
            } else if (!id1 && id2) {
                wp1.userData.groupId = id2;
            } else if (id1 !== id2) {
                workpieces.forEach(w => { if (w.userData.groupId === id2) w.userData.groupId = id1; });
            }
            // After merging, mark all members of the resulting group as static (welded)
            const leader = getGroupLeader(wp1);
            const members = getGroupMembers(leader);
            members.forEach(m => { m.userData.isStatic = true; });
            // Also mark the leader itself
            leader.userData.isStatic = true;
        }

        function cleanSlag() {
            // Remove oldest bead if pool is full
            if (weldBeads.length > 300) {
                const old = weldBeads.shift();
                if (old && old.parent) old.parent.remove(old);
            }
        }

        // =====================================================
        // 🔊 WELDING AUDIO
        // =====================================================
        function initWeldingAudio() {
            // Звук убран по просьбе пользователя
        }

        function updateWeldingSound(active, stability) {
            // Звук убран по просьбе пользователя
        }

        // =====================================================
        // ✨ GPU SPARK SYSTEM (Пункт 4: Оптимизация частиц на шейдеры)
        // =====================================================
        function createSparkSystem() {
            if (sparkSystem) return;
            const cnt = 140;
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(cnt * 3);
            const vel = new Float32Array(cnt * 3);
            const birthTime = new Float32Array(cnt);
            const floorY = new Float32Array(cnt);
            
            for (let i = 0; i < cnt; i++) birthTime[i] = -9999;
            
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('velocity', new THREE.BufferAttribute(vel, 3));
            geo.setAttribute('birthTime', new THREE.BufferAttribute(birthTime, 1));
            geo.setAttribute('floorY', new THREE.BufferAttribute(floorY, 1));
            
            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    pixelRatio: { value: window.devicePixelRatio || 1 }
                },
                vertexShader: `
                    attribute vec3 velocity;
                    attribute float birthTime;
                    attribute float floorY;
                    uniform float time;
                    uniform float pixelRatio;
                    varying float vLife;
                    void main() {
                        float age = time - birthTime;
                        vLife = 1.0 - age * 4.0;
                        vec3 p = position;
                        if (vLife > 0.0) {
                            p.x += velocity.x * age;
                            p.z += velocity.z * age;
                            p.y += velocity.y * age - 0.5 * 980.0 * age * age;
                            if (p.y < floorY) { p.y = floorY; }
                        } else {
                            p.y = -5000.0;
                        }
                        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                        gl_Position = projectionMatrix * mvPos;
                        gl_PointSize = 2.5 * pixelRatio * (300.0 / -mvPos.z);
                    }
                `,
                fragmentShader: `
                    varying float vLife;
                    void main() {
                        if (vLife <= 0.0) discard;
                        gl_FragColor = vec4(1.0, 0.66, 0.0, vLife);
                    }
                `,
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            });
            sparkSystem = new THREE.Points(geo, mat);
            sparkSystem.frustumCulled = false;
            scene.add(sparkSystem);
        }

        const _sparkRaycaster = new THREE.Raycaster();
        _sparkRaycaster.ray.direction.set(0, -1, 0);
        const _sparkRayOrigin = new THREE.Vector3();

            function spawnSpark(origin) {
            if (!sparkSystem) return;
            const aP = sparkSystem.geometry.attributes.position;
            const aV = sparkSystem.geometry.attributes.velocity;
            const aB = sparkSystem.geometry.attributes.birthTime;
            const aF = sparkSystem.geometry.attributes.floorY;
            
            if (sparkSystem.userData.idx === undefined) sparkSystem.userData.idx = 0;
            const i = sparkSystem.userData.idx;
            sparkSystem.userData.idx = (i + 1) % aP.count;

            aP.setXYZ(i, origin.x, origin.y, origin.z);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const spd = 100 + Math.random() * 300;
            aV.setXYZ(i, Math.sin(phi)*Math.cos(theta)*spd, Math.cos(phi)*spd*0.8+150, Math.sin(phi)*Math.sin(theta)*spd);
            aB.setX(i, performance.now() * 0.001);
            
            // 🔥 СУПЕР-ОПТИМИЗАЦИЯ: Убрали Raycaster, используем быструю математику пола
            let fY = 0;
            const sparkX = origin.x + Math.sin(phi)*Math.cos(theta)*5;
            const sparkZ = origin.z + Math.sin(phi)*Math.sin(theta)*5;
            
            if (typeof window.getFloorHeightAt === 'function') {
                fY = window.getFloorHeightAt(sparkX, sparkZ);
            }
            aF.setX(i, fY);

            aP.needsUpdate = true; aV.needsUpdate = true; aB.needsUpdate = true; aF.needsUpdate = true;
        }

        function updateSparks(dt) {
            if (sparkSystem) sparkSystem.material.uniforms.time.value = performance.now() * 0.001;
        }

        // =====================================================
        // 💨 GPU SMOKE SYSTEM (Пункт 4)
        // =====================================================
        function createSmokeSystem() {
            if (smokeSystem) return;
            const cnt = 80;
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(cnt * 3);
            const birthTime = new Float32Array(cnt);
            const sz = new Float32Array(cnt);
            
            for (let i = 0; i < cnt; i++) birthTime[i] = -9999;
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('birthTime', new THREE.BufferAttribute(birthTime, 1));
            geo.setAttribute('baseSize', new THREE.BufferAttribute(sz, 1));
            
            const cvs = document.createElement('canvas');
            cvs.width = 32; cvs.height = 32;
            const ctx2d = cvs.getContext('2d');
            const grd = ctx2d.createRadialGradient(16,16,0,16,16,16);
            grd.addColorStop(0, 'rgba(100,100,100,1)'); grd.addColorStop(1, 'rgba(150,150,150,0)');
            ctx2d.fillStyle = grd; ctx2d.fillRect(0,0,32,32);
            const tex = new THREE.CanvasTexture(cvs);
            
            const mat = new THREE.ShaderMaterial({
                uniforms: { time: { value: 0 }, map: { value: tex }, pixelRatio: { value: window.devicePixelRatio || 1 } },
                vertexShader: `
                    attribute float birthTime;
                    attribute float baseSize;
                    uniform float time;
                    uniform float pixelRatio;
                    varying float vLife;
                    void main() {
                        float age = time - birthTime;
                        vLife = 1.0 - age * 3.5;
                        vec3 p = position;
                        if (vLife > 0.0) {
                            p.x += 5.0 * age;
                            p.y += 26.0 * age;
                        } else {
                            p.y = -5000.0;
                        }
                        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                        gl_Position = projectionMatrix * mvPos;
                        gl_PointSize = (baseSize + age * 9.0) * pixelRatio * (300.0 / -mvPos.z);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D map;
                    varying float vLife;
                    void main() {
                        if (vLife <= 0.0) discard;
                        gl_FragColor = texture2D(map, gl_PointCoord) * vec4(1.0, 1.0, 1.0, vLife * 0.4);
                    }
                `,
                transparent: true, depthWrite: false, blending: THREE.NormalBlending
            });
            smokeSystem = new THREE.Points(geo, mat);
            smokeSystem.frustumCulled = false;
            scene.add(smokeSystem);
        }

        function spawnSmoke(origin) {
            if (!smokeSystem) return;
            const aP = smokeSystem.geometry.attributes.position;
            const aB = smokeSystem.geometry.attributes.birthTime;
            const aS = smokeSystem.geometry.attributes.baseSize;
            
            if (smokeSystem.userData.idx === undefined) smokeSystem.userData.idx = 0;
            const i = smokeSystem.userData.idx;
            smokeSystem.userData.idx = (i + 1) % aP.count;

            aP.setXYZ(i, origin.x + (Math.random()-0.5)*5, origin.y, origin.z + (Math.random()-0.5)*5);
            aS.setX(i, 5 + Math.random() * 4);
            aB.setX(i, performance.now() * 0.001);

            aP.needsUpdate = true; aB.needsUpdate = true; aS.needsUpdate = true;
        }

        function updateSmoke(dt) {
            if (smokeSystem) smokeSystem.material.uniforms.time.value = performance.now() * 0.001;
        }

        function killWeldParticles() {
            if (sparkSystem) {
                const aB = sparkSystem.geometry.attributes.birthTime.array;
                for (let i=0; i<aB.length; i++) aB[i] = -9999;
                sparkSystem.geometry.attributes.birthTime.needsUpdate = true;
            }
            if (smokeSystem) {
                const aB = smokeSystem.geometry.attributes.birthTime.array;
                for (let i=0; i<aB.length; i++) aB[i] = -9999;
                smokeSystem.geometry.attributes.birthTime.needsUpdate = true;
            }
        }

        // =====================================================
        // 🔧 CREATE WELDING TOOL (scale ×100 from module)
        // =====================================================
        function createWeldingTool() {
            if (weldingTorch) return;
            const holder = new THREE.Group();
            const S = 100; // scale factor

            const handleMat = new THREE.MeshStandardMaterial({ color: 0x800000, roughness: 0.5, metalness: 0.1 });
            const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
            const brassMat = new THREE.MeshStandardMaterial({ color: 0xe0a538, roughness: 0.3, metalness: 0.8 });
            const fluxMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 1.0 });
            const metalMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.9 });

            // Рукоятка
            const handleGeo = new THREE.CylinderGeometry(2, 2, 20, 16);
            handleGeo.translate(0, -10, 0);
            holder.add(new THREE.Mesh(handleGeo, handleMat));

            // Гарда
            const guard = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 2.2, 1.2, 16), headMat);
            guard.position.y = 0.5; holder.add(guard);

            // Головка держателя
            const headGroup = new THREE.Group();
            headGroup.position.y = 1.5; holder.add(headGroup);
            const headBlock = new THREE.Mesh(new THREE.BoxGeometry(3.5, 8, 3.5), headMat);
            headBlock.position.y = 4; headGroup.add(headBlock);
            const contact = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.8, 8), brassMat);
            contact.rotation.x = Math.PI / 2; contact.position.set(0, 6.5, 0);
            headGroup.add(contact);

            // Электрод
            const elLen = 35; // 35cm
            const elRad = 0.35;
            const elPivot = new THREE.Group();
            elPivot.position.set(0, 6.5, 0); holder.add(elPivot);
            const rodGeo = new THREE.CylinderGeometry(elRad, elRad, elLen, 12);
            rodGeo.translate(0, elLen / 2, 0);
            const rod = new THREE.Mesh(rodGeo, fluxMat);
            const shank = new THREE.Mesh(new THREE.CylinderGeometry(elRad+0.02, elRad+0.02, 3, 12), metalMat);
            shank.position.y = 1.5; rod.add(shank);
            elPivot.add(rod);
            electrodeMesh = rod;
            elPivot.rotation.x = -Math.PI / 2;

            // Кончик (для определения позиции дуги)
            const tip = new THREE.Object3D();
            tip.position.y = elLen;
            rod.add(tip);
            holder.userData.tip = tip;
            
            // Провод (кабель)
            const cableCurve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, -20, 0),       // Начало у основания ручки
                new THREE.Vector3(-10, -40, -10),   // Изгиб
                new THREE.Vector3(-5, -70, 15)      // Уходит вниз за экран
            );
            const cableGeo = new THREE.TubeGeometry(cableCurve, 12, 1.4, 8, false);
            const cableMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
            const cableMesh = new THREE.Mesh(cableGeo, cableMat);
            holder.add(cableMesh);

            // Позиционирование — точно как в модуле сборка-сварка (×100: метры→сантиметры)
            holder.position.set(25, -3, -30);
            holder.rotation.x = -1.3; // Наклон ручки на себя
            holder.rotation.y = 0.55; // Поворот к центру
            holder.rotation.z = 0.1;  // Наклон кисти
            
            // --- ПАРАМЕТРЫ СТОЙКИ ДЛЯ АНИМАЦИИ ---
            holder.userData.idlePos = new THREE.Vector3(25, -3, -30);
            holder.userData.idleRot = new THREE.Euler(-1.3, 0.55, 0.1);
            // Рабочая позиция: выдвигаем прямо перед собой, под правильным углом к месту сварки
            holder.userData.weldPos = new THREE.Vector3(8, -14, -28); 
            holder.userData.weldRot = new THREE.Euler(0.15, 0.2, 0.0);

            // frustumCulled=false — держак всегда виден камерой
            holder.traverse(function(obj) {
                if (!obj.isMesh) return;
                obj.frustumCulled = false;
                obj.renderOrder = 1; // без хака depthTest=false: нормальный depth-test
            });
            holder.visible = false;
            camera.add(holder);
            weldingTorch = holder;

            // Источник света (добавляем в сцену, позиционируем в animate)
            weldLight = new THREE.PointLight(0x66ccff, 0, 800);
            scene.add(weldLight);

            createSparkSystem();
            createSmokeSystem();
            initWeldingAudio();
        }

        // =====================================================
        // ⚙️ ИНТЕРАКТИВНАЯ ПАНЕЛЬ НА 3D-МОДЕЛИ АППАРАТА
        // (ползунки + мониторы прямо на модели; колесо мыши по наведению)
        // =====================================================
        const WELDER_STEP = { current: 5, voltage: 1 };   // шаг изменения колесом
        const _WELDER_RAY_DIST = 320;                     // макс. дистанция наведения, см
        let hoveredWelderControl = null;                  // {kind, param, mesh}
        let _welderHlMesh = null, _welderHlPrev = 0;      // подсветка наведённого элемента

        // Обновляет экраны и положение бегунков на ВСЕХ аппаратах + HUD маски
        function refreshWelderMachines() {
            if (typeof welderMachines === 'undefined') return;
            const I = WELDER_SETTINGS.current, U = WELDER_SETTINGS.voltage;
            const cCol = (I < 80 || I > 185) ? '#ff7a5a' : ((I < 95 || I > 170) ? '#ffd277' : '#39ff6a');
            const vCol = (U < 18 || U > 28)  ? '#ff7a5a' : ((U < 20 || U > 27)  ? '#ffd277' : '#39ff6a');
            const iFrac = (I - WELDER_SETTINGS.I_MIN) / (WELDER_SETTINGS.I_MAX - WELDER_SETTINGS.I_MIN);
            const uFrac = (U - WELDER_SETTINGS.U_MIN) / (WELDER_SETTINGS.U_MAX - WELDER_SETTINGS.U_MIN);
            welderMachines.forEach(g => {
                const ui = g.userData.welderUI; if (!ui) return;
                ui.current.draw(I, cCol);
                ui.voltage.draw(U, vCol);
                ui.current.handle.position.x = ui.current.cx + (iFrac - 0.5) * ui.current.span;
                ui.voltage.handle.position.x = ui.voltage.cx + (uFrac - 0.5) * ui.voltage.span;
            });
            const ampVal = document.getElementById('weldAmps'); if (ampVal) ampVal.innerText = I + ' A';
            const voltVal = document.getElementById('weldVolts'); if (voltVal) voltVal.innerText = U + ' V';
        }

        function adjustWelder(param, dir) {
            if (param === 'current') {
                WELDER_SETTINGS.current = clamp(WELDER_SETTINGS.current + dir * WELDER_STEP.current, WELDER_SETTINGS.I_MIN, WELDER_SETTINGS.I_MAX);
            } else {
                WELDER_SETTINGS.voltage = clamp(WELDER_SETTINGS.voltage + dir * WELDER_STEP.voltage, WELDER_SETTINGS.U_MIN, WELDER_SETTINGS.U_MAX);
            }
            refreshWelderMachines();
        }

        // Какой орган управления под прицелом? (raycast только по аппаратам — дёшево)
            function getHoveredWelderControl() {
            if (typeof welderMachines === 'undefined' || welderMachines.length === 0) return null;
            raycaster.setFromCamera(_camCenter, camera);
            
            raycaster.far = _WELDER_RAY_DIST; // 🔥 ОГРАНИЧИВАЕМ ДЛИНУ ЛУЧА
            const hits = raycaster.intersectObjects(welderMachines, true);
            raycaster.far = Infinity; // 🔥 СБРАСЫВАЕМ ОБРАТНО
            
            for (const h of hits) {
                if (h.distance > _WELDER_RAY_DIST) break;
                const ud = h.object.userData || {};
                if (ud.welderControl) return { kind: 'slider', param: ud.welderControl, mesh: h.object };
                break; // первый объект машины перекрывает контролы за собой
            }
            return null;
        }

        function _applyWelderHighlight(mesh) {
            if (mesh && mesh.material && mesh.material.emissive) {
                _welderHlMesh = mesh;
                _welderHlPrev = mesh.material.emissiveIntensity;
                mesh.material.emissiveIntensity = 1.5;
            }
        }
        function _clearWelderHighlight() {
            if (_welderHlMesh && _welderHlMesh.material) _welderHlMesh.material.emissiveIntensity = _welderHlPrev;
            _welderHlMesh = null;
        }

        // Подсветка + HUD-подсказка у прицела (вызывается из animate, троттлинг)
        function updateWelderHoverHUD() {
            const hintEl = document.getElementById('welderHint');
            if (cameraMode !== 'FPS' || !controls.isLocked) {
                if (hoveredWelderControl) { _clearWelderHighlight(); hoveredWelderControl = null; }
                if (hintEl) hintEl.style.display = 'none';
                return;
            }
            const ctrl = getHoveredWelderControl();
            if (!ctrl) {
                if (hoveredWelderControl) { _clearWelderHighlight(); hoveredWelderControl = null; }
                if (hintEl) hintEl.style.display = 'none';
                return;
            }
            if (!hoveredWelderControl || hoveredWelderControl.mesh !== ctrl.mesh) {
                _clearWelderHighlight();
                hoveredWelderControl = ctrl;
                _applyWelderHighlight(ctrl.mesh);
            }
            if (hintEl) {
                const isCur = ctrl.param === 'current';
                const val = isCur ? WELDER_SETTINGS.current : WELDER_SETTINGS.voltage;
                hintEl.innerHTML = '<span class="wh-key">[Колесо]</span> ' +
                    (isCur ? 'ТОК' : 'НАПРЯЖЕНИЕ') + ': <span class="wh-val">' + val + (isCur ? ' A' : ' V') + '</span>';
                hintEl.style.display = 'block';
            }
        }

        let hoveredRemote = null;
        let isLookingAtRack = false;
        let _remoteHlMesh = null;

        function _applyRemoteHighlight(mesh) {}
        function _clearRemoteHighlight() {}

        function updateRemoteHoverHUD() {
            const hintEl = document.getElementById('remoteHint');
            if (cameraMode !== 'FPS' || !controls.isLocked) {
                if (hoveredRemote) { _clearRemoteHighlight(); hoveredRemote = null; }
                if (hintEl) hintEl.style.display = 'none';
                isLookingAtRack = false;
                return;
            }
            
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            raycaster.far = 300; // 🔥 РЕЖЕМ ЛУЧ ДЛЯ ПУЛЬТОВ И ТЕОДОЛИТА
            
            // 1. Если пульт уже взят
            if (window.activeRemote) {
                const racks = [];
                if (window.remotesRack) racks.push(window.remotesRack);
                if (window.remotesRack2) racks.push(window.remotesRack2);
                
                if (racks.length > 0) {
                    const hits = raycaster.intersectObjects(racks, true);
                    if (hits.length > 0 && hits[0].distance < 300) {
                        isLookingAtRack = true;
                        if (hintEl) {
                            hintEl.innerHTML = '<span style="color:#3355cc;">[ЛКМ]</span> Положить пульт на место';
                            hintEl.style.display = 'block';
                        }
                        return;
                    }
                }
                isLookingAtRack = false;
                if (hintEl) hintEl.style.display = 'none';
                return;
            }
            
            // 2. Если пульт не взят
            const remoteMeshes = [];
            if (window.craneRemoteMesh && window.craneRemoteMesh.parent === window.remotesRack) remoteMeshes.push(window.craneRemoteMesh);
            if (window.craneRemote2Mesh && window.craneRemote2Mesh.parent === window.remotesRack2) remoteMeshes.push(window.craneRemote2Mesh);
            if (window.cartRemoteMesh && window.cartRemoteMesh.parent === window.remotesRack) remoteMeshes.push(window.cartRemoteMesh);
            
            if (remoteMeshes.length > 0) {
                const hits = raycaster.intersectObjects(remoteMeshes, true);
                if (hits.length > 0 && hits[0].distance < 300) {
                    let obj = hits[0].object;
                    while (obj && !obj.userData.remoteType) obj = obj.parent;
                    
                    if (obj && obj.userData.remoteType) {
                        if (hoveredRemote !== obj) {
                            _clearRemoteHighlight();
                            hoveredRemote = obj;
                            _applyRemoteHighlight(obj);
                        }
                        if (hintEl) {
                            let name = 'пульт';
                            if (obj.userData.remoteType === 'crane') name = 'кран-балки';
                            else if (obj.userData.remoteType === 'crane2') name = 'второй кран-балки';
                            else if (obj.userData.remoteType === 'cart') name = 'тележки';
                            hintEl.innerHTML = `<span style="color:#3355cc;">[ЛКМ]</span> Взять пульт ${name}`;
                            hintEl.style.display = 'block';
                        }
                        return;
                    }
                }
            }
            
            // 3. Теодолит
            if (window.theodoliteObj && (!window.theodoliteState || window.theodoliteState === 'idle')) {
                const hits = raycaster.intersectObject(window.theodoliteObj, true);
                if (hits.length > 0 && hits[0].distance < 300) {
                    if (hintEl) {
                        hintEl.innerHTML = `<span style="color:#3355cc;">[ЛКМ]</span> Оптика / <span style="color:#3355cc;">[ПКМ]</span> Штатив`;
                        hintEl.style.display = 'block';
                    }
                    return;
                }
            }
            
            if (hoveredRemote) { _clearRemoteHighlight(); hoveredRemote = null; }
            if (hintEl) hintEl.style.display = 'none';
            isLookingAtRack = false;
        }

        function animate() {
            requestAnimationFrame(animate);
            const time = performance.now();
            const delta = (time - prevTime) / 1000;
            const t_sec = time * 0.001; // seconds since page load (used by welding + workers)
            prevTime = time;

            // Теодолит: Обновление логики (View и Drag)
            if (window.theodoliteObj) {
                if (window.theodoliteState === 'view') {
                    const head = window.theodoliteObj.userData.head;
                    const pos = new THREE.Vector3();
                    head.parent.localToWorld(pos.copy(head.position));
                    
                    // Камера смотрит с позиции оптики (чуть впереди головки)
                    const fwd = new THREE.Vector3();
                    head.getWorldDirection(fwd);
                    // Смотрим ВДОЛЬ fwd (камера перед линзой, развёрнута на 180)
                    camera.position.copy(pos).add(fwd.clone().multiplyScalar(18 * window.theodoliteObj.scale.x));
                    camera.rotation.z = 0; // Prevent roll
                    if (typeof window.theodoliteBaseYaw !== 'undefined') {
                        let dy = camera.rotation.y - window.theodoliteBaseYaw;
                        while(dy > Math.PI) dy -= 2*Math.PI;
                        while(dy < -Math.PI) dy += 2*Math.PI;
                        const maxYaw = 0.6; // limit to ~34 degrees
                        if (dy > maxYaw) camera.rotation.y = window.theodoliteBaseYaw + maxYaw;
                        if (dy < -maxYaw) camera.rotation.y = window.theodoliteBaseYaw - maxYaw;

                        let dx = camera.rotation.x - window.theodoliteBasePitch;
                        while(dx > Math.PI) dx -= 2*Math.PI;
                        while(dx < -Math.PI) dx += 2*Math.PI;
                        const maxPitchUp = 0.5; // limit looking up to ~28 degrees
                        const maxPitchDown = 0.2; // strictly limit looking down to ~11 degrees
                        if (dx > maxPitchUp) camera.rotation.x = window.theodoliteBasePitch + maxPitchUp;
                        if (dx < -maxPitchDown) camera.rotation.x = window.theodoliteBasePitch - maxPitchDown;
                    }
                    camera.rotation.x = Math.max(-Math.PI/2 * 0.99, Math.min(Math.PI/2 * 0.99, camera.rotation.x));
                    
                    const pitchDeg = (camera.rotation.x * 180 / Math.PI).toFixed(2);
                    const yawDeg = (camera.rotation.y * 180 / Math.PI).toFixed(2);
                    const pEl = document.getElementById('theoPitch');
                    if (pEl) pEl.innerHTML = pitchDeg + '&deg;';
                    const yEl = document.getElementById('theoYaw');
                    if (yEl) yEl.innerHTML = yawDeg + '&deg;';
                    
                    const dir = new THREE.Vector3();
                    camera.getWorldDirection(dir);
                    const target = pos.clone().add(dir);
                    head.lookAt(target);
                } else if (window.theodoliteState === 'drag') {
                    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                    // Для перетаскивания теодолита нужен пол и столы, поэтому используем всю сцену
                    // Кэшируем потенциальные цели для теодолита, чтобы не сканировать всю сцену
                    if (!window._theoInteractables) {
                        window._theoInteractables = [];
                        scene.children.forEach(c => {
                            // Добавляем только крупные объекты (пол, столы, оборудование)
                            if (c.name === 'Floor' || (c.userData && (c.userData.isTable || c.userData.isCabinet))) {
                                window._theoInteractables.push(c);
                            }
                        });
                    }
                    // Сканируем только крупные поверхности, а не каждый винтик
                    const hits = raycaster.intersectObjects(window._theoInteractables, true).filter(h => {
                        let obj = h.object;
                        while(obj) {
                            if(obj === window.theodoliteObj || obj === window.theoPhantom || obj.userData.isTheodolite) return false;
                            if(obj === window._theoArrow) return false;
                            obj = obj.parent;
                        }
                        return true;
                    });
                    if (hits.length > 0) {
                        const hit = hits[0];
                        
                        // Проверяем нормаль поверхности — только горизонтальные (пол, стол)
                        if (hit.face) {
                            const n_surface = hit.face.normal.clone();
                            n_surface.transformDirection(hit.object.matrixWorld).normalize();
                            const isHorizontal = n_surface.y > 0.7; // нормаль должна смотреть вверх
                            
                            if (isHorizontal && window.theoPhantom) {
                                window.theoPhantom.position.copy(hit.point);
                                if (window.theodoliteYOffset) {
                                    window.theoPhantom.position.y += window.theodoliteYOffset;
                                }
                                // Только Y-вращение (от колёсика) — лазер всегда стоит прямо
                                window.theoPhantom.rotation.set(0, window.theodoliteRotY || 0, 0);
                                
                                // Обновляем стрелку направления
                                if (window._theoArrow) {
                                    window._theoArrow.position.set(
                                        window.theoPhantom.position.x,
                                        hit.point.y + 0.5,
                                        window.theoPhantom.position.z
                                    );
                                    window._theoArrow.rotation.y = window.theodoliteRotY || 0;
                                    window._theoArrow.visible = true;
                                }
                            } else if (!isHorizontal && window.theoPhantom) {
                                // Не вертикальная поверхность — скрываем стрелку, не двигаем фантом
                                if (window._theoArrow) window._theoArrow.visible = false;
                            }
                        }
                    }
                }
                
                if (window.theodoliteObj.userData.bubble) {
                    const up = new THREE.Vector3(0, 1, 0);
                    up.applyQuaternion(window.theodoliteObj.quaternion);
                    window.theodoliteObj.userData.bubble.position.x = -up.x * 2.5;
                    window.theodoliteObj.userData.bubble.position.z = -up.z * 2.5;
                }
            }

            // Update Doors (throttled: каждые 3 кадра)
            if (typeof doors !== 'undefined' && _frameNo % 3 === 0) doors.forEach(d => d.update(camera.position));
            // Update Roof
            if (typeof roof !== 'undefined' && _frameNo % 3 === 0) roof.update(cameraMode);

            // Анимация дверец шкафов с электродами
            if (typeof electrodeCabinets !== 'undefined') {
                electrodeCabinets.forEach(cab => {
                    if (cab.userData.doorTarget !== undefined) {
                        cab.userData.door.rotation.y = THREE.MathUtils.lerp(cab.userData.door.rotation.y, cab.userData.doorTarget, delta * 5);
                    }
                });
            }

            // Move Cart Logic
            if (isHoldingCart) {
                moveActiveCart(delta);
            }

            // Анимация кран-балки (с инерцией через lerp)
            if (window.activeRemote === 'crane' && window.warehouseCrane) {
                const craneUD = window.warehouseCrane.userData;
                
                // Инерция движения моста крана (Z)
                let targetVz = 0;
                if (window.remoteInput.fwd) targetVz = craneUD.speedH;
                else if (window.remoteInput.back) targetVz = -craneUD.speedH;
                craneUD.vz = THREE.MathUtils.lerp(craneUD.vz || 0, targetVz, delta * 2.0);
                craneUD.craneGroup.position.z += craneUD.vz * delta;
                if (craneUD.craneGroup.position.z > 64) { craneUD.craneGroup.position.z = 64; craneUD.vz = 0; }
                if (craneUD.craneGroup.position.z < 0) { craneUD.craneGroup.position.z = 0; craneUD.vz = 0; }

                // Инерция движения каретки крана (X)
                let targetVx = 0;
                if (window.remoteInput.wheel !== 0) {
                    targetVx = Math.sign(window.remoteInput.wheel) * craneUD.speedH;
                }
                craneUD.vx = THREE.MathUtils.lerp(craneUD.vx || 0, targetVx, delta * 2.0);
                craneUD.hoistGroup.position.x += craneUD.vx * delta;
                if (craneUD.hoistGroup.position.x < -17) { craneUD.hoistGroup.position.x = -17; craneUD.vx = 0; }
                if (craneUD.hoistGroup.position.x > 17) { craneUD.hoistGroup.position.x = 17; craneUD.vx = 0; }

                // Инерция движения крюка крана (Y)
                let targetVy = 0;
                if (window.remoteInput.up) targetVy = craneUD.speedV;
                else if (window.remoteInput.down) targetVy = -craneUD.speedV;
                craneUD.vy = THREE.MathUtils.lerp(craneUD.vy || 0, targetVy, delta * 2.0);
                craneUD.hookGroup.position.y += craneUD.vy * delta;
                if (craneUD.hookGroup.position.y > craneUD.hookTopY) { craneUD.hookGroup.position.y = craneUD.hookTopY; craneUD.vy = 0; }
                if (craneUD.hookGroup.position.y < craneUD.hookBottomY) { craneUD.hookGroup.position.y = craneUD.hookBottomY; craneUD.vy = 0; }
                craneUD.updateCable();
            } else if (window.warehouseCrane && window.warehouseCrane.userData.updateAnimation) {
                window.warehouseCrane.userData.updateAnimation(delta);
            }

            // Анимация кран-балки 2
            if (window.activeRemote === 'crane2' && window.warehouseCrane2) {
                const craneUD = window.warehouseCrane2.userData;
                let targetVz = 0;
                if (window.remoteInput.fwd) targetVz = craneUD.speedH;
                else if (window.remoteInput.back) targetVz = -craneUD.speedH;
                craneUD.vz = THREE.MathUtils.lerp(craneUD.vz || 0, targetVz, delta * 2.0);
                craneUD.craneGroup.position.z += craneUD.vz * delta;
                if (craneUD.craneGroup.position.z > 92) { craneUD.craneGroup.position.z = 92; craneUD.vz = 0; }
                if (craneUD.craneGroup.position.z < 0) { craneUD.craneGroup.position.z = 0; craneUD.vz = 0; }

                let targetVx = 0;
                if (window.remoteInput.wheel !== 0) {
                    targetVx = Math.sign(window.remoteInput.wheel) * craneUD.speedH;
                }
                craneUD.vx = THREE.MathUtils.lerp(craneUD.vx || 0, targetVx, delta * 2.0);
                craneUD.hoistGroup.position.x += craneUD.vx * delta;
                if (craneUD.hoistGroup.position.x < -33) { craneUD.hoistGroup.position.x = -33; craneUD.vx = 0; }
                if (craneUD.hoistGroup.position.x > 33) { craneUD.hoistGroup.position.x = 33; craneUD.vx = 0; }

                let targetVy = 0;
                if (window.remoteInput.up) targetVy = craneUD.speedV;
                else if (window.remoteInput.down) targetVy = -craneUD.speedV;
                craneUD.vy = THREE.MathUtils.lerp(craneUD.vy || 0, targetVy, delta * 2.0);
                craneUD.hookGroup.position.y += craneUD.vy * delta;
                if (craneUD.hookGroup.position.y > craneUD.hookTopY) { craneUD.hookGroup.position.y = craneUD.hookTopY; craneUD.vy = 0; }
                if (craneUD.hookGroup.position.y < craneUD.hookBottomY) { craneUD.hookGroup.position.y = craneUD.hookBottomY; craneUD.vy = 0; }
                craneUD.updateCable();
            } else if (window.warehouseCrane2 && window.warehouseCrane2.userData.updateAnimation) {
                window.warehouseCrane2.userData.updateAnimation(delta);
            }

            // Анимация рельсовых тележек (с инерцией через lerp)
            if (window.animatedTrolleys) {
                window.animatedTrolleys.forEach((t, i) => {
                    let moveDir = 0;
                    let targetSpeed = 0;
                    if (i === 0 && window.activeRemote === 'cart') {
                        const mult = typeof window.cartSpeedMultiplier !== 'undefined' ? window.cartSpeedMultiplier : 1.0;
                        if (window.remoteInput.fwd) targetSpeed = t.speed * mult;
                        else if (window.remoteInput.back) targetSpeed = -t.speed * mult;
                    }
                    t.vel = THREE.MathUtils.lerp(t.vel || 0, targetSpeed, delta * 2.0);
                    t.pos += t.vel * delta;
                    if (t.pos > t.maxPos) { t.pos = t.maxPos; t.vel = 0; }
                    else if (t.pos < 0) { t.pos = 0; t.vel = 0; }
                    if (Math.abs(t.vel) > 0.05) {
                        moveDir = Math.sign(t.vel);
                    }

                    // Поддержка обеих версий: двигаем по X для старой модели, по Z для новой
                    if (t.mesh.position.z !== undefined && t.platL !== 600) {
                        t.mesh.position.z = t.pos;
                    } else {
                        t.mesh.position.x = t.pos;
                    }

                    if (moveDir !== 0) {
                        const spin = (Math.abs(t.vel || t.speed) * delta) / t.wheelR;
                        t.wheels.forEach(w => {
                            if (w.group) w.group.children.forEach(ch => ch.rotation.y += moveDir * spin);
                            else w.rotation.z -= moveDir * spin;
                        });
                    }
                        
                        // Динамически обновляем коллизию
                        const worldPos = new THREE.Vector3();
                        t.mesh.getWorldPosition(worldPos);
                        const radius = Math.max(t.platL, t.platW) / 2;
                        t.boxCollider.minX = worldPos.x - radius;
                        t.boxCollider.maxX = worldPos.x + radius;
                        t.boxCollider.minZ = worldPos.z - radius;
                        t.boxCollider.maxZ = worldPos.z + radius;
                });
            }

            if (dragging) updateDrag(delta);
            // ------------------------
            _frameNo++;

            // --- ГЛОБАЛЬНАЯ ОПТИМИЗАЦИЯ (three-mesh-bvh) ---
            // Строим BVH-деревья для всех статических/сложных объектов
            // Флаг _bvhAttempted гарантирует, что мы не будем пытаться строить дерево дважды,
            // что полностью устраняет утечки памяти и зависания.
            // --- ГЛОБАЛЬНАЯ ОПТИМИЗАЦИЯ (three-mesh-bvh) ---
            if (_frameNo % 60 === 0) {
                let bvhComputedThisFrame = false; // Флаг: делаем не больше 1 тяжелой операции за кадр
                
                scene.traverse(child => {
                    if (bvhComputedThisFrame) return; // Прерываем обход, если кадр уже нагружен
                    
                    if (child.isMesh && child.geometry && !child.geometry.boundsTree && !child.geometry._bvhAttempted && window.THREE && window.THREE.BufferGeometry.prototype.computeBoundsTree) {
                        child.geometry._bvhAttempted = true;
                        
                        // Игнорируем мелкую динамику
                        if (child.userData && (child.userData.isWeldBead || child.userData.isSpatter || child.userData.isHighlight)) return;
                        
                        try { 
                            child.geometry.computeBoundsTree(); 
                            bvhComputedThisFrame = true; // Блокируем дальнейшие расчеты в этом кадре
                        } catch(e) {}
                    }
                });
            }

            // ===== WELDING SYSTEM UPDATE =====
            // Частицы — только при активной сварке; после остановки быстро гаснут
            if (isWeldingNow) {
                updateSparks(delta);
                updateSmoke(delta);
            } else if (sparkSystem || smokeSystem) {
                updateSparks(delta * 14);
                updateSmoke(delta * 14);
            }

            // Auto-stop welding if mask removed / glass up
            if (isWeldingNow && (!isMaskEquipped || !isGlassDown)) {
                isWeldingNow = false;
                if (weldLight) weldLight.intensity = 0;
            }

            let targetHitPoint = null;
            let targetHitNormal = new THREE.Vector3(0, 1, 0);
            let targetHitObject = null;

            if (activeTool === TOOL_WELDER && weldingTorch && weldingTorch.visible && cameraMode === 'FPS' && controls.isLocked) {
                
                // ВОЗВРАЩАЕМ ОБНОВЛЕНИЕ, иначе сварка не увидит загрузившиеся столы и детали!
                // Это не вызывает лагов, так как собирается всего пара десятков объектов.
                if (_frameNo % 60 === 0 || !window._weldInteractables) {
                    window._weldInteractables = [...workpieces];
                    scene.children.forEach(c => {
                        if (c.userData && (c.userData.isTable || c.userData.isWelderMachine || c.userData.isArchiveRack)) window._weldInteractables.push(c);
                    });
                }
                
                // 🔥 СТРАХОВКА: Сбрасываем дальность луча в бесконечность!
                // Если прошлые правки с пультами обрезали луч до 300, здесь мы это лечим.
                raycaster.far = Infinity; 
                
                raycaster.setFromCamera(_camCenter, camera);
                const rawHits = raycaster.intersectObjects(window._weldInteractables, true);
                const validHits = rawHits.filter(h => {
                    if (!h.face) return false;
                    if (h.object === sparkSystem || h.object === smokeSystem) return false;
                    if (h.object.userData.isHelper || h.object.userData.isHighlight) return false;
                    if (h.object.userData.isSupportMarker) return false;
                    if (h.object.userData.isWelderMachine) return false;
                    if (h.object.userData.isArchiveBook) return false;
                    if (h.object.userData.isWeldBead && h.object.userData.coolTime != null) return false; // Игнорируем ТОЛЬКО горячие капли (чтобы не было башенок)
                    if (h.object.userData.isSpatter) return false;
                    
                    // Игнорируем собственное тело и сам инструмент в руках
                    let p = h.object;
                    while(p) {
                        if (p.userData && p.userData.isTorch) return false;
                        if (currentIdentity && p === currentIdentity.mesh) return false;
                        p = p.parent;
                    }
                    return true;
                });

                if (validHits.length > 0) {
                    const hit = validHits[0];
                    targetHitPoint = hit.point;
                    targetHitObject = hit.object;
                    if (hit.face && hit.face.normal) {
                        targetHitNormal = hit.face.normal.clone().transformDirection(targetHitObject.matrixWorld).normalize();
                    }
                }
            }

            // Динамическая анимация сварочного аппарата (УМНОЕ приближение к детали)
            if (weldingTorch && weldingTorch.visible) {
                if (electrodeMesh) {
                    electrodeMesh.visible = (window.playerElectrodes && window.playerElectrodes.diam != null);
                }

                const ud = weldingTorch.userData;
                if (ud.idlePos && ud.weldPos) {
                    let targetPos = ud.idlePos.clone();
                    let targetRot = ud.idleRot;

                    if (isWeldingNow) {
                        // Аппарат остается в визуальном масштабе (на своей weldPos),
                        // но плавно сдвигается вперед по оси электрода, компенсируя сгорание.
                        targetPos = ud.weldPos.clone();
                        targetRot = ud.weldRot;
                        
                        const elLen = 35; // Исходная длина
                        const consumed = elLen * (1.0 - electrodeMesh.scale.y);
                        
                        const euler = new THREE.Euler().copy(ud.weldRot);
                        const holderDir = new THREE.Vector3(0, 0, -1).applyEuler(euler);
                        targetPos.addScaledVector(holderDir, consumed);
                    }
                    
                    weldingTorch.position.lerp(targetPos, delta * 12.0);
                    
                    const currentQ = new THREE.Quaternion().setFromEuler(weldingTorch.rotation);
                    const targetQ = new THREE.Quaternion().setFromEuler(targetRot);
                    currentQ.slerp(targetQ, delta * 12.0);
                    weldingTorch.quaternion.copy(currentQ);
                }
                
                // Легкое дрожание руки
                weldingTorch.position.y += Math.sin(time * 0.012) * 0.05;

                // Управление каплей на конце электрода
                if (ud.moltenDrop && electrodeMesh) {
                    if (electrodeMesh.scale.y >= 0.99) {
                        // Новый электрод - скрываем каплю
                        ud.moltenDrop.visible = false;
                        ud.moltenDrop.material.color.setHex(0xffaa00);
                        ud.moltenDrop.material.emissiveIntensity = 2.0;
                    } else if (isWeldingNow) {
                        // В процессе сварки (Капля ярко светится)
                        ud.moltenDrop.visible = true;
                        ud.moltenDrop.material.color.setHex(0xffaa00);
                        ud.moltenDrop.material.emissiveIntensity = 1.5 + Math.random() * 1.5;
                    } else if (ud.moltenDrop.visible) {
                        // Остывание капли после остановки сварки
                        ud.moltenDrop.material.emissiveIntensity = Math.max(0, ud.moltenDrop.material.emissiveIntensity - delta * 2.0);
                        if (ud.moltenDrop.material.emissiveIntensity <= 0) {
                            ud.moltenDrop.material.color.setHex(0x222222); // Превращается в черный нагар
                        }
                    }
                }
            }

            if (activeTool === TOOL_WELDER && weldingTorch && weldingTorch.visible && cameraMode === 'FPS' && controls.isLocked) {

                if (isWeldingNow) {
                    if (targetHitPoint) {
                        const hitPoint = targetHitPoint;
                        const hitObject = targetHitObject;
                        const hitNormal = targetHitNormal;

                        const eDiam = window.playerElectrodes && window.playerElectrodes.diam ? parseFloat(window.playerElectrodes.diam) : 3.0;
                        let metalThickness = 4.0;
                        let tp = hitObject;
                        while(tp && !tp.userData.isWorkpiece && tp !== scene) tp = tp.parent;
                        if (tp && tp.userData.thicknessMM) metalThickness = tp.userData.thicknessMM;

                        const distFromCam = hitPoint.distanceTo(camera.position);
                        
                        // Обезопасим вызов tipWorldPos (он нужен для света при залипании)
                        const tipWorldPos = new THREE.Vector3();
                        if (weldingTorch && weldingTorch.userData.tip) {
                            weldingTorch.updateMatrixWorld(true);
                            weldingTorch.userData.tip.getWorldPosition(tipWorldPos);
                        } else {
                            tipWorldPos.copy(hitPoint);
                        }
                        
                        let arcLength;
                        if (distFromCam > 150.0) {
                            arcLength = 999; // Слишком далеко
                        } else {
                            // Программа автоматически держит идеальную дугу, компенсируя сгорание
                            arcLength = WELD_PARAMS.optimalDist;
                        }

                        // Update mask HUD
                        const hudStats = document.getElementById('weldStats');
                        const hudArcEl = document.getElementById('hudArc');
                        const hudStatus = document.getElementById('hudStatus');
                        const hudRight = document.getElementById('maskHudRight');
                        const arcBar = document.getElementById('maskArcBar');
                        const arcFill = document.getElementById('maskArcFill');
                        if (hudStats) hudStats.style.display = 'block';
                        if (hudRight) hudRight.style.display = 'block';
                        if (arcBar) arcBar.style.display = 'block';
                        if (hudArcEl) hudArcEl.innerText = (arcLength * 10).toFixed(0); // mm display
                        if (hudStatus) {
                            if (arcLength > WELD_PARAMS.maxDist) {
                                hudStatus.innerText = 'СЛИШКОМ ДАЛЕКО'; hudStatus.style.color = '#ef4444';
                                if (weldLight) weldLight.intensity = 0;
                                if (arcFill) arcFill.style.width = '0%';
                            } else {
                                const arcQuality = 1.0 - clamp((arcLength - WELD_PARAMS.optimalDist) / (WELD_PARAMS.maxDist - WELD_PARAMS.optimalDist), 0, 1);
                                const prof = getWeldProfile(3, metalThickness, eDiam);
                                // Итоговое качество: дуга + настройки аппарата
                                const quality = arcQuality * 0.5 + prof.paramQuality * 0.5;
                                if (prof.paramQuality < 0.4) {
                                    if (prof.diamTooLarge) hudStatus.innerText = 'ЭЛЕКТРОД ТОЛСТЫЙ';
                                    else if (prof.diamTooSmall) hudStatus.innerText = 'ЭЛЕКТРОД ТОНКИЙ';
                                    else if (prof.lowI > 0.4) hudStatus.innerText = 'МАЛЫЙ ТОК';
                                    else if (prof.overI > 0.4) hudStatus.innerText = 'ВЫСОКИЙ ТОК';
                                    else if (prof.uN > 0.7) hudStatus.innerText = 'ДЛИННАЯ ДУГА';
                                    else hudStatus.innerText = 'ОШИБКА НАСТРОЕК';
                                    hudStatus.style.color = '#ef4444';
                                } else {
                                    hudStatus.innerText = quality > 0.55 ? 'ИДЕАЛЬНАЯ ДУГА' : 'НЕСТАБИЛЬНО';
                                    hudStatus.style.color = quality > 0.55 ? '#22c55e' : '#eab308';
                                }
                                // Ток и напряжение — реальные значения с аппарата
                                const ampVal = document.getElementById('weldAmps');
                                const voltVal = document.getElementById('weldVolts');
                                if (ampVal) ampVal.innerText = Math.round(prof.I) + ' A';
                                if (voltVal) voltVal.innerText = Math.round(prof.U) + ' V';
                                if (arcFill) arcFill.style.width = (quality * 100).toFixed(0) + '%';
                            }
                        }

                        // Short-circuit / Stick check
                        if (arcLength < STICK_THRESHOLD) isStuck = true;
                        if (isStuck) {
                            if (weldLight) { weldLight.intensity = 0.5 + Math.random() * 0.5; weldLight.color.setHex(0xff3300); weldLight.position.copy(tipWorldPos); }
                            if (hudStatus) { hudStatus.innerText = 'ЗАЛИПАНИЕ!'; hudStatus.style.color = '#ff0000'; }
                            if (keyState['KeyW'] || keyState['KeyS'] || keyState['KeyA'] || keyState['KeyD']) stuckShakeAccumulator += delta;
                            if (stuckShakeAccumulator > 0.5) { isStuck = false; stuckShakeAccumulator = 0; }
                        } else if (arcLength <= WELD_PARAMS.maxDist) {
                            // === ARC IS ACTIVE — WELD ===
                            const quality = 1.0 - clamp((arcLength - WELD_PARAMS.optimalDist) / (WELD_PARAMS.maxDist - WELD_PARAMS.optimalDist), 0, 1);
                            if (weldLight) {
                                weldLight.intensity = 2.0 + Math.random() * 3.0;
                                weldLight.color.setHex(0x66ccff);
                                weldLight.position.copy(hitPoint).addScaledVector(hitNormal, 2);
                            }
                            const distToLastPreview = hitPoint.distanceTo(lastBeadPos);
                            const isFirstBead = lastBeadPos.y < -500;
                            const travelSpeed = isFirstBead ? 4 : distToLastPreview / WELD_PARAMS.feedRate;
                            const prof = getWeldProfile(travelSpeed, metalThickness, eDiam);
                            // Недостаток тока → нестабильная дуга, прерывания и залипание электрода
                            if (prof.lowI > 0.15 && Math.random() < prof.lowI * 0.04) {
                                isStuck = true;
                            }
                            // Искры — через кадр; дым — раз в ~5 кадров
                            if (_frameNo % 2 === 0) spawnSpark(hitPoint);
                            if (prof.spatter > 0 && Math.random() < prof.spatter) spawnSpark(hitPoint);
                            if (prof.overheat > 0.3 && Math.random() < prof.overheat * 0.5) spawnSpark(hitPoint);
                            if (_frameNo % 5 === 0) spawnSmoke(hitPoint);
                            updateWeldingSound(true, quality * (1.0 - prof.lowI * 0.6));

                            // Electrode consumption
                            if (electrodeMesh && electrodeMesh.scale.y > 0.15) {
                                electrodeMesh.scale.y -= WELD_PARAMS.electrodeBurn;
                            } else {
                                isWeldingNow = false;
                                const ci = document.getElementById('cutInfo');
                                if (ci) { 
                                    if (window.playerElectrodes && window.playerElectrodes.count > 0) {
                                        ci.textContent = '⚠️ ЭЛЕКТРОД СГОРЕЛ! (НАЖМИТЕ R)'; 
                                    } else {
                                        ci.textContent = '⚠️ НЕТ ЭЛЕКТРОДОВ! ИДИТЕ К ШКАФУ'; 
                                    }
                                    ci.style.display = 'block'; ci.style.color = '#ef4444'; 
                                }
                            }

                            // Bead creation timer — новый валик только при движении (не «небоскрёб»)
                            weldTimer += delta;
                            if (weldTimer > WELD_PARAMS.feedRate) {
                                weldTimer = 0;
                                const distToLast = hitPoint.distanceTo(lastBeadPos);
                                const isFirst = lastBeadPos.y < -500;
                                const canDeposit = isFirst || distToLast >= WELD_PARAMS.beadSpacing;

                                if (canDeposit) {
                                    const arcFactor = clamp((arcLength - WELD_PARAMS.optimalDist) / (WELD_PARAMS.maxDist - WELD_PARAMS.optimalDist), 0, 1);
                                    const beadProf = getWeldProfile(isFirst ? 4 : distToLast / WELD_PARAMS.feedRate, metalThickness, eDiam);
                                    let radiusVar = beadProf.beadWidth * (0.85 + arcFactor * 0.15);
                                    const edgeNoise = Math.max(beadProf.uN * 0.8, beadProf.lowI * 1.0);
                                    radiusVar *= (1.0 + (Math.random() - 0.5) * 0.5 * edgeNoise);
                                    let heightScale = beadProf.beadHeight;
                                    heightScale *= (1.0 + (Math.random() - 0.5) * 0.35 * edgeNoise);

                                    const hitPointW = hitPoint.clone();

                                    // Цвет остывшего металла
                                    let finalColor = new THREE.Color(0x2b2b2b);
                                    if (beadProf.burnThrough) {
                                        finalColor.setHex(0x0a0a0a); // Прожог (черный нагар)
                                        radiusVar *= 1.4; // Рваные широкие края
                                        spawnScorch(hitPointW, hitNormal, radiusVar * 2.5, 'burn'); // Обильные ожоги
                                    } else if (beadProf.overheat > 0.6) {
                                        finalColor.setHex(0x1a2035); // Перегрев (Побежалость)
                                    } else if (beadProf.lowI > 0.4) {
                                        finalColor.setHex(0x181818); // Непровар (Черный)
                                        heightScale *= 1.5; // Горбушка
                                        radiusVar *= 0.7; // Узкий
                                    }

                                    // Блуждание только при движении
                                    if (distToLast > WELD_PARAMS.beadSpacing && beadProf.uN > 0.4) {
                                        const wander = beadProf.uN * radiusVar * 0.15; // Понижено, чтобы шов ровно следовал за курсором
                                        const upW = hitNormal.clone().normalize();
                                        let tanW = new THREE.Vector3(1, 0, 0);
                                        if (Math.abs(upW.dot(tanW)) > 0.9) tanW.set(0, 0, 1);
                                        const sideW = new THREE.Vector3().crossVectors(upW, tanW).normalize();
                                        hitPointW.addScaledVector(sideW, (Math.random() - 0.5) * 2 * wander);
                                    }

                                    let targetParent = hitObject;
                                    let safety = 0;
                                    while (targetParent && !targetParent.userData.isWorkpiece && safety < 10) {
                                        if (targetParent.parent && targetParent.parent !== scene) { targetParent = targetParent.parent; } else { break; }
                                        safety++;
                                    }
                                    if (!targetParent || !targetParent.userData.isWorkpiece) targetParent = hitObject;
                                    targetParent.updateMatrixWorld(true);
                                    const parentWorldQuatInv = targetParent.getWorldQuaternion(new THREE.Quaternion()).invert();

                                    // --- ЛОГИКА ОРИЕНТАЦИИ И КАПЛЕВИДНОЙ ФОРМЫ ШВА ---
                                    // Умное распознавание поверхности: если нормаль резко сменилась, мы не вытягиваем шов
                                    const isContinuous = hitNormal.dot(lastHitNormal) > 0.5;

                                    let vecForward = new THREE.Vector3();
                                    if (isFirst || !isContinuous) {
                                        camera.getWorldDirection(vecForward);
                                        vecForward.projectOnPlane(hitNormal).normalize();
                                        if (vecForward.lengthSq() < 0.001) {
                                            let tempRight = new THREE.Vector3(1, 0, 0);
                                            if (Math.abs(hitNormal.dot(tempRight)) > 0.9) tempRight.set(0, 0, 1);
                                            vecForward.crossVectors(tempRight, hitNormal).normalize();
                                        }
                                    } else {
                                        vecForward.subVectors(hitPointW, lastBeadPos).normalize();
                                    }
                                    
                                    let vecUp = hitNormal.clone();
                                    let vecRight = new THREE.Vector3().crossVectors(vecUp, vecForward).normalize();
                                    vecUp.crossVectors(vecForward, vecRight).normalize();
                                    const rotMatrix = new THREE.Matrix4().makeBasis(vecRight, vecUp, vecForward);

                                    const beadMat = hotMetalBase.clone();
                                    const bead = new THREE.Mesh(_baseBeadGeo, beadMat);
                                    
                                    // Вычисляем масштаб (исключительно круглые чешуйки, убираем овал)
                                    let widthScale = radiusVar * (1.0 + beadProf.uN * 0.15);
                                    let lengthScale = widthScale; // Строго круглые
                                    heightScale = radiusVar * heightScale; // Корректируем высоту относительно радиуса
                                    bead.scale.set(widthScale, heightScale, lengthScale);
                                    
                                    // Убираем искусственное смещение назад, чтобы не искажать круглую форму
                                    const finalBeadPosW = hitPointW.clone();

                                    bead.position.copy(finalBeadPosW);
                                    bead.quaternion.setFromRotationMatrix(rotMatrix);
                                    
                                    const worldPos = hitPointW.clone(); // Опорная точка для мостиков
                                    targetParent.worldToLocal(bead.position);
                                    bead.quaternion.premultiply(parentWorldQuatInv);
                                    bead.userData.isWeldBead = true;
                                    bead.userData.birthTime = t_sec;
                                    bead.userData.coolTime = 2.5 + beadProf.iN * 1.2;
                                    bead.userData.finalColor = finalColor;
                                    targetParent.add(bead);
                                    weldBeads.push(bead);

                                    // УМНАЯ ЛОГИКА СОЕДИНЕНИЯ (Мостики из сфер-чешуек)
                                    // Если мы дернули мышкой быстрее, чем генерируются капли, заполняем разрыв
                                    if (!isFirst && isContinuous && distToLast < 1.5 && distToLast > WELD_PARAMS.beadSpacing * 1.2) {
                                        const steps = Math.floor(distToLast / WELD_PARAMS.beadSpacing);
                                        for (let i = 1; i < steps; i++) {
                                            const frac = i / steps;
                                            const interPointW = new THREE.Vector3().lerpVectors(lastBeadPos, finalBeadPosW, frac);
                                            
                                            const interBead = new THREE.Mesh(_baseBeadGeo, beadMat.clone());
                                            interBead.scale.set(widthScale, heightScale, lengthScale);
                                            interBead.position.copy(interPointW);
                                            interBead.quaternion.setFromRotationMatrix(rotMatrix);
                                            
                                            targetParent.worldToLocal(interBead.position);
                                            interBead.quaternion.premultiply(parentWorldQuatInv);
                                            
                                            interBead.userData.isWeldBead = true;
                                            interBead.userData.birthTime = t_sec;
                                            interBead.userData.coolTime = 2.0;
                                            interBead.userData.finalColor = finalColor;
                                            targetParent.add(interBead);
                                            weldBeads.push(interBead);
                                        }
                                    }

                                    lastBeadPos.copy(worldPos);
                                    lastHitNormal.copy(hitNormal);

                                    // Group merge check
                                    const beadWorldPos = new THREE.Vector3();
                                    bead.getWorldPosition(beadWorldPos);
                                    const mergeRadius = radiusVar * 2.5;
                                    for (const other of workpieces) {
                                        if (other === targetParent) continue;
                                        if (other.userData.groupId && targetParent.userData.groupId && other.userData.groupId === targetParent.userData.groupId) continue;
                                        if (!other.userData.half) continue;
                                        const oOff = computeOffsets(other);
                                        const wPos = other.position;
                                        const margin = 2;
                                        if (beadWorldPos.x < wPos.x + oOff.minX - margin || beadWorldPos.x > wPos.x + oOff.maxX + margin ||
                                            beadWorldPos.y < wPos.y + oOff.minY - margin || beadWorldPos.y > wPos.y + oOff.maxY + margin ||
                                            beadWorldPos.z < wPos.z + oOff.minZ - margin || beadWorldPos.z > wPos.z + oOff.maxZ + margin) continue;
                                        const localBead = beadWorldPos.clone();
                                        other.worldToLocal(localBead);
                                        const h = other.userData.half;
                                        const dx = Math.max(Math.abs(localBead.x) - h.x, 0);
                                        const dy = Math.max(Math.abs(localBead.y) - h.y, 0);
                                        const dz = Math.max(Math.abs(localBead.z) - h.z, 0);
                                        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < mergeRadius) mergeGroups(targetParent, other);
                                    }
                                    // Разбрызгивание металла при избытке тепла (ток/напряжение завышены)
                                    spawnSpatter(hitPointW, hitNormal, targetParent, beadProf.spatter);
                                    
                                    // Спавн ожогов побежалости при ошибках настройки
                                    if ((beadProf.overheat > 0.4 || beadProf.burnThrough) && Math.random() < 0.25) {
                                        spawnScorch(hitPointW, hitNormal, radiusVar * 1.5, beadProf.burnThrough ? 'burn' : 'oxid');
                                    } else if (beadProf.lowI > 0.4 && Math.random() < 0.1) {
                                        spawnScorch(hitPointW, hitNormal, radiusVar * 1.5, 'burn');
                                    }
                                    cleanSlag();
                                } else if (prof.overheat > 0.2) {
                                    // Стоим на месте — только брызги от перегрева, без наращивания
                                    spawnSpatter(hitPoint, hitNormal, hitObject, prof.overheat * 0.6);
                                }
                            }
                        } else {
                            if (weldLight) weldLight.intensity = 0;
                            updateWeldingSound(false, 0);
                        }
                    } else {
                        if (weldLight) weldLight.intensity = 0;
                        updateWeldingSound(false, 0);
                        lastBeadPos.set(0, -9999, 0);
                        killWeldParticles();
                    }
                } else {
                    if (weldLight) weldLight.intensity = 0;
                    lastBeadPos.set(0, -9999, 0);
                    killWeldParticles();
                }
            } else if (!isWeldingNow && weldLight) {
                weldLight.intensity = 0;
            }

            // Weld bead cooling (throttled — каждые 3 кадра)
            if (_frameNo % 3 === 0)
            for (let _i = weldBeads.length - 1; _i >= 0; _i--) {
                const _b = weldBeads[_i];
                if (!_b.userData.coolTime) continue;
                const _age = t_sec - (_b.userData.birthTime || 0);
                if (_age < _b.userData.coolTime) {
                    const _k = 1.0 - (_age / _b.userData.coolTime);
                    _b.material.emissive.setHSL(0.05 + _k * 0.05, 1.0, _k * 0.5);
                    _b.material.emissiveIntensity = _k * 2.0;
                } else {
                    _b.material.emissiveIntensity = 0;
                    if (_b.userData.finalColor) {
                        _b.material.color.copy(_b.userData.finalColor);
                    } else {
                        _b.material.color.setHex(0x2b2b2b);
                    }
                    _b.material.roughness = 0.9;
                    _b.material.metalness = 0.1;
                    _b.userData.coolTime = null;
                    weldBeads.splice(_i, 1);
                }
            }
            // ===== END WELDING SYSTEM UPDATE =====

            // Наведение прицела на органы управления аппаратом и пультами (троттлинг)
            if (_frameNo % 3 === 0) {
                updateWelderHoverHUD();
                updateRemoteHoverHUD();
            }

            // ── Worker idle animations (throttled: каждые 2 кадра) ───────
            if (_frameNo % 2 === 0) workers.forEach(w => {
                const ud = w.mesh.userData;
                if (!ud.breathRate) return;
                const breath = Math.sin(t_sec * ud.breathRate + ud.breathOffset);
                // Chest subtle scale (breathing)
                if (ud.breathParts) {
                    ud.breathParts.forEach(p => { p.scale.z = (p.userData._baseScaleZ || 1) + breath * 0.018; });
                }
                // Head is static (no bob)
                // Arm sway — very slight pendulum
                if (ud.armL) {
                    ud.armL.rotation.z = ud.armLBaseZ + breath * 0.04;
                    ud.armL.rotation.x = Math.sin(t_sec * ud.breathRate * 0.7 + ud.breathOffset) * 0.03;
                }
                if (ud.armR) {
                    ud.armR.rotation.z = ud.armRBaseZ - breath * 0.04;
                    ud.armR.rotation.x = Math.sin(t_sec * ud.breathRate * 0.7 + ud.breathOffset + Math.PI) * 0.03;
                }
            }); // end workers forEach
            // ─────────────────────────────────────────────────────────────

            // Анимация выезжающей книги в режиме архива
            if (typeof updateArchiveBook === 'function') updateArchiveBook(delta, t_sec);

            if (cameraMode === 'TRANSITION') {
                const elapsed = time - transition.startTime;
                const t = Math.min(1, elapsed / transition.duration);
                // Ease InOut Quad
                const ease = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

                camera.position.lerpVectors(transition.startPos, transition.endPos, ease);
                
                const currentLook = new THREE.Vector3().lerpVectors(transition.startLook, transition.endLook, ease);
                camera.lookAt(currentLook);

                if (t >= 1) {
                    transition.active = false;
                    if (transition.onComplete) transition.onComplete();
                }

            } else if (cameraMode === 'GOD') {
                orbitControls.update();
                
                // Keep supervisor mesh rotation fixed or static?
                // It stays static.
                
                // Make dots billboard (face camera) and update color
                workers.forEach(w => {
                   if (w.dot.visible) {
                       // Scale by distance for visibility
                       const d = camera.position.distanceTo(w.mesh.position);
                       const s = Math.max(20, d / 20);
                       w.dot.scale.set(s, s, 1);
                       
                       // Color check: Green if possessed, Red otherwise
                       if (currentIdentity && w === currentIdentity) {
                           w.dot.material = greenDotMaterial;
                       } else {
                           w.dot.material = redDotMaterial;
                       }
                   }
                });
                if (supervisorMesh && supervisorMesh.userData.dot.visible) {
                    const d = camera.position.distanceTo(supervisorMesh.position);
                    const s = Math.max(20, d / 20);
                    supervisorMesh.userData.dot.scale.set(s,s,1);

                    // If we are not possessing a worker, we are the supervisor
                    if (!currentIdentity) {
                        supervisorMesh.userData.dot.material = greenDotMaterial;
                    } else {
                        supervisorMesh.userData.dot.material = redDotMaterial;
                    }
                }

            } else if (cameraMode === 'FPS' && controls.isLocked) {
                // Если держим тележку - камера управляется функцией moveActiveCart,
                // поэтому пропускаем стандартное управление WASD
                if (!isHoldingCart) {
                    // Move (cached vectors — no per-frame allocation)
                    const moveForward = Number(keyState['ArrowUp'] || keyState['KeyW'] || 0) - Number(keyState['ArrowDown'] || keyState['KeyS'] || 0);
                    const moveRight = Number(keyState['ArrowRight'] || keyState['KeyD'] || 0) - Number(keyState['ArrowLeft'] || keyState['KeyA'] || 0);
                    
                    const speed = 4000 * delta;
                    camera.getWorldDirection(_fpsDir); _fpsDir.y = 0; _fpsDir.normalize();
                    _fpsRight.crossVectors(_fpsDir, _fpsUp);

                    _fpsProposed.copy(camera.position);
                    if(moveForward) _fpsProposed.addScaledVector(_fpsDir, moveForward * speed * 0.1);
                    if(moveRight) _fpsProposed.addScaledVector(_fpsRight, moveRight * speed * 0.1);

                    // Collision
                    let collideX = checkCollision({x: _fpsProposed.x, z: camera.position.z});
                    let collideZ = checkCollision({x: camera.position.x, z: _fpsProposed.z});
                    
                    if(!collideX) camera.position.x = _fpsProposed.x;
                    if(!collideZ) camera.position.z = _fpsProposed.z;
                }

                // Restrict Global Bounds
                const margin = 50;
                if (camera.position.x < minX + margin) camera.position.x = minX + margin;
                if (camera.position.x > maxX - margin) camera.position.x = maxX - margin;
                if (camera.position.z < minY + margin) camera.position.z = minY + margin;
                if (camera.position.z > maxY - margin) camera.position.z = maxY - margin;

                // Lock Y to eye level of possessed character
                {
                    const eyeMesh = currentIdentity ? currentIdentity.mesh : supervisorMesh;
                    camera.position.y = getWorkerEyeHeight(eyeMesh);
                }

                // Zone (throttle: каждые 20 кадров — зона меняется редко)
                if (_frameNo % 20 === 0) {
                const cx = camera.position.x; const cz = camera.position.z;
                let zoneName = "Снаружи";
                zones.forEach(z => { if(cx >= z.minX && cx <= z.maxX && cz >= z.minZ && cz <= z.maxZ) zoneName = z.name; });
                document.getElementById('current-zone').innerText = zoneName;
                } // end zone throttle

                // Обновление координат (X, Y, Z) для удобного позиционирования
                if (_frameNo % 5 === 0) {
                    const posEl = document.getElementById('current-pos');
                    if (posEl) {
                        posEl.innerText = `${Math.round(camera.position.x)}, ${Math.round(camera.position.y)}, ${Math.round(camera.position.z)}`;
                    }
                }

                // If moving currentIdentity, update their mesh position for when we leave body
                if (currentIdentity) {
                    currentIdentity.mesh.position.set(camera.position.x, window.getFloorHeightAt(camera.position.x, camera.position.z), camera.position.z);
                    
                    // Sync rotation of mesh with camera view direction (Yaw only — cached dir)
                    camera.getWorldDirection(_fpsDir);
                    const yaw = Math.atan2(_fpsDir.x, _fpsDir.z);
                    currentIdentity.mesh.rotation.y = yaw;
                }
                // If Supervisor, update supervisor mesh hidden location
                if (!currentIdentity && supervisorMesh) {
                     supervisorMesh.position.set(camera.position.x, window.getFloorHeightAt(camera.position.x, camera.position.z), camera.position.z);
                     camera.getWorldDirection(_fpsDir);
                     supervisorMesh.rotation.y = Math.atan2(_fpsDir.x, _fpsDir.z);
                }
            }
            
            if(window.OSState.isMapOpen) drawMap();

            // ===== PIP CAMERA (ELECTRODE CAM) =====
            if (!isMaskEquipped && isWeldCamActive) {
                isWeldCamActive = false;
                document.getElementById('weldCamContainer').style.display = 'none';
            }
            if (camRotateDir !== 0) weldCamAngle += camRotateDir * delta * 2.0;
            if (isWeldCamActive && activeTool === TOOL_WELDER) {
                if (!pipRenderer) {
                    const cvs = document.getElementById('pipCanvas');
                    if (cvs) {
                        pipRenderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: false });
                        pipRenderer.setSize(240, 180);
                        pipRenderer.setPixelRatio(1);
                    }
                }
                if (pipRenderer && _frameNo % 3 === 0) { // PIP max ~20fps
                    raycaster.setFromCamera(_camCenter, camera);
                    const targets = window._weldInteractables || workpieces;
                    const pipHits = raycaster.intersectObjects(targets, true);
                    const rawTarget = new THREE.Vector3();
                    if (pipHits.length > 0) {
                        rawTarget.copy(pipHits[0].point);
                    } else {
                        const fwd = new THREE.Vector3();
                        camera.getWorldDirection(fwd);
                        rawTarget.copy(camera.position).addScaledVector(fwd, 200);
                    }
                    if (pipSmoothedTarget.distanceTo(rawTarget) > 100 || pipSmoothedTarget.lengthSq() === 0)
                        pipSmoothedTarget.copy(rawTarget);
                    else pipSmoothedTarget.lerp(rawTarget, 0.1);

                    const _off = new THREE.Vector3().subVectors(camera.position, pipSmoothedTarget);
                    _off.y *= 0.4; _off.normalize();
                    if (_off.lengthSq() < 0.01) _off.set(0, 0, 1);
                    _off.applyAxisAngle(new THREE.Vector3(0,1,0), weldCamAngle);
                    _off.multiplyScalar(60);
                    const _pipPos = pipSmoothedTarget.clone().add(_off);
                    if (_pipPos.y < pipSmoothedTarget.y + 5) _pipPos.y = pipSmoothedTarget.y + 5;
                    weldCamera.position.copy(_pipPos);
                    weldCamera.lookAt(pipSmoothedTarget);
                    weldCamera.fov = 4;
                    weldCamera.updateProjectionMatrix();
                    pipRenderer.render(scene, weldCamera);
                }
            }

            // ===== ZOOM FOV =====
            {
                let _targetFov = isZooming ? 20 : 75;
                if (window.theodoliteState === 'view') {
                    _targetFov = window.theodoliteZoom || 45; // Default zoom in theodolite
                } else {
                    window.theodoliteZoom = null; // Reset when exiting view
                }
                
                if (Math.abs(camera.fov - _targetFov) > 0.1) {
                    camera.fov += (_targetFov - camera.fov) * 0.15;
                    camera.updateProjectionMatrix();
                }
            }

            // View bobbing for remotes
            if (window.updateRemoteBobbing) window.updateRemoteBobbing(t_sec);

            // ===== LASER LINES (Raycasting) =====
            updateLaserLines();

            // ===== EXTRA UPDATERS (plasma cutter, etc.) =====
            if (window._extraUpdaters) {
                const _dt = Math.min(delta, 0.1);
                for (const fn of window._extraUpdaters) { try { fn(_dt); } catch(e) { console.warn('[extraUpdater]', e); } }
            }

            // Отключаем тяжелый Bloom (Composer), если лазер выключен, чтобы убрать лаги в 113ms
            const isLaserActive = window.theodoliteObj && window.theodoliteObj.userData.laserMode > 0;
            if (window.composer && (isLaserActive || isWeldingNow)) {
                window.composer.render();
            } else {
                renderer.render(scene, camera);
            }
        }
        refreshWelderMachines();
        
        // ===================================================
        // LASER LINE RAYCASTER
        // Чистые линии без свечения, не проходят сквозь стены
        // Троттлинг: обновление 1 раз в 6 кадров (~10fps при 60fps)
        // ===================================================
        (function setupLaserLines() {
            const _laserRC = new THREE.Raycaster();
            _laserRC.near = 1;
            _laserRC.far = 6000;
            _laserRC.firstHitOnly = true; // Критичная оптимизация для лазера
            
            const _laserMatH = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 1 });
            const _laserMatV = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 1 });
            const _laserGeoH = new THREE.BufferGeometry();
            const _laserGeoV = new THREE.BufferGeometry();
            const _laserLineH = new THREE.LineSegments(_laserGeoH, _laserMatH);
            const _laserLineV = new THREE.LineSegments(_laserGeoV, _laserMatV);
            _laserLineH.frustumCulled = false;
            _laserLineV.frustumCulled = false;
            _laserLineH.renderOrder = 999;
            _laserLineV.renderOrder = 999;
            _laserLineH.raycast = function() {}; // Отключаем raycast, чтобы не висло при наведении
            _laserLineV.raycast = function() {};
            scene.add(_laserLineH, _laserLineV);
            
            let _frameSkip = 0;
            
            // Кэш мешей — только крупные объекты с большими bounding box (стены, пол, стенды)
            let _meshCache = null;
            const _bbSize = new THREE.Vector3();
            function getMeshes() {
                if (_meshCache) return _meshCache;
                _meshCache = [];
                scene.traverse(o => {
                    if (!o.isMesh) return;
                    if (o === _laserLineH || o === _laserLineV) return;
                    // Только меши с bounding box >= 50 единиц (стены, пол, оборудование)
                    // Мелкие детали (болты, кнопки) пропускаем
                    if (o.geometry && o.geometry.boundingBox === null) {
                        o.geometry.computeBoundingBox();
                    }
                    if (o.geometry && o.geometry.boundingBox) {
                        o.geometry.boundingBox.getSize(_bbSize);
                        const maxDim = Math.max(_bbSize.x, _bbSize.y, _bbSize.z);
                        if (maxDim >= 300 || o.name === 'Floor') _meshCache.push(o);
                    } else if (o.name === 'Floor') {
                        _meshCache.push(o); // Гарантированно добавляем пол
                    }
                });
                return _meshCache;
            }
            
            const _tmpPos = new THREE.Vector3();
            const _tmpQuat = new THREE.Quaternion();
            const _tmpFwd = new THREE.Vector3();
            const _tmpRight = new THREE.Vector3();
            const _worldUp = new THREE.Vector3(0, 1, 0);
            const _tmpDir = new THREE.Vector3();
            
            const RAYS = 12;  // Снизили до 12 для максимальной производительности
            const SPAN = Math.PI * 0.85; // ~153° охват
            const halfSpan = SPAN / 2;
            const _tmpLastP = new THREE.Vector3();
            function fanCast(origin, axis, forward, pts) {
                pts.length = 0;
                let hasLast = false;
                for (let i = 0; i < RAYS; i++) {
                    const angle = -halfSpan + (i / (RAYS - 1)) * SPAN;
                    _tmpDir.copy(forward).applyAxisAngle(axis, angle).normalize();
                    _laserRC.set(origin, _tmpDir);
                    const hits = _laserRC.intersectObjects(getMeshes(), false);
                    if (hits.length > 0) {
                        const p = hits[0].point;
                        if (hasLast && p.distanceTo(_tmpLastP) < 500) {
                            pts.push(_tmpLastP.x, _tmpLastP.y, _tmpLastP.z, p.x, p.y, p.z);
                        }
                        _tmpLastP.copy(p);
                        hasLast = true;
                    } else {
                        hasLast = false;
                    }
                }
            }
            
            const _ptsH = [];
            const _ptsV = [];
            
            window.updateLaserLines = function() {
                // Троттлинг: пересчёт только каждые 6 кадров
                _frameSkip = (_frameSkip + 1) % 6;
                
                const obj = window.theodoliteObj;
                if (!obj) { _laserLineH.visible = false; _laserLineV.visible = false; return; }
                
                const mode = obj.userData.laserMode || 0;
                if (mode === 0) {
                    _laserLineH.visible = false;
                    _laserLineV.visible = false;
                    return;
                }
                
                // Показываем последнее вычисленное положение (даже если не пересчитываем)
                _laserLineH.visible = (mode === 1 || mode === 3);
                _laserLineV.visible = (mode === 2 || mode === 3);
                
                // Пересчёт позиций только в "свой" кадр
                if (_frameSkip !== 0) return;
                
                const origin = obj.userData.laserOrigin;
                const head = obj.userData.head;
                if (!origin || !head) return;
                
                origin.getWorldPosition(_tmpPos);
                head.getWorldQuaternion(_tmpQuat);
                _tmpFwd.set(0, 0, 1).applyQuaternion(_tmpQuat).normalize();
                _tmpRight.crossVectors(_tmpFwd, _worldUp).normalize();
                if (_tmpRight.lengthSq() < 0.001) _tmpRight.set(1, 0, 0);
                
                if (mode === 1 || mode === 3) {
                    fanCast(_tmpPos, _worldUp, _tmpFwd, _ptsH);
                    if (_ptsH.length >= 6) {
                        _laserGeoH.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(_ptsH), 3));
                    }
                }
                
                if (mode === 2 || mode === 3) {
                    fanCast(_tmpPos, _tmpRight, _tmpFwd, _ptsV);
                    if (_ptsV.length >= 6) {
                        _laserGeoV.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(_ptsV), 3));
                    }
                }
            };
        })();
        
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // =====================================================
        // REMOTE CONTROLS LOGIC
        // =====================================================
        window.activeRemote = null;
        let baseRemoteY = 0;
        window.remoteInput = { fwd: false, back: false, up: false, down: false, wheel: 0 };

        function getCurrentActor() {
            return (typeof currentIdentity !== 'undefined' && currentIdentity) ? currentIdentity : supervisorMesh;
        }

        window.applyActiveRemote = function() {
            const actor = getCurrentActor();
            if (!actor.userData) actor.userData = {};
            if (!actor.userData.remotesInventory) actor.userData.remotesInventory = [];
            if (typeof actor.userData.activeRemoteIdx === 'undefined') actor.userData.activeRemoteIdx = -1;

            // Сначала отвязываем все пульты от камеры
            if (window.craneRemoteMesh && window.craneRemoteMesh.parent === camera) camera.remove(window.craneRemoteMesh);
            if (window.craneRemote2Mesh && window.craneRemote2Mesh.parent === camera) camera.remove(window.craneRemote2Mesh);
            if (window.cartRemoteMesh && window.cartRemoteMesh.parent === camera) camera.remove(window.cartRemoteMesh);

            window.activeRemote = null;
            window.remoteInput = { fwd: false, back: false, up: false, down: false, wheel: 0 };

            if (typeof cameraMode !== 'undefined' && cameraMode !== 'FPS') return;

            const idx = actor.userData.activeRemoteIdx;
            if (idx >= 0 && idx < actor.userData.remotesInventory.length) {
                const type = actor.userData.remotesInventory[idx];
                window.activeRemote = type;
                
                if (type === 'crane' && window.craneRemoteMesh) {
                    if (window.craneRemoteMesh.parent) window.craneRemoteMesh.parent.remove(window.craneRemoteMesh);
                    camera.add(window.craneRemoteMesh);
                    window.craneRemoteMesh.position.set(0.6, -0.6, -1.5);
                    window.craneRemoteMesh.rotation.set(-0.2, -0.5, 0.1);
                    window.craneRemoteMesh.scale.set(0.06, 0.06, 0.06);
                    baseRemoteY = window.craneRemoteMesh.position.y;
                } else if (type === 'crane2' && window.craneRemote2Mesh) {
                    if (window.craneRemote2Mesh.parent) window.craneRemote2Mesh.parent.remove(window.craneRemote2Mesh);
                    camera.add(window.craneRemote2Mesh);
                    window.craneRemote2Mesh.position.set(0.6, -0.6, -1.5);
                    window.craneRemote2Mesh.rotation.set(-0.2, -0.5, 0.1);
                    window.craneRemote2Mesh.scale.set(0.06, 0.06, 0.06);
                    baseRemoteY = window.craneRemote2Mesh.position.y;
                } else if (type === 'cart' && window.cartRemoteMesh) {
                    if (window.cartRemoteMesh.parent) window.cartRemoteMesh.parent.remove(window.cartRemoteMesh);
                    camera.add(window.cartRemoteMesh);
                    window.cartRemoteMesh.position.set(0.6, -0.6, -1.5);
                    window.cartRemoteMesh.rotation.set(-0.2, -0.5, 0.1);
                    window.cartRemoteMesh.scale.set(0.06, 0.06, 0.06);
                    baseRemoteY = window.cartRemoteMesh.position.y;
                }
            }
        };

        window.equipRemote = function(type) {
            const actor = getCurrentActor();
            if (!actor.userData) actor.userData = {};
            if (!actor.userData.remotesInventory) actor.userData.remotesInventory = [];
            
            // Если уже есть в инвентаре, просто делаем активным
            let idx = actor.userData.remotesInventory.indexOf(type);
            if (idx === -1) {
                actor.userData.remotesInventory.push(type);
                idx = actor.userData.remotesInventory.length - 1;
                // Индикатор на стенде (меняем на красный, т.к. пульт забрали)
                if (type === 'crane' && window.remotesRack) window.remotesRack.userData.leds.crane.material.color.setHex(0xff0000);
                if (type === 'crane2' && window.remotesRack2) window.remotesRack2.userData.leds.crane.material.color.setHex(0xff0000);
                if (type === 'cart' && window.remotesRack) window.remotesRack.userData.leds.cart.material.color.setHex(0xff0000);
            }
            actor.userData.activeRemoteIdx = idx;
            window.applyActiveRemote();
        };

        window.dropRemote = function() {
            if (!window.activeRemote) return;
            const type = window.activeRemote;
            const actor = getCurrentActor();
            
            if (actor.userData && actor.userData.remotesInventory) {
                const idx = actor.userData.remotesInventory.indexOf(type);
                if (idx !== -1) {
                    actor.userData.remotesInventory.splice(idx, 1);
                }
                actor.userData.activeRemoteIdx = actor.userData.remotesInventory.length > 0 ? 0 : -1;
            }
            
            if (type === 'crane' && window.craneRemoteMesh && window.remotesRack) {
                if (window.craneRemoteMesh.parent) window.craneRemoteMesh.parent.remove(window.craneRemoteMesh);
                window.remotesRack.add(window.craneRemoteMesh);
                window.craneRemoteMesh.scale.set(1, 1, 1);
                window.craneRemoteMesh.position.set(-15, 105, -18);
                window.craneRemoteMesh.rotation.set(0, 0, 0);
                window.remotesRack.userData.leds.crane.material.color.setHex(0x00ff00);
            } else if (type === 'crane2' && window.craneRemote2Mesh && window.remotesRack2) {
                if (window.craneRemote2Mesh.parent) window.craneRemote2Mesh.parent.remove(window.craneRemote2Mesh);
                window.remotesRack2.add(window.craneRemote2Mesh);
                window.craneRemote2Mesh.scale.set(1, 1, 1);
                window.craneRemote2Mesh.position.set(0, 105, -18);
                window.craneRemote2Mesh.rotation.set(0, 0, 0);
                window.remotesRack2.userData.leds.crane.material.color.setHex(0x00ff00);
            } else if (type === 'cart' && window.cartRemoteMesh && window.remotesRack) {
                if (window.cartRemoteMesh.parent) window.cartRemoteMesh.parent.remove(window.cartRemoteMesh);
                window.remotesRack.add(window.cartRemoteMesh);
                window.cartRemoteMesh.scale.set(1, 1, 1);
                window.cartRemoteMesh.position.set(15, 108, -18);
                window.cartRemoteMesh.rotation.set(0, 0, 0);
                window.remotesRack.userData.leds.cart.material.color.setHex(0x00ff00);
            }
            window.applyActiveRemote();
        };

        window.updateRemoteBobbing = function(time) {
            if (!window.activeRemote) return;
            let mesh = null;
            if (window.activeRemote === 'crane') mesh = window.craneRemoteMesh;
            else if (window.activeRemote === 'crane2') mesh = window.craneRemote2Mesh;
            else if (window.activeRemote === 'cart') mesh = window.cartRemoteMesh;
            if (!mesh) return;
            
            // Плавное покачивание (дыхание) в руках
            const amplitude = 0.015;
            const speed = 4;
            mesh.position.y = baseRemoteY + Math.sin(time * speed) * amplitude;
        };

        window.addEventListener('mousedown', (e) => {
            if (typeof cameraMode === 'undefined' || cameraMode !== 'FPS' || !controls.isLocked) return;
            
            if (window.activeRemote) {
                // Если кликнули ЛКМ на стенде — кладем пульт
                if (e.button === 0 && isLookingAtRack) {
                    window.dropRemote();
                    return;
                }
                
                // Анимация вдавливания кнопок
                let mesh = null;
                if (window.activeRemote === 'crane') mesh = window.craneRemoteMesh;
                else if (window.activeRemote === 'crane2') mesh = window.craneRemote2Mesh;
                else if (window.activeRemote === 'cart') mesh = window.cartRemoteMesh;
                let bIdx = e.button === 0 ? 0 : (e.button === 2 ? 1 : -1);
                if (bIdx >= 0 && mesh && mesh.userData.buttons && mesh.userData.buttons[bIdx]) {
                    mesh.userData.buttons[bIdx].position.z = mesh.userData.buttons[bIdx].userData.baseZ - 0.4;
                }
                if (e.button === 0) window.remoteInput.fwd = true;
                if (e.button === 2) window.remoteInput.back = true;
                return;
            }

            // Теодолит (Лазерный уровень)
            if (window.theodoliteObj) {
                
                // === Режим VIEW: ЛКМ = выход, ПКМ = цикл лазера ===
                if (window.theodoliteState === 'view') {
                    if (e.button === 0) { // ЛКМ - выход из режима осмотра
                        window.theodoliteState = 'idle';
                        const tUI = document.getElementById('theodoliteUI');
                        if (tUI) tUI.style.display = 'none';
                        document.body.classList.remove('theodolite-view-active');
                        if (window.theodoliteOldCamPos) {
                            camera.position.copy(window.theodoliteOldCamPos);
                            camera.rotation.set(window.theodoliteOldCamEuler.x, window.theodoliteOldCamEuler.y, window.theodoliteOldCamEuler.z, window.theodoliteOldCamEuler.order);
                        }
                    } else if (e.button === 2) { // ПКМ - цикл лазера
                        const modes = 4; // 0:выкл, 1:гор, 2:верт, 3:крест
                        let mode = (window.theodoliteObj.userData.laserMode + 1) % modes;
                        window.theodoliteObj.userData.laserMode = mode;
                        
                        // Лазерные линии рисуются через updateLaserLines() каждый кадр
                        // Здесь только обновляем режим и UI
                        const laserOn = mode !== 0;
                        window.theodoliteObj.userData.laserActive = laserOn;
                        
                        const statusIndicator = document.getElementById('theoLaserStatus');
                        if (statusIndicator) {
                            const labels = ['ВЫКЛ', 'ГОРИЗ', 'ВЕРТИК', 'КРЕСТ'];
                            statusIndicator.textContent = labels[mode];
                            statusIndicator.style.color = laserOn ? '#00ffcc' : 'rgba(0,200,160,0.5)';
                            statusIndicator.style.textShadow = laserOn ? '0 0 8px #00ffcc' : 'none';
                            statusIndicator.style.background = 'transparent';
                            statusIndicator.style.boxShadow = 'none';
                        }
                    }
                    return;
                }
                
                // === Режим DRAG: любой клик = поставить ===
                if (window.theodoliteState === 'drag') {
                    if (window.theoPhantom) {
                        window.theodoliteObj.position.copy(window.theoPhantom.position);
                        window.theodoliteObj.rotation.set(0, window.theodoliteRotY || 0, 0);
                    }
                    // Удаляем стрелку
                    if (window._theoArrow) {
                        scene.remove(window._theoArrow);
                        window._theoArrow.traverse(o => { if(o.geometry) o.geometry.dispose(); });
                        window._theoArrow = null;
                    }
                    if (window.theoPhantom) {
                        scene.remove(window.theoPhantom);
                        window.theoPhantom = null;
                    }
                    window.theodoliteObj.visible = true;
                    window.theodoliteYOffset = 0;
                    window.theodoliteRotY = 0;
                    window.theodoliteState = 'idle';
                    return;
                }
                
                // === Режим IDLE: рейкаст по теодолиту ===
                if (!window.theodoliteState || window.theodoliteState === 'idle') {
                    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                    const hits = raycaster.intersectObject(window.theodoliteObj, true);
                    if (hits.length > 0 && hits[0].distance < 300) {
                        if (e.button === 0) { // ЛКМ → войти в View
                            window.theodoliteState = 'view';
                            const tUI = document.getElementById('theodoliteUI');
                            if (tUI) tUI.style.display = 'block';
                            document.body.classList.add('theodolite-view-active');

                            window.theodoliteOldCamPos = camera.position.clone();
                            window.theodoliteOldCamEuler = { 
                                x: camera.rotation.x, y: camera.rotation.y, 
                                z: camera.rotation.z, order: camera.rotation.order 
                            };
                            const head = window.theodoliteObj.userData.head;
                            if (head) {
                                const hQ = head.getWorldQuaternion(new THREE.Quaternion());
                                // Разворачиваем камеру на 180 градусов (т.к. камера смотрит в -Z, а лазер в +Z)
                                hQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
                                const hEuler = new THREE.Euler().setFromQuaternion(hQ, 'YXZ');
                                camera.rotation.set(hEuler.x, hEuler.y, 0, 'YXZ');
                                window.theodoliteBaseYaw = hEuler.y;
                                window.theodoliteBasePitch = hEuler.x;
                            }
                            // Pointer lock остаётся активным
                        } else if (e.button === 2) { // ПКМ → перетащивание
                            window.theodoliteState = 'drag';
                            window.theodoliteRotY = window.theodoliteObj.rotation.y; // Сохраняем текущее вращение
                            window.theodoliteObj.visible = false; // Скрываем оригинал
                            if (!window.theoPhantom) {
                                const phantomGroup = new THREE.Group();
                                const phantomMat = new THREE.MeshBasicMaterial({ 
                                    color: 0x00ccff, transparent: true, opacity: 0.4, depthWrite: false 
                                });
                                const wireframeMat = new THREE.MeshBasicMaterial({ 
                                    color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.7 
                                });
                                const tripodH = 110;
                                const spread = 35;
                                for (let i = 0; i < 3; i++) {
                                    const ang = (i * Math.PI * 2) / 3;
                                    const target = new THREE.Vector3(Math.cos(ang) * spread, 0, Math.sin(ang) * spread);
                                    const origin = new THREE.Vector3(0, tripodH, 0);
                                    const dir = new THREE.Vector3().subVectors(target, origin);
                                    const len = dir.length();
                                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(2, 1, len, 6), phantomMat);
                                    leg.position.copy(origin).add(dir.clone().multiplyScalar(0.5));
                                    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
                                    leg.quaternion.copy(q);
                                    phantomGroup.add(leg);
                                }
                                const base = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 4, 12), phantomMat);
                                base.position.set(0, tripodH + 2, 0);
                                phantomGroup.add(base);
                                const headY = tripodH + 15;
                                const body = new THREE.Mesh(new THREE.BoxGeometry(16, 20, 20), phantomMat);
                                body.position.set(0, headY, 0);
                                phantomGroup.add(body);
                                const bodyWire = new THREE.Mesh(new THREE.BoxGeometry(16.5, 20.5, 20.5), wireframeMat);
                                bodyWire.position.copy(body.position);
                                phantomGroup.add(bodyWire);
                                const tube = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 15, 10), phantomMat);
                                tube.rotation.x = Math.PI / 2;
                                tube.position.set(0, headY, 10);
                                phantomGroup.add(tube);
                                const lens = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 1, 10), wireframeMat);
                                lens.rotation.x = Math.PI / 2;
                                lens.position.set(0, headY, 17.5);
                                phantomGroup.add(lens);
                                phantomGroup.position.copy(window.theodoliteObj.position);
                                phantomGroup.scale.copy(window.theodoliteObj.scale);
                                phantomGroup.rotation.y = window.theodoliteRotY;
                                window.theoPhantom = phantomGroup;
                                scene.add(window.theoPhantom);
                                
                                // === СТРЕЛКА НАПРАВЛЕНИЯ ===
                                const arrowGroup = new THREE.Group();
                                const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, depthTest: false, transparent: true });
                                // Тело стрелки: на полу, вдоль оси Z. 
                                const shaft = new THREE.Mesh(
                                    new THREE.BoxGeometry(4, 1, 40), arrowMat
                                );
                                shaft.position.set(0, 0, 20); // Центр тела на z=20, так как общая длина 40
                                arrowGroup.add(shaft);
                                // Наконечник стрелки
                                const headMesh = new THREE.Mesh(
                                    new THREE.ConeGeometry(10, 20, 32), arrowMat
                                );
                                headMesh.rotation.x = Math.PI / 2; // Смотрит в сторону +Z
                                headMesh.position.set(0, 0, 50); // Наконечник ставим в конец тела (40 + половина высоты конуса = 50)
                                arrowGroup.add(headMesh);
                                arrowGroup.visible = false;
                                window._theoArrow = arrowGroup;
                                scene.add(arrowGroup);
                            }
                        }
                        return;
                    }
                }
            }

            // Взять пульт
            if (e.button === 0 && (typeof dragging === 'undefined' || !dragging)) {
                if (hoveredRemote) {
                    window.equipRemote(hoveredRemote.userData.remoteType);
                    if (typeof _clearRemoteHighlight === 'function') _clearRemoteHighlight();
                    hoveredRemote = null;
                }
            }
        });

        window.addEventListener('mouseup', e => {
            if (!window.activeRemote) return;
            let mesh = null;
            if (window.activeRemote === 'crane') mesh = window.craneRemoteMesh;
            else if (window.activeRemote === 'crane2') mesh = window.craneRemote2Mesh;
            else if (window.activeRemote === 'cart') mesh = window.cartRemoteMesh;
            let bIdx = e.button === 0 ? 0 : (e.button === 2 ? 1 : -1);
            if (bIdx >= 0 && mesh && mesh.userData.buttons && mesh.userData.buttons[bIdx]) {
                mesh.userData.buttons[bIdx].position.z = mesh.userData.buttons[bIdx].userData.baseZ;
            }
            if (e.button === 0) window.remoteInput.fwd = false;
            if (e.button === 2) window.remoteInput.back = false;
        });

        window.cartSpeedMultiplier = 1.0;

        window.addEventListener('wheel', e => {
            if (window.theodoliteState === 'drag') {
                if (e.shiftKey) {
                    // Shift + колёсико — смещение по Y (старое поведение)
                    const offset = e.deltaY > 0 ? -2 : 2;
                    window.theodoliteYOffset = (window.theodoliteYOffset || 0) + offset;
                } else {
                    // Простое колёсико — вращение лазера по вертикальной оси
                    const step = Math.PI / 12; // 15 градусов за щелчок
                    window.theodoliteRotY = (window.theodoliteRotY || 0) + (e.deltaY > 0 ? step : -step);
                    if (window.theoPhantom) {
                        window.theoPhantom.rotation.y = window.theodoliteRotY;
                    }
                    if (window._theoArrow) {
                        window._theoArrow.rotation.y = window.theodoliteRotY || 0;
                    }
                }
                return;
            }
            if (window.theodoliteState === 'view') {
                let zoomFOV = window.theodoliteZoom || 45;
                if (e.deltaY > 0) zoomFOV += 5; // отдаление
                else zoomFOV -= 5; // приближение
                window.theodoliteZoom = Math.max(5, Math.min(75, zoomFOV));
                return;
            }

            if (!window.activeRemote) return;
            if (window.activeRemote === 'crane' || window.activeRemote === 'crane2') {
                window.remoteInput.wheel = e.deltaY;
                const mesh = window.activeRemote === 'crane' ? window.craneRemoteMesh : window.craneRemote2Mesh;
                const bIdx = e.deltaY < 0 ? 2 : 3;
                if (mesh && mesh.userData.buttons && mesh.userData.buttons[bIdx]) {
                    mesh.userData.buttons[bIdx].position.z = mesh.userData.buttons[bIdx].userData.baseZ - 0.4;
                    clearTimeout(window._remoteBtnTO);
                    window._remoteBtnTO = setTimeout(() => {
                        if (mesh && mesh.userData.buttons) {
                            if (mesh.userData.buttons[2]) mesh.userData.buttons[2].position.z = mesh.userData.buttons[2].userData.baseZ;
                            if (mesh.userData.buttons[3]) mesh.userData.buttons[3].position.z = mesh.userData.buttons[3].userData.baseZ;
                        }
                    }, 120);
                }
                
                clearTimeout(window._remoteWheelTO);
                window._remoteWheelTO = setTimeout(() => { window.remoteInput.wheel = 0; }, 100);
            } else if (window.activeRemote === 'cart') {
                if (e.deltaY < 0) {
                    window.cartSpeedMultiplier = Math.min(1.6, window.cartSpeedMultiplier + 0.1);
                } else {
                    window.cartSpeedMultiplier = Math.max(0.1, window.cartSpeedMultiplier - 0.1);
                }
                
                if (window.cartRemoteMesh && window.cartRemoteMesh.userData.knob) {
                    const angle = ((window.cartSpeedMultiplier - 0.1) / 1.5) * Math.PI - (Math.PI / 2);
                    window.cartRemoteMesh.userData.knob.rotation.y = angle;
                }
            }
        });

        window.addEventListener('keydown', e => {
            if (typeof cameraMode === 'undefined' || cameraMode !== 'FPS' || !controls.isLocked) return;
            if (e.code === 'Escape' || e.code === 'KeyF') {
                if (window.activeRemote) window.dropRemote();
            }
            if (!window.activeRemote) return;
            if (e.code === 'KeyQ') {
                window.remoteInput.up = true;
                const mesh = window.activeRemote === 'crane' ? window.craneRemoteMesh : window.craneRemote2Mesh;
                if (mesh && mesh.userData.buttons && mesh.userData.buttons[4]) {
                    mesh.userData.buttons[4].position.z = mesh.userData.buttons[4].userData.baseZ - 0.4;
                }
            }
            if (e.code === 'KeyE') {
                window.remoteInput.down = true;
                const mesh = window.activeRemote === 'crane' ? window.craneRemoteMesh : window.craneRemote2Mesh;
                if (mesh && mesh.userData.buttons && mesh.userData.buttons[5]) {
                    mesh.userData.buttons[5].position.z = mesh.userData.buttons[5].userData.baseZ - 0.4;
                }
            }
        });

        window.addEventListener('keyup', e => {
            if (!window.activeRemote) return;
            if (e.code === 'KeyQ') {
                window.remoteInput.up = false;
                const mesh = window.activeRemote === 'crane' ? window.craneRemoteMesh : window.craneRemote2Mesh;
                if (mesh && mesh.userData.buttons && mesh.userData.buttons[4]) {
                    mesh.userData.buttons[4].position.z = mesh.userData.buttons[4].userData.baseZ;
                }
            }
            if (e.code === 'KeyE') {
                window.remoteInput.down = false;
                const mesh = window.activeRemote === 'crane' ? window.craneRemoteMesh : window.craneRemote2Mesh;
                if (mesh && mesh.userData.buttons && mesh.userData.buttons[5]) {
                    mesh.userData.buttons[5].position.z = mesh.userData.buttons[5].userData.baseZ;
                }
            }
        });

        window.addEventListener('contextmenu', e => {
            if (window.activeRemote) e.preventDefault();
        });