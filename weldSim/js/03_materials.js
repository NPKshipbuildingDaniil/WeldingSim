// --- High Detail Assets Helpers ---
               function createMaterials() {
            // 1. Calmer Metal - ОПТИМИЗАЦИЯ: Уменьшено разрешение текстур (64x64)
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = '#A8AEB8'; ctx.fillRect(0,0,64,64);
            // Noise
            for(let i=0; i<50; i++) {
                ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.1})`;
                ctx.fillRect(Math.random()*64, Math.random()*64, 2, 2);
            }
            const metalMap = new THREE.CanvasTexture(canvas);

            // Concrete Texture - ОПТИМИЗАЦИЯ: (128x128)
            const concCanvas = document.createElement('canvas');
            concCanvas.width = 128; concCanvas.height = 128;
            const cCtx = concCanvas.getContext('2d');
            cCtx.fillStyle = '#E8ECF1'; cCtx.fillRect(0,0,128,128);
            for(let i=0; i<2000; i++) {
                cCtx.fillStyle = `rgba(125,138,154,${Math.random()*0.2})`;
                cCtx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
            }
            const concMap = new THREE.CanvasTexture(concCanvas);
            concMap.wrapS = concMap.wrapT = THREE.RepeatWrapping;

            // Corrugated Wall Texture - ОПТИМИЗАЦИЯ: (32x32)
            const corrCanvas = document.createElement('canvas');
            corrCanvas.width = 32; corrCanvas.height = 32;
            const coCtx = corrCanvas.getContext('2d');
            const grad = coCtx.createLinearGradient(0,0,32,0);
            for(let i=0; i<=4; i++) {
                const color = i%2===0 ? '#E8ECF1' : '#D0D8E1'; 
                grad.addColorStop(i/4, color);
            }
            coCtx.fillStyle = grad;
            coCtx.fillRect(0,0,32,32);
            const corrMap = new THREE.CanvasTexture(corrCanvas);
            corrMap.wrapS = THREE.RepeatWrapping;
            corrMap.wrapT = THREE.RepeatWrapping;
            corrMap.repeat.set(1, 1);

            // Grass Texture for outside
            const grassCanvas = document.createElement('canvas');
            grassCanvas.width = 128; grassCanvas.height = 128;
            const gCtx = grassCanvas.getContext('2d');
            gCtx.fillStyle = '#3a5e3a'; // Base grass color
            gCtx.fillRect(0,0,128,128);
            for(let i=0; i<4000; i++) {
                gCtx.fillStyle = `rgba(0,0,0,${Math.random()*0.1})`;
                gCtx.fillRect(Math.random()*128, Math.random()*128, 1, 1);
            }
            const grassMap = new THREE.CanvasTexture(grassCanvas);
            grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
            grassMap.repeat.set(100, 100);

            return {
                steel: new THREE.MeshStandardMaterial({ color: 0x7D8A9A, map: metalMap, roughness: 0.4, metalness: 0.6 }),
                yellow: new THREE.MeshStandardMaterial({ color: 0xE6A817, roughness: 0.5, metalness: 0.2 }),
                concrete: new THREE.MeshStandardMaterial({ map: concMap, roughness: 0.8 }),
                wall: new THREE.MeshStandardMaterial({ map: corrMap, color: 0xffffff, side: THREE.DoubleSide, roughness: 0.3 }),
                // Dark strip material (Matte Dark Grey)
                wallBase: new THREE.MeshStandardMaterial({ color: 0x7D8A9A, roughness: 0.8 }), 
                skylight: new THREE.MeshStandardMaterial({ color: 0x5AAFDD, roughness: 0.1, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
                light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.3 }),
                grass: new THREE.MeshStandardMaterial({ map: grassMap, roughness: 0.95 })
            };
        }