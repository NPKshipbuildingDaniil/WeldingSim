// ⚡ СВАРОЧНЫЙ АППАРАТ РДС (модель из источника)
        // Масштаб: исходные единицы × 11 → цех-сантиметры
        // Размер: ~41 × 65 × 79 см
        // Размещается НА БОКОВОЙ ПОЛКЕ сварочного стола
        // =====================================================

        // Общие материалы — создаём один раз, переиспользуем
        const _wm_matOrange = new THREE.MeshStandardMaterial({ color: 0x3355CC, metalness: 0.2, roughness: 0.5 });
        const _wm_matGrey   = new THREE.MeshStandardMaterial({ color: 0xE8ECF1, metalness: 0.3, roughness: 0.4 });
        const _wm_matDark   = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, metalness: 0.5, roughness: 0.6 });
        const _wm_matScreen = new THREE.MeshStandardMaterial({ color: 0x1a2838, emissive: new THREE.Color(0x002244), emissiveIntensity: 0.6 });
        const _wm_matCable  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        // Реестр всех сварочных аппаратов с интерактивной панелью (ток/напряжение прямо на 3D-модели)
        const welderMachines = [];

        // Экран-монитор на лицевой панели: рисуется через CanvasTexture, обновляется при смене значения
        function _wm_makeScreen(label, unit) {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            const mat = new THREE.MeshBasicMaterial({ map: tex });
            function draw(value, color) {
            ctx.fillStyle = '#A8AEB8'; ctx.fillRect(0, 0, 256, 128);
            ctx.fillStyle = '#FFFFFF'; ctx.fillRect(7, 7, 242, 114);
            ctx.textAlign = 'left'; ctx.font = 'bold 24px monospace'; ctx.fillStyle = '#7D8A9A';
                ctx.fillText(label, 16, 36);
                ctx.textAlign = 'right'; ctx.font = 'bold 70px "Courier New",monospace';
            ctx.fillStyle = color || '#3355CC';
                ctx.fillText(String(value), 198, 104);
            ctx.font = 'bold 30px monospace'; ctx.fillStyle = '#7D8A9A';
                ctx.fillText(unit, 246, 104);
                tex.needsUpdate = true;
            }
        draw('--', '#3355CC');
            return { mat, draw };
        }

        // Строит интерактивные органы управления на лицевой панели аппарата.
        // 2 экрана + 2 ползунка (управление колесом по наведению).
        function _wm_buildControlPanel(group) {
            const ui = { current: {}, voltage: {} };
            const Zf = 28.3;                                   // фронтальная плоскость панели, см (чуть выступает)
            const colX = { current: -8.5, voltage: 8.5 };       // центры колонок
        const bezelMat = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.6, metalness: 0.3 });
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.7, metalness: 0.4 });

            ['current', 'voltage'].forEach(param => {
                const cx = colX[param];
                const isCur = param === 'current';

                // --- Экран (монитор) ---
                const bez = new THREE.Mesh(new THREE.BoxGeometry(15.5, 9.5, 1.4), bezelMat);
                bez.position.set(cx, 9.5, Zf + 0.2); bez.userData.isWelderMachine = true; group.add(bez);
                const scr = _wm_makeScreen(isCur ? 'ТОК' : 'НАПР.', isCur ? 'A' : 'V');
                const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 7.8), scr.mat);
                scrMesh.position.set(cx, 9.5, Zf + 1.05); scrMesh.userData.isWelderMachine = true; group.add(scrMesh);

                // --- Ползунок: дорожка + бегунок ---
                const span = 11.0;
                const track = new THREE.Mesh(new THREE.BoxGeometry(span + 4.5, 1.8, 1.2), trackMat);
                track.position.set(cx, 1.0, Zf + 0.4);
                track.userData.isWelderMachine = true;
                track.userData.welderControl = param;
                group.add(track);

                const handleMat = new THREE.MeshStandardMaterial({
                    color: isCur ? 0xffa033 : 0x33b5ff, roughness: 0.35, metalness: 0.5,
                    emissive: new THREE.Color(isCur ? 0x4d2600 : 0x003a4d), emissiveIntensity: 0.45
                });
                const handle = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.0, 2.8), handleMat);
                handle.position.set(cx, 1.0, Zf + 1.3);
                handle.userData.isWelderMachine = true;
                handle.userData.welderControl = param;
                group.add(handle);

                ui[param] = { draw: scr.draw, handle, cx, span };
            });

            group.userData.welderUI = ui;
            welderMachines.push(group);
        }

        function createWeldingMachine(worldX, worldY, worldZ) {
            const s = 9; // source-units → цех cm  (чуть меньше: ~34×53×65см)
            const group = new THREE.Group();
            group.userData.isWelderMachineGroup = true;

            // Все части помечаем как кликабельные
            function addPart(geo, mat, px, py, pz, rx, ry, rz) {
                const m = new THREE.Mesh(geo, mat);
                m.position.set(px * s, py * s, pz * s);
                if (rx !== undefined) m.rotation.set(rx, ry || 0, rz || 0);
                m.userData.isWelderMachine = true;
                group.add(m);
                return m;
            }

            // Корпус (Параллелепипед_2)
            addPart(new THREE.BoxGeometry(3.7729*s, 3.9894*s, 6.7187*s), _wm_matOrange,
                0, -0.9455, -0.6407);

            // Лицевая панель (Параллелепипед_3)
            addPart(new THREE.BoxGeometry(3.7729*s, 4.8132*s, 0.39*s), _wm_matOrange,
                0, -0.5337, 2.9137);

            // Верхняя серая полоса (Параллелепипед_4)
            addPart(new THREE.BoxGeometry(3.7729*s, 0.3095*s, 1.2813*s), _wm_matGrey,
                0, 2.0277, 3.3593);

            // (Старый декоративный дисплей и два регулятора убраны —
            //  их заменяет интерактивная панель _wm_buildControlPanel: 2 экрана + 2 ползунка)

            // Гнездо кабеля A — фланец (Цилиндр_8)
            addPart(new THREE.CylinderGeometry(0.3258*s, 0.3258*s, 0.1393*s, 14), _wm_matDark,
                -0.972, -1.4896, 3.1784, 1.5688, 0.0163, 0.0163);

            // Гнездо кабеля A — штырь (Цилиндр_9)
            addPart(new THREE.CylinderGeometry(0.1947*s, 0.1947*s, 0.4223*s, 14), _wm_matDark,
                -0.9822, -1.4891, 3.4592, 1.5708, 0, 0);

            // Ручка — вертикальная стойка (Параллелепипед_14)
            addPart(new THREE.BoxGeometry(0.3604*s, 1.7026*s, 0.2169*s), _wm_matGrey,
                0, 2.0889, 1.3002);

            // Ручка — горизонтальный хват (Параллелепипед_15)
            addPart(new THREE.BoxGeometry(0.3604*s, 0.2114*s, 2.4703*s), _wm_matGrey,
                0, 2.8346, -0.0434);

            // Наклонные поверхности крышки (surface 17, 18, 19)
            const triDefs = [
                [1.8865,1.8729,2.7187, 1.8865,1.0543,2.7187, 1.8827,1.0527,-3.9902],
                [-1.8865,1.0543,-4, -1.8865,1.8729,2.7187, -1.8865,1.0541,2.7213],
                [-1.8865,1.0543,-4, -1.8865,1.8729,2.7187, 1.8865,1.8729,2.7187,
                 -1.8865,1.0543,-4,  1.8865,1.8729,2.7187, 1.8813,1.0527,-4]
            ];
            triDefs.forEach(raw => {
                const v = new Float32Array(raw.map(n => n * s));
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.BufferAttribute(v, 3));
                g.computeVertexNormals();
                const m = new THREE.Mesh(g, _wm_matOrange);
                m.userData.isWelderMachine = true;
                group.add(m);
            });

            // Интерактивная панель управления (ток/напряжение прямо на 3D-модели)
            _wm_buildControlPanel(group);

            group.position.set(worldX, worldY, worldZ);
            scene.add(group);
            return group;
        }

        // Боковая полка стола: sX=1.137m*120=136.44см от центра стола по +X
        // Поверхность полки Y = (0.675+0.005/2)*120 = 81.3см
        // Низ машины в исходнике: -2.9402 ед * 9 = -26.46см от центра группы
        // → group.position.y = 81.3 + 26.46 = 107.76 ≈ 108
        createWeldingMachine(1600 + 136, 108, 1200);  // Стол 1
        createWeldingMachine(2000 + 136, 108, 1200);  // Стол 2

        // Helper for Visual Feedback (Ring)
        // Строит геометрию маркера = ТРЕУГОЛЬНИКИ нижней грани детали,
        // спроецированные на плоскость опоры (Y = surfaceY).
        // Это даёт точную форму поверхности (L, круг, контур), а не bbox-прямоугольник.
        function buildBottomFaceMarkerGeometry(mesh, faceNormalLocal, surfaceY) {
            const geo = mesh.geometry;
            if (!geo) return null;
            const ng = geo.index ? geo.toNonIndexed() : geo;
            const pos = ng.attributes.position;
            if (!pos || pos.count === 0) return null;

            const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
            const cb = new THREE.Vector3(), ab = new THREE.Vector3(), n = new THREE.Vector3();
            mesh.updateMatrixWorld(true);
            const m = mesh.matrixWorld;
            const out = [];
            const target = faceNormalLocal.clone().normalize();

            for (let i = 0; i < pos.count; i += 3) {
                pA.fromBufferAttribute(pos, i);
                pB.fromBufferAttribute(pos, i + 1);
                pC.fromBufferAttribute(pos, i + 2);
                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                n.crossVectors(cb, ab);
                if (n.length() < 1e-8) continue;
                n.normalize();
                if (n.dot(target) < 0.95) continue;
                const wA = pA.clone().applyMatrix4(m);
                const wB = pB.clone().applyMatrix4(m);
                const wC = pC.clone().applyMatrix4(m);
                out.push(wA.x, surfaceY, wA.z, wB.x, surfaceY, wB.z, wC.x, surfaceY, wC.z);
            }

            if (out.length === 0) return null;
            const newGeo = new THREE.BufferGeometry();
            newGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
            return newGeo;
        }

        // ТЗ п.5: проекционный круг-индикатор сборки под зажатой деталью.
        // mesh — деталь, surfaceY — мировая Y поверхности опоры (стол/пол).
        // inContact — true, если деталь касается другой детали (коллизия):
        //   false → СИНИЙ круг (захват), true → ЖЁЛТЫЙ круг (возможна стыковка).
        const _markerBox = new THREE.Box3();
        const _markerSize = new THREE.Vector3();
        const _markerCenter = new THREE.Vector3();
        function updateSupportMarkerForMesh(mesh, surfaceY, inContact = false) {
            mesh.updateMatrixWorld(true);
            _markerBox.setFromObject(mesh);
            if (!isFinite(_markerBox.min.x)) {
                supportMarker.visible = false;
                return;
            }
            _markerBox.getSize(_markerSize);
            _markerBox.getCenter(_markerCenter);

            const outerR = Math.max(0.5 * Math.max(_markerSize.x, _markerSize.z) * 1.05, 0.8);
            supportMarker.scale.set(outerR, outerR, 1);
            supportMarker.rotation.set(-Math.PI / 2, 0, 0);
            supportMarker.position.set(_markerCenter.x, surfaceY + 0.06, _markerCenter.z);
            supportMarker.material.color.setHex(inContact ? MARKER_COLOR_CONTACT : MARKER_COLOR_GRAB);
            supportMarker.material.opacity = inContact ? 0.65 : 0.5;
            supportMarker.visible = true;
        }

        function updateSupportMarker(mode, x, y, z, footprint = 100, sizeX = null, sizeZ = null) {
            const outerR = Math.max(
                0.5 * Math.max(sizeX != null ? sizeX : footprint, sizeZ != null ? sizeZ : footprint) * 1.05,
                0.8
            );
            supportMarker.scale.set(outerR, outerR, 1);
            supportMarker.position.set(x, y + 0.06, z);
            supportMarker.rotation.set(-Math.PI / 2, 0, 0);
            supportMarker.material.color.setHex(MARKER_COLOR_GRAB);
            supportMarker.material.opacity = 0.5;
            supportMarker.visible = true;
        }

        // =====================================================
        // 🗄️ ШКАФ С ЭЛЕКТРОДАМИ
        // =====================================================
        const electrodeCabinets = [];
        window.playerElectrodes = { diam: null, count: 0 };
        const ELECTRODE_DB = {
            '2.5': { max: 4, current: 4 },
            '3.0': { max: 4, current: 4 },
            '4.0': { max: 4, current: 4 },
            '5.0': { max: 4, current: 4 },
            '6.0': { max: 4, current: 4 }
        };

        function createElectrodeCabinet(x, z, rotY) {
            const grp = new THREE.Group();
            grp.position.set(x, 0, z);
            grp.rotation.y = rotY;

            const matBody = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.6, metalness: 0.4 });
            const W = 80, H = 200, D = 40;
            
            const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 2), matBody);
            back.position.set(0, H/2, -D/2 + 1); grp.add(back);
            
            const left = new THREE.Mesh(new THREE.BoxGeometry(2, H, D), matBody);
            left.position.set(-W/2 + 1, H/2, 0); grp.add(left);
            
            const right = new THREE.Mesh(new THREE.BoxGeometry(2, H, D), matBody);
            right.position.set(W/2 - 1, H/2, 0); grp.add(right);
            
            const top = new THREE.Mesh(new THREE.BoxGeometry(W, 2, D), matBody);
            top.position.set(0, H - 1, 0); grp.add(top);

            const bot = new THREE.Mesh(new THREE.BoxGeometry(W, 2, D), matBody);
            bot.position.set(0, 1, 0); grp.add(bot);

            grp.userData.packs = [];
            const packGeo = new THREE.BoxGeometry(10, 4, 25); // Размер пачки электродов
            // Разные цвета для разных диаметров
            const colors = { '2.5': 0x3b82f6, '3.0': 0x22c55e, '4.0': 0xef4444, '5.0': 0xeab308, '6.0': 0xa855f7 };
            const diams = Object.keys(ELECTRODE_DB);

            for (let i = 1; i <= 5; i++) {
                const shelf = new THREE.Mesh(new THREE.BoxGeometry(W-4, 2, D-2), matBody);
                shelf.position.set(0, i * 32, 0);
                grp.add(shelf);

                const diam = diams[i-1];
                const count = ELECTRODE_DB[diam].max;

                // Бирка на полке
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1e293b'; ctx.fillRect(0,0,256,64);
                ctx.fillStyle = '#fff'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`Ø ${diam} мм`, 128, 34);
                const labelMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
                const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), labelMat);
                labelMesh.position.set(0, i * 32 + 1.1, D/2 - 0.9);
                grp.add(labelMesh);

                // 3D Пачки на полке
                for(let j=0; j<count; j++) {
                    const packMat = new THREE.MeshStandardMaterial({ color: colors[diam], roughness: 0.8 });
                    const pack = new THREE.Mesh(packGeo, packMat);
                    pack.position.set(-W/2 + 16 + j*14, i * 32 + 3, 0);
                    
                    // Декоративная белая полоса-этикетка
                    const band = new THREE.Mesh(new THREE.BoxGeometry(10.2, 4.2, 6), new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.9}));
                    pack.add(band);

                    pack.userData.isPack = true;
                    pack.userData.diam = diam;
                    pack.userData.packIndex = j;
                    grp.add(pack);
                    grp.userData.packs.push(pack);
                }
            }

            const doorGrp = new THREE.Group();
            doorGrp.position.set(-W/2, H/2, D/2); 
            const door = new THREE.Mesh(new THREE.BoxGeometry(W, H, 2), matBody);
            door.position.set(W/2, 0, 1); 
            doorGrp.add(door);
            grp.add(doorGrp);

            grp.userData.isElectrodeCabinet = true;
            grp.userData.door = doorGrp;
            grp.userData.doorTarget = 0; 
            
            const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), rotY);
            grp.userData.viewPos = new THREE.Vector3(x, 140, z).addScaledVector(forward, 110); // Пододвинули камеру ближе к полкам
            grp.userData.lookPos = new THREE.Vector3(x, 100, z); // Смотрим чуть ниже (на полки, а не в потолок)
            
            // Регистрируем шкаф, но исключаем сами пачки (у них своя логика)
            grp.traverse(o => { 
                if (o.isMesh) {
                    let p = o; let isPack = false;
                    while(p) { if(p.userData.isPack) isPack = true; p = p.parent; }
                    if (!isPack) o.userData.isElectrodeCabinet = true;
                }
            });

            scene.add(grp);
            electrodeCabinets.push(grp);
        }
        
        createElectrodeCabinet(1020, 850, Math.PI / 2); // У левой стены (X=1000)
        createElectrodeCabinet(1020, 950, Math.PI / 2); // У левой стены (X=1000)

        // =====================================================