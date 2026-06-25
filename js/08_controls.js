// --- Controls & Logic State ---
        // --- Фикс ошибки браузера: Uncaught (in promise) SecurityError при частом захвате курсора ---
        const originalRequestPointerLock = document.body.requestPointerLock;
        document.body.requestPointerLock = function(options) {
            const promise = originalRequestPointerLock.call(this, options);
            if (promise && promise.catch) {
                promise.catch(err => {
                    console.warn("Захват курсора отложен браузером:", err.message);
                });
            }
            return promise;
        };

        const controls = new PointerLockControls(camera, document.body);
        scene.add(controls.getObject()); // ← ОБЯЗАТЕЛЬНО: камера в сцене → camera.add(holder) работает
        const orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.enabled = false;
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.screenSpacePanning = true;
        orbitControls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below floor

        const instructions = document.getElementById('instructions');
        const uiCorner = document.getElementById('ui-corner');
        const identitySpan = document.getElementById('current-identity');
        const crosshair = document.getElementById('crosshair');

        // State Machine
        let cameraMode = 'FPS'; // 'FPS', 'GOD', 'TRANSITION'
        let currentIdentity = null; // null = Supervisor, or worker object
        let isMapOpen = false;

        // Transition Variables
        const transition = {
            active: false,
            startTime: 0,
            duration: 1000,
            startPos: new THREE.Vector3(),
            endPos: new THREE.Vector3(),
            startLook: new THREE.Vector3(),
            endLook: new THREE.Vector3(),
            onComplete: null
        };

        // --- Сохранение расстановки работников (KeyL в режиме GOD) ---
        function handleSaveWorkers() {
            if (cameraMode !== 'GOD') return;
            const data = (typeof workers !== 'undefined' ? workers : []).map(w => ({
                name: w.name,
                type: w.type,
                position: {
                    x: Math.round(w.mesh.position.x),
                    y: Math.round(w.mesh.position.y),
                    z: Math.round(w.mesh.position.z)
                }
            }));
            const output = document.getElementById('worker-data-output');
            if (output) output.value = JSON.stringify(data, null, 2);
            const modal = document.getElementById('data-modal');
            if (modal) modal.style.display = 'block';
        }

        // Event Listeners
        let lastUnlockTime = 0;

        instructions.addEventListener('click', () => {
            if (cameraMode === 'FPS') {
                if (performance.now() - lastUnlockTime > 1250) {
                    controls.lock();
                } else {
                    const p = instructions.querySelector('p');
                    if (p) {
                        p.innerText = "Подождите секунду...";
                        setTimeout(() => p.innerText = "Кликните, чтобы начать", 1000);
                    }
                }
            }
        });
        
        controls.addEventListener('lock', () => {
            if (cameraMode === 'FPS') {
                instructions.classList.add('fade-out');
                crosshair.style.display = 'block';
            }
        });
        
        controls.addEventListener('unlock', () => {
            lastUnlockTime = performance.now();
            const reading = (typeof isReadingBook !== 'undefined' && isReadingBook);
            if (cameraMode === 'FPS' && !reading && document.getElementById('data-modal').style.display !== 'block') {
                instructions.classList.remove('fade-out');
            }
        });

        const keyState = {};
        document.addEventListener('keydown', (e) => {
    keyState[e.code] = true;

    // Закрыть оверлей чтения книги / выйти из режима архива по ESC
    if (e.code === 'Escape') {
        if (typeof isReadingBook !== 'undefined' && isReadingBook) { closeBookReader(); return; }
        if (typeof cameraMode !== 'undefined' && cameraMode === 'ARCHIVE') { exitArchiveView(); return; }
        if (typeof cameraMode !== 'undefined' && cameraMode === 'CABINET' && typeof exitCabinetView !== 'undefined') { exitCabinetView(); return; }
        if (window.theodoliteState === 'drag' && window.theoPhantom) {
            scene.remove(window.theoPhantom);
            window.theoPhantom = null;
            window.theodoliteState = 'idle';
            window.theodoliteObj.visible = true;
            return;
        }
    }
    // Во время чтения книги или режима архива игровые хоткеи отключены
    if (typeof isReadingBook !== 'undefined' && isReadingBook) return;
    if (typeof cameraMode !== 'undefined' && cameraMode === 'ARCHIVE') return;
    if (typeof cameraMode !== 'undefined' && cameraMode === 'CABINET') return;

    if(e.code === 'KeyL') handleSaveWorkers();
    if(e.code === 'KeyT') toggleGodMode();

    if(e.code === 'KeyQ') {
        const actor = (typeof currentIdentity !== 'undefined' && currentIdentity) ? currentIdentity : (typeof supervisorMesh !== 'undefined' ? supervisorMesh : null);
        if (actor && actor.userData && actor.userData.remotesInventory && actor.userData.remotesInventory.length > 0) {
            actor.userData.activeRemoteIdx = (actor.userData.activeRemoteIdx + 1) % actor.userData.remotesInventory.length;
            if (typeof window.applyActiveRemote === 'function') window.applyActiveRemote();
        }
    }

    // ===== WELDING KEYS (only in FPS as Сборщик-Сварщик) =====
    // Примечание: controls.isLocked не требуется — клавиши должны работать
    const isWelder = cameraMode === 'FPS' &&
                     currentIdentity && currentIdentity.name === 'Сборщик-Сварщик';

    if (isWelder && e.code === 'Digit1') {
        if (!window.hasWelder) return;
        if (!weldingTorch) createWeldingTool();
        setTool(activeTool === TOOL_WELDER ? TOOL_NONE : TOOL_WELDER);
    }

    if (isWelder && e.code === 'Digit0') {
        setTool(TOOL_NONE);
    }

    if (isWelder && e.code === 'KeyM') {
        isMaskEquipped = !isMaskEquipped;
        const overlay = document.getElementById('maskOverlay');
        if (isMaskEquipped) {
            overlay.classList.add('show');
            isGlassDown = false;
            document.getElementById('weldGlass').style.opacity = '0';
            document.getElementById('glassState').textContent = 'ВЫКЛ';
            document.getElementById('glassState').style.color = '#00ff00';
        } else {
            overlay.classList.remove('show');
            isGlassDown = false;
            isWeldingNow = false;
            if (weldLight) weldLight.intensity = 0;
            if (isWeldCamActive) {
                isWeldCamActive = false;
                document.getElementById('weldCamContainer').style.display = 'none';
            }
        }
    }

    if (isWelder && e.code === 'KeyH' && activeTool === TOOL_WELDER && isMaskEquipped) {
        isWeldCamActive = !isWeldCamActive;
        document.getElementById('weldCamContainer').style.display = isWeldCamActive ? 'block' : 'none';
    }

    if (isWelder && e.code === 'KeyR' && activeTool === TOOL_WELDER && electrodeMesh) {
        if (window.playerElectrodes && window.playerElectrodes.count > 0) {
            window.playerElectrodes.count--;
            electrodeMesh.scale.y = 1.0;
            if (weldingTorch && weldingTorch.userData.moltenDrop) weldingTorch.userData.moltenDrop.visible = false;
            const ci = document.getElementById('cutInfo');
            if (ci) { ci.style.display = 'none'; }
            if (typeof renderInventories === 'function') renderInventories();
        } else {
            const ci = document.getElementById('cutInfo');
            if (ci) { ci.style.display = 'block'; ci.textContent = 'ПУСТО! ВОЗЬМИТЕ ЭЛЕКТРОДЫ В ШКАФУ'; ci.style.color = '#ef4444'; }
        }
    }

    // ===== ЧТЕНИЕ КНИГИ ИЗ ИНВЕНТАРЯ (цифра слота 2..4) =====
    if (cameraMode === 'FPS' && typeof bookInventory !== 'undefined' && /^Digit[0-9]$/.test(e.code)) {
        const slot = parseInt(e.code.slice(5), 10);
        if (bookInventory[slot] && typeof openBookReader === 'function') {
            openBookReader(bookInventory[slot]);
            return;
        }
    }

    if (e.code === 'KeyZ') {
        isZooming = true;
        const zi = document.getElementById('zoomIndicator');
        if (zi) zi.style.display = 'block';
    }
});
        document.addEventListener('keyup', (e) => {
            keyState[e.code] = false;
            if (e.code === 'KeyZ') {
                isZooming = false;
                const zi = document.getElementById('zoomIndicator');
                if (zi) zi.style.display = 'none';
            }
        });
        
        // Raycasting for God Mode Interaction
        const mouse = new THREE.Vector2();
        
        document.addEventListener('mousedown', (event) => {
            if (cameraMode === 'FPS' && controls.isLocked && currentIdentity && currentIdentity.name === 'Сборщик-Сварщик' && event.button === 0 && !dragging) {
                // ── ПЛАЗМОРЕЗ активен: не трогаем шкаф ──
                if (window.PlasmaC && window.PlasmaC.isActive) return;

                // === ШКАФ С ЭЛЕКТРОДАМИ ===
                if (typeof electrodeCabinets !== 'undefined') {
                    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                    const cabHits = raycaster.intersectObjects(electrodeCabinets, true);
                    if (cabHits.length > 0 && cabHits[0].distance < 350) {
                        let obj = cabHits[0].object;
                        // Надежный поиск: поднимаемся по иерархии, пока не найдем корневую группу шкафа
                        while (obj && !electrodeCabinets.includes(obj)) obj = obj.parent;
                        if (obj && typeof enterCabinetView === 'function') {
                            enterCabinetView(obj);
                            return;
                        }
                    }
                }
            }

            if (cameraMode !== 'GOD') return;
            if (event.button !== 0) return; // Only Left Click
            
            // Normalize mouse
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            
            // Intersect with worker meshes
            const targets = [];
            workers.forEach(w => targets.push(w.mesh));
            if (supervisorMesh) targets.push(supervisorMesh);
            
            const intersects = raycaster.intersectObjects(targets, true); // Recursive check children
            
            if (intersects.length > 0) {
                // Find root object
                let obj = intersects[0].object;
                while(obj.parent && obj.parent !== scene) {
                    obj = obj.parent;
                }
                
                // Check if it is supervisor or worker
                if (obj.userData.isSupervisor) {
                    possess('supervisor');
                } else if (obj.userData.worker) {
                    possess(obj.userData.worker);
                }
            }
        });