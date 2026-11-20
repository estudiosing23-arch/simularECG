/**
 * Simulador de Front-End de ECG basado en LM324 (Webster Fig. 6.18)
 * Motor de Simulación Analítica y Numérica de Circuitos en Tiempo Real
 * Cátedra de Bioinstrumentación - Proyecto de Promoción
 */

class CircuitEngine {
    constructor() {
        // Frecuencia de muestreo del motor interno (Hz)
        this.sampleRate = 1000;
        this.dt = 1.0 / this.sampleRate;

        // --- Parámetros de Componentes Nominales ---
        // Etapa 1: Preamplificador Diferencial (OA1 y OA2)
        this.R1 = 22000;      // 22 kΩ
        this.R2 = 22000;      // 22 kΩ
        this.Rg = 10000;      // 10 kΩ

        // Etapa 2: Restador Diferencial (OA3)
        this.R3 = 10000;      // 10 kΩ
        this.R4 = 10000;      // 10 kΩ
        this.R5 = 47000;      // 47 kΩ
        this.R6 = 47000;      // 47 kΩ nominal
        this.trimpotCMRR = 0; // Desvío relativo de ajuste (-5% a +5%)

        // Etapa 3: Filtro Paso Alto Pasivo y Reset S1
        this.Chp = 1.0e-6;    // 1 µF
        this.Rhp = 3.3e6;     // 3.3 MΩ
        this.isResetPressed = false;
        // Precargar el capacitor con el valor en régimen permanente del offset nominal (+250mV * 25.38 = +6.345V)
        this.v_cap_hp = 6.345;  // +6.345 V (desacopla exactamente la continua a 0.00V)

        // Etapa 4: Amplificador No Inversor y Filtro Paso Bajo Activo (OA4)
        this.Rin4 = 4700;     // 4.7 kΩ
        this.Rf4 = 150000;    // 150 kΩ
        this.Cf4 = 10.0e-9;   // 10 nF (0.01 µF)
        this.v_cap_lp = 0.0;  // Estado interno del polo paso bajo

        // Tensiones de Alimentación Bipolar (Baterías)
        this.Vcc = 9.0;       // +9V
        this.Vee = -9.0;      // -9V
        // Límites reales de excursión de salida del LM324
        this.Vsat_high = 7.5;  // Vcc - 1.5V
        this.Vsat_low = -8.8;  // Vee + 0.2V

        // Estado actual de los nodos de prueba (en Voltios)
        this.nodes = {
            tp1_vin: 0.0,      // Entrada diferencial pura (V)
            tp1_vcm: 0.0,      // Entrada modo común + offset (V)
            tp2_oa1: 0.0,      // Salida OA1
            tp2_oa2: 0.0,      // Salida OA2
            tp3_oa3: 0.0,      // Salida Restador OA3
            tp4_hp: 0.0,       // Salida Filtro Paso Alto
            tp5_vout: 0.0      // Salida Final Acondicionada
        };

        this.updateDerivedGains();
    }

    updateDerivedGains() {
        // Ganancia diferencial Etapa 1: 1 + 2*R1/Rg
        this.Av1_diff = 1.0 + (2.0 * this.R1 / this.Rg); // 5.4

        // Ganancia diferencial Etapa 2: R5 / R3
        this.Av2_diff = this.R5 / this.R3; // 4.7

        // Ganancia Etapa 1+2
        this.Av1_total = this.Av1_diff * this.Av2_diff; // 25.38

        // Constante de tiempo paso alto: tau_hp = Rhp * Chp
        this.tau_hp = this.Rhp * this.Chp; // 3.3 s
        this.fL = 1.0 / (2.0 * Math.PI * this.tau_hp); // 0.0482 Hz

        // Etapa 4: Ganancia DC = 1 + Rf4 / Rin4
        this.Av4_dc = 1.0 + (this.Rf4 / this.Rin4); // 32.91
        this.tau_lp = this.Rf4 * this.Cf4; // 1.5 ms
        this.fH = 1.0 / (2.0 * Math.PI * this.tau_lp); // 106.1 Hz

        // Ganancia Total Nominal
        this.Av_global = this.Av1_total * this.Av4_dc; // ~835 (58.4 dB)
    }

    setTrimpot(value) {
        // value: -1.0 a +1.0
        this.trimpotCMRR = value * 0.05; // hasta 5% de desbalance/balance
    }

    setResetSwitch(pressed) {
        this.isResetPressed = pressed;
    }

    resetBaseline() {
        this.v_cap_hp = this.nodes.tp3_oa3 || 6.345;
        this.v_cap_lp = 0.0;
    }

    clampLM324(val) {
        if (val > this.Vsat_high) return this.Vsat_high;
        if (val < this.Vsat_low) return this.Vsat_low;
        return val;
    }

    /**
     * Procesa una muestra instantánea en el tiempo (dt = 1/sampleRate)
     * @param {number} vin_diff_V - Tensión diferencial de biopotencial (V)
     * @param {number} vin_cm_V - Tensión de modo común (50Hz + Offset DC) (V)
     * @returns {object} Estado de tensiones en cada punto de prueba
     */
    processSample(vin_diff_V, vin_cm_V) {
        this.nodes.tp1_vin = vin_diff_V;
        this.nodes.tp1_vcm = vin_cm_V;

        // 1. Etapa 1: Preamplificador de alta impedancia (OA1 y OA2)
        // Conexión Webster Fig. 6.18 conforme a Derivación II (LL - RA):
        // Electrodo vB = LL (+) conectado a entrada no inversora de OA2
        // Electrodo vA = RA (-) conectado a entrada no inversora de OA1
        // Tensión diferencial de entrada: Vin = vB - vA (onda R positiva)
        const vB = vin_cm_V + (vin_diff_V / 2.0);
        const vA = vin_cm_V - (vin_diff_V / 2.0);

        // Corriente por Rg: ig = (vB - vA) / Rg = vin_diff / Rg
        // Salidas de la primera etapa:
        // OA1 (rama inversora en OA3): vo1 = vA - ig * R1 = vcm - (vin_diff/2) * (1 + 2*R1/Rg)
        // OA2 (rama no inversora en OA3): vo2 = vB + ig * R2 = vcm + (vin_diff/2) * (1 + 2*R2/Rg)
        let vo1 = vin_cm_V - (vin_diff_V / 2.0) * this.Av1_diff;
        let vo2 = vin_cm_V + (vin_diff_V / 2.0) * this.Av1_diff;

        vo1 = this.clampLM324(vo1);
        vo2 = this.clampLM324(vo2);
        this.nodes.tp2_oa1 = vo1;
        this.nodes.tp2_oa2 = vo2;

        // 2. Etapa 2: Restador Diferencial (OA3)
        // OA2 ingresa al divisor no inversor (+) y OA1 ingresa por R3 a la entrada inversora (-)
        // vo3 = (R5/R3) * (vo2 - vo1) = 4.7 * (vin_diff * 5.4) = +25.4 * vin_diff (fase clínica correcta)
        const R6_eff = this.R6 * (1.0 + this.trimpotCMRR);
        const v_pos = vo2 * (R6_eff / (this.R4 + R6_eff));
        let vo3 = v_pos * (1.0 + (this.R5 / this.R3)) - vo1 * (this.R5 / this.R3);
        vo3 = this.clampLM324(vo3);
        this.nodes.tp3_oa3 = vo3;

        // 3. Etapa 3: Filtro Paso Alto Pasivo (Chp y Rhp) + Pulsador S1
        // Ecuación diferencial: d(v_cap_hp)/dt = (vo3 - v_cap_hp) / tau
        // Resistencia efectiva: Rhp normal, o 10 ohms con S1 presionado
        const Reff = this.isResetPressed ? 10.0 : this.Rhp;
        const current_tau = Reff * this.Chp;
        const alpha_hp = Math.exp(-this.dt / current_tau);

        // Actualización de estado del capacitor (voltaje en bornes del capacitor)
        this.v_cap_hp = vo3 - (vo3 - this.v_cap_hp) * alpha_hp;

        // Salida del filtro paso alto (nodo Rhp referenciado a masa):
        // v_node_hp = vo3 - v_cap_hp
        let v_hp = vo3 - this.v_cap_hp;
        this.nodes.tp4_hp = v_hp;

        // 4. Etapa 4: Amplificador No Inversor y Filtro Paso Bajo Activo (OA4)
        // Filtro paso bajo de 1er orden en la realimentación:
        // Tau = Rf4 * Cf4 (1.5 ms -> fc = 106 Hz)
        // En continua la ganancia es (1 + Rf4/Rin4)
        // A frecuencias muy altas la ganancia tiende a 1
        const alpha_lp = Math.exp(-this.dt / this.tau_lp);
        this.v_cap_lp = v_hp + (this.v_cap_lp - v_hp) * alpha_lp;

        // vo4 = v_hp + (Rf4 / Rin4) * v_cap_lp
        let vo4 = v_hp + (this.Rf4 / this.Rin4) * this.v_cap_lp;
        vo4 = this.clampLM324(vo4);
        this.nodes.tp5_vout = vo4;

        return this.nodes;
    }

    /**
     * Calcula la respuesta en frecuencia analítica teórica (Bode)
     */
    getBodeData(f_start = 0.001, f_end = 10000, points = 200) {
        const frequencies = [];
        const magnitude_dB = [];
        const phase_deg = [];

        const logStart = Math.log10(f_start);
        const logEnd = Math.log10(f_end);
        const step = (logEnd - logStart) / (points - 1);

        for (let i = 0; i < points; i++) {
            const f = Math.pow(10, logStart + i * step);
            const w = 2.0 * Math.PI * f;

            // Etapa 1+2 (Av1 = 25.38)
            // Roll-off del LM324 (GBP = 1 MHz -> polo a GBP/Av1 = 39.4 kHz)
            const fc_op1 = 1.0e6 / this.Av1_total;
            const mag1 = this.Av1_total / Math.sqrt(1.0 + Math.pow(f / fc_op1, 2));
            const phase1 = -Math.atan(f / fc_op1);

            // Etapa 3 Filtro Paso Alto: H_hp = (j*w*tau) / (1 + j*w*tau)
            const w_tau_hp = w * this.tau_hp;
            const mag_hp = w_tau_hp / Math.sqrt(1.0 + Math.pow(w_tau_hp, 2));
            const phase_hp = Math.PI / 2.0 - Math.atan(w_tau_hp);

            // Etapa 4 Filtro Paso Bajo Activo No Inversor
            // H4 = 1 + (Rf/Rin) / (1 + j*w*tau_lp)
            const gain_lp = this.Rf4 / this.Rin4;
            const w_tau_lp = w * this.tau_lp;
            // Parte real e imaginaria:
            const re = 1.0 + gain_lp / (1.0 + w_tau_lp * w_tau_lp);
            const im = -gain_lp * w_tau_lp / (1.0 + w_tau_lp * w_tau_lp);
            const mag4_ideal = Math.sqrt(re * re + im * im);
            const phase4_ideal = Math.atan2(im, re);

            // Polo de ancho de banda del LM324 en OA4 (fc ~ 30 kHz)
            const fc_op4 = 1.0e6 / this.Av4_dc;
            const mag4 = mag4_ideal / Math.sqrt(1.0 + Math.pow(f / fc_op4, 2));
            const phase4 = phase4_ideal - Math.atan(f / fc_op4);

            const magTotal = mag1 * mag_hp * mag4;
            const phaseTotal = phase1 + phase_hp + phase4;

            frequencies.push(f);
            magnitude_dB.push(20.0 * Math.log10(magTotal));
            phase_deg.push(phaseTotal * (180.0 / Math.PI));
        }

        return { frequencies, magnitude_dB, phase_deg };
    }
}

// Exportar para uso global
window.CircuitEngine = CircuitEngine;
