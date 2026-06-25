// 🏗️ PHYSICS ENGINE GLOBALS (ASSEMBLER ONLY)
        // =====================================================
        
                const workpieces = []; 

                // Initialize pre-placed metal sheet as a proper workpiece
                setTimeout(() => {
                    if (typeof scene !== 'undefined' && typeof THREE !== 'undefined') {
                        const ms = scene.getObjectByName('MetalSheet');
                        if (ms && !workpieces.includes(ms)) {
                            workpieces.push(ms);
                            if (!ms.userData.hlGroup) {
                                const hlGroup = new THREE.Group();
                                hlGroup.visible = false;
                                const faceMat = new THREE.MeshBasicMaterial({ 
                                    color: 0xffff00, 
                                    side: THREE.DoubleSide,
                                    polygonOffset: true,
                                    polygonOffsetFactor: -1,
                                    polygonOffsetUnits: -1
                                });
                                const hlPlane = new THREE.Mesh(new THREE.PlaneGeometry(1,1), faceMat);
                                hlPlane.userData.isHighlight = true;
                                const hlEdges = new THREE.LineSegments(
                                    new THREE.EdgesGeometry(hlPlane.geometry), 
                                    new THREE.LineBasicMaterial({ color: 0xccaa00, depthTest: false })
                                );
                                hlEdges.userData.isHighlight = true;
                                hlGroup.add(hlPlane);
                                hlGroup.add(hlEdges);
                                ms.add(hlGroup);
                                ms.userData.hlGroup = hlGroup;
                                ms.userData.hlPlane = hlPlane;
                                ms.userData.hlEdges = hlEdges;
                            }
                        }
                    }
                }, 500);
        const weldBeads = []; 
        let dragging = null;
        
        // Physics Constants
        const PHY = {
            gravity: -980,
            dragSpeed: 12.0, 
            pushFactor: 1.0,
            snapDist: 2.0,   
            weldDist: 50.0,
            collisionIter: 4
        };

        function computeOffsets(obj) {
            const h = obj.userData.half;
            if (!h) return { minX:0, maxX:0, minY:0, maxY:0, minZ:0, maxZ:0 };
            const q = obj.quaternion;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
            const sx = [-h.x, h.x]; const sy = [-h.y, h.y]; const sz = [-h.z, h.z];
            const v = new THREE.Vector3();
            for (const x of sx) {
                for (const y of sy) {
                    for (const z of sz) {
                        v.set(x, y, z).applyQuaternion(q);
                        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
                        minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
                    }
                }
            }
            return { minX, maxX, minY, maxY, minZ, maxZ };
        }

        function getAABB3D(obj) {
            const offs = computeOffsets(obj);
            return {
                minX: obj.position.x + offs.minX, maxX: obj.position.x + offs.maxX,
                minY: obj.position.y + offs.minY, maxY: obj.position.y + offs.maxY,
                minZ: obj.position.z + offs.minZ, maxZ: obj.position.z + offs.maxZ,
            };
        }

        function getGroupMembers(wp) {
            if (!wp.userData.groupId) return [wp];
            return workpieces.filter(w => w.userData.groupId === wp.userData.groupId);
        }

        function getGroupLeader(wp) {
            if (!wp.userData.groupId) return wp;
            if (dragging && dragging.userData.groupId === wp.userData.groupId) return dragging;
            return getGroupMembers(wp)[0]; 
        }

        function updateGroupPositions(leader) {
            if (!leader.userData.groupPeers) return;
            leader.userData.groupPeers.forEach(p => {
                const peer = p.mesh;
                const rotatedOffset = p.localOffset.clone().applyQuaternion(leader.quaternion);
                peer.position.copy(leader.position).add(rotatedOffset);
                peer.quaternion.copy(leader.quaternion).multiply(p.relativeQuat);
                peer.updateMatrixWorld(true);
            });
        }

        // ==========================================
        // 🧩 ROTATION LOGIC
        // ==========================================
        const UP = new THREE.Vector3(0, 1, 0);

        function updateOrientation(obj, animate = false) {
          const baseQ = obj.userData.baseQuat || new THREE.Quaternion();
          const yawA = obj.userData.yawAngle || 0;
          const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, yawA);
          const targetQ = yawQ.clone().multiply(baseQ);
          
          if (animate && !obj.userData.isAnimating) {
            obj.userData.isAnimating = true;
            obj.userData.animStartQuat = obj.quaternion.clone();
            obj.userData.animTargetQuat = targetQ.clone();
            obj.userData.animProgress = 0;
          } else if (!animate) {
            obj.quaternion.copy(targetQ);
            updatePartHighlight(obj, true); 
          }
        }

               function updateRotationAnimation(obj, dt) {
          if (!obj.userData.isAnimating) return;
          const speed = 15.0; 
          obj.userData.animProgress += dt * speed;
          
          if (obj.userData.animProgress >= 1.0) {
            obj.userData.animProgress = 1.0;
            obj.quaternion.copy(obj.userData.animTargetQuat);
            obj.userData.isAnimating = false;
            syncHighlightWithBottomFace(obj);
          } else {
            const t = obj.userData.animProgress;
            const eased = 1 - Math.pow(1 - t, 3);
            obj.quaternion.slerpQuaternions(obj.userData.animStartQuat, obj.userData.animTargetQuat, eased);
          }
          // При анимации перекраска не требуется каждый кадр, если геометрия не деформируется
        }

        function alignVectorToSupport(obj, localVector, supportNormal, animate = false) {
          // --- ОБНОВЛЕННАЯ ЛОГИКА (SMART ALIGNMENT) ---
          // Мы хотим, чтобы localVector (нормаль грани) смотрел ПРОТИВ supportNormal (вниз, в стол)
          // supportNormal обычно (0, 1, 0)
          const targetDir = supportNormal.clone().normalize().negate();

          // 1. Считаем базовый поворот (без учета вращения колесиком)
          const alignQuat = new THREE.Quaternion().setFromUnitVectors(localVector.normalize(), targetDir);
          
          // 2. Сохраняем как базу
          obj.userData.baseQuat = alignQuat;
          
          // 3. Сразу применяем (функция updateOrientation добавит Yaw/колесико сверху)
          updateOrientation(obj, animate);
        }

        // --- ANALYZE GEOMETRY (UPDATED: GROUP BY NORMAL) ---
        function analyzePartSurfaces(mesh) {
            const geometry = mesh.geometry;
            const posAttr = geometry.attributes.position;
            const normalAttr = geometry.attributes.normal;
            const indexAttr = geometry.index;
            
            if (!posAttr) return [];

            const surfaces = [];
            const epsilon = 0.99; // Допуск для объединения нормалей (cos угла)

            // Хелпер для добавления площади к существующей нормали или создания новой
            const addSurface = (normal, area, point) => {
                // Ищем, есть ли уже такая нормаль
                let match = null;
                for (const surf of surfaces) {
                    if (surf.normal.dot(normal) > epsilon) {
                        match = surf;
                        break;
                    }
                }
                
                if (match) {
                    match.area += area;
                    // Обновляем центр (взвешенное среднее можно, но простое сложение быстрее для UI)
                } else {
                    surfaces.push({
                        normal: normal.clone(),
                        area: area,
                        // Сохраняем вектор "вверх" для этой грани (пригодится для выравнивания текстур/хайлайта)
                        uAxis: new THREE.Vector3(0,0,0) 
                    });
                }
            };

            const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
            const cb = new THREE.Vector3(), ab = new THREE.Vector3();
            const faceNormal = new THREE.Vector3();
            
            const count = indexAttr ? indexAttr.count : posAttr.count;

            for (let i = 0; i < count; i += 3) {
                const a = indexAttr ? indexAttr.getX(i) : i;
                const b = indexAttr ? indexAttr.getX(i+1) : i+1;
                const c = indexAttr ? indexAttr.getX(i+2) : i+2;

                pA.fromBufferAttribute(posAttr, a);
                pB.fromBufferAttribute(posAttr, b);
                pC.fromBufferAttribute(posAttr, c);

                // Вычисляем площадь и нормаль треугольника
                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                faceNormal.crossVectors(cb, ab);
                
                const area = faceNormal.length() * 0.5;
                if (area < 0.00001) continue; // Игнорируем вырожденные треугольники
                
                faceNormal.normalize();
                
                // Если есть атрибут нормалей, лучше взять его (он сглаженный), 
                // но для CAD "flat shading" вычисленная нормаль грани надежнее для определения плоскости.
                addSurface(faceNormal, area);
            }

            // Сортируем: сначала самые большие грани (основания), потом торцы
            surfaces.sort((a, b) => b.area - a.area);
            
            // Всегда добавляем "Дефолтную" (текущий низ), если ничего не нашли
            if (surfaces.length === 0) {
                 surfaces.push({ normal: new THREE.Vector3(0, -1, 0), area: 1 });
            }

            return surfaces;
        }

        // --- COLLISION RESOLVER ---
        function resolveCollisionPrimary(primary, other) {
            if (primary.userData.groupId && primary.userData.groupId === other.userData.groupId) return;
            const rootA = getGroupLeader(primary);
            const rootB = getGroupLeader(other);
            if (rootA === rootB) return;

            const A = getAABB3D(primary);
            const B = getAABB3D(other);

            const overlapX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
            const overlapY = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
            const overlapZ = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);

            if (overlapX <= 0 || overlapZ <= 0 || overlapY <= 0.2) return;

            let axis = (overlapX < overlapZ) ? 'x' : 'z';
            const dx = primary.position.x - other.position.x;
            const dz = primary.position.z - other.position.z;
            const sign = (axis === 'x' ? dx : dz) >= 0 ? 1 : -1;

            rootA.position[axis] += sign * (axis === 'x' ? overlapX : overlapZ) * PHY.pushFactor;
            updateGroupPositions(rootA);
        }

        // --- GRAVITY SYSTEM ---
        function getRotatedAABB(obj) {
            const h = obj.userData.half; 
            if (!h) {
                const box = new THREE.Box3().setFromObject(obj);
                return {
                    minX: box.min.x - obj.position.x, maxX: box.max.x - obj.position.x,
                    minY: box.min.y - obj.position.y, maxY: box.max.y - obj.position.y,
                    minZ: box.min.z - obj.position.z, maxZ: box.max.z - obj.position.z
                };
            }
            const q = obj.quaternion;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
            const sx = [-h.x, h.x]; const sy = [-h.y, h.y]; const sz = [-h.z, h.z];
            const v = new THREE.Vector3();
            for (const x of sx) {
                for (const y of sy) {
                    for (const z of sz) {
                        v.set(x, y, z).applyQuaternion(q);
                        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
                        minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
                    }
                }
            }
            return { minX, maxX, minY, maxY, minZ, maxZ };
        }

        function getAABB2DFor(posX, posZ, offs) {
            return { minX: posX + offs.minX, maxX: posX + offs.maxX, minZ: posZ + offs.minZ, maxZ: posZ + offs.maxZ };
        }

        function overlapArea2D(A, B) {
            const ox = Math.max(0, Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX));
            const oz = Math.max(0, Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ));
            return ox * oz;
        }

               // Точная высота рабочей поверхности стола (из TABLE_PARAMS)
        function getTableSurfaceY() {
            return (TABLE_PARAMS.H + TABLE_PARAMS.topT) * TABLE_PARAMS.scale;
        }

        function computeSupportAt(obj, desiredX, desiredZ, ignoredObjects = []) {
            const groupMembers = getGroupMembers(obj);
            let maxRequiredLeaderY = -Infinity;
            let bestType = 'ground';
            let bestSupportObj = null;

            // Собираем таблы из сцены
            const tables = scene.children.filter(c => c.userData && c.userData.isTable);

            // Границы кузова грузовика (если виден) — чтобы детали опирались на пол
            // кузова, а не проваливались под него.
            let truckBed = null;
            if (typeof globalTruck !== 'undefined' && globalTruck && globalTruck.visible && globalTruck.userData.bedFloor) {
                const fb = new THREE.Box3().setFromObject(globalTruck.userData.bedFloor);
                if (isFinite(fb.min.x)) {
                    truckBed = { minX: fb.min.x, maxX: fb.max.x, minZ: fb.min.z, maxZ: fb.max.z, topY: fb.max.y };
                }
            }

            // Границы тележек (активной)
            const cartBoundsList = [];
            carts.forEach(cartObj => {
                if (!cartObj.visible) return;
                const s = CART_SCALE;
                // Мировые координаты центра тележки
                const cx = cartObj.position.x;
                const cz = cartObj.position.z;
                const rot = cartObj.rotation.y;
                const hw = (CART_PARAMS.width * s) / 2 - 5;
                const hd = (CART_PARAMS.depth * s) / 2 - 5;
                const cartTopY = getCartPlatformY(cartObj);
                cartBoundsList.push({ cx, cz, rot, hw, hd, topY: cartTopY, obj: cartObj });
            });

            for (const member of groupMembers) {
                const relX = member.position.x - obj.position.x;
                const relZ = member.position.z - obj.position.z;
                const relY = member.position.y - obj.position.y;

                const mx = desiredX + relX;
                const mz = desiredZ + relZ;

                const mOffs = getRotatedAABB(member);
                const aabb = getAABB2DFor(mx, mz, mOffs);

                let memberSupportLevel = 0;
                let type = 'ground';
                let supportObj = null;

                // 1. Проверка столов (используем точную высоту поверхности)
                for (const tbl of tables) {
                    // Берём AABB стола по XZ
                    const tblBox = new THREE.Box3().setFromObject(tbl);
                    const overlaps = !(
                        aabb.maxX < tblBox.min.x || aabb.minX > tblBox.max.x ||
                        aabb.maxZ < tblBox.min.z || aabb.minZ > tblBox.max.z
                    );
                    if (overlaps) {
                        let surfaceY;
                        if (tbl.userData.useBoxTopAsSurface) {
                            surfaceY = tblBox.max.y;
                        } else {
                            surfaceY = getTableSurfaceY() + tbl.position.y;
                        }
                        if (surfaceY > memberSupportLevel) {
                            memberSupportLevel = surfaceY;
                            type = 'table';
                            supportObj = tbl;
                        }
                    }
                }

                // 2. Проверка тележек
                for (const cart of cartBoundsList) {
                    // Переводим центр AABB детали в локальные координаты тележки
                    const centerX = (aabb.minX + aabb.maxX) / 2;
                    const centerZ = (aabb.minZ + aabb.maxZ) / 2;
                    const relXc = centerX - cart.cx;
                    const relZc = centerZ - cart.cz;
                    const cos = Math.cos(-cart.rot);
                    const sin = Math.sin(-cart.rot);
                    const localX = relXc * cos - relZc * sin;
                    const localZ = relXc * sin + relZc * cos;

                    if (Math.abs(localX) < cart.hw && Math.abs(localZ) < cart.hd) {
                        if (cart.topY > memberSupportLevel) {
                            memberSupportLevel = cart.topY;
                            type = 'cart';
                            supportObj = cart.obj;
                        }
                    }
                }

                // 2b. Проверка кузова грузовика (опора на пол кузова)
                if (truckBed) {
                    const overlapsBed = !(
                        aabb.maxX < truckBed.minX || aabb.minX > truckBed.maxX ||
                        aabb.maxZ < truckBed.minZ || aabb.minZ > truckBed.maxZ
                    );
                    if (overlapsBed && truckBed.topY > memberSupportLevel) {
                        memberSupportLevel = truckBed.topY;
                        type = 'truck';
                        supportObj = globalTruck;
                    }
                }

                // 3. Проверка других деталей (стэкинг)
                const myArea = Math.max(1e-6, (aabb.maxX - aabb.minX) * (aabb.maxZ - aabb.minZ));
                const minOverlapArea = myArea * 0.15;

                // Стекинг: берём САМЫЙ ВЫСОКИЙ верх среди деталей, чей футпринт
                // пересекается с нашим. Никаких сравнений центров — это позволяет
                // деталям становиться друг на друга независимо от их текущей Y.
                for (const other of workpieces) {
                    if (groupMembers.includes(other)) continue;
                    if (ignoredObjects.includes(other)) continue;

                    const oOff = getRotatedAABB(other);
                    const oAabb = getAABB2DFor(other.position.x, other.position.z, oOff);

                    if (overlapArea2D(aabb, oAabb) > minOverlapArea) {
                        const otherTopY = other.position.y + oOff.maxY;
                        if (otherTopY > memberSupportLevel) {
                            memberSupportLevel = otherTopY;
                            type = 'workpiece';
                            supportObj = other;
                        }
                    }
                }

                // Вычисляем нужную Y лидера
                const neededLeaderY = memberSupportLevel - mOffs.minY - relY;
                if (neededLeaderY > maxRequiredLeaderY) {
                    maxRequiredLeaderY = neededLeaderY;
                    bestType = type;
                    bestSupportObj = supportObj;
                }
            }

            if (maxRequiredLeaderY === -Infinity) maxRequiredLeaderY = 0;

            const leaderOffs = getRotatedAABB(obj);
            return {
                supportY: maxRequiredLeaderY + EPS_Y_MAIN,
                supportType: bestType,
                supportObj: bestSupportObj,
                offs: leaderOffs
            };
        }

        // =====================================================
        // 🎮 INTERACTION LOGIC (GHOST & FACE PAINTING)
        // =====================================================
        
               // Переключает прозрачность: Тело (Index 0) -> 30%, Желтая грань (Index 1) -> 100%
        function setGhostMode(object, enable) {
            const group = getGroupMembers(object);
            group.forEach(member => {
                // Работаем только если материал уже стал массивом (после updatePartHighlight)
                if (!Array.isArray(member.material)) return;

                const bodyMat = member.material[0];
                const faceMat = member.material[1];

                if (enable) {
                    // 1. Сохраняем исходные параметры тела, если еще не сохраняли
                    if (bodyMat.userData.origOpac === undefined) {
                        bodyMat.userData.origOpac = bodyMat.opacity;
                        bodyMat.userData.origTrans = bodyMat.transparent;
                        bodyMat.userData.origDepth = bodyMat.depthWrite;
                    }

                    // 2. Настраиваем ТЕЛО (Полупрозрачное, 80% непрозрачности)
                    bodyMat.transparent = true;
                    bodyMat.opacity = 0.80;
                    // ВАЖНО: depthWrite = true гарантирует, что объект будет отрисован поверх фона
                    bodyMat.depthWrite = true; 
                    bodyMat.side = THREE.DoubleSide; // Рисуем обе стороны, чтобы не терять объем

                    // 3. Настраиваем ГРАНЬ (Непрозрачная)
                    if (faceMat) {
                        faceMat.transparent = false;
                        faceMat.opacity = 1.0;
                        faceMat.depthWrite = true;
                        faceMat.color.setHex(0xffff00);
                        faceMat.side = THREE.DoubleSide; 
                    }
                } else {
                    // ВОССТАНОВЛЕНИЕ
                    if (bodyMat.userData.origOpac !== undefined) {
                        bodyMat.opacity = bodyMat.userData.origOpac;
                        bodyMat.transparent = bodyMat.userData.origTrans;
                        bodyMat.depthWrite = bodyMat.userData.origDepth !== undefined ? bodyMat.userData.origDepth : true;
                        
                        delete bodyMat.userData.origOpac;
                        delete bodyMat.userData.origTrans;
                        delete bodyMat.userData.origDepth;
                    }
                }
            });
        }

              // Обновляет окраску граней (разбивает геометрию на группы материалов)
        // Синхронизирует жёлтую подсветку с гранью, которая реально смотрит вниз (лежит).
        function syncHighlightWithBottomFace(mesh) {
            const clusters = mesh.userData.validClusters;
            if (!clusters || clusters.length === 0) return;
            mesh.updateMatrixWorld(true);
            let bestIdx = mesh.userData.currentOrientIndex || 0;
            let bestDown = -Infinity;
            clusters.forEach((c, i) => {
                const wn = c.normal.clone().applyQuaternion(mesh.quaternion);
                const down = -wn.y;
                if (down > bestDown) { bestDown = down; bestIdx = i; }
            });
            if (bestDown > 0.7) mesh.userData.currentOrientIndex = bestIdx;
            updatePartHighlight(mesh, true);
        }

        function updatePartHighlight(mesh, isActive) {
            // 1. Если деталь не активна — сбрасываем всё в материал 0
            if (!isActive) {
                if (mesh.geometry) {
                    mesh.geometry.clearGroups();
                    mesh.geometry.addGroup(0, Infinity, 0);
                }
                return;
            }

            // 2. Инициализация мульти-материала [Original, Yellow]
            if (!Array.isArray(mesh.material)) {
                const original = mesh.material;
                // Создаем всегда новый желтый материал, чтобы не зависеть от кэша
                const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
                mesh.material = [original, yellowMat];
            } else if (mesh.material.length < 2) {
                // Если массив есть, но желтого нет
                mesh.material.push(new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide }));
            }

            // Используем validClusters — полные данные кластера (центр, ширина, нормаль).
            const clusters = mesh.userData.validClusters;
            if (!clusters || clusters.length === 0) return;
            let idx = mesh.userData.currentOrientIndex || 0;
            if (idx >= clusters.length) idx = 0;
            const cluster = clusters[idx];
            const targetNormal = cluster.normal;
            
            // Используем 3D плоскость для точного отделения параллельных граней (например противоположных торцев)
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(targetNormal, cluster.center);
            
            // 3. Пересчет групп геометрии (Geometry Groups)
            const geo = mesh.geometry;
            const pos = geo.attributes.position;
            
            const index = geo.index; 
            const count = index ? index.count : pos.count;

            geo.clearGroups();

            let currentMatIndex = -1;
            let groupStart = 0;
            let groupCount = 0;

            const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
            const cb = new THREE.Vector3(), ab = new THREE.Vector3(), fn = new THREE.Vector3();
            const triC = new THREE.Vector3();

            for (let i = 0; i < count; i += 3) {
                const a = index ? index.getX(i) : i;
                const b = index ? index.getX(i+1) : i+1;
                const c = index ? index.getX(i+2) : i+2;

                pA.fromBufferAttribute(pos, a);
                pB.fromBufferAttribute(pos, b);
                pC.fromBufferAttribute(pos, c);

                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                fn.crossVectors(cb, ab).normalize();
                triC.copy(pA).add(pB).add(pC).multiplyScalar(1 / 3);

                // Подсвечиваем только те треугольники, нормаль которых совпадает и которые лежат в той же плоскости
                const distToPlane = Math.abs(plane.distanceToPoint(triC));
                const onCluster = fn.dot(targetNormal) > 0.98 && distToPlane < 2.0;
                const matIndex = onCluster ? 1 : 0;

                // Оптимизация групп (объединяем подряд идущие треугольники одного материала)
                if (matIndex !== currentMatIndex) {
                    if (groupCount > 0) {
                        geo.addGroup(groupStart, groupCount, currentMatIndex);
                    }
                    currentMatIndex = matIndex;
                    groupStart = i;
                    groupCount = 0;
                }
                groupCount += 3;
            }
            // Закрываем последнюю группу
            if (groupCount > 0) {
                geo.addGroup(groupStart, groupCount, currentMatIndex);
            }
        }

        function tryPickWorkpiece() {
            if (!currentIdentity || currentIdentity.name !== 'Сборщик-Сварщик') return null;
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            const hits = raycaster.intersectObjects(workpieces, false); 
            if (hits.length > 0) return hits[0];
            return null;
        }

        function beginDrag(hit) {
            const rootLeader = getGroupLeader(hit.object);
            dragging = rootLeader;
            dragging.userData.dragDistance = hit.distance;

            const camPos = camera.position.clone();
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            const target = camPos.clone().addScaledVector(camDir, hit.distance);

            dragging.userData.dragOffsetX = dragging.position.x - target.x;
            dragging.userData.dragOffsetZ = dragging.position.z - target.z;

            // Группа: сохраняем локальные смещения
            const group = getGroupMembers(dragging);
            if (group.length > 1) {
                dragging.userData.groupPeers = [];
                const invQ = dragging.quaternion.clone().invert();
                group.forEach(peer => {
                    if (peer === dragging) return;
                    const diff = new THREE.Vector3().subVectors(peer.position, dragging.position);
                    const localOff = diff.applyQuaternion(invQ);
                    const relQ = invQ.clone().multiply(peer.quaternion);
                    dragging.userData.groupPeers.push({ mesh: peer, localOffset: localOff, relativeQuat: relQ });
                });
            }

            // Вычисляем валидные нормали (с фильтром радиальных поверхностей)
            // Пересчитываем каждый раз при подъёме — деталь могла быть повёрнута
            calculateNormalsAndVisuals(dragging);

            // Подсветка активной грани (validOrientations уже посчитаны calculateNormalsAndVisuals выше)
            updatePartHighlight(dragging, true);

            // Призрачный режим (полупрозрачность)
            setGhostMode(dragging, true);
        }

             // Константа: минимальный зазор над опорой (аналог EPS_Y из донора)
        const EPS_Y_MAIN = 0.1;

        // ---------------------------------------------------------------
        // Точное вычисление минимальной мировой Y вершин меша.
        // Обходит все вершины геометрии в мировых координатах.
        // Шаг 1 и 4 ТЗ (Проблема №1): работает с любой формой без приближения.
        function getExactWorldMinY(mesh) {
            if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) return null;
            mesh.updateMatrixWorld(true);
            const pos = mesh.geometry.attributes.position;
            const mat = mesh.matrixWorld;
            const v = new THREE.Vector3();
            let minY = Infinity;
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(mat);
                if (v.y < minY) minY = v.y;
            }
            return isFinite(minY) ? minY : null;
        }

        // Применяет точную AABB-коррекцию высоты (устраняет левитацию).
        // surfaceY — мировая Y поверхности опоры.
        // Формула ТЗ: model.position.y = surfaceY - minY (с учётом EPS).
        function applyExactGroundCorrection(mesh, surfaceY) {
            if (!mesh) return;
            mesh.updateMatrixWorld(true);
            const minWorldY = getExactWorldMinY(mesh);
            if (minWorldY === null) return;
            const delta = (surfaceY + EPS_Y_MAIN) - minWorldY;
            if (!isNaN(delta)) {
                mesh.position.y += delta;
                mesh.updateMatrixWorld(true);
                updateGroupPositions(mesh);
            }
        }
        // ---------------------------------------------------------------

        function updateDrag(dt) {
            if (!dragging) return;

            const camPos = camera.position.clone();
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            const dist = dragging.userData.dragDistance || 200;
            const target = camPos.clone().addScaledVector(camDir, dist);

            let dx = target.x + (dragging.userData.dragOffsetX || 0);
            let dz = target.z + (dragging.userData.dragOffsetZ || 0);

            // Анимация вращения (если активна)
            updateRotationAnimation(dragging, dt);
            if (!dragging.userData.isAnimating) syncHighlightWithBottomFace(dragging);
            dragging.updateMatrixWorld(true);
            updateGroupPositions(dragging);

            // Вычисляем опору
            const s = computeSupportAt(dragging, dx, dz, [dragging]);

            // XZ — плавно (но быстро)
            dragging.position.x += (dx - dragging.position.x) * Math.min(1, dt * PHY.dragSpeed);
            dragging.position.z += (dz - dragging.position.z) * Math.min(1, dt * PHY.dragSpeed);

            // Y — прижимаем к опоре. Сначала приближение (8-угольный AABB), затем точная коррекция.
            dragging.position.y = s.supportY;
            // Точная коррекция: вычисляем реальный worldMinY всех вершин и устраняем левитацию.
            // surfaceY = s.supportY + s.offs.minY - EPS = уровень поверхности опоры.
            dragging.updateMatrixWorld(true);
            const _exactMinY_drag = getExactWorldMinY(dragging);
            if (_exactMinY_drag !== null) {
                const _surfY_drag = s.supportY + s.offs.minY - EPS_Y_MAIN;
                dragging.position.y += (_surfY_drag + EPS_Y_MAIN) - _exactMinY_drag;
            }

            updateGroupPositions(dragging);

            // Коллизии с другими деталями (толчок в стороны, не вверх)
            // Параллельно определяем факт КОНТАКТА (ТЗ п.5) для цвета маркера.
            const myGroup = getGroupMembers(dragging);
            let inContact = false;
            const _myBox = new THREE.Box3();
            const _otherBox = new THREE.Box3();
            // Габарит перемещаемого узла (с учётом всех членов группы).
            myGroup.forEach((me, i) => {
                me.updateMatrixWorld(true);
                if (i === 0) _myBox.setFromObject(me);
                else _myBox.union(new THREE.Box3().setFromObject(me));
            });
            // Небольшой допуск, чтобы контакт фиксировался при касании, а не только при перекрытии.
            _myBox.expandByScalar(2.0);

            workpieces.forEach(other => {
                if (myGroup.includes(other)) return;
                const dy = Math.abs(other.position.y - dragging.position.y);
                if (dy < 100) {
                    myGroup.forEach(me => resolveCollisionPrimary(me, other));
                }
                // Проверка пересечения габаритных контейнеров (THREE.Box3) для индикации стыковки.
                other.updateMatrixWorld(true);
                _otherBox.setFromObject(other);
                if (_myBox.intersectsBox(_otherBox)) inContact = true;
            });

            // Обновляем проекционный круг под деталью: синий (захват) / жёлтый (контакт).
            // Фактическая высота поверхности опоры = supportY - EPS (т.к. computeSupportAt добавил EPS).
            const supportSurfaceY = s.supportY - EPS_Y_MAIN;
            updateSupportMarkerForMesh(dragging, supportSurfaceY, inContact);
        }

        function endDrag() {
            if (!dragging) return;
            supportMarker.visible = false;
            // Жёсткая фиксация к опоре: сначала приближение, затем точная коррекция.
            const s = computeSupportAt(dragging, dragging.position.x, dragging.position.z, [dragging]);
            dragging.position.y = s.supportY;
            dragging.updateMatrixWorld(true);
            // Точная AABB-коррекция финального положения
            const _exactMinY_end = getExactWorldMinY(dragging);
            if (_exactMinY_end !== null) {
                const _surfY_end = s.supportY + s.offs.minY - EPS_Y_MAIN;
                dragging.position.y += (_surfY_end + EPS_Y_MAIN) - _exactMinY_end;
                dragging.updateMatrixWorld(true);
            }
            // 1. DISABLE GHOST (Restore Opacity)
            setGhostMode(dragging, false);
            
            // 2. DISABLE HIGHLIGHT (Revert to Single Material)
            updatePartHighlight(dragging, false);

             dragging.userData.groupPeers = null; 
            dragging = null;
        }

        function handleRotateWheel(delta) {
             if (!dragging) return;
             const step = Math.PI / 4; // Увеличено с PI/8 до PI/4 (45 градусов) для четкой и ровной стыковки углов
             const dir = delta > 0 ? -1 : 1;
             if (!dragging.userData.yawAngle) dragging.userData.yawAngle = 0;
             dragging.userData.yawAngle += dir * step;
             updateOrientation(dragging, true);
        }

        function handleRotateClick() {
            if (!dragging) return;
            const mesh = dragging;

            if (!mesh.userData.validOrientations || mesh.userData.validOrientations.length === 0) {
                if (typeof calculateNormalsAndVisuals === 'function') calculateNormalsAndVisuals(mesh);
            }

            let validNormals = mesh.userData.validOrientations;
            if (!validNormals || validNormals.length <= 1) return;

            let idx = mesh.userData.currentOrientIndex || 0;
            idx = (idx + 1) % validNormals.length;
            mesh.userData.currentOrientIndex = idx;

            const targetNormal = validNormals[idx];
            const down = new THREE.Vector3(0, -1, 0);
            
            const q = new THREE.Quaternion();
            
            // НОВАЯ ЛОГИКА: ЖЕСТКАЯ ПРИВЯЗКА К ОСЯМ (Устраняет любые крены и наклоны в XZ/YZ)
            let localUp = targetNormal.clone().normalize();
            let localRight, localFwd;

            if (Math.abs(localUp.z) > 0.9) {
                // Плашмя (лицевая/обратная сторона)
                localUp.set(0, 0, Math.sign(localUp.z)); // Жестко обнуляем X и Y
                localRight = new THREE.Vector3(1, 0, 0);
                // Корректируем Right для задней стороны, чтобы не выворачивало наизнанку
                if (localUp.z < 0) localRight.set(-1, 0, 0); 
                localFwd = new THREE.Vector3().crossVectors(localRight, localUp).normalize();
            } else {
                // На ребро (targetNormal лежит в XY)
                localUp.z = 0; // СТРОГО обнуляем Z, чтобы ребро было идеально горизонтальным
                localUp.normalize();
                
                let localZ = new THREE.Vector3(0, 0, 1);
                localRight = new THREE.Vector3().crossVectors(localUp, localZ).normalize();
                localFwd = new THREE.Vector3().crossVectors(localRight, localUp).normalize();
            }

            // Находим текущее направление "вперед" в мире для сохранения ориентации
            let worldFwd = localFwd.clone().applyQuaternion(mesh.quaternion);
            worldFwd.y = 0; 
            if (worldFwd.lengthSq() < 0.001) worldFwd.set(0, 0, 1);
            worldFwd.normalize();
            
            // Привязка к ближайшей мировой оси (X или Z)
            if (Math.abs(worldFwd.x) > Math.abs(worldFwd.z)) {
                worldFwd.set(Math.sign(worldFwd.x), 0, 0);
            } else {
                worldFwd.set(0, 0, Math.sign(worldFwd.z));
            }

            let worldRight = new THREE.Vector3().crossVectors(down, worldFwd).normalize();

            // Создаем матрицы преобразования из локальной в мировую
            let localMat = new THREE.Matrix4().makeBasis(localRight, localUp, localFwd);
            let worldMat = new THREE.Matrix4().makeBasis(worldRight, down, worldFwd);

            // Итоговый поворот = World * Local^(-1)
            let finalMat = worldMat.clone().multiply(localMat.invert());
            q.setFromRotationMatrix(finalMat);

            mesh.userData.isAnimating = true;
            mesh.userData.animStartQuat = mesh.quaternion.clone();
            mesh.userData.animTargetQuat = q.clone();
            mesh.userData.animProgress = 0;
            mesh.userData.baseQuat = q.clone();
            mesh.userData.yawAngle = 0; // Сброс угла поворота от колесика, так как мы выровнялись по сетке

            updatePartHighlight(mesh, true);
        }

        window.addEventListener('mousedown', (e) => {
            if (window.activeRemote) {
                // If remote is active, block interaction with physics objects
                if (e.button === 0 || e.button === 2) {
                    e.stopPropagation();
                }
                return;
            }
            if (typeof cameraMode === 'undefined' || cameraMode !== 'FPS' || typeof controls === 'undefined' || !controls.isLocked) return;

            // ── ПЛАЗМОРЕЗ активен: блокируем подхват деталей ──
            if (window.PlasmaC && window.PlasmaC.isActive) return;

            // Интерактивные органы управления на 3D-модели аппарата (приоритетнее подбора инструмента)
            if (e.button === 0 && typeof getHoveredWelderControl === 'function') {
                const ctrl = getHoveredWelderControl();
                if (ctrl) {
                    return; // ползунок управляется колесом; клик гасим, чтобы не подбирать инструмент
                }
            }

            // Подбор сварочного аппарата — доступен любому рабочему в FPS-режиме
            if (e.button === 0 && !dragging) {
                raycaster.setFromCamera(_camCenter, camera);
                const _mHits = raycaster.intersectObjects(scene.children, true);
                for (const h of _mHits) {
                    if (h.distance > 400) break;
                    let obj = h.object; let isWM = false;
                    while (obj) {
                        if (obj.userData.isWelderMachine || obj.userData.isWelderMachineGroup) { isWM = true; break; }
                        obj = obj.parent;
                    }
                    if (isWM) {
                        if (typeof weldingTorch !== 'undefined' && !weldingTorch && typeof createWeldingTool === 'function') createWeldingTool();
                        window.hasWelder = true;
                        if (typeof setTool === 'function' && typeof TOOL_WELDER !== 'undefined') setTool(TOOL_WELDER);
                        return;
                    }
                }
            }

            // === ТЕЛЕЖКА (доступна для управления любому сотруднику в FPS-режиме) ===
            if (e.button === 0 && !dragging) {
                const cartHit = typeof checkCartHandleHit === 'function' ? checkCartHandleHit() : null;
                if (cartHit && cartHit.dist < 500) { 
                    if (typeof isHoldingCart !== 'undefined') isHoldingCart = true; 
                    if (typeof activeCart !== 'undefined') activeCart = cartHit.cart;
                    const cartIndicator = document.getElementById('cartIndicator');
                    if (cartIndicator) cartIndicator.classList.remove('hidden');
                    return;
                }
            }

            if (typeof currentIdentity === 'undefined' || !currentIdentity || currentIdentity.name !== 'Сборщик-Сварщик') return;
            
            if (e.button === 0) {
                // === СВАРОЧНЫЙ ИНСТРУМЕНТ ===
                if (typeof activeTool !== 'undefined' && typeof TOOL_WELDER !== 'undefined' && activeTool === TOOL_WELDER) {
                    if (typeof isMaskEquipped !== 'undefined' && isMaskEquipped && typeof isGlassDown !== 'undefined' && isGlassDown) {
                        if (typeof isWeldingNow !== 'undefined') isWeldingNow = true;
                        if (typeof audioCtx !== 'undefined' && !audioCtx && typeof initWeldingAudio === 'function') initWeldingAudio();
                    }
                    return;
                }
                // === ДЕТАЛЬ ===
                if (!dragging) {
                    const hit = typeof tryPickWorkpiece === 'function' ? tryPickWorkpiece() : null;
                    if (hit) { beginDrag(hit); return; }
                    // Машина уже обработана выше (до проверки идентичности)
                    if (typeof cleanSlag === 'function') cleanSlag();
                }
            } else if (e.button === 2) {
                // RMB: переключить стекло маски, если маска надета
                if (typeof isMaskEquipped !== 'undefined' && isMaskEquipped) {
                    if (typeof isGlassDown !== 'undefined') isGlassDown = !isGlassDown;
                    const glassEl = document.getElementById('weldGlass');
                    const stateEl = document.getElementById('glassState');
                    if (typeof isGlassDown !== 'undefined' && isGlassDown) {
                        if (glassEl) glassEl.style.opacity = '1';
                        if (stateEl) {
                            stateEl.textContent = 'ON';
                            stateEl.style.color = '#ff4444';
                        }
                    } else {
                        if (glassEl) glassEl.style.opacity = '0';
                        if (stateEl) {
                            stateEl.textContent = 'OFF';
                            stateEl.style.color = '#00ff00';
                        }
                        if (typeof isWeldingNow !== 'undefined') isWeldingNow = false;
                        if (typeof weldLight !== 'undefined' && weldLight) weldLight.intensity = 0;
                    }
                    return;
                }
                if (dragging) handleRotateClick();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                if (typeof isWeldingNow !== 'undefined') isWeldingNow = false; // Stop welding on LMB release
                if (typeof weldLight !== 'undefined' && weldLight) weldLight.intensity = 0;
                const hudStats = document.getElementById('weldStats');
                if (hudStats) hudStats.style.display = 'none';
                if (typeof isHoldingCart !== 'undefined' && isHoldingCart) {
                    isHoldingCart = false; 
                    if (typeof activeCart !== 'undefined') activeCart = null;
                    const cartIndicator = document.getElementById('cartIndicator');
                    if (cartIndicator) cartIndicator.classList.add('hidden');
                }
                if (dragging && !(window.PlasmaC && window.PlasmaC.isActive)) endDrag();
            }
        });     

        window.addEventListener('wheel', (e) => {
            if (window.activeRemote) return;
            if (typeof cameraMode === 'undefined' || cameraMode !== 'FPS' || typeof controls === 'undefined' || !controls.isLocked) return;
            // Колесо по наведённому ползунку аппарата → меняем ток/напряжение
            if (typeof getHoveredWelderControl === 'function') {
                const ctrl = getHoveredWelderControl();
                if (ctrl && ctrl.kind === 'slider' && typeof adjustWelder === 'function') {
                    adjustWelder(ctrl.param, e.deltaY < 0 ? 1 : -1);
                    return;
                }
            }
            if (dragging) handleRotateWheel(e.deltaY);
        });
                    
        // --- ПЕРЕОПРЕДЕЛЕНИЕ ГЕНЕРАТОРА: ФИЗИКА + ФИЛЬТРАЦИЯ РАДИАЛЬНЫХ ГРАНЕЙ ---
        const originalGen = generate3DPartFromCAD;

        generate3DPartFromCAD = function(cadData, thicknessMM, dimensions = null) {

            // 1. Проверяем наличие реальной геометрии в CAD
            let hasRealGeometry = false;
            if (cadData && cadData.length > 0) {
                hasRealGeometry = cadData.some(s => s.type !== 'dimension' && !s.isConstruction);
            }

            let mesh = null;

            if (!hasRealGeometry) {
                // Нет контура — строим прямоугольник по dimensions (fallback)
                mesh = originalGen(null, thicknessMM, dimensions);
            } else {
                // Есть контур (включая дуги/вырезы) — экструдируем
                mesh = originalGen(cadData, thicknessMM, dimensions);
            }

            if (mesh) {
                // 2. Вычисляем нормали (фильтруя радиальные поверхности от дуг)
                // calculateNormalsAndVisuals вызовется при первом ПКМ или beginDrag
                // Здесь только регистрируем в физике
                registerWorkpiece(mesh);

                // 3. Добавляем метаданные о геометрии для правильного поворота
                // Помечаем что деталь создана из CAD (может иметь дуги)
                mesh.userData.isCADPart = true;
                mesh.userData.hasCurves = cadData && cadData.some(s => 
                    s.type === 'arc' || s.type === 'circle'
                );
            }

            return mesh;
        };