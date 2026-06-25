// Truss Generator
               function createTruss(span, height, material) {
            const group = new THREE.Group();
            const halfSpan = span / 2;
            
            // Толщина балок (масштабировано под вашу сцену)
            const beamThick = 12; 
            const strutThick = 8;

            // ОПТИМИЗАЦИЯ: Полностью отключаем castShadow для ферм.
            // Их геометрия слишком сложная, а находятся они под крышей.
            
            // 1. Нижний пояс (Bottom Chord)
            const bottomChord = new THREE.Mesh(new THREE.BoxGeometry(span, beamThick, beamThick), material);
            bottomChord.position.y = 0; 
            bottomChord.castShadow = false; // OFF
            group.add(bottomChord);

            // 2. Наклонные пояса (Top Chords)
            const slopeLen = Math.sqrt(halfSpan**2 + height**2);
            const angle = Math.atan2(height, halfSpan);

            // Левый
            const leftChord = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, beamThick, beamThick), material);
            leftChord.position.set(-halfSpan/2, height/2, 0);
            leftChord.rotation.z = angle; 
            leftChord.castShadow = false; // OFF
            group.add(leftChord);

            // Правый
            const rightChord = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, beamThick, beamThick), material);
            rightChord.position.set(halfSpan/2, height/2, 0);
            rightChord.rotation.z = -angle; 
            rightChord.castShadow = false; // OFF
            group.add(rightChord);

            // 3. Решетка (Webbing)
            const segments = 6;
            const segWidth = halfSpan / segments;
            
            for (let i = 1; i < segments; i++) {
                const x = i * segWidth;
                const slopeY = (1 - (x / halfSpan)) * height;

                [-1, 1].forEach(side => {
                    // Вертикальная стойка
                    const vH = slopeY;
                    if (vH > 5) { // filter tiny
                        const vert = new THREE.Mesh(new THREE.BoxGeometry(strutThick, vH, strutThick), material);
                        vert.position.set(side * x, slopeY/2, 0);
                                              // ОПТИМИЗАЦИЯ: Отключаем тени для внутренних стоек
                        vert.castShadow = false; 
                        group.add(vert);
                    }
                    
                    // Диагонали (зигзаг)
                    if (i > 1) {
                        const prevX = (i - 1) * segWidth;
                        const prevSlopeY = (1 - (prevX / halfSpan)) * height;
                        const dx = segWidth; 
                        const dy = slopeY - prevSlopeY;
                        const diagLen = Math.sqrt(dx*dx + dy*dy);
                        const diagAngle = Math.atan2(dy, dx);
                        
                        const diag = new THREE.Mesh(new THREE.BoxGeometry(diagLen, strutThick, strutThick), material);
                        diag.position.set(side * (prevX + x) / 2, (slopeY + prevSlopeY) / 2, 0);
                        diag.rotation.z = side * diagAngle;
                        
                        // ОПТИМИЗАЦИЯ: Отключаем тени для диагоналей
                        diag.castShadow = false; 
                        group.add(diag);
                    }

                     // Доп. диагональ вниз (для плотности фермы)
                    if (i < segments) {
                        const nextX = i * segWidth;
                        const nextSlopeY = (1 - (nextX / halfSpan)) * height;
                        const diagToSlopeLen = Math.sqrt(segWidth*segWidth + nextSlopeY*nextSlopeY) * 0.95;
                        const diagToSlopeAngle = Math.atan2(nextSlopeY, segWidth);
                        
                        const diagSlope = new THREE.Mesh(new THREE.BoxGeometry(diagToSlopeLen, strutThick, strutThick), material);
                        diagSlope.position.set(side * (x - segWidth/2), nextSlopeY/2, 0);
                        diagSlope.rotation.z = side * diagToSlopeAngle;
                        
                        // ОПТИМИЗАЦИЯ: Отключаем тени
                        diagSlope.castShadow = false;
                        group.add(diagSlope);
                    }
                });
            }

            // King Post (Центральная стойка)
            const kingPost = new THREE.Mesh(new THREE.BoxGeometry(beamThick, height, beamThick), material);
            kingPost.position.y = height/2; 
            kingPost.castShadow = true; 
            group.add(kingPost);

            // Узлы (Nodes) - коньковый и боковые
            const ridgeNode = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), material);
            ridgeNode.position.y = height; ridgeNode.castShadow = true; group.add(ridgeNode);
            
            [-1, 1].forEach(side => {
                const endNode = new THREE.Mesh(new THREE.BoxGeometry(15, 15, 15), material);
                endNode.position.set(side * halfSpan, 0, 0); endNode.castShadow = true; group.add(endNode);
            });

            return group;
        }

        function createBracket(material) {
            const group = new THREE.Group();
            
            // Основная пластина
            const plate = new THREE.Mesh(new THREE.BoxGeometry(25, 40, 5), material);
            // Оставляем тень только от пластины, это дешевле
            plate.castShadow = true; 
            group.add(plate);
            
            // Рёбра жёсткости (косынки) - ОПТИМИЗАЦИЯ: без теней
            const ribGeo = new THREE.BoxGeometry(12, 3, 15);
            const rib1 = new THREE.Mesh(ribGeo, material);
            rib1.position.set(0, 10, 8); 
            rib1.castShadow = false;
            group.add(rib1);
            
            const rib2 = new THREE.Mesh(ribGeo, material);
            rib2.position.set(0, -10, 8); 
            rib2.castShadow = false;
            group.add(rib2);

            // Болты - ОПТИМИЗАЦИЯ: без теней
            const boltGeo = new THREE.CylinderGeometry(1.5, 1.5, 8, 8);
            const boltPositions = [[-8, 12], [-8, -12], [8, 12], [8, -12]];
            boltPositions.forEach(([x, y]) => {
                const bolt = new THREE.Mesh(boltGeo, material);
                bolt.rotation.x = Math.PI/2;
                bolt.position.set(x, y, 4);
                group.add(bolt);
            });

            return group;
        }

        function createLamp(lightMat, steelMat) {
            const group = new THREE.Group();
            const s = 35; // Scale factor for lamp size relative to reference

            // Кронштейн
            const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 25, 2), steelMat);
            arm.position.y = -12.5; arm.castShadow = true; group.add(arm);
            
            // Корпус
            const housing = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 12, 12), steelMat);
            housing.position.set(0, -25, 0); housing.castShadow = true; group.add(housing);
            
            // Рефлектор (Конус)
            const reflectorGeo = new THREE.ConeGeometry(12, 8, 16, 1, true);
            const refMat = new THREE.MeshStandardMaterial({color: 0xcccccc, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.3});
            const reflector = new THREE.Mesh(reflectorGeo, refMat);
            reflector.position.set(0, -30, 0);
            reflector.rotation.x = Math.PI;
            group.add(reflector);

            // Лампочка
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), lightMat); // Меньше полигонов
            bulb.position.set(0, -28, 0); group.add(bulb);
            
            // ОПТИМИЗАЦИЯ: Убрали PointLight. Расчет сотен источников света убивает FPS.
            // Сцена будет освещена глобальным светом (Ambient + Sun), а лампы просто светятся (emissive).
            
            return group;
        }

        // --- Helpers ---
        function createTextSprite(text, color = 'white', fontSize = 64) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = `bold ${fontSize}px Arial`;
            const width = ctx.measureText(text).width + 40;
            canvas.width = width;
            canvas.height = fontSize + 40;
            
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 4;
            ctx.strokeText(text, canvas.width/2, canvas.height/2);
            ctx.fillText(text, canvas.width/2, canvas.height/2);

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
            const sprite = new THREE.Sprite(material);
            const ratio = canvas.width / canvas.height;
            const h = 50; 
            sprite.scale.set(h * ratio, h, 1);
            return sprite;
        }

        // Texture for Hangar Doors
        function createHazardTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            
            // Yellow background
            ctx.fillStyle = '#E8ECF1'; 
            ctx.fillRect(0,0,256,256);
            
            // Stripes at bottom
            ctx.fillStyle = '#7D8A9A';
            
            const bottomY = 180; 
            
            ctx.beginPath();
            ctx.rect(0, bottomY, 256, 256 - bottomY);
            ctx.clip(); // Clip drawing to bottom area

            ctx.beginPath();
            const stripeWidth = 20;
            const gap = 20;
            for(let i = -256; i < 512; i += stripeWidth + gap) {
                ctx.moveTo(i, bottomY);
                ctx.lineTo(i + stripeWidth, bottomY);
                ctx.lineTo(i - 100 + stripeWidth, 256);
                ctx.lineTo(i - 100, 256);
                ctx.closePath();
            }
            ctx.fill();
            
            return new THREE.CanvasTexture(canvas);
        }

        // Texture for Red Dot (Possessable)
        function createRedDotTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
            ctx.beginPath();
            ctx.arc(32, 32, 28, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'; // Red
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'white';
            ctx.stroke();

            return new THREE.CanvasTexture(canvas);
        }
        
        const hazardTexture = createHazardTexture();
        const hangarMaterial = new THREE.MeshStandardMaterial({ map: hazardTexture });
        
        const redDotTexture = createRedDotTexture();
        const redDotMaterial = new THREE.SpriteMaterial({ map: redDotTexture, depthTest: false, depthWrite: false });

        // --- HIGHLIGHT MATERIALS (Yellow Face) ---
        const faceGlowMat = new THREE.MeshBasicMaterial({
            color: 0xffd400,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthTest: false // Always show on top
        });
        const faceOutlineMat = new THREE.LineBasicMaterial({
            color: 0xffd400,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });

        
        // --- VISUAL AID: ПРОЕКЦИОННЫЙ КОЛЬЦЕВОЙ МАРКЕР СБОРКИ ---
        // Кольцо (не заливка) под центром масс: синий — захват, жёлтый — контакт.
        const MARKER_COLOR_GRAB = 0x3b82f6;
        const MARKER_COLOR_CONTACT = 0xfacc15;
        const supportMarker = new THREE.Mesh(
            new THREE.RingGeometry(0.72, 1.0, 48),
            new THREE.MeshBasicMaterial({
                color: MARKER_COLOR_GRAB,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false
            })
        );
        supportMarker.rotation.x = -Math.PI / 2;
        supportMarker.visible = false;
        supportMarker.userData.isHelper = true;
        supportMarker.userData.isSupportMarker = true;
        scene.add(supportMarker);

        function createGreenDotTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
            ctx.beginPath();
            ctx.arc(32, 32, 28, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(34, 197, 94, 0.9)'; // Green
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'white';
            ctx.stroke();

            return new THREE.CanvasTexture(canvas);
        }
        const greenDotTexture = createGreenDotTexture();
        const greenDotMaterial = new THREE.SpriteMaterial({ map: greenDotTexture, depthTest: false, depthWrite: false });

        // --- Classes ---
        class InteractiveDoor {
            constructor(width, height, thickness, x, z, wallAngle) {
                this.anchor = new THREE.Group();
                this.anchor.position.set(x, 0, z);
                this.anchor.rotation.y = -wallAngle; 
                
                this.hinge = new THREE.Group(); 
                this.anchor.add(this.hinge);
                
                // Solid Industrial Door Style
                // Door Leaf
                this.mesh = new THREE.Group();
                this.mesh.position.set(width/2, height/2, 0);
                
                // Main slab
                const doorGeo = new THREE.BoxGeometry(width, height, thickness);
                const doorMat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.7, metalness: 0.3 }); // Clean Factory Secondary
                const slab = new THREE.Mesh(doorGeo, doorMat);
                slab.castShadow = true; slab.receiveShadow = true;
                this.mesh.add(slab);
                
                // Kickplate
                const kickH = height * 0.25;
                const kickMat = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.9 });
                const kickPlate = new THREE.Mesh(new THREE.BoxGeometry(width + 2, kickH, thickness + 4), kickMat);
                kickPlate.position.y = -height/2 + kickH/2;
                kickPlate.castShadow = true;
                this.mesh.add(kickPlate);

                 // Frame (Исправлено: Делаем раму значительно толще стены, чтобы избежать z-fighting)
                // thickness приходит как половина толщины стены (10), или полная (20). 
                // В вызове ниже передается thickness/2, поэтому умножаем агрессивно.
                const frameThick = thickness * 4; // Рама будет толщиной 40 (при стене 20)
                const frameW = 12; // Ширина наличника
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A }); 

                // Top frame
                const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width + frameW*2, frameW, frameThick), frameMat);
                topFrame.position.set(width/2, height + frameW/2, 0);
                topFrame.castShadow = true; // Добавлена тень рамы
                this.anchor.add(topFrame);
                
                // Side frames
                const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameW, height + frameW, frameThick), frameMat);
                leftFrame.position.set(-frameW/2, height/2 + frameW/2, 0);
                this.anchor.add(leftFrame);
                
                const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameW, height + frameW, frameThick), frameMat);
                rightFrame.position.set(width + frameW/2, height/2 + frameW/2, 0);
                this.anchor.add(rightFrame);

                // Handle - Attached directly to door surface
                const handleGroup = new THREE.Group();
                // Position handle on the surface. thickness/2 is the surface.
                // Fix: Handle should be relative to the center (0,0), so width/2 is the edge.
                handleGroup.position.set(width/2 - 10, 0, thickness/2);
                
                // Base plate
                const plate = new THREE.Mesh(new THREE.BoxGeometry(8, 20, 2), new THREE.MeshStandardMaterial({color: 0xA8AEB8}));
                plate.position.z = 1;
                handleGroup.add(plate);

                // Handle Lever
                const handleGeo = new THREE.CylinderGeometry(1.5, 1.5, 12);
                const handleMat = new THREE.MeshStandardMaterial({color: 0x3355CC, metalness: 0.8});
                const handle = new THREE.Mesh(handleGeo, handleMat);
                handle.rotation.z = Math.PI / 2;
                handle.position.set(-5, 0, 4); 
                handleGroup.add(handle);
                
                // Stem
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4), handleMat);
                stem.rotation.x = Math.PI / 2;
                stem.position.set(0, 0, 2);
                handleGroup.add(stem);

                this.mesh.add(handleGroup);
                
                this.hinge.add(this.mesh);
                scene.add(this.anchor);
                
                this.width = width;
                this.angle = 0;
            }
            
            update(playerPos) {
                const worldHingePos = new THREE.Vector3();
                this.hinge.getWorldPosition(worldHingePos);
                
                const dx = playerPos.x - worldHingePos.x;
                const dz = playerPos.z - worldHingePos.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                
                // Door opening logic
                // Door opening logic
                // Уменьшаем радиус реагирования на 60% (умножаем на 0.4)
                const activationDist = (this.width + 100) * 0.4;

                if (dist < activationDist) { 
                    // Open to fixed 90 degrees
                    let target = 1.6; // 90 deg roughly
                    this.angle = THREE.MathUtils.lerp(this.angle, target, 0.1);
                } else {
                    this.angle = THREE.MathUtils.lerp(this.angle, 0, 0.05);
                }
                this.hinge.rotation.y = -this.angle; 
            }

            getCollisionBox() {
                // Disable collision if opening
                if (Math.abs(this.angle) > 0.1) return [];

                const p = new THREE.Vector3();
                this.mesh.getWorldPosition(p);
                const r = this.hinge.rotation.y + this.anchor.rotation.y;
                return { type: 'door', x: p.x, z: p.z, angle: r, width: this.width, thickness: 10 };
            }
        }

        class HangarGate {
            constructor(width, height, thickness, x, z, wallAngle) {
                this.group = new THREE.Group();
                this.group.position.set(x, 0, z);
                this.group.rotation.y = -wallAngle;
                scene.add(this.group);

                this.width = width;
                this.slideOffset = 0;
                
                // Убедимся, что материал двусторонний
                hangarMaterial.side = THREE.DoubleSide;

                // --- РАМА (Frame) ---
                // Очень широкая рама, чтобы перекрыть все щели
                const frameW = 20; 
                const frameThick = thickness * 3;
                const frameMat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.9,
                    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

                const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width + frameW*2, frameW, frameThick), frameMat);
                topFrame.position.set(0, height + frameW/2, 0);
                this.group.add(topFrame);

                const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameW, height + frameW, frameThick), frameMat);
                leftFrame.position.set(-width/2 - frameW/2, height/2 + frameW/2, 0);
                this.group.add(leftFrame);

                const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameW, height + frameW, frameThick), frameMat);
                rightFrame.position.set(width/2 + frameW/2, height/2 + frameW/2, 0);
                this.group.add(rightFrame);
                // --------------------

                // ПАНЕЛИ
                const panelWidth = width / 2;
                const geo = new THREE.BoxGeometry(panelWidth, height, thickness);
                
                // Left Panel
                this.leftPanel = new THREE.Mesh(geo, hangarMaterial);
                // Начальная позиция: центр левой половины (-width/4)
                this.leftPanel.position.set(-width/4, height/2, 0);
                this.group.add(this.leftPanel);
                
                // Right Panel
                this.rightPanel = new THREE.Mesh(geo, hangarMaterial);
                // Начальная позиция: центр правой половины (width/4)
                this.rightPanel.position.set(width/4, height/2, 0);
                this.group.add(this.rightPanel);
                // Pockets (Thick walls on sides)
                const pocketDepth = width / 2; // Length of pocket
                const pocketThick = thickness * 4; // Thickness of pocket
                const gap = thickness * 1.5; // Gap inside pocket
                
                const pocketGeo = new THREE.BoxGeometry(pocketDepth, height, (pocketThick - gap)/2);
                const pocketMat = new THREE.MeshStandardMaterial({ color: 0xA8AEB8,
                    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
                
                // Construct 4 parts of pockets: Left Front, Left Back, Right Front, Right Back
                // Left is at x < -width/2. Right is at x > width/2
                
                const createPocketSide = (xStart) => {
                   const cx = xStart;
                   const czFront = gap/2 + (pocketThick-gap)/4;
                   const czBack = -gap/2 - (pocketThick-gap)/4;
                   
                   const m1 = new THREE.Mesh(pocketGeo, pocketMat);
                   m1.position.set(cx, height/2, czFront);
                   this.group.add(m1);
                   
                   const m2 = new THREE.Mesh(pocketGeo, pocketMat);
                   m2.position.set(cx, height/2, czBack);
                   this.group.add(m2);
                   
                   // End cap
                   const capGeo = new THREE.BoxGeometry(thickness, height, pocketThick);
                   const cap = new THREE.Mesh(capGeo, pocketMat);
                   // cap at the far end of pocket
                   const capX = (xStart < 0) ? xStart - pocketDepth/2 : xStart + pocketDepth/2;
                   cap.position.set(capX, height/2, 0);
                   this.group.add(cap);
                };
                
                createPocketSide(-width/2 - pocketDepth/2); // Left
                createPocketSide(width/2 + pocketDepth/2);  // Right
            }

            update(playerPos) {
                const worldPos = new THREE.Vector3();
                this.group.getWorldPosition(worldPos);
                
                const dist = new THREE.Vector2(playerPos.x, playerPos.z).distanceTo(new THREE.Vector2(worldPos.x, worldPos.z));
                
                // If close, open
                // Уменьшаем радиус реагирования на 60%
                const activationDist = (this.width + 100) * 0.4;

                let shouldOpen = dist < activationDist;

                // Добавляем проверку для рельсовых тележек
                if (!shouldOpen && window.animatedTrolleys) {
                    for (let i = 0; i < window.animatedTrolleys.length; i++) {
                        const tr = window.animatedTrolleys[i];
                        if (tr && tr.mesh) {
                            const trPos = new THREE.Vector3();
                            tr.mesh.getWorldPosition(trPos);
                            
                            // Ограничиваем: ворота реагируют на тележку ТОЛЬКО если находятся на линии её движения
                            const isAlignedZ = Math.abs(worldPos.z - trPos.z) < this.width;
                            const isAlignedX = Math.abs(worldPos.x - trPos.x) < this.width;
                            
                            if (isAlignedZ || isAlignedX) {
                                const trDist = new THREE.Vector2(trPos.x, trPos.z).distanceTo(new THREE.Vector2(worldPos.x, worldPos.z));
                                const trolleyActivation = activationDist + (tr.platL ? tr.platL / 2 : 250);
                                if (trDist < trolleyActivation) {
                                    shouldOpen = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                let targetOffset = 0;
                if(shouldOpen) {
                    targetOffset = this.width / 2 - 5; // almost fully open
                }
                
                this.slideOffset = THREE.MathUtils.lerp(this.slideOffset, targetOffset, 0.05);
                
                // Move panels
                // Left moves -x, Right moves +x
                const startLeft = -this.width/4;
                const startRight = this.width/4;
                
                this.leftPanel.position.x = startLeft - this.slideOffset;
                this.rightPanel.position.x = startRight + this.slideOffset;
            }

            getCollisionBox() {
                // Returns the remaining solid part (if any) or checking against panels
                // We'll return an array of boxes for the two panels
                const boxes = [];
                // World transform helper
                const transform = (localX, localZ) => {
                    const v = new THREE.Vector3(localX, 0, localZ);
                    v.applyAxisAngle(new THREE.Vector3(0,1,0), this.group.rotation.y);
                    v.add(this.group.position);
                    return v;
                };

                // Width of panel is width/2
                // Current center of left panel: -width/4 - slideOffset
                const w = this.width / 2;
                
                const posL = transform(this.leftPanel.position.x, 0);
                boxes.push({ x: posL.x, z: posL.z, angle: this.group.rotation.y, width: w, thickness: 10 });
                
                const posR = transform(this.rightPanel.position.x, 0);
                boxes.push({ x: posR.x, z: posR.z, angle: this.group.rotation.y, width: w, thickness: 10 });
                
                return boxes;
            }
        }

        // --- Build Scene (High Detail Shell) ---
const wallsForCollision = [];
const wallsForMap = []; // Отдельный массив только для отрисовки на карте (без мебели)
const zones = [];
const doors = []; 
const wallGroup = new THREE.Group();
// Массив для прямоугольных препятствий (Столы, Стеллажи) - более стабильная коллизия
const boxColliders = []; 
scene.add(wallGroup);

        // 0. Initialize Materials
        const materials = createMaterials();

        // 1. Calculate Bounds from YOUR data
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        BUILDING_DATA.layout.walls.forEach(w => {
            minX = Math.min(minX, w.start.x, w.end.x);
            maxX = Math.max(maxX, w.start.x, w.end.x);
            minY = Math.min(minY, w.start.y, w.end.y);
            maxY = Math.max(maxY, w.start.y, w.end.y);
        });

        // Add margins for the roof overhang
        const shellMinX = minX - 200; const shellMaxX = maxX + 200;
        const shellMinZ = minY - 200; const shellMaxZ = maxY + 200;
        
        const centerX = (shellMinX + shellMaxX) / 2;
        const centerZ = (shellMinZ + shellMaxZ) / 2;
        
        // 2. Build Floor
        // 2a. Create a finite grass plane for the outside
        const floorW = shellMaxX - shellMinX + 2000;
        const floorD = shellMaxZ - shellMinZ + 2000;
        const grassPlane = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), materials.grass);
        grassPlane.rotation.x = -Math.PI / 2;
        grassPlane.position.set(centerX, -2, centerZ); // Опустили ниже, чтобы не было конфликтов
        grassPlane.receiveShadow = true;
        scene.add(grassPlane);

        const footprintShape = new THREE.Shape();
        footprintShape.moveTo(0, 0);
        footprintShape.lineTo(0, -2400);
        footprintShape.lineTo(1000, -2400);
        footprintShape.lineTo(1000, -3300);
        footprintShape.lineTo(3600, -3300);
        footprintShape.lineTo(3600, -2400);
        footprintShape.lineTo(6600, -2400);
        footprintShape.lineTo(6600, 0);
        footprintShape.closePath();
        const floorGeo = new THREE.ShapeGeometry(footprintShape);
        const posAttr = floorGeo.attributes.position;
        const uvAttr = floorGeo.attributes.uv;
        const textureScale = 500; // Texture repeats every 500 units
        for (let i = 0; i < uvAttr.count; i++) {
            uvAttr.setXY(i, posAttr.getX(i) / textureScale, -posAttr.getY(i) / textureScale);
        }
        
        const mainFloor = new THREE.Mesh(floorGeo, materials.concrete);
        mainFloor.rotation.x = -Math.PI / 2;
        mainFloor.position.set(0, 0, 0);
        mainFloor.receiveShadow = true;
        mainFloor.userData.isFloor = true;
        scene.add(mainFloor);
        
        // Спавн в центре кабинета начальника (координаты из ТЗ)
        camera.position.set(70, 192, 150);

        // 3. Build Double-Roof Structure (Columns + Trusses + Roof Sheets)
        // We do NOT build walls here, only structure.
        
        const roofObstacles = []; // Массив для панелей крыши (для прозрачности)

        const length = shellMaxX - shellMinX;
        const width = shellMaxZ - shellMinZ;
        
        // Double span configuration (Two triangles)
        const spanCount = 2;
        const singleSpan = width / spanCount;
        const trussHeight = 120; // Height of the triangle
        const colHeight = WALL_HEIGHT; // Using your global wall height
        const baySpacing = 600; // Distance between trusses
        
        const numBays = Math.ceil(length / baySpacing);
        const adjustedSpacing = length / numBays;

        for (let i = 0; i <= numBays; i++) {
            const x = shellMinX + i * adjustedSpacing;
            const isLast = (i === numBays);
            
            const section = new THREE.Group();
            section.position.set(x, 0, 0); 

            // Стойки вариативны: пропускаем стойки на i=6 (4-я от склада), 
            // чтобы визуально "подвинуть" её к следующей ферме (i=7).
            const isColumnSkipped = (i === 6);

            if (!isColumnSkipped) {
                // COLUMNS: Place at MinZ, CenterZ, MaxZ (Structural lines)
                [0, 1, 2].forEach(k => {
                    const zPos = shellMinZ + k * singleSpan;
                    // --- LOGIC TO REMOVE COLUMN IN LOADING ZONE ---
                    if (k === 1 && x > 0 && x < 1100) return; 
                    
                    // --- УДАЛЕНИЕ ЦЕНТРАЛЬНЫХ КОЛОНН (освобождение пространства цеха) ---
                    const removedCenterCols = [2, 3, 5, 7, 8, 10, 12];
                    if (k === 1 && removedCenterCols.includes(i + 1)) return; 

                    // Base (Основание колонны)
                    const baseH = 50;
                    const base = new THREE.Mesh(new THREE.BoxGeometry(30, baseH, 30), materials.yellow);
                    base.position.set(0, baseH/2, zPos);
                    base.castShadow = true; section.add(base);

                    // Steel Column (Двутавр / I-Beam construction)
                    const colH = colHeight - baseH;
                    const colGroup = new THREE.Group();
                    colGroup.position.set(0, baseH + colH/2, zPos);
                    colGroup.rotation.y = Math.PI / 2; 

                    const colW = 25; 
                    const colD = 40; 
                    const thick = 4; 

                    const web = new THREE.Mesh(new THREE.BoxGeometry(thick, colH, colD - thick*2), materials.steel);
                    web.castShadow = true; colGroup.add(web);
                    
                    const flangeGeo = new THREE.BoxGeometry(colW, colH, thick);
                    const f1 = new THREE.Mesh(flangeGeo, materials.steel);
                    f1.position.z = colD/2 - thick/2;
                    f1.castShadow = true; colGroup.add(f1);
                    
                    const f2 = new THREE.Mesh(flangeGeo, materials.steel);
                    f2.position.z = -colD/2 + thick/2;
                    f2.castShadow = true; colGroup.add(f2);
                    
                    section.add(colGroup);
                    
                    // Bracket (Опорный столик фермы)
                    const bracket = createBracket(materials.steel);
                    if (k === 0) {
                        bracket.position.set(0, colHeight, zPos + 15);
                        bracket.rotation.y = 0;
                        section.add(bracket);
                        const gusset = new THREE.Mesh(new THREE.BoxGeometry(4, 40, 40), materials.steel);
                        gusset.position.set(0, colHeight - 20, zPos + 25); 
                        gusset.rotation.x = -Math.PI/4;
                        section.add(gusset);
                    } else if (k === 2) {
                        bracket.position.set(0, colHeight, zPos - 15);
                        bracket.rotation.y = Math.PI;
                        section.add(bracket);
                        const gusset = new THREE.Mesh(new THREE.BoxGeometry(4, 40, 40), materials.steel);
                        gusset.position.set(0, colHeight - 20, zPos - 25); 
                        gusset.rotation.x = Math.PI/4;
                        section.add(gusset);
                    } else {
                        const b1 = createBracket(materials.steel);
                        b1.position.set(0, colHeight, zPos + 15);
                        section.add(b1);
                        const b2 = createBracket(materials.steel);
                        b2.position.set(0, colHeight, zPos - 15);
                        b2.rotation.y = Math.PI;
                        section.add(b2);
                    }
                });
            }

            // TRUSSES (Two spans per bay line)
            [0, 1].forEach(spanIdx => {
                const zCenter = shellMinZ + singleSpan/2 + spanIdx * singleSpan;
                
                const truss = createTruss(singleSpan, trussHeight, materials.steel);
                truss.position.set(0, colHeight, zCenter);
                truss.rotation.y = Math.PI / 2; 
                section.add(truss);
                
                // Lamps (Подвесные фонари)
                if (i % 2 === 0) {
                    const lamp = createLamp(materials.light, materials.steel);
                    // Спускаем фонарь чуть ниже фермы
                    lamp.position.set(0, colHeight + 10, zCenter);
                    section.add(lamp);
                }
            });

            scene.add(section);

            // ROOF SHEETS & PURLINS (Connecting this truss to the next)
            if (!isLast) {
                const bayW = adjustedSpacing;
                const midX = adjustedSpacing/2;
                
                [0, 1].forEach(spanIdx => { // For each roof triangle
                     const centerZ_span = shellMinZ + singleSpan/2 + spanIdx * singleSpan;
                     
                     // Two slopes per triangle: Left (-1) and Right (1)
                     [-1, 1].forEach(slopeDir => { 
                          // 1. PURLINS (Longitudinal beams)
                          const purlinsPerSlope = 5;
                          for(let p=0; p<=purlinsPerSlope; p++) {
                              const ratio = p / purlinsPerSlope;
                              const y = colHeight + ratio * trussHeight;
                              const zOff = (1-ratio) * (singleSpan/2) * slopeDir; 
                              
                              const purlin = new THREE.Mesh(new THREE.BoxGeometry(bayW, 3, 5), materials.steel);
                              purlin.position.set(x + midX, y, centerZ_span + zOff);
                              scene.add(purlin);
                          }
                          
                          // 2. ROOF PANEL GROUPING
                          const slopeGroup = new THREE.Group();
                          
                          const slopeLen = Math.sqrt((singleSpan/2)**2 + trussHeight**2);
                          const yPos = colHeight + trussHeight/2;
                          const zPos = centerZ_span + (singleSpan/4) * slopeDir;
                          
                          slopeGroup.position.set(x + midX, yPos + 1, zPos);
                          
                          const angle = Math.atan2(trussHeight, singleSpan/2);
                          slopeGroup.rotation.x = -Math.PI/2 + (slopeDir * angle); 
                          
                          scene.add(slopeGroup);

                          // Now work in Local Flat Coordinates (X = BayLength, Y = SlopeLength)
                          const isSkylight = (i % 3 === 1); 

                          if (isSkylight) {
                              const glassW = bayW * 0.5;
                              const metalW = bayW * 0.25;
                              const roofMat = materials.wall.clone();

                              // 1. Left Metal
                              const mLeft = new THREE.Mesh(new THREE.PlaneGeometry(metalW + 1, slopeLen + 5), roofMat);
                              mLeft.position.set(-(bayW/2) + (metalW/2), 0, 0); // Local X
                              mLeft.receiveShadow = true; mLeft.castShadow = true;
                              slopeGroup.add(mLeft);
                              roofObstacles.push(mLeft);

                              // 2. Right Metal
                              const mRight = new THREE.Mesh(new THREE.PlaneGeometry(metalW + 1, slopeLen + 5), roofMat);
                              mRight.position.set((bayW/2) - (metalW/2), 0, 0);
                              mRight.receiveShadow = true; mRight.castShadow = true;
                              slopeGroup.add(mRight);
                              roofObstacles.push(mRight);

                              // 3. Center Glass
                              const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, slopeLen), materials.skylight.clone());
                              glass.position.set(0, 0, 0); // Center
                              slopeGroup.add(glass);
                              roofObstacles.push(glass);

                              // 4. FRAMES
                              const frameThick = 2; 
                              const frameDeep = 3;
                              const fGeoLong = new THREE.BoxGeometry(frameThick, slopeLen, frameDeep);
                              const fLeft = new THREE.Mesh(fGeoLong, materials.steel);
                              fLeft.position.set(-glassW/2, 0, 0);
                              slopeGroup.add(fLeft);
                              
                              const fRight = new THREE.Mesh(fGeoLong, materials.steel);
                              fRight.position.set(glassW/2, 0, 0);
                              slopeGroup.add(fRight);
                              
                              // Top/Bottom Frames
                              const fGeoWide = new THREE.BoxGeometry(glassW, frameThick, frameDeep);
                              const fTop = new THREE.Mesh(fGeoWide, materials.steel);
                              fTop.position.set(0, slopeLen/2, 0);
                              slopeGroup.add(fTop);
                              
                              const fBot = new THREE.Mesh(fGeoWide, materials.steel);
                              fBot.position.set(0, -slopeLen/2, 0);
                              slopeGroup.add(fBot);

                          } else {
                              // Full Metal Panel
                              const fullPanel = new THREE.Mesh(new THREE.PlaneGeometry(bayW + 1, slopeLen + 10), materials.wall.clone());
                              fullPanel.position.set(0, 0, 0);
                              fullPanel.receiveShadow = true; fullPanel.castShadow = true;
                              slopeGroup.add(fullPanel);
                              roofObstacles.push(fullPanel);
                          }
                     });
                     
                     // Ridge Cap
                     const ridge = new THREE.Mesh(new THREE.BoxGeometry(bayW, 2, 6), materials.steel);
                     ridge.position.set(x + midX, colHeight + trussHeight + 2, centerZ_span);
                     ridge.castShadow = true;
                     scene.add(ridge);
                });
            }
        }

        // 2. Zones (Hidden by default)
        // Global Map for API access
        window.zoneMeshes = {};

        BUILDING_DATA.layout.zones.forEach(zone => {
            const x1 = Math.min(zone.start.x, zone.end.x);
            const z1 = Math.min(zone.start.y, zone.end.y);
            const w = Math.abs(zone.end.x - zone.start.x);
            const d = Math.abs(zone.end.y - zone.start.y);
            const cx = x1 + w/2;
            const cz = z1 + d/2;

            const geo = new THREE.PlaneGeometry(w, d);
            const mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cx, 1, cz);
            
            // HIDDEN BY DEFAULT (Clean Look)
            mesh.visible = false; 
            scene.add(mesh);
            
            const label = createTextSprite(zone.name, '#fbbf24');
            label.position.set(cx, 200, cz);
            // HIDDEN BY DEFAULT
            label.visible = false; 
            scene.add(label);
            
            // Store for Logic
            zones.push({ name: zone.name, minX: cx - w/2, maxX: cx + w/2, minZ: cz - d/2, maxZ: cz + d/2 });
            
            // Store for API
            window.zoneMeshes[zone.name] = { mesh, label };
        });

        // --- AI API: HIGHLIGHT ZONE ---
        // Usage: highlightZone("склад получения")
        window.highlightZone = function(zoneName, duration = 5000) {
            const z = window.zoneMeshes[zoneName];
            if(z) {
                z.mesh.visible = true;
                z.label.visible = true;
                // Optional: Flash effect or Auto-hide
                if(duration > 0) {
                    setTimeout(() => {
                        z.mesh.visible = false;
                        z.label.visible = false;
                    }, duration);
                }
                console.log(`Zone highlighted: ${zoneName}`);
            } else {
                console.warn(`Zone not found: ${zoneName}`);
            }
        };

        // 3. Walls & Openings
        BUILDING_DATA.layout.walls.forEach(wall => {
            const dx = wall.end.x - wall.start.x;
            const dz = wall.end.y - wall.start.y;
            const length = Math.sqrt(dx*dx + dz*dz);
            const angle = Math.atan2(dz, dx);
            const thickness = 20;

            const wallFeatures = BUILDING_DATA.layout.openings.filter(o => o.wallId === wall.id);
            wallFeatures.sort((a,b) => a.position_ratio - b.position_ratio);

                       let currentPos = 0;
            // Use new materials for internal layout
            const wallMaterial = materials.wall; // Corrugated white for industrial look
            // Or use materials.steel for darker metal
            
            const windowGlassMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
            
            const placeBlock = (start, end, y, h, mat) => {
                const segLen = end - start;
                if (segLen <= 0.1) return;
                // Calculate position
                const mid = (start + end) / 2;
                const wx = wall.start.x + (mid / length) * dx;
                const wz = wall.start.y + (mid / length) * dz;

                // LOGIC FOR DARK BOTTOM STRIP (Wainscoting)
                // If the block starts at the floor (y=0) and is tall enough, split it.
                if (y < 1 && h > 10) {
                                        const stripHeight = 25; // Increased 5x (approx 2.5m visually)
                    
                    // 1. Bottom Strip (Dark)
                    const strip = new THREE.Mesh(new THREE.BoxGeometry(segLen, stripHeight, thickness), materials.wallBase);
                    strip.position.set(wx, y + stripHeight/2, wz);
                    strip.rotation.y = -angle;
                    strip.castShadow = true; strip.receiveShadow = true;
                    wallGroup.add(strip);

                    // 2. Upper Wall (Original Material)
                    const upperH = h - stripHeight;
                    // Check if upper wall exists (height > 0)
                    if (upperH > 0) {
                        const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, upperH, thickness), mat);
                        mesh.position.set(wx, y + stripHeight + upperH/2, wz);
                        mesh.rotation.y = -angle;
                        mesh.castShadow = true; mesh.receiveShadow = true;
                        wallGroup.add(mesh);
                    }
                } else {
                    // Normal block (e.g. above a door or window header)
                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, h, thickness), mat);
                    mesh.position.set(wx, y + h/2, wz);
                    mesh.rotation.y = -angle;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    wallGroup.add(mesh);
                }
            };

            const addCollision = (start, end) => {
    const x1 = wall.start.x + (start / length) * dx;
    const z1 = wall.start.y + (start / length) * dz;
    const x2 = wall.start.x + (end / length) * dx;
    const z2 = wall.start.y + (end / length) * dz;
    wallsForCollision.push({ x1, z1, x2, z2, thickness });
    wallsForMap.push({ x1, z1, x2, z2 }); // Добавляем в массив для карты
};
            wallFeatures.forEach(feat => {
                const featCenter = feat.position_ratio * length;
                               // --- 1. Расчет размеров ---
                const scaleFactor = 1.2; // Увеличение на 20%

                // Размеры самого объекта (двери/окна)
                const objWidth = (feat.width_mm * MM_TO_UNIT) * scaleFactor;
                const objHeight = (feat.height_mm * MM_TO_UNIT) * scaleFactor;

                // Размеры ДЫРЫ в стене
                let holeWidth, holeHeight;

                if (feat.type === 'window') {
                    // ИСПРАВЛЕНИЕ: Для окон дыра ровно по размеру объекта. 
                    // Стена заканчивается там, где начинается рама. Никаких зазоров.
                    holeWidth = objWidth;
                    holeHeight = objHeight;
                } else {
                    // Для Дверей и Ворот оставляем запас под массивные наличники,
                    // которые накладываются поверх стены.
                    const frameMargin = 12; 
                    holeWidth = objWidth + (frameMargin * 1.8); 
                    holeHeight = objHeight + (frameMargin * 0.9);
                }

                const holeStart = featCenter - holeWidth/2;
                const holeEnd = featCenter + holeWidth/2;

                // --- 2. Строим стену ДО проема ---
                if (holeStart > currentPos) {
                    placeBlock(currentPos, holeStart, 0, WALL_HEIGHT, wallMaterial);
                    addCollision(currentPos, holeStart);
                }

                // Координаты центра объекта (для Окон и Ворот ангара)
                const cx = wall.start.x + (featCenter / length) * dx;
                const cz = wall.start.y + (featCenter / length) * dz;

                // Координаты НАЧАЛА объекта (для Обычных дверей, т.к. они строятся от угла/петли)
                // Считаем от featStart (который равен featCenter - objWidth/2)
                const startRatio = (featCenter - objWidth/2) / length;
                const sx = wall.start.x + startRatio * dx;
                const sz = wall.start.y + startRatio * dz;

                // --- 3. Вставка объекта и достройка перемычек ---
                if (feat.type === 'window') {
                    const sillHeight = (feat.sill_height_mm || 900) * MM_TO_UNIT;
                    
                    // Подоконник (строим на всю ширину дыры)
                    placeBlock(holeStart, holeEnd, 0, sillHeight, wallMaterial); 
                    
                    // Хедер (стена над окном)
                    const headerStart = sillHeight + holeHeight; 
                    // Если окно высокое, проверяем, осталась ли стена сверху
                    if (WALL_HEIGHT - headerStart > 1) {
                         placeBlock(holeStart, holeEnd, headerStart, WALL_HEIGHT - headerStart, wallMaterial); 
                    }
                    
                    // Detailed Window Geometry
                    // ИСПРАВЛЕНИЕ: Тонкая рамка (4 юнита), так как стена теперь подходит вплотную
                    const frameW = 4; 
                    const frameD = thickness * 1.2; // Чуть толще стены, чтобы выделяться
                    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
                    
                    const gr = new THREE.Group();
                    // Позиция окна по вертикали
                    gr.position.set(cx, sillHeight + objHeight/2, cz);
                    gr.rotation.y = -angle;
                    
                    // 4 sides of frame
                    const top = new THREE.Mesh(new THREE.BoxGeometry(objWidth, frameW, frameD), frameMat);
                    top.position.y = objHeight/2 - frameW/2;
                    gr.add(top);
                    
                    const bot = new THREE.Mesh(new THREE.BoxGeometry(objWidth, frameW, frameD), frameMat);
                    bot.position.y = -objHeight/2 + frameW/2;
                    gr.add(bot);
                    
                    const left = new THREE.Mesh(new THREE.BoxGeometry(frameW, objHeight, frameD), frameMat);
                    left.position.x = -objWidth/2 + frameW/2;
                    gr.add(left);
                    
                    const right = new THREE.Mesh(new THREE.BoxGeometry(frameW, objHeight, frameD), frameMat);
                    right.position.x = objWidth/2 - frameW/2;
                    gr.add(right);

                    // Mid bar
                    const mid = new THREE.Mesh(new THREE.BoxGeometry(frameW, objHeight, frameD * 0.8), frameMat);
                    gr.add(mid);
                    
                    // Glass
                    const glassGeo = new THREE.BoxGeometry(objWidth/2 - frameW, objHeight - frameW*2, 1);
                    const g1 = new THREE.Mesh(glassGeo, windowGlassMat);
                    g1.position.set(-objWidth/4, 0, 0);
                    // ОПТИМИЗАЦИЯ: Стекла не отбрасывают тени
                    g1.castShadow = false;
                    gr.add(g1);
                    
                    const g2 = new THREE.Mesh(glassGeo, windowGlassMat);
                    g2.position.set(objWidth/4, 0, 0);
                    g2.castShadow = false;
                    gr.add(g2);
                    
                    wallGroup.add(gr);
                    addCollision(holeStart, holeEnd); // Collision on window

                } else if (feat.type === 'door') {
                    // Хедер
                    const headerHeight = WALL_HEIGHT - holeHeight;
                    if (headerHeight > 1) placeBlock(holeStart, holeEnd, holeHeight, headerHeight, wallMaterial);
                    
                    // ИСПРАВЛЕНИЕ: Используем sx, sz (начало), а не cx, cz (центр)
                    const doorObj = new InteractiveDoor(objWidth, objHeight, thickness/2, sx, sz, angle);
                    doors.push(doorObj);

                } else if (feat.type === 'hangar') {
                    // Хедер
                    const headerHeight = WALL_HEIGHT - holeHeight;
                    if (headerHeight > 1) placeBlock(holeStart, holeEnd, holeHeight, headerHeight, wallMaterial);
                    
                    // Hangar Object
                    const hg = new HangarGate(objWidth, objHeight, thickness, cx, cz, angle);
                    doors.push(hg);
                }

                // Сдвигаем текущую позицию стены к концу дыры
                currentPos = holeEnd;
            });

            // Final segment
            if (currentPos < length) {
                placeBlock(currentPos, length, 0, WALL_HEIGHT, wallMaterial);
                addCollision(currentPos, length);
            }
        });

 
        // Global array to store interactable screens
        const officeComputers = []; 

        // --- Populate Office (Zone 58) ---
        function populateOffice() {
            // Materials
            const materials = {
                desk: new THREE.MeshStandardMaterial({ color: 0xE8ECF1, roughness: 0.6 }),
                plasticBlack: new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.4 }),
                plasticGray: new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.5 }),
                screen: new THREE.MeshStandardMaterial({ color: 0xE8ECF1, roughness: 0.2, metalness: 0.5 }),
                screenOn: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3355CC, emissiveIntensity: 0.6 }), 
                metal: new THREE.MeshStandardMaterial({ color: 0x7D8A9A, metalness: 0.8, roughness: 0.3 }),
                paper: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, side: THREE.DoubleSide }),
                trash: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.4 }),
                fabric: new THREE.MeshStandardMaterial({ color: 0x3355CC }), 
                mug: new THREE.MeshStandardMaterial({ color: 0xffffff })
            };

            const geoms = {
                deskTop: new THREE.BoxGeometry(140, 4, 70),
                deskLeg: new THREE.BoxGeometry(4, 71, 70),
                monitorScreen: new THREE.BoxGeometry(50, 30, 2),
                monitorStand: new THREE.CylinderGeometry(2, 2, 10),
                monitorBase: new THREE.BoxGeometry(15, 2, 15),
                keyboard: new THREE.BoxGeometry(40, 1.5, 15),
                mousepad: new THREE.BoxGeometry(22, 0.5, 18),
                mouse: new THREE.SphereGeometry(3, 16, 16),
                seat: new THREE.BoxGeometry(45, 8, 45),
                backrest: new THREE.BoxGeometry(40, 45, 5)
            };
            geoms.mouse.scale(1, 0.6, 1.5);

            function createWorkstation(x, z, ownerName, rotationY = 0, hasComputer = true, hasChair = true) {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotationY;
                
                const s = 1.3;
                group.scale.set(s, s, s);
                scene.add(group);

                // --- DESK ---
                const deskH = 75;
                const top = new THREE.Mesh(geoms.deskTop, materials.desk);
                top.position.y = deskH - 2;
                top.castShadow = true; top.receiveShadow = true;
                group.add(top);
                
                const l1 = new THREE.Mesh(geoms.deskLeg, materials.desk);
                l1.position.set(-68, (deskH-4)/2, 0);
                l1.castShadow = true; group.add(l1);

                const l2 = new THREE.Mesh(geoms.deskLeg, materials.desk);
                l2.position.set(68, (deskH-4)/2, 0);
                l2.castShadow = true; group.add(l2);

                let boxW = 140 * s; let boxD = 70 * s;
                if (Math.abs(Math.sin(rotationY)) > 0.5) {
                    boxW = 70 * s; boxD = 140 * s;
                }
                boxColliders.push({ minX: x - boxW/2 - 10, maxX: x + boxW/2 + 10, minZ: z - boxD/2 - 10, maxZ: z + boxD/2 + 10 });

                if (hasComputer) {
                    // --- MONITOR ---
                    const monGroup = new THREE.Group();
                    monGroup.position.set(0, deskH, 20);
                    monGroup.rotation.y = Math.PI; 
                    
                    const screenMat = materials.screen.clone(); 
                    const screen = new THREE.Mesh(geoms.monitorScreen, screenMat);
                    screen.position.set(0, 20, 0.6); 
                    
                    // Custom Pastel Colors per Role
                    let screenColor = 0x3b82f6; // Default
                    if (ownerName === "Технолог") screenColor = 0x7dd3fc; // Pastel Sky Blue (Небесно-голубой)
                    if (ownerName === "Плановик") screenColor = 0x86efac; // Pastel Mint Green (Мятный)
                    if (ownerName === "Снабженец") screenColor = 0xf0abfc; // Pastel Fuchsia/Purple (Сиреневый)
                    if (ownerName === "Начальник") screenColor = 0xf59e0b; // Amber (Золотистый)
                    if (ownerName === "Секретарь") screenColor = 0xa78bfa; // Purple/Indigo
                    if (ownerName === "Архивариус") screenColor = 0x94a3b8; // Slate Gray

                    const uniqueLitMat = new THREE.MeshStandardMaterial({ 
                        color: 0x000000, 
                        emissive: screenColor, 
                        emissiveIntensity: 0.7 
                    });

                    // !!! ВАЖНО: Восстанавливаем userData, которое пропало в прошлом шаге !!!
                    screen.userData = { 
                        isComputer: true, 
                        owner: ownerName, 
                        originalMat: screenMat,
                        litMat: uniqueLitMat 
                    };
                    
                    monGroup.add(screen);

                    // Задача
                    let taskDesc = "Нет активных задач";
                    if (ownerName === "Технолог") taskDesc = "Создание эскизов деталей";
                    if (ownerName === "Снабженец") taskDesc = "Заказ деталей";
                    if (ownerName === "Плановик") taskDesc = "Выдача задания в производство";
                    if (ownerName === "Начальник") taskDesc = "Управление цехом и мониторинг";
                    if (ownerName === "Секретарь") taskDesc = "Прием посетителей и корреспонденции";
                    if (ownerName === "Архивариус") taskDesc = "Управление документацией и чертежами";

                    // --- CAMERA SETUP ---
                    const localView = new THREE.Vector3(0, 160, -60);
                    const localLook = new THREE.Vector3(0, 130, 20);
                    localView.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
                    localLook.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
                    const viewPos = new THREE.Vector3(x, 0, z).add(localView);
                    const lookPos = new THREE.Vector3(x, 0, z).add(localLook);
                    
                    officeComputers.push({ 
                        mesh: screen, 
                        viewPos, 
                        lookPos, 
                        owner: ownerName,
                        description: taskDesc
                    });

                    const bezel = new THREE.Mesh(new THREE.BoxGeometry(52, 32, 1), materials.plasticBlack);
                    bezel.position.set(0, 20, 0); monGroup.add(bezel);
                    const stand = new THREE.Mesh(geoms.monitorStand, materials.plasticBlack);
                    stand.position.set(0, 5, -1.5); monGroup.add(stand);
                    const base = new THREE.Mesh(geoms.monitorBase, materials.plasticBlack);
                    base.position.y = 1; monGroup.add(base);
                    group.add(monGroup);

                    // --- PERIPHERALS ---
                    const kb = new THREE.Mesh(geoms.keyboard, materials.plasticGray);
                    kb.position.set(0, deskH + 0.8, -10); 
                    group.add(kb);

                    const mouse = new THREE.Mesh(geoms.mouse, materials.plasticGray);
                    mouse.position.set(35, deskH + 2, -10);
                    group.add(mouse);
                }

                if (hasChair) {
                    // --- CHAIR ---
                    const chairGrp = new THREE.Group();
                    chairGrp.position.set(0, 0, -50); 
                    
                    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(60, 4, 4), materials.plasticBlack); chairGrp.add(leg1);
                    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 60), materials.plasticBlack); chairGrp.add(leg2);
                    const piston = new THREE.Mesh(new THREE.CylinderGeometry(3,3,25), materials.metal);
                    piston.position.y = 12.5; chairGrp.add(piston);
                    const seat = new THREE.Mesh(geoms.seat, materials.fabric);
                    seat.position.y = 25 + 4; chairGrp.add(seat);
                    const back = new THREE.Mesh(geoms.backrest, materials.fabric);
                    back.position.set(0, 25 + 25, -20); back.rotation.x = 0.1; chairGrp.add(back);
                    chairGrp.castShadow = true;
                    group.add(chairGrp);
                }
            }

            // --- Props (Цветы) ---
            const s = 1.3;
            const potGeo = new THREE.CylinderGeometry(15, 10, 30, 16);
            const plantGeo = new THREE.DodecahedronGeometry(25);
            const plantMat = new THREE.MeshStandardMaterial({color: 0x228b22});
            
            const createPlant = (x, z) => {
                const gr = new THREE.Group();
                gr.position.set(x, 0, z);
                gr.scale.set(s, s, s);
                scene.add(gr);
                const pot = new THREE.Mesh(potGeo, materials.desk);
                pot.position.y = 15;
                gr.add(pot);
                const pl = new THREE.Mesh(plantGeo, plantMat);
                pl.position.y = 45;
                gr.add(pl);
            };
            
            // --- Props (Диван для приемной) ---
            const createSofa = (x, z, rotationY = 0) => {
                const group = new THREE.Group();
                group.position.set(x, 0, z);
                group.rotation.y = rotationY;
                
                const mat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.8 });
                const legMat = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, metalness: 0.8 });
                
                const seat = new THREE.Mesh(new THREE.BoxGeometry(240, 20, 80), mat);
                seat.position.y = 35; seat.castShadow = true; group.add(seat);
                
                const back = new THREE.Mesh(new THREE.BoxGeometry(240, 50, 20), mat);
                back.position.set(0, 65, -30); back.castShadow = true; group.add(back);
                
                const armGeo = new THREE.BoxGeometry(20, 45, 80);
                const armL = new THREE.Mesh(armGeo, mat); armL.position.set(-130, 47.5, 0); armL.castShadow = true; group.add(armL);
                const armR = new THREE.Mesh(armGeo, mat); armR.position.set(130, 47.5, 0); armR.castShadow = true; group.add(armR);
                
                const legGeo = new THREE.CylinderGeometry(2.5, 2, 25);
                [[-115, 25], [115, 25], [-115, -25], [115, -25]].forEach(pos => {
                    const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(pos[0], 12.5, pos[1]); group.add(leg);
                });
                scene.add(group);
                
                let boxW = 280; let boxD = 85;
                if (Math.abs(Math.sin(rotationY)) > 0.5) {
                    boxW = 85; boxD = 280;
                }
                boxColliders.push({ minX: x - boxW/2 - 10, maxX: x + boxW/2 + 10, minZ: z - boxD/2 - 10, maxZ: z + boxD/2 + 10 });
            };

            // Assign Desks
            createWorkstation(1450, 250, "Технолог");
            createWorkstation(1900, 250, "Плановик");
            createWorkstation(2350, 250, "Снабженец");
            
            // Кабинет Начальника (Сдвинут к стене Z=220, оставлен проход слева)
            createWorkstation(200, 200, "Начальник", Math.PI / 2);
            createPlant(50, 50); 
            createPlant(50, 250); 

            // Приемная (Большой диван справа от входа)
            createSofa(780, 150, -Math.PI / 2); 
            createPlant(450, 50);

            // Архив (Стол Архивариуса в левом углу - только стол)
            createWorkstation(891, 159, "Архивариус", Math.PI / 2, false, false);

            // Cabinets
            const cabGeo = new THREE.BoxGeometry(80, 180, 50);
            for(let z = 100; z < 600; z += 120) { 
                const cab = new THREE.Mesh(cabGeo, materials.metal);
                cab.position.set(2550, 90 * s, z); 
                cab.rotation.y = -Math.PI / 2;
                cab.scale.set(s, s, s);
                cab.castShadow = true;
                scene.add(cab);
                wallsForCollision.push({ x1: 2525, z1: z-40, x2: 2575, z2: z+40, thickness: 100 });
            }

            createPlant(1300, 650);
            createPlant(2550, 50);
        }
        populateOffice();
        

        // Реестр стеллажей архива для интерактивного режима (заполняется в populateArchive)
        const archiveRacks = [];

        function populateArchive() {
             const rackMat = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.6 });
             const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }); // White Paper

             const w = 120, h = 220, d = 40;
             // Optimizing geometries
             const legGeo = new THREE.BoxGeometry(4, h, 4);
             const shelfGeo = new THREE.BoxGeometry(w, 2, d);
             const stackGeo = new THREE.BoxGeometry(w/3 - 8, 12, d - 10);

             const createRack = (x, z, rotY = 0) => {
                 const grp = new THREE.Group();
                 grp.position.set(x, 0, z);
                 grp.rotation.y = rotY;
                 grp.userData.isArchiveRack = true; // корневая группа стеллажа

                 // Legs (4 corners)
                 const pos = [[-w/2, -d/2], [w/2, -d/2], [-w/2, d/2], [w/2, d/2]];
                 pos.forEach(([px, pz]) => {
                     const l = new THREE.Mesh(legGeo, rackMat);
                     l.position.set(px, h/2, pz);
                     l.castShadow = true;
                     l.userData.isArchiveRack = true;
                     grp.add(l);
                 });

                 // Shelves (5 levels)
                 for(let y = 15; y < h; y += 45) {
                     const s = new THREE.Mesh(shelfGeo, rackMat);
                     s.position.y = y;
                     s.castShadow = true;
                     s.userData.isArchiveRack = true;
                     grp.add(s);

                     // Random Paper stacks
                     if(Math.random() > 0.1) {
                         const stacks = Math.floor(Math.random() * 3) + 1; // 1 to 3 stacks
                         for(let k=0; k<stacks; k++) {
                             const paper = new THREE.Mesh(stackGeo, paperMat);
                             // Distribute evenly along shelf width
                             const slots = [-1, 0, 1]; 
                             const slot = slots[k % 3];
                             
                             paper.position.set(slot * (w/3), y + 6, 0);
                             // Slight random rotation for natural look
                             paper.rotation.y = (Math.random()-0.5) * 0.15;
                             paper.userData.isArchiveRack = true;
                             grp.add(paper);
                         }
                     }
                 }
                 scene.add(grp);
                 
                 // Add collision logic (rotated bounding box is complex, simplified to static AABB if rot is small or handle logic manually)
                 // Since rotation is 0 or 90, we can swap W and D
                 let finalW = w;
                 let finalD = d;
                 if (Math.abs(rotY) > 0.1) { finalW = d; finalD = w; }
                 
                 wallsForCollision.push({ x1: x-finalW/2, z1: z-finalD/2, x2: x+finalW/2, z2: z+finalD/2, thickness: finalD });

                 // --- Регистрация для интерактивного режима архива ---
                 // Фронтальная нормаль стеллажа (локальный +Z после поворота вокруг Y)
                 const front = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
                 const viewPos = new THREE.Vector3(x, 130, z).addScaledVector(front, 150);
                 const lookPos = new THREE.Vector3(x, 120, z);
                 archiveRacks.push({ group: grp, x, z, rotY, front, viewPos, lookPos });
             };

             // Place racks in the Archive Room (X: 850-1250, Z: 0-300)
             // Two against back wall
             createRack(950, 35);
             createRack(1100, 35);
             
             // One against side wall (rotated)
             createRack(1200, 150, -Math.PI/2);
        }
        populateArchive();
     let globalTruck = null; 
       // --- Truck for Receiving Zone ---
        function createTruck() {
            const group = new THREE.Group();
            group.position.set(500, 0, 1500);
            group.rotation.y = Math.PI / 2; 

            // Extended Materials
            const truckMats = {
                body: new THREE.MeshStandardMaterial({ color: 0xE8ECF1, roughness: 0.2, metalness: 0.1 }), 
                chassis: new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.9 }),
                glass: new THREE.MeshStandardMaterial({ color: 0x5AAFDD, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.6 }),
                bedOuter: new THREE.MeshStandardMaterial({ color: 0x3355CC, roughness: 0.7 }), 
                bedInner: new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.9 }), 
                rubber: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 }),
                rim: new THREE.MeshStandardMaterial({ color: 0xA8AEB8, metalness: 0.8 }),
                chrome: new THREE.MeshStandardMaterial({ color: 0xE8ECF1, metalness: 1.0, roughness: 0.2 }),
                blackPlastic: new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.8 }),
                interior: new THREE.MeshStandardMaterial({ color: 0xA8AEB8 }),
                lightWhite: new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 2 }),
                lightRed: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 })
            };

            // --- КОНСТАНТЫ РАЗМЕРОВ (УВЕЛИЧЕНО) ---
            const wheelRadius = 36; // Немного уменьшили (было 44), чтобы опустить кузов ниже
            const wheelThick = 24; 
            const chassisY = wheelRadius + 10; // 46

            // 1. Chassis
            const chassisLen = 750;
            const chassisGeo = new THREE.BoxGeometry(chassisLen, 20, 100);
            const chassis = new THREE.Mesh(chassisGeo, truckMats.chassis);
            chassis.position.y = chassisY; chassis.castShadow = true; group.add(chassis);

            // Fuel Tank
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 120, 16), truckMats.chrome);
            tank.rotation.z = Math.PI / 2;
            tank.position.set(50, chassisY, 75); 
            group.add(tank);

            // 2. Wheels & Axles
            const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThick, 24);
            wheelGeo.rotateX(Math.PI / 2);
            
            const wheelPos = [
                { x: 250, z: 95 }, { x: 250, z: -95 }, 
                { x: -200, z: 95 }, { x: -200, z: -95 }, 
                { x: -300, z: 95 }, { x: -300, z: -95 }  
            ];

            const axleGeo = new THREE.CylinderGeometry(10, 10, 200); 
            axleGeo.rotateX(Math.PI/2);
            const axlesX = [250, -200, -300];
            axlesX.forEach(axX => {
                const axle = new THREE.Mesh(axleGeo, truckMats.chassis);
                axle.position.set(axX, wheelRadius, 0);
                group.add(axle);
            });

            wheelPos.forEach(p => {
                const w = new THREE.Mesh(wheelGeo, truckMats.rubber);
                w.position.set(p.x, wheelRadius, p.z);
                w.castShadow = true;
                group.add(w);
                
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, wheelThick + 1, 16), truckMats.rim);
                rim.rotation.x = Math.PI / 2;
                rim.position.set(p.x, wheelRadius, p.z);
                group.add(rim);
            });

            // 3. Cab (High Detail)
            const cabGroup = new THREE.Group();
            // Выравниваем кабину (низ на Y=75)
            cabGroup.position.set(280, 75, 0); 

            // Опора кабины на раму (от Y=46 до Y=75 -> высота 29)
            const cabSupport = new THREE.Mesh(new THREE.BoxGeometry(140, 29, 120), truckMats.chassis);
            cabSupport.position.set(0, -14.5, 0);
            cabGroup.add(cabSupport);

            // A. Lower Cab Section (Base)
            const cabBase = new THREE.Mesh(new THREE.BoxGeometry(160, 60, 230), truckMats.body);
            cabBase.position.y = 30;
            cabBase.castShadow = true;
            cabGroup.add(cabBase);

            // B. Upper Cab Section (Cabin)
            const cabUpper = new THREE.Mesh(new THREE.BoxGeometry(130, 110, 220), truckMats.body);
            cabUpper.position.set(-10, 115, 0);
            cabUpper.castShadow = true;
            cabGroup.add(cabUpper);

            // C. Roof Fairing (Aerodynamic Wedge)
            const roofShape = new THREE.Group();
            roofShape.position.set(-10, 170, 0);
            // Slope geometry using scaled cylinder segment or just rotated box
            const slopeGeo = new THREE.BoxGeometry(100, 15, 210);
            const slope = new THREE.Mesh(slopeGeo, truckMats.body);
            slope.rotation.z = -0.3; // Tilt back
            slope.position.set(10, 10, 0);
            roofShape.add(slope);
            cabGroup.add(roofShape);

            // D. Interior (Seats & Wheel)
            const interior = new THREE.Group();
            interior.position.set(0, 90, 0);
            const seatGeo = new THREE.BoxGeometry(40, 60, 40);
            const seatL = new THREE.Mesh(seatGeo, truckMats.interior);
            seatL.position.set(-20, 0, 60);
            interior.add(seatL);
            const seatR = new THREE.Mesh(seatGeo, truckMats.interior);
            seatR.position.set(-20, 0, -60);
            interior.add(seatR);
            // Steering Wheel
            const wheel = new THREE.Mesh(new THREE.TorusGeometry(12, 2, 8, 16), truckMats.blackPlastic);
            wheel.position.set(30, 20, 60);
            wheel.rotation.set(0, -0.5, -0.5);
            interior.add(wheel);
            cabGroup.add(interior);

            // E. Front Bumper
            const bumper = new THREE.Mesh(new THREE.BoxGeometry(30, 25, 235), truckMats.chrome);
            bumper.position.set(85, 12.5, 0);
            cabGroup.add(bumper);

            // F. Steps
            const stepGeo = new THREE.BoxGeometry(30, 5, 40);
            const stepL1 = new THREE.Mesh(stepGeo, truckMats.chrome);
            stepL1.position.set(20, 20, 125); cabGroup.add(stepL1);
            const stepL2 = new THREE.Mesh(stepGeo, truckMats.chrome);
            stepL2.position.set(20, 40, 125); cabGroup.add(stepL2);
            
            const stepR1 = new THREE.Mesh(stepGeo, truckMats.chrome);
            stepR1.position.set(20, 20, -125); cabGroup.add(stepR1);
            const stepR2 = new THREE.Mesh(stepGeo, truckMats.chrome);
            stepR2.position.set(20, 40, -125); cabGroup.add(stepR2);

            // G. Grille
            const grillGeo = new THREE.BoxGeometry(5, 70, 140);
            const grill = new THREE.Mesh(grillGeo, truckMats.blackPlastic);
            grill.position.set(81, 65, 0);
            cabGroup.add(grill);
            // Chrome border
            const grillBorder = new THREE.Mesh(new THREE.BoxGeometry(6, 74, 144), truckMats.chrome);
            grillBorder.position.set(81, 65, 0);
            // Using a hollow box trick or just clip? Let's just place it behind slightly larger.
            // Simplified: Add slats
            for(let i=0; i<6; i++) {
                const slat = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 130), truckMats.chrome);
                slat.position.set(82, 40 + i*10, 0);
                cabGroup.add(slat);
            }

            // H. Lights
            const lightGeo = new THREE.BoxGeometry(2, 12, 25);
            const lLeft = new THREE.Mesh(lightGeo, truckMats.lightWhite);
            lLeft.position.set(86, 15, 80);
            cabGroup.add(lLeft);
            const lRight = new THREE.Mesh(lightGeo, truckMats.lightWhite);
            lRight.position.set(86, 15, -80);
            cabGroup.add(lRight);

            // I. Windows
            // Windshield
            const windGeo = new THREE.PlaneGeometry(120, 70);
            const windshield = new THREE.Mesh(windGeo, truckMats.glass);
            windshield.position.set(56, 125, 0); // Moved back slightly to show dash
            windshield.rotation.y = Math.PI / 2;
            cabGroup.add(windshield);
            
            // Wipers
            const wiperGeo = new THREE.BoxGeometry(1, 40, 2);
            const wiper1 = new THREE.Mesh(wiperGeo, truckMats.blackPlastic);
            wiper1.position.set(57, 110, 30); wiper1.rotation.set(0,0,-0.2); cabGroup.add(wiper1);
            const wiper2 = new THREE.Mesh(wiperGeo, truckMats.blackPlastic);
            wiper2.position.set(57, 110, -30); wiper2.rotation.set(0,0,-0.2); cabGroup.add(wiper2);

            // Side Windows
            const sideWinGeo = new THREE.PlaneGeometry(70, 60);
            const wLeft = new THREE.Mesh(sideWinGeo, truckMats.glass);
            wLeft.position.set(10, 125, 111);
            cabGroup.add(wLeft);
            const wRight = new THREE.Mesh(sideWinGeo, truckMats.glass);
            wRight.position.set(10, 125, -111);
            wRight.rotation.y = Math.PI;
            cabGroup.add(wRight);

            // J. Sun Visor
            const visor = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 130), truckMats.body);
            visor.position.set(65, 162, 0);
            visor.rotation.z = -0.2;
            cabGroup.add(visor);

            // K. Door Handles
            const handleGeo = new THREE.BoxGeometry(10, 2, 4);
            const hLeft = new THREE.Mesh(handleGeo, truckMats.blackPlastic);
            hLeft.position.set(-20, 110, 112); cabGroup.add(hLeft);
            const hRight = new THREE.Mesh(handleGeo, truckMats.blackPlastic);
            hRight.position.set(-20, 110, -112); cabGroup.add(hRight);

            // L. Mirrors
            const mirrorArmGeo = new THREE.CylinderGeometry(2, 2, 40);
            const mirrorBoxGeo = new THREE.BoxGeometry(10, 40, 20);
            
            const addMirror = (zDir) => {
                const arm = new THREE.Mesh(mirrorArmGeo, truckMats.blackPlastic);
                arm.rotation.x = Math.PI/2;
                arm.position.set(40, 120, zDir * 130);
                cabGroup.add(arm);
                
                const box = new THREE.Mesh(mirrorBoxGeo, truckMats.chrome);
                box.position.set(40, 120, zDir * 150);
                box.rotation.y = -zDir * 0.2;
                cabGroup.add(box);
            };
            addMirror(1);
            addMirror(-1);

            group.add(cabGroup);

            // 4. Open Bed (Clean, no rear wall)
            const bedGroup = new THREE.Group();
            // Опускаем кузов еще ниже, до уровня 75
            bedGroup.position.set(-100, 75, 0);
            
            // SAVE REFERENCE TO BED FOR LOADING
            group.userData.bed = bedGroup;

            const bedW = 240;
            const bedL = 500;
            const bedH = 80; 

            // Опоры кузова (от Y=46 до Y=75 -> высота 29)
            const bedSupport = new THREE.Mesh(new THREE.BoxGeometry(bedL, 29, 90), truckMats.chassis);
            bedSupport.position.y = -14.5; 
            bedGroup.add(bedSupport);

            // Floor (Пол кузова)
            // Чтобы не было конфликтов на углах, вкладываем пол строго внутрь бортов
            const floorW = bedW - 10;
            const floorL = bedL - 5;
            const floor = new THREE.Mesh(new THREE.BoxGeometry(floorL, 5, floorW), truckMats.bedInner);
            floor.position.set(-2.5, 2.5, 0); // Сдвигаем назад от передней стенки
            floor.receiveShadow = true; bedGroup.add(floor);
            group.userData.bedFloor = floor;
            
            // Side Walls construction
            // Борта идут на всю высоту кузова (от 0 до bedH)
            const sideH = bedH; 
            const sideY = sideH / 2;

            const sideGeo = new THREE.BoxGeometry(bedL, sideH, 5);
            const sLeft = new THREE.Mesh(sideGeo, truckMats.bedOuter); 
            sLeft.position.set(0, sideY, bedW/2 - 2.5); bedGroup.add(sLeft);
            
            const sRight = new THREE.Mesh(sideGeo, truckMats.bedOuter); 
            sRight.position.set(0, sideY, -bedW/2 + 2.5); bedGroup.add(sRight);
            
            // Передняя стенка (вставлена строго МЕЖДУ боковыми стенками)
            const sFront = new THREE.Mesh(new THREE.BoxGeometry(5, sideH, bedW - 10), truckMats.bedOuter); 
            sFront.position.set(bedL/2 - 2.5, sideY, 0); bedGroup.add(sFront);

            group.add(bedGroup);
            scene.add(group);
             // ! ВАЖНОЕ ИЗМЕНЕНИЕ: ГРУЗОВИК ИЗНАЧАЛЬНО СКРЫТ !
            group.visible = false;
            // Хитбокс НЕ добавляем здесь — добавится при появлении грузовика (spawnPartsInTruck)
            globalTruck = group;
        }
        createTruck();

        // --- ПРОДВИНУТЫЙ 3D ГЕНЕРАТОР (Fixed Arcs & Dims) ---
        function clusterOnLinearSegment(c, seg, posTol, normTol) {
            const nx = c.normal.x, ny = c.normal.y;
            const len2D = Math.hypot(nx, ny);
            if (len2D < 0.01) return false;
            const nxn = nx / len2D, nyn = ny / len2D;
            if (Math.abs(nxn * seg.nx + nyn * seg.ny) < normTol) return false;
            const cx = c.center.x, cy = c.center.y;
            const sdx = seg.ex - seg.sx, sdy = seg.ey - seg.sy;
            const segLen2 = sdx * sdx + sdy * sdy;
            if (segLen2 < 1e-8) return Math.hypot(cx - seg.mx, cy - seg.my) <= posTol;
            const t = ((cx - seg.sx) * sdx + (cy - seg.sy) * sdy) / segLen2;
            if (t < -0.1 || t > 1.1) return false;
            const px = seg.sx + t * sdx, py = seg.sy + t * sdy;
            return Math.hypot(cx - px, cy - py) <= posTol;
        }

        function clusterOnRadialSegment(c, seg, posTol, normTol) {
            if (Math.hypot(c.center.x - seg.mx, c.center.y - seg.my) > posTol) return false;
            const nx = c.normal.x, ny = c.normal.y;
            const len2D = Math.hypot(nx, ny);
            if (len2D < 0.01) return false;
            return Math.abs((nx / len2D) * seg.nx + (ny / len2D) * seg.ny) >= normTol;
        }

        window.calculateNormalsAndVisuals = function(mesh) {
            if (!mesh.geometry) return;

            const geo = mesh.geometry;
            const nonIndexedGeo = geo.index ? geo.toNonIndexed() : geo;
            const pos = nonIndexedGeo.attributes.position;

            const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
            const cb = new THREE.Vector3(), ab = new THREE.Vector3(), normal = new THREE.Vector3();
            const center = new THREE.Vector3();

            const clusters = [];
            const NORMAL_TOL = 0.985;
            let totalArea = 0;

            for (let i = 0; i < pos.count; i += 3) {
                pA.fromBufferAttribute(pos, i);
                pB.fromBufferAttribute(pos, i + 1);
                pC.fromBufferAttribute(pos, i + 2);

                center.copy(pA).add(pB).add(pC).multiplyScalar(1 / 3);
                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                normal.crossVectors(cb, ab);
                const area = normal.length() * 0.5;
                if (area < 1e-6) continue;
                normal.normalize();
                totalArea += area;

                let found = null;
                for (const c of clusters) {
                    if (c.normal.dot(normal) > NORMAL_TOL) { found = c; break; }
                }
                if (!found) {
                    const tlen = Math.hypot(normal.x, normal.y);
                    found = {
                        normal: normal.clone(), area: 0, centerSum: new THREE.Vector3(),
                        normalSum: new THREE.Vector3(),
                        isRadial: false, tx: tlen > 1e-6 ? -normal.y / tlen : 1, ty: tlen > 1e-6 ? normal.x / tlen : 0,
                        tMin: Infinity, tMax: -Infinity
                    };
                    clusters.push(found);
                }
                found.area += area; found.centerSum.addScaledVector(center, area);
                found.area += area; 
                found.centerSum.addScaledVector(center, area);
                found.normalSum.addScaledVector(normal, area);
                const p0 = pA.x * found.tx + pA.y * found.ty;
                const p1 = pB.x * found.tx + pB.y * found.ty;
                const p2 = pC.x * found.tx + pC.y * found.ty;
                found.tMin = Math.min(found.tMin, p0, p1, p2); found.tMax = Math.max(found.tMax, p0, p1, p2);
            }

            if (clusters.length === 0) {
                mesh.userData.validOrientations = []; mesh.userData.surfaceClusters = []; mesh.userData.currentOrientIndex = 0;
                return;
            }
            clusters.sort((a, b) => b.area - a.area);

            geo.computeBoundingBox();
            const _gbb = geo.boundingBox;
            const maxXYDim = Math.max(_gbb.max.x - _gbb.min.x, _gbb.max.y - _gbb.min.y) || 1;
            const thicknessZ = (_gbb.max.z - _gbb.min.z) || 1;
            const linearSegments2D = mesh.userData.linearSegments2D;
            const radialSegments2D = mesh.userData.radialSegments2D;
            const HAS_LINEAR_META = linearSegments2D && linearSegments2D.length > 0;
            const HAS_RADIAL_META = radialSegments2D && radialSegments2D.length > 0;
            const NORM_TOL = 0.92;
            const POS_TOL = Math.max(0.04 * maxXYDim, thicknessZ * 0.6, 0.3);
            const NARROW_FRAC = 0.15; const FAN_NEAR = 0.88; const FAN_DISTINCT = 0.9995; const FAN_NEEDED = 2;

            for (let i = 0; i < clusters.length; i++) {
                const c = clusters[i];
                c.center = c.centerSum.clone().multiplyScalar(1 / c.area); delete c.centerSum;
                c.normal = c.normalSum.clone().normalize(); delete c.normalSum;
                c.width = c.tMax - c.tMin; const tlen = Math.hypot(c.normal.x, c.normal.y);
                c.nxn = tlen > 1e-6 ? c.normal.x / tlen : 1; c.nyn = tlen > 1e-6 ? c.normal.y / tlen : 0;

                if (Math.abs(c.normal.z) > 0.9) { c.isRadial = false; c.type = 'cap'; continue; }

                // ИЩЕМ ПРЯМОУГОЛЬНЫЕ СЕГМЕНТЫ ИСКЛЮЧИТЕЛЬНО ПО НОРМАЛИ (МАТЕМАТИКЕ 2D)
                // Игнорируем смещение центра кластера, так как скругления его портят.
                let matchedLinearSeg = null;
                if (HAS_LINEAR_META) {
                    let bestDot = 0.95; // Минимальный порог сходства (~18 градусов)
                    for (const seg of linearSegments2D) {
                        const dot = Math.abs(c.nxn * seg.nx + c.nyn * seg.ny);
                        if (dot > bestDot) {
                            bestDot = dot;
                            matchedLinearSeg = seg;
                        }
                    }
                }

                if (matchedLinearSeg) { 
                    c.isRadial = false; 
                    c.type = 'linear'; 
                    const cadNormal = new THREE.Vector3(matchedLinearSeg.nx, matchedLinearSeg.ny, 0).normalize();
                    if (cadNormal.dot(c.normal) < 0) cadNormal.negate();
                    c.normal.copy(cadNormal);
                } 
                else if (HAS_LINEAR_META || HAS_RADIAL_META) { 
                    c.isRadial = true; 
                    c.type = 'radial'; 
                } 
                else {
                    const isNarrow = c.width < NARROW_FRAC * maxXYDim;
                    let fan = 0;
                    for (let j = 0; j < clusters.length; j++) {
                        if (i === j || Math.abs(clusters[j].normal.z) > 0.9) continue;
                        const d = c.normal.dot(clusters[j].normal);
                        if (d > FAN_NEAR && d < FAN_DISTINCT && ++fan >= FAN_NEEDED) break;
                    }
                    c.isRadial = isNarrow && fan >= FAN_NEEDED; c.type = c.isRadial ? 'radial' : 'linear';
                }
            }

            const validClusters = [];
            for (const c of clusters) {
                if (c.type === 'radial') continue;
                const isDup = validClusters.some(v => v.normal.dot(c.normal) > 0.97);
                if (!isDup) validClusters.push(c);
            }

            mesh.userData.validClusters = validClusters;
            mesh.userData.validOrientations = validClusters.map(c => c.normal.clone());
            mesh.userData.surfaceClusters = clusters;
            mesh.userData.faces = clusters.map(c => ({ type: c.type, normal: c.normal.clone(), area: c.area, center: c.center ? c.center.clone() : null }));
            mesh.userData.currentOrientIndex = Math.min(mesh.userData.currentOrientIndex || 0, Math.max(0, validClusters.length - 1));
        }

        window.generate3DPartFromCAD = function(cadData, thicknessMM, dimensions = null) {
            if ((!cadData || cadData.length === 0) && dimensions) {
                const w = parseFloat(dimensions.width) || 100;
                const l = parseFloat(dimensions.length) || 100;
                const shape = new THREE.Shape();
                shape.moveTo(0,0); shape.lineTo(l,0); shape.lineTo(l,w); shape.lineTo(0,w); shape.lineTo(0,0);
                let g = new THREE.ExtrudeGeometry(shape, { depth: (parseFloat(thicknessMM) || 10), bevelEnabled: false });
                if (window.TessellateModifier) {
                    const tessellator = new window.TessellateModifier(20, 8); // 20mm max edge, 8 iterations
                    g = tessellator.modify(g);
                }
                g.scale(0.1, 0.1, 0.1); g.center();
                const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9ca3af }));
                m.rotation.x = -Math.PI/2;
                calculateNormalsAndVisuals(m);
                if (typeof registerWorkpiece === 'function') registerWorkpiece(m);
                return m;
            }
            if (!cadData) return null;

            const segments = []; const SEGMENTS = 32; const radialSegments2D = []; const linearSegments2D = [];
            cadData.forEach(s => {
                if (s.isConstruction || s.type === 'dimension') return;
                if (s.type === 'line') {
                    segments.push(s);
                    const dx = s.end.x - s.start.x, dy = s.end.y - s.start.y; const len = Math.hypot(dx, dy);
                    if (len > 1e-3) linearSegments2D.push({ sx: s.start.x, sy: s.start.y, ex: s.end.x, ey: s.end.y, nx: -dy / len, ny: dx / len, mx: (s.start.x + s.end.x) * 0.5, my: (s.start.y + s.end.y) * 0.5 });
                } else if (s.type === 'circle' || s.type === 'arc') {
                    let sa = s.type === 'arc' ? s.startAngle : 0; let ea = s.type === 'arc' ? s.endAngle : Math.PI*2;
                    if (s.type === 'arc') {
                        const isCCW = !s.counterClockwise; if (isCCW && ea < sa) ea += Math.PI * 2; if (!isCCW && sa < ea) sa += Math.PI * 2;
                    }
                    const diff = ea - sa; const steps = Math.max(2, Math.ceil((Math.abs(diff) / (Math.PI*2)) * SEGMENTS)); const step = diff / steps;
                    let px = s.center.x + Math.cos(sa) * s.radius; let py = s.center.y + Math.sin(sa) * s.radius;
                    for (let i = 1; i <= steps; i++) {
                        const a = sa + step * i; const cx = s.center.x + Math.cos(a) * s.radius; const cy = s.center.y + Math.sin(a) * s.radius;
                        segments.push({ start: {x: px, y: py}, end: {x: cx, y: cy}, type: 'line' });
                        const midA = sa + step * (i - 0.5); radialSegments2D.push({ nx: Math.cos(midA), ny: Math.sin(midA), mx: (px + cx) * 0.5, my: (py + cy) * 0.5 });
                        px = cx; py = cy;
                    }
                }
            });
            if (segments.length === 0) return null;

            const contours = []; const pool = [...segments]; const TOL = 2.0;
            while (pool.length > 0) {
                const contourShape = new THREE.Shape(); let current = pool.shift();
                contourShape.moveTo(current.start.x, current.start.y); contourShape.lineTo(current.end.x, current.end.y);
                let tail = current.end; let found = true;
                while (found) {
                    found = false;
                    for (let i = 0; i < pool.length; i++) {
                        const cand = pool[i];
                        if (Math.hypot(cand.start.x - tail.x, cand.start.y - tail.y) < TOL) { contourShape.lineTo(cand.end.x, cand.end.y); tail = cand.end; pool.splice(i, 1); found = true; break; } 
                        else if (Math.hypot(cand.end.x - tail.x, cand.end.y - tail.y) < TOL) { contourShape.lineTo(cand.start.x, cand.start.y); tail = cand.start; pool.splice(i, 1); found = true; break; }
                    }
                }
                contours.push(contourShape);
            }
            const getAreaApprox = (shp) => {
                const pts = shp.getPoints(); let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
                pts.forEach(p => { if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y; });
                return (maxX-minX)*(maxY-minY);
            };
            contours.sort((a, b) => getAreaApprox(b) - getAreaApprox(a));
            const mainShape = contours[0]; for (let i = 1; i < contours.length; i++) { mainShape.holes.push(contours[i]); }

            const MM_TO_WORLD = 0.1;
            let geom = new THREE.ExtrudeGeometry(mainShape, { steps: 1, depth: (parseFloat(thicknessMM) || 10), bevelEnabled: false, curveSegments: 1 });
            if (window.TessellateModifier) {
                const tessellator = new window.TessellateModifier(20, 8); // 20mm max edge, 8 iterations
                geom = tessellator.modify(geom);
            }
            geom.scale(MM_TO_WORLD, MM_TO_WORLD, MM_TO_WORLD); geom.computeBoundingBox();
            const _bb = geom.boundingBox; const _offX = (_bb.min.x + _bb.max.x) * 0.5; const _offY = (_bb.min.y + _bb.max.y) * 0.5;
            geom.center(); 
            const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
            mesh.castShadow = true; mesh.receiveShadow = true; mesh.rotation.x = -Math.PI / 2;
            mesh.userData.radialSegments2D = radialSegments2D.map(seg => ({ nx: seg.nx, ny: seg.ny, mx: seg.mx * MM_TO_WORLD - _offX, my: seg.my * MM_TO_WORLD - _offY }));
            mesh.userData.linearSegments2D = linearSegments2D.map(seg => ({ sx: seg.sx * MM_TO_WORLD - _offX, sy: seg.sy * MM_TO_WORLD - _offY, ex: seg.ex * MM_TO_WORLD - _offX, ey: seg.ey * MM_TO_WORLD - _offY, nx: seg.nx, ny: seg.ny, mx: seg.mx * MM_TO_WORLD - _offX, my: seg.my * MM_TO_WORLD - _offY }));
            calculateNormalsAndVisuals(mesh);
            if (typeof registerWorkpiece === 'function') registerWorkpiece(mesh);
            return mesh;
        };

        // =====================================================
        // 🛠️ СВАРОЧНЫЙ СТОЛ (Из донора)
        // =====================================================
        // Размеры стола
        const TABLE_PARAMS = {
          L: 1.60 * 1.2,
          W: 0.90 * 1.2,
          H: 0.975, // Высоту НЕ меняем
          topT: 0.04,
          scale: 120
        };
        function createWeldingTable(x, z, rotationY = 0) {
          const stand = new THREE.Group();
          const s = TABLE_PARAMS.scale; // Scale factor from meters to factory units

          // Материалы
          const topSteel = new THREE.MeshStandardMaterial({ color: 0xE8ECF1, roughness: 0.45, metalness: 0.7 });
          const frameRed = new THREE.MeshStandardMaterial({ color: 0x3355CC, roughness: 0.55, metalness: 0.55 });
          const skinMat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.7, metalness: 0.3 });
          const cabinetMat = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.6, metalness: 0.2 });
          const handleSteel = new THREE.MeshStandardMaterial({ color: 0xE8ECF1, roughness: 0.35, metalness: 0.85 });
          const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

          const { L, W, H, topT } = TABLE_PARAMS;

          // 1. ВЕРХ И РАМА
          const slatCount = 15;
          const gap = 0.008;
          const slatW = (W - gap * (slatCount - 1)) / slatCount;

          for (let i = 0; i < slatCount; i++) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(L*s, topT*s, slatW*s), topSteel);
            slat.position.set(0, (H + topT / 2)*s, (-W / 2 + slatW / 2 + i * (slatW + gap))*s);
            slat.castShadow = true; slat.receiveShadow = true;
            stand.add(slat);
          }

          const frameH = 0.08;
          const frameY = H - frameH / 2;
          const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(L*s, frameH*s, 0.09*s), frameRed);
          frontBeam.position.set(0, frameY*s, (W / 2 - 0.045)*s);
          stand.add(frontBeam);
          const backBeam = frontBeam.clone();
          backBeam.position.z = (-W / 2 + 0.045)*s;
          stand.add(backBeam);

          // 2. ЗАШИВКА
          const skinThk = 0.005; const skinH = H - 0.02;
          const leftSkin = new THREE.Mesh(new THREE.BoxGeometry(skinThk*s, skinH*s, W*s), skinMat);
          leftSkin.position.set((-L / 2 - skinThk / 2)*s, skinH*s / 2, 0);
          stand.add(leftSkin);
          const rightSkin = leftSkin.clone();
          rightSkin.position.x = (L / 2 + skinThk / 2)*s;
          stand.add(rightSkin);
          const backSkin = new THREE.Mesh(new THREE.BoxGeometry(L*s, skinH*s, skinThk*s), skinMat);
          backSkin.position.set(0, skinH*s / 2, (-W / 2 - skinThk / 2)*s);
          stand.add(backSkin);

          // 3. ТУМБЫ
          function createLeg(lx, lz) {
            const g = new THREE.Group();
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008*s, 0.008*s, 0.08*s), handleSteel);
            rod.position.y = 0.04*s; g.add(rod);
            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025*s, 0.025*s, 0.015*s), rubberMat);
            foot.position.y = 0.0075*s; g.add(foot);
            g.position.set(lx*s, 0, lz*s);
            return g;
          }

          function cabinet(xSign) {
            const wrapper = new THREE.Group();
            const cabW = L / 2 - 0.08; const cabD = W / 2 - 0.12;
            const legH = 0.08; const cabH = H - frameH - legH - 0.02;
            const cabX = xSign * (cabW / 2 + 0.04); const cabY = legH + cabH / 2;

            wrapper.position.set(cabX*s, 0, 0);
            wrapper.add(createLeg(-cabW/2 + 0.04, cabD/2 - 0.04));
            wrapper.add(createLeg(cabW/2 - 0.04, cabD/2 - 0.04));
            wrapper.add(createLeg(-cabW/2 + 0.04, -cabD/2 + 0.04));
            wrapper.add(createLeg(cabW/2 - 0.04, -cabD/2 + 0.04));

            const shell = new THREE.Mesh(new THREE.BoxGeometry(cabW*s, cabH*s, cabD*s), cabinetMat);
            shell.position.y = cabY*s;
            shell.castShadow = true;
            wrapper.add(shell);

            if (xSign === 1) { // Ящик
              const frameThk = 0.02;
              const frame = new THREE.Mesh(new THREE.BoxGeometry(cabW*s, cabH*s, frameThk*s), cabinetMat);
              frame.position.set(0, cabY*s, (cabD/2 + frameThk/2)*s);
              wrapper.add(frame);
              
              const face = new THREE.Mesh(new THREE.BoxGeometry((cabW - 0.01)*s, (cabH - 0.01)*s, 0.02*s), cabinetMat);
              face.position.set(0, cabY*s, (cabD/2 + frameThk + 0.01)*s);
              wrapper.add(face);
              
              // Ручка
              const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12*s, 0.01*s, 0.02*s), handleSteel);
              handle.position.set(0, (cabY + 0.05)*s, (cabD/2 + frameThk + 0.03)*s);
              wrapper.add(handle);
            } else { // Дверца
              const doorThk = 0.02;
              const door = new THREE.Mesh(new THREE.BoxGeometry((cabW - 0.004)*s, (cabH - 0.004)*s, doorThk*s), cabinetMat);
              door.position.set(0, cabY*s, (cabD/2 + doorThk/2)*s);
              wrapper.add(door);
              
              const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006*s, 0.006*s, 0.16*s), handleSteel);
              handle.position.set((cabW/2 - 0.04)*s, (cabY + 0.05)*s, (cabD/2 + doorThk + 0.015)*s);
              wrapper.add(handle);
            }
            return wrapper;
          }
          stand.add(cabinet(-1));
          stand.add(cabinet(1));

          // 4. БОКОВАЯ ПОЛКА
          const sDepth = 0.35; const sThk = 0.005; 
          const sY = H - 0.30; const sX = L / 2 + sDepth / 2 + 0.002;
          
          const plate = new THREE.Mesh(new THREE.BoxGeometry(sDepth*s, sThk*s, W*s), cabinetMat);
          plate.position.set(sX*s, sY*s, 0); 
          stand.add(plate);
          
          let boxW = L * s;
          let boxD = W * s;
          
          // Если стол повернут на 90 градусов (примерно PI/2), меняем ширину и глубину местами
          if (Math.abs(rotationY) > 0.1) { 
              boxW = W * s;
              boxD = L * s;
          }

          // Добавляем в новый массив Box Colliders
          // Добавляем небольшой отступ (+5), чтобы игрок не проваливался в геометрию
          boxColliders.push({ 
             minX: x - boxW/2 - 5, 
             maxX: x + boxW/2 + 5, 
             minZ: z - boxD/2 - 5, 
             maxZ: z + boxD/2 + 5 
          });
          
          // Tag for Workpiece Physics
          stand.userData.isTable = true; 
          // Store dims for easier check later if needed
          stand.userData.tableDims = { w: L*s, d: W*s };

          stand.position.set(x, 0, z);
          stand.rotation.y = rotationY;
          scene.add(stand);
        }

        // РАЗМЕЩЕНИЕ СТОЛОВ: "рабочая малая область 2" (1100..2500, 1300..1600)
        // Два стола в линию. 
        createWeldingTable(1600, 1200);
        createWeldingTable(2000, 1200);

        // ВТОРОЙ СТОЛ - Металлический лист (1400x10x580 mm)
        // Масштаб 120 (1m -> 120 units)
        // 1.4m -> 168, 0.01m -> 1.2, 0.58m -> 69.6
        // Делаем сетку лоу-поли, three-bvh-csg отлично с ней работает
        const metalSheetGeo = new THREE.BoxGeometry(168, 1.2, 69.6);
        const metalSheetMat = new THREE.MeshStandardMaterial({
            color: 0x99AAB5, roughness: 0.4, metalness: 0.8
        });
        const metalSheet = new THREE.Mesh(metalSheetGeo, metalSheetMat);
        // У стола H=0.975, topT=0.04. Поверхность на высоте (0.975+0.04)*120 = 121.8
        metalSheet.position.set(2000, 121.8 + 0.6, 1200);
        metalSheet.name = 'MetalSheet'; // ВАЖНО: Raycaster резака ищет по этому имени
        metalSheet.userData.canBeCut = true;
        metalSheet.userData.isInteractable = true; metalSheet.userData.isCargo = true; metalSheet.userData.partName = 'Лист 1400х580х10';
        
        // --- ДЕЛАЕМ КАК ЗАКАЗАННУЮ ДЕТАЛЬ ---
        metalSheet.userData.isWorkpiece = true;
        metalSheet.geometry.computeBoundingBox();
        const bb = metalSheet.geometry.boundingBox;
        metalSheet.userData.half = new THREE.Vector3(
            (bb.max.x - bb.min.x) / 2,
            (bb.max.y - bb.min.y) / 2,
            (bb.max.z - bb.min.z) / 2
        );
        metalSheet.userData.thicknessMM = 10;
        
        metalSheet.castShadow = true;
        metalSheet.receiveShadow = true;
        scene.add(metalSheet);
        
        if (typeof workpieces !== 'undefined') workpieces.push(metalSheet);

        // Добавляем в глобальный список (чтобы гравитация и физика перетаскивания работали как у "заказанных" деталей)
        if (!window._weldInteractables) window._weldInteractables = [];
        window._weldInteractables.push(metalSheet);


        // =====================================================
        // 🛒 ТЕЛЕЖКА (EXACT COPY FROM SOURCE - SCALED 100x)
        // =====================================================
        
        const CART_SCALE = 100; // 1m -> 100 units
        const CART_PARAMS = {
          width: 1.4,           
          depth: 0.9,           
          platformThickness: 0.04, 
          wheelRadius: 0.075,   
          wallHeight: 0.12,     
          wallThickness: 0.025,
          handleHeight: 0.95,   
        };
        
        // Calculated Height
        const CART_HEIGHT_OFFSET = (CART_PARAMS.wheelRadius * 2 + 0.01) * CART_SCALE;

        // Globals
        window.carts = [];
        window.activeCart = null;
        window.isHoldingCart = false;
        window.cartContents = [];

        function createCart(x, z, rotationY = 0) {
          const cartGroup = new THREE.Group();
          cartGroup.userData.isCart = true;
          
          const s = CART_SCALE; // Local scale helper
          
          // Materials
          const frameMat = new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.5, metalness: 0.8 });
          const platformMat = new THREE.MeshStandardMaterial({ color: 0xE8ECF1, roughness: 0.7, metalness: 0.4 });
          const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });
          const gripMat = new THREE.MeshStandardMaterial({ color: 0x3355CC, roughness: 0.95 });
          
          const platformY = CART_HEIGHT_OFFSET;
          
          // ===== 1. ПЛАТФОРМА =====
          const platform = new THREE.Mesh(
            new THREE.BoxGeometry(CART_PARAMS.width * s, CART_PARAMS.platformThickness * s, CART_PARAMS.depth * s),
            platformMat
          );
          platform.position.y = platformY;
          platform.castShadow = true; platform.receiveShadow = true;
          cartGroup.add(platform);
          
          // ===== 2. РАМА ПОД ПЛАТФОРМОЙ =====
          const frameBeamGeo = new THREE.BoxGeometry(CART_PARAMS.width * s - 0.1 * s, 0.04 * s, 0.05 * s);
          
          const frontBeam = new THREE.Mesh(frameBeamGeo, frameMat);
          frontBeam.position.set(0, platformY - (CART_PARAMS.platformThickness * s)/2 - 0.02 * s, (CART_PARAMS.depth * s)/2 - 0.08 * s);
          frontBeam.castShadow = true; cartGroup.add(frontBeam);
          
          const backBeam = new THREE.Mesh(frameBeamGeo, frameMat);
          backBeam.position.set(0, platformY - (CART_PARAMS.platformThickness * s)/2 - 0.02 * s, -(CART_PARAMS.depth * s)/2 + 0.08 * s);
          backBeam.castShadow = true; cartGroup.add(backBeam);
          
          const crossBeamGeo = new THREE.BoxGeometry(0.05 * s, 0.04 * s, CART_PARAMS.depth * s - 0.16 * s);
          const leftCross = new THREE.Mesh(crossBeamGeo, frameMat);
          leftCross.position.set(-(CART_PARAMS.width * s)/2 + 0.1 * s, platformY - (CART_PARAMS.platformThickness * s)/2 - 0.02 * s, 0);
          leftCross.castShadow = true; cartGroup.add(leftCross);
          
          const rightCross = new THREE.Mesh(crossBeamGeo, frameMat);
          rightCross.position.set((CART_PARAMS.width * s)/2 - 0.1 * s, platformY - (CART_PARAMS.platformThickness * s)/2 - 0.02 * s, 0);
          rightCross.castShadow = true; cartGroup.add(rightCross);
          
          // ===== 3. БОРТИКИ =====
          const wallTopY = platformY + (CART_PARAMS.platformThickness * s)/2 + (CART_PARAMS.wallHeight * s)/2;
          const frontWallGeo = new THREE.BoxGeometry(CART_PARAMS.width * s, CART_PARAMS.wallHeight * s, CART_PARAMS.wallThickness * s);
          const sideWallGeo = new THREE.BoxGeometry(CART_PARAMS.wallThickness * s, CART_PARAMS.wallHeight * s, CART_PARAMS.depth * s);
          
          const frontWall = new THREE.Mesh(frontWallGeo, frameMat);
          frontWall.position.set(0, wallTopY, (CART_PARAMS.depth * s)/2 - (CART_PARAMS.wallThickness * s)/2);
          frontWall.castShadow = true; cartGroup.add(frontWall);
          
          const backWall = new THREE.Mesh(frontWallGeo, frameMat);
          backWall.position.set(0, wallTopY, -(CART_PARAMS.depth * s)/2 + (CART_PARAMS.wallThickness * s)/2);
          backWall.castShadow = true; cartGroup.add(backWall);
          
          const leftWall = new THREE.Mesh(sideWallGeo, frameMat);
          leftWall.position.set(-(CART_PARAMS.width * s)/2 + (CART_PARAMS.wallThickness * s)/2, wallTopY, 0);
          leftWall.castShadow = true; cartGroup.add(leftWall);
          
          const rightWall = new THREE.Mesh(sideWallGeo, frameMat);
          rightWall.position.set((CART_PARAMS.width * s)/2 - (CART_PARAMS.wallThickness * s)/2, wallTopY, 0);
          rightWall.castShadow = true; cartGroup.add(rightWall);
          
          // ===== 4. КОЛЁСА =====
          const wheelGeo = new THREE.CylinderGeometry(CART_PARAMS.wheelRadius * s, CART_PARAMS.wheelRadius * s, 0.045 * s, 20);
          const hubGeo = new THREE.CylinderGeometry(CART_PARAMS.wheelRadius * s * 0.4, CART_PARAMS.wheelRadius * s * 0.4, 0.05 * s, 12);
          
          const wheelPositions = [
            [-(CART_PARAMS.width * s)/2 + 0.12 * s, (CART_PARAMS.depth * s)/2 - 0.12 * s],
            [(CART_PARAMS.width * s)/2 - 0.12 * s, (CART_PARAMS.depth * s)/2 - 0.12 * s],
            [-(CART_PARAMS.width * s)/2 + 0.12 * s, -(CART_PARAMS.depth * s)/2 + 0.12 * s],
            [(CART_PARAMS.width * s)/2 - 0.12 * s, -(CART_PARAMS.depth * s)/2 + 0.12 * s],
          ];
          
          wheelPositions.forEach(([wx, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(wx, CART_PARAMS.wheelRadius * s, wz);
            wheel.castShadow = true; cartGroup.add(wheel);
            
            const hub = new THREE.Mesh(hubGeo, frameMat);
            hub.rotation.z = Math.PI / 2;
            hub.position.set(wx, CART_PARAMS.wheelRadius * s, wz);
            cartGroup.add(hub);
            
            const bracketGeo = new THREE.BoxGeometry(0.04 * s, platformY - CART_PARAMS.wheelRadius * s - 0.02 * s, 0.06 * s);
            const bracket = new THREE.Mesh(bracketGeo, frameMat);
            bracket.position.set(wx, CART_PARAMS.wheelRadius * s + (platformY - CART_PARAMS.wheelRadius * s) / 2 - 0.01 * s, wz);
            bracket.castShadow = true; cartGroup.add(bracket);
          });

          // ===== 5. РУЧКА (Detailed) =====
          const handleGroup = new THREE.Group();
          // isCartHandle НЕ ставим на группу — чтобы боковые стойки не срабатывали
          
          const handleMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.4, metalness: 0.6 });
          
          const stickRadius = 0.014 * s;
          const stickOffsetX = CART_PARAMS.width * s / 2 - 0.12 * s;
          const stickZ = -CART_PARAMS.depth * s / 2 - 0.02 * s;
          
          const baseY = platformY + CART_PARAMS.platformThickness * s / 2;
          const handleTopY = CART_PARAMS.handleHeight * s;
          const bendRadius = 0.08 * s;
          const verticalHeight = handleTopY - baseY - bendRadius;
          
          // Стойки
          const stickGeo = new THREE.CylinderGeometry(stickRadius, stickRadius, verticalHeight, 12);
          const leftStick = new THREE.Mesh(stickGeo, handleMat);
          leftStick.position.set(-stickOffsetX, baseY + verticalHeight / 2, stickZ);
          leftStick.castShadow = true; handleGroup.add(leftStick);
          
          const rightStick = new THREE.Mesh(stickGeo, handleMat);
          rightStick.position.set(stickOffsetX, baseY + verticalHeight / 2, stickZ);
          rightStick.castShadow = true; handleGroup.add(rightStick);
          
          // Углы (Torus)
          const cornerGeo = new THREE.TorusGeometry(bendRadius, stickRadius, 12, 12, Math.PI / 2);
          const leftCorner = new THREE.Mesh(cornerGeo, handleMat);
          leftCorner.position.set(-stickOffsetX + bendRadius, handleTopY - bendRadius, stickZ);
          leftCorner.rotation.z = Math.PI / 2; leftCorner.castShadow = true; handleGroup.add(leftCorner);
          

          const rightCorner = new THREE.Mesh(cornerGeo, handleMat);
          rightCorner.position.set(stickOffsetX - bendRadius, handleTopY - bendRadius, stickZ);
          rightCorner.castShadow = true; handleGroup.add(rightCorner);
          
          // Перекладина
          const topBarWidth = (stickOffsetX * 2) - (bendRadius * 2);
          const topBarGeo = new THREE.CylinderGeometry(stickRadius, stickRadius, topBarWidth, 12);
          const topBar = new THREE.Mesh(topBarGeo, handleMat);
          topBar.rotation.z = Math.PI / 2;
          topBar.position.set(0, handleTopY, stickZ);
          topBar.castShadow = true;
          topBar.userData.isCartHandle = true; // Хватаемся тут
          handleGroup.add(topBar);

          // === НЕВИДИМЫЙ ХИТБОКС верхней перекладины (для удобного захвата) ===
          // 120 унит по ширине, 60 по высоте/глубине — игрок легко попадёт прицелом
          const topBarHitGeo = new THREE.BoxGeometry(topBarWidth + 20, 60, 60);
          const topBarHit = new THREE.Mesh(
              topBarHitGeo,
              new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
          );
          topBarHit.position.set(0, handleTopY, stickZ);
          topBarHit.userData.isCartHandle = true;
          handleGroup.add(topBarHit);
          
          // Крепления к бортику
          const bracketW = 0.05 * s, bracketH = 0.08 * s, bracketD = 0.025 * s;
          const bracketGeoMain = new THREE.BoxGeometry(bracketW, bracketH, bracketD);
          const bracketMatMain = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5, metalness: 0.7 });
          
          const leftB = new THREE.Mesh(bracketGeoMain, bracketMatMain);
          leftB.position.set(-stickOffsetX, baseY + bracketH/2, -CART_PARAMS.depth * s/2 + CART_PARAMS.wallThickness * s/2);
          leftB.castShadow = true; handleGroup.add(leftB);
          
          const rightB = new THREE.Mesh(bracketGeoMain, bracketMatMain);
          rightB.position.set(stickOffsetX, baseY + bracketH/2, -CART_PARAMS.depth * s/2 + CART_PARAMS.wallThickness * s/2);
          rightB.castShadow = true; handleGroup.add(rightB);
          
          // Грипсы
          const gripLength = 0.18 * s;
          const gripRadius = 0.022 * s;
          const gripGeoMain = new THREE.CylinderGeometry(gripRadius, gripRadius, gripLength, 12);
          
          const leftGrip = new THREE.Mesh(gripGeoMain, gripMat);
          leftGrip.rotation.z = Math.PI / 2;
          leftGrip.position.set(-stickOffsetX * 0.5, handleTopY, stickZ);
          leftGrip.castShadow = true; handleGroup.add(leftGrip);
          
          const rightGrip = new THREE.Mesh(gripGeoMain, gripMat);
          rightGrip.rotation.z = Math.PI / 2;
          rightGrip.position.set(stickOffsetX * 0.5, handleTopY, stickZ);
          rightGrip.castShadow = true; handleGroup.add(rightGrip);
          
          cartGroup.add(handleGroup);
          
          // ===== КОЛЛАЙДЕР ПЛАТФОРМЫ =====
          const platformCollider = new THREE.Mesh(
            new THREE.BoxGeometry(CART_PARAMS.width * s - 0.06 * s, 1, CART_PARAMS.depth * s - 0.06 * s),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          platformCollider.position.y = platformY + CART_PARAMS.platformThickness * s / 2 + 0.5;
          platformCollider.userData.isCartPlatform = true;
          cartGroup.add(platformCollider);

          cartGroup.position.set(x, 0, z);
          cartGroup.rotation.y = rotationY;
          
          scene.add(cartGroup);
          carts.push(cartGroup);
          
          return cartGroup;
        }

        // РАЗМЕЩЕНИЕ ТЕЛЕЖЕК: вдоль стены с шкафами электродов (X=1000), в линейку по Z.
        // Тележка 2 (Z=1080) ближе к спавну рабочего, тележка 1 выставлена еще левее (Z=1240),
        // чтобы они не накладывались друг на друга (учитывая их габариты 140 унит по Z при повороте).
        // Поворот -Math.PI/2: верхняя перекладина ручки смотрит в сторону зала (+X от стены).
        createCart(1500, 2300, -Math.PI / 2); // тележка 1 — левее второй
        createCart(1600, 2300, -Math.PI / 2); // тележка 2 — ближе к точке появления рабочего

        // Вспомогательная функция Clamp
        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

        function checkCartHandleHit() {
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            
            // Собираем все тележки для проверки
            const targets = [...carts];
            
            // Recursive = true, чтобы найти детей (ручки)
            const hits = raycaster.intersectObjects(targets, true);
            
            for (const hit of hits) {
                // Поднимаемся вверх по иерархии от детали к объекту с userData
                let obj = hit.object;
                while(obj) {
                    // Если нашли пометку ручки
                    if (obj.userData.isCartHandle) {
                        // Ищем корневую группу самой тележки (поднимаемся еще выше)
                        let root = obj;
                        while(root && !root.userData.isCart) {
                            root = root.parent;
                        }
                    if (root && root.userData.isCart) {
                            return { cart: root, dist: hit.distance };
                        }
                    }
                    obj = obj.parent;
                }
            }
            return null;
        }

        function getCartPlatformY(cartObj) {
            const s = CART_SCALE; // 100
            if (!cartObj) return 0;
            // Позиция Y тележки + высота колес/рамы + половина толщины платформы + зазор
            return cartObj.position.y + CART_HEIGHT_OFFSET + (CART_PARAMS.platformThickness * s)/2 + 0.5;
        }

        function isInsideCart(wp, cartObj) {
            if (!cartObj) return false;
            const s = CART_SCALE;

            const cartWorldPos = cartObj.position;
            const wpPos = wp.position;

            // Вектор от центра тележки до детали
            const relX = wpPos.x - cartWorldPos.x;
            const relZ = wpPos.z - cartWorldPos.z;
            const relY = wpPos.y - cartWorldPos.y;

            // Обратное вращение (переводим в локальные координаты тележки)
            const cos = Math.cos(-cartObj.rotation.y);
            const sin = Math.sin(-cartObj.rotation.y);
            const localX = relX * cos - relZ * sin;
            const localZ = relX * sin + relZ * cos;

            const halfW = (CART_PARAMS.width * s) / 2 - 5;
            const halfD = (CART_PARAMS.depth * s) / 2 - 5;

            // Высота рабочей поверхности тележки (локально от позиции тележки)
            const platformTopLocal = CART_HEIGHT_OFFSET + (CART_PARAMS.platformThickness * s) / 2;
            const wallTopLocal = platformTopLocal + (CART_PARAMS.wallHeight * s) + 80;

            return (
                Math.abs(localX) < halfW &&
                Math.abs(localZ) < halfD &&
                relY >= platformTopLocal - 15 &&
                relY <= wallTopLocal
            );
        }
        function updateCartContents() {
            if (!activeCart) {
                cartContents = [];
                return;
            }
            const tempContents = new Set();
            workpieces.forEach(wp => {
                if (isInsideCart(wp, activeCart)) {
                    if (wp.userData.groupId) {
                        // Если деталь в группе, добавляем всю группу целиком
                        workpieces.forEach(w => {
                            if (w.userData.groupId === wp.userData.groupId) {
                                tempContents.add(w);
                            }
                        });
                    } else {
                        tempContents.add(wp);
                    }
                }
            });
            cartContents = Array.from(tempContents);
        }

            function moveActiveCart(dt) {
            if (!activeCart || !isHoldingCart) return;

            // ВАЖНО: собираем список деталей до перемещения и поворота тележки
            updateCartContents();

            const speed = 350.0;
            let moveX = 0, moveZ = 0;

            // Направление из камеры
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            const yaw = Math.atan2(camDir.x, camDir.z);

            const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

            if (keyState['KeyW']) { moveX += forward.x; moveZ += forward.z; }
            if (keyState['KeyS']) { moveX -= forward.x; moveZ -= forward.z; }
            // A/D отключены при управлении тележкой — поворот только через мышь

            const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (len > 0) {
                moveX = (moveX / len) * speed * dt;
                moveZ = (moveZ / len) * speed * dt;
            }

            // --- Поворот: тележка развёрнута передом к игроку ---
            const oldPos = activeCart.position.clone();
            const oldRot = activeCart.rotation.y;

            // --- Целевой угол: тележка развёрнута передом (платформой) к игроку ---
            const targetRotation = yaw;
            let deltaRot = targetRotation - oldRot;
            while (deltaRot > Math.PI) deltaRot -= Math.PI * 2;
            while (deltaRot < -Math.PI) deltaRot += Math.PI * 2;

            const rotSpeed = 0.08; // Плавность поворота (из донора)
            const actualDeltaRot = deltaRot * rotSpeed;
            activeCart.rotation.y = oldRot + actualDeltaRot;

            // --- Перемещение ---
            let newX = oldPos.x + moveX;
            let newZ = oldPos.z + moveZ;

            const limit = 8000;
            newX = Math.max(-limit, Math.min(limit, newX));
            newZ = Math.max(-limit, Math.min(limit, newZ));

            activeCart.position.set(newX, activeCart.position.y, newZ);

            // --- Проверка коллизии тележки со стенами ---
            if (moveX !== 0 || moveZ !== 0) {
                const checkCartWallCollision = () => {
                    const cx = activeCart.position.x;
                    const cz = activeCart.position.z;
                    const radius = 35; // Минимальный радиус хитбокса тележки для легкого скольжения
                    
                    // Проверяем статические стены
                    for (const wall of wallsForCollision) {
                        const dx = wall.x2 - wall.x1; 
                        const dz = wall.z2 - wall.z1;
                        const l2 = dx*dx + dz*dz;
                        if (l2 === 0) continue;
                        let t = ((cx - wall.x1) * dx + (cz - wall.z1) * dz) / l2;
                        t = Math.max(0, Math.min(1, t));
                        const projX = wall.x1 + t * dx; 
                        const projZ = wall.z1 + t * dz;
                        const distSq = (cx - projX)**2 + (cz - projZ)**2;
                        if (distSq < (radius + wall.thickness/2)**2) return true;
                    }
                    
                    // Проверяем статические препятствия (столы, архивы)
                    if (typeof boxColliders !== 'undefined') {
                        for (const box of boxColliders) {
                            const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
                            const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
                            const dx = cx - closestX;
                            const dz = cz - closestZ;
                            if (dx*dx + dz*dz < radius*radius) return true;
                        }
                    }
                    
                    return false;
                };
                
                if (checkCartWallCollision()) {
                    activeCart.position.copy(oldPos);
                }
            }

            // --- Привязка игрока перед тележкой ---
            const s = CART_SCALE;
            const handleDist = (CART_PARAMS.depth * s / 2) + 80;

            // Игрок спереди тележки: смещаем по вектору Z тележки (передняя часть)
            const proposedCartRot = activeCart.rotation.y;
            const dirX = Math.sin(proposedCartRot);
            const dirZ = Math.cos(proposedCartRot);

            const proposedCamX = activeCart.position.x - dirX * handleDist;
            const proposedCamZ = activeCart.position.z - dirZ * handleDist;

            // Проверяем коллизию позиции камеры со стенами
            const canPlaceCamera = !checkCollision({x: proposedCamX, z: proposedCamZ});
            
            if (canPlaceCamera) {
                // Позиция безопасна - устанавливаем камеру
                camera.position.x = proposedCamX;
                camera.position.z = proposedCamZ;
            } else {
                // Столкновение со стеной - откатываем движение тележки
                activeCart.position.copy(oldPos);
                activeCart.rotation.y = oldRot;
                // Устанавливаем камеру на старую безопасную позицию
                const oldDirX = Math.sin(oldRot);
                const oldDirZ = Math.cos(oldRot);
                camera.position.x = oldPos.x - oldDirX * handleDist;
                camera.position.z = oldPos.z - oldDirZ * handleDist;
            }
            
            camera.position.y = EYE_HEIGHT;

            // --- Двигаем содержимое тележки ---
            // ВАЖНО: Двигаем детали только после всех откатов коллизий, чтобы они не съезжали с тележки!

            const finalDeltaRot = activeCart.rotation.y - oldRot;
            
            // Если тележка вообще не сдвинулась и не повернулась (оба = 0) - пропускаем цикл деталей
            if (finalDeltaRot === 0 && activeCart.position.equals(oldPos)) {
                return;
            }

            const axisY = new THREE.Vector3(0, 1, 0);
            const cartPlatY = getCartPlatformY(activeCart);
            const rotQ = new THREE.Quaternion().setFromAxisAngle(axisY, finalDeltaRot);

            cartContents.forEach(wp => {
                // 1. Вектор от СТАРОГО центра тележки до детали
                const offset = new THREE.Vector3().subVectors(wp.position, oldPos);

                // 2. Поворачиваем вектор вместе с тележкой
                offset.applyAxisAngle(axisY, finalDeltaRot);

                // 3. Новая позиция = новый центр + повёрнутый вектор
                wp.position.copy(activeCart.position).add(offset);

                // 4. Вращаем саму деталь
                wp.quaternion.premultiply(rotQ);

                // 5. Антипровал сквозь платформу (только для деталей непосредственно над тележкой)
                if (isInsideCart(wp, activeCart)) {
                    const wpOffs = getRotatedAABB(wp);
                    const minY = cartPlatY - wpOffs.minY + EPS_Y_MAIN;
                    if (wp.position.y < minY) wp.position.y = minY;
                }

                wp.updateMatrixWorld();
            });
        }

        // =====================================================
        // 🧑‍🏭 WORKER LOGIC
        // =====================================================
        const PRELOADED_WORKERS = [
          {
            "name": "Сборщик-Сварщик",
            "type": "1",
            "position": {
              "x": 1300,
              "y": 0,
              "z": 1500 // Было 1350, стало 1500 (подальше от стола)
            }
          },
          {
            "name": "Архивариус",
            "type": "1",
            "position": {
              // Перемещен в комнату служебных работников
              "x": 1067, 
              "y": 0, 
              "z": 159
            }
          },
          {
            "name": "Технолог",
            "type": "1",
            "position": {
              "x": 1450, // Напротив стола 1
              "y": 0,
              "z": 350   // За стулом
            }
          },
          {
            "name": "Плановик",
            "type": "1",
            "position": {
              "x": 1900, // Напротив стола 2
              "y": 0,
              "z": 350
            }
          },
          {
            "name": "Снабженец",
            "type": "1",
            "position": {
              "x": 2350, // Напротив стола 3
              "y": 0,
              "z": 350
            }
          }
        ];

        const workers = [];
        const raycaster = new THREE.Raycaster();
        let supervisorMesh = null; // The "Nachalnik" mesh
        
        // --- Worker Generation Utilities ---
        
        // Helper to determine gender from Russian names
        function getGender(name) {
            if (!name) return 'male';
            const lower = name.trim().toLowerCase();
            const maleExceptions = ['илья', 'никита', 'данила', 'саша', 'женя', 'паша', 'сережа', 'ваня', 'миша', 'слава']; 
            if (maleExceptions.includes(lower)) return 'male';
            if (lower.endsWith('а') || lower.endsWith('я')) return 'female';
            return 'male';
        }

        // Helper for consistent randomization based on name
        function stringToSeed(str) {
            let hash = 0;
            if (str.length === 0) return hash;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash);
        }

        function seededRandom(rngRef) {
            const x = Math.sin(rngRef.val++) * 10000;
            return x - Math.floor(x);
        }

        function hexToRgb(hex) {
            return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
        }
        
        function rgbToHex(r, g, b) {
            return (r << 16) | (g << 8) | b;
        }

        function varyColor(hexColor, rngRef, amount = 20) {
            const rgb = hexToRgb(hexColor);
            const noise = () => (seededRandom(rngRef) - 0.5) * 2 * amount;
            
            const r = Math.max(0, Math.min(255, Math.floor(rgb.r + noise())));
            const g = Math.max(0, Math.min(255, Math.floor(rgb.g + noise())));
            const b = Math.max(0, Math.min(255, Math.floor(rgb.b + noise())));
            
            return rgbToHex(r, g, b);
        }

        function createHighQualityWorker(name, type) {
            const group = new THREE.Group();

            // ── Seed & variation ─────────────────────────────────────────────
            const seed = stringToSeed(name || 'Worker');
            const rng  = { val: seed };
            const isFem = (getGender(name) === 'female') && (type === '3');
            const pick  = arr => arr[Math.floor(seededRandom(rng) * arr.length)];
            const hs = 1.0 + (seededRandom(rng) * 0.08 - 0.04); // height scale
            const ws = 0.96 + seededRandom(rng) * 0.08;          // width scale

            // ── Color palette ───────────────────────────────────────────────
            const skinHex = pick([0xfff0dc, 0xffe4c8, 0xffdab6, 0xffcfa0, 0xf5c38e, 0xebb880]);
            const hairHex = pick([0x1a0a00, 0x3d1f05, 0x6b3318, 0xa0612d, 0xb89448, 0x7a8c96, 0x3a3535]);
            const pantHex = pick([0x7D8A9A, 0xA8AEB8]);

            let shirtHex, vestHex = null, hatHex = null;
            if (type === '1') {
                shirtHex = pick([0xE8ECF1, 0xA8AEB8]);
                vestHex  = pick([0x3355CC, 0x5AAFDD, 0xE6A817]);
                hatHex   = pick([0xE6A817, 0x5AAFDD]);
            } else if (type === '2') {
                shirtHex = 0xE8ECF1;
                vestHex  = 0xE03030;
                hatHex   = 0xE8ECF1;
            } else {
                shirtHex = pick([0xE8ECF1, 0xA8AEB8, 0x7D8A9A]);
            }

            // ── Material factories ──────────────────────────────────────────
            const S = (color, r = 0.85) => new THREE.MeshStandardMaterial({
                color, roughness: r, flatShading: true
            });
            const F = color => new THREE.MeshBasicMaterial({ color });

            const M = {
                skin  : S(skinHex, 0.78),
                pant  : S(pantHex, 0.90),
                shirt : S(shirtHex, 0.85),
                vest  : vestHex ? S(vestHex, 0.60) : null,
                hat   : hatHex  ? new THREE.MeshStandardMaterial({ color: hatHex, roughness: 0.50, flatShading: true, side: THREE.DoubleSide }) : null,
                hair  : S(hairHex, 0.92),
                shoe  : S(0x141010, 0.95),
                white : F(0xf0ece6),
                pupil : F(0x0d0d0d),
            };

            const mk = (geo, mat) => {
                const m = new THREE.Mesh(geo, mat);
                m.castShadow = true;
                return m;
            };

            // ── Proportions (all in scene units ~mm) ────────────────────────
            //   Ground plane = Y 0
            const SH  = 5;          // shoe height
            const LH  = 66 * hs;   // leg height (entire)
            const LW  = 9  * ws;   // leg width
            const LD  = 8  * ws;   // leg depth
            const LSX = 8  * ws;   // half-gap between legs

            const TWB = 18 * ws;   // torso width at waist
            const TWS = 26 * ws;   // torso width at shoulders
            const TDB = 12 * ws;   // torso depth
            const TH  = 50 * hs;   // torso total height
            // bottom of torso:
            const TBY = SH + LH;
            // center of bottom torso section (waist):
            const TLH = TH * 0.42; // lower torso height
            const TUH = TH * 0.58; // upper torso height
            const TLY = TBY + TLH / 2;
            const TUY = TBY + TLH + TUH / 2;

            const NH  = 6;
            const NY  = TBY + TH + NH / 2;

            const HW  = 17 * ws;   // head width
            const HH  = 19 * hs;   // head height
            const HDd = 14 * ws;   // head depth
            const HY  = NY + NH / 2 + HH / 2;

            const AW  = 7.5 * ws;  // arm width/depth
            const AUH = 26 * hs;   // upper arm height
            const AFH = 22 * hs;   // forearm height
            // arm pivot at shoulder top
            const APY = TBY + TLH + TUH - 4;
            // APX = arm pivot X: arm center aligned with torso edge (inner half embedded → no z-fight)
            const APX = TWS / 2;

            // ── FEET ────────────────────────────────────────────────────────
            for (const s of [-1, 1]) {
                const shoe = mk(new THREE.BoxGeometry(LW * 1.15, SH, LD * 1.5), M.shoe);
                shoe.position.set(s * LSX, SH / 2, LD * 0.18);
                group.add(shoe);
            }

            // ── LEGS ────────────────────────────────────────────────────────
            for (const s of [-1, 1]) {
                const leg = mk(new THREE.BoxGeometry(LW, LH, LD), M.pant);
                leg.position.set(s * LSX, SH + LH / 2, 0);
                group.add(leg);
            }

            // ── TORSO (two-section: waist + shoulders) ───────────────────────
            const torsoLow = mk(new THREE.BoxGeometry(TWB, TLH, TDB), M.shirt);
            torsoLow.position.set(0, TLY, 0);
            group.add(torsoLow);

            const torsoUp = mk(new THREE.BoxGeometry(TWS, TUH, TDB), M.shirt);
            torsoUp.position.set(0, TUY, 0);
            group.add(torsoUp);

            const chest = torsoUp; // animation reference

            // Vest + hi-vis stripe (type 1 & 2)
            if (M.vest) {
                // Offset Y by 0.5 to break coplanar top/bottom faces with shirt (prevents z-fighting)
                const vestMesh = mk(new THREE.BoxGeometry(TWS + 2, TUH - 0.5, TDB + 2), M.vest);
                vestMesh.position.set(0, TUY - 0.25, 0);
                group.add(vestMesh);

                // Reflective stripe
                const stripeMat = F(0xe8d840);
                const stripe = mk(new THREE.BoxGeometry(TWS + 5, 4.5, TDB + 5), stripeMat);
                stripe.position.set(0, TUY + TUH * 0.18, 0);
                group.add(stripe);
            }

            // ── NECK ─────────────────────────────────────────────────────────
            const neck = mk(new THREE.CylinderGeometry(3.8 * ws, 5.0 * ws, NH, 6), M.skin);
            neck.position.set(0, NY, 0);
            group.add(neck);

            // ── ARMS (groups for animation) ───────────────────────────────────
            const buildArm = (side) => {
                const ag = new THREE.Group();
                ag.position.set(side * APX, APY, 0);
                // slight base splay
                ag.rotation.z = side * (0.08 + seededRandom(rng) * 0.06);
                ag.rotation.x = (seededRandom(rng) - 0.5) * 0.08;

                // Upper arm (shirt/vest color)
                const ua = mk(new THREE.BoxGeometry(AW, AUH, AW * 0.90),
                              M.vest || M.shirt);
                ua.position.y = -AUH / 2;
                ag.add(ua);

                // Forearm (skin)
                const fa = mk(new THREE.BoxGeometry(AW * 0.85, AFH, AW * 0.82), M.skin);
                fa.position.y = -AUH - AFH / 2;
                ag.add(fa);

                // Hand (skin, slightly wider)
                const hand = mk(new THREE.BoxGeometry(AW * 0.95, AW * 0.85, AW * 0.70), M.skin);
                hand.position.y = -AUH - AFH - AW * 0.42;
                ag.add(hand);

                return ag;
            };

            const armL = buildArm(-1);
            const armR = buildArm( 1);
            group.add(armL);
            group.add(armR);

            // ── HEAD GROUP ───────────────────────────────────────────────────
            const headGroup = new THREE.Group();
            headGroup.position.set(0, HY, 0);
            group.add(headGroup);

            const headMesh = mk(new THREE.BoxGeometry(HW, HH, HDd), M.skin);
            headGroup.add(headMesh);

            // Ears
            for (const s of [-1, 1]) {
                const ear = mk(new THREE.BoxGeometry(2.5, 6.5, 4.5), M.skin);
                ear.position.set(s * (HW / 2 + 1.2), -HH * 0.04, 0);
                headGroup.add(ear);
            }

            // Eyes
            const FZ = HDd / 2 + 0.3;
            const EX = HW * 0.215;
            const EY = HH * 0.07;
            for (const s of [-1, 1]) {
                // White sclera
                const ew = mk(new THREE.BoxGeometry(4.8, 3.6, 0.4), M.white);
                ew.position.set(s * EX, EY, FZ);
                headGroup.add(ew);
                // Dark iris+pupil
                const ep = mk(new THREE.BoxGeometry(3.0, 3.0, 0.5), M.pupil);
                ep.position.set(s * EX, EY, FZ + 0.2);
                headGroup.add(ep);
            }

            // Simple nose (tiny bump)
            const nose = mk(new THREE.BoxGeometry(3.5, 3 + seededRandom(rng) * 2, 3), M.skin);
            nose.position.set(0, -HH * 0.04, FZ + 1.2);
            headGroup.add(nose);

            // ── HAIR / HAT ───────────────────────────────────────────────────
            if (M.hat) {
                const hatG = new THREE.Group();
                const SEAT  = HH / 2 + 0.5;   // shell base rests just above head
                hatG.position.set(0, SEAT, 0); // hatG Y=0 = shell base level
                headGroup.add(hatG);

                const HR    = HW * 0.60 * 1.05;   // shell belt radius (+5% larger hat)
                const HD    = HR * 0.72;       // dome height above seat (realistic ratio ~0.72)
                const BRIMR = HR * 1.40;       // brim outer radius (40% overhang beyond shell)

                const pts = [
                    new THREE.Vector2(0,            HD),
                    new THREE.Vector2(HR * 0.16,    HD * 0.992),
                    new THREE.Vector2(HR * 0.38,    HD * 0.958),
                    new THREE.Vector2(HR * 0.58,    HD * 0.890),
                    new THREE.Vector2(HR * 0.76,    HD * 0.778),
                    new THREE.Vector2(HR * 0.90,    HD * 0.618),
                    new THREE.Vector2(HR * 0.99,    HD * 0.410),
                    new THREE.Vector2(HR * 1.020,   HD * 0.180),
                    new THREE.Vector2(HR * 1.025,   HD * 0.055),
                    new THREE.Vector2(HR * 1.000,   0),
                    new THREE.Vector2(HR * 1.080,   -1.4),
                    new THREE.Vector2(HR * 1.220,   -2.5),
                    new THREE.Vector2(BRIMR * 0.88, -3.2),
                    new THREE.Vector2(BRIMR,        -4.8),
                ];
                const shellGeo  = new THREE.LatheGeometry(pts, 24);
                const shellMesh = mk(shellGeo, M.hat);
                hatG.add(shellMesh);

                const PEAK_W  = HR * 2.05;   // total width
                const PEAK_D  = 7.0;         // depth (forward beyond brim)
                const PEAK_TH = 1.4;         // thin visor thickness
                const CR      = 2.4;         // outer corner radius
                const hw = PEAK_W / 2;
                const peakShape = new THREE.Shape();
                peakShape.moveTo(-hw, 0);
                peakShape.lineTo( hw, 0);
                peakShape.lineTo( hw, PEAK_D - CR);
                peakShape.quadraticCurveTo( hw, PEAK_D,  hw - CR, PEAK_D);
                peakShape.lineTo(-hw + CR, PEAK_D);
                peakShape.quadraticCurveTo(-hw, PEAK_D, -hw, PEAK_D - CR);
                peakShape.closePath();
                const peakGeo = new THREE.ExtrudeGeometry(peakShape, {
                    depth: PEAK_TH,
                    bevelEnabled: false,
                    steps: 1
                });
                const peak = mk(peakGeo, M.hat);
                peak.rotation.x = Math.PI / 2 + 0.18;
                peak.position.set(0, -1.8 - PEAK_TH * 0.5, BRIMR * 0.68);
                hatG.add(peak);

                const suspMat = S(0x160800, 0.97);
                const susp    = mk(
                    new THREE.CylinderGeometry(HR * 0.87, HR * 0.87, 4.5, 16),
                    suspMat
                );
                susp.position.set(0, 2.0, 0);
                hatG.add(susp);

                const nape = mk(new THREE.BoxGeometry(HW * 0.70, 5, 4.5), M.hair);
                nape.position.set(0, SEAT - 4.5, -HDd / 2 - 2.5);
                headGroup.add(nape);
            } else {
                const capR = HW * 0.57;
                const cap = mk(
                    new THREE.SphereGeometry(capR, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2.1),
                    M.hair
                );
                cap.position.set(0, HH / 2 - 0.8, 0);
                headGroup.add(cap);

                const nape = mk(new THREE.BoxGeometry(HW * 0.80, HH * 0.40, 4.5), M.hair);
                nape.position.set(0, HH * 0.02, -HDd / 2 - 2.2);
                headGroup.add(nape);

                if (isFem) {
                    const bun = mk(new THREE.SphereGeometry(5.5, 7, 6), M.hair);
                    bun.position.set(0, HH * 0.04, -HDd / 2 - 5.5);
                    headGroup.add(bun);
                }
            }

            // ── ANIMATION REFS ───────────────────────────────────────────────
            group.userData.breathRate   = 0.7  + seededRandom(rng) * 0.5;
            group.userData.breathOffset = seededRandom(rng) * Math.PI * 2;
            group.userData.headBaseY    = HY;
            group.userData.headRef      = headGroup;
            group.userData.armL         = armL;
            group.userData.armR         = armR;
            group.userData.armLBaseZ    = armL.rotation.z;
            group.userData.armRBaseZ    = armR.rotation.z;
            group.userData.breathParts  = [chest];

            // Scale entire model 1.36× (original proportions ×1.7 − 20%)
            group.scale.set(1.36, 1.36, 1.36);

            return group;
        }

        // --- Initialize Preloaded Workers ---
        function addWorkerToScene(name, type, pos) {
             const workerMesh = createHighQualityWorker(name, type);
             workerMesh.position.set(pos.x, pos.y, pos.z);
             
             // Random rotation for natural look
             workerMesh.rotation.y = Math.random() * Math.PI * 2;
             
             scene.add(workerMesh);
             
             let professionTitle = name; 

             let labelColor = '#ffffff';
             if (type === '1') labelColor = '#facc15'; // Желтый для рабочих
             if (type === '2') labelColor = '#ef4444'; // Красный для начальника
             if (type === '3') labelColor = '#60a5fa'; // Голубой для офисных

             const label = createTextSprite(professionTitle, labelColor, 40);
             label.position.set(0, 200, 0); // Above detailed head
             workerMesh.add(label);
             
             // Add Red Dot for Possession (Top Down Mode)
             const dot = new THREE.Sprite(redDotMaterial);
             dot.position.set(0, 230, 0);
             dot.scale.set(40, 40, 1);
             dot.visible = false; // Hidden by default
             workerMesh.add(dot);
             
             const workerObj = {
                 name: name,
                 type: type,
                 position: { x: pos.x, y: pos.y, z: pos.z },
                 mesh: workerMesh,
                 label: label,
                 dot: dot
             };
             
             workers.push(workerObj);
             workerMesh.userData.worker = workerObj; // Link back for raycasting
        }

        PRELOADED_WORKERS.forEach(w => {
            addWorkerToScene(w.name, w.type, w.position);
        });

        function initSupervisor() {
            supervisorMesh = createHighQualityWorker("Начальник", "2");
            supervisorMesh.visible = false; 
            const dot = new THREE.Sprite(redDotMaterial);
            dot.position.set(0, 230, 0); dot.scale.set(40, 40, 1); dot.visible = false; 
            supervisorMesh.add(dot);
            supervisorMesh.userData.isSupervisor = true; supervisorMesh.userData.dot = dot;
            scene.add(supervisorMesh);
        }
        initSupervisor();

        function createMainRoofBeam() {
            // Assuming materials are globally available from 03_materials.js
            if (typeof materials === 'undefined' || !materials.steel) {
                console.warn("Materials not ready for roof beam.");
                return;
            }

            // Dimensions derived from BUILDING_DATA in 01_data_and_constants.js
            const minX = 0, maxX = 6600;
            const minZ = 0, maxZ = 3300;
            const width = maxZ - minZ;
            
            // Удлиняем балку до самых концов цеха (включая свесы)
            const shellMinX = minX - 200;
            const shellMaxX = maxX + 200;
            const length = shellMaxX - shellMinX;
            const centerX = (shellMinX + shellMaxX) / 2;

            const spanCount = 2;
            const singleSpan = width / spanCount;
            const trussHeight = 120; // Assuming from previous context
            const colHeight = WALL_HEIGHT; // from 01_data_and_constants.js

            // Z позиция центрального конька (половина ширины цеха по Z)
            const ridgeBeamZ = minZ + singleSpan;
            // Y позиция: самая вершина ферм — конёк крыши
            const ridgeBeamY = colHeight + trussHeight - 120;

            const beam = new THREE.Mesh(
                new THREE.BoxGeometry(length, 40, 40), // 40x40 cm beam profile
                materials.steel
            );

            beam.position.set(centerX, ridgeBeamY, ridgeBeamZ);
            beam.castShadow = true;
            scene.add(beam);
        }
        createMainRoofBeam();

        // =====================================================
        // 🚂 ТРАНСПОРТНАЯ РЕЛЬСОВАЯ ТЕЛЕЖКА
        // =====================================================
        window.animatedTrolleys = [];

        function createTrolleySystem(x1, z1, x2, z2) {
            const rootGroup = new THREE.Group();
            const dx = x2 - x1, dz = z2 - z1;
            const trackLen = Math.hypot(dx, dz);
            if (trackLen < 15) return null;
            
            const angle = Math.atan2(dz, dx);
            rootGroup.position.set(x1, 0, z1);
            // +PI/2 разворачивает ось Z локальной группы точно по вектору от точки 1 к точке 2
            rootGroup.rotation.y = -angle + Math.PI / 2; 
            
            const scale = 50; // Адаптация под главную программу
            const trackGroup = new THREE.Group();
            trackGroup.scale.set(scale, scale, scale);
            rootGroup.add(trackGroup);

            const gauge = 4.0;
            const tLen = trackLen / scale;
            
            const hM = 0.42; // Высота увеличена на 20% (0.35 * 1.2)
            const lenM = 1.41; // Длина увеличена еще на 20%
            
            const trolleyHalfLen = (7.4 / 1.8) * lenM;

            const M = (c, r, m) => new THREE.MeshStandardMaterial({color: c, roughness: r, metalness: m});
            const matRail=M(0xb8c0ca,.2,.9); 
            const matSteelDark=M(0xc8ced8,.4,.6), matSteelMed=M(0xe8ecf1,.3,.4), matPlatform=M(0xffffff,.2,.2); 
            const matYellow=M(0x7ec8e3,.3,.3), matRedBumper=M(0x3355cc,.4,.2); 
            const matWood=M(0xffffff,.6,.1), matWoodDark=M(0xe8ecf1,.7,.1); 
            const matWheel=M(0x7d8a9a,.3,.7), matAxle=M(0x9db4cc,.2,.8);

            function box(w, h, d, mat, px, py, pz, parent) {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true;
                parent.add(m); return m;
            }
            function cyl(r, h, mat, px, py, pz, parent, axis) {
                const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
                m.position.set(px, py, pz);
                if (axis === 'x') m.rotation.x = Math.PI / 2;
                if (axis === 'z') m.rotation.z = Math.PI / 2;
                m.castShadow = true; m.receiveShadow = true;
                parent.add(m); return m;
            }

            const halfG = gauge / 2;
            
            // Продлеваем рельсы, чтобы тележка не свисала
            const railStart = -trolleyHalfLen - 2;
            const railEnd = tLen + trolleyHalfLen + 2;
            const railLen = railEnd - railStart;
            const railMid = (railStart + railEnd) / 2;

            [-1, 1].forEach(side => {
                const rx = side * halfG;
                // Приподнимаем рельсы: верхняя грань на y=0.01 (чтобы их было видно над полом)
                box(0.3, 0.06, railLen, matRail, rx, -0.22, railMid, trackGroup);
                box(0.1, 0.14, railLen, matRail, rx, -0.12, railMid, trackGroup);
                box(0.2, 0.06, railLen, matRail, rx, -0.02, railMid, trackGroup);
            });

            const trolleyGroup = new THREE.Group();
            const allWheels = [];
            
            const platL = (12 / 1.8) * lenM; 
            const platW = gauge + 1.5;
            const wheelR = 0.9 * hM; 
            const wheelW = 0.22; 
            const axleY = (0.47 * hM) + wheelR; 
            const frameBottom = axleY + wheelR + (0.05 * hM);

            [-1, 1].forEach(bSide => {
                const bz = bSide * (platL - 3 * lenM) / 2;
                const bg = new THREE.Group(); bg.position.set(0, 0, bz); trolleyGroup.add(bg);
                box(platW - 0.5, 0.35 * hM, 1.8 * lenM, matSteelDark, 0, frameBottom + 0.17 * hM, 0, bg);
                [-1, 1].forEach(ws => box(0.3, 0.55 * hM, 2.6 * lenM, matSteelMed, ws * halfG, axleY + wheelR * 0.3, 0, bg));

                [-1, 1].forEach(aSide => {
                    const az = aSide * 0.85 * lenM;
                    cyl(0.06 * hM, gauge + 0.6, matAxle, 0, axleY, az, bg, 'z');
                    [-1, 1].forEach(wSide => {
                        const wx = wSide * halfG;
                        const wGroup = new THREE.Group(); wGroup.position.set(wx, axleY, az); wGroup.rotation.z = Math.PI / 2;
                        const wBody = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 24), matWheel); wBody.castShadow = true; wGroup.add(wBody);
                        const fl = new THREE.Mesh(new THREE.CylinderGeometry(wheelR + 0.06 * hM, wheelR + 0.06 * hM, 0.03, 24), matWheel); fl.position.y = wSide * (wheelW / 2 + 0.01); fl.castShadow = true; wGroup.add(fl);
                        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.3, wheelR * 0.3, wheelW + 0.04, 12), matAxle); hub.castShadow = true; wGroup.add(hub);
                        bg.add(wGroup); allWheels.push({ group: wGroup, radius: wheelR });
                        box(0.18, 0.22 * hM, 0.22 * lenM, matSteelDark, wx, axleY, az, bg);
                    });
                });
                [-1, 1].forEach(ws => [-1, 1].forEach(as => { cyl(0.08, 0.25 * hM, matYellow, ws * (halfG - 0.3), frameBottom - 0.05 * hM, as * 0.6 * lenM, bg); box(0.25, 0.06 * hM, 0.25 * lenM, matSteelMed, ws * (halfG - 0.3), frameBottom + 0.08 * hM, as * 0.6 * lenM, bg); }));
                cyl(0.15 * hM, 0.4 * hM, matSteelDark, 0, frameBottom + 0.35 * hM, 0, bg);
            });

            const mainFrameY = frameBottom + 0.55 * hM, deckY = mainFrameY + 0.25 * hM;
            box(0.6, 0.5 * hM, platL + 0.5 * lenM, matSteelDark, 0, mainFrameY, 0, trolleyGroup);
            for (let i = -2; i <= 2; i++) box(platW - 0.3, 0.35 * hM, 0.25 * lenM, matSteelDark, 0, mainFrameY, i * (platL / 5), trolleyGroup);
            [-1, 1].forEach(s => box(0.25, 0.4 * hM, platL + 0.3 * lenM, matSteelMed, s * (platW / 2 - 0.3), mainFrameY, 0, trolleyGroup));
            box(platW, 0.1 * hM, platL, matPlatform, 0, deckY + 0.05 * hM, 0, trolleyGroup);

            for (let i = 0; i < 5; i++) {
                const cz = -platL / 2 + 1.5 * lenM + i * ((platL - 3 * lenM) / 4);
                box(platW - 1.5, 0.3 * hM, 0.5 * lenM, matWood, 0, deckY + 0.25 * hM, cz, trolleyGroup);
                [-1, 1].forEach(s => box(0.2, 0.5 * hM, 0.5 * lenM, matWoodDark, s * (platW / 2 - 1.0), deckY + 0.35 * hM, cz, trolleyGroup));
                box(platW - 2.0, 0.06 * hM, 0.4 * lenM, matWoodDark, 0, deckY + 0.43 * hM, cz, trolleyGroup);
            }

            const tBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
            boxColliders.push(tBox);
 
            // Ставим тележку на видимые рельсы
            const trolleyY = 0.01 - (0.47 * hM);
            const startPos = tLen / 2; // Примерно по центру цеха
            trolleyGroup.position.set(0, trolleyY, startPos); 
            trackGroup.add(trolleyGroup);
            scene.add(rootGroup);
 
            window.animatedTrolleys.push({
                mesh: trolleyGroup,
                wheels: allWheels,
                pos: startPos,
                dir: 1,
                speed: 3.0, 
                maxPos: tLen,
                wheelR: wheelR,
                pause: 0,
                boxCollider: tBox,
                platL: platL * scale,
                platW: platW * scale
            });
        }

        createTrolleySystem(400, 1846, 6200, 1846);

        // =====================================================
        // 🏗️ КРАН-БАЛКА (ИЗВЛЕЧЕНО ИЗ РАБОТЫ ПОДГОТОВКИ)
        // =====================================================
        window.buildThreeCrane = function(data) {
            const rootGroup = new THREE.Group();
            
            const dx = data.x2 - data.x1;
            const dz = data.y2 - data.y1;
            const trackLen = Math.hypot(dx, dz);
            if (trackLen < 5) return null;
            
            const angle = Math.atan2(dz, dx);
            rootGroup.position.set(data.x1, 0, data.y1);
            rootGroup.rotation.y = -angle + Math.PI / 2; 
            
            const scale = 25; // Скейл под сантиметры (1 unit = 1 cm)
            const craneScene = new THREE.Group();
            craneScene.scale.set(scale, scale, scale);
            rootGroup.add(craneScene);

            const toLocal = (wx, wy) => {
                const ldx = wx - data.x1;
                const ldz = wy - data.y1;
                const u = ldx * Math.cos(angle) + ldz * Math.sin(angle);
                const v = -ldx * Math.sin(angle) + ldz * Math.cos(angle);
                return { x: -v / scale, z: u / scale };
            };

            const pickLocal = toLocal(data.pickX, data.pickY);
            const dropLocal = toLocal(data.dropX, data.dropY);

            const matMetal   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.3 });
            const matYellow  = new THREE.MeshStandardMaterial({ color: 0xe6a817, roughness: 0.3, metalness: 0.2 });
            const matDark    = new THREE.MeshStandardMaterial({ color: 0xa8aeb8, roughness: 0.5, metalness: 0.4 });
            const matCable   = new THREE.MeshStandardMaterial({ color: 0xd0dbe8, roughness: 0.2, metalness: 0.9 });
            const matCargo   = new THREE.MeshStandardMaterial({ color: 0x5aafdd, roughness: 0.4 });
            const matWheel   = new THREE.MeshStandardMaterial({ color: 0x7d8a9a, roughness: 0.4, metalness: 0.6 });
            const matAxle    = new THREE.MeshStandardMaterial({ color: 0xc8ced8, roughness: 0.2, metalness: 0.8 });
            const matFlange  = new THREE.MeshStandardMaterial({ color: 0x9db4cc, roughness: 0.4, metalness: 0.5 });

            function box(w, h, d, mat, x, y, z, parent) {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
                parent.add(m); return m;
            }

            function createWheel(radius, width, parent, px, py, pz, rotAxis) {
                const wheelGroup = new THREE.Group(); wheelGroup.position.set(px, py, pz);
                const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), matWheel);
                wheel.castShadow = true; wheelGroup.add(wheel);
                const flangeR = radius * 1.25;
                const flangeGeo = new THREE.TorusGeometry(radius + (flangeR - radius) * 0.5, (flangeR - radius) * 0.5, 8, 24);
                const f1 = new THREE.Mesh(flangeGeo, matFlange); f1.position.y = width / 2; f1.rotation.x = Math.PI / 2; f1.castShadow = true; wheelGroup.add(f1);
                const f2 = f1.clone(); f2.position.y = -width / 2; wheelGroup.add(f2);
                const axle = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width * 1.8, 8), matAxle);
                axle.castShadow = true; wheelGroup.add(axle);
                if (rotAxis === 'x') wheelGroup.rotation.z = Math.PI / 2;
                else if (rotAxis === 'z') wheelGroup.rotation.x = Math.PI / 2;
                parent.add(wheelGroup); return wheelGroup;
            }

            // Размеры: spanW — ширина пролёта, colH — высота колонны (уменьшена для запаса под потолок)
            const spanW = data.spanW || 36, colH = 13, tLen = trackLen / scale;
            const colCount = data.colCount || Math.max(2, Math.ceil(tLen / 20) + 1);
            const actualSpacing = tLen / (colCount - 1);
            const halfW = spanW / 2;

            // Верхний рельс: главная балка + рельс-профиль
            // Центр главной балки: colH + 0.75, топ = colH + 1.5
            // Рельс (0.35 высоты): центр = colH + 1.50 + 0.175 = colH + 1.675, ТОП рельса = colH + 1.85
            const railTopY = colH + 1.85;   // Верхняя поверхность рельса (где катятся колёса)

            for (let i = 0; i < colCount; i++) {
                // "Считая сзади" (from the back) 1st is colCount (i.e. colCount - i == 1), 2nd is colCount - i == 2, etc.
                if (data.skipColsFromBack && data.skipColsFromBack.includes(colCount - i)) continue;

                const zz = i * actualSpacing;
                [-1, 1].forEach(side => {
                    const sx = side * halfW;
                    
                    let localZAdjusted = zz;
                    let worldZ = data.y1 + localZAdjusted * scale;
                    
                    const checkGateCollision = (xSide, zVal) => {
                        if (data.uniformSpacing) return { inGate: false };
                        if (xSide === -1) {
                            if (zVal >= 800 && zVal <= 1200) return { inGate: true, targetZ: 1210 };
                            if (zVal >= 1790 && zVal <= 2200) {
                                return { inGate: true, targetZ: zVal < 1997 ? 1770 : 2210 };
                            }
                        } else if (xSide === 1) {
                            if (zVal >= 1640 && zVal <= 2055) {
                                return { inGate: true, targetZ: zVal < 1845 ? 1620 : 2070 };
                            }
                        }
                        return { inGate: false };
                    };

                    const res = checkGateCollision(side, worldZ);
                    if (res.inGate) {
                        worldZ = res.targetZ;
                        localZAdjusted = (worldZ - data.y1) / scale;
                    }

                    // Колонна: основание + стойка + ребра жёсткости
                    box(2.2, 0.4, 2.2, matMetal, sx, 0.2, localZAdjusted, craneScene);  // Основание
                    box(1.0, colH, 0.4, matMetal, sx, colH / 2, localZAdjusted, craneScene);  // Стойка
                    box(1.0, 0.3, 1.0, matMetal, sx, 1.0, localZAdjusted, craneScene);  // Нижнее ребро
                    box(1.0, 0.3, 1.0, matMetal, sx, colH - 0.15, localZAdjusted, craneScene); // Верхнее ребро
                });
            }

            // Продольные рельсовые балки (I-профиль)
            [-1, 1].forEach(side => {
                const sx = side * halfW;
                // Нижний пояс I-балки
                box(1.8, 0.25, tLen + 2, matMetal, sx, colH + 0.125, tLen / 2, craneScene);
                // Стенка I-балки
                box(0.4, 1.5, tLen + 2, matMetal, sx, colH + 0.75, tLen / 2, craneScene);
                // Верхний пояс I-балки (рельс)
                box(1.2, 0.35, tLen + 2, matMetal, sx, colH + 1.675, tLen / 2, craneScene);
            });

            // === МОСТ КРАНА (craneGroup ездит вдоль рельсов по оси Z) ===
            // Колёса опираются на верхнюю поверхность рельса.
            // Центр колеса по Y = railTopY + wheelR
            const wheelR = 0.5, wheelW = 0.6;
            const bogieY = railTopY + wheelR;  // Центр колёс моста точно на рельсе
            const craneGroup = new THREE.Group(); craneScene.add(craneGroup);
            const bridgeWheels = []; // trolleyWheels удалён: тележка скользит без колёс

            [-1, 1].forEach(side => {
                const sx = side * halfW;
                // Букса (корпус тележки колёс) — прямо на рельсе
                box(2.2, 0.8, 4.5, matYellow, sx, bogieY + wheelR + 0.4, 0, craneGroup);
                // 2 колеса по оси Z (едут вдоль рельса), ось вращения X
                [-1, 1].forEach(fwd => {
                    const w = createWheel(wheelR, wheelW, craneGroup, sx, bogieY, fwd * 1.6, 'x');
                    bridgeWheels.push({ mesh: w, radius: wheelR });
                });
            });

            // === ГЛАВНАЯ БАЛКА МОСТА (жёлтая, сжатая по высоте) ===
            const bridgeBodyY = bogieY + wheelR + 0.8;
            const bridgeGap = 2.5;  // расстояние между двумя балками по Z
            const beamH = 1.0;      // Уменьшенная высота балки (было 1.5)

            [-1, 1].forEach(side => {
                const bz = side * bridgeGap / 2;
                // Стенка балки (уменьшена)
                box(spanW - 1, beamH, 0.45, matYellow, 0, bridgeBodyY + beamH / 2, bz, craneGroup);
                // Нижний пояс
                box(spanW - 1, 0.18, 1.1, matYellow, 0, bridgeBodyY, bz, craneGroup);
                // Верхний пояс
                box(spanW - 1, 0.18, 1.1, matYellow, 0, bridgeBodyY + beamH, bz, craneGroup);
                // Рельс тележки (тонкая металлическая полоска сверху балки)
                box(spanW - 1, 0.15, 0.18, matDark, 0, bridgeBodyY + beamH + 0.09, bz, craneGroup);
            });
            // Заглушка торца
            box(spanW - 1, 0.08, 0.9, matDark, 0, bridgeBodyY, bridgeGap / 2 + 1.1, craneGroup);

            // === ТЕЛЕЖКА (hoistGroup) — скользит по рельсу балки, БЕЗ КОЛЁС ===
            // Тележка опирается прямо на верхний пояс балки через скользящие «башмаки»
            const trolleyRailY = bridgeBodyY + beamH + 0.15; // Поверхность рельса тележки
            const trolleyFrameY = trolleyRailY + 0.25;       // Центр рамы тележки
            const hoistGroup = new THREE.Group(); craneGroup.add(hoistGroup);

            // Рама тележки (скользящая плита)
            box(3.2, 0.35, bridgeGap + 1.2, matDark, 0, trolleyFrameY, 0, hoistGroup);
            // Скользящие башмаки (4 штуки — вместо колёс)
            const matSkid = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.3, metalness: 0.7 });
            [-1, 1].forEach(sideZ => {
                const tz = sideZ * (bridgeGap / 2);
                [-1, 1].forEach(sideX => {
                    const tx = sideX * 1.0;
                    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.5), matSkid);
                    skid.position.set(tx, trolleyRailY + 0.08, tz);
                    hoistGroup.add(skid);
                });
            });

            // Барабан и мотор опущены на уровень рамы тележки
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 16), matDark);
            drum.rotation.x = Math.PI / 2; drum.position.set(-0.5, trolleyFrameY + 0.35, 0); drum.castShadow = true; hoistGroup.add(drum);
            box(1.2, 0.8, 1.0, matYellow, 1.0, trolleyFrameY + 0.4, 0, hoistGroup);

            const cableAnchorY = trolleyFrameY - 0.2;
            const cableGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8); cableGeo.translate(0, -0.5, 0);
            const cableMesh = new THREE.Mesh(cableGeo, matCable); cableMesh.position.set(0, cableAnchorY, 0); hoistGroup.add(cableMesh);

            const hookGroup = new THREE.Group(); hoistGroup.add(hookGroup);
            box(1.0, 0.8, 0.8, matYellow, 0, 0, 0, hookGroup);
            box(0.15, 0.6, 0.15, matDark, 0, -0.5, 0, hookGroup);
            box(0.15, 0.15, 0.5, matDark, 0, -0.8, 0.15, hookGroup);
            box(0.15, 0.35, 0.15, matDark, 0, -0.62, 0.35, hookGroup);
            hookGroup.position.set(0, cableAnchorY - 1.5, 0);

            const cargoSize = 2.5;
            const cargoMesh = box(cargoSize, cargoSize, cargoSize, matCargo, pickLocal.x, cargoSize / 2, pickLocal.z, craneScene);
            cargoMesh.visible = false; // Скрываем синие квадраты по просьбе пользователя

            let animState = 0, cargoAttached = false;
            const speedH = 8.0, speedV = 4.0;
            let hookTopY = cableAnchorY - 1.5, hookBottomY = cargoSize + 0.5;
            let prevBridgeZ = 0, prevTrolleyX = 0;
            let pauseTimer = 0;

            const updateCable = () => { cableMesh.scale.y = Math.max(Math.abs(cableAnchorY - hookGroup.position.y), 0.01); };
            const moveTowards = (obj, axis, target, step) => {
                if (Math.abs(obj[axis] - target) <= step) { obj[axis] = target; return true; }
                obj[axis] += Math.sign(target - obj[axis]) * step; return false;
            };

            rootGroup.userData.startAnimation = function() {
                if(animState > 0 && animState < 8) return;
                cargoMesh.position.set(pickLocal.x, cargoSize / 2, pickLocal.z);
                hookGroup.position.y = hookTopY; updateCable();
                prevBridgeZ = craneGroup.position.z; prevTrolleyX = hoistGroup.position.x;
                animState = 1;
            };

            rootGroup.userData.updateAnimation = function(dt) {
                // Animation disabled manually as requested
            };

            rootGroup.userData.craneGroup = craneGroup;
            rootGroup.userData.hoistGroup = hoistGroup;
            rootGroup.userData.hookGroup = hookGroup;
            rootGroup.userData.updateCable = updateCable;
            rootGroup.userData.speedH = speedH;
            rootGroup.userData.speedV = speedV;
            rootGroup.userData.hookTopY = hookTopY;
            rootGroup.userData.hookBottomY = hookBottomY;

            return rootGroup;
        };

        // Размещаем кран-балку над складом получения металла (X: 0..1000, Z: 700..2400)
        // rails: X=500, Z=750 -> Z=2350
        const craneData = {
            x1: 500, y1: 750,
            x2: 500, y2: 2350,
            pickX: 300, pickY: 1000,
            dropX: 700, dropY: 2000
        };
        const mainCrane = buildThreeCrane(craneData);
        if (mainCrane) {
            scene.add(mainCrane);
            window.warehouseCrane = mainCrane;
        }

        // Вторая кран-балка (от области инструментальной до области доработки)
        const craneData2 = {
            x1: 3600, y1: 150,
            x2: 3600, y2: 2250,
            spanW: 56, // Уменьшили ширину кран-балки, чтобы она была уже
            pickX: 3200, pickY: 1200,
            dropX: 4000, dropY: 2000,
            uniformSpacing: true,
            colCount: 5,
            skipColsFromBack: [2] // Убираем вторые стойки сзади
        };
        const mainCrane2 = buildThreeCrane(craneData2);
        if (mainCrane2) {
            scene.add(mainCrane2);
            window.warehouseCrane2 = mainCrane2;
        }

        // =====================================================
        // 🏗️ СБОРОЧНЫЙ СТЕНД ПОД ВТОРОЙ КРАН-БАЛКОЙ
        // =====================================================
        function buildAssemblyStand() {
            const standGroup = new THREE.Group();
            
            // Размеры и позиция стенда
            const standW = 1300; // По оси X
            const standL = 1500; // Укоротили: дальше от нижних путей
            const standH = 40;  // Высота 40 см
            const standX = 3600; // Центр
            const standZ = 750;  // Центр стенда (от 0 до 1500)
            
            // Очень светлый металлический цвет
            const matStand = new THREE.MeshStandardMaterial({ 
                color: 0xbbc3cc, 
                roughness: 0.4, 
                metalness: 0.7 
            });

            // Основная платформа
            const platGeo = new THREE.BoxGeometry(standW, standH, standL);
            const plat = new THREE.Mesh(platGeo, matStand);
            plat.position.set(standX, standH / 2, standZ);
            plat.receiveShadow = true;
            plat.castShadow = true;
            standGroup.add(plat);
            
            // Назначаем standGroup как стол для физики
            standGroup.userData = { isTable: true, useBoxTopAsSurface: true };

            // Ступеньки сбоку
            const stepZWidth = 300; // Узкие ступеньки, чтобы не пересекались со стойками
            const stepZCenter = 950; // Расположены между 2й и 3й стойками кран-балки (Z=675 и Z=1200)
            const stepCount = 3;
            const stepDepth = 40;
            const stepH = standH / stepCount;

            for (let i = 0; i < stepCount; i++) {
                const sGeo = new THREE.BoxGeometry(stepDepth, stepH * (i + 1), stepZWidth);
                const sMesh = new THREE.Mesh(sGeo, matStand);
                // Позиция: по X ступенчато (от края стенда 3600 - 650 = 2950)
                const sx = standX - standW / 2 - stepDepth / 2 - (stepCount - 1 - i) * stepDepth;
                sMesh.position.set(sx, (stepH * (i + 1)) / 2, stepZCenter);
                sMesh.receiveShadow = true;
                sMesh.castShadow = true;
                standGroup.add(sMesh);
            }

            scene.add(standGroup);
        }
        buildAssemblyStand();




        // =====================================================
        // REMOTE CONTROLS & TABLE
        // =====================================================
        // =====================================================
        // 13. ГЕОДЕЗИЧЕСКИЙ ЛАЗЕРНЫЙ ТЕОДОЛИТ
        // =====================================================
        function buildTheodolite() {
            const theodoliteGroup = new THREE.Group();
            theodoliteGroup.userData.isInteractable = true;
            theodoliteGroup.userData.isTheodolite = true;
            theodoliteGroup.userData.laserActive = false;

            // Материалы PBR
            const matLegs = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.3, metalness: 0.8 });
            const matBody = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.7, metalness: 0.1 });
            const matRubber = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.0 });
            const matLens = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.9 });

            // 1. Штатив (Тринога)
            const tripodHeight = 110;
            const legRadius = 2;
            const spread = 35;
            
            for (let i = 0; i < 3; i++) {
                const angle = (i * Math.PI * 2) / 3;
                const target = new THREE.Vector3(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
                const origin = new THREE.Vector3(0, tripodHeight, 0);
                const dir = new THREE.Vector3().subVectors(target, origin);
                const length = dir.length();
                
                const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 0.5, length, 8);
                legGeo.translate(0, -length / 2, 0); // Origin at top, extending downwards
                const leg = new THREE.Mesh(legGeo, matLegs);
                leg.position.copy(origin);
                
                // Align cylinder's -Y axis to dir vector
                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
                leg.quaternion.copy(q);
                
                const foot = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 4, 8), matRubber);
                foot.position.set(0, -length, 0);
                leg.add(foot);
                
                theodoliteGroup.add(leg);
            }

            // Центральная площадка штатива
            const baseGeo = new THREE.CylinderGeometry(12, 14, 4, 16);
            const baseMesh = new THREE.Mesh(baseGeo, matBody);
            baseMesh.position.set(0, tripodHeight + 2, 0);
            theodoliteGroup.add(baseMesh);

            // Оптическая головка (вращающаяся часть)
            const headGroup = new THREE.Group();
            headGroup.position.set(0, tripodHeight + 15, 0);
            
            const bodyGeo = new THREE.BoxGeometry(16, 20, 20);
            const bodyMesh = new THREE.Mesh(bodyGeo, matBody);
            headGroup.add(bodyMesh);

            const sideGeo = new THREE.BoxGeometry(18, 16, 12);
            const sideMesh = new THREE.Mesh(sideGeo, matRubber);
            headGroup.add(sideMesh);

            const tubeGeo = new THREE.CylinderGeometry(6, 6, 15, 16);
            tubeGeo.rotateX(Math.PI / 2);
            const tubeMesh = new THREE.Mesh(tubeGeo, matRubber);
            tubeMesh.position.set(0, 0, 10);
            headGroup.add(tubeMesh);

            const lensGeo = new THREE.CylinderGeometry(5.5, 5.5, 1, 16);
            lensGeo.rotateX(Math.PI / 2);
            const lensMesh = new THREE.Mesh(lensGeo, matLens);
            lensMesh.position.set(0, 0, 17.5);
            headGroup.add(lensMesh);

            // Пузырьковый уровень на базе
            const levelGeo = new THREE.CylinderGeometry(4, 4, 2, 16);
            const matLevelFrame = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
            const levelMesh = new THREE.Mesh(levelGeo, matLevelFrame);
            levelMesh.position.set(10, tripodHeight + 5, 0);
            
            const fluidGeo = new THREE.CylinderGeometry(3.5, 3.5, 2.1, 16);
            const matFluid = new THREE.MeshPhysicalMaterial({ color: 0x66ff66, transmission: 0.9, opacity: 1, transparent: true, roughness: 0.1 });
            const fluidMesh = new THREE.Mesh(fluidGeo, matFluid);
            levelMesh.add(fluidMesh);
            
            const bubbleGeo = new THREE.SphereGeometry(1.2, 8, 8);
            const matBubble = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const bubble = new THREE.Mesh(bubbleGeo, matBubble);
            bubble.position.y = 1;
            levelMesh.add(bubble);
            theodoliteGroup.userData.bubble = bubble; 
            
            theodoliteGroup.add(levelMesh);

            // ===== ЛАЗЕР =====
            // Лазер реализован через Raycasting + THREE.Line в main loop.
            // Никакого SpotLight — никакого свечения, линии не проходят сквозь стены.
            
            // Маркер-объект источника лазера (невидимый, только позиция)
            const laserOrigin = new THREE.Object3D();
            laserOrigin.position.set(0, 0, 18);
            headGroup.add(laserOrigin);
            
            theodoliteGroup.userData.head = headGroup;
            theodoliteGroup.userData.laserOrigin = laserOrigin;
            theodoliteGroup.userData.laserMode = 0; // 0: Off, 1: H, 2: V, 3: Cross
            theodoliteGroup.add(headGroup);
            
            theodoliteGroup.scale.set(1.5, 1.5, 1.5);

            // Ставим теодолит правее стола с пультом второй кран-балки
            theodoliteGroup.position.set(2650, 0, 700);
            scene.add(theodoliteGroup);
            
            window.theodoliteObj = theodoliteGroup;
        }
        buildTheodolite();

        function buildRemotesRack() {
            function createLabelMesh(text) {
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgba(255, 255, 255, 0)';
                ctx.fillRect(0,0,128,64);
                ctx.font = 'bold 24px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, 64, 32);
                const texture = new THREE.CanvasTexture(canvas);
                const mat = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false});
                const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), mat);
                return mesh;
            }

            const rackGroup = new THREE.Group();
            rackGroup.position.set(1050, 0, 1400); // Позиция левее тележек
            rackGroup.rotation.y = Math.PI / 2;
            // База стола (потертый промышленный металл)
            const tableMat = new THREE.MeshStandardMaterial({
                color: 0x4a5059,
                roughness: 0.8,
                metalness: 0.6
            });
            const backPanelMat = new THREE.MeshStandardMaterial({
                color: 0x31353c,
                roughness: 0.85,
                metalness: 0.5
            });
            
            // 1. Столешница
            const tableTop = new THREE.Mesh(new THREE.BoxGeometry(80, 4, 50), tableMat);
            tableTop.position.set(0, 75, 0);
            tableTop.castShadow = true;
            tableTop.receiveShadow = true;
            rackGroup.add(tableTop);

            // 2. Ножки стола (4 профильные трубы)
            const legGeo = new THREE.BoxGeometry(4, 75, 4);
            const legPositions = [
                [-36, 37.5, -21],
                [36, 37.5, -21],
                [-36, 37.5, 21],
                [36, 37.5, 21]
            ];
            legPositions.forEach(pos => {
                const leg = new THREE.Mesh(legGeo, tableMat);
                leg.position.set(pos[0], pos[1], pos[2]);
                leg.castShadow = true;
                leg.receiveShadow = true;
                rackGroup.add(leg);
            });

            // 3. Задняя стенка стола
            const backPanel = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 4), backPanelMat);
            backPanel.position.set(0, 115, -23);
            backPanel.castShadow = true;
            backPanel.receiveShadow = true;
            rackGroup.add(backPanel);

            // 4. Крюки для пультов на задней стенке
            const hookMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.5 });
            const hook1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6), hookMat);
            hook1.rotation.x = Math.PI / 2;
            hook1.position.set(-15, 110, -20);
            const hook2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6), hookMat);
            hook2.rotation.x = Math.PI / 2;
            hook2.position.set(15, 110, -20);
            rackGroup.add(hook1, hook2);

            // 5. Светодиодные индикаторы (зеленый - на месте, красный - в руке)
            const ledOnMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const led1 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), ledOnMat);
            led1.position.set(-15, 125, -20);
            const led2 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), ledOnMat);
            led2.position.set(15, 125, -20);
            rackGroup.add(led1, led2);
            rackGroup.userData.leds = { crane: led1, cart: led2 };

            // --- ПУЛЬТ КРАН-БАЛКИ ---
            const craneRemote = new THREE.Group();
            craneRemote.userData.isInteractable = true;
            craneRemote.userData.remoteType = 'crane';
            
            // Корпус (желтый пластик с шагренью)
            const craneBodyMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.75, metalness: 0.1 });
            const craneBody = new THREE.Mesh(new THREE.BoxGeometry(8, 20, 4), craneBodyMat);
            craneRemote.add(craneBody);
            
            // Грипсы (резина)
            const gripMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.0 });
            const gripL = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 4.2), gripMat);
            gripL.position.set(-4, -2, 0);
            const gripR = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 4.2), gripMat);
            gripR.position.set(4, -2, 0);
            craneRemote.add(gripL, gripR);

            // E-Stop (Красный грибок)
            const eStopMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4, metalness: 0.2 });
            const eStopBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1), craneBodyMat);
            eStopBase.rotation.x = Math.PI / 2;
            eStopBase.position.set(0, 6, 2);
            const eStopBtn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1), eStopMat);
            eStopBtn.rotation.x = Math.PI / 2;
            eStopBtn.position.set(0, 6, 2.5);
            craneRemote.add(eStopBase, eStopBtn);

            // Кнопки управления (вверх/вниз, влево/вправо, вперед/назад)
            const btnMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
            const buttons = [];
            for(let i=0; i<6; i++) {
                const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1), btnMat);
                btn.rotation.x = Math.PI / 2;
                const bx = (i % 2 === 0) ? -2 : 2;
                const by = 2 - Math.floor(i / 2) * 3;
                btn.position.set(bx, by, 2.2);
                btn.userData.baseZ = 2.2;
                const labels = ['ВПЕРЕД', 'НАЗАД', 'ВЛЕВО', 'ВПРАВО', 'ВВЕРХ', 'ВНИЗ'];
                const lbl = createLabelMesh(labels[i]);
                lbl.position.set(0, 0.51, 0);
                lbl.rotation.x = -Math.PI / 2;
                btn.add(lbl);
                craneRemote.add(btn);
                buttons.push(btn);
            }
            craneRemote.userData.buttons = buttons;

            // Позиция на крюке 1
            craneRemote.position.set(-15, 105, -18);
            rackGroup.add(craneRemote);
            window.craneRemoteMesh = craneRemote;

            // --- ПУЛЬТ ТЕЛЕЖКИ ---
            const cartRemote = new THREE.Group();
            cartRemote.userData.isInteractable = true;
            cartRemote.userData.remoteType = 'cart';
            
            // Корпус (оранжевый промышленный)
            const cartBodyMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.7, metalness: 0.15 });
            const cartBody = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 3), cartBodyMat);
            cartRemote.add(cartBody);
            
            // Ремешок (Lanyard)
            const lanyardMat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.9 });
            const lanyard = new THREE.Mesh(new THREE.TorusGeometry(3, 0.2, 8, 24), lanyardMat);
            lanyard.position.set(0, -9, 0);
            cartRemote.add(lanyard);

            // Кнопки тележки
            const cartButtons = [];
            for(let i=0; i<2; i++) {
                const btn = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 1), btnMat);
                const by = 2 - i * 4;
                btn.position.set(0, by, 1.7);
                btn.userData.baseZ = 1.7;
                const cartLabels = ['ВПЕРЕД', 'НАЗАД'];
                const lbl = createLabelMesh(cartLabels[i]);
                lbl.position.set(0, 0, 0.51);
                btn.add(lbl);
                cartRemote.add(btn);
                cartButtons.push(btn);
            }
            cartRemote.userData.buttons = cartButtons;

            // Крутилка (Knob) для скорости тележки
            const knobMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
            const knob = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 16), knobMat);
            knob.rotation.x = Math.PI / 2;
            knob.position.set(0, 5, 1.5);
            
            // Маленький белый индикатор на крутилке
            const indMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), indMat);
            indicator.position.set(0, 0, 0.4);
            knob.add(indicator);
            
            cartRemote.userData.knob = knob;
            cartRemote.add(knob);

            // Позиция на крюке 2
            cartRemote.position.set(15, 108, -18);
            rackGroup.add(cartRemote);
            window.cartRemoteMesh = cartRemote;

            scene.add(rackGroup);
            window.remotesRack = rackGroup;
            
            // Регистрируем коллизию для стола
            const tableCollider = {
                minX: 1050 - 40,
                maxX: 1050 + 40,
                minZ: 1400 - 25,
                maxZ: 1400 + 25
            };
            boxColliders.push(tableCollider);
            
            if (!window._weldInteractables) window._weldInteractables = [];
            window._weldInteractables.push(craneRemote, cartRemote);
        }

        buildRemotesRack();

        // =====================================================
        // REMOTE CONTROL STAND FOR CRANE 2
        // =====================================================
        function buildCrane2Rack() {
            function createLabelMesh(text) {
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgba(255, 255, 255, 0)';
                ctx.fillRect(0,0,128,64);
                ctx.font = 'bold 24px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, 64, 32);
                const texture = new THREE.CanvasTexture(canvas);
                const mat = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthTest: false});
                return new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), mat);
            }

            const rackGroup = new THREE.Group();
            rackGroup.position.set(2650, 0, 600); // Позиция около области инструментальной
            rackGroup.rotation.y = Math.PI / 2;
            
            const tableMat = new THREE.MeshStandardMaterial({ color: 0x4a5059, roughness: 0.8, metalness: 0.6 });
            const backPanelMat = new THREE.MeshStandardMaterial({ color: 0x31353c, roughness: 0.85, metalness: 0.5 });
            
            // 1. Столешница (меньше размером)
            const tableTop = new THREE.Mesh(new THREE.BoxGeometry(40, 4, 50), tableMat);
            tableTop.position.set(0, 75, 0);
            tableTop.castShadow = true; tableTop.receiveShadow = true;
            rackGroup.add(tableTop);

            // 2. Ножки
            const legGeo = new THREE.BoxGeometry(4, 75, 4);
            [[-16, 37.5, -21], [16, 37.5, -21], [-16, 37.5, 21], [16, 37.5, 21]].forEach(pos => {
                const leg = new THREE.Mesh(legGeo, tableMat);
                leg.position.set(...pos);
                leg.castShadow = true; leg.receiveShadow = true;
                rackGroup.add(leg);
            });

            // 3. Задняя стенка
            const backPanel = new THREE.Mesh(new THREE.BoxGeometry(40, 80, 4), backPanelMat);
            backPanel.position.set(0, 115, -23);
            backPanel.castShadow = true; backPanel.receiveShadow = true;
            rackGroup.add(backPanel);

            // 4. Крюк для пульта
            const hookMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.5 });
            const hook1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6), hookMat);
            hook1.rotation.x = Math.PI / 2;
            hook1.position.set(0, 110, -20);
            rackGroup.add(hook1);

            // 5. LED
            const ledOnMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const led1 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), ledOnMat);
            led1.position.set(0, 125, -20);
            rackGroup.add(led1);
            rackGroup.userData.leds = { crane: led1 };

            // --- ПУЛЬТ КРАН-БАЛКИ 2 ---
            const craneRemote = new THREE.Group();
            craneRemote.userData.isInteractable = true;
            craneRemote.userData.remoteType = 'crane2';
            
            const craneBodyMat = new THREE.MeshStandardMaterial({ color: 0x3388ff, roughness: 0.75, metalness: 0.1 });
            const craneBody = new THREE.Mesh(new THREE.BoxGeometry(8, 20, 4), craneBodyMat);
            craneRemote.add(craneBody);
            
            const gripMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.0 });
            const gripL = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 4.2), gripMat); gripL.position.set(-4, -2, 0);
            const gripR = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 4.2), gripMat); gripR.position.set(4, -2, 0);
            craneRemote.add(gripL, gripR);

            const eStopMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4, metalness: 0.2 });
            const eStopBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1), craneBodyMat);
            eStopBase.rotation.x = Math.PI / 2; eStopBase.position.set(0, 6, 2);
            const eStopBtn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1), eStopMat);
            eStopBtn.rotation.x = Math.PI / 2; eStopBtn.position.set(0, 6, 2.5);
            craneRemote.add(eStopBase, eStopBtn);

            const btnMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
            const buttons = [];
            for(let i=0; i<6; i++) {
                const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1), btnMat);
                btn.rotation.x = Math.PI / 2;
                const bx = (i % 2 === 0) ? -2 : 2;
                const by = 2 - Math.floor(i / 2) * 3;
                btn.position.set(bx, by, 2.2);
                btn.userData.baseZ = 2.2;
                const labels = ['ВПЕРЕД', 'НАЗАД', 'ВЛЕВО', 'ВПРАВО', 'ВВЕРХ', 'ВНИЗ'];
                const lbl = createLabelMesh(labels[i]);
                lbl.position.set(0, 0.51, 0); lbl.rotation.x = -Math.PI / 2;
                btn.add(lbl);
                craneRemote.add(btn);
                buttons.push(btn);
            }
            craneRemote.userData.buttons = buttons;

            craneRemote.position.set(0, 105, -18);
            rackGroup.add(craneRemote);
            window.craneRemote2Mesh = craneRemote;

            scene.add(rackGroup);
            window.remotesRack2 = rackGroup;
            
            const tableCollider = {
                minX: 2650 - 25,
                maxX: 2650 + 25,
                minZ: 600 - 40,
                maxZ: 600 + 40
            };
            boxColliders.push(tableCollider);
            
            window._weldInteractables.push(craneRemote);
        }

        buildCrane2Rack();
