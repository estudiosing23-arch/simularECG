/**
 * Simulador de Front-End de ECG basado en LM324 (Webster Fig. 6.18)
 * Diagrama Esquemático Interactivo 2D con Flujo de Señales
 * Cátedra de Bioinstrumentación - Proyecto de Promoción
 */

class Schematic2DViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedProbe = 'tp5';
        this.onProbeSelected = null;
        this.onResetTriggered = null;
        this.isResetPressed = false;
        this.renderSVG();
    }

    setProbe(nodeKey) {
        this.selectedProbe = nodeKey;
        this.updateActiveProbeHighlight();
    }

    setResetState(pressed) {
        this.isResetPressed = pressed;
        const switchArm = document.getElementById('schematic-switch-arm');
        if (switchArm) {
            if (pressed) {
                switchArm.setAttribute('y2', '240'); // Cerrado
                switchArm.setAttribute('stroke', '#10b981');
            } else {
                switchArm.setAttribute('y2', '225'); // Abierto
                switchArm.setAttribute('stroke', '#ef4444');
            }
        }
    }

    renderSVG() {
        this.container.innerHTML = `
        <svg id="svg-schematic" viewBox="0 0 1000 480" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <!-- Filtro de brillo para nodos activos -->
                <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <!-- Marcador de flecha para flujo de señal -->
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                </marker>
            </defs>

            <!-- Fondo cálido grafito oscuro -->
            <rect width="1000" height="480" fill="#181411" rx="8" />

            <!-- Marco de Integrado LM324 (DIP-14) -->
            <rect x="110" y="30" width="850" height="425" rx="12" fill="none" stroke="#3d352e" stroke-width="2" stroke-dasharray="8 6" />
            <text x="130" y="55" fill="#8c7e72" font-family="monospace" font-size="13" font-weight="bold">CIRCUITO INTEGRADO CUÁDRUPLE LM324 (ALIMENTACIÓN ±9V BATERÍAS)</text>

            <!-- ============================================================== -->
            <!-- ETAPA 1: PREAMPLIFICADOR DIFERENCIAL (OA1 y OA2) -->
            <!-- ============================================================== -->
            <g id="stage1-group">
                <rect x="25" y="70" width="250" height="340" rx="6" fill="#1e293b" fill-opacity="0.25" stroke="#334155" />
                <text x="40" y="92" fill="#94a3b8" font-family="sans-serif" font-size="11" font-weight="bold">ETAPA 1: BUFFER DIFERENCIAL</text>
                <text x="40" y="108" fill="#38bdf8" font-family="sans-serif" font-size="10">Av1_diff = 1 + 2·R1/Rg = 5.4</text>

                <!-- Electrodos VinA y VinB (Derivación II: LL - RA) -->
                <circle cx="50" cy="150" r="6" fill="#eab308" />
                <text x="18" y="140" fill="#facc15" font-family="sans-serif" font-size="10" font-weight="bold">vA (RA -)</text>
                <line x1="56" y1="150" x2="130" y2="150" stroke="#eab308" stroke-width="2" />

                <circle cx="50" cy="330" r="6" fill="#eab308" />
                <text x="18" y="355" fill="#facc15" font-family="sans-serif" font-size="10" font-weight="bold">vB (LL +)</text>
                <line x1="56" y1="330" x2="130" y2="330" stroke="#eab308" stroke-width="2" />
                <text x="25" y="245" fill="#38bdf8" font-family="sans-serif" font-size="9" font-weight="bold">Vin = vB - vA</text>

                <!-- OA1 -->
                <polygon points="130,120 130,180 180,150" fill="#1e293b" stroke="#60a5fa" stroke-width="2" />
                <text x="140" y="145" fill="#94a3b8" font-size="14">+</text>
                <text x="140" y="168" fill="#94a3b8" font-size="14">-</text>
                <text x="150" y="153" fill="#cbd5e1" font-size="10" font-weight="bold">OA1</text>

                <!-- OA2 -->
                <polygon points="130,300 130,360 180,330" fill="#1e293b" stroke="#60a5fa" stroke-width="2" />
                <text x="140" y="325" fill="#94a3b8" font-size="14">-</text>
                <text x="140" y="348" fill="#94a3b8" font-size="14">+</text>
                <text x="150" y="333" fill="#cbd5e1" font-size="10" font-weight="bold">OA2</text>

                <!-- Red de realimentación R1, Rg, R2 -->
                <!-- R1 (22k) -->
                <line x1="180" y1="150" x2="210" y2="150" stroke="#60a5fa" stroke-width="2" />
                <line x1="210" y1="150" x2="210" y2="190" stroke="#60a5fa" stroke-width="2" />
                <rect x="200" y="190" width="20" height="30" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="225" y="210" fill="#fbbf24" font-size="10">R1=22k</text>
                <line x1="210" y1="220" x2="210" y2="235" stroke="#60a5fa" stroke-width="2" />
                <line x1="210" y1="235" x2="115" y2="235" stroke="#60a5fa" stroke-width="2" />
                <line x1="115" y1="235" x2="115" y2="165" stroke="#60a5fa" stroke-width="2" />
                <line x1="115" y1="165" x2="130" y2="165" stroke="#60a5fa" stroke-width="2" />

                <!-- Rg (10k central) -->
                <rect x="200" y="235" width="20" height="30" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="225" y="255" fill="#fbbf24" font-size="10">Rg=10k</text>

                <!-- R2 (22k) -->
                <line x1="210" y1="265" x2="210" y2="280" stroke="#60a5fa" stroke-width="2" />
                <line x1="210" y1="280" x2="115" y2="280" stroke="#60a5fa" stroke-width="2" />
                <line x1="115" y1="280" x2="115" y2="320" stroke="#60a5fa" stroke-width="2" />
                <line x1="115" y1="320" x2="130" y2="320" stroke="#60a5fa" stroke-width="2" />

                <rect x="200" y="280" width="20" height="30" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="225" y="300" fill="#fbbf24" font-size="10">R2=22k</text>
                <line x1="210" y1="310" x2="210" y2="330" stroke="#60a5fa" stroke-width="2" />
                <line x1="180" y1="330" x2="210" y2="330" stroke="#60a5fa" stroke-width="2" />
            </g>

            <!-- ============================================================== -->
            <!-- ETAPA 2: RESTADOR DIFERENCIAL (OA3) -->
            <!-- ============================================================== -->
            <g id="stage2-group">
                <rect x="290" y="70" width="220" height="340" rx="6" fill="#1e293b" fill-opacity="0.25" stroke="#334155" />
                <text x="305" y="92" fill="#94a3b8" font-family="sans-serif" font-size="11" font-weight="bold">ETAPA 2: RESTADOR OA3</text>
                <text x="305" y="108" fill="#38bdf8" font-family="sans-serif" font-size="10">Av2_diff = 4.7 | Av1 = 25.4</text>

                <!-- Líneas desde OA1 y OA2 -->
                <line x1="210" y1="150" x2="310" y2="150" stroke="#60a5fa" stroke-width="2" />
                <!-- R3 (10k) -->
                <rect x="310" y="140" width="30" height="20" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="312" y="132" fill="#fbbf24" font-size="10">R3=10k</text>
                <line x1="340" y1="150" x2="390" y2="150" stroke="#60a5fa" stroke-width="2" />
                <line x1="390" y1="150" x2="390" y2="225" stroke="#60a5fa" stroke-width="2" />
                <line x1="390" y1="225" x2="410" y2="225" stroke="#60a5fa" stroke-width="2" />

                <!-- R5 (47k feedback) -->
                <line x1="390" y1="190" x2="430" y2="190" stroke="#60a5fa" stroke-width="1.5" />
                <rect x="430" y="180" width="30" height="20" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="432" y="172" fill="#fbbf24" font-size="10">R5=47k</text>
                <line x1="460" y1="190" x2="485" y2="190" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="485" y1="190" x2="485" y2="240" stroke="#60a5fa" stroke-width="1.5" />

                <line x1="210" y1="330" x2="310" y2="330" stroke="#60a5fa" stroke-width="2" />
                <!-- R4 (10k) -->
                <rect x="310" y="320" width="30" height="20" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="312" y="315" fill="#fbbf24" font-size="10">R4=10k</text>
                <line x1="340" y1="330" x2="390" y2="330" stroke="#60a5fa" stroke-width="2" />
                <line x1="390" y1="330" x2="390" y2="255" stroke="#60a5fa" stroke-width="2" />
                <line x1="390" y1="255" x2="410" y2="255" stroke="#60a5fa" stroke-width="2" />

                <!-- R6 (47k a masa + trimpot) -->
                <line x1="390" y1="290" x2="390" y2="350" stroke="#60a5fa" stroke-width="1.5" />
                <rect x="380" y="350" width="20" height="30" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="405" y="370" fill="#fbbf24" font-size="10">R6=47k</text>
                <line x1="390" y1="380" x2="390" y2="395" stroke="#60a5fa" stroke-width="1.5" />
                <!-- Masa -->
                <line x1="380" y1="395" x2="400" y2="395" stroke="#64748b" stroke-width="2" />
                <line x1="385" y1="399" x2="395" y2="399" stroke="#64748b" stroke-width="1.5" />

                <!-- OA3 -->
                <polygon points="410,210 410,270 460,240" fill="#1e293b" stroke="#60a5fa" stroke-width="2" />
                <text x="418" y="233" fill="#94a3b8" font-size="14">-</text>
                <text x="418" y="258" fill="#94a3b8" font-size="14">+</text>
                <text x="430" y="243" fill="#cbd5e1" font-size="10" font-weight="bold">OA3</text>
                <line x1="460" y1="240" x2="525" y2="240" stroke="#60a5fa" stroke-width="2" />
            </g>

            <!-- ============================================================== -->
            <!-- ETAPA 3: FILTRO PASO ALTO PASIVO Y PULSADOR S1 -->
            <!-- ============================================================== -->
            <g id="stage3-group">
                <rect x="525" y="70" width="180" height="340" rx="6" fill="#1e293b" fill-opacity="0.25" stroke="#334155" />
                <text x="535" y="92" fill="#94a3b8" font-family="sans-serif" font-size="11" font-weight="bold">ETAPA 3: FILTRO HP Y RESET</text>
                <text x="535" y="108" fill="#38bdf8" font-family="sans-serif" font-size="10">fL = 0.048 Hz (Tau = 3.3 s)</text>

                <!-- Capacitor Chp (1 uF) -->
                <line x1="525" y1="240" x2="560" y2="240" stroke="#60a5fa" stroke-width="2" />
                <line x1="560" y1="225" x2="560" y2="255" stroke="#f59e0b" stroke-width="3" />
                <line x1="568" y1="225" x2="568" y2="255" stroke="#f59e0b" stroke-width="3" />
                <text x="550" y="215" fill="#f59e0b" font-size="10" font-weight="bold">Chp=1µF</text>
                <line x1="568" y1="240" x2="620" y2="240" stroke="#60a5fa" stroke-width="2" />

                <!-- Nodo TP4 -->
                <!-- Rhp (3.3 MΩ a masa) -->
                <line x1="620" y1="240" x2="620" y2="280" stroke="#60a5fa" stroke-width="2" />
                <rect x="610" y="280" width="20" height="35" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="635" y="302" fill="#fbbf24" font-size="10">Rhp=3.3M</text>
                <line x1="620" y1="315" x2="620" y2="340" stroke="#60a5fa" stroke-width="2" />
                <!-- Masa -->
                <line x1="610" y1="340" x2="630" y2="340" stroke="#64748b" stroke-width="2" />
                <line x1="615" y1="344" x2="625" y2="344" stroke="#64748b" stroke-width="1.5" />

                <!-- Pulsador S1 (Reset Rápido) en paralelo -->
                <line x1="620" y1="180" x2="670" y2="180" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="670" y1="180" x2="670" y2="210" stroke="#60a5fa" stroke-width="1.5" />
                <circle cx="670" cy="210" r="3" fill="#ef4444" />
                <circle cx="670" cy="240" r="3" fill="#ef4444" />
                <!-- Brazo móvil del switch -->
                <line id="schematic-switch-arm" x1="670" y1="210" x2="685" y2="225" stroke="#ef4444" stroke-width="2" />
                <text x="690" y="222" fill="#ef4444" font-size="10" font-weight="bold">S1 (Reset)</text>
                <line x1="670" y1="240" x2="670" y2="270" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="670" y1="270" x2="620" y2="270" stroke="#60a5fa" stroke-width="1.5" />
            </g>

            <!-- ============================================================== -->
            <!-- ETAPA 4: AMPLIFICADOR NO INVERSOR Y FILTRO PASO BAJO ACTIVO -->
            <!-- ============================================================== -->
            <g id="stage4-group">
                <rect x="720" y="70" width="220" height="340" rx="6" fill="#1e293b" fill-opacity="0.25" stroke="#334155" />
                <text x="730" y="92" fill="#94a3b8" font-family="sans-serif" font-size="11" font-weight="bold">ETAPA 4: FILTRO ACTIVO LP</text>
                <text x="730" y="108" fill="#38bdf8" font-family="sans-serif" font-size="10">Av2 = 32.9 | fc = 106.1 Hz</text>

                <line x1="620" y1="240" x2="750" y2="240" stroke="#60a5fa" stroke-width="2" />
                <!-- Entrada no inversora de OA4 -->
                <polygon points="750,210 750,270 800,240" fill="#1e293b" stroke="#60a5fa" stroke-width="2" />
                <text x="758" y="233" fill="#94a3b8" font-size="14">-</text>
                <text x="758" y="258" fill="#94a3b8" font-size="14">+</text>
                <text x="770" y="243" fill="#cbd5e1" font-size="10" font-weight="bold">OA4</text>

                <!-- Salida Vo -->
                <line x1="800" y1="240" x2="880" y2="240" stroke="#00f0ff" stroke-width="3" />
                <circle cx="880" cy="240" r="7" fill="#00f0ff" />
                <text x="895" y="245" fill="#00f0ff" font-size="13" font-weight="bold">Vo (t)</text>
                <text x="880" y="270" fill="#94a3b8" font-size="10">Av_tot ≈ 835 (58 dB)</text>

                <!-- Red de realimentación Rin4, Rf4, Cf4 -->
                <line x1="740" y1="225" x2="740" y2="170" stroke="#60a5fa" stroke-width="2" />
                <line x1="740" y1="225" x2="750" y2="225" stroke="#60a5fa" stroke-width="2" />

                <!-- Rin4 (4.7k a masa) -->
                <line x1="740" y1="170" x2="700" y2="170" stroke="#60a5fa" stroke-width="1.5" />
                <rect x="670" y="160" width="30" height="20" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="665" y="152" fill="#fbbf24" font-size="10">Rin4=4.7k</text>
                <line x1="670" y1="170" x2="650" y2="170" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="650" y1="160" x2="650" y2="180" stroke="#64748b" stroke-width="2" />

                <!-- Rf4 (150k) en paralelo con Cf4 (10nF) -->
                <line x1="740" y1="170" x2="770" y2="170" stroke="#60a5fa" stroke-width="1.5" />
                <rect x="770" y="140" width="35" height="20" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
                <text x="772" y="132" fill="#fbbf24" font-size="10">Rf4=150k</text>

                <line x1="770" y1="185" x2="782" y2="185" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="782" y1="175" x2="782" y2="195" stroke="#f59e0b" stroke-width="2" />
                <line x1="788" y1="175" x2="788" y2="195" stroke="#f59e0b" stroke-width="2" />
                <line x1="788" y1="185" x2="800" y2="185" stroke="#60a5fa" stroke-width="1.5" />
                <text x="772" y="208" fill="#f59e0b" font-size="10">Cf4=10nF</text>

                <line x1="805" y1="150" x2="830" y2="150" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="800" y1="185" x2="830" y2="185" stroke="#60a5fa" stroke-width="1.5" />
                <line x1="830" y1="150" x2="830" y2="240" stroke="#60a5fa" stroke-width="1.5" />
            </g>

            <!-- ============================================================== -->
            <!-- PUNTOS DE PRUEBA (TEST POINTS) CLICKEABLES -->
            <!-- ============================================================== -->
            <!-- TP1 -->
            <g class="testpoint-node" data-tp="tp1" style="cursor:pointer;">
                <circle id="tp-circ-tp1" cx="80" cy="150" r="9" fill="#eab308" filter="url(#glow-gold)" />
                <text x="73" y="130" fill="#facc15" font-size="11" font-weight="bold">TP1</text>
            </g>
            <!-- TP2 -->
            <g class="testpoint-node" data-tp="tp2" style="cursor:pointer;">
                <circle id="tp-circ-tp2" cx="240" cy="150" r="9" fill="#a855f7" />
                <text x="233" y="130" fill="#c084fc" font-size="11" font-weight="bold">TP2</text>
            </g>
            <!-- TP3 -->
            <g class="testpoint-node" data-tp="tp3" style="cursor:pointer;">
                <circle id="tp-circ-tp3" cx="490" cy="240" r="9" fill="#3b82f6" />
                <text x="483" y="220" fill="#60a5fa" font-size="11" font-weight="bold">TP3</text>
            </g>
            <!-- TP4 -->
            <g class="testpoint-node" data-tp="tp4" style="cursor:pointer;">
                <circle id="tp-circ-tp4" cx="620" cy="240" r="9" fill="#10b981" />
                <text x="613" y="220" fill="#34d399" font-size="11" font-weight="bold">TP4</text>
            </g>
            <!-- TP5 -->
            <g class="testpoint-node" data-tp="tp5" style="cursor:pointer;">
                <circle id="tp-circ-tp5" cx="880" cy="240" r="10" fill="#06b6d4" filter="url(#glow-cyan)" />
                <text x="873" y="220" fill="#22d3ee" font-size="11" font-weight="bold">TP5</text>
            </g>
        </svg>
        `;

        this.attachEvents();
        this.updateActiveProbeHighlight();
    }

    attachEvents() {
        const nodes = this.container.querySelectorAll('.testpoint-node');
        nodes.forEach(node => {
            node.addEventListener('click', (e) => {
                const tp = node.getAttribute('data-tp');
                this.setProbe(tp);
                if (this.onProbeSelected) {
                    this.onProbeSelected(tp);
                }
            });
        });

        const switchEl = this.container.querySelector('#stage3-group');
        if (switchEl) {
            switchEl.addEventListener('click', (e) => {
                if (e.target.closest('#schematic-switch-arm') || e.target.textContent.includes('S1')) {
                    if (this.onResetTriggered) {
                        this.onResetTriggered();
                    }
                }
            });
        }
    }

    updateActiveProbeHighlight() {
        ['tp1', 'tp2', 'tp3', 'tp4', 'tp5'].forEach(tp => {
            const circ = document.getElementById(`tp-circ-${tp}`);
            if (circ) {
                if (tp === this.selectedProbe) {
                    circ.setAttribute('stroke', '#ffffff');
                    circ.setAttribute('stroke-width', '3');
                    circ.setAttribute('r', '12');
                } else {
                    circ.removeAttribute('stroke');
                    circ.removeAttribute('stroke-width');
                    circ.setAttribute('r', '9');
                }
            }
        });
    }
}

// Exportar para uso global
window.Schematic2DViewer = Schematic2DViewer;
