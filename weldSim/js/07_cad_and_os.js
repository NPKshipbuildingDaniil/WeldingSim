// --- Computer Interaction Logic ---
        let activeComputer = null;

        // Interaction Click Handler (Shared for GOD and FPS modes logically, but separated here)
        document.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;

            // 1. FPS Mode Computer Interaction
            if (typeof cameraMode !== 'undefined' && cameraMode === 'FPS' && controls.isLocked) {
                // Raycast from center of screen
                raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                
                // Get all screens
                const screens = officeComputers.map(c => c.mesh);
                const intersects = raycaster.intersectObjects(screens);

                if (intersects.length > 0) {
                    const screenMesh = intersects[0].object;
                    const compData = officeComputers.find(c => c.mesh === screenMesh);

                if (compData) {
                    // Check Ownership - только владелец может использовать компьютер
                    if (currentIdentity && currentIdentity.name === compData.owner) {
                        enterComputerMode(compData);
                    } else if (!currentIdentity && compData.owner === "Начальник") {
                        enterComputerMode(compData); // Начальник заходит в свой комп
                    } else if (!currentIdentity) {
                        // Начальник не может использовать компьютеры работников
                        console.log(`Доступ запрещен. Вы начальник, это компьютер: ${compData.owner}`);
                    } else {
                        // Другой работник
                        console.log(`Доступ запрещен. Это компьютер пользователя: ${compData.owner}. Вы: ${currentIdentity.name}`);
                    }
                }
                }
            }
        });

        // --- GLOBAL NETWORK (Server Simulation) ---
        const SERVER_DATABASE = {
            sentTasks: [] // Stores objects: { id, sender, date, projectName, parts: [] }
        };

        // --- HELPER: CAD THUMBNAIL GENERATOR ---
        function generatePartThumbnail(cadData) {
            if (!cadData || cadData.length === 0) return null; // Return placeholder or null

            // 1. Create off-screen canvas
            const cvs = document.createElement('canvas');
            const size = 200; // Resolution
            cvs.width = size; cvs.height = size;
            const ctx = cvs.getContext('2d');

            // 2. Background
            ctx.fillStyle = '#E8ECF1'; // Light CAD background
            ctx.fillRect(0,0, size, size);

            // 3. Calculate Bounds
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            
            // Helper to expand bounds
            const expand = (x, y) => {
                if(x < minX) minX = x; if(x > maxX) maxX = x;
                if(y < minY) minY = y; if(y > maxY) maxY = y;
            };

            cadData.forEach(s => {
                if(s.type === 'line') { expand(s.start.x, s.start.y); expand(s.end.x, s.end.y); }
                else if(s.type === 'circle') { expand(s.center.x - s.radius, s.center.y - s.radius); expand(s.center.x + s.radius, s.center.y + s.radius); }
                else if(s.type === 'arc') { 
                    // Simplified bounding box for arc (treat as circle for safety margin)
                    expand(s.center.x - s.radius, s.center.y - s.radius); expand(s.center.x + s.radius, s.center.y + s.radius); 
                }
            });

            // If empty or single point
            if(minX === Infinity) return null;

            // 4. Calculate Fit Scale
            const dataW = maxX - minX;
            const dataH = maxY - minY;
            const padding = 20;
            const availableSize = size - (padding * 2);
            
            const scaleX = availableSize / dataW;
            const scaleY = availableSize / dataH;
            const scale = Math.min(scaleX, scaleY); // Uniform scale

            // 5. Draw
            ctx.translate(size/2, size/2); // Move to center
            ctx.scale(scale, scale);
            // Translate back by data center
            const centerX = minX + dataW/2;
            const centerY = minY + dataH/2;
            ctx.translate(-centerX, -centerY);

            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = '#1e293b'; // Dark lines
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            cadData.forEach(s => {
                ctx.beginPath();
                if(s.type === 'line') {
                    ctx.moveTo(s.start.x, s.start.y); ctx.lineTo(s.end.x, s.end.y);
                } else if(s.type === 'circle') {
                    ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI*2);
                } else if(s.type === 'arc') {
                    ctx.arc(s.center.x, s.center.y, s.radius, s.startAngle, s.endAngle, s.counterClockwise);
                }
                ctx.stroke();
            });

            return cvs.toDataURL('image/png');
        }

        // --- Technologist OS & CAD System Logic ---
               const techOS = {
            projects: [],
            currentProjectIdx: -1,
            currentPartIdx: -1,
            
            // Core CAD State (ported from GIPERPLASMA)
            canvas: null,
            ctx: null,
            
            cadState: {
                              tool: 'edit', 
                ortho: false,
                construction: false, 
                isDrawing: false,
                points: [], 
                shapes: [], 
                view: { x: 0, y: 0, zoom: 1.0, isPanning: false, lastPan: {x:0, y:0} },
                mouse: { x: 0, y: 0 }, 
                snappedPoint: null,
                selectedShapeIndex: -1,
                dragHandleIndex: -1,
                hoverShapeIndex: -1,
                dragCache: null, 
                dimState: { isWidthSet: false, nextType: 'width' },
                rectParams: { length: 100, width: 50, cornerMode: 'none', chamfer: 10, fillet: 10 },
                kneeParams: { height: 200, width: 200, topFlange: 50, botFlange: 50, chamfer: 0, cornerMode: 'none', blChamfer: 20, blFillet: 20, brCornerMode: 'none', brChamfer: 20, brFillet: 20 }
            },

            // State for Editing via Modals
            editState: {
                isEditingProject: false,
                projectIdx: -1,
                isEditingPart: false,
                partIdx: -1
            },
            
            // Theme State
            isDarkMode: false, // Clean Factory light mode

            // --- SUPPLY STATE ---
            supplyState: {
                activeTask: null,
                groups: [], // Array of { id, name, partIndices: [] }
                editingGroupId: null // For renaming or adding parts
            },

            // --- SUPPLY LOGIC ---
            
            initSupplyListeners: function() {
                // Open Request Mode
                const openBtn = document.getElementById('btn-open-request-mode');
                if(openBtn) {
                    openBtn.onclick = () => {
                        this.openRequestScreen();
                    };
                }

                // Back from Request Mode
                document.getElementById('btn-req-back').onclick = () => {
                    document.getElementById('screen-supply-request').classList.add('hidden');
                    document.getElementById('screen-supply-details').classList.remove('hidden');
                };

                // --- GENERATE WORD REPORT ---
                document.getElementById('btn-req-download').onclick = async () => {
                    const task = this.supplyState.activeTask;
                    const groups = this.supplyState.groups;
                    
                    if(!task) {
                        console.error("No active task for report");
                        return;
                    }
                    
                    // Access Library safely
                    const docx = window.docx;
                    if(!docx) {
                        alert("Ошибка: библиотека для создания Word-документов (.docx) не загружена. Для сохранения отчёта требуется подключение к интернету для загрузки библиотеки.");
                        console.error("DOCX Library not loaded");
                        return;
                    }

                                        // Helper: Convert DataURL to Uint8Array
                    const dataURLtoBuffer = (dataurl) => {
                        if(!dataurl) return null;
                        try {
                            const arr = dataurl.split(',');
                            const bstr = atob(arr[1]);
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while(n--) u8arr[n] = bstr.charCodeAt(n);
                            return u8arr;
                        } catch(e) { console.error("Img error", e); return null; }
                    };

const globalCreateBtn = document.getElementById('btn-global-create-order');
                if(globalCreateBtn) {
                    globalCreateBtn.onclick = () => {
                        // Открываем модалку заказа, передаем ВСЕ задачи для выбора
                        this.openOrderModal(SERVER_DATABASE.sentTasks);
                    };
                }

                    // Helper: Generate INVERTED (Print-friendly) Thumbnail from CAD Data
                    const generatePrintThumbnail = (cadData) => {
                        if (!cadData || cadData.length === 0) return null;
                        const cvs = document.createElement('canvas');
                        const size = 300; // High res for print
                        cvs.width = size; cvs.height = size;
                        const ctx = cvs.getContext('2d');

                        // 1. White Background (Paper color)
                        ctx.fillStyle = '#ffffff'; 
                        ctx.fillRect(0,0, size, size);

                        // Calculate Bounds
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        const expand = (x, y) => { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; };
                        cadData.forEach(s => {
                            if(s.type === 'line') { expand(s.start.x, s.start.y); expand(s.end.x, s.end.y); }
                            else if(s.type === 'circle') { expand(s.center.x - s.radius, s.center.y - s.radius); expand(s.center.x + s.radius, s.center.y + s.radius); }
                        });
                        if(minX === Infinity) return null;

                        const dataW = maxX - minX; const dataH = maxY - minY;
                        const padding = 30;
                        const scale = Math.min((size - padding*2)/dataW, (size - padding*2)/dataH);

                        ctx.translate(size/2, size/2);
                        ctx.scale(scale, scale);
                        ctx.translate(-(minX + dataW/2), -(minY + dataH/2));

                        // 2. Black Lines (Ink color)
                        ctx.lineWidth = 3 / scale; // Thicker lines for print visibility
                        ctx.strokeStyle = '#000000'; 
                        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

                        cadData.forEach(s => {
                            ctx.beginPath();
                            if(s.type === 'line') { ctx.moveTo(s.start.x, s.start.y); ctx.lineTo(s.end.x, s.end.y); }
                            else if(s.type === 'circle') { ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI*2); }
                            else if(s.type === 'arc') { ctx.arc(s.center.x, s.center.y, s.radius, s.startAngle, s.endAngle, s.counterClockwise); }
                            ctx.stroke();
                        });

                        return cvs.toDataURL('image/png');
                    };

                    const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun, ImageRun, AlignmentType, HeadingLevel, BorderStyle, ShadingType, HeightRule, VerticalAlign, PageBreak } = docx;

                    // 1. Prepare Content Array FIRST (Fixes empty first page issue)
                    const children = [];

                    // 2. HEADER
                    children.push(
                        new Paragraph({
                            text: "ЗАПРОС НА СНАБЖЕНИЕ",
                            heading: HeadingLevel.HEADING_1,
                            alignment: AlignmentType.CENTER,
                            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 10 } },
                            spacing: { after: 300 },
                            run: { font: "Arial", size: 28, bold: true }
                        })
                    );

                    // 3. METADATA
                    const createMetaLine = (label, value) => {
                        return new Paragraph({
                            children: [
                                new TextRun({ text: label + ": ", bold: true, size: 22 }),
                                new TextRun({ text: value, size: 22 })
                            ],
                            spacing: { after: 100 }
                        });
                    };

                    children.push(createMetaLine("ПРОЕКТ", task.projectName.toUpperCase()));
                    
                    // Подсчёт суммарной массы для отчёта
                    let totalMassDocx = 0;
                    task.parts.forEach(p => { totalMassDocx += this.getPartMass(p) * p.qty; });
                    children.push(createMetaLine("СУММАРНАЯ МАССА ЗАКАЗА", `${totalMassDocx.toFixed(2)} кг`));
                    
                    children.push(createMetaLine("ДАТА", new Date().toLocaleString("ru-RU")));
                    children.push(createMetaLine("ОТПРАВИТЕЛЬ", task.sender));
                    
                    children.push(new Paragraph({ text: "", spacing: { after: 300 } }));

                    // 4. GROUPS
                    children.push(
                        new Paragraph({
                            children: [ new TextRun({ text: "ГРУППИРОВКА", bold: true, size: 24 }) ],
                            spacing: { after: 150 },
                            border: { bottom: { style: BorderStyle.DOTTED, size: 6 } }
                        })
                    );

                    if (groups.length > 0) {
                        groups.forEach(g => {
                            children.push(new Paragraph({
                                text: `▼ ${g.name.toUpperCase()}`,
                                bold: true,
                                spacing: { before: 150, after: 50 },
                                shading: { fill: "F0F0F0", type: ShadingType.CLEAR }
                            }));
                            
                            g.partIndices.forEach(idx => {
                                const p = task.parts[idx];
                                children.push(new Paragraph({
                                    text: `• ${p.name} (${p.qty} шт.)`,
                                    indent: { left: 400 },
                                    spacing: { after: 40 }
                                }));
                            });
                        });
                        children.push(new Paragraph({ text: "", spacing: { after: 400 } }));
                    } else {
                        children.push(new Paragraph({ text: "(Нет групп)", italics: true, spacing: { after: 400 } }));
                    }

                    // 5. MASTER TABLE
                    children.push(
                        new Paragraph({
                            children: [ new TextRun({ text: "СПЕЦИФИКАЦИЯ ДЕТАЛЕЙ", bold: true, size: 24 }) ],
                            spacing: { after: 200 }
                        })
                    );

                    // Table Logic - UPDATED COLUMNS
                    const tableHeaderRow = new TableRow({
                        tableHeader: true,
                        height: { value: 400, rule: HeightRule.AT_LEAST },
                        children: [
                            new TableCell({ children: [new Paragraph({text: "ЭСКИЗ", alignment: AlignmentType.CENTER, bold: true, size: 18})], width: { size: 15, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" }, verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({text: "НАИМЕНОВАНИЕ", alignment: AlignmentType.CENTER, bold: true, size: 18})], width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" }, verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({text: "ПАРАМЕТРЫ", alignment: AlignmentType.CENTER, bold: true, size: 18})], width: { size: 15, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" }, verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({text: "КОЛ", alignment: AlignmentType.CENTER, bold: true, size: 18})], width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" }, verticalAlign: VerticalAlign.CENTER }),
                            // SPLIT COMMENTS INTO TWO COLUMNS
                            new TableCell({ children: [new Paragraph({text: "КОММ. ТЕХН.", alignment: AlignmentType.CENTER, bold: true, size: 18})], width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" }, verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({text: "КОММ. СНАБ.", alignment: AlignmentType.CENTER, bold: true, size: 18})], width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" }, verticalAlign: VerticalAlign.CENTER }),
                        ]
                    });

                    const tableRows = [tableHeaderRow];

                    task.parts.forEach(p => {
                        let imageContent = new Paragraph({ text: "Нет", alignment: AlignmentType.CENTER, size: 16 });
                        
                        // GENERATE INVERTED THUMBNAIL ON THE FLY
                        if (p.cadData && p.cadData.length > 0) {
                            const printThumb = generatePrintThumbnail(p.cadData);
                            const imgBuffer = dataURLtoBuffer(printThumb);
                            if (imgBuffer) {
                                imageContent = new Paragraph({
                                    children: [
                                        new ImageRun({
                                            data: imgBuffer,
                                            // INCREASED SIZE BY 40% (100 -> 140)
                                            transformation: { width: 140, height: 140 }, 
                                            type: "png"
                                        })
                                    ],
                                    alignment: AlignmentType.CENTER
                                });
                            }
                        }

                        tableRows.push(new TableRow({
                            children: [
                                new TableCell({ children: [imageContent], verticalAlign: VerticalAlign.CENTER }),
                                
                                new TableCell({ children: [new Paragraph({text: p.name, bold: true, size: 20})], verticalAlign: VerticalAlign.CENTER }), 
                                
                                new TableCell({ children: [
                                    new Paragraph({text: `${p.finalDims.w} x ${p.finalDims.l} мм`, size: 20}),
                                    new Paragraph({text: `s = ${p.thick} мм`, size: 20}),
                                    new Paragraph({text: `Мат: ${p.materialName || 'Сталь'}`, size: 18, italics: true}),
                                    new Paragraph({text: `Масса (шт): ${this.getPartMass(p) > 0 ? this.getPartMass(p).toFixed(2) : '--'} кг`, size: 18}),
                                ], verticalAlign: VerticalAlign.CENTER }),
                                
                                new TableCell({ children: [new Paragraph({text: p.qty.toString(), alignment: AlignmentType.CENTER, bold: true, size: 24})], verticalAlign: VerticalAlign.CENTER }),
                                
                                // Tech Comment Cell
                                new TableCell({ children: [new Paragraph({text: p.techComment || "-", size: 18, italics: true})], verticalAlign: VerticalAlign.CENTER }),
                                
                                // Supply Comment Cell
                                new TableCell({ children: [new Paragraph({text: p.supplyComment || "-", size: 18, italics: true})], verticalAlign: VerticalAlign.CENTER }),
                            ]
                        }));
                    });

                    const masterTable = new Table({
                        rows: tableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 4 },
                            bottom: { style: BorderStyle.SINGLE, size: 4 },
                            left: { style: BorderStyle.SINGLE, size: 4 },
                            right: { style: BorderStyle.SINGLE, size: 4 },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 2 },
                            insideVertical: { style: BorderStyle.SINGLE, size: 2 }
                        }
                    });

                    children.push(masterTable);

                    // 6. INITIALIZE DOC AT THE END (Single Section)
                    const doc = new Document({
                        styles: {
                            default: {
                                document: {
                                    run: { font: "Arial", size: 24, color: "000000" },
                                    paragraph: { spacing: { line: 276, before: 0, after: 0 } },
                                },
                            },
                        },
                        sections: [{
                            properties: {
                                page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
                            },
                            children: children // Pass content directly here
                        }]
                    });
                    
                    Packer.toBlob(doc).then((blob) => {
                        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `ТЗ_${task.projectName}.docx`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                        console.log("Doc generated");
                    });
                };
                
                // Add Group Button
                document.getElementById('btn-req-add-group').onclick = () => {
                    this.supplyState.editingGroupId = null; // null means creating new
                    document.getElementById('input-req-group-name').value = '';
                    document.getElementById('modal-req-group-name').classList.remove('hidden');
                    document.getElementById('input-req-group-name').focus();
                };

                // Confirm Group Name
                document.getElementById('btn-confirm-req-group').onclick = () => {
                    const name = document.getElementById('input-req-group-name').value;
                    if(name) {
                        if (this.supplyState.editingGroupId !== null) {
                            // Rename existing
                            const grp = this.supplyState.groups.find(g => g.id === this.supplyState.editingGroupId);
                            if(grp) grp.name = name;
                        } else {
                            // Create new
                            this.supplyState.groups.push({
                                id: Date.now(),
                                name: name,
                                partIndices: []
                            });
                        }
                        this.renderRequestGroups();
                        document.getElementById('modal-req-group-name').classList.add('hidden');
                    }
                };

                // Submit Request Group on Enter
                document.getElementById('input-req-group-name').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') document.getElementById('btn-confirm-req-group').click();
                });

                // Confirm Add Parts
                document.getElementById('btn-confirm-add-parts').onclick = () => {
                    const checkboxes = document.querySelectorAll('.req-part-checkbox:checked');
                    const targetGroup = this.supplyState.groups.find(g => g.id === this.supplyState.editingGroupId);
                    
                    if(targetGroup) {
                        checkboxes.forEach(cb => {
                            const idx = parseInt(cb.value);
                            // Avoid duplicates in the same group
                            if(!targetGroup.partIndices.includes(idx)) {
                                targetGroup.partIndices.push(idx);
                            }
                        });
                        this.renderRequestGroups();
                    }
                    document.getElementById('modal-req-select-parts').classList.add('hidden');
                };
            },

            openRequestScreen: function() {
                // Switch screens
                document.getElementById('screen-supply-details').classList.add('hidden');
                document.getElementById('screen-supply-request').classList.remove('hidden');
                
                // Initialize state if empty for this task (simple version: reset on open or keep memory?)
                // For this demo, we keep memory in this.supplyState.groups until page reload
                
                this.renderRequestGroups();
            },

            renderRequestGroups: function() {
                const c = document.getElementById('request-groups-container');
                c.innerHTML = '';
                
                const task = this.supplyState.activeTask;
                if(!task) return;

                // 1. Calculate Stats
                const totalParts = task.parts.length;
                // Get all unique indices distributed across all groups
                const distributedIndices = new Set();
                this.supplyState.groups.forEach(g => {
                    g.partIndices.forEach(idx => distributedIndices.add(idx));
                });
                
                document.getElementById('req-stat-total').innerText = totalParts;
                document.getElementById('req-stat-dist').innerText = distributedIndices.size;


                // 2. Render Groups
                this.supplyState.groups.forEach(group => {
                    const groupDiv = document.createElement('div');
                groupDiv.className = "bg-[#C8CED8] rounded-lg border border-white overflow-hidden mb-3";

                    // Group Header
                    const header = document.createElement('div');
                header.className = "bg-[#E8ECF1] p-3 flex justify-between items-center border-b border-white";
                    header.innerHTML = `
                        <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-[#1a1a1a]">📁 ${group.name}</span>
                        <span class="text-[10px] bg-[#FFFFFF] border border-[#A8AEB8] text-[#1a1a1a] px-1.5 rounded">${group.partIndices.length} шт</span>
                        </div>
                        <div class="flex gap-2">
                         <button class="btn-req-add-items bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#3355CC] text-[10px] w-6 h-6 rounded flex items-center justify-center border border-[#A8AEB8]" title="Добавить детали">
                                +
                             </button>
                         <button class="btn-req-edit-group text-[#666666] hover:text-[#3355CC] text-[10px]" title="Переименовать">✎</button>
                         <button class="btn-req-del-group text-[#E03030] hover:text-[#b91c1c] text-[10px]" title="Удалить группу">🗑</button>
                        </div>
                    `;
                    groupDiv.appendChild(header);

                    // Logic for Header Buttons
                    header.querySelector('.btn-req-del-group').onclick = () => {
                        this.supplyState.groups = this.supplyState.groups.filter(g => g.id !== group.id);
                        this.renderRequestGroups();
                    };
                    header.querySelector('.btn-req-edit-group').onclick = () => {
                        this.supplyState.editingGroupId = group.id;
                        document.getElementById('input-req-group-name').value = group.name;
                        document.getElementById('modal-req-group-name').classList.remove('hidden');
                    };
                    header.querySelector('.btn-req-add-items').onclick = () => {
                        this.openPartSelector(group.id);
                    };

                    // Group Content (Parts List)
                    const content = document.createElement('div');
                    content.className = "p-2 space-y-1 bg-[#FFFFFF]/50";

                    if(group.partIndices.length === 0) {
                        content.innerHTML = `<div class="text-[10px] text-[#666666] text-center py-2 italic">Нет добавленных деталей</div>`;
                    } else {
                        // Header for Columns (Indented)
                        const colHeader = document.createElement('div');
                        colHeader.className = "grid grid-cols-12 gap-2 px-2 text-[9px] font-bold text-[#666666] mb-1 ml-4 border-b border-white pb-1";
                        colHeader.innerHTML = `
                            <div class="col-span-6">НАИМЕНОВАНИЕ</div>
                            <div class="col-span-4">ГАБАРИТЫ</div>
                            <div class="col-span-2 text-right">КОЛ-ВО</div>
                        `;
                        content.appendChild(colHeader);

                        // Parts Rows
                        group.partIndices.forEach(idx => {
                            const part = task.parts[idx];
                            if(!part) return;
                            
                            const row = document.createElement('div');
                            // Indent with margin-left
                            row.className = "grid grid-cols-12 gap-2 px-2 py-1 ml-4 text-[11px] text-[#1a1a1a] border-b border-white last:border-0 hover:bg-[#FFFFFF]";
                            row.innerHTML = `
                                <div class="col-span-6 truncate font-medium">${part.name}</div>
                                <div class="col-span-4 opacity-70">${part.finalDims.w} x ${part.finalDims.l} / ${part.thick}мм</div>
                                <div class="col-span-2 text-right font-bold text-[#3355CC]">${part.qty}</div>
                            `;
                            
                            // Remove button for row? Not specified, but useful. 
                            // Adding simple click to remove logic could be annoying, let's keep it view only or add explicit 'x' later if needed.
                            content.appendChild(row);
                        });
                    }

                    groupDiv.appendChild(content);
                    c.appendChild(groupDiv);
                });
            },

            openPartSelector: function(groupId) {
                this.supplyState.editingGroupId = groupId;
                const modal = document.getElementById('modal-req-select-parts');
                const list = document.getElementById('req-parts-selector-list');
                list.innerHTML = '';
                
                const task = this.supplyState.activeTask;
                // Which parts are already in THIS group?
                const group = this.supplyState.groups.find(g => g.id === groupId);
                const currentGroupIndices = group ? group.partIndices : [];

                // Which parts are distributed ANYWHERE? (Optional: to mark them)
                // const allDistributed = new Set();
                // this.supplyState.groups.forEach(g => g.partIndices.forEach(i => allDistributed.add(i)));

                task.parts.forEach((part, idx) => {
                    // Skip if already in this group
                    if(currentGroupIndices.includes(idx)) return;

                    const row = document.createElement('label');
                    row.className = "flex items-center gap-3 p-2 rounded hover:bg-[#E8ECF1] cursor-pointer border border-transparent hover:border-white";
                    
                    row.innerHTML = `
                        <input type
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between">
                                <span class="text-sm font-bold text-slate-200 truncate">${part.name}</span>
                                <span class="text-xs bg-slate-700 px-1.5 rounded text-slate-300">${part.qty} шт</span>
                            </div>
                            <div class="text-[10px] text-slate-500">
                                ${part.finalDims.w}x${part.finalDims.l} • ${part.thick}мм
                            </div>
                        </div>
                    `;
                    list.appendChild(row);
                });
                
                modal.classList.remove('hidden');
            },

            // --- MATH HELPERS (From Source) ---
            math: {
                getDistance: (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)),
                getArcParams: (p1, p2, p3) => {
                    const x1 = p1.x, y1 = p1.y; const x2 = p2.x, y2 = p2.y; const x3 = p3.x, y3 = p3.y;
                    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
                    if (Math.abs(D) < 0.001) return null; 
                    const Ux = ((x1*x1 + y1*y1) * (y2 - y3) + (x2*x2 + y2*y2) * (y3 - y1) + (x3*x3 + y3*y3) * (y1 - y2)) / D;
                    const Uy = ((x1*x1 + y1*y1) * (x3 - x2) + (x2*x2 + y2*y2) * (x1 - x3) + (x3*x3 + y3*y3) * (x2 - x1)) / D;
                    const center = { x: Ux, y: Uy };
                    const radius = Math.sqrt(Math.pow(center.x - p1.x, 2) + Math.pow(center.y - p1.y, 2));
                    const startAngle = Math.atan2(y1 - Uy, x1 - Ux);
                    const midAngle = Math.atan2(y2 - Uy, x2 - Ux);
                    const endAngle = Math.atan2(y3 - Uy, x3 - Ux);
                    let ccw = false;
                    const norm = a => (a < 0 ? a + 2*Math.PI : a);
                    if (norm(startAngle) < norm(endAngle)) { if (norm(midAngle) > norm(startAngle) && norm(midAngle) < norm(endAngle)) ccw = false; else ccw = true; } 
                    else { if (norm(midAngle) > norm(startAngle) || norm(midAngle) < norm(endAngle)) ccw = false; else ccw = true; }
                    return { center, radius, startAngle, endAngle, counterClockwise: ccw };
                },
                distToSegment: (p, v, w) => {
                    const l2 = Math.pow(Math.sqrt(Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2)), 2);
                    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
                    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                    t = Math.max(0, Math.min(1, t));
                    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
                }
            },

            // --- РАСЧЕТ ПЛОЩАДИ И МАССЫ ДЕТАЛИ ---
            getPartArea: function(cadData, dimensions) {
                if (cadData && cadData.length > 0) {
                    const segments = [];
                    const SEGMENTS = 32;
                    cadData.forEach(s => {
                        if (s.isConstruction || s.type === 'dimension') return;
                        if (s.type === 'line') segments.push(s);
                        else if (s.type === 'circle' || s.type === 'arc') {
                            let sa = s.type === 'arc' ? s.startAngle : 0; let ea = s.type === 'arc' ? s.endAngle : Math.PI*2;
                            if (s.type === 'arc') {
                                const isCCW = !s.counterClockwise; if (isCCW && ea < sa) ea += Math.PI * 2; if (!isCCW && sa < ea) sa += Math.PI * 2;
                            }
                            const diff = ea - sa; const steps = Math.max(2, Math.ceil((Math.abs(diff) / (Math.PI*2)) * SEGMENTS)); const step = diff / steps;
                            let px = s.center.x + Math.cos(sa) * s.radius; let py = s.center.y + Math.sin(sa) * s.radius;
                            for (let i = 1; i <= steps; i++) {
                                const a = sa + step * i; const cx = s.center.x + Math.cos(a) * s.radius; const cy = s.center.y + Math.sin(a) * s.radius;
                                segments.push({ start: {x: px, y: py}, end: {x: cx, y: cy}, type: 'line' });
                                px = cx; py = cy;
                            }
                        }
                    });
                    if (segments.length > 0) {
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
                        if (contours.length > 0) {
                            let totalArea = 0;
                            contours.sort((a,b) => Math.abs(THREE.ShapeUtils.area(b.getPoints())) - Math.abs(THREE.ShapeUtils.area(a.getPoints())));
                            if (contours[0]) {
                                totalArea = Math.abs(THREE.ShapeUtils.area(contours[0].getPoints()));
                                for (let i=1; i<contours.length; i++) totalArea -= Math.abs(THREE.ShapeUtils.area(contours[i].getPoints()));
                                return totalArea;
                            }
                        }
                    }
                }
                // Приблизительная по Bounding Box
                if (dimensions && dimensions.width && dimensions.length && !isNaN(parseFloat(dimensions.width)) && !isNaN(parseFloat(dimensions.length))) {
                    return parseFloat(dimensions.width) * parseFloat(dimensions.length);
                }
                return 0;
            },

            getPartMass: function(part) {
                const dims = part.finalDims ? { width: part.finalDims.w, length: part.finalDims.l } : part.dimensions;
                const area_mm2 = this.getPartArea(part.cadData, dims);
                const vol_m3 = (area_mm2 * part.thick) / 1000000000; // 1e9 mm^3 в m^3
                const density = part.density || 7850;
                return vol_m3 * density;
            },

            // --- INIT ---
            init: function() {
                this.initSupplyListeners(); // <--- Initialize Supply listeners
                this.canvas = document.getElementById('cad-canvas');
                this.ctx = this.canvas.getContext('2d');
                
                // Resize Observer
                new ResizeObserver(() => {
                    if(!this.canvas) return;
                    const rect = this.canvas.parentElement.getBoundingClientRect();
                    this.canvas.width = rect.width;
                    this.canvas.height = rect.height;
                    if(this.cadState.view.x === 0) { this.cadState.view.x = this.canvas.width/2; this.cadState.view.y = this.canvas.height/2; }
                    this.draw();
                }).observe(document.getElementById('screen-cad'));

                // Логика выбора материала в модалке детали
                const matSelect = document.getElementById('input-part-material');
                if (matSelect) {
                    matSelect.addEventListener('change', (e) => {
                        const container = document.getElementById('custom-density-container');
                        if (e.target.value === 'custom') {
                            container.classList.remove('hidden');
                        } else {
                            container.classList.add('hidden');
                            document.getElementById('input-part-density').value = e.target.value;
                        }
                    });
                }

                // Listeners
                this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
                this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
                this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
                
                // Вот исправленная строка (добавлен третий аргумент):
                this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
                
                this.canvas.addEventListener('contextmenu', e => e.preventDefault());
                // Toolbar
                const bindTool = (id, toolName) => {
                    document.getElementById(id).onclick = () => {
                        this.cadState.tool = toolName; this.cadState.points = []; this.cadState.isDrawing = false;
                        this.cadState.selectedShapeIndex = -1; this.updateToolbarUI(); this.draw();
                    };
                };
                bindTool('cad-tool-edit', 'edit'); bindTool('cad-tool-line', 'line');
                bindTool('cad-tool-circle', 'circle'); bindTool('cad-tool-arc', 'arc'); bindTool('cad-tool-dim', 'dim');

                // --- ТИПОВЫЕ ЭЛЕМЕНТЫ ---
                document.getElementById('cad-tool-typical').onclick = () => {
                    document.getElementById('modal-typical-catalog').classList.remove('hidden');
                };
                document.getElementById('btn-typical-catalog-close').onclick = () => {
                    document.getElementById('modal-typical-catalog').classList.add('hidden');
                };

                // Функция рисования preview прямоугольника
                const drawRectPreview = () => {
                    const cvs = document.getElementById('rect-preview-canvas');
                    if (!cvs) return;
                    const ctx = cvs.getContext('2d');
                    const W = cvs.width, H = cvs.height;
                    ctx.clearRect(0, 0, W, H);
                    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, W, H);

                    const rp = this.cadState.rectParams;
                    const len = parseFloat(document.getElementById('input-rect-length').value) || rp.length;
                    const wid = parseFloat(document.getElementById('input-rect-width').value) || rp.width;
                    const mode = rp.cornerMode;
                    const chamVal = parseFloat(document.getElementById('input-rect-chamfer')?.value) || rp.chamfer;
                    const filVal = parseFloat(document.getElementById('input-rect-fillet')?.value) || rp.fillet;

                    const maxDim = Math.max(len, wid);
                    const padding = 30;
                    const scale = (Math.min(W, H) - padding * 2) / maxDim;
                    const dx = (W - len * scale) / 2;
                    const dy = (H - wid * scale) / 2;
                    const rw = len * scale, rh = wid * scale;

                    ctx.save();
                    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.lineCap = 'round';

                    if (mode === 'chamfer' && chamVal > 0) {
                        const c = Math.min(chamVal * scale, rw/2, rh/2);
                        ctx.beginPath();
                        ctx.moveTo(dx + c, dy);
                        ctx.lineTo(dx + rw - c, dy);
                        ctx.lineTo(dx + rw, dy + c);
                        ctx.lineTo(dx + rw, dy + rh - c);
                        ctx.lineTo(dx + rw - c, dy + rh);
                        ctx.lineTo(dx + c, dy + rh);
                        ctx.lineTo(dx, dy + rh - c);
                        ctx.lineTo(dx, dy + c);
                        ctx.closePath();
                        ctx.stroke();
                        // Подпись фаски
                        ctx.fillStyle = '#fbbf24'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
                        ctx.fillText(`ф${chamVal}`, dx + c/2 + 4, dy + c/2 + 14);
                    } else if (mode === 'fillet' && filVal > 0) {
                        const r = Math.min(filVal * scale, rw/2, rh/2);
                        ctx.beginPath();
                        // Центр дуги — в самой вершине угла, дуга — вогнутая (90°, CCW)
                        ctx.moveTo(dx + r, dy);
                        ctx.lineTo(dx + rw - r, dy);
                        ctx.arc(dx + rw, dy, r, Math.PI, Math.PI/2, true);       // TR: центр в угле TR
                        ctx.lineTo(dx + rw, dy + rh - r);
                        ctx.arc(dx + rw, dy + rh, r, -Math.PI/2, Math.PI, true);  // BR: центр в угле BR
                        ctx.lineTo(dx + r, dy + rh);
                        ctx.arc(dx, dy + rh, r, 0, -Math.PI/2, true);             // BL: центр в угле BL
                        ctx.lineTo(dx, dy + r);
                        ctx.arc(dx, dy, r, Math.PI/2, 0, true);                   // TL: центр в угле TL
                        ctx.closePath();
                        ctx.stroke();
                        ctx.fillStyle = '#34d399'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
                        ctx.fillText(`R${filVal}`, dx + r/2 + 4, dy + r/2 + 14);
                    } else {
                        ctx.strokeRect(dx, dy, rw, rh);
                    }
                    ctx.restore();

                    // Размеры
                    ctx.fillStyle = '#94a3b8'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
                    ctx.fillText(`${len} мм`, dx + rw/2, dy + rh + 16);
                    ctx.save(); ctx.translate(dx - 12, dy + rh/2); ctx.rotate(-Math.PI/2);
                    ctx.fillText(`${wid} мм`, 0, 0); ctx.restore();
                };

                // Переключатель режима углов
                const setCornerMode = (mode) => {
                    this.cadState.rectParams.cornerMode = mode;
                    document.querySelectorAll('.corner-mode').forEach(b => {
                        b.classList.remove('bg-blue-700', 'text-white');
                        b.classList.add('text-slate-400');
                    });
                    const btnMap = { 'none': 'btn-corner-none', 'chamfer': 'btn-corner-chamfer', 'fillet': 'btn-corner-fillet' };
                    const activeBtn = document.getElementById(btnMap[mode]);
                    activeBtn.classList.add('bg-blue-700', 'text-white');
                    activeBtn.classList.remove('text-slate-400');
                    document.getElementById('param-chamfer').classList.toggle('hidden', mode !== 'chamfer');
                    document.getElementById('param-fillet').classList.toggle('hidden', mode !== 'fillet');
                    drawRectPreview();
                };
                document.getElementById('btn-corner-none').onclick = () => setCornerMode('none');
                document.getElementById('btn-corner-chamfer').onclick = () => setCornerMode('chamfer');
                document.getElementById('btn-corner-fillet').onclick = () => setCornerMode('fillet');

                // Открыть модалку прямоугольника
                document.getElementById('cad-typical-rect').onclick = () => {
                    document.getElementById('modal-typical-catalog').classList.add('hidden');
                    const rp = this.cadState.rectParams;
                    document.getElementById('input-rect-length').value = rp.length;
                    document.getElementById('input-rect-width').value = rp.width;
                    document.getElementById('input-rect-chamfer').value = rp.chamfer;
                    document.getElementById('input-rect-fillet').value = rp.fillet;
                    setCornerMode(rp.cornerMode);
                    document.getElementById('modal-typical-rect').classList.remove('hidden');
                    document.getElementById('input-rect-length').focus();
                    document.getElementById('input-rect-length').select();
                    drawRectPreview();
                };

                // Живой preview при вводе
                ['input-rect-length', 'input-rect-width', 'input-rect-chamfer', 'input-rect-fillet'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', drawRectPreview);
                });

                document.getElementById('btn-rect-cancel').onclick = () => {
                    document.getElementById('modal-typical-rect').classList.add('hidden');
                };
                document.getElementById('btn-rect-back').onclick = () => {
                    document.getElementById('modal-typical-rect').classList.add('hidden');
                    document.getElementById('modal-typical-catalog').classList.remove('hidden');
                };
                document.getElementById('btn-rect-ok').onclick = () => {
                    const len = parseFloat(document.getElementById('input-rect-length').value) || 100;
                    const wid = parseFloat(document.getElementById('input-rect-width').value) || 50;
                    const cham = parseFloat(document.getElementById('input-rect-chamfer').value) || 0;
                    const fil = parseFloat(document.getElementById('input-rect-fillet').value) || 0;
                    this.cadState.rectParams = { length: len, width: wid, cornerMode: this.cadState.rectParams.cornerMode, chamfer: cham, fillet: fil };
                    this.cadState.tool = 'rect-place';
                    this.cadState.points = []; this.cadState.isDrawing = true;
                    this.cadState.selectedShapeIndex = -1;
                    document.getElementById('modal-typical-rect').classList.add('hidden');
                    document.getElementById('cad-status-text').innerHTML = `РАЗМЕСТИТЬ: ${len}×${wid}мм — кликните на чертеже`;
                    this.draw();
                };
                // Enter/Escape в полях модалки
                ['input-rect-length', 'input-rect-width', 'input-rect-chamfer', 'input-rect-fillet'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') document.getElementById('btn-rect-ok').click();
                        if (e.key === 'Escape') document.getElementById('btn-rect-cancel').click();
                    });
                });

                // ============================================================
                // КНИЦА — логика
                // ============================================================
                const drawKneePreview = () => {
                    const cvs = document.getElementById('knee-preview-canvas');
                    if (!cvs) return;
                    const ctx2 = cvs.getContext('2d');
                    const W = cvs.width, H = cvs.height;
                    ctx2.clearRect(0, 0, W, H);
                    ctx2.fillStyle = '#1a1a2e'; ctx2.fillRect(0, 0, W, H);

                    const kp = this.cadState.kneeParams;
                    const H_mm = parseFloat(document.getElementById('input-knee-height')?.value) || kp.height;
                    const W_mm = parseFloat(document.getElementById('input-knee-width')?.value) || kp.width;
                    const tf  = parseFloat(document.getElementById('input-knee-topflange')?.value) || 0;
                    const bf  = parseFloat(document.getElementById('input-knee-botflange')?.value) || 0;
                    const ch  = 0;
                    const blMode = kp.cornerMode;
                    const blCh  = parseFloat(document.getElementById('input-knee-bl-chamfer')?.value) || 0;
                    const blFil = parseFloat(document.getElementById('input-knee-bl-fillet')?.value) || 0;
                    const blC   = Math.min(blCh, H_mm / 2, W_mm / 2);
                    const brMode = kp.brCornerMode || 'none';
                    const brCh  = parseFloat(document.getElementById('input-knee-br-chamfer')?.value) || 0;
                    const brFil = parseFloat(document.getElementById('input-knee-br-fillet')?.value) || 0;
                    const brC   = Math.min(brCh, W_mm / 2, H_mm / 2);
                    const tlMode = kp.tlCornerMode || 'none';
                    const tlCh  = parseFloat(document.getElementById('input-knee-tl-chamfer')?.value) || 0;
                    const tlFil = parseFloat(document.getElementById('input-knee-tl-fillet')?.value) || 0;
                    const tlC   = Math.min(tlCh, H_mm / 2, W_mm / 2);

                    // Масштаб: вписать W_mm × H_mm в canvas (уступы внутри)
                    const pad = 28;
                    const scale = (Math.min(W, H) - pad * 2) / Math.max(W_mm, H_mm);
                    const ox = (W - W_mm * scale) / 2;
                    const oy = (H - H_mm * scale) / 2;

                    const s = scale;
                    const toX = x => ox + x * s;
                    const toY = y => oy + y * s;

                    // Ключевые точки (мм, Y вниз как в canvas):
                    // TL=(0,0), BL=(0,H_mm), BR=(W_mm,H_mm)
                    // TFp=(tf,0)           — конец верхнего уступа (вправо от TL)
                    // BFp=(W_mm, H_mm-bf)  — конец нижнего уступа (вверх от BR)
                    const TL  = { x: 0,    y: 0 };
                    const BL  = { x: 0,    y: H_mm };
                    const BR  = { x: W_mm, y: H_mm };
                    const TFp = { x: tf,   y: 0 };
                    const BFp = { x: W_mm, y: H_mm - bf };
                    const chamMm = (ch > 0 && tf > 0 && bf > 0) ? Math.min(ch, tf, bf) : 0;

                    ctx2.save();
                    ctx2.lineCap = 'round'; ctx2.lineJoin = 'round'; ctx2.lineWidth = 2;

                    // Верхний уступ (голубой): TL → TFp
                    ctx2.beginPath(); ctx2.strokeStyle = '#7dd3fc';
                    const topStartX = (tlMode === 'chamfer' && tlC > 0) ? tlC
                                    : (tlMode === 'fillet'  && tlFil > 0) ? tlFil : 0;
                    ctx2.moveTo(toX(topStartX), toY(TL.y));
                    ctx2.lineTo(toX(TFp.x - chamMm), toY(TFp.y));
                    ctx2.stroke();

                    // Левая сторона (красная): TL → BL, обрезана снизу
                    ctx2.beginPath(); ctx2.strokeStyle = '#f87171';
                    const leftStartY = (tlMode === 'chamfer' && tlC > 0) ? tlC
                                     : (tlMode === 'fillet'  && tlFil > 0) ? tlFil : 0;
                    const leftBotY = (blMode === 'chamfer' && blC > 0) ? H_mm - blC
                                   : (blMode === 'fillet'  && blFil > 0) ? H_mm - blFil : H_mm;
                    ctx2.moveTo(toX(TL.x), toY(leftStartY));
                    ctx2.lineTo(toX(BL.x), toY(leftBotY));
                    ctx2.stroke();

                    // BL угол
                    if (blMode === 'chamfer' && blC > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#94a3b8';
                        ctx2.moveTo(toX(BL.x), toY(H_mm - blC));
                        ctx2.lineTo(toX(blC), toY(H_mm));
                        ctx2.stroke();
                    } else if (blMode === 'fillet' && blFil > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#f472b6'; ctx2.setLineDash([4, 4]);
                        ctx2.arc(toX(BL.x), toY(BL.y), blFil * s, -Math.PI/2, 0, false);
                        ctx2.stroke(); ctx2.setLineDash([]);
                    }

                    // Нижняя (жёлтая): BL → BR, обрезана с обеих сторон
                    ctx2.beginPath(); ctx2.strokeStyle = '#fde047';
                    const botStartX = (blMode === 'chamfer' && blC > 0) ? blC
                                    : (blMode === 'fillet'  && blFil > 0) ? blFil : 0;
                    const botEndX   = (brMode === 'chamfer' && brC > 0) ? W_mm - brC
                                    : (brMode === 'fillet'  && brFil > 0) ? W_mm - brFil : W_mm;
                    ctx2.moveTo(toX(botStartX), toY(H_mm));
                    ctx2.lineTo(toX(botEndX), toY(H_mm));
                    ctx2.stroke();

                    // BR угол
                    if (brMode === 'chamfer' && brC > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#94a3b8';
                        ctx2.moveTo(toX(W_mm - brC), toY(H_mm));
                        ctx2.lineTo(toX(W_mm), toY(H_mm - brC));
                        ctx2.stroke();
                    } else if (brMode === 'fillet' && brFil > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#f472b6'; ctx2.setLineDash([4, 4]);
                        ctx2.arc(toX(BR.x), toY(BR.y), brFil * s, Math.PI, -Math.PI / 2, false);
                        ctx2.stroke(); ctx2.setLineDash([]);
                    }

                    // Правая сторона-уступ (тёмно-синий): BR → BFp (вверх), обрезана снизу
                    ctx2.beginPath(); ctx2.strokeStyle = '#3b82f6';
                    const rightStartY = (brMode === 'chamfer' && brC > 0) ? H_mm - brC
                                      : (brMode === 'fillet'  && brFil > 0) ? H_mm - brFil : H_mm;
                    ctx2.moveTo(toX(W_mm), toY(rightStartY));
                    ctx2.lineTo(toX(BFp.x), toY(BFp.y));
                    ctx2.stroke();

                    // Гипотенуза + фаска у TFp (фиолетовый)
                    ctx2.beginPath(); ctx2.strokeStyle = '#a78bfa';
                    ctx2.moveTo(toX(BFp.x), toY(BFp.y));
                    ctx2.lineTo(toX(TFp.x), toY(TFp.y + chamMm));
                    ctx2.stroke();
                    if (chamMm > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#a78bfa';
                        ctx2.moveTo(toX(TFp.x), toY(TFp.y + chamMm));
                        ctx2.lineTo(toX(TFp.x - chamMm), toY(TFp.y));
                        ctx2.stroke();
                    }

                    // TL угол
                    if (tlMode === 'chamfer' && tlC > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#94a3b8';
                        ctx2.moveTo(toX(TL.x), toY(tlC));
                        ctx2.lineTo(toX(tlC), toY(TL.y));
                        ctx2.stroke();
                    } else if (tlMode === 'fillet' && tlFil > 0) {
                        ctx2.beginPath(); ctx2.strokeStyle = '#f472b6'; ctx2.setLineDash([4, 4]);
                        ctx2.arc(toX(TL.x), toY(TL.y), tlFil * s, Math.PI/2, 0, true);
                        ctx2.stroke(); ctx2.setLineDash([]);
                    }

                    ctx2.restore();

                    // Подписи
                    ctx2.fillStyle = '#94a3b8'; ctx2.font = '10px monospace'; ctx2.textAlign = 'center';
                    ctx2.fillText(`${H_mm}`, toX(0) - 12, toY(H_mm / 2));
                    ctx2.fillText(`${W_mm}`, toX(W_mm / 2), toY(H_mm) + 14);
                };

                // Переключатель угла BL кницы
                const setKneeCornerMode = (mode) => {
                    this.cadState.kneeParams.cornerMode = mode;
                    document.querySelectorAll('.knee-corner-mode').forEach(b => {
                        b.classList.remove('bg-blue-700', 'text-white'); b.classList.add('text-slate-400');
                    });
                    const btnMap = { 'none': 'btn-knee-corner-none', 'chamfer': 'btn-knee-corner-chamfer', 'fillet': 'btn-knee-corner-fillet' };
                    document.getElementById(btnMap[mode]).classList.add('bg-blue-700', 'text-white');
                    document.getElementById(btnMap[mode]).classList.remove('text-slate-400');

                    document.getElementById('param-knee-chamfer').classList.toggle('hidden', mode !== 'chamfer');
                    document.getElementById('param-knee-fillet').classList.toggle('hidden', mode !== 'fillet');
                    drawKneePreview();
                };
                document.getElementById('btn-knee-corner-none').onclick    = () => setKneeCornerMode('none');
                document.getElementById('btn-knee-corner-chamfer').onclick = () => setKneeCornerMode('chamfer');
                document.getElementById('btn-knee-corner-fillet').onclick  = () => setKneeCornerMode('fillet');

                // Переключатель BR угла кницы
                const setKneeBRCornerMode = (mode) => {
                    this.cadState.kneeParams.brCornerMode = mode;
                    document.querySelectorAll('.knee-br-corner-mode').forEach(b => {
                        b.classList.remove('bg-blue-700', 'text-white'); b.classList.add('text-slate-400');
                    });
                    const brBtnMap = { 'none': 'btn-knee-br-none', 'chamfer': 'btn-knee-br-chamfer', 'fillet': 'btn-knee-br-fillet' };
                    document.getElementById(brBtnMap[mode]).classList.add('bg-blue-700', 'text-white');
                    document.getElementById(brBtnMap[mode]).classList.remove('text-slate-400');
                    document.getElementById('param-knee-br-chamfer').classList.toggle('hidden', mode !== 'chamfer');
                    document.getElementById('param-knee-br-fillet').classList.toggle('hidden', mode !== 'fillet');
                    drawKneePreview();
                };
                document.getElementById('btn-knee-br-none').onclick    = () => setKneeBRCornerMode('none');
                document.getElementById('btn-knee-br-chamfer').onclick = () => setKneeBRCornerMode('chamfer');
                document.getElementById('btn-knee-br-fillet').onclick  = () => setKneeBRCornerMode('fillet');

                // Переключатель TL угла кницы
                const setKneeTLCornerMode = (mode) => {
                    this.cadState.kneeParams.tlCornerMode = mode;
                    document.querySelectorAll('.knee-tl-corner-mode').forEach(b => {
                        b.classList.remove('bg-blue-700', 'text-white'); b.classList.add('text-slate-400');
                    });
                    const tlBtnMap = { 'none': 'btn-knee-tl-none', 'chamfer': 'btn-knee-tl-chamfer', 'fillet': 'btn-knee-tl-fillet' };
                    document.getElementById(tlBtnMap[mode]).classList.add('bg-blue-700', 'text-white');
                    document.getElementById(tlBtnMap[mode]).classList.remove('text-slate-400');
                    document.getElementById('param-knee-tl-chamfer').classList.toggle('hidden', mode !== 'chamfer');
                    document.getElementById('param-knee-tl-fillet').classList.toggle('hidden', mode !== 'fillet');
                    drawKneePreview();
                };
                document.getElementById('btn-knee-tl-none').onclick    = () => setKneeTLCornerMode('none');
                document.getElementById('btn-knee-tl-chamfer').onclick = () => setKneeTLCornerMode('chamfer');
                document.getElementById('btn-knee-tl-fillet').onclick  = () => setKneeTLCornerMode('fillet');

                // Открыть модалку кницы из каталога
                document.getElementById('cad-typical-knee').onclick = () => {
                    document.getElementById('modal-typical-catalog').classList.add('hidden');
                    const kp = this.cadState.kneeParams;
                    document.getElementById('input-knee-height').value    = kp.height;
                    document.getElementById('input-knee-width').value     = kp.width;
                    document.getElementById('input-knee-topflange').value = kp.topFlange;
                    document.getElementById('input-knee-botflange').value = kp.botFlange;

                    document.getElementById('input-knee-bl-chamfer').value = kp.blChamfer;
                    document.getElementById('input-knee-bl-fillet').value  = kp.blFillet;
                    document.getElementById('input-knee-br-chamfer').value = kp.brChamfer || 20;
                    document.getElementById('input-knee-br-fillet').value  = kp.brFillet || 20;
                    document.getElementById('input-knee-tl-chamfer').value = kp.tlChamfer || 20;
                    document.getElementById('input-knee-tl-fillet').value  = kp.tlFillet || 20;
                    setKneeCornerMode(kp.cornerMode);
                    setKneeBRCornerMode(kp.brCornerMode || 'none');
                    setKneeTLCornerMode(kp.tlCornerMode || 'none');
                    document.getElementById('modal-typical-knee').classList.remove('hidden');
                    drawKneePreview();
                };

                // Живой preview
                ['input-knee-height','input-knee-width','input-knee-topflange','input-knee-botflange','input-knee-bl-chamfer','input-knee-bl-fillet','input-knee-br-chamfer','input-knee-br-fillet','input-knee-tl-chamfer','input-knee-tl-fillet'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', drawKneePreview);
                });

                document.getElementById('btn-knee-cancel').onclick = () => document.getElementById('modal-typical-knee').classList.add('hidden');
                document.getElementById('btn-knee-back').onclick = () => {
                    document.getElementById('modal-typical-knee').classList.add('hidden');
                    document.getElementById('modal-typical-catalog').classList.remove('hidden');
                };

                document.getElementById('btn-knee-ok').onclick = () => {
                    const H_mm = parseFloat(document.getElementById('input-knee-height').value) || 200;
                    const W_mm = parseFloat(document.getElementById('input-knee-width').value) || 200;
                    const tf   = parseFloat(document.getElementById('input-knee-topflange').value) || 0;
                    const bf   = parseFloat(document.getElementById('input-knee-botflange').value) || 0;
                    const blCh  = parseFloat(document.getElementById('input-knee-bl-chamfer').value) || 0;
                    const blFil = parseFloat(document.getElementById('input-knee-bl-fillet').value) || 0;
                    const brCh  = parseFloat(document.getElementById('input-knee-br-chamfer').value) || 0;
                    const brFil = parseFloat(document.getElementById('input-knee-br-fillet').value) || 0;
                    const tlCh  = parseFloat(document.getElementById('input-knee-tl-chamfer').value) || 0;
                    const tlFil = parseFloat(document.getElementById('input-knee-tl-fillet').value) || 0;
                    this.cadState.kneeParams = { height: H_mm, width: W_mm, topFlange: tf, botFlange: bf,
                        chamfer: 0, cornerMode: this.cadState.kneeParams.cornerMode, blChamfer: blCh, blFillet: blFil,
                        brCornerMode: this.cadState.kneeParams.brCornerMode || 'none', brChamfer: brCh, brFillet: brFil,
                        tlCornerMode: this.cadState.kneeParams.tlCornerMode || 'none', tlChamfer: tlCh, tlFillet: tlFil };
                    this.cadState.tool = 'knee-place';
                    this.cadState.points = []; this.cadState.isDrawing = true; this.cadState.selectedShapeIndex = -1;
                    document.getElementById('modal-typical-knee').classList.add('hidden');
                    document.getElementById('cad-status-text').innerHTML = `РАЗМЕСТИТЬ КНИЦУ ${H_mm}×${W_mm}мм — кликните на чертеже`;
                    this.draw();
                };

                ['input-knee-height','input-knee-width','input-knee-topflange','input-knee-botflange','input-knee-bl-chamfer','input-knee-bl-fillet','input-knee-br-chamfer','input-knee-br-fillet','input-knee-tl-chamfer','input-knee-tl-fillet'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('keydown', e => {
                        if (e.key === 'Enter') document.getElementById('btn-knee-ok').click();
                        if (e.key === 'Escape') document.getElementById('btn-knee-cancel').click();
                    });
                });
                // ============================================================

                document.getElementById('cad-toggle-ortho').onclick = (e) => { this.cadState.ortho = !this.cadState.ortho; e.currentTarget.classList.toggle('bg-blue-900', this.cadState.ortho); e.currentTarget.classList.toggle('text-white', this.cadState.ortho); };
                document.getElementById('cad-toggle-draft').onclick = (e) => { this.cadState.construction = !this.cadState.construction; e.currentTarget.classList.toggle('bg-blue-900', this.cadState.construction); e.currentTarget.classList.toggle('text-white', this.cadState.construction); };

                document.getElementById('cad-action-clear').onclick = () => { this.cadState.shapes = []; this.cadState.points = []; this.cadState.isDrawing = false; this.draw(); };
                
                // SAVE BUTTON LOGIC (Silent)
                document.getElementById('cad-action-save').onclick = () => {
                    if(this.currentProjectIdx > -1) {
                        let widthVal = null; let lengthVal = null;
                        this.cadState.shapes.forEach(s => {
                            if (s.type === 'dimension') {
                                if (s.subType === 'width') widthVal = Math.abs(s.p1.y - s.p2.y).toFixed(0);
                                if (s.subType === 'length') lengthVal = Math.abs(s.p1.x - s.p2.x).toFixed(0);
                            }
                        });
                        const partRef = this.projects[this.currentProjectIdx].parts[this.currentPartIdx];
                        partRef.cadData = JSON.parse(JSON.stringify(this.cadState.shapes));
                        if (widthVal && lengthVal) partRef.dimensions = { width: widthVal, length: lengthVal };
                        else partRef.dimensions = null;
                        this.switchScreen('screen-parts');
                    }
                };
                document.getElementById('cad-action-back').onclick = () => this.switchScreen('screen-parts');
                document.getElementById('cad-action-import').onclick = () => document.getElementById('dxfLoader').click();
                document.getElementById('dxfLoader').addEventListener('change', (e) => this.handleDXF(e));

 // Проверяем наличие кнопки и вешаем событие здесь, так как это инициализация
                const globalOrderBtn = document.getElementById('btn-global-create-order');
                if (globalOrderBtn) {
                    globalOrderBtn.onclick = () => {
                        // Открываем модальное окно со всеми задачами
                        this.openOrderModal(SERVER_DATABASE.sentTasks);
                    };
                }

                // --- SUPERVISOR APPS (MAP) ---
                const btnAppMap = document.getElementById('btn-app-map');
                if (btnAppMap) {
                    btnAppMap.onclick = () => {
                        this.switchScreen('screen-map');
                        window.isMapOpen = true; 
                    };
                }
                const btnCloseMap = document.getElementById('btn-close-map');
                if (btnCloseMap) {
                    btnCloseMap.onclick = () => {
                        window.isMapOpen = false;
                        this.switchScreen('screen-supervisor');
                    };
                }

                // --- PROJECT UI EVENTS ---
                // Open "Create"
                document.getElementById('btn-add-project').onclick = () => {
                    this.editState.isEditingProject = false;
                    document.getElementById('input-project-name').value = '';
                    document.getElementById('modal-new-project').classList.remove('hidden');
                };
                
                // Confirm Project (Create or Edit)
                document.getElementById('btn-confirm-project').onclick = () => {
                    const name = document.getElementById('input-project-name').value;
                    if(name) {
                        if (this.editState.isEditingProject) {
                            // Edit existing
                            this.projects[this.editState.projectIdx].name = name;
                        } else {
                            // Create new
                            this.projects.push({ name: name, parts: [] });
                        }
                        this.renderProjects();
                        document.getElementById('modal-new-project').classList.add('hidden');
                        document.getElementById('input-project-name').value = '';
                    }
                };

                // Submit Project on Enter
                document.getElementById('input-project-name').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') document.getElementById('btn-confirm-project').click();
                });

                document.getElementById('btn-back-to-projects').onclick = () => this.switchScreen('screen-projects');
                
                // --- PART UI EVENTS ---
                // Open "Create"
                document.getElementById('btn-add-part').onclick = () => {
                    this.editState.isEditingPart = false;
                    document.getElementById('input-part-name').value = '';
                    document.getElementById('input-part-qty').value = '';
                    document.getElementById('input-part-thick').value = '';
                    document.getElementById('input-part-tech-comment').value = ''; // Clear comment
                    document.getElementById('modal-new-part').classList.remove('hidden');
                };
                
                // Confirm Part (Create or Edit)
                document.getElementById('btn-confirm-part').onclick = () => {
                    const name = document.getElementById('input-part-name').value;
                    const qty = document.getElementById('input-part-qty').value;
                    const th = document.getElementById('input-part-thick').value;
                    const comm = document.getElementById('input-part-tech-comment').value; // Get comment

                    const matVal = document.getElementById('input-part-material').value;
                    const density = parseFloat(document.getElementById('input-part-density').value) || 7850;
                    let matName = "Свой материал";
                    if (matVal !== 'custom') {
                        matName = document.getElementById('input-part-material').options[document.getElementById('input-part-material').selectedIndex].text.split(' (')[0];
                    }

                    if(name && this.currentProjectIdx > -1) {
                        if (this.editState.isEditingPart) {
                            // Edit existing
                            const p = this.projects[this.currentProjectIdx].parts[this.editState.partIdx];
                            p.name = name; p.qty = qty; p.thick = th; p.techComment = comm;
                            p.materialName = matName; p.density = density;
                        } else {
                            // Create new
                            this.projects[this.currentProjectIdx].parts.push({ 
                                name, qty, thick: th, cadData: [], techComment: comm, materialName: matName, density: density
                            });
                        }
                        this.renderParts();
                        document.getElementById('modal-new-part').classList.add('hidden');
                        document.getElementById('input-part-name').value = '';
                    }
                };

                // Submit Part on Enter (for text and number inputs)
                ['input-part-name', 'input-part-qty', 'input-part-thick'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') document.getElementById('btn-confirm-part').click();
                        });
                    }
                });

                // Ограничение: только целые положительные числа (от 1)
                ['input-part-qty', 'input-part-thick'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('input', function() { this.value = this.value.replace(/\D/g, ''); });
                        el.addEventListener('blur', function() { if (this.value === '' || parseInt(this.value) <= 0) this.value = '1'; });
                    }
                });
            },

            updateToolbarUI: function() {
                document.querySelectorAll('.cad-tool').forEach(b => {
                    b.classList.remove('bg-blue-600', 'text-white'); b.classList.add('text-gray-400');
                });
                const activeBtn = document.getElementById(`cad-tool-${this.cadState.tool}`);
                if(activeBtn) { activeBtn.classList.add('bg-blue-600', 'text-white'); activeBtn.classList.remove('text-gray-400'); }
                document.getElementById('cad-status-text').innerText = `ИНСТРУМЕНТ: ${this.cadState.tool.toUpperCase()}`;
            },

             // --- RENDER LISTS WITH BUTTONS  ---

            renderProjects: function() {
                const c = document.getElementById('project-list-container');
                c.innerHTML = '';
                this.projects.forEach((p, idx) => {
                    const div = document.createElement('div');
                                      // Clean Factory Styles
                    const bgClass = "bg-[#C8CED8] border-white hover:border-[#3355CC]";
                    const textMain = "text-[#1a1a1a]";
                    const textSub = "text-[#666666]";
                    
                    div.className = `${bgClass} p-3 rounded-lg border shadow-sm hover:shadow-md transition-all flex justify-between items-center mb-2 group`;
                    
                    div.innerHTML = `
                        <div class="flex-1 cursor-pointer" id="proj-row-${idx}">
                            <span class="text-sm ${textMain} font-bold block">${p.name}</span>
                            <span class="text-[10px] ${textSub}">${p.parts.length} деталей</span>
                        </div>
                        <div class="flex gap-2">
                            <button id="btn-send-proj-${idx}" class="bg-[#10b981] hover:bg-[#059669] text-white text-[10px] px-2 py-1 rounded border border-[#047857] shadow-sm font-bold transition-all active:scale-95" title="Отправить снабженцу">
                                ➤ ОТПРАВИТЬ
                            </button>
                            <button id="btn-edit-proj-${idx}" class="bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#3355CC] text-[10px] px-2 py-1 rounded border border-[#A8AEB8] font-bold opacity-70 hover:opacity-100">
                                Изм
                            </button>
                            <button id="btn-del-proj-${idx}" class="bg-[#E03030]/10 hover:bg-[#E03030]/20 text-[#E03030] hover:text-[#1a1a1a] text-[10px] px-2 py-1 rounded border border-[#E03030]/30 font-bold opacity-70 hover:opacity-100">
                                Х
                            </button>
                        </div>
                    `;
                    c.appendChild(div);

                    // --- HANDLERS ---
                    
                    // 1. Send to Supply Manager
                    document.getElementById(`btn-send-proj-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        // Prepare Data
                        const timestamp = new Date().toLocaleString('ru-RU');
                        const processedParts = p.parts.map(part => {
                            // Generate Thumbnail
                            const thumb = generatePartThumbnail(part.cadData);
                            // Ensure dims
                            let w = "—"; let l = "—";
                            if(part.dimensions) { w = part.dimensions.width; l = part.dimensions.length; }
                            
                            return {
                                ...part,
                                thumbnail: thumb,
                                finalDims: { w, l }
                            };
                        });

                        // Push to Server
                        SERVER_DATABASE.sentTasks.push({
                            id: Math.floor(Math.random() * 10000),
                            projectName: p.name,
                            sender: "Технолог",
                            date: timestamp,
                            parts: processedParts
                        });

                        // Visual Feedback
                        const btn = e.target;
                        btn.innerText = "✔ ОТПРАВЛЕНО";
                        btn.classList.remove("bg-green-700", "hover:bg-green-600");
                        btn.classList.add("bg-gray-700", "border-gray-600", "cursor-default", "text-gray-400");
                        btn.disabled = true;
                    };

                    // 2. Open Project
                    document.getElementById(`proj-row-${idx}`).onclick = () => {
                        this.currentProjectIdx = idx;
                        const titleEl = document.getElementById('current-project-title');
                        if (titleEl) titleEl.innerText = p.name;
                        this.switchScreen('screen-parts');
                    };

                    // 3. Edit Project
                    document.getElementById(`btn-edit-proj-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        this.editState.isEditingProject = true;
                        this.editState.projectIdx = idx;
                        document.getElementById('input-project-name').value = p.name;
                        document.getElementById('modal-new-project').classList.remove('hidden');
                    };

                    // 4. Delete Project
                    document.getElementById(`btn-del-proj-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        this.projects.splice(idx, 1);
                        this.renderProjects();
                    };
                });
            },

            renderParts: function() {
                const c = document.getElementById('part-list-container');
                c.innerHTML = '';
                const parts = this.projects[this.currentProjectIdx].parts;
                
                parts.forEach((p, idx) => {
                    const div = document.createElement('div');
                    // Clean Factory Styles
                    const bgClass = "bg-[#C8CED8] border-white hover:border-[#3355CC]";
                    const textMain = "text-[#1a1a1a]";
                    const badgeClass = "bg-[#E8ECF1] text-[#1a1a1a] border-[#A8AEB8]";
                    const textSub = "text-[#666666]";

                    div.className = `${bgClass} p-2 rounded border shadow-sm flex justify-between items-center mb-2`;
                    let dimString = "";
                    if (p.dimensions && p.dimensions.width && p.dimensions.length) {
                        dimString = ` * ${p.dimensions.width}x${p.dimensions.length}`;
                    } else {
                        dimString = ` <span class="text-[#E03030] font-bold ml-1 animate-pulse">! НЕТ РАЗМЕРОВ !</span>`;
                    }

                    div.innerHTML = `
                        <div class="flex-1 cursor-pointer mr-2" id="part-row-${idx}">
                            <div class="flex justify-between items-center">
                                <span class="text-sm ${textMain} font-bold">${p.name}</span>
                                <span class="text-[10px] ${badgeClass} px-1.5 py-0.5 rounded border">${p.qty} шт</span>
                            </div>
                            <div class="text-[10px] ${textSub} mt-1">
                                Толщина: ${p.thick}мм${dimString}
                                <span class="float-right font-medium opacity-50">${p.cadData.length > 0 ? 'CAD ОК' : 'Пусто'}</span>
                            </div>
                        </div>
                        <div class="flex flex-col gap-1">
                            <button id="btn-edit-part-${idx}" class="bg-[#FFFFFF] hover:bg-[#E8ECF1] text-[#3355CC] text-[10px] px-2 py-1 rounded border border-[#A8AEB8] w-8 flex justify-center font-bold">✎</button>
                            <button id="btn-del-part-${idx}" class="bg-[#FFFFFF] hover:bg-[#E03030] text-[#E03030] hover:text-[#FFFFFF] text-[10px] px-2 py-1 rounded border border-[#A8AEB8] w-8 flex justify-center font-bold">🗑</button>
                        </div>
                    `;
                    c.appendChild(div);

                    // Handlers (Standard)
                    document.getElementById(`part-row-${idx}`).onclick = () => {
                        this.currentPartIdx = idx;
                        this.switchScreen('screen-cad');
                    };
                    document.getElementById(`btn-edit-part-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        this.editState.isEditingPart = true;
                        this.editState.partIdx = idx;
                        document.getElementById('input-part-name').value = p.name;
                        document.getElementById('input-part-qty').value = p.qty;
                        document.getElementById('input-part-thick').value = p.thick;
                        document.getElementById('modal-new-part').classList.remove('hidden');
                    };
                    document.getElementById(`btn-del-part-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        parts.splice(idx, 1);
                        this.renderParts();
                    };
                });
            },
            
            // --- SUPPLY MANAGER FUNCTIONS ---
            
           renderSupplyTasks: function() {
                const c = document.getElementById('supply-tasks-container');
                c.innerHTML = '';
                const tasks = SERVER_DATABASE.sentTasks.slice().reverse(); 

                if(tasks.length === 0) {
                    c.innerHTML = `<div class="text-center opacity-50 mt-10 italic">Нет новых заданий</div>`;
                    return;
                }
                const bgClass = "bg-[#C8CED8] border-white hover:border-[#3355CC]";
                const textMain = "text-[#1a1a1a]";

                tasks.forEach(task => {
                    const div = document.createElement('div');
                    // Убрали relative и group, так как внутри больше нет кнопок
                    div.className = `${bgClass} p-4 rounded-lg border shadow-sm cursor-pointer mb-2 transition-all active:scale-[0.99]`;
                    
                    // КНОПКИ ВНУТРИ БОЛЬШЕ НЕТ
                    div.innerHTML = `
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-bold text-sm ${textMain}">${task.projectName}</span>
                            <span class="text-[10px] opacity-60 bg-gray-500/10 px-2 rounded">ID: ${task.id}</span>
                        </div>
                        <div class="flex justify-between text-[11px] opacity-70">
                            <span>От: ${task.sender}</span>
                            <span>${task.date}</span>
                        </div>
                        <div class="mt-2 flex justify-between items-center">
                             <span class="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold">${task.parts.length} дет.</span>
                             <span class="text-[10px] text-green-400">Нажми для деталей ➤</span>
                        </div>
                    `;
                    div.onclick = () => { this.renderSupplyDetails(task); };
                    c.appendChild(div);
                });
            },

            // НОВАЯ ФУНКЦИЯ openOrderModal (Адаптирована под список)
            openOrderModal: function(tasks) {
                const modal = document.getElementById('modal-supply-order');
                const select = document.getElementById('input-order-select');
                
                select.innerHTML = '';
                if(!tasks || tasks.length === 0) {
                    select.innerHTML = '<option>Нет доступных заказов</option>';
                } else {
                    tasks.forEach(t => {
                        select.innerHTML += `<option value="${t.id}">${t.projectName} (от ${t.sender})</option>`;
                    });
                }
                
                modal.classList.remove('hidden');
                
                const confirmBtn = document.getElementById('btn-confirm-delivery');
                
                // Оптимизация (Пункт 3): Уходим от костылей с cloneNode(true). 
                // Присваивание свойства .onclick автоматически перезаписывает старый обработчик.
                confirmBtn.onclick = () => {
                    const selectedId = parseInt(select.value);
                    const task = tasks.find(t => t.id === selectedId);
                    if(task) {
                        loadPartsIntoTruck(task);
                        
                        const originalHtml = confirmBtn.innerHTML;
                        const originalClass = confirmBtn.className;
                        
                        confirmBtn.innerHTML = '✓ ОФОРМЛЕНО';
                        confirmBtn.className = 'bg-green-600 text-white text-sm font-bold px-6 py-2 rounded shadow-lg cursor-default';
                        confirmBtn.disabled = true;
                        
                        setTimeout(() => {
                            modal.classList.add('hidden');
                            
                            confirmBtn.innerHTML = originalHtml;
                            confirmBtn.className = originalClass;
                            confirmBtn.disabled = false;

                            let toast = document.getElementById('supply-toast');
                            if (!toast) {
                                toast = document.createElement('div');
                                toast.id = 'supply-toast';
                                toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;font-weight:700;padding:12px 28px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:99999;font-size:14px;transition:opacity 0.5s;';
                                toast.innerHTML = '✓ Заказ успешно оформлен';
                                document.body.appendChild(toast);
                            }
                            toast.style.opacity = '1';
                            setTimeout(() => { toast.style.opacity = '0'; }, 3000);
                        }, 1200);
                    }
                };
            },

            renderSupplyDetails: function(task) {
                this.supplyState.activeTask = task; // <--- Save Active Task
                // Switch Screens
                document.getElementById('screen-supply-tasks').classList.add('hidden');
                document.getElementById('screen-supply-details').classList.remove('hidden');
                
                document.getElementById('supply-detail-title').innerText = `Задание: ${task.projectName}`;
                
                // Back Button Handler
                document.getElementById('btn-supply-back').onclick = () => {
                    document.getElementById('screen-supply-details').classList.add('hidden');
                    document.getElementById('screen-supply-tasks').classList.remove('hidden');
                };

                const c = document.getElementById('supply-parts-container');
                c.innerHTML = '';

                // Styles
                const rowClass = this.isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";
                const textMain = this.isDarkMode ? "text-gray-200" : "text-gray-800";

                task.parts.forEach((p, idx) => {
                    const div = document.createElement('div');
                    div.className = `${rowClass} p-2 rounded border mb-2 flex flex-col`;
                    
                    const thumbSrc = p.thumbnail ? p.thumbnail : ''; // Empty if null
                    const hasThumb = !!p.thumbnail;

                    // Image HTML
                    let imgHTML = `<div class="w-full h-full bg-slate-900 flex items-center justify-center text-[8px] text-gray-500">NO CAD</div>`;
                    if(hasThumb) {
                        imgHTML = `<img src="${thumbSrc}" class="w-full h-full object-contain bg-[#1e1e1e]" />`;
                    }

                    div.innerHTML = `
                        <div class="grid grid-cols-12 gap-2 items-center">
                            <!-- Image Column -->
                            <div class="col-span-2 aspect-square relative group rounded overflow-hidden border border-gray-500/30">
                                ${imgHTML}
                                ${hasThumb ? `
                                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer" id="zoom-img-${task.id}-${idx}">
                                    <span class="text-white text-xs font-bold">🔍</span>
                                </div>` : ''}
                            </div>
                            
                            <!-- Data Columns -->
                            <div class="col-span-4 text-xs font-bold ${textMain}">${p.name}</div>
                            <div class="col-span-2 text-[10px] opacity-70">${p.finalDims.w} x ${p.finalDims.l}</div>
                            <div class="col-span-2 text-[10px] opacity-70">${p.thick} мм</div>
                            <div class="col-span-2 text-right">
                                <span class="bg-gray-500/20 px-2 py-1 rounded font-bold text-xs">${p.qty}</span>
                            </div>
                        </div>
                    `;
                    c.appendChild(div);

                    if(hasThumb) {
                        document.getElementById(`zoom-img-${task.id}-${idx}`).onclick = () => {
                            const modal = document.getElementById('modal-full-image');
                            const img = document.getElementById('full-image-target');
                            img.src = thumbSrc;
                            modal.classList.remove('hidden');
                            modal.classList.add('flex'); // Ensure flex display
                        };
                    }
                });
            },
            // --- LOGIC ---
            getMouseWorld: function(e) {
                const rect = this.canvas.getBoundingClientRect();
                const rawX = e.clientX - rect.left;
                const rawY = e.clientY - rect.top;
                // Formula: World = (Screen - Pan) / Zoom
                // Y-Axis: In CAD usually Y is Up. But Canvas Y is Down.
                // We stick to Canvas coord system for simplicity of drawing text, but scalable.
                return {
                    x: (rawX - this.cadState.view.x) / this.cadState.view.zoom,
                    y: (rawY - this.cadState.view.y) / this.cadState.view.zoom
                };
            },

            findSnapPoint: function(x, y) {
                let closest = null;
                // Snap distance in pixels (e.g. 10px) converted to world units
                let minDist = 10 / this.cadState.view.zoom; 
                
                const pointsToCheck = [];
                this.cadState.shapes.forEach(s => {
                    if(s.type === 'line') pointsToCheck.push(s.start, s.end);
                    if(s.type === 'circle' || s.type === 'arc') pointsToCheck.push(s.center);
                    // Add arc ends
                    if(s.type === 'arc') {
                        pointsToCheck.push({
                            x: s.center.x + Math.cos(s.startAngle)*s.radius,
                            y: s.center.y + Math.sin(s.startAngle)*s.radius
                        });
                        pointsToCheck.push({
                            x: s.center.x + Math.cos(s.endAngle)*s.radius,
                            y: s.center.y + Math.sin(s.endAngle)*s.radius
                        });
                    }
                });

                pointsToCheck.forEach(p => {
                    const d = this.math.getDistance({x,y}, p);
                    if(d < minDist) { minDist = d; closest = p; }
                });
                return closest;
            },

            getClosestShapeIndex: function(x, y) {
                let closestIdx = -1;
                let minDist = 10 / this.cadState.view.zoom; 

                this.cadState.shapes.forEach((s, i) => {
                    let dist = Infinity;
                    if (s.type === 'line') dist = this.math.distToSegment({x,y}, s.start, s.end);
                    else if (s.type === 'circle') dist = Math.abs(this.math.getDistance({x,y}, s.center) - s.radius);
                    else if (s.type === 'arc') {
                        // Simplified: distance to circle rim
                        dist = Math.abs(this.math.getDistance({x,y}, s.center) - s.radius);
                        // Accurate arc check would verify angles, but this is enough for selection usually
                    }
                    
                    if(dist < minDist) { minDist = dist; closestIdx = i; }
                });
                return closestIdx;
            },

            // --- EDIT MODE HELPERS ---
            getShapeHandles: function(shape) {
                if (!shape) return [];
                if (shape.type === 'line') return [shape.start, shape.end];
                if (shape.type === 'circle') return [shape.center, {x: shape.center.x + shape.radius, y: shape.center.y}];
                if (shape.type === 'arc') return [shape.center, {x: shape.center.x + Math.cos(shape.startAngle)*shape.radius, y: shape.center.y + Math.sin(shape.startAngle)*shape.radius}, {x: shape.center.x + Math.cos(shape.endAngle)*shape.radius, y: shape.center.y + Math.sin(shape.endAngle)*shape.radius}];
                if (shape.type === 'dimension') return [shape.p1, shape.p2, shape.pos];
                return [];
            },

            getDeleteBtnPos: function(shape) {
                if (!shape) return null;
                if (shape.type === 'line') return { x: (shape.start.x + shape.end.x)/2, y: (shape.start.y + shape.end.y)/2 - 15/this.cadState.view.zoom };
                if (shape.type === 'circle') return { x: shape.center.x, y: shape.center.y - shape.radius - 15/this.cadState.view.zoom };
                if (shape.type === 'arc') return { x: shape.center.x, y: shape.center.y - shape.radius - 15/this.cadState.view.zoom };
                if (shape.type === 'dimension') return { x: shape.pos.x, y: shape.pos.y - 15/this.cadState.view.zoom };
                return null;
            },

            updateShapeFromHandle: function(shape, handleIdx, newPos) {
                if (shape.type === 'line') {
                    if (handleIdx === 0) shape.start = newPos;
                    else shape.end = newPos;
                } else if (shape.type === 'circle') {
                    if (handleIdx === 0) shape.center = newPos;
                    else shape.radius = this.math.getDistance(shape.center, newPos);
                } else if (shape.type === 'arc') {
                    // Complex arc editing simplified: Move center or recalculate angles based on handle pos
                    if (handleIdx === 0) shape.center = newPos;
                    else if (handleIdx === 1) { // Start point
                         shape.radius = this.math.getDistance(shape.center, newPos);
                         shape.startAngle = Math.atan2(newPos.y - shape.center.y, newPos.x - shape.center.x);
                    } else if (handleIdx === 2) { // End point
                         shape.radius = this.math.getDistance(shape.center, newPos);
                         shape.endAngle = Math.atan2(newPos.y - shape.center.y, newPos.x - shape.center.x);
                    }
                } else if (shape.type === 'dimension') {
                    if (handleIdx === 0) shape.p1 = newPos;
                    else if (handleIdx === 1) shape.p2 = newPos;
                    else shape.pos = newPos;
                }
            },

            // --- EVENTS ---
            onMouseDown: function(e) {
                if(e.button === 2) { // Right Click Pan
                    this.cadState.view.isPanning = true;
                    this.cadState.view.lastPan = { x: e.clientX, y: e.clientY };
                    return;
                }
                
                const m = this.getMouseWorld(e);
                const st = this.cadState;
                const snap = this.findSnapPoint(m.x, m.y);
                const clickPt = snap || m;

                if (st.tool === 'edit') {
                    // 0. Check selection validity
                    const selectedShape = (st.selectedShapeIndex > -1) ? st.shapes[st.selectedShapeIndex] : null;

                    // 1. Check Delete Button Click
                    if (selectedShape) {
                        const delPos = this.getDeleteBtnPos(selectedShape);
                        const dist = this.math.getDistance(m, delPos);
                        // Hit radius for delete button (approx 10px screen size)
                        if (dist < 10 / st.view.zoom) {
                            st.shapes.splice(st.selectedShapeIndex, 1);
                            st.selectedShapeIndex = -1;
                            this.draw();
                            return;
                        }

                        // 2. Check Handle Click
                        const handles = this.getShapeHandles(selectedShape);
                        for(let i=0; i<handles.length; i++) {
                             if(this.math.getDistance(m, handles[i]) < 10/st.view.zoom) {
                                 st.dragHandleIndex = i;
                                 st.isDraggingHandle = true;
                                 return; // Start dragging
                             }
                        }
                    }

                    // 3. Select Shape
                    const idx = this.getClosestShapeIndex(m.x, m.y);
                    st.selectedShapeIndex = idx;
                    
                    // If clicked empty space, deselect
                    if (idx === -1) st.selectedShapeIndex = -1;

                } else {
                    // DRAWING TOOLS (Logic preserved)
                    if (!st.isDrawing) {
                        st.isDrawing = true;
                        st.points = [clickPt];
                    } else {
                        // Finish Step
                        if (st.tool === 'line') {
                            let end = clickPt;
                            if (st.ortho && !snap) {
                                const start = st.points[0];
                                if (Math.abs(end.x - start.x) > Math.abs(end.y - start.y)) end.y = start.y; else end.x = start.x;
                            }
                            st.shapes.push({ type: 'line', start: st.points[0], end: end, isConstruction: st.construction });
                            st.isDrawing = false;
                            st.points = [];
                        } else if (st.tool === 'circle') {
                            const r = this.math.getDistance(st.points[0], clickPt);
                            st.shapes.push({ type: 'circle', center: st.points[0], radius: r, isConstruction: st.construction });
                            st.isDrawing = false;
                            st.points = [];
                        } else if (st.tool === 'arc') {
                            if (st.points.length === 1) {
                                st.points.push(clickPt); 
                            } else if (st.points.length === 2) {
                                const params = this.math.getArcParams(st.points[0], st.points[1], clickPt);
                                if(params) st.shapes.push({ type: 'arc', ...params, isConstruction: st.construction });
                                st.isDrawing = false;
                                st.points = [];
                            }
                        } else if (st.tool === 'dim') {
                            if (st.points.length === 1) st.points.push(clickPt);
                            else if (st.points.length === 2) {
                                const p1 = st.points[0];
                                const p2 = st.points[1];
                                const pos = clickPt;
                                const currentType = st.dimState.nextType;
                                st.shapes = st.shapes.filter(s => !(s.type === 'dimension' && s.subType === currentType));
                                st.shapes.push({ type: 'dimension', subType: currentType, p1: p1, p2: p2, pos: pos });
                                st.dimState.nextType = (currentType === 'width') ? 'length' : 'width';
                                st.isDrawing = false; st.points = [];
                            }
                        } else if (st.tool === 'rect-place') {
                            // Разместить прямоугольник с центром в точке клика
                            const cx = clickPt.x, cy = clickPt.y;
                            const hl = (st.rectParams.length || 100) / 2;
                            const hw = (st.rectParams.width || 50) / 2;
                            const mode = st.rectParams.cornerMode;
                            const chamVal = st.rectParams.chamfer || 0;
                            const filVal = st.rectParams.fillet || 0;

                            const tl = { x: cx - hl, y: cy - hw };
                            const tr = { x: cx + hl, y: cy - hw };
                            const br = { x: cx + hl, y: cy + hw };
                            const bl = { x: cx - hl, y: cy + hw };

                            if (mode === 'chamfer' && chamVal > 0) {
                                const c = Math.min(chamVal, hl, hw);
                                // 4 стороны + 4 фаски = 8 линий
                                st.shapes.push({ type: 'line', start: { x: tl.x + c, y: tl.y }, end: { x: tr.x - c, y: tr.y }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: tr.x - c, y: tr.y }, end: { x: tr.x, y: tr.y + c }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: tr.x, y: tr.y + c }, end: { x: br.x, y: br.y - c }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: br.x, y: br.y - c }, end: { x: br.x - c, y: br.y }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: br.x - c, y: br.y }, end: { x: bl.x + c, y: bl.y }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: bl.x + c, y: bl.y }, end: { x: bl.x, y: bl.y - c }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: bl.x, y: bl.y - c }, end: { x: tl.x, y: tl.y + c }, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: tl.x, y: tl.y + c }, end: { x: tl.x + c, y: tl.y }, isConstruction: false });
                            } else if (mode === 'fillet' && filVal > 0) {
                                const r = Math.min(filVal, hl, hw);
                                // Линии сторон (4 шт)
                                st.shapes.push({ type: 'line', start: { x: tl.x + r, y: tl.y }, end: { x: tr.x - r, y: tr.y }, isConstruction: false });
                                // TR corner — центр в вершине tr, вогнутая дуга 90° CCW
                                st.shapes.push({ type: 'arc', center: { x: tr.x, y: tr.y }, radius: r, startAngle: Math.PI, endAngle: Math.PI/2, counterClockwise: true, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: tr.x, y: tr.y + r }, end: { x: br.x, y: br.y - r }, isConstruction: false });
                                // BR corner — центр в вершине br
                                st.shapes.push({ type: 'arc', center: { x: br.x, y: br.y }, radius: r, startAngle: -Math.PI/2, endAngle: Math.PI, counterClockwise: true, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: br.x - r, y: br.y }, end: { x: bl.x + r, y: bl.y }, isConstruction: false });
                                // BL corner — центр в вершине bl
                                st.shapes.push({ type: 'arc', center: { x: bl.x, y: bl.y }, radius: r, startAngle: 0, endAngle: -Math.PI/2, counterClockwise: true, isConstruction: false });
                                st.shapes.push({ type: 'line', start: { x: bl.x, y: bl.y - r }, end: { x: tl.x, y: tl.y + r }, isConstruction: false });
                                // TL corner — центр в вершине tl
                                st.shapes.push({ type: 'arc', center: { x: tl.x, y: tl.y }, radius: r, startAngle: Math.PI/2, endAngle: 0, counterClockwise: true, isConstruction: false });
                            } else {
                                st.shapes.push({ type: 'line', start: tl, end: tr, isConstruction: false });
                                st.shapes.push({ type: 'line', start: tr, end: br, isConstruction: false });
                                st.shapes.push({ type: 'line', start: br, end: bl, isConstruction: false });
                                st.shapes.push({ type: 'line', start: bl, end: tl, isConstruction: false });
                            }
                            st.tool = 'edit';
                            st.isDrawing = false;
                            this.updateToolbarUI();
                        } else if (st.tool === 'knee-place') {
                            // Разместить кницу (уступы внутрь) — BL угол в точке клика
                            const cx = clickPt.x, cy = clickPt.y;
                            const kp = st.kneeParams;
                            const H_mm = kp.height, W_mm = kp.width;
                            const tf = kp.topFlange, bf = kp.botFlange;
                            const ch = kp.chamfer;
                            const blMode = kp.cornerMode;
                            const blCh = Math.min(kp.blChamfer, H_mm / 2, W_mm / 2);
                            const blFil = kp.blFillet;
                            const brMode = kp.brCornerMode || 'none';
                            const brCh = Math.min(kp.brChamfer || 0, W_mm / 2, H_mm / 2);
                            const brFil = kp.brFillet || 0;
                            const tlMode = kp.tlCornerMode || 'none';
                            const tlCh = Math.min(kp.tlChamfer || 0, H_mm / 2, W_mm / 2);
                            const tlFil = kp.tlFillet || 0;

                            // Ключевые точки: BL = якорь (точка клика)
                            // TL=(cx, cy-H),   TFp=(cx+tf, cy-H) — конец верхнего уступа (вправо)
                            // BR=(cx+W, cy),   BFp=(cx+W, cy-bf) — конец нижнего уступа (вверх)
                            const TL  = { x: cx,        y: cy - H_mm };
                            const BL  = { x: cx,        y: cy };
                            const BR  = { x: cx + W_mm, y: cy };
                            const TFp = { x: cx + tf,   y: cy - H_mm };
                            const BFp = { x: cx + W_mm, y: cy - bf };
                            const chamMm = (ch > 0 && tf > 0 && bf > 0) ? Math.min(ch, tf, bf) : 0;

                            const push = (s) => st.shapes.push(s);

                            // Левая сторона (вниз), обрезана снизу и сверху
                            const leftStartY = (tlMode === 'chamfer' && tlCh > 0) ? cy - H_mm + tlCh
                                             : (tlMode === 'fillet'  && tlFil > 0) ? cy - H_mm + tlFil : cy - H_mm;
                            const leftBotY = (blMode === 'chamfer' && blCh > 0) ? cy - blCh
                                           : (blMode === 'fillet'  && blFil > 0) ? cy - blFil : cy;
                            push({ type: 'line', start: { x: cx, y: leftStartY }, end: { x: cx, y: leftBotY }, isConstruction: false });

                            // BL угол
                            if (blMode === 'chamfer' && blCh > 0) {
                                push({ type: 'line', start: { x: cx, y: cy - blCh }, end: { x: cx + blCh, y: cy }, isConstruction: false });
                            } else if (blMode === 'fillet' && blFil > 0) {
                                push({ type: 'arc', center: BL, radius: blFil, startAngle: -Math.PI/2, endAngle: 0, counterClockwise: false, isConstruction: false });
                            }

                            // Нижняя сторона (вправо), обрезана с обеих сторон
                            const botStartX = (blMode === 'chamfer' && blCh > 0) ? cx + blCh
                                            : (blMode === 'fillet'  && blFil > 0) ? cx + blFil : cx;
                            const botEndX   = (brMode === 'chamfer' && brCh > 0) ? cx + W_mm - brCh
                                           : (brMode === 'fillet'   && brFil > 0) ? cx + W_mm - brFil : cx + W_mm;
                            push({ type: 'line', start: { x: botStartX, y: cy }, end: { x: botEndX, y: cy }, isConstruction: false });

                            // BR угол
                            if (brMode === 'chamfer' && brCh > 0) {
                                push({ type: 'line', start: { x: cx + W_mm - brCh, y: cy }, end: { x: cx + W_mm, y: cy - brCh }, isConstruction: false });
                            } else if (brMode === 'fillet' && brFil > 0) {
                                push({ type: 'arc', center: BR, radius: brFil, startAngle: Math.PI, endAngle: -Math.PI / 2, counterClockwise: false, isConstruction: false });
                            }

                            // Правая сторона (вверх к уступу BFp), обрезана снизу
                            const rightStartY = (brMode === 'chamfer' && brCh > 0) ? cy - brCh
                                             : (brMode === 'fillet'   && brFil > 0) ? cy - brFil : cy;
                            push({ type: 'line', start: { x: cx + W_mm, y: rightStartY }, end: BFp, isConstruction: false });

                            // Гипотенуза: BFp → TFp (с фаской у TFp)
                            push({ type: 'line', start: BFp, end: { x: TFp.x, y: TFp.y + chamMm }, isConstruction: false });

                            // Фаска у TFp
                            if (chamMm > 0) {
                                push({ type: 'line', start: { x: TFp.x, y: TFp.y + chamMm }, end: { x: TFp.x - chamMm, y: TFp.y }, isConstruction: false });
                            }

                            // Верхний уступ: TFp → TL
                            const topStartX = (tlMode === 'chamfer' && tlCh > 0) ? cx + tlCh
                                            : (tlMode === 'fillet'  && tlFil > 0) ? cx + tlFil : cx;
                            push({ type: 'line', start: { x: TFp.x - chamMm, y: TFp.y }, end: { x: topStartX, y: TL.y }, isConstruction: false });
                            
                            // TL угол
                            if (tlMode === 'chamfer' && tlCh > 0) {
                                push({ type: 'line', start: { x: cx + tlCh, y: cy - H_mm }, end: { x: cx, y: cy - H_mm + tlCh }, isConstruction: false });
                            } else if (tlMode === 'fillet' && tlFil > 0) {
                                push({ type: 'arc', center: TL, radius: tlFil, startAngle: 0, endAngle: Math.PI/2, counterClockwise: false, isConstruction: false });
                            }

                            st.tool = 'edit'; st.isDrawing = false; this.updateToolbarUI();
                        }
                    }
                }
                this.draw();
            },

            onMouseMove: function(e) {
                const st = this.cadState;
                
                // Panning
                if (st.view.isPanning) {
                    st.view.x += e.clientX - st.view.lastPan.x;
                    st.view.y += e.clientY - st.view.lastPan.y;
                    st.view.lastPan = { x: e.clientX, y: e.clientY };
                    this.draw();
                    return;
                }

                // Update Mouse & Snap
                const m = this.getMouseWorld(e);
                st.mouse = m;
                const snap = this.findSnapPoint(m.x, m.y);
                st.snappedPoint = snap;
                const pos = snap || m;

                // HANDLE DRAGGING LOGIC
                if (st.tool === 'edit' && st.isDraggingHandle && st.selectedShapeIndex > -1) {
                    const shape = st.shapes[st.selectedShapeIndex];
                    
                    // Ortho constrain for handles if needed (simplified to free move for now, or inherit ortho)
                    let finalPos = pos;
                    if (st.ortho && !snap && shape.type === 'line') {
                        // Simple ortho for lines: match X or Y of the OTHER point
                        const otherIdx = st.dragHandleIndex === 0 ? 1 : 0;
                        const otherPt = (otherIdx === 0) ? shape.start : shape.end;
                        if (Math.abs(pos.x - otherPt.x) > Math.abs(pos.y - otherPt.y)) finalPos.y = otherPt.y; 
                        else finalPos.x = otherPt.x;
                    }

                    this.updateShapeFromHandle(shape, st.dragHandleIndex, finalPos);
                }
                
                this.draw(); 
            },

            onMouseUp: function(e) {
                if (e.button === 2) this.cadState.view.isPanning = false;
                // Stop dragging handles
                if (this.cadState.isDraggingHandle) {
                    this.cadState.isDraggingHandle = false;
                    this.cadState.dragHandleIndex = -1;
                }
            },

            onWheel: function(e) {
                const zoomFactor = 1 + (e.deltaY > 0 ? -0.1 : 0.1);
                const st = this.cadState;
                const newZoom = Math.max(0.1, Math.min(10, st.view.zoom * zoomFactor));
                
                const rect = this.canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                
                const wx = (mx - st.view.x) / st.view.zoom;
                const wy = (my - st.view.y) / st.view.zoom;
                
                st.view.x = mx - wx * newZoom;
                st.view.y = my - wy * newZoom;
                st.view.zoom = newZoom;
                
                this.draw();
            },

            // --- DXF HANDLER (Silent) ---
            handleDXF: function(e) {
                 const file = e.target.files[0];
                if (!file) return;
                
                if (typeof DxfParser === 'undefined') {
                    console.error("DxfParser library missing");
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const parser = new DxfParser();
                        const dxf = parser.parseSync(event.target.result);
                        if(dxf && dxf.entities) {
                            dxf.entities.forEach(ent => {
                                if(ent.type === 'LINE') {
                                    this.cadState.shapes.push({ 
                                        type: 'line', 
                                        start: {x: ent.vertices[0].x, y: -ent.vertices[0].y}, 
                                        end: {x: ent.vertices[1].x, y: -ent.vertices[1].y}, 
                                        isConstruction: true 
                                    });
                                } else if (ent.type === 'CIRCLE') {
                                    this.cadState.shapes.push({
                                        type: 'circle',
                                        center: {x: ent.center.x, y: -ent.center.y},
                                        radius: ent.radius,
                                        isConstruction: true
                                    });
                                }
                            });
                            this.cadState.view.x = this.canvas.width/2; 
                            this.cadState.view.y = this.canvas.height/2;
                            this.draw();
                        }
                    } catch(err) { console.error("DXF Parse Error", err); }
                };
                reader.readAsText(file);
            },
            // --- DRAWING ENGINE ---
             draw: function() {
                const ctx = this.ctx;
                const w = this.canvas.width;
                const h = this.canvas.height;
                const st = this.cadState;
                const zoom = st.view.zoom;

                // 1. Background
                ctx.fillStyle = '#E8ECF1';
                ctx.fillRect(0, 0, w, h);

                ctx.save();
                ctx.translate(st.view.x, st.view.y);
                ctx.scale(zoom, zoom);

                // 2. Grid
                ctx.lineWidth = 1 / zoom;
                               const gridSize = zoom > 1.5 ? 10 : (zoom < 0.2 ? 500 : 100);
                
                const left = -st.view.x / zoom;
                const top = -st.view.y / zoom;
                const right = left + w / zoom;
                const bottom = top + h / zoom;
                
                const sx = Math.floor(left / gridSize) * gridSize;
                const sy = Math.floor(top / gridSize) * gridSize;

                ctx.beginPath();
                ctx.strokeStyle = '#A8AEB8';
                for(let x = sx; x < right; x+=gridSize) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
                for(let y = sy; y < bottom; y+=gridSize) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
                ctx.stroke();

                // --- NEW: DYNAMIC AXIS LABELS ---
                ctx.fillStyle = '#555';
                ctx.font = `${10/zoom}px monospace`;
                
                // X Axis Labels
                ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                for(let x = sx; x < right; x+=gridSize) {
                    if (Math.abs(x) < 0.1) continue; // Skip 0
                    // Draw close to the X-axis (y=0)
                    ctx.fillText(x.toFixed(0), x, 4/zoom);
                }
                
                // Y Axis Labels
                ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                for(let y = sy; y < bottom; y+=gridSize) {
                    if (Math.abs(y) < 0.1) continue; // Skip 0
                    ctx.fillText(y.toFixed(0), -4/zoom, y);
                }

                // Axis Lines (Red/Green)
                ctx.beginPath(); ctx.strokeStyle = '#c0392b'; ctx.moveTo(0,0); ctx.lineTo(100,0); ctx.stroke(); // X
                ctx.beginPath(); ctx.strokeStyle = '#27ae60'; ctx.moveTo(0,0); ctx.lineTo(0,100); ctx.stroke(); // Y

                // 3. Shapes
                st.shapes.forEach((s, i) => {
                    ctx.beginPath();
                    if(s.type === 'dimension') ctx.strokeStyle = '#E6A817';
                    else if(s.isConstruction) { ctx.strokeStyle = '#7D8A9A'; ctx.setLineDash([5/zoom, 5/zoom]); }
                    else if(i === st.selectedShapeIndex) ctx.strokeStyle = '#3355CC'; // Bright Blue Selected
                    else ctx.strokeStyle = '#1e293b'; // Main line color
                    
                    ctx.lineWidth = (i === st.selectedShapeIndex) ? 3/zoom : 2/zoom;

                    if(s.type === 'line') {
                        ctx.moveTo(s.start.x, s.start.y); ctx.lineTo(s.end.x, s.end.y);
                    } else if(s.type === 'circle') {
                        ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI*2);
                    } else if(s.type === 'arc') {
                        ctx.arc(s.center.x, s.center.y, s.radius, s.startAngle, s.endAngle, s.counterClockwise);
                    } else if(s.type === 'dimension') {
                        ctx.lineWidth = 1/zoom; ctx.setLineDash([]);
                        const p1 = s.p1; const p2 = s.p2; const pos = s.pos;
                        if(s.subType === 'width') {
                            ctx.moveTo(p1.x, p1.y); ctx.lineTo(pos.x, p1.y);
                            ctx.moveTo(p2.x, p2.y); ctx.lineTo(pos.x, p2.y);
                            ctx.moveTo(pos.x, p1.y); ctx.lineTo(pos.x, p2.y);
                        } else {
                            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p1.x, pos.y);
                            ctx.moveTo(p2.x, p2.y); ctx.lineTo(p2.x, pos.y);
                            ctx.moveTo(p1.x, pos.y); ctx.lineTo(p2.x, pos.y);
                        }
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // INFO TEXT (Existing logic for finished shapes)
                    if (!s.isConstruction && s.type !== 'dimension') {
                        ctx.save();
                        ctx.fillStyle = '#00ff00'; 
                        ctx.font = `${10/zoom}px monospace`;
                        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';

                        if (s.type === 'line') {
                            const len = Math.sqrt(Math.pow(s.end.x - s.start.x, 2) + Math.pow(s.end.y - s.start.y, 2)).toFixed(1);
                            const midX = (s.start.x + s.end.x) / 2;
                            const midY = (s.start.y + s.end.y) / 2;
                            let angle = Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x);
                            if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
                            ctx.translate(midX, midY); ctx.rotate(angle); ctx.fillText(len, 0, -2/zoom);
                        } else if (s.type === 'circle' || s.type === 'arc') {
                            ctx.fillText(`R${s.radius.toFixed(1)}`, s.center.x, s.center.y);
                        }
                        ctx.restore();
                    }

                    if(s.type === 'dimension') {
                        ctx.save();
                        ctx.fillStyle = '#f1c40f';
                        ctx.font = `bold ${14/zoom}px monospace`;
                        ctx.textAlign = 'center';
                        let val = 0;
                        if(s.subType === 'width') {
                            val = Math.abs(s.p1.y - s.p2.y).toFixed(0);
                            ctx.translate(s.pos.x, (s.p1.y+s.p2.y)/2); ctx.rotate(-Math.PI/2); ctx.fillText(val, 0, -2/zoom);
                        } else {
                            val = Math.abs(s.p1.x - s.p2.x).toFixed(0);
                            ctx.fillText(val, (s.p1.x+s.p2.x)/2, s.pos.y - 2/zoom);
                        }
                        ctx.restore();
                    }
                });
                
                // 3.5 SELECTION HIGHLIGHTS (Handles & Delete Btn)
                if (st.selectedShapeIndex > -1 && st.tool === 'edit') {
                    const selShape = st.shapes[st.selectedShapeIndex];
                    const handles = this.getShapeHandles(selShape);
                    ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff';
                    const hsize = 8/zoom;
                    handles.forEach(hPos => {
                        ctx.beginPath(); ctx.rect(hPos.x - hsize/2, hPos.y - hsize/2, hsize, hsize); ctx.fill(); ctx.stroke();
                    });
                    const delPos = this.getDeleteBtnPos(selShape);
                    if (delPos) {
                        const dSize = 10/zoom;
                        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2/zoom;
                        ctx.beginPath();
                        ctx.moveTo(delPos.x - dSize/2, delPos.y - dSize/2); ctx.lineTo(delPos.x + dSize/2, delPos.y + dSize/2);
                        ctx.moveTo(delPos.x + dSize/2, delPos.y - dSize/2); ctx.lineTo(delPos.x - dSize/2, delPos.y + dSize/2);
                        ctx.stroke();
                        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1/zoom;
                        ctx.beginPath(); ctx.arc(delPos.x, delPos.y, dSize*0.8, 0, Math.PI*2); ctx.stroke();
                    }
                }

                // 4. Preview
                if(st.isDrawing && st.points.length > 0) {
                    const start = st.points[0];
                    const curr = st.snappedPoint || st.mouse;
                    
                    ctx.beginPath();
                    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1/zoom;
                    ctx.setLineDash([5/zoom, 5/zoom]);
                    
                    let dynamicText = "";
                    let textPos = { x: curr.x, y: curr.y };

                    if(st.tool === 'line') {
                        let ex = curr.x, ey = curr.y;
                        if(st.ortho && !st.snappedPoint) { if(Math.abs(ex-start.x)>Math.abs(ey-start.y)) ey=start.y; else ex=start.x; }
                        ctx.moveTo(start.x, start.y); ctx.lineTo(ex, ey);
                        
                        // Calc Length
                        const d = Math.sqrt(Math.pow(ex - start.x, 2) + Math.pow(ey - start.y, 2));
                        dynamicText = `L: ${d.toFixed(1)}`;
                        textPos = { x: (start.x + ex)/2, y: (start.y + ey)/2 };

                    } else if(st.tool === 'circle') {
                        const r = this.math.getDistance(start, curr);
                        ctx.arc(start.x, start.y, r, 0, Math.PI*2);
                        
                        dynamicText = `R: ${r.toFixed(1)}`;
                        textPos = { x: curr.x, y: curr.y }; // Text at cursor (radius edge)

                    } else if(st.tool === 'arc') {
                        if(st.points.length === 1) { ctx.moveTo(start.x, start.y); ctx.lineTo(curr.x, curr.y); }
                        else if(st.points.length === 2) {
                            const p = this.math.getArcParams(st.points[0], st.points[1], curr);
                            if(p) {
                                ctx.arc(p.center.x, p.center.y, p.radius, p.startAngle, p.endAngle, p.counterClockwise);
                                dynamicText = `R: ${p.radius.toFixed(1)}`;
                                textPos = { x: curr.x, y: curr.y };
                            }
                        }
                    } else if(st.tool === 'dim') {
                        ctx.moveTo(start.x, start.y); ctx.lineTo(curr.x, curr.y);
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // --- NEW: DRAW DYNAMIC DIMENSION TEXT ---
                    if (dynamicText) {
                        ctx.save();
                        ctx.fillStyle = '#00ffff'; // Cyan for active op
                        ctx.font = `bold ${14/zoom}px monospace`;
                        ctx.shadowColor = "black";
                        ctx.shadowBlur = 4;
                        ctx.fillText(dynamicText, textPos.x + 10/zoom, textPos.y - 10/zoom);
                        ctx.restore();
                    }
                }

                // 4.5 Preview: rect-place (прямоугольник следует за курсором)
                if (st.tool === 'rect-place' && st.mouse) {
                    const curr = st.snappedPoint || st.mouse;
                    const hl = (st.rectParams.length || 100) / 2;
                    const hw = (st.rectParams.width || 50) / 2;
                    const mode = st.rectParams.cornerMode;
                    const chamVal = st.rectParams.chamfer || 0;
                    const filVal = st.rectParams.fillet || 0;

                    ctx.beginPath();
                    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1.5/zoom;
                    ctx.setLineDash([5/zoom, 5/zoom]);

                    if (mode === 'chamfer' && chamVal > 0) {
                        const c = Math.min(chamVal, hl, hw);
                        ctx.moveTo(curr.x - hl + c, curr.y - hw);
                        ctx.lineTo(curr.x + hl - c, curr.y - hw);
                        ctx.lineTo(curr.x + hl, curr.y - hw + c);
                        ctx.lineTo(curr.x + hl, curr.y + hw - c);
                        ctx.lineTo(curr.x + hl - c, curr.y + hw);
                        ctx.lineTo(curr.x - hl + c, curr.y + hw);
                        ctx.lineTo(curr.x - hl, curr.y + hw - c);
                        ctx.lineTo(curr.x - hl, curr.y - hw + c);
                        ctx.closePath();
                    } else if (mode === 'fillet' && filVal > 0) {
                        // Арки с центрами в вершинах (вогнутые), идентично логике размещения
                        const r = Math.min(filVal, hl, hw);
                        ctx.moveTo(curr.x - hl + r, curr.y - hw);
                        ctx.lineTo(curr.x + hl - r, curr.y - hw);
                        ctx.arc(curr.x + hl, curr.y - hw, r, Math.PI, Math.PI / 2, true);       // TR
                        ctx.lineTo(curr.x + hl, curr.y + hw - r);
                        ctx.arc(curr.x + hl, curr.y + hw, r, -Math.PI / 2, Math.PI, true);      // BR
                        ctx.lineTo(curr.x - hl + r, curr.y + hw);
                        ctx.arc(curr.x - hl, curr.y + hw, r, 0, -Math.PI / 2, true);            // BL
                        ctx.lineTo(curr.x - hl, curr.y - hw + r);
                        ctx.arc(curr.x - hl, curr.y - hw, r, Math.PI / 2, 0, true);             // TL
                        ctx.closePath();
                    } else {
                        ctx.rect(curr.x - hl, curr.y - hw, hl*2, hw*2);
                    }
                    ctx.stroke();
                    ctx.setLineDash([]);
                    // Перекрестие в центре
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(231,76,60,0.5)'; ctx.lineWidth = 0.5/zoom;
                    ctx.moveTo(curr.x - 6/zoom, curr.y); ctx.lineTo(curr.x + 6/zoom, curr.y);
                    ctx.moveTo(curr.x, curr.y - 6/zoom); ctx.lineTo(curr.x, curr.y + 6/zoom);
                    ctx.stroke();
                    // Подпись размеров
                    ctx.save();
                    ctx.fillStyle = '#00ffff';
                    ctx.font = `bold ${12/zoom}px monospace`;
                    ctx.shadowColor = 'black'; ctx.shadowBlur = 3;
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                    ctx.fillText(`${st.rectParams.length}×${st.rectParams.width} мм`, curr.x + hl + 8/zoom, curr.y);
                    ctx.restore();
                }

                // 4.6 Preview: knee-place (цвет как у прямоугольника, уступы внутрь)
                if (st.tool === 'knee-place' && st.mouse) {
                    const curr = st.snappedPoint || st.mouse;
                    const kp = st.kneeParams;
                    const H_mm = kp.height, W_mm = kp.width;
                    const tf = kp.topFlange, bf = kp.botFlange, ch = kp.chamfer;
                    const blMode = kp.cornerMode;
                    const blCh = Math.min(kp.blChamfer, H_mm / 2, W_mm / 2);
                    const blFil = kp.blFillet;
                    const brMode = kp.brCornerMode || 'none';
                    const brCh = Math.min(kp.brChamfer || 0, W_mm / 2, H_mm / 2);
                    const brFil = kp.brFillet || 0;
                    const tlMode = kp.tlCornerMode || 'none';
                    const tlCh = Math.min(kp.tlChamfer || 0, H_mm / 2, W_mm / 2);
                    const tlFil = kp.tlFillet || 0;
                    const cx = curr.x, cy = curr.y;
                    const chamMm = (ch > 0 && tf > 0 && bf > 0) ? Math.min(ch, tf, bf) : 0;

                    ctx.beginPath();
                    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1.5/zoom;
                    ctx.setLineDash([5/zoom, 5/zoom]);

                    // Левая сторона (вниз)
                    const leftStartY = (tlMode === 'chamfer' && tlCh > 0) ? cy - H_mm + tlCh
                                     : (tlMode === 'fillet'  && tlFil > 0) ? cy - H_mm + tlFil : cy - H_mm;
                    const leftBotY = (blMode === 'chamfer' && blCh > 0) ? cy - blCh
                                   : (blMode === 'fillet'  && blFil > 0) ? cy - blFil : cy;
                    ctx.moveTo(cx, leftStartY);
                    ctx.lineTo(cx, leftBotY);

                    // BL угол
                    if (blMode === 'chamfer' && blCh > 0) {
                        ctx.lineTo(cx + blCh, cy);
                    } else if (blMode === 'fillet' && blFil > 0) {
                        ctx.arc(cx, cy, blFil, -Math.PI/2, 0, false);
                    } else {
                        ctx.lineTo(cx, cy);
                    }

                    // Нижняя сторона (вправо), обрезана справа для BR угла
                    if (brMode === 'chamfer' && brCh > 0) {
                        ctx.lineTo(cx + W_mm - brCh, cy);
                        ctx.lineTo(cx + W_mm, cy - brCh);
                    } else if (brMode === 'fillet' && brFil > 0) {
                        ctx.lineTo(cx + W_mm - brFil, cy);
                        ctx.arc(cx + W_mm, cy, brFil, Math.PI, -Math.PI / 2, false);
                    } else {
                        ctx.lineTo(cx + W_mm, cy);
                    }

                    // Правый уступ (вверх)
                    ctx.lineTo(cx + W_mm, cy - bf);

                    // Гипотенуза к TFp
                    ctx.lineTo(cx + tf, cy - H_mm + chamMm);

                    // Фаска у TFp
                    if (chamMm > 0) { ctx.lineTo(cx + tf - chamMm, cy - H_mm); }

                    // Верхний уступ (влево к TL)
                    const topStartX = (tlMode === 'chamfer' && tlCh > 0) ? cx + tlCh
                                    : (tlMode === 'fillet'  && tlFil > 0) ? cx + tlFil : cx;
                    ctx.lineTo(topStartX, cy - H_mm);
                    
                    // TL угол
                    if (tlMode === 'chamfer' && tlCh > 0) {
                        ctx.lineTo(cx, cy - H_mm + tlCh);
                    } else if (tlMode === 'fillet' && tlFil > 0) {
                        ctx.arc(cx, cy - H_mm, tlFil, 0, Math.PI/2, false);
                    }
                    ctx.closePath();

                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Перекрестие в BL
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(231,76,60,0.5)'; ctx.lineWidth = 0.5/zoom;
                    ctx.moveTo(cx - 6/zoom, cy); ctx.lineTo(cx + 6/zoom, cy);
                    ctx.moveTo(cx, cy - 6/zoom); ctx.lineTo(cx, cy + 6/zoom);
                    ctx.stroke();

                    // Подпись
                    ctx.save();
                    ctx.fillStyle = '#00ffff'; ctx.font = `bold ${12/zoom}px monospace`;
                    ctx.shadowColor = 'black'; ctx.shadowBlur = 3;
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
                    ctx.fillText(`Кница ${H_mm}×${W_mm}`, cx + 8/zoom, cy - 4/zoom);
                    ctx.restore();
                }

                // 5. Snap Marker
                if(st.snappedPoint) {
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2/zoom;
                    const s = 10/zoom;
                    ctx.strokeRect(st.snappedPoint.x - s/2, st.snappedPoint.y - s/2, s, s);
                }

                ctx.restore(); // Exit World Transform

                // --- 6. UI OVERLAY (Screen Coordinates) ---
                const screenX = st.mouse.x * zoom + st.view.x;
                const screenY = st.mouse.y * zoom + st.view.y;
                if (screenX >= 0 && screenX <= w && screenY >= 0 && screenY <= h) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; 
                    ctx.lineWidth = 1;
                    ctx.moveTo(screenX, 0); ctx.lineTo(screenX, h);
                    ctx.moveTo(0, screenY); ctx.lineTo(w, screenY);
                    ctx.stroke();
                    
                    // --- NEW: CURSOR COORDINATES NEAR MOUSE ---
                    ctx.fillStyle = '#1e293b';
                    ctx.font = 'bold 12px monospace';
                    // Draw bottom-right of cursor
                    ctx.fillText(`X:${st.mouse.x.toFixed(1)} Y:${st.mouse.y.toFixed(1)}`, screenX + 15, screenY + 20);
                }
            },
            
            switchScreen: function(id) {
                ['screen-idle', 'screen-projects', 'screen-parts', 'screen-cad', 'screen-supply-tasks', 'screen-supply-details', 'screen-supply-request', 'screen-supervisor', 'screen-map'].forEach(s => {
                    const el = document.getElementById(s);
                    if (el) el.classList.add('hidden');
                });
                const tgt = document.getElementById(id);
                if (tgt) tgt.classList.remove('hidden');
                
                if(id === 'screen-projects') this.renderProjects();
                if(id === 'screen-parts') this.renderParts();
                if(id === 'screen-cad') {
                     // Load Data
                     const part = this.projects[this.currentProjectIdx].parts[this.currentPartIdx];
                     this.cadState.shapes = JSON.parse(JSON.stringify(part.cadData || []));
                     this.cadState.view.x = this.canvas.width/2; // Center
                     this.cadState.view.y = this.canvas.height/2;
                     this.cadState.view.zoom = 1.0;
                     this.cadState.isDrawing = false;
                     this.cadState.points = [];
                     
                     const cadPartNameEl = document.getElementById('cad-part-name');
                     if (cadPartNameEl) cadPartNameEl.innerText = part.name;
                     this.updateToolbarUI();
                     setTimeout(() => this.draw(), 100);
                }
            },

                                 renderSupplyDetails: function(task) {
                this.supplyState.activeTask = task; 
                // Switch Screens
                document.getElementById('screen-supply-tasks').classList.add('hidden');
                document.getElementById('screen-supply-details').classList.remove('hidden');
                
                let totalMass = 0;
                task.parts.forEach(p => {
                    totalMass += this.getPartMass(p) * p.qty;
                });
                document.getElementById('supply-detail-title').innerText = `Задание: ${task.projectName} (Общая масса: ${totalMass.toFixed(2)} кг)`;
                
                // Back Button Handler
                document.getElementById('btn-supply-back').onclick = () => {
                    document.getElementById('screen-supply-details').classList.add('hidden');
                    document.getElementById('screen-supply-tasks').classList.remove('hidden');
                };

                // Save Comment Handler (Single instance)
                const saveBtn = document.getElementById('btn-save-supply-comment');
                
                // Оптимизация (Пункт 3): Используем прямое переопределение onclick
                saveBtn.onclick = () => {
                    const val = document.getElementById('input-supply-comment-text').value;
                    const idx = this.supplyState.editingPartIndex; // Need to set this on click
                    if(task.parts[idx]) {
                        task.parts[idx].supplyComment = val;
                        this.renderSupplyDetails(task); // Re-render
                    }
                    document.getElementById('modal-supply-edit-comment').classList.add('hidden');
                };

                // UPDATE TABLE HEADER (Inject via JS or assume HTML update - doing JS for safety)
                const headerContainer = document.querySelector('#screen-supply-details .grid.grid-cols-12');
                if(headerContainer) {
                    headerContainer.className = "grid grid-cols-12 gap-2 text-[10px] font-bold opacity-60 mb-2 px-2 text-slate-400";
                    // Layout: Foto(1) Name(3) Dims(2) Qty(1) TechComm(2) SupplyComm(3)
                    headerContainer.innerHTML = `
                        <div class="col-span-1 text-center">ФОТО</div>
                        <div class="col-span-3">НАИМЕНОВАНИЕ</div>
                        <div class="col-span-2">ГАБАРИТЫ</div>
                        <div class="col-span-1 text-right">КОЛ</div>
                        <div class="col-span-2 text-blue-400">КОММ. ТЕХНОЛОГА</div>
                        <div class="col-span-3 text-fuchsia-400">КОММ. СНАБЖЕНИЯ</div>
                    `;
                }

                const c = document.getElementById('supply-parts-container');
                c.innerHTML = '';

                // Styles
                const rowClass = "bg-slate-800 border-slate-700";
                const textMain = "text-gray-200";

                task.parts.forEach((p, idx) => {
                    const div = document.createElement('div');
                    div.className = `${rowClass} p-2 rounded border mb-2 flex flex-col`;
                    
                    const thumbSrc = p.thumbnail ? p.thumbnail : ''; 
                    const hasThumb = !!p.thumbnail;
                    let imgHTML = `<div class="w-full h-full bg-slate-900 flex items-center justify-center text-[8px] text-gray-500">NO</div>`;
                    if(hasThumb) imgHTML = `<img src="${thumbSrc}" class="w-full h-full object-contain bg-[#1e1e1e]" />`;

                    // Tech Comment HTML
                    const techCommHTML = p.techComment 
                        ? `<div class="text-[9px] text-blue-200 italic leading-tight bg-blue-900/30 p-1 rounded border border-blue-900/50">${p.techComment}</div>` 
                        : `<div class="text-[9px] text-slate-600">-</div>`;

                    // Supply Comment HTML
                    const supplyCommText = p.supplyComment || "";
                    const supplyBtnText = supplyCommText ? "✎" : "+";
                    const supplyCommHTML = `
                        <div class="flex items-start gap-1 h-full">
                            <div class="flex-1 text-[9px] text-fuchsia-200 italic leading-tight bg-fuchsia-900/20 p-1 rounded min-h-[20px] border border-fuchsia-900/30">${supplyCommText}</div>
                            <button id="btn-edit-supp-comm-${idx}" class="w-5 h-5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] rounded flex items-center justify-center shadow-sm border border-slate-600">${supplyBtnText}</button>
                        </div>
                    `;

                    div.innerHTML = `
                        <div class="grid grid-cols-12 gap-2 items-center">
                            <!-- Image (1) -->
                            <div class="col-span-1 aspect-square relative group rounded overflow-hidden border border-gray-500/30">
                                ${imgHTML}
                                ${hasThumb ? `<div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer" id="zoom-img-${task.id}-${idx}">🔍</div>` : ''}
                            </div>
                            <!-- Name (3) -->
                            <div class="col-span-3 text-xs font-bold ${textMain} truncate" title="${p.name}">${p.name}</div>
                            <!-- Dims (2) -->
                            <div class="col-span-2 text-[9px] opacity-70 leading-tight">
                                ${p.finalDims.w}x${p.finalDims.l}<br>t=${p.thick} мм<br>
                                ${this.getPartMass(p) > 0 ? `Масса: ${this.getPartMass(p).toFixed(2)} кг<br>` : ''}
                                ${p.materialName || 'Сталь'}
                            </div>
                            <!-- Qty (1) -->
                            <div class="col-span-1 text-right">
                                <span class="bg-gray-500/20 px-1.5 py-0.5 rounded font-bold text-xs">${p.qty}</span>
                            </div>
                            <!-- Tech Comm (2) -->
                            <div class="col-span-2">${techCommHTML}</div>
                            <!-- Supply Comm (3) -->
                            <div class="col-span-3">${supplyCommHTML}</div>
                        </div>
                    `;
                    c.appendChild(div);

                    // Handlers
                    if(hasThumb) {
                        document.getElementById(`zoom-img-${task.id}-${idx}`).onclick = () => {
                            const modal = document.getElementById('modal-full-image');
                            document.getElementById('full-image-target').src = thumbSrc;
                            modal.classList.remove('hidden'); modal.classList.add('flex');
                        };
                    }
                    
                    document.getElementById(`btn-edit-supp-comm-${idx}`).onclick = () => {
                        this.supplyState.editingPartIndex = idx;
                        document.getElementById('input-supply-comment-text').value = p.supplyComment || "";
                        document.getElementById('modal-supply-edit-comment').classList.remove('hidden');
                    };
                });
            },

            renderParts: function() {
                const c = document.getElementById('part-list-container');
                c.innerHTML = '';
                if(this.currentProjectIdx === -1 || !this.projects[this.currentProjectIdx]) return;
                
                const parts = this.projects[this.currentProjectIdx].parts;
                parts.forEach((p, idx) => {
                    const div = document.createElement('div');
                    div.className = "bg-slate-800 p-2 rounded border border-slate-700 hover:border-green-500 flex justify-between items-center mb-2";
                    
                    let dimString = "";
                    let dimClass = "text-gray-400";
                    if (p.dimensions && p.dimensions.width && p.dimensions.length) {
                        dimString = ` * ${p.dimensions.width}x${p.dimensions.length}`;
                    } else {
                        dimString = ` <span class="text-red-400 font-bold ml-1 animate-pulse">! НЕТ РАЗМЕРОВ !</span>`;
                    }

                    const mass1 = this.getPartMass(p);
                    const massStr = mass1 > 0 ? ` | Масса: ${mass1.toFixed(2)} кг (${(mass1 * p.qty).toFixed(2)} кг)` : '';

                    div.innerHTML = `
                        <div class="flex-1 cursor-pointer mr-2" id="part-row-${idx}">
                            <div class="flex justify-between">
                                <span class="text-sm text-white font-bold">${p.name}</span>
                                <span class="text-xs bg-gray-700 px-1 rounded">${p.qty} шт</span>
                            </div>
                            <div class="text-[10px] ${dimClass} mt-1">
                                Толщина: ${p.thick}мм${dimString}${massStr} <br> Мат: ${p.materialName || 'Сталь'}
                                <span class="float-right text-[#A8AEB8]">${p.cadData.length > 0 ? 'CAD ОК' : 'Пусто'}</span>
                            </div>
                        </div>
                        <div class="flex flex-col gap-1">
                            <button id="btn-edit-part-${idx}" class="bg-blue-900 hover:bg-blue-700 text-white text-[10px] px-2 py-1 rounded border border-blue-800 w-8 flex justify-center" title="Редактировать">
                                ✎
                            </button>
                            <button id="btn-del-part-${idx}" class="bg-red-900 hover:bg-red-700 text-white text-[10px] px-2 py-1 rounded border border-red-800 w-8 flex justify-center" title="Удалить">
                                🗑
                            </button>
                        </div>
                    `;
                    c.appendChild(div);

                    // Handlers
                    document.getElementById(`part-row-${idx}`).onclick = () => {
                        this.currentPartIdx = idx;
                        this.switchScreen('screen-cad');
                    };

                    document.getElementById(`btn-edit-part-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        this.editState.isEditingPart = true;
                        this.editState.partIdx = idx;
                        
                        document.getElementById('input-part-name').value = p.name;
                        document.getElementById('input-part-qty').value = p.qty;
                        document.getElementById('input-part-thick').value = p.thick;
                        document.getElementById('input-part-tech-comment').value = p.techComment || '';

                        const matSelect = document.getElementById('input-part-material');
                        let found = false;
                        if (p.density) {
                            for (let opt of matSelect.options) {
                                if (opt.value === p.density.toString() && opt.value !== 'custom') {
                                    matSelect.value = opt.value;
                                    found = true; break;
                                }
                            }
                        } else {
                            matSelect.value = '7850';
                            found = true;
                        }
                        
                        if (!found) {
                            matSelect.value = 'custom';
                            document.getElementById('custom-density-container').classList.remove('hidden');
                        } else {
                            document.getElementById('custom-density-container').classList.add('hidden');
                        }
                        document.getElementById('input-part-density').value = p.density || 7850;
                        
                        document.getElementById('modal-new-part').classList.remove('hidden');
                    };

                    document.getElementById(`btn-del-part-${idx}`).onclick = (e) => {
                        e.stopPropagation();
                        parts.splice(idx, 1);
                        this.renderParts();
                    };
                });
            }
        };
        
        techOS.init();

        // =====================================================
        // 🚑 HOTFIX: TRUCK LOADING & PHYSICS REGISTRATION
        // =====================================================

        // 1. Helper to register part in physics engine
        function registerWorkpiece(mesh) {
            mesh.userData.isWorkpiece = true;
            // Calculate AABB for physics
            mesh.geometry.computeBoundingBox();
            const bb = mesh.geometry.boundingBox;
            mesh.userData.half = new THREE.Vector3(
                (bb.max.x - bb.min.x) / 2,
                (bb.max.y - bb.min.y) / 2,
                (bb.max.z - bb.min.z) / 2
            );
            
                     // --- Visual Highlight Group (Overlay Plane) ---
            const hlGroup = new THREE.Group();
            hlGroup.visible = false;
            
            // Материал для подсветки грани (Желтый, без прозрачности, с оффсетом чтобы не мерцал)
            const faceMat = new THREE.MeshBasicMaterial({ 
                color: 0xffff00, 
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1, // Рисует поверх детали
                polygonOffsetUnits: -1
            });
            
            // Геометрия будет меняться динамически
            const hlPlane = new THREE.Mesh(new THREE.PlaneGeometry(1,1), faceMat);
            hlPlane.userData.isHighlight = true;
            
            // Контур (опционально, для красоты)
            const hlEdges = new THREE.LineSegments(
                new THREE.EdgesGeometry(hlPlane.geometry), 
                new THREE.LineBasicMaterial({ color: 0xccaa00, depthTest: false })
            );
            hlEdges.userData.isHighlight = true;
            
            hlGroup.add(hlPlane);
            hlGroup.add(hlEdges);
            
            // Добавляем группу как ДИТЯ детали, чтобы она вращалась вместе с ней
            mesh.add(hlGroup);
            
            mesh.userData.hlGroup = hlGroup;
            mesh.userData.hlPlane = hlPlane;
            mesh.userData.hlEdges = hlEdges;

            workpieces.push(mesh);
        }
     

        // 2. New Physics-Aware Loader
        function spawnPartsInTruck(task) {
            if (!globalTruck || !globalTruck.userData.bed) {
                console.error("Truck not ready");
                return;
            }

            // Show Truck
            globalTruck.visible = true;
            // Добавляем хитбокс только один раз при первом появлении грузовика
            if (!globalTruck.userData.hitboxAdded) {
                globalTruck.userData.hitboxAdded = true;
                if (typeof wallsForCollision !== 'undefined') {
                    wallsForCollision.push({ x1: 500, z1: 1250, x2: 500, z2: 1750, thickness: 280 });
                }
            }
            
            // Get Bed and update world matrix to ensure calculations are correct
            const bed = globalTruck.userData.bed;
            globalTruck.updateMatrixWorld(true);

            // Clear old cargo
            // Note: In a real game we might want to keep old cargo, but for now clear it
            // We iterate backwards to remove safely
            for (let i = workpieces.length - 1; i >= 0; i--) {
                const wp = workpieces[i];
                // Remove only if it was loaded in truck previously (you might want a flag)
                if (wp.userData.isCargo) {
                    scene.remove(wp);
                    workpieces.splice(i, 1);
                }
            }

            // Packing Cursor (Local Bed Coordinates)
            let curX = -200; 
            let curZ = -100;

            task.parts.forEach(part => {
                for(let i=0; i<part.qty; i++) {
                    // Call the generator with Dimensions Fallback
                    const mesh = generate3DPartFromCAD(part.cadData, parseFloat(part.thick), part.dimensions);
                    
                    if (mesh) {
                        // A. Register Physics
                        registerWorkpiece(mesh);
                        mesh.userData.isCargo = true; // Flag to identify cargo

                        // B. Get Dimensions
                        const size = new THREE.Vector3();
                        mesh.geometry.boundingBox.getSize(size);
                        const w = size.x; 
                        const l = size.y; // Y is Length in this orientation
                        const h = size.z; // Z is Height (thickness)

                        // C. Simple Row Packing
                        if (curZ + w > 100) {
                            curZ = -100;
                            curX += 60 + l/2; // Advance row
                        }

                        // D. Position inside Bed (Local)
                        // Lift slightly (5 units) + half height
                        mesh.position.set(curX + l/2, 5 + h/2, curZ + w/2);
                        
                        // Randomize slightly
                        mesh.rotation.x = -Math.PI / 2; // Flat
                        mesh.rotation.z = (Math.random() - 0.5) * 0.1;

                        // E. CRITICAL: Parent to Bed -> Transform -> Parent to Scene
                        // This places the object correctly visually inside the truck, 
                        // but moves it to Scene graph so Physics (World Coords) works.
                        bed.add(mesh);
                        scene.attach(mesh);

                        // F. Точная AABB-коррекция позиции при спавне (Проблема №1 ТЗ).
                        // Устраняет левитацию, вычисляя фактический world minY всех вершин.
                        mesh.updateMatrixWorld(true);
                        const _spawnS = computeSupportAt(mesh, mesh.position.x, mesh.position.z, [mesh]);
                        mesh.position.y = _spawnS.supportY;
                        mesh.updateMatrixWorld(true);
                        const _spawnMinY = getExactWorldMinY(mesh);
                        if (_spawnMinY !== null) {
                            const _spawnSurfY = _spawnS.supportY + _spawnS.offs.minY - EPS_Y_MAIN;
                            mesh.position.y += (_spawnSurfY + EPS_Y_MAIN) - _spawnMinY;
                            mesh.updateMatrixWorld(true);
                        }

                        curZ += w + 10; // Advance column
                    }
                }
            });
        }

        // 3. Override the Supply Manager Button Logic
        // We modify the techOS function to use our new spawnPartsInTruck
        techOS.openOrderModal = function(tasks) {
            const modal = document.getElementById('modal-supply-order');
            const select = document.getElementById('input-order-select');
            
            select.innerHTML = '';
            if(!tasks || tasks.length === 0) {
                select.innerHTML = '<option>Нет доступных заказов</option>';
            } else {
                tasks.forEach(t => {
                    select.innerHTML += `<option value="${t.id}">${t.projectName} (от ${t.sender})</option>`;
                });
            }
            
            modal.classList.remove('hidden');
            
            const confirmBtn = document.getElementById('btn-confirm-delivery');
            
            // Восстанавливаем изначальное состояние кнопки при каждом открытии окна
            confirmBtn.innerHTML = 'ОФОРМИТЬ';
            confirmBtn.className = 'bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm font-bold px-6 py-2 rounded shadow-lg border-b-2 border-fuchsia-900 active:border-b-0 active:translate-y-[2px]';
            confirmBtn.disabled = false;
            
            confirmBtn.onclick = () => {
                const selectedId = parseInt(select.value);
                const task = tasks.find(t => t.id === selectedId);
                if(task) {
                    // CALL NEW LOADER
                    spawnPartsInTruck(task);
                    
                    const originalHtml = confirmBtn.innerHTML;
                    const originalClass = confirmBtn.className;
                    
                    confirmBtn.innerHTML = '✓ ОФОРМЛЕНО';
                    confirmBtn.className = 'bg-green-600 text-white text-sm font-bold px-6 py-2 rounded shadow-lg cursor-default';
                    confirmBtn.disabled = true;
                    
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        
                        confirmBtn.innerHTML = originalHtml;
                        confirmBtn.className = originalClass;
                        confirmBtn.disabled = false;

                        let toast = document.getElementById('supply-toast');
                        if (!toast) {
                            toast = document.createElement('div');
                            toast.id = 'supply-toast';
                            toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;font-weight:700;padding:12px 28px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:99999;font-size:14px;transition:opacity 0.5s;';
                            toast.innerHTML = '✓ Заказ успешно оформлен';
                            document.body.appendChild(toast);
                        }
                        toast.style.opacity = '1';
                        setTimeout(() => { toast.style.opacity = '0'; }, 3000);
                    }, 1200);
                }
            };
        };

          // UI Button Handlers - FIXED & ROBUST
        
        // Define styles for Active/Disabled states (Dark Mode optimized)
        const btnStyles = {
            active: ["bg-blue-700", "hover:bg-blue-600", "text-white", "border-blue-900", "shadow-lg", "cursor-pointer"],
            disabled: ["bg-slate-800", "text-slate-600", "border-slate-900", "cursor-not-allowed", "shadow-none"]
        };

        const startWorkBtn = document.getElementById('start-work-btn');

  const newStartBtn = startWorkBtn.cloneNode(true);
        startWorkBtn.parentNode.replaceChild(newStartBtn, startWorkBtn);

        newStartBtn.addEventListener('click', (e) => {
             const btn = e.currentTarget;
             
             // Check disabled state
             if (btn.disabled) return;

             if (!activeComputer) {
                 console.error("No active computer data!");
                 return;
             }

             console.log("Starting work for:", activeComputer.owner);

             // Helper to visually disable button
             const disableBtn = () => {
                 btn.disabled = true;
                 btnStyles.active.forEach(c => btn.classList.remove(c));
                 btnStyles.disabled.forEach(c => btn.classList.add(c));
             };

             // 1. Скрываем экран IDLE (обязательно)
             document.getElementById('screen-idle').classList.add('hidden');

             // 2. Маршрутизация по ролям
             if (activeComputer.owner === "Технолог") {
                 document.getElementById('screen-projects').classList.remove('hidden');
                 if(techOS && techOS.renderProjects) techOS.renderProjects();
                 disableBtn();
             } 
             else if (activeComputer.owner === "Плановик") {
                 // Для плановика пока тоже открываем проекты (заглушка)
                 document.getElementById('screen-projects').classList.remove('hidden');
                 disableBtn();
             }
             else if (activeComputer.owner === "Снабженец") {
                 // Открываем экран снабженца
                 document.getElementById('screen-supply-tasks').classList.remove('hidden');
                 if(techOS && techOS.renderSupplyTasks) techOS.renderSupplyTasks();
                 disableBtn();
             }
             else if (activeComputer.owner === "Начальник") {
                 document.getElementById('screen-supervisor').classList.remove('hidden');
                 disableBtn();
             }
             else if (activeComputer.owner === "Секретарь" || activeComputer.owner === "Архивариус") {
                 // У Секретаря и Архивариуса пока только экран-заглушка IDLE
                 document.getElementById('screen-idle').classList.remove('hidden');
                 disableBtn();
             }
             else {
                 console.warn("Unknown role:", activeComputer.owner);
                 // Fallback - return to idle
                 document.getElementById('screen-idle').classList.remove('hidden');
             }
        });

        document.getElementById('exit-comp-btn').addEventListener('click', () => {
             // Reset UI Screens
             techOS.switchScreen('screen-idle');
             window.isMapOpen = false;
             
             // Re-enable Start Button
             startWorkBtn.disabled = false;
             btnStyles.disabled.forEach(c => startWorkBtn.classList.remove(c));
             btnStyles.active.forEach(c => startWorkBtn.classList.add(c));

             exitComputerMode();
        });
         function renderMessages(role) {
            const container = document.getElementById('comp-messages');
            const messages = getMessagesForRole(role);
            
            container.innerHTML = messages.map(msg => `
                <div class="bg-slate-700/50 rounded-lg p-3 border ${msg.urgent ? 'border-red-500/50 bg-red-900/20' : 'border-slate-600'} hover:bg-slate-700 transition-colors cursor-pointer">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-cyan-400 font-medium text-sm flex items-center gap-1">
                            ${msg.urgent ? '<span class="text-red-400">⚠️</span>' : '<span>👤</span>'}
                            ${msg.from}
                        </span>
                        <span class="text-gray-500 text-xs">${msg.time}</span>
                    </div>
                    <p class="text-gray-300 text-sm">${msg.text}</p>
                </div>
            `).join('');
        }

            function enterComputerMode(compData) {
            console.log("Entering computer:", compData.owner); // Debug
            
            activeComputer = compData;
            cameraMode = 'TRANSITION';
            controls.unlock();
            
            // --- 1. СБРОС ИНТЕРФЕЙСА (Фикс бага "чужой экран") ---
            // Скрываем все рабочие экраны
            ['screen-projects', 'screen-parts', 'screen-supply-tasks', 'screen-supply-details', 'screen-supply-request', 'screen-cad', 'screen-supervisor', 'screen-map'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.classList.add('hidden');
            });
            // Показываем главный экран ожидания
            document.getElementById('screen-idle').classList.remove('hidden');

            // Сброс кнопки "Выполнить" в активное состояние (Хардкод классов для надежности)
            const startBtn = document.getElementById('start-work-btn');
            if(startBtn) {
                startBtn.disabled = false;
                // Удаляем классы отключения
                startBtn.classList.remove("bg-slate-800", "text-slate-600", "border-slate-900", "cursor-not-allowed", "shadow-none");
                // Добавляем классы активности
                startBtn.classList.add("bg-blue-700", "hover:bg-blue-600", "text-white", "border-blue-900", "shadow-lg", "cursor-pointer");
            }

            // --- 2. ТЕМЫ ОФОРМЛЕНИЯ (Цвета под роль) ---
            const uiRoot = document.getElementById('computer-ui');
            const role = compData.owner;
            
            const els = {
                headings: uiRoot.querySelectorAll('h2, h3'),
                idleIcon: document.querySelector('#screen-idle .rounded-full'),
                brand: uiRoot.querySelector('.font-bold.tracking-\\[0\\.3em\\] span'),
                owner: document.getElementById('comp-owner-name')
            };

            const palettes = {
                'Технолог': { text: 'text-cyan-400', dim: 'text-blue-200', brand: 'text-blue-500', icon: 'text-cyan-400' },
                'Плановик': { text: 'text-emerald-400', dim: 'text-emerald-200', brand: 'text-emerald-500', icon: 'text-emerald-400' },
                'Снабженец': { text: 'text-fuchsia-400', dim: 'text-fuchsia-200', brand: 'text-fuchsia-500', icon: 'text-fuchsia-400' },
                'Начальник': { text: 'text-amber-400', dim: 'text-amber-200', brand: 'text-amber-500', icon: 'text-amber-400' },
                'Секретарь': { text: 'text-indigo-400', dim: 'text-indigo-200', brand: 'text-indigo-500', icon: 'text-indigo-400' },
                'Архивариус': { text: 'text-slate-400', dim: 'text-slate-200', brand: 'text-slate-500', icon: 'text-slate-400' }
            };
            const colors = palettes[role] || palettes['Технолог'];

            const allColors = [
                'text-cyan-400','text-blue-200', 'text-cyan-500',
                'text-emerald-400','text-emerald-200', 'text-emerald-500',
                'text-fuchsia-400','text-fuchsia-200', 'text-fuchsia-500',
                'text-amber-400','text-amber-200', 'text-amber-500',
                'text-indigo-400','text-indigo-200', 'text-indigo-500',
                'text-slate-400','text-slate-200', 'text-slate-500'
            ];
            
            els.headings.forEach(h => {
                    allColors.forEach(c => h.classList.remove(c));
                    h.classList.add(colors.text);
            });
            if(els.brand) els.brand.className = colors.brand;
            if(els.owner) els.owner.className = `text-xs font-bold tracking-wider ${colors.dim}`;
            if(els.idleIcon) els.idleIcon.className = els.idleIcon.className.replace(/text-\w+-\d+/, '') + ` ${colors.icon}`;

            // --- 3. АНИМАЦИЯ И СТАРТ ---
            // Подсветка экрана в 3D мире
            if(compData.mesh && compData.mesh.userData.litMat) {
                compData.mesh.material = compData.mesh.userData.litMat;
            }

            // Камера приближается к монитору
            startTransition(camera.position.clone(), compData.viewPos, orbitControls.target.clone(), compData.lookPos, () => {
                cameraMode = 'COMPUTER';
                
                const compUI = document.getElementById('computer-ui');
                compUI.style.display = 'flex';
                
                document.getElementById('comp-owner-name').innerText = compData.owner;
                document.getElementById('comp-task-desc').innerText = compData.description;
            });
        }

        function exitComputerMode() {
            if (!activeComputer) return;
            
            // Выключаем подсветку экрана
            activeComputer.mesh.material = activeComputer.mesh.userData.originalMat;
            
            // Скрываем UI
            document.getElementById('computer-ui').style.display = 'none';

            // Позиция возврата - вычисляем вектор назад от монитора с учетом поворота стола
            const dir = new THREE.Vector3().subVectors(activeComputer.viewPos, activeComputer.lookPos).setY(0).normalize();
            const targetPos = activeComputer.viewPos.clone().addScaledVector(dir, 40); // Отступаем немного назад от стула
            targetPos.y = EYE_HEIGHT;
            
            const targetLook = activeComputer.lookPos.clone();
            targetLook.y = EYE_HEIGHT;

            cameraMode = 'TRANSITION';
            startTransition(camera.position.clone(), targetPos, camera.position.clone(), targetLook, () => {
                activeComputer = null;
                cameraMode = 'FPS';
                crosshair.style.display = 'block';
                controls.lock();
                
                // Обновляем позицию меша персонажа
                if (currentIdentity) {
                    currentIdentity.mesh.position.set(targetPos.x, window.getFloorHeightAt(targetPos.x, targetPos.z), targetPos.z);
                } else if (supervisorMesh) {
                    supervisorMesh.position.set(targetPos.x, window.getFloorHeightAt(targetPos.x, targetPos.z), targetPos.z);
                }
            });
        }

        // Helper to toggle roof opacity
        function setRoofVisibility(isGodMode) {
            roofObstacles.forEach(mesh => {
                if (isGodMode) {
                    mesh.material.transparent = true;
                    mesh.material.opacity = 0.15; // Почти прозрачная
                    mesh.material.depthWrite = false; // Чтобы видеть сквозь
                } else {
                    mesh.material.transparent = false; // Возвращаем как было (или true для стекла)
                    mesh.material.opacity = 1.0;
                    mesh.material.depthWrite = true;
                    
                    // Стекло (skylight) остаётся прозрачным
                    if (mesh.material.transparent === true && mesh.material.opacity < 1) {
                         mesh.material.transparent = true;
                         mesh.material.opacity = 0.35;
                    }
                }
                mesh.material.needsUpdate = true;
            });
        }

        function toggleGodMode() {
            if (transition.active) return;

            if (cameraMode === 'FPS') {
                enterGodMode();
            } else if (cameraMode === 'GOD') {
                // Return to previous body
                enterFPSMode();
            }
        }

        function enterGodMode() {
            resetWeldingState(); // сбросить маску, инструмент, дугу
            controls.unlock();
            cameraMode = 'TRANSITION';
            if (typeof window.applyActiveRemote === 'function') window.applyActiveRemote();
            crosshair.style.display = 'none';
            
            // Make Roof Transparent
            setRoofVisibility(true);

            // Show current body mesh at current location
            const pos = camera.position.clone();
            const lookDir = new THREE.Vector3();
            camera.getWorldDirection(lookDir);
            const rotY = Math.atan2(lookDir.x, lookDir.z);

            if (currentIdentity) {
                // We were a worker. Ensure their mesh is visible and positioned correct (it should be already)
                currentIdentity.mesh.visible = true;
                // Typically worker mesh is already there, camera was just attached or at same pos.
                // Reset worker visibility just in case.
                toggleWorkerVisibility(currentIdentity, true);
            } else {
                // We were supervisor. Spawn mesh.
                supervisorMesh.position.set(pos.x, window.getFloorHeightAt(pos.x, pos.z), pos.z);
                supervisorMesh.rotation.y = rotY;
                supervisorMesh.visible = true;
                supervisorMesh.userData.dot.visible = true;
            }

            // Show Dots
            workers.forEach(w => {
                if(w !== currentIdentity) w.dot.visible = true;
                if(currentIdentity) w.dot.visible = true; // Show dot for self if leaving body
            });
            
            // Animate Camera to Sky
            const startPos = camera.position.clone();
            const endPos = startPos.clone().add(new THREE.Vector3(0, 400, 200)); // Go Up and Back
            
            // Look target
            const startLook = new THREE.Vector3().addVectors(camera.position, lookDir);
            const endLook = new THREE.Vector3(startPos.x, 0, startPos.z); // Look at where we were

            startTransition(startPos, endPos, startLook, endLook, () => {
                cameraMode = 'GOD';
                orbitControls.object = camera;
                orbitControls.target.copy(endLook);
                orbitControls.enabled = true;
                orbitControls.update();
            });
        }

        // Глобальная функция для получения высоты пола
        window.getFloorHeightAt = function(posX, posZ) {
            let floorHeight = 0;
            // Платформа стенда: ширина 1300 (X от 2950 до 4250), длина 1500 (Z от 0 до 1500)
            if (posZ >= 0 && posZ <= 1500) {
                if (posX >= 2950 && posX <= 4250) {
                    floorHeight = 40; // Полностью на стенде
                } else if (posX >= 2830 && posX < 2950 && posZ >= 800 && posZ <= 1100) {
                    // На ступеньках сбоку: (ширина ступенек 120 (3 * 40), X от 2830 до 2950, Z-лестницы от 800 до 1100)
                    floorHeight = ((posX - 2830) / 120) * 40;
                }
            }
            return floorHeight;
        };

        // Returns world-space Y of the worker's eye level.
        function getWorkerEyeHeight(mesh) {
            let baseHeight = EYE_HEIGHT;
            let meshY = mesh ? mesh.position.y : 0;

            const posX = mesh ? mesh.position.x : (typeof camera !== 'undefined' ? camera.position.x : 0);
            const posZ = mesh ? mesh.position.z : (typeof camera !== 'undefined' ? camera.position.z : 0);
            
            // Если у меша y = 0, но мы находимся на стенде, используем расчетную высоту пола.
            // Но если мы начнем реально менять mesh.position.y на floorHeight в main_loop,
            // то meshY уже будет равен floorHeight! Поэтому мы просто берем максимум.
            const floorHeight = window.getFloorHeightAt(posX, posZ);
            const actualY = Math.max(meshY, floorHeight);

            if (mesh && mesh.userData && mesh.userData.headBaseY != null) {
                const scaleY = mesh.scale ? mesh.scale.y : 1;
                baseHeight = actualY + mesh.userData.headBaseY * scaleY;
            } else {
                baseHeight = actualY + EYE_HEIGHT;
            }

            // Функция приседания: если зажат Shift (левый или правый), уменьшаем высоту камеры
            if (typeof keyState !== 'undefined' && (keyState['ShiftLeft'] || keyState['ShiftRight'])) {
                baseHeight -= 60; // Уменьшение роста на 60 см (приседание)
            }
            return baseHeight;
        }

        function possess(target) {
            if (cameraMode !== 'GOD' || transition.active) return;
            
            cameraMode = 'TRANSITION';
            orbitControls.enabled = false;
            
            // Determine target pos
            let targetMesh;
            if (target === 'supervisor') {
                targetMesh = supervisorMesh;
                currentIdentity = null;
                identitySpan.innerText = "Начальник (Supervisor)";
            } else {
                targetMesh = target.mesh;
                currentIdentity = target;
                identitySpan.innerText = target.name + " (" + (target.type === '1' ? 'Worker' : 'Staff') + ")";
            }

            const endPos = targetMesh.position.clone();
            endPos.y = getWorkerEyeHeight(targetMesh); 

            // Camera start
            const startPos = camera.position.clone();
            
            // Look directions
            const startLook = orbitControls.target.clone(); // Where we were looking
            // Look forward from the mesh
            const meshForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), targetMesh.rotation.y);
            const endLook = endPos.clone().add(meshForward);

            startTransition(startPos, endPos, startLook, endLook, () => {
                enterFPSMode(true); // Skip transition in helper, we just did it
                // Hide mesh of possessed
                if (target === 'supervisor') {
                    supervisorMesh.visible = false;
                    supervisorMesh.userData.dot.visible = false;
                } else {
                    toggleWorkerVisibility(target, false);
                }
            });
        }

        function enterFPSMode(skipTransition = false) {
            // Restore Roof Opacity
            setRoofVisibility(false);

            // Helper to hide dots and lock controls
            workers.forEach(w => w.dot.visible = false);
            if(supervisorMesh) supervisorMesh.userData.dot.visible = false;

            if (skipTransition) {
                cameraMode = 'FPS';
                crosshair.style.display = 'block';
                controls.lock();
                if (typeof window.applyActiveRemote === 'function') window.applyActiveRemote();
                
                // If returning to a body, ensure rotation is set correctly for PointerLock
                // PointerLockControls usually resets based on camera.rotation. 
                // We just need to make sure camera.rotation matches the mesh orientation we flew into.
                
                return;
            }

            // If we are just toggling 'T' back to the SAME body
            cameraMode = 'TRANSITION';
            orbitControls.enabled = false;

            let targetMesh = currentIdentity ? currentIdentity.mesh : supervisorMesh;
            const endPos = targetMesh.position.clone();
            endPos.y = getWorkerEyeHeight(targetMesh);

            const meshForward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), targetMesh.rotation.y);
            const endLook = endPos.clone().add(meshForward);

            startTransition(camera.position.clone(), endPos, orbitControls.target.clone(), endLook, () => {
                cameraMode = 'FPS';
                crosshair.style.display = 'block';
                controls.lock();
                // Hide body
                if (currentIdentity) toggleWorkerVisibility(currentIdentity, false);
                else supervisorMesh.visible = false;
                if (typeof window.applyActiveRemote === 'function') window.applyActiveRemote();
            });
        }

        function toggleWorkerVisibility(worker, visible) {
            // We want to hide the head/body but maybe keep shadow casting? 
            // Simplest is traverse and set visible.
            // But we specifically want to see OTHERS.
            // When possessed, we hide the group mesh except maybe hands if we had FPS hands (we don't).
            worker.mesh.visible = visible;
            worker.dot.visible = visible && (cameraMode === 'GOD');
        }

        function startTransition(sPos, ePos, sLook, eLook, cb) {
            transition.active = true;
            transition.startTime = performance.now();
            transition.startPos.copy(sPos);
            transition.endPos.copy(ePos);
            transition.startLook.copy(sLook);
            transition.endLook.copy(eLook);
            transition.onComplete = cb;
        }

        // =====================================================
        // 📚 АРХИВ: ИНТЕРАКТИВНЫЕ СТЕЛЛАЖИ → 3D-КНИГА → ЧТЕНИЕ
        // ЛКМ по стеллажу → камера приближается, книга «выезжает»
        // из стеллажа и встаёт перед экраном. Кнопки ‹ › листают
        // книги, «Взять книгу» кладёт её в инвентарь, цифра слота
        // открывает чтение.
        // =====================================================

        // --- Каталог книг архива (пока одна) ---
        const ARCHIVE_BOOKS = [
            {
                id: 'weld_setup',
                title: 'ОСНОВЫ СВАРКИ',
                title2: 'ТОК И НАПРЯЖЕНИЕ',
                subtitle: 'Справочное руководство · РДС',
                coverColor: '#1e40af',
                coverColor2: '#1e3a8a',
                accent: '#60a5fa',
                contentHTML: (function() {
                    return '' +
                    '<section class="rb-hero">' +
                        '<span class="rb-hero-tag">РДС / MMA</span>' +
                        '<h1>Настройка аппарата и дефекты шва</h1>' +
                        '<p class="rb-lead">Внешний вид и надежность сварного шва зависят от баланса двух параметров: <b>силы тока (А)</b> и <b>напряжения (В)</b>. В этом руководстве разобрана базовая теория и способы устранения основных дефектов.</p>' +
                    '</section>' +
                    '<div class="rb-analogy" style="background:rgba(59, 130, 246, 0.1); border-left:4px solid #3b82f6; padding:16px; margin:0 24px 24px 24px; border-radius:4px; font-size:15px; line-height:1.6;">' +
                        '<b style="color:#3b82f6; font-size:16px; display:block; margin-bottom:8px;">Теория: Аналогия «водопроводный шланг»</b>' +
                        'Представьте, что сварочный аппарат — это шланг, которым вы размываете землю. Электрод — наконечник шланга, а жидкий металл — лужа воды.<br><br>' +
                        '<b>Сила тока (Амперы) = Напор воды.</b> Отвечает за глубину проплавления и объем выделяемого тепла. Сильный напор вымывает глубокую яму (прожог), слабый — просто растекается лужей поверх земли (непровар).<br><br>' +
                        '<b>Напряжение дуги (Вольты) = Ширина распылителя.</b> Напряжение напрямую зависит от длины дуги (расстояния от электрода до детали). Короткая дуга бьет точечно и плотно. Длинная дуга (высокое напряжение) рассеивает струю — шов получается широким, плоским, а капли сдувает в стороны (брызги).' +
                    '</div>' +
                    '<section class="rb-section">' +
                        '<div class="rb-section-head"><span class="rb-section-num">1</span><h2>Залипание электрода</h2></div>' +
                        '<p class="rb-section-desc">Короткое замыкание: электрод приваривается к детали, дуга гаснет, стержень раскаляется.</p>' +
                        '<div class="rb-params">' +
                            '<div class="rb-param lo"><div class="rb-param-label">Причины</div><p>• <b>Слишком низкий ток:</b> металлу не хватает энергии для плавления.<br>• <b>Слишком короткая дуга:</b> вы уперлись кончиком электрода прямо в деталь.</p></div>' +
                            '<div class="rb-param opt"><div class="rb-param-label">Как решить</div><p>1. <b>Оторвите электрод:</b> быстро раскачайте его (клавиши WASD).<br>2. <b>Увеличьте силу тока (А)</b> на панели аппарата.<br>3. <b>Держите дистанцию:</b> оптимальная длина дуги равна диаметру электрода (около 2-3 мм).</p></div>' +
                        '</div>' +
                    '</section>' +
                    '<section class="rb-section">' +
                        '<div class="rb-section-head"><span class="rb-section-num">2</span><h2>Непровар и высокий валик</h2></div>' +
                        '<p class="rb-section-desc">Шов ложится на поверхность узкой высокой "горбушкой", края металла не сплавились. Соединение очень хрупкое.</p>' +
                        '<div class="rb-params">' +
                            '<div class="rb-param lo"><div class="rb-param-label">Причины</div><p>• <b>Недостаток тока:</b> слабая дуга не может проплавить кромки деталей.<br>• <b>Высокая скорость:</b> вы ведете электрод слишком быстро.</p></div>' +
                            '<div class="rb-param opt"><div class="rb-param-label">Как решить</div><p>1. <b>Увеличьте ток (А).</b><br>2. <b>Замедлитесь:</b> дайте сварочной ванне время разлиться и сплавить края деталей.</p></div>' +
                        '</div>' +
                    '</section>' +
                    '<section class="rb-section">' +
                        '<div class="rb-section-head"><span class="rb-section-num">3</span><h2>Прожог и сильное разбрызгивание</h2></div>' +
                        '<p class="rb-section-desc">Металл перегревается и плавится насквозь (образуется дыра). Во все стороны обильно летят искры.</p>' +
                        '<div class="rb-params">' +
                            '<div class="rb-param hi"><div class="rb-param-label">Причины</div><p>• <b>Слишком высокий ток:</b> чрезмерное выделение тепла.<br>• <b>Медленное движение:</b> вы слишком долго задерживаете дугу на одном месте.</p></div>' +
                            '<div class="rb-param opt"><div class="rb-param-label">Как решить</div><p>1. <b>Уменьшите силу тока (А).</b><br>2. <b>Двигайтесь быстрее:</b> не давайте металлу перегреваться.</p></div>' +
                        '</div>' +
                    '</section>' +
                    '<section class="rb-section">' +
                        '<div class="rb-section-head"><span class="rb-section-num">4</span><h2>Широкий плоский шов, поры и ожоги</h2></div>' +
                        '<p class="rb-section-desc">Шов растекается, дуга гуляет и "завывает". Вокруг шва появляются темно-синие ожоги (цвета побежалости), а внутри металла — пузыри (пористость).</p>' +
                        '<div class="rb-params">' +
                            '<div class="rb-param hi"><div class="rb-param-label">Причины</div><p>• <b>Длинная дуга (Завышенное напряжение):</b> электрод поднят слишком высоко. Защитный газ рассеивается, в ванну попадает кислород. Широкий конус дуги перегревает металл вокруг.</p></div>' +
                            '<div class="rb-param opt"><div class="rb-param-label">Как решить</div><p>1. <b>Опустите электрод ниже</b>, чтобы дуга стала короткой и плотной.<br>2. <b>Уменьшите напряжение (В)</b> на аппарате.</p></div>' +
                        '</div>' +
                    '</section>' +
                    '<section class="rb-section">' +
                        '<div class="rb-section-head"><span class="rb-section-num">5</span><h2>Неправильный диаметр электрода</h2></div>' +
                        '<p class="rb-section-desc">Толщина электрода должна строго соответствовать толщине свариваемого металла. Ошибка нарушает тепловой баланс ванны.</p>' +
                        '<div class="rb-params">' +
                            '<div class="rb-param lo"><div class="rb-param-label">Слишком тонкий</div><p>• <b>Перегрев стержня:</b> от рабочего тока тонкий электрод раскаляется докрасна и быстро обгорает.<br>• <b>Слабый шов:</b> не хватает объема наплавленного металла для надежного соединения толстых деталей.</p></div>' +
                            '<div class="rb-param hi"><div class="rb-param-label">Слишком толстый</div><p>• <b>Прожог:</b> толстый электрод требует высокого тока, который прожигает тонкий металл насквозь.<br>• <b>Залипание:</b> при попытке варить на малом токе дуга нестабильна, электрод липнет, а шов ложится высоким горбом (непровар).</p></div>' +
                        '</div>' +
                    '</section>' +
                    '<section class="rb-section">' +
                        '<div class="rb-table-wrap">' +
                            '<div class="rb-table-title">Таблица базовых настроек (РДС / MMA)</div>' +
                            '<div class="rb-table-desc">Для получения качественного соединения используйте следующие эталонные соотношения. Помните: чем толще металл, тем больше нужно тепла (силы тока) для его проплавления, а значит, требуется электрод большего диаметра.</div>' +
                            '<table class="rb-table"><thead><tr>' +
                                '<th>Толщина металла (мм)</th><th>Ø электрода (мм)</th><th>Сила тока (А)</th><th>Напряжение дуги (В)</th>' +
                            '</tr></thead><tbody>' +
                                '<tr><td>2.0</td><td>2.5</td><td>50 - 70</td><td>20 - 22</td></tr>' +
                                '<tr><td>3.0 - 4.0</td><td>3.0</td><td>80 - 110</td><td>22 - 24</td></tr>' +
                                '<tr><td>5.0 - 6.0</td><td>4.0</td><td>130 - 160</td><td>24 - 26</td></tr>' +
                                '<tr><td>8.0 - 10.0</td><td>4.0 - 5.0</td><td>160 - 200</td><td>24 - 28</td></tr>' +
                                '<tr><td>12.0 - 16.0</td><td>5.0</td><td>180 - 220</td><td>26 - 28</td></tr>' +
                                '<tr><td>18.0 - 20.0</td><td>5.0 - 6.0</td><td>200 - 250</td><td>28 - 30</td></tr>' +
                            '</tbody></table>' +
                        '</div>' +
                    '</section>';
                })()
            }
        ];

        // --- Состояние режима архива ---
        let archiveBrowseIndex = 0;
        let archiveBookMesh = null;        // 3D-книга (child of camera)
        let archiveCoverMat = null;        // материал-обложка (texture обновляется при листании)
        let archiveSpineMat = null;        // материал корешка/обложки (цвет)
        let archiveEmergeT = 0;            // прогресс анимации «выезда» книги 0..1
        let archiveReturn = null;          // {pos, look} для возврата в FPS
        let archiveActive = false;         // книга показана (после завершения перехода)

        // --- Инвентарь книг: slotIndex -> bookId (слоты 2..4, чтобы не конфликтовать со сваркой) ---
        const bookInventory = {};
        let isReadingBook = false;
        const BOOK_SLOTS = [2, 3, 4];

        // Рисует дизайн документа на canvas (стиль A4 + дашборд-карточка)
        function _makeBookCoverTexture(book) {
            const c = document.createElement('canvas');
            c.width = 720; c.height = 960;
            const x = c.getContext('2d');
            
            // Фон обложки (чистый лист А4)
            x.fillStyle = '#ffffff'; 
            x.fillRect(0, 0, 720, 960);

            // Декоративный паттерн (точечная сетка)
            x.fillStyle = '#f1f5f9';
            for(let i=15; i<720; i+=30) {
                for(let j=15; j<960; j+=30) {
                    x.beginPath(); x.arc(i, j, 2, 0, Math.PI*2); x.fill();
                }
            }
            
            // Ярлык-маркер (Tag) сверху-слева
            x.fillStyle = book.coverColor || '#1e40af';
            x.beginPath();
            if (x.roundRect) {
                x.roundRect(0, 0, 380, 100, [0, 0, 40, 0]);
            } else {
                x.rect(0, 0, 380, 100);
            }
            x.fill();
            
            x.fillStyle = '#ffffff';
            x.font = 'bold 20px "Inter", sans-serif';
            x.fillText('Документация', 16, 34);
            x.font = 'bold 36px "Inter", sans-serif';
            
            // Заголовок
            x.fillStyle = '#0f172a';
            x.font = 'bold 32px "Inter", sans-serif';
            x.fillText(book.title, 30, 120);
            x.font = '800 64px "Inter", sans-serif';
            x.fillText(book.title, 60, 240);
            
            x.fillStyle = '#3b82f6';
            x.font = 'bold 22px "Inter", sans-serif';
            _wrapText(x, book.title2, 30, 160, 300, 28);
            x.font = 'bold 44px "Inter", sans-serif';
            _wrapText(x, book.title2, 60, 320, 600, 56);
            
            // Подзаголовок
            x.fillStyle = '#64748b';
            x.font = '15px "Inter", sans-serif';
            _wrapText(x, book.subtitle, 30, 230, 300, 22);
            x.font = '32px "Inter", sans-serif';
            _wrapText(x, book.subtitle, 60, 460, 600, 44);
            
            // Декоративные линии текста для стилистики дашборда/документа
            x.fillStyle = '#f1f5f9';
            x.fillRect(30, 290, 300, 12);
            x.fillRect(30, 320, 240, 12);
            x.fillRect(30, 350, 270, 12);
            x.fillRect(30, 380, 210, 12);
            x.fillStyle = '#e2e8f0';
            x.fillRect(60, 580, 600, 24);
            x.fillRect(60, 640, 480, 24);
            x.fillRect(60, 700, 540, 24);
            x.fillRect(60, 760, 420, 24);

            const tex = new THREE.CanvasTexture(c);
            tex.anisotropy = 4;
            return tex;
        }

        function _wrapText(ctx, text, cx, cy, maxW, lh) {
            const words = (text || '').split(' ');
            let line = '', y = cy;
            for (const w of words) {
                const test = line ? line + ' ' + w : w;
                if (ctx.measureText(test).width > maxW && line) {
                    ctx.fillText(line, cx, y); line = w; y += lh;
                } else line = test;
            }
            if (line) ctx.fillText(line, cx, y);
        }

        // Строит 3D-документ (стопка А4 с ярлыком) и прикрепляет её к камере
        function _createArchiveBookMesh() {
            const grp = new THREE.Group();
            const W = 21, H = 29.7; // Пропорции А4 масштабированы для камеры

            // Стопка бумаги (многослойная, эффект рассыпанных листов)
            const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
            const numSheets = 6;
            
            for (let i = 0; i < numSheets; i++) {
                const sheet = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), paperMat);
                
                // Легкий беспорядок в стопке
                const rX = (Math.random() - 0.5) * 0.4;
                const rY = (Math.random() - 0.5) * 0.4;
                const rZ = (Math.random() - 0.5) * 0.03;
                sheet.position.set(rX, rY, -i * 0.2); 
                sheet.rotation.z = rZ;

                // Фейковая тень под листом
                if (i > 0) {
                    const shadow = new THREE.Mesh(
                        new THREE.PlaneGeometry(W, H),
                        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.06 })
                    );
                    shadow.position.set(0.2, -0.2, 0.03);
                    sheet.add(shadow);
                }

                // На верхнем листе рисуем интерфейс и крепим зажим
                if (i === 0) {
                    archiveCoverMat = new THREE.MeshBasicMaterial({ map: _makeBookCoverTexture(ARCHIVE_BOOKS[0]), transparent: false });
                    const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(W, H), archiveCoverMat);
                    coverFace.position.set(0, 0, 0.026);
                    sheet.add(coverFace);

                    // Скрепка-зажим (Binder clip) сверху слева
                    const clipGroup = new THREE.Group();
                    clipGroup.position.set(-W/2 + 2.5, H/2 - 2, 0.1); 
                    sheet.add(clipGroup);

                    // Металлический корпус
                    const clipBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.8 });
                    const clipBody = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.8), clipBodyMat);
                    clipGroup.add(clipBody);

                    // Хромированные "усики"
                    const wireMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.2, metalness: 0.9 });
                    const wireGeo = new THREE.CylinderGeometry(0.15, 0.15, 3.5, 8);
                    
                    const w1 = new THREE.Mesh(wireGeo, wireMat); w1.position.set(-0.8, 2.5, 0.2); w1.rotation.z = 0.2; clipGroup.add(w1);
                    const w2 = new THREE.Mesh(wireGeo, wireMat); w2.position.set(0.8, 2.5, 0.2); w2.rotation.z = -0.2; clipGroup.add(w2);
                    const w3 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 8), wireMat);
                    w3.rotation.z = Math.PI/2; w3.position.set(0, 4.1, 0.2); clipGroup.add(w3);
                }
                grp.add(sheet);
            }

            // Цветной ярлык-маркер (Tag) сверху слева
            const tagW = W * 0.45;
            const tagH = 4;
            const tagMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.5 });
            const tag = new THREE.Mesh(new THREE.BoxGeometry(tagW, tagH, 1.5 + 0.2), tagMat);
            tag.position.set(-W/2 + tagW/2, H/2 - tagH/2, 0);
            grp.add(tag);
            
            grp.userData.isArchiveBook = true;
            grp.userData.tagMesh = null; // Управление цветом теперь вшито в canvas texture
            grp.traverse(o => { o.raycast = function () {}; o.userData.isArchiveBook = true; });
            camera.add(grp);
            return grp;
        }

        // Обновляет обложку под текущий документ
        function _refreshArchiveBookCover() {
            const book = ARCHIVE_BOOKS[archiveBrowseIndex];
            if (!book) return;
            if (archiveCoverMat) {
                if (archiveCoverMat.map) archiveCoverMat.map.dispose();
                archiveCoverMat.map = _makeBookCoverTexture(book);
                archiveCoverMat.needsUpdate = true;
            }
            if (archiveBookMesh && archiveBookMesh.userData.tagMesh) {
                archiveBookMesh.userData.tagMesh.material.color.set(book.coverColor);
            }
            archiveEmergeT = 0; // переиграть «выезд» при смене книги
        }

        // Вход в режим архива по клику на стеллаж
        function enterArchiveView(rack) {
            if (transition.active) return;
            if (typeof resetWeldingState === 'function') resetWeldingState();

            archiveReturn = {
                pos: camera.position.clone(),
                look: camera.position.clone().add(_archiveForward())
            };

            cameraMode = 'TRANSITION';
            controls.unlock();
            crosshair.style.display = 'none';
            archiveActive = false;
            archiveBrowseIndex = 0;

            startTransition(camera.position.clone(), rack.viewPos.clone(),
                            archiveReturn.look.clone(), rack.lookPos.clone(), () => {
                cameraMode = 'ARCHIVE';
                if (!archiveBookMesh) archiveBookMesh = _createArchiveBookMesh();
                _refreshArchiveBookCover();
                archiveBookMesh.visible = true;
                archiveEmergeT = 0;
                archiveActive = true;
                _showArchiveUI(true);
                _updateArchiveUI();
            });
        }

        function _archiveForward() {
            const d = new THREE.Vector3();
            camera.getWorldDirection(d);
            return d;
        }

        function exitArchiveView() {
            if (!archiveReturn || transition.active) return;
            archiveActive = false;
            _showArchiveUI(false);
            if (archiveBookMesh) archiveBookMesh.visible = false;

            cameraMode = 'TRANSITION';
            startTransition(camera.position.clone(), archiveReturn.pos.clone(),
                            camera.position.clone().add(_archiveForward()), archiveReturn.look.clone(), () => {
                cameraMode = 'FPS';
                crosshair.style.display = 'block';
                controls.lock();
                archiveReturn = null;
            });
        }

        function archiveBrowse(dir) {
            const n = ARCHIVE_BOOKS.length;
            const next = archiveBrowseIndex + dir;
            if (next < 0 || next >= n) return;
            archiveBrowseIndex = next;
            _refreshArchiveBookCover();
            _updateArchiveUI();
        }

        function toggleCurrentBook() {
            const book = ARCHIVE_BOOKS[archiveBrowseIndex];
            if (!book) return;
            // Находим слот, где лежит документ
            const ownedSlot = Object.keys(bookInventory).find(key => bookInventory[key] === book.id);
            if (ownedSlot) {
                // Документ уже есть - возвращаем на полку
                delete bookInventory[ownedSlot];
                if (typeof renderInventories === 'function') renderInventories();
                _archiveFlash('Документ возвращен на стеллаж');
            } else {
                // Взять в свободный слот
            const slot = BOOK_SLOTS.find(s => !bookInventory[s]);
            if (slot === undefined) { _archiveFlash('Инвентарь заполнен'); return; }
            bookInventory[slot] = book.id;
            if (typeof renderInventories === 'function') renderInventories();
                _archiveFlash('Документ добавлен в инвентарь [' + slot + ']');
            }
            _updateArchiveUI();
        }

        // --- UI режима архива ---
        function _showArchiveUI(show) {
            const ui = document.getElementById('archiveUI');
            if (ui) ui.style.display = show ? 'block' : 'none';
        }

        function _updateArchiveUI() {
            const book = ARCHIVE_BOOKS[archiveBrowseIndex];
            const titleEl = document.getElementById('arch-title');
            const subEl = document.getElementById('arch-subtitle');
            const counterEl = document.getElementById('arch-counter');
            const prevEl = document.getElementById('arch-prev');
            const nextEl = document.getElementById('arch-next');
            const takeEl = document.getElementById('arch-take');
            if (titleEl) titleEl.innerText = (book.title + ' ' + book.title2).trim();
            if (subEl) subEl.innerText = book.subtitle;
            if (counterEl) counterEl.innerText = (archiveBrowseIndex + 1) + ' / ' + ARCHIVE_BOOKS.length;
            if (prevEl) prevEl.classList.toggle('disabled', archiveBrowseIndex === 0);
            if (nextEl) nextEl.classList.toggle('disabled', archiveBrowseIndex === ARCHIVE_BOOKS.length - 1);
            if (takeEl) {
                const owned = Object.values(bookInventory).includes(book.id);
                takeEl.innerText = owned ? '↶ Положить на место' : '＋ Взять документ';
                takeEl.classList.toggle('owned', owned);
            }
        }

        let _archiveFlashTimer = null;
        function _archiveFlash(msg) {
            const el = document.getElementById('arch-hint');
            if (!el) return;
            el.innerText = msg;
            el.classList.add('show');
            clearTimeout(_archiveFlashTimer);
            _archiveFlashTimer = setTimeout(() => el.classList.remove('show'), 2600);
        }

        // Анимация книги в режиме архива (вызывается из animate)
        const _easeOutCubic = t => 1 - Math.pow(1 - t, 3);
        function updateArchiveBook(delta, tSec) {
            if (!archiveActive || !archiveBookMesh) return;
            archiveEmergeT = Math.min(1, archiveEmergeT + delta * 2.0);
            const e = _easeOutCubic(archiveEmergeT);
            // «Выезд» из стеллажа: из глубины (-z) и снизу к центру перед экраном
            const sx = -2,  ex = 0;
            const sy = -14, ey = -3.5;
            const sz = -78, ez = -46;
            const float = Math.sin(tSec * 1.4) * 0.5 * e; // лёгкое парение после выезда
            archiveBookMesh.position.set(
                sx + (ex - sx) * e,
                sy + (ey - sy) * e + float,
                sz + (ez - sz) * e
            );
            // Поворот: книга разворачивается обложкой к экрану
            const sRotY = 1.25, eRotY = 0.42;
            archiveBookMesh.rotation.set(
                -0.06,
                sRotY + (eRotY - sRotY) * e,
                0.04
            );
        }

        // --- ЧТЕНИЕ КНИГИ (оверлей) ---
        function openBookReader(bookId) {
            const book = ARCHIVE_BOOKS.find(b => b.id === bookId);
            if (!book) return;
            const ui = document.getElementById('bookReaderUI');
            const bodyEl = document.getElementById('reader-body');
            const badgeEl = document.querySelector('.reader-badge');
            if (badgeEl) badgeEl.innerText = 'FactoryOS · ' + (book.subtitle || 'Справочник');
            if (bodyEl) bodyEl.innerHTML = book.contentHTML;
            if (bodyEl) bodyEl.scrollTop = 0;
            if (ui) ui.style.display = 'flex';
            isReadingBook = true;
            crosshair.style.display = 'none';
            if (controls.isLocked) controls.unlock();
        }

        function closeBookReader() {
            const ui = document.getElementById('bookReaderUI');
            if (ui) ui.style.display = 'none';
            isReadingBook = false;
            // Возврат к управлению, если мы в обычном режиме ходьбы
            if (cameraMode === 'FPS') {
                crosshair.style.display = 'block';
                controls.lock();
            }
        }

        // --- Клик по стеллажу архива (только в режиме ходьбы) ---
        document.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (typeof cameraMode === 'undefined' || cameraMode !== 'FPS' || !controls.isLocked) return;
            if (typeof archiveRacks === 'undefined' || archiveRacks.length === 0) return;

            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            const meshes = archiveRacks.map(r => r.group);
            const hits = raycaster.intersectObjects(meshes, true);
            if (hits.length === 0 || hits[0].distance > 450) return;

            // Поднимаемся к корневой группе стеллажа
            let obj = hits[0].object;
            while (obj && !(obj.userData && obj.userData.isArchiveRack && archiveRacks.some(r => r.group === obj))) {
                obj = obj.parent;
            }
            const rack = archiveRacks.find(r => r.group === obj);
            if (rack) enterArchiveView(rack);
        });

        // --- Кнопки UI архива и читалки ---
        document.getElementById('arch-prev')?.addEventListener('click', () => archiveBrowse(-1));
        document.getElementById('arch-next')?.addEventListener('click', () => archiveBrowse(1));
        document.getElementById('arch-take')?.addEventListener('click', toggleCurrentBook);
        document.getElementById('arch-exit')?.addEventListener('click', exitArchiveView);
        document.getElementById('reader-close')?.addEventListener('click', closeBookReader);
