/**
 * Simulador de Front-End de ECG basado en LM324 (Webster Fig. 6.18)
 * Visor Interactivo de Respuesta en Frecuencia (Diagrama de Bode)
 * Cátedra de Bioinstrumentación - Proyecto de Promoción
 */

class BodeViewer {
    constructor(canvasId, engine) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.engine = engine;
        this.hoverFreq = null;
        this.hoverMag = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupEvents();
        this.render();
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = (rect.width > 0 ? rect.width : 700) * dpr;
        const h = (rect.height > 0 ? rect.height : 450) * dpr;
        this.canvas.width = w;
        this.canvas.height = h;
        this.width = w;
        this.height = h;
        this.render();
    }

    setupEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            const plotLeft = 60;
            const plotRight = this.width - 30;

            if (x >= plotLeft && x <= plotRight) {
                const ratio = (x - plotLeft) / (plotRight - plotLeft);
                const logStart = Math.log10(0.001);
                const logEnd = Math.log10(10000);
                this.hoverFreq = Math.pow(10, logStart + ratio * (logEnd - logStart));
            } else {
                this.hoverFreq = null;
            }
            this.render();
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverFreq = null;
            this.render();
        });
    }

    render() {
        if (!this.ctx || !this.engine) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Fondo cálido grafito oscuro
        ctx.fillStyle = '#14110f';
        ctx.fillRect(0, 0, w, h);

        const plotLeft = 60;
        const plotRight = w - 30;
        const plotTop = 35;
        const plotBottom = h - 45;
        const plotW = plotRight - plotLeft;
        const plotH = plotBottom - plotTop;

        const fMin = 0.001;
        const fMax = 10000;
        const logMin = Math.log10(fMin); // -3
        const logMax = Math.log10(fMax); // 4
        const decCount = logMax - logMin; // 7 décadas

        const minDB = -20;
        const maxDB = 70;

        // Cuadrícula semilogarítmica cálida
        ctx.strokeStyle = '#2d251f';
        ctx.lineWidth = 1;

        // Líneas verticales (décadas y subdivisiones)
        for (let d = logMin; d <= logMax; d++) {
            const xDec = plotLeft + ((d - logMin) / decCount) * plotW;
            ctx.strokeStyle = '#473a30';
            ctx.beginPath();
            ctx.moveTo(xDec, plotTop);
            ctx.lineTo(xDec, plotBottom);
            ctx.stroke();

            // Etiqueta de década
            ctx.fillStyle = '#c4b5a5';
            ctx.font = '10px "JetBrains Mono", monospace';
            const fVal = Math.pow(10, d);
            let lbl = fVal >= 1000 ? `${fVal / 1000}k` : (fVal < 1 ? fVal.toString() : `${fVal}`);
            ctx.fillText(`${lbl}Hz`, xDec - 12, plotBottom + 18);

            // Sub-décadas (2..9)
            if (d < logMax) {
                ctx.strokeStyle = 'rgba(65, 52, 42, 0.35)';
                for (let m = 2; m <= 9; m++) {
                    const xSub = plotLeft + ((Math.log10(m * Math.pow(10, d)) - logMin) / decCount) * plotW;
                    ctx.beginPath();
                    ctx.moveTo(xSub, plotTop);
                    ctx.lineTo(xSub, plotBottom);
                    ctx.stroke();
                }
            }
        }

        // Líneas horizontales de dB
        for (let db = minDB; db <= maxDB; db += 10) {
            const y = plotBottom - ((db - minDB) / (maxDB - minDB)) * plotH;
            ctx.strokeStyle = db === 0 ? '#635244' : '#2d251f';
            ctx.beginPath();
            ctx.moveTo(plotLeft, y);
            ctx.lineTo(plotRight, y);
            ctx.stroke();

            ctx.fillStyle = '#c4b5a5';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.fillText(`${db}dB`, 15, y + 3);
        }

        // Obtener datos del motor analítico
        const bode = this.engine.getBodeData(fMin, fMax, 350);

        // Curva de Magnitud (Ámbar / Oro brillante)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
        ctx.shadowBlur = 6;
        ctx.beginPath();

        for (let i = 0; i < bode.frequencies.length; i++) {
            const f = bode.frequencies[i];
            const mag = bode.magnitude_dB[i];
            const x = plotLeft + ((Math.log10(f) - logMin) / decCount) * plotW;
            const y = plotBottom - ((mag - minDB) / (maxDB - minDB)) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Línea de -3 dB
        const midGain = 58.4;
        const line3dB_y = plotBottom - (((midGain - 3) - minDB) / (maxDB - minDB)) * plotH;
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(plotLeft, line3dB_y);
        ctx.lineTo(plotRight, line3dB_y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Puntos de corte fL (0.048 Hz) y fH (106 Hz)
        const x_fL = plotLeft + ((Math.log10(0.0482) - logMin) / decCount) * plotW;
        const x_fH = plotLeft + ((Math.log10(106.1) - logMin) / decCount) * plotW;

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x_fL, line3dB_y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x_fH, line3dB_y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Anotaciones técnicas
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`fL = 0.048 Hz`, x_fL - 35, line3dB_y - 12);
        ctx.fillText(`fH = 106.1 Hz`, x_fH - 25, line3dB_y - 12);
        ctx.fillText(`Banda Plana Av = 58.4 dB (835)`, plotLeft + 15, plotTop + 20);

        // Hover cursor
        if (this.hoverFreq !== null) {
            const xHover = plotLeft + ((Math.log10(this.hoverFreq) - logMin) / decCount) * plotW;
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(xHover, plotTop);
            ctx.lineTo(xHover, plotBottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Interpolar ganancia aproximada
            const w = 2 * Math.PI * this.hoverFreq;
            const w_tau_hp = w * this.engine.tau_hp;
            const mag_hp = w_tau_hp / Math.sqrt(1 + w_tau_hp * w_tau_hp);
            const w_tau_lp = w * this.engine.tau_lp;
            const mag4 = 1 + (this.engine.Rf4 / this.engine.Rin4) / Math.sqrt(1 + w_tau_lp * w_tau_lp);
            const approxMagDB = 20 * Math.log10(this.engine.Av1_total * mag_hp * mag4);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`f: ${this.hoverFreq.toFixed(3)} Hz | |H|: ${approxMagDB.toFixed(1)} dB`, xHover + 8, plotTop + 45);
        }
    }
}

// Exportar para uso global
window.BodeViewer = BodeViewer;
