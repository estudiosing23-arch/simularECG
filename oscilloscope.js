/**
 * Simulador de Front-End de ECG basado en LM324 (Webster Fig. 6.18)
 * Osciloscopio Digital Biomédico de Gran Formato con Zoom Vertical de Amplitud
 * Modos: 4 Carriles Amplios, 2 Canales Gigantes, Matriz 2x2, Superpuesto, Zoom y FFT
 * Cátedra de Bioinstrumentación - Proyecto de Promoción
 */

class Oscilloscope {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.bufferSize = 4000;
        this.bufferTime = new Float32Array(this.bufferSize);
        this.bufferVin = new Float32Array(this.bufferSize);   // Etapa 1: Vin (mV)
        this.bufferOA3 = new Float32Array(this.bufferSize);   // Etapa 2: Salida OA3 Restador (V)
        this.bufferHP = new Float32Array(this.bufferSize);    // Etapa 3: Post-Filtro Paso Alto (V)
        this.bufferVout = new Float32Array(this.bufferSize);  // Etapa 4: Salida Final Vo (V)
        
        // Pre-cargar los búferes con valores en régimen estacionario para evitar transitorios iniciales
        this.bufferVin.fill(250.0);
        this.bufferOA3.fill(6.345);
        this.bufferHP.fill(0.0);
        this.bufferVout.fill(0.0);
        this.bufferIndex = 0;

        // Modos:
        // 'dual'    : 2 Canales Gigantes (Entrada Vin vs Salida Vo) - MODO PRINCIPAL
        // 'overlay' : Superpuesto a pantalla completa
        // 'fft'     : Analizador FFT
        this.displayMode = 'dual';
        this.singleStageKey = 'vout';

        // Factor de Zoom Vertical de Amplitud (Y-Gain)
        this.yZoom = 1.8; // Permite que los complejos QRS y ondas se vean grandes y altas!

        // Visibilidad por etapa
        this.stageVisibility = {
            vin: true,
            oa3: true,
            hp: true,
            vout: true
        };

        // Colores distintivos de alta visibilidad
        this.colors = {
            vin: '#f59e0b',   // Oro / Ámbar (Etapa 1: Vin)
            oa3: '#c084fc',   // Púrpura (Etapa 2: OA3 Restador)
            hp: '#10b981',    // Verde Esmeralda (Etapa 3: Filtro HP)
            vout: '#06b6d4'   // Cian Médico (Etapa 4: Vo Final)
        };

        this.time_div_ms = 200; // ms / div
        this.sampleRate = 1000;
        this.isFrozen = false;

        this.measurements = {
            bpm: 75,
            vin_vpp_mV: 0,
            vin_dc_mV: 0,
            oa3_vpp_V: 0,
            oa3_dc_V: 0,
            hp_vpp_V: 0,
            hp_dc_V: 0,
            vout_vpp_V: 0,
            vout_dc_V: 0,
            measured_gain: 0
        };

        this.peakDetector = {
            lastPeakTime: 0,
            threshold: 0.55,
            rrIntervals: [],
            isAbove: false
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = (rect.width > 0 ? rect.width : 1100) * dpr;
        const h = (rect.height > 0 ? rect.height : 700) * dpr;
        this.canvas.width = w;
        this.canvas.height = h;
        this.width = w;
        this.height = h;
    }

    setDisplayMode(mode) {
        this.displayMode = mode;
    }

    setSingleStage(key) {
        this.singleStageKey = key;
    }

    setTimeDiv(ms) {
        this.time_div_ms = ms;
    }

    setYZoom(multiplier) {
        this.yZoom = Math.max(0.5, Math.min(5.0, multiplier));
    }

    adjustYZoom(delta) {
        this.setYZoom(this.yZoom + delta);
        return this.yZoom;
    }

    setStageVisible(key, visible) {
        if (this.stageVisibility.hasOwnProperty(key)) {
            this.stageVisibility[key] = visible;
        }
    }

    toggleFreeze() {
        this.isFrozen = !this.isFrozen;
        return this.isFrozen;
    }

    clearBuffers() {
        if (this.bufferVin) this.bufferVin.fill(0);
        if (this.bufferOA3) this.bufferOA3.fill(0);
        if (this.bufferHP) this.bufferHP.fill(0);
        if (this.bufferVout) this.bufferVout.fill(0);
        if (this.bufferTime) this.bufferTime.fill(0);
        this.bufferIndex = 0;
        this.peakDetector = {
            lastPeakTime: 0,
            isAbove: false,
            rrIntervals: []
        };
    }

    pushSample(t, vin_mV, nodes) {
        if (this.isFrozen) return;

        this.bufferTime[this.bufferIndex] = t;
        this.bufferVin[this.bufferIndex] = vin_mV;
        this.bufferOA3[this.bufferIndex] = nodes.tp3_oa3;
        this.bufferHP[this.bufferIndex] = nodes.tp4_hp;
        this.bufferVout[this.bufferIndex] = nodes.tp5_vout;

        this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;

        this.detectRPeak(t, nodes.tp5_vout);
    }

    detectRPeak(t, vout) {
        const th = 0.55;
        if (vout > th && !this.peakDetector.isAbove) {
            this.peakDetector.isAbove = true;
            if (this.peakDetector.lastPeakTime > 0) {
                const rr = t - this.peakDetector.lastPeakTime;
                if (rr > 0.25 && rr < 2.5) {
                    this.peakDetector.rrIntervals.push(rr);
                    if (this.peakDetector.rrIntervals.length > 5) {
                        this.peakDetector.rrIntervals.shift();
                    }
                    const avgRR = this.peakDetector.rrIntervals.reduce((a, b) => a + b, 0) / this.peakDetector.rrIntervals.length;
                    this.measurements.bpm = Math.round(60.0 / avgRR);
                }
            }
            this.peakDetector.lastPeakTime = t;
        } else if (vout < th * 0.4) {
            this.peakDetector.isAbove = false;
        }
    }

    drawGrid(x, y, w, h, xDivs = 10, yDivs = 4) {
        const ctx = this.ctx;
        const dx = w / xDivs;
        const dy = h / yDivs;

        // Fondo del carril con contraste médico
        ctx.fillStyle = '#10141d';
        ctx.fillRect(x, y, w, h);

        // Cuadrícula interior visible
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);

        for (let i = 1; i < xDivs; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * dx, y);
            ctx.lineTo(x + i * dx, y + h);
            ctx.stroke();
        }

        for (let j = 1; j < yDivs; j++) {
            ctx.beginPath();
            ctx.moveTo(x, y + j * dy);
            ctx.lineTo(x + w, y + j * dy);
            ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.strokeRect(x, y, w, h);
    }

    updateAllMeasurements(samplesVisible) {
        if (samplesVisible <= 0) return;

        let minVin = Infinity, maxVin = -Infinity, sumVin = 0;
        let minOA3 = Infinity, maxOA3 = -Infinity, sumOA3 = 0;
        let minHP = Infinity, maxHP = -Infinity, sumHP = 0;
        let minVout = Infinity, maxVout = -Infinity, sumVout = 0;

        for (let i = 0; i < samplesVisible; i++) {
            const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;

            const v1 = this.bufferVin[bIdx];
            if (v1 < minVin) minVin = v1;
            if (v1 > maxVin) maxVin = v1;
            sumVin += v1;

            const v2 = this.bufferOA3[bIdx];
            if (v2 < minOA3) minOA3 = v2;
            if (v2 > maxOA3) maxOA3 = v2;
            sumOA3 += v2;

            const v3 = this.bufferHP[bIdx];
            if (v3 < minHP) minHP = v3;
            if (v3 > maxHP) maxHP = v3;
            sumHP += v3;

            const v4 = this.bufferVout[bIdx];
            if (v4 < minVout) minVout = v4;
            if (v4 > maxVout) maxVout = v4;
            sumVout += v4;
        }

        const count = Math.max(1, samplesVisible);
        this.measurements.vin_vpp_mV = maxVin - minVin;
        this.measurements.vin_dc_mV = sumVin / count;

        this.measurements.oa3_vpp_V = maxOA3 - minOA3;
        this.measurements.oa3_dc_V = sumOA3 / count;

        this.measurements.hp_vpp_V = maxHP - minHP;
        this.measurements.hp_dc_V = sumHP / count;

        this.measurements.vout_vpp_V = maxVout - minVout;
        this.measurements.vout_dc_V = sumVout / count;

        if (this.measurements.vin_vpp_mV > 0.01) {
            this.measurements.measured_gain = (this.measurements.vout_vpp_V * 1000.0) / this.measurements.vin_vpp_mV;
        }
    }

    render() {
        if (!this.ctx) return;

        const w = this.width;
        const h = this.height;

        this.ctx.fillStyle = '#0b0d11';
        this.ctx.fillRect(0, 0, w, h);

        const totalVisibleTime_s = (this.time_div_ms * 10) / 1000.0;
        const samplesVisible = Math.min(this.bufferSize, Math.round(totalVisibleTime_s * this.sampleRate));
        this.updateAllMeasurements(samplesVisible);

        switch (this.displayMode) {
            case 'overlay':
                this.renderOverlay();
                break;
            case 'fft':
                this.renderFFT();
                break;
            case 'dual':
            default:
                this.renderDualHuge();
                break;
        }
    }

    /**
     * MODO 1: 4 CARRILES APILADOS CON MÁXIMA AMPLITUD VERTICAL
     */
    renderStacked() {
        const w = this.width;
        const h = this.height;
        const ctx = this.ctx;

        const totalVisibleTime_s = (this.time_div_ms * 10) / 1000.0;
        const samplesVisible = Math.min(this.bufferSize, Math.round(totalVisibleTime_s * this.sampleRate));

        const stages = [
            {
                key: 'vin',
                tag: 'ETAPA 1: ENTRADA VIN (ELECTRODOS)',
                role: 'Lead II (LL - RA) + Offset DC (+250mV) + Ruido 50Hz/EMG',
                color: this.colors.vin,
                buffer: this.bufferVin,
                scale: 350.0,
                isVolts: false
            },
            {
                key: 'oa3',
                tag: 'ETAPA 2: RESTADOR OA3',
                role: 'Ganancia Av1 = 25.4 (Offset amplificado a +6.34V sin saturar)',
                color: this.colors.oa3,
                buffer: this.bufferOA3,
                scale: 9.0,
                isVolts: true
            },
            {
                key: 'hp',
                tag: 'ETAPA 3: FILTRO PASO ALTO',
                role: 'fL = 0.048 Hz (Tau = 3.3s) • 100% Offset DC bloqueado a 0.00V',
                color: this.colors.hp,
                buffer: this.bufferHP,
                scale: 0.22,
                isVolts: true
            },
            {
                key: 'vout',
                tag: 'ETAPA 4: SALIDA FINAL VO',
                role: 'Filtro LP Activo 106 Hz • Av_tot = 835 (58.4 dB) • Complejo P-QRS-T Limpio',
                color: this.colors.vout,
                buffer: this.bufferVout,
                scale: 2.2,
                isVolts: true
            }
        ];

        const activeStages = stages.filter(s => this.stageVisibility[s.key]);
        const numTracks = Math.max(1, activeStages.length);

        const padY = 8;
        const availH = h - padY * 2;
        const trackH = availH / numTracks;
        const trackInnerH = trackH - 6;

        activeStages.forEach((stage, idx) => {
            const trackY = padY + idx * trackH;
            const trackCY = trackY + trackInnerH / 2;
            const halfTrack = trackInnerH / 2 - 4; // Aprovecha prácticamente TODO el alto del carril!

            this.drawGrid(10, trackY, w - 20, trackInnerH, 10, 4);

            // Línea cero isoeléctrica
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(10, trackCY);
            ctx.lineTo(w - 10, trackCY);
            ctx.stroke();
            ctx.restore();

            // Etiqueta compacta en una sola línea elegante en la parte superior izquierda
            ctx.font = 'bold 12px "Outfit", sans-serif';
            ctx.fillStyle = stage.color;
            ctx.fillText(stage.tag, 22, trackY + 16);

            ctx.font = '10px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`• ${stage.role}`, 22 + ctx.measureText(stage.tag).width + 8, trackY + 16);

            // 1er paso: Cálculo estadístico (Vpp y DC real medido)
            let minVal = Infinity, maxVal = -Infinity;
            let sumVal = 0;
            const plotW = w - 20;

            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                const val = stage.buffer[bIdx];
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
                sumVal += val;
            }

            const vpp = maxVal - minVal;
            const dc = sumVal / Math.max(1, samplesVisible);

            // 2do paso: Trazado en pantalla con física de offset y morfología nítida
            ctx.save();
            ctx.strokeStyle = stage.color;
            ctx.lineWidth = 2.4;
            ctx.shadowColor = stage.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();

            let started = false;
            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                const val = stage.buffer[bIdx];
                const x = 10 + (i / samplesVisible) * plotW;

                let normY;
                if (stage.key === 'vin') {
                    // Offset DC posicionado a su nivel relativo real sobre la escala de 350 mV
                    // más componente AC magnificada para apreciar la morfología P-QRS-T
                    const dcNorm = (dc / 350.0) * 0.45;
                    const acNorm = ((val - dc) / 2.0) * 0.35;
                    normY = dcNorm + acNorm * this.yZoom;
                } else if (stage.key === 'oa3') {
                    // Offset DC posicionado a su nivel real sobre los rieles de 9V (ej. +6.34V -> +55% altura)
                    // más componente AC visible
                    const dcNorm = (dc / 9.0) * 0.55;
                    const acNorm = ((val - dc) / 0.1) * 0.22;
                    normY = dcNorm + acNorm * this.yZoom;
                } else {
                    // Post-HP y Vo Final: perfectamente centradas en 0.00V
                    normY = (val / stage.scale) * this.yZoom;
                }

                if (isNaN(normY) || !isFinite(normY)) normY = 0;
                const y = Math.max(trackY + 4, Math.min(trackY + trackInnerH - 4, trackCY - normY * halfTrack));
                if (isNaN(y) || !isFinite(y)) continue;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();

            // Medición en la parte superior derecha
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.fillStyle = stage.color;
            ctx.textAlign = 'right';
            const vppStr = stage.isVolts ? `${vpp.toFixed(2)} Vpp` : `${vpp.toFixed(2)} mVpp`;
            const dcStr = stage.isVolts ? `DC: ${dc >= 0 ? '+' : ''}${dc.toFixed(2)}V` : `DC: ${dc >= 0 ? '+' : ''}${dc.toFixed(1)}mV`;
            ctx.fillText(`${vppStr}  [${dcStr}]`, w - 22, trackY + 16);
            ctx.textAlign = 'left';

            if (stage.key === 'vin') {
                this.measurements.vin_vpp_mV = vpp;
                this.measurements.vin_dc_mV = dc;
            } else if (stage.key === 'oa3') {
                this.measurements.oa3_vpp_V = vpp;
                this.measurements.oa3_dc_V = dc;
            } else if (stage.key === 'hp') {
                this.measurements.hp_vpp_V = vpp;
                this.measurements.hp_dc_V = dc;
            } else if (stage.key === 'vout') {
                this.measurements.vout_vpp_V = vpp;
                this.measurements.vout_dc_V = dc;
                if (this.measurements.vin_vpp_mV > 0.01) {
                    this.measurements.measured_gain = (vpp * 1000.0) / this.measurements.vin_vpp_mV;
                }
            }
        });
    }

    /**
     * MODO 2: DOS CANALES GIGANTES (ENTRADA VIN vs SALIDA VO)
     * Proporciona más de 300px de altura para cada señal, con máximo detalle de filtrado.
     */
    renderDualHuge() {
        const w = this.width;
        const h = this.height;
        const ctx = this.ctx;

        const totalVisibleTime_s = (this.time_div_ms * 10) / 1000.0;
        const samplesVisible = Math.min(this.bufferSize, Math.round(totalVisibleTime_s * this.sampleRate));

        const padY = 8;
        const trackH = (h - padY * 3) / 2;

        const channels = [
            {
                tag: 'CANAL 1: ENTRADA BIOPOTENCIAL (VIN ELECTRÓDOS)',
                role: 'Señal Diferencial + Offset DC + Interferencia 50Hz',
                color: this.colors.vin,
                buffer: this.bufferVin,
                scale: 1.5,
                isVolts: false,
                trackY: padY
            },
            {
                tag: 'CANAL 2: SALIDA ACONDICIONADA FINAL (VO PARA ADC)',
                role: 'Ganancia Av = 835 (58.4 dB) • Filtro Paso Bajo Activo 106 Hz • Complejo P-QRS-T Puro',
                color: this.colors.vout,
                buffer: this.bufferVout,
                scale: 2.2,
                isVolts: true,
                trackY: padY * 2 + trackH
            }
        ];

        channels.forEach(ch => {
            const trackCY = ch.trackY + trackH / 2;
            const halfTrack = trackH / 2 - 8;

            this.drawGrid(10, ch.trackY, w - 20, trackH, 10, 6);

            // Línea cero isoeléctrica
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(10, trackCY);
            ctx.lineTo(w - 10, trackCY);
            ctx.stroke();
            ctx.restore();

            // Rótulo
            ctx.font = 'bold 13px "Outfit", sans-serif';
            ctx.fillStyle = ch.color;
            ctx.fillText(ch.tag, 22, ch.trackY + 20);

            ctx.font = '11px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`• ${ch.role}`, 22 + ctx.measureText(ch.tag).width + 10, ch.trackY + 20);

            // 1er paso: Cálculo estadístico (Vpp y DC)
            let minVal = Infinity, maxVal = -Infinity;
            let sumVal = 0;
            const plotW = w - 20;

            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                const val = ch.buffer[bIdx];
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
                sumVal += val;
            }

            const vpp = maxVal - minVal;
            const dc = sumVal / Math.max(1, samplesVisible);

            // 2do paso: Trazo
            ctx.save();
            ctx.strokeStyle = ch.color;
            ctx.lineWidth = 2.8;
            ctx.shadowColor = ch.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();

            let started = false;
            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                const val = ch.buffer[bIdx];
                const x = 10 + (i / samplesVisible) * plotW;

                let normY;
                if (!ch.isVolts) {
                    const dcNorm = (dc / 350.0) * 0.45;
                    const acNorm = ((val - dc) / 2.0) * 0.35;
                    normY = dcNorm + acNorm * this.yZoom;
                } else {
                    normY = (val / ch.scale) * this.yZoom;
                }

                if (isNaN(normY) || !isFinite(normY)) normY = 0;
                const y = Math.max(ch.trackY + 6, Math.min(ch.trackY + trackH - 6, trackCY - normY * halfTrack));
                if (isNaN(y) || !isFinite(y)) continue;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();

            ctx.font = 'bold 13px "JetBrains Mono", monospace';
            ctx.fillStyle = ch.color;
            ctx.textAlign = 'right';
            const vppStr = ch.isVolts ? `${vpp.toFixed(2)} Vpp` : `${vpp.toFixed(2)} mVpp`;
            const dcStr = ch.isVolts ? `DC: ${dc >= 0 ? '+' : ''}${dc.toFixed(2)}V` : `DC: ${dc >= 0 ? '+' : ''}${dc.toFixed(1)}mV`;
            ctx.fillText(`${vppStr}  [${dcStr}]`, w - 22, ch.trackY + 20);
            ctx.textAlign = 'left';
        });
    }

    /**
     * MODO 3: MATRIZ 2x2 (4 CUADRANTES AMPLIOS)
     */
    renderQuad() {
        const w = this.width;
        const h = this.height;
        const ctx = this.ctx;

        const totalVisibleTime_s = (this.time_div_ms * 10) / 1000.0;
        const samplesVisible = Math.min(this.bufferSize, Math.round(totalVisibleTime_s * this.sampleRate));

        const margin = 10;
        const quadW = (w - margin * 3) / 2;
        const quadH = (h - margin * 3) / 2;

        const quadrants = [
            {
                name: '1. ENTRADA VIN (Lead II + 50Hz + Offset)',
                color: this.colors.vin,
                buffer: this.bufferVin,
                scale: 1.5,
                isVolts: false,
                rect: [margin, margin, quadW, quadH]
            },
            {
                name: '2. RESTADOR OA3 (Av1 = 25.4)',
                color: this.colors.oa3,
                buffer: this.bufferOA3,
                scale: 9.0,
                isVolts: true,
                rect: [margin * 2 + quadW, margin, quadW, quadH]
            },
            {
                name: '3. FILTRO PASO ALTO (fL = 0.048 Hz)',
                color: this.colors.hp,
                buffer: this.bufferHP,
                scale: 0.22,
                isVolts: true,
                rect: [margin, margin * 2 + quadH, quadW, quadH]
            },
            {
                name: '4. SALIDA FINAL VO (Av = 835, fc = 106 Hz)',
                color: this.colors.vout,
                buffer: this.bufferVout,
                scale: 2.2,
                isVolts: true,
                rect: [margin * 2 + quadW, margin * 2 + quadH, quadW, quadH]
            }
        ];

        quadrants.forEach(q => {
            const [qx, qy, qw, qh] = q.rect;
            const cy = qy + qh / 2;
            const halfH = qh / 2 - 8;

            this.drawGrid(qx, qy, qw, qh, 8, 4);

            // Título
            ctx.font = 'bold 12px "Outfit", sans-serif';
            ctx.fillStyle = q.color;
            ctx.fillText(q.name, qx + 14, qy + 18);

            // 1er paso: Cálculo estadístico
            let minVal = Infinity, maxVal = -Infinity;
            let sumVal = 0;

            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                const val = q.buffer[bIdx];
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
                sumVal += val;
            }

            const vpp = maxVal - minVal;
            const dc = sumVal / Math.max(1, samplesVisible);

            // Trazo
            ctx.save();
            ctx.strokeStyle = q.color;
            ctx.lineWidth = 2.4;
            ctx.shadowColor = q.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();

            let started = false;
            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                const val = q.buffer[bIdx];

                const x = qx + (i / samplesVisible) * qw;
                let normY;
                if (!q.isVolts) {
                    const dcNorm = (dc / 350.0) * 0.45;
                    const acNorm = ((val - dc) / 2.0) * 0.35;
                    normY = dcNorm + acNorm * this.yZoom;
                } else if (q.buffer === this.bufferOA3) {
                    const dcNorm = (dc / 9.0) * 0.55;
                    const acNorm = ((val - dc) / 0.1) * 0.22;
                    normY = dcNorm + acNorm * this.yZoom;
                } else {
                    normY = (val / q.scale) * this.yZoom;
                }

                if (isNaN(normY) || !isFinite(normY)) normY = 0;
                const y = Math.max(qy + 6, Math.min(qy + qh - 6, cy - normY * halfH));
                if (isNaN(y) || !isFinite(y)) continue;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();

            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillStyle = q.color;
            ctx.textAlign = 'right';
            const vppText = q.isVolts ? `${vpp.toFixed(2)} Vpp` : `${vpp.toFixed(2)} mVpp`;
            const dcText = q.isVolts ? `[DC: ${dc >= 0 ? '+' : ''}${dc.toFixed(2)}V]` : `[DC: ${dc >= 0 ? '+' : ''}${dc.toFixed(1)}mV]`;
            ctx.fillText(`${vppText}  ${dcText}`, qx + qw - 14, qy + 18);
            ctx.textAlign = 'left';
        });
    }

    /**
     * MODO 4: SUPERPUESTO (PANTALLA COMPLETA)
     */
    renderOverlay() {
        const w = this.width;
        const h = this.height;
        const ctx = this.ctx;

        const margin = 12;
        const scopeW = w - margin * 2;
        const scopeH = h - margin * 2;
        const cy = margin + scopeH / 2;

        this.drawGrid(margin, margin, scopeW, scopeH, 10, 8);

        const totalVisibleTime_s = (this.time_div_ms * 10) / 1000.0;
        const samplesVisible = Math.min(this.bufferSize, Math.round(totalVisibleTime_s * this.sampleRate));

        const traces = [
            { name: "Vin (×800 equiv)", color: this.colors.vin, buffer: this.bufferVin, isVin: true, gainFactor: 0.8 },
            { name: "Post-HP (×10)", color: this.colors.hp, buffer: this.bufferHP, isVin: false, gainFactor: 8.0 },
            { name: "Vo Final (Salida ADC)", color: this.colors.vout, buffer: this.bufferVout, isVin: false, gainFactor: 0.4 }
        ];

        traces.forEach(tr => {
            ctx.save();
            ctx.strokeStyle = tr.color;
            ctx.lineWidth = 2.6;
            ctx.shadowColor = tr.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();

            let started = false;
            for (let i = 0; i < samplesVisible; i++) {
                const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
                let val;
                if (tr.isVin) {
                    const acVal = (tr.buffer[bIdx] - (this.measurements.vin_dc_mV || 0)) / 1.5;
                    val = acVal * tr.gainFactor * this.yZoom;
                } else {
                    val = tr.buffer[bIdx] * tr.gainFactor * this.yZoom;
                }
                const x = margin + (i / samplesVisible) * scopeW;
                const y = cy - val * (scopeH / 5);

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        });

        // Leyenda
        ctx.font = 'bold 13px "Outfit", sans-serif';
        let lx = margin + 18;
        traces.forEach(tr => {
            ctx.fillStyle = tr.color;
            ctx.fillText(`● ${tr.name}`, lx, margin + 24);
            lx += 220;
        });
    }

    /**
     * MODO 5: ZOOM EN ETAPA INDIVIDUAL
     */
    renderSingle() {
        const w = this.width;
        const h = this.height;
        const ctx = this.ctx;

        const margin = 12;
        const scopeW = w - margin * 2;
        const scopeH = h - margin * 2;
        const cy = margin + scopeH / 2;

        this.drawGrid(margin, margin, scopeW, scopeH, 10, 8);

        const totalVisibleTime_s = (this.time_div_ms * 10) / 1000.0;
        const samplesVisible = Math.min(this.bufferSize, Math.round(totalVisibleTime_s * this.sampleRate));

        let buf = this.bufferVout;
        let col = this.colors.vout;
        let title = "ETAPA 4: SALIDA FINAL VO (FILTRO PASO BAJO ACTIVO 106 Hz)";
        let scale = 0.5;

        switch (this.singleStageKey) {
            case 'vin':
                buf = this.bufferVin; col = this.colors.vin; title = "ETAPA 1: ENTRADA BIOPOTENCIAL VIN (+250mV Offset DC)"; scale = 60.0; break;
            case 'oa3':
                buf = this.bufferOA3; col = this.colors.oa3; title = "ETAPA 2: SALIDA RESTADOR OA3 (+6.34V DC sin saturar)"; scale = 1.6; break;
            case 'hp':
                buf = this.bufferHP; col = this.colors.hp; title = "ETAPA 3: POST-FILTRO PASO ALTO (Offset Bloqueado a 0.00V)"; scale = 0.05; break;
            case 'vout':
            default:
                buf = this.bufferVout; col = this.colors.vout; title = "ETAPA 4: SALIDA FINAL VO (1.22 Vpp centrada en 0.00V)"; scale = 0.35; break;
        }

        ctx.font = 'bold 14px "Outfit", sans-serif';
        ctx.fillStyle = col;
        ctx.fillText(title, margin + 18, margin + 26);

        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 3.0;
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.beginPath();

        const pixelsPerDivY = scopeH / 8;
        let started = false;
        let minV = Infinity, maxV = -Infinity;

        for (let i = 0; i < samplesVisible; i++) {
            const bIdx = (this.bufferIndex - samplesVisible + i + this.bufferSize) % this.bufferSize;
            const val = buf[bIdx];
            if (val < minV) minV = val;
            if (val > maxV) maxV = val;

            const x = margin + (i / samplesVisible) * scopeW;
            const y = cy - (val / scale) * pixelsPerDivY * this.yZoom;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.restore();

        const vpp = maxV - minV;
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillStyle = col;
        ctx.textAlign = 'right';
        ctx.fillText(`Amplitud Vpp: ${vpp.toFixed(2)}  •  Escala: ${scale}/div`, w - margin - 18, margin + 26);
        ctx.textAlign = 'left';
    }

    /**
     * MODO 6: ANALIZADOR DE ESPECTRO FFT
     */
    renderFFT() {
        const w = this.width;
        const h = this.height;
        const ctx = this.ctx;

        const margin = 12;
        const scopeW = w - margin * 2;
        const scopeH = h - margin * 2;

        this.drawGrid(margin, margin, scopeW, scopeH, 10, 6);

        const N = 512;
        const real = new Float32Array(N);

        for (let i = 0; i < N; i++) {
            const idx = (this.bufferIndex - N + i + this.bufferSize) % this.bufferSize;
            const hann = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (N - 1)));
            real[i] = this.bufferVout[idx] * hann;
        }

        const numFreqs = 300;
        const maxFreq = 150.0;
        const mag = new Float32Array(numFreqs);

        for (let k = 0; k < numFreqs; k++) {
            const f = (k / numFreqs) * maxFreq;
            let sumR = 0, sumI = 0;
            const omega = 2.0 * Math.PI * f / this.sampleRate;
            for (let n = 0; n < N; n++) {
                sumR += real[n] * Math.cos(omega * n);
                sumI -= real[n] * Math.sin(omega * n);
            }
            mag[k] = Math.sqrt(sumR * sumR + sumI * sumI);
        }

        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(margin, h - margin - 30);

        for (let k = 0; k < numFreqs; k++) {
            const x = margin + (k / numFreqs) * scopeW;
            const dB = 20 * Math.log10(mag[k] + 1e-4);
            const y = Math.max(margin + 20, Math.min(h - margin - 30, h - margin - 30 - (dB + 20) * 4.8));
            ctx.lineTo(x, y);
        }

        ctx.lineTo(w - margin, h - margin - 30);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText('0 Hz (Banda Fisiológica)', margin + 14, h - margin - 10);
        ctx.fillText('50 Hz (Red Eléctrica)', margin + (50 / maxFreq) * scopeW - 35, h - margin - 10);
        ctx.fillText('106 Hz (fc Filtro LP)', margin + (106.1 / maxFreq) * scopeW - 40, h - margin - 10);
        ctx.fillText('150 Hz', w - margin - 60, h - margin - 10);

        const x50 = margin + (50 / maxFreq) * scopeW;
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x50, margin + 20);
        ctx.lineTo(x50, h - margin - 30);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();
    }
}

// Exportar para uso global
window.Oscilloscope = Oscilloscope;
