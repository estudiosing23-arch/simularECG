/**
 * Simulador de Front-End de ECG basado en LM324 (Webster Fig. 6.18)
 * Maqueta Interactiva 3D del Protoboard y Circuito LM324 (Three.js)
 * Cátedra de Bioinstrumentación - Proyecto de Promoción
 */

class Circuit3DViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = (this.container && this.container.clientWidth > 0) ? this.container.clientWidth : 800;
        this.height = (this.container && this.container.clientHeight > 0) ? this.container.clientHeight : 600;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.interactiveObjects = [];
        this.testPoints = {};
        this.activeProbeNode = 'tp5';

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredObject = null;

        // Callback al hacer clic en un punto de prueba o en el pulsador Reset
        this.onTestPointSelected = null;
        this.onResetTriggered = null;

        this.init();
        this.setupLights();
        this.buildBreadboard();
        this.buildLM324();
        this.buildComponents();
        this.buildTestPoints();
        this.buildOscilloscopeProbe();
        this.setupEvents();
        this.animate();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x181411); // Fondo cálido grafito oscuro

        // Niebla suave cálida para profundidad
        this.scene.fog = new THREE.FogExp2(0x181411, 0.012);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
        this.camera.position.set(0, 24, 28);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // No pasar por debajo de la mesa
        this.controls.minDistance = 6;
        this.controls.maxDistance = 50;
        this.controls.target.set(0, 0, 0);

        // Mesa de laboratorio cálida
        const tableGeo = new THREE.PlaneGeometry(80, 80);
        const tableMat = new THREE.MeshStandardMaterial({
            color: 0x241d19,
            roughness: 0.85,
            metalness: 0.08
        });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.rotation.x = -Math.PI / 2;
        table.position.y = -0.5;
        table.receiveShadow = true;
        this.scene.add(table);

        // Cuadrícula técnica sutil cálida
        const grid = new THREE.GridHelper(60, 60, 0x4a3a2f, 0x2b221c);
        grid.position.y = -0.49;
        this.scene.add(grid);
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xfff3e6, 0.72);
        this.scene.add(ambient);

        const mainLight = new THREE.DirectionalLight(0xffedd5, 1.25);
        mainLight.position.set(15, 30, 20);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.bias = -0.0005;
        this.scene.add(mainLight);

        // Luz secundaria cálida de relleno
        const fillLight = new THREE.DirectionalLight(0xf59e0b, 0.35);
        fillLight.position.set(-20, 15, -15);
        this.scene.add(fillLight);
    }

    buildBreadboard() {
        // Cuerpo del Protoboard (830 puntos) en marfil cálido
        const bbWidth = 24;
        const bbDepth = 10;
        const bbHeight = 1.0;

        const bbGeo = new THREE.BoxGeometry(bbWidth, bbHeight, bbDepth);
        const bbMat = new THREE.MeshStandardMaterial({
            color: 0xf2ece1,
            roughness: 0.45,
            metalness: 0.04
        });
        const bb = new THREE.Mesh(bbGeo, bbMat);
        bb.position.set(0, bbHeight / 2, 0);
        bb.receiveShadow = true;
        bb.castShadow = true;
        this.scene.add(bb);

        // Hendidura central divisoria (Canal para integrados DIP)
        const grooveGeo = new THREE.BoxGeometry(bbWidth - 1, 0.3, 0.6);
        const grooveMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });
        const groove = new THREE.Mesh(grooveGeo, grooveMat);
        groove.position.set(0, bbHeight + 0.01, 0);
        this.scene.add(groove);

        // Tiras de alimentación (+9V Rojo y -9V Azul)
        this.createPowerStripe(-bbDepth / 2 + 0.5, 0xef4444); // +9V
        this.createPowerStripe(-bbDepth / 2 + 1.2, 0x3b82f6); // -9V / GND
        this.createPowerStripe(bbDepth / 2 - 1.2, 0x10b981);  // GND común
        this.createPowerStripe(bbDepth / 2 - 0.5, 0x3b82f6);  // -9V
    }

    createPowerStripe(zPos, hexColor) {
        const stripeGeo = new THREE.BoxGeometry(22, 0.02, 0.12);
        const stripeMat = new THREE.MeshBasicMaterial({ color: hexColor });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(0, 1.01, zPos);
        this.scene.add(stripe);
    }

    buildLM324() {
        // Encapsulado DIP-14
        const chipGroup = new THREE.Group();
        chipGroup.position.set(0, 1.0, 0);

        const bodyGeo = new THREE.BoxGeometry(7.0, 0.7, 2.2);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.35,
            metalness: 0.2
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.5;
        body.castShadow = true;
        chipGroup.add(body);

        // Muesca de orientación (Pin 1 a la izquierda)
        const notchGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.72, 16, 1, false, 0, Math.PI);
        const notchMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
        const notch = new THREE.Mesh(notchGeo, notchMat);
        notch.rotation.y = Math.PI / 2;
        notch.position.set(-3.5, 0.5, 0);
        chipGroup.add(notch);

        // Punto blanco marcador de pin 1
        const dotGeo = new THREE.CircleGeometry(0.12, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(-2.8, 0.86, 0.7);
        chipGroup.add(dot);

        // Serigrafía "LM324N" en relieve/texto
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LM324N', 128, 44);

        const textTex = new THREE.CanvasTexture(canvas);
        const textGeo = new THREE.PlaneGeometry(3.6, 0.9);
        const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.rotation.x = -Math.PI / 2;
        textMesh.position.set(0, 0.86, 0);
        chipGroup.add(textMesh);

        // 14 Pines metálicos (7 a cada lado)
        const pinMat = new THREE.MeshStandardMaterial({
            color: 0xd1d5db,
            metalness: 0.9,
            roughness: 0.2
        });

        for (let i = 0; i < 7; i++) {
            const x = -2.6 + i * 0.86;

            // Pines lado inferior (Pines 1 a 7)
            const pinGeo1 = new THREE.BoxGeometry(0.18, 0.6, 0.6);
            const pin1 = new THREE.Mesh(pinGeo1, pinMat);
            pin1.position.set(x, 0.25, 1.2);
            pin1.castShadow = true;
            chipGroup.add(pin1);

            // Pines lado superior (Pines 14 a 8)
            const pinGeo2 = new THREE.BoxGeometry(0.18, 0.6, 0.6);
            const pin2 = new THREE.Mesh(pinGeo2, pinMat);
            pin2.position.set(x, 0.25, -1.2);
            pin2.castShadow = true;
            chipGroup.add(pin2);
        }

        body.userData = {
            name: "LM324N - Cuádruple Amplificador Operacional",
            details: "Encapsulado DIP-14. Integra OA1, OA2, OA3 y OA4 (Webster Fig. 6.18)."
        };
        this.interactiveObjects.push(body);

        this.scene.add(chipGroup);
    }

    /**
     * Construye resistores con bandas de colores normalizadas y capacitores
     */
    buildComponents() {
        const compGroup = new THREE.Group();

        // 1. Etapa 1: Preamplificador Diferencial
        // R1 = 22k (Rojo-Rojo-Negro-Rojo-Marrón)
        compGroup.add(this.createResistor(-2.4, 1.0, 2.5, Math.PI / 4, ['#EE0000', '#EE0000', '#000000', '#EE0000', '#8B4513'], "R1 (22 kΩ)", "Realimentación OA1 (Av1)"));
        // R2 = 22k
        compGroup.add(this.createResistor(-1.5, 1.0, 2.5, Math.PI / 4, ['#EE0000', '#EE0000', '#000000', '#EE0000', '#8B4513'], "R2 (22 kΩ)", "Realimentación OA2 (Av1)"));
        // Rg = 10k (Marrón-Negro-Negro-Rojo-Marrón)
        compGroup.add(this.createResistor(-2.0, 1.0, 3.8, 0, ['#8B4513', '#000000', '#000000', '#EE0000', '#8B4513'], "Rg (10 kΩ)", "Resistencia central fija de ganancia diferencial"));

        // 2. Etapa 2: Restador Diferencial (OA3)
        // R3 = 10k
        compGroup.add(this.createResistor(0.2, 1.0, -2.5, 0, ['#8B4513', '#000000', '#000000', '#EE0000', '#8B4513'], "R3 (10 kΩ)", "Entrada inversora OA3"));
        // R4 = 10k
        compGroup.add(this.createResistor(0.2, 1.0, -3.4, 0, ['#8B4513', '#000000', '#000000', '#EE0000', '#8B4513'], "R4 (10 kΩ)", "Entrada no inversora OA3"));
        // R5 = 47k (Amarillo-Violeta-Negro-Rojo-Marrón)
        compGroup.add(this.createResistor(1.8, 1.0, -2.5, Math.PI / 2, ['#FFD700', '#7B1FA2', '#000000', '#EE0000', '#8B4513'], "R5 (47 kΩ)", "Realimentación OA3 (Av2 = 4.7)"));
        // R6 = 47k
        compGroup.add(this.createResistor(1.8, 1.0, -3.6, Math.PI / 2, ['#FFD700', '#7B1FA2', '#000000', '#EE0000', '#8B4513'], "R6 (47 kΩ)", "Red a masa OA3"));

        // Trimpot 100k para calibración de CMRR
        compGroup.add(this.createTrimpot(3.2, 1.0, -3.6));

        // 3. Etapa 3: Filtro Paso Alto Pasivo y Pulsador S1
        // Chp = 1 µF (Capacitor poliéster metalizado caja amarilla)
        compGroup.add(this.createFilmCapacitor(4.5, 1.0, -1.8, "Chp (1.0 µF)", "Bloquea 100% el offset DC (fL = 0.048 Hz)"));
        // Rhp = 3.3 MΩ (Naranja-Naranja-Negro-Amarillo-Marrón)
        compGroup.add(this.createResistor(5.8, 1.0, -1.8, 0, ['#FF8C00', '#FF8C00', '#000000', '#FFFF00', '#8B4513'], "Rhp (3.3 MΩ)", "Determina tau = 3.3s para fL"));

        // Pulsador Reset S1 interactivo
        this.resetButtonMesh = this.createTactileSwitch(7.2, 1.0, -2.5);
        compGroup.add(this.resetButtonMesh);

        // 4. Etapa 4: Filtro Paso Bajo Activo y Salida (OA4)
        // Rin4 = 4.7k (Amarillo-Violeta-Negro-Marrón-Marrón)
        compGroup.add(this.createResistor(4.5, 1.0, 2.5, 0, ['#FFD700', '#7B1FA2', '#000000', '#8B4513', '#8B4513'], "Rin4 (4.7 kΩ)", "Entrada inversora OA4"));
        // Rf4 = 150k (Marrón-Verde-Negro-Naranja-Marrón)
        compGroup.add(this.createResistor(6.0, 1.0, 2.5, Math.PI / 2, ['#8B4513', '#008000', '#000000', '#FF8C00', '#8B4513'], "Rf4 (150 kΩ)", "Realimentación OA4 (Av4 = 32.9)"));
        // Cf4 = 10 nF (Capacitor cerámico lenteja)
        compGroup.add(this.createCeramicCapacitor(6.5, 1.0, 3.6, "Cf4 (10 nF)", "Paso bajo activo fc = 106.1 Hz"));

        // Desacoplos de alimentación (100 nF) en Pin 4 y Pin 11
        compGroup.add(this.createCeramicCapacitor(-0.5, 1.0, 1.8, "C_dec1 (100 nF)", "Desacoplo riel +9V (Pin 4)"));
        compGroup.add(this.createCeramicCapacitor(1.5, 1.0, -1.8, "C_dec2 (100 nF)", "Desacoplo riel -9V (Pin 11)"));

        // Baterías Bipolares ±9V
        compGroup.add(this.createBattery(-8.5, 1.0, -2.5, "+9V (VCC)"));
        compGroup.add(this.createBattery(-8.5, 1.0, 2.5, "-9V (VEE)"));

        this.scene.add(compGroup);
    }

    createResistor(x, y, z, rotY, bands, name, details) {
        const group = new THREE.Group();
        group.position.set(x, y + 0.35, z);
        group.rotation.y = rotY;

        // Cuerpo cerámico azul claro (1% metal film)
        const bodyGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.1, 16);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x64b5f6, roughness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.rotation.z = Math.PI / 2;
        body.castShadow = true;
        group.add(body);

        // Bandas de color
        const bandPositions = [-0.35, -0.18, -0.02, 0.15, 0.35];
        bands.forEach((color, idx) => {
            const bandGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.08, 16);
            const bandMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.rotation.z = Math.PI / 2;
            band.position.x = bandPositions[idx];
            group.add(band);
        });

        // Alambres axiales
        const wireMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const wire1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), wireMat);
        wire1.rotation.z = Math.PI / 2;
        wire1.position.x = -0.85;
        group.add(wire1);

        const wire2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), wireMat);
        wire2.rotation.z = Math.PI / 2;
        wire2.position.x = 0.85;
        group.add(wire2);

        body.userData = { name, details };
        this.interactiveObjects.push(body);

        return group;
    }

    createFilmCapacitor(x, y, z, name, details) {
        const group = new THREE.Group();
        group.position.set(x, y + 0.5, z);

        const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.55);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.castShadow = true;
        group.add(box);

        box.userData = { name, details };
        this.interactiveObjects.push(box);
        return group;
    }

    createCeramicCapacitor(x, y, z, name, details) {
        const group = new THREE.Group();
        group.position.set(x, y + 0.45, z);

        const discGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.12, 16);
        const discMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.rotation.x = Math.PI / 2;
        disc.castShadow = true;
        group.add(disc);

        disc.userData = { name, details };
        this.interactiveObjects.push(disc);
        return group;
    }

    createTactileSwitch(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        // Base negra
        const baseGeo = new THREE.BoxGeometry(1.2, 0.5, 1.2);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.25;
        base.castShadow = true;
        group.add(base);

        // Botón pulsador rojo (móvil)
        const btnGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.35, 16);
        const btnMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
        this.pushBtnPlunger = new THREE.Mesh(btnGeo, btnMat);
        this.pushBtnPlunger.position.y = 0.65;
        this.pushBtnPlunger.castShadow = true;
        group.add(this.pushBtnPlunger);

        this.pushBtnPlunger.userData = {
            name: "Pulsador Reset S1 (Webster)",
            details: "Haz clic para derivar a masa y restaurar la línea de base en <50ms.",
            isResetSwitch: true
        };
        this.interactiveObjects.push(this.pushBtnPlunger);

        return group;
    }

    createTrimpot(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y + 0.45, z);

        const bodyGeo = new THREE.BoxGeometry(0.7, 0.85, 0.45);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        group.add(body);

        // Tornillo superior de ajuste
        const screwGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12);
        const screwMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 });
        const screw = new THREE.Mesh(screwGeo, screwMat);
        screw.position.y = 0.45;
        group.add(screw);

        body.userData = {
            name: "Trimpot CMRR 100 kΩ (Ajuste R6)",
            details: "Permite compensar tolerancias resistivas para maximizar CMRR > 86 dB."
        };
        this.interactiveObjects.push(body);

        return group;
    }

    createBattery(x, y, z, label) {
        const group = new THREE.Group();
        group.position.set(x, y + 0.8, z);

        const batGeo = new THREE.BoxGeometry(1.6, 2.4, 1.0);
        const batMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 });
        const bat = new THREE.Mesh(batGeo, batMat);
        bat.castShadow = true;
        group.add(bat);

        // Terminales superiores
        const termGeo1 = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12);
        const termMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9 });
        const term1 = new THREE.Mesh(termGeo1, termMat);
        term1.position.set(-0.4, 1.3, 0);
        group.add(term1);

        const termGeo2 = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 6);
        const term2 = new THREE.Mesh(termGeo2, termMat);
        term2.position.set(0.4, 1.3, 0);
        group.add(term2);

        bat.userData = {
            name: `Batería Alcalina de 9V (${label})`,
            details: "Alimentación simétrica bipolar con masa virtual para máxima seguridad del paciente."
        };
        this.interactiveObjects.push(bat);

        return group;
    }

    buildTestPoints() {
        const tpDefinitions = [
            { id: 'tp1', name: "TP1: Entrada Diferencial", pos: [-3.8, 1.0, 3.8], color: 0xeab308 },
            { id: 'tp2', name: "TP2: Salida OA1/OA2", pos: [-0.8, 1.0, 3.8], color: 0xa855f7 },
            { id: 'tp3', name: "TP3: Salida Restador OA3", pos: [2.5, 1.0, -1.8], color: 0x3b82f6 },
            { id: 'tp4', name: "TP4: Filtro Paso Alto (Post-Chp)", pos: [5.2, 1.0, -3.2], color: 0x10b981 },
            { id: 'tp5', name: "TP5: Salida Final Acondicionada (Vo)", pos: [7.8, 1.0, 2.5], color: 0x06b6d4 }
        ];

        tpDefinitions.forEach(tp => {
            const group = new THREE.Group();
            group.position.set(tp.pos[0], tp.pos[1], tp.pos[2]);

            // Poste metálico dorado
            const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 16);
            const postMat = new THREE.MeshStandardMaterial({
                color: 0xf59e0b,
                metalness: 0.95,
                roughness: 0.15
            });
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.y = 0.6;
            post.castShadow = true;
            group.add(post);

            // Anillo indicador brillante
            const ringGeo = new THREE.TorusGeometry(0.3, 0.08, 12, 24);
            const ringMat = new THREE.MeshStandardMaterial({
                color: tp.color,
                emissive: tp.color,
                emissiveIntensity: 0.6
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 1.1;
            group.add(ring);

            post.userData = {
                id: tp.id,
                name: tp.name,
                details: "Haz clic para conectar la sonda del Osciloscopio (CH2).",
                isTestPoint: true
            };
            this.interactiveObjects.push(post);
            this.testPoints[tp.id] = { group, position: new THREE.Vector3(...tp.pos) };

            this.scene.add(group);
        });
    }

    buildOscilloscopeProbe() {
        this.probeGroup = new THREE.Group();

        // Cuerpo cilíndrico de la sonda
        const probeBodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 2.5, 16);
        const probeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
        const probeBody = new THREE.Mesh(probeBodyGeo, probeMat);
        probeBody.rotation.x = -Math.PI / 6;
        probeBody.position.y = 1.2;
        this.probeGroup.add(probeBody);

        // Punta de aguja metálica
        const needleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 12);
        const needleMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.95 });
        const needle = new THREE.Mesh(needleGeo, needleMat);
        needle.rotation.x = -Math.PI / 6;
        needle.position.set(0, 0.2, 0.15);
        this.probeGroup.add(needle);

        // Aro de color identificador de canal (Cian para CH2)
        const idRingGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 16);
        const idRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        const idRing = new THREE.Mesh(idRingGeo, idRingMat);
        idRing.rotation.x = -Math.PI / 6;
        idRing.position.set(0, 1.6, -0.4);
        this.probeGroup.add(idRing);

        this.scene.add(this.probeGroup);
        this.moveProbeTo('tp5');
    }

    moveProbeTo(tpId) {
        if (!this.testPoints[tpId]) return;
        this.activeProbeNode = tpId;
        const targetPos = this.testPoints[tpId].position;

        // Posicionar sonda en el punto de prueba
        this.probeGroup.position.set(targetPos.x, targetPos.y + 1.1, targetPos.z);
    }

    setupEvents() {
        this.container.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.container.addEventListener('click', (e) => this.onClick(e));
        window.addEventListener('resize', () => this.onResize());
    }

    onMouseMove(e) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            this.container.style.cursor = 'pointer';
            if (this.hoveredObject !== hit) {
                this.hoveredObject = hit;
                this.showTooltip(e.clientX, e.clientY, hit.userData);
            }
        } else {
            this.container.style.cursor = 'default';
            if (this.hoveredObject) {
                this.hoveredObject = null;
                this.hideTooltip();
            }
        }
    }

    onClick(e) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects);

        if (intersects.length > 0) {
            const hit = intersects[0].object;

            if (hit.userData.isTestPoint) {
                this.moveProbeTo(hit.userData.id);
                if (this.onTestPointSelected) {
                    this.onTestPointSelected(hit.userData.id);
                }
            } else if (hit.userData.isResetSwitch) {
                this.animateButtonPress();
                if (this.onResetTriggered) {
                    this.onResetTriggered();
                }
            }
        }
    }

    animateButtonPress() {
        if (!this.pushBtnPlunger) return;
        this.pushBtnPlunger.position.y = 0.45; // presionado
        setTimeout(() => {
            this.pushBtnPlunger.position.y = 0.65; // recuperado
        }, 120);
    }

    showTooltip(x, y, data) {
        let tip = document.getElementById('circuit-3d-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'circuit-3d-tooltip';
            tip.className = 'circuit-tooltip';
            document.body.appendChild(tip);
        }
        tip.innerHTML = `<strong>${data.name}</strong><br><small>${data.details}</small>`;
        tip.style.left = `${x + 12}px`;
        tip.style.top = `${y + 12}px`;
        tip.style.display = 'block';
    }

    hideTooltip() {
        const tip = document.getElementById('circuit-3d-tooltip');
        if (tip) tip.style.display = 'none';
    }

    setCameraPreset(presetName) {
        switch (presetName) {
            case 'overview':
                this.camera.position.set(0, 24, 28);
                this.controls.target.set(0, 0, 0);
                break;
            case 'lm324':
                this.camera.position.set(0, 8, 8);
                this.controls.target.set(0, 1.0, 0);
                break;
            case 'stage1':
                this.camera.position.set(-2.5, 9, 8);
                this.controls.target.set(-2.5, 1.0, 2.5);
                break;
            case 'stage3':
                this.camera.position.set(6, 9, -2);
                this.controls.target.set(6, 1.0, -2);
                break;
            case 'topdown':
                this.camera.position.set(0, 30, 0.1);
                this.controls.target.set(0, 0, 0);
                break;
        }
    }

    onResize() {
        if (!this.container) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w > 0 && h > 0) {
            this.width = w;
            this.height = h;
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.width, this.height);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Exportar para uso global
window.Circuit3DViewer = Circuit3DViewer;
