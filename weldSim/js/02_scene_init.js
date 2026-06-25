// --- Init Scene ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xE8ECF1);
        scene.fog = new THREE.Fog(0xE8ECF1, 500, 5000);

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 8000);
        
        const renderer = new THREE.WebGLRenderer({ antialias: false }); // antialias=false: +30-40% FPS
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // ограничение HiDPI
        // Тени полностью отключены для максимальной производительности
        renderer.shadowMap.enabled = false;
        document.body.appendChild(renderer.domElement);

        // --- Lights & Atmosphere ---
        scene.background = new THREE.Color(0xE8ECF1);
        scene.fog = new THREE.Fog(0xE8ECF1, 200, 7000);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(3000, 8000, 2000);
        sun.castShadow = false; // тени отключены
        scene.add(sun);

        // --- Post Processing ---
        const composer = new window.EffectComposer(renderer);
        const renderPass = new window.RenderPass(scene, camera);
        composer.addPass(renderPass);

        // Настройки UnrealBloom: 
        // разрешение, сила свечения (strength), радиус (radius), порог (threshold)
        // Порог 1.5 означает, что только объекты со свечением (эмиссией > 1) будут давать Bloom.
        const bloomPass = new window.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 1.5);
        // Делаем лазер очень ярким, поэтому threshold = 1.5 - идеален.
        composer.addPass(bloomPass);

        // Экспортируем в window для доступа из других файлов
        window.composer = composer;