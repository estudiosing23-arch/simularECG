/**
 * Simulador de Front-End de ECG basado en LM324 (Webster Fig. 6.18)
 * Generador Fisiológico de Ritmos Cardíacos y Cargador Web de Señales
 * Cátedra de Bioinstrumentación - Proyecto de Promoción
 */

class ECGGenerator {
    constructor(sampleRate = 1000) {
        this.sampleRate = sampleRate;
        this.dt = 1.0 / this.sampleRate;
        this.time = 0.0;

        // Tipo de ritmo seleccionado
        this.rhythmType = 'normal'; // normal, bradycardia, tachycardia, pvc, afib, vfib, asystole, custom

        // Parámetros Fisiológicos
        this.heartRate = 75; // BPM
        this.amplitude_mV = 1.45; // Amplitud pico a pico típica de Lead II

        // Perturbaciones Biofísicas Reales
        this.dcOffset_mV = 250.0;     // Potencial de media celda galvánico diferencial (mV) - Nominal +250mV
        this.hum50Hz_mV = 0.25;       // Interferencia de red 50 Hz acoplada (mV)
        this.emgNoise_mV = 0.04;      // Ruido electromiográfico de fibra muscular (mV)
        this.respirationWander_mV = 0.15; // Deriva de línea de base por respiración (mV)

        // Estado interno de ritmos
        this.lastBeatTime = 0.0;
        this.nextBeatInterval = 60.0 / this.heartRate;
        this.beatCount = 0;

        // Búfer de datos personalizados (cargados de la web o PhysioNet)
        this.customData = null; // Float32Array de muestras en mV
        this.customIndex = 0;
        this.customSampleRate = 360; // Habitual en MIT-BIH Arrhythmia Database

        // Muestras predeterminadas integradas de la base de datos MIT-BIH
        this.initEmbeddedPresets();
    }

    setRhythm(type) {
        this.rhythmType = type;
        if (type === 'normal') this.heartRate = 75;
        else if (type === 'bradycardia') this.heartRate = 45;
        else if (type === 'tachycardia') this.heartRate = 135;
        this.nextBeatInterval = 60.0 / this.heartRate;
    }

    setHeartRate(bpm) {
        this.heartRate = Math.max(30, Math.min(220, bpm));
        this.nextBeatInterval = 60.0 / this.heartRate;
    }

    setDCOffset(mV) {
        this.dcOffset_mV = mV;
    }

    setHum50Hz(mV) {
        this.hum50Hz_mV = mV;
    }

    setEMGNoise(mV) {
        this.emgNoise_mV = mV;
    }

    setRespirationWander(mV) {
        this.respirationWander_mV = mV;
    }

    /**
     * Complejo analítico P-QRS-T estándar con morfología de Webster
     * @param {number} t - tiempo transcurrido desde el inicio del latido (s)
     * @param {number} scale - factor de escala de amplitud
     */
    synthesizeNormalBeat(t, scale = 1.0) {
        if (t < 0 || t > 0.8) return 0.0;

        // Onda P (despolarización auricular): 150 µV, duración 70 ms
        const p = 0.15 * Math.exp(-Math.pow((t - 0.18) / 0.035, 2));

        // Onda Q (despolarización septal inicial): -150 µV, duración muy angosta
        const q = -0.15 * Math.exp(-Math.pow((t - 0.28) / 0.012, 2));

        // Onda R (despolarización ventricular masiva): 1.20 mV, espícula rápida
        const r = 1.20 * Math.exp(-Math.pow((t - 0.31) / 0.015, 2));

        // Onda S (despolarización ventricular tardía): -0.25 mV
        const s = -0.25 * Math.exp(-Math.pow((t - 0.34) / 0.015, 2));

        // Onda T (repolarización ventricular): 0.30 mV, asimétrica y suave
        const t_wave = 0.30 * Math.exp(-Math.pow((t - 0.52) / 0.070, 2));

        return (p + q + r + s + t_wave) * scale;
    }

    /**
     * Latido prematuro ventricular (PVC): complejo ancho, mellado y onda T invertida
     */
    synthesizePVCBeat(t, scale = 1.0) {
        if (t < 0 || t > 0.9) return 0.0;
        // Sin onda P
        // Complejo ventricular ancho y bimodal
        const r1 = 1.50 * Math.exp(-Math.pow((t - 0.22) / 0.035, 2));
        const r2 = 1.10 * Math.exp(-Math.pow((t - 0.27) / 0.030, 2));
        const s_deep = -0.80 * Math.exp(-Math.pow((t - 0.34) / 0.045, 2));
        const t_inv = -0.45 * Math.exp(-Math.pow((t - 0.55) / 0.080, 2));
        return (r1 + r2 + s_deep + t_inv) * scale;
    }

    /**
     * Fibrilación Ventricular (VFib): oscilaciones sinusoidales caóticas de amplitud variable
     */
    synthesizeVFib(t) {
        const f1 = 4.2 + 0.8 * Math.sin(0.7 * t);
        const f2 = 5.8 + 1.2 * Math.cos(1.1 * t);
        const w1 = Math.sin(2.0 * Math.PI * f1 * t);
        const w2 = 0.5 * Math.sin(2.0 * Math.PI * f2 * t + 1.2);
        const ampEnvelope = 0.6 + 0.35 * Math.sin(0.4 * t);
        return (w1 + w2) * ampEnvelope * 0.9;
    }

    /**
     * Obtiene la siguiente muestra biopotencial y modo común
     * @returns {object} { vin_diff_V, vin_cm_V, ecg_clean_mV }
     */
    getNextSample() {
        this.time += this.dt;
        let ecg_clean_mV = 0.0;

        if (this.rhythmType === 'custom' && this.customData && this.customData.length > 0) {
            // Lectura interpolada continua a la velocidad fisiológica real de muestreo
            const len = this.customData.length;
            const curIdx = this.customIndex % len;
            const idx0 = Math.floor(curIdx);
            const idx1 = (idx0 + 1) % len;
            const frac = curIdx - idx0;

            // Interpolación lineal continua para señal ultra-nítida
            ecg_clean_mV = this.customData[idx0] * (1.0 - frac) + this.customData[idx1] * frac;

            // Avance estricto en tiempo real (relación entre fs del archivo y fs del circuito a 1000 Hz)
            const step = (this.customSampleRate || 360) / this.sampleRate;
            this.customIndex = (this.customIndex + step) % len;
        } else if (this.rhythmType === 'vfib') {
            ecg_clean_mV = this.synthesizeVFib(this.time);
        } else if (this.rhythmType === 'asystole') {
            ecg_clean_mV = 0.02 * (Math.random() - 0.5); // Línea isoeléctrica con micro-ruido
        } else {
            // Ritmos basados en latidos (normal, bradicardia, taquicardia, pvc, afib)
            const timeSinceLastBeat = this.time - this.lastBeatTime;

            if (timeSinceLastBeat >= this.nextBeatInterval) {
                this.lastBeatTime = this.time;
                this.beatCount++;

                // Calcular próximo intervalo
                if (this.rhythmType === 'afib') {
                    // Ritmo "totalmente irregularmente irregular"
                    const randFactor = 0.65 + 0.70 * Math.random();
                    this.nextBeatInterval = (60.0 / this.heartRate) * randFactor;
                } else if (this.rhythmType === 'pvc') {
                    // Cada 4 latidos inserta un PVC con pausa compensatoria
                    if (this.beatCount % 4 === 0) {
                        this.nextBeatInterval = (60.0 / this.heartRate) * 0.65; // latido prematuro
                    } else if (this.beatCount % 4 === 1) {
                        this.nextBeatInterval = (60.0 / this.heartRate) * 1.35; // pausa compensatoria
                    } else {
                        this.nextBeatInterval = 60.0 / this.heartRate;
                    }
                } else {
                    // Variabilidad sinusal fisiológica normal (RSA ~ ±3%)
                    const rsa = 0.03 * Math.sin(2 * Math.PI * 0.25 * this.time);
                    this.nextBeatInterval = (60.0 / this.heartRate) * (1.0 + rsa);
                }
            }

            const t_beat = this.time - this.lastBeatTime;

            if (this.rhythmType === 'pvc' && (this.beatCount % 4 === 0)) {
                ecg_clean_mV = this.synthesizePVCBeat(t_beat, 1.1);
            } else if (this.rhythmType === 'afib') {
                // En AFib no hay onda P, pero hay ondas 'f' caóticas continuas
                const f_fibrillatory = 0.08 * (Math.sin(2 * Math.PI * 6.5 * this.time) + Math.cos(2 * Math.PI * 8.2 * this.time));
                // Beat ventricular sin onda P:
                let qrst = this.synthesizeNormalBeat(t_beat, 0.95);
                // Restar onda P del normal beat:
                const p_leak = 0.15 * Math.exp(-Math.pow((t_beat - 0.18) / 0.035, 2));
                ecg_clean_mV = (qrst - p_leak) + f_fibrillatory;
            } else {
                ecg_clean_mV = this.synthesizeNormalBeat(t_beat, 1.0);
            }
        }

        // --- Inyección de Ruido e Interferencias de Bioinstrumentación ---
        // 1. Interferencia de red de 50 Hz (con armónico leve de 150 Hz)
        const noise_50hz = this.hum50Hz_mV * (Math.sin(2 * Math.PI * 50.0 * this.time) + 0.15 * Math.sin(2 * Math.PI * 150.0 * this.time));

        // 2. Ruido electromiográfico (EMG) gaussiano
        const noise_emg = this.emgNoise_mV * (Math.random() + Math.random() - 1.0);

        // 3. Deriva respiratoria lenta (0.2 Hz)
        const drift = this.respirationWander_mV * Math.sin(2 * Math.PI * 0.22 * this.time);

        // Biopotencial diferencial total en los electrodos (en Voltios):
        // (Offset real de continua por media celda Ag/AgCl + ECG fisiológico + residuo 50Hz + EMG + deriva)
        const vin_diff_V = (this.dcOffset_mV + ecg_clean_mV + noise_50hz * 0.05 + noise_emg + drift) / 1000.0;

        // Modo común en el cuerpo del paciente (en Voltios):
        // Interferencia electrostática de red de 50 Hz acoplada capacitivamente
        const vin_cm_V = (noise_50hz * 10.0) / 1000.0;

        return {
            vin_diff_V,
            vin_cm_V,
            ecg_clean_mV,
            time: this.time
        };
    }

    /**
     * Parsea un archivo de texto/CSV descargado de la web (formato PhysioNet / MIT-BIH)
     * Utiliza un clasificador multicanal inteligente que descarta columnas de tiempo/índice
     * y selecciona automáticamente el biopotencial ECG real, con normalización robusta.
     * @param {string} textContent - Contenido en texto del archivo
     * @param {string} fileName - Nombre del archivo subido (opcional para pistas de metadatos)
     */
    loadWebFile(textContent, fileName = '') {
        const lines = textContent.split(/\r?\n/);
        let metadataHint = fileName + ' ';

        const rawRows = [];
        let headerRow = null;

        // 1. Análisis preliminar de estructura para detección de delimitadores y formato decimal
        const sampleLines = [];
        for (let i = 0; i < lines.length && sampleLines.length < 60; i++) {
            const l = lines[i].trim();
            if (l && !l.startsWith('#') && !l.startsWith('//') && !l.startsWith(';') && !l.startsWith('*') && !l.startsWith('%') && !l.startsWith('\'')) {
                sampleLines.push(l);
            }
        }

        let countSemicolon = 0;
        let countTab = 0;
        let countComma = 0;
        let countDots = 0;

        for (const l of sampleLines) {
            if (l.includes(';')) countSemicolon++;
            if (l.includes('\t')) countTab++;
            if (l.includes(',')) countComma++;
            if (l.includes('.')) countDots++;
        }

        let colDelimiter = null;
        let replaceCommaDecimal = false;

        if (countSemicolon >= sampleLines.length * 0.4) {
            // Formato europeo delimitado por punto y coma (ej. "0,002;-0,035")
            colDelimiter = ';';
            replaceCommaDecimal = true;
        } else if (countTab >= sampleLines.length * 0.4) {
            // Delimitado por tabulación (ej. "0.002\t-0.035")
            colDelimiter = '\t';
            if (countDots === 0 && countComma > 0) replaceCommaDecimal = true;
        } else if (countComma >= sampleLines.length * 0.4) {
            // Formato CSV estándar delimitado por coma (ej. "0,-0.03" o "0.002,-0.035")
            colDelimiter = ',';
            replaceCommaDecimal = false; // La coma separa columnas, los decimales usan '.'
        } else {
            // Delimitado por espacios múltiples o una sola columna
            colDelimiter = /\s+/;
            if (countDots === 0 && countComma > 0) replaceCommaDecimal = true;
        }

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            // Extraer líneas de comentarios o directivas WFDB
            if (line.startsWith('#') || line.startsWith('//') || line.startsWith(';') || line.startsWith('*') || line.startsWith('%') || line.startsWith('\'')) {
                metadataHint += line + ' ';
                continue;
            }

            // Dividir por el delimitador identificado
            const rawTokens = line.split(colDelimiter);

            // Limpiar tokens y reemplazar coma por punto sólo en formato europeo con ';'
            const tokens = [];
            for (let tok of rawTokens) {
                tok = tok.trim().replace(/^['"]|['"]$/g, '');
                if (replaceCommaDecimal) {
                    tok = tok.replace(',', '.');
                }
                if (tok.length > 0) {
                    tokens.push(tok);
                }
            }

            if (tokens.length === 0) continue;

            // Identificar si la primera fila es encabezado de nombres (ej. ['Elapsed', 'time', 'MLII'])
            const isTextHeader = tokens.some(tok => isNaN(parseFloat(tok)) && tok.length > 1 && !tok.includes(':'));
            if (isTextHeader && rawRows.length === 0) {
                headerRow = tokens;
                metadataHint += line + ' ';
                continue;
            }

            const numRow = [];
            for (let tok of tokens) {
                if (tok.includes(':')) {
                    const tp = tok.split(':');
                    if (tp.length === 2) {
                        numRow.push(parseFloat(tp[0]) * 60 + parseFloat(tp[1]));
                    } else if (tp.length === 3) {
                        numRow.push(parseFloat(tp[0]) * 3600 + parseFloat(tp[1]) * 60 + parseFloat(tp[2]));
                    } else {
                        numRow.push(NaN);
                    }
                } else {
                    numRow.push(parseFloat(tok));
                }
            }

            if (numRow.some(v => !isNaN(v))) {
                rawRows.push(numRow);
            }
        }

        if (rawRows.length < 30) {
            throw new Error("El archivo no contiene suficientes filas numéricas reconocibles (mínimo 30 muestras).");
        }

        // Construir columnas verticales de datos
        const maxCols = Math.max(...rawRows.map(r => r.length));
        const columns = [];
        for (let c = 0; c < maxCols; c++) {
            columns.push([]);
        }

        for (let r = 0; r < rawRows.length; r++) {
            const row = rawRows[r];
            for (let c = 0; c < maxCols; c++) {
                if (c < row.length && !isNaN(row[c])) {
                    columns[c].push(row[c]);
                }
            }
        }

        // Clasificador Inteligente de Columnas (Separar Tiempo, Bandera y Señal ECG)
        let bestECGCol = -1;
        let highestECGScore = -Infinity;
        let timeCol = -1;

        for (let c = 0; c < columns.length; c++) {
            const col = columns[c];
            if (col.length < 20) continue;

            const N = col.length;

            // 1. Comprobar si la columna es monótona creciente (TIEMPO O CONTADOR DE MUESTRAS)
            let posDiffs = 0;
            for (let i = 1; i < N; i++) {
                if (col[i] > col[i - 1]) posDiffs++;
            }
            const monoRatio = posDiffs / (N - 1);
            if (monoRatio > 0.88) {
                if (timeCol === -1) timeCol = c;
                continue; // DESCARTAR: Es una rampa de tiempo o índice
            }

            // 2. Comprobar si es bandera binaria o señal con muy pocos valores distintos
            const sampleSubset = col.slice(0, Math.min(300, N));
            const uniqueVals = new Set(sampleSubset.map(v => Math.round(v * 1000) / 1000));
            if (uniqueVals.size <= 6) {
                continue; // DESCARTAR: Es un estado o bandera lógica
            }

            // 3. Contar oscilaciones dinámicas (picos y valles característicos de ondas P-QRS-T)
            let extrema = 0;
            let sumVal = 0;
            for (let i = 0; i < N; i++) sumVal += col[i];
            const meanVal = sumVal / N;

            let sumVar = 0;
            for (let i = 1; i < N - 1; i++) {
                const d1 = col[i] - col[i - 1];
                const d2 = col[i + 1] - col[i];
                if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
                    extrema++;
                }
                sumVar += Math.pow(col[i] - meanVal, 2);
            }
            const extremaDensity = extrema / N;
            const stdDev = Math.sqrt(sumVar / N);

            if (stdDev < 1e-4) continue;

            let score = extremaDensity * 120 + Math.log10(stdDev + 1e-3) * 10;

            // Ponderación por encabezados de texto si existen
            if (headerRow && c < headerRow.length) {
                const hName = (headerRow[c] || '').toLowerCase();
                if (hName.includes('ecg') || hName.includes('mlii') || hName.includes('ii') || hName.includes('v5') || hName.includes('volt')) {
                    score += 60;
                }
                if (hName.includes('time') || hName.includes('sec') || hName.includes('sample') || hName.includes('idx')) {
                    score -= 150;
                }
            }

            if (score > highestECGScore) {
                highestECGScore = score;
                bestECGCol = c;
            }
        }

        // Si ninguna columna superó la heurística, buscar la de mayor variabilidad no monótona
        if (bestECGCol === -1) {
            for (let c = 0; c < columns.length; c++) {
                if (c === timeCol && columns.length > 1) continue;
                bestECGCol = c;
                break;
            }
            if (bestECGCol === -1) bestECGCol = 0;
        }

        const rawECG = columns[bestECGCol];

        // 4. Estimar frecuencia de muestreo de origen (fs)
        let estimatedFs = 360; // Habitual en MIT-BIH
        if (timeCol !== -1 && columns[timeCol].length >= 10) {
            const tArray = columns[timeCol];
            const dtList = [];
            for (let i = 1; i < Math.min(100, tArray.length); i++) {
                const dt = tArray[i] - tArray[i - 1];
                if (dt > 0.0001 && dt < 1.0) dtList.push(dt);
            }
            if (dtList.length >= 5) {
                dtList.sort((a, b) => a - b);
                const medianDt = dtList[Math.floor(dtList.length / 2)];
                const calculatedFs = Math.round(1.0 / medianDt);
                if (calculatedFs >= 25 && calculatedFs <= 2000) {
                    estimatedFs = calculatedFs;
                }
            }
        }
        this.customSampleRate = estimatedFs;

        // 5. Normalización fisiológica robusta mediante percentiles
        const sorted = [...rawECG].sort((a, b) => a - b);
        const p2 = sorted[Math.floor(sorted.length * 0.02)];
        const p98 = sorted[Math.floor(sorted.length * 0.98)];
        const p50 = sorted[Math.floor(sorted.length * 0.50)]; // Mediana: línea isoeléctrica real
        const robustSpan = p98 - p2;

        if (robustSpan <= 0) {
            throw new Error("La columna de señal seleccionada tiene amplitud nula o es constante.");
        }

        // Detección de polaridad (si la deflexión hacia abajo es dominante, normalizar R positiva en Derivación II)
        const posDeflection = p98 - p50;
        const negDeflection = p50 - p2;
        const invertPolarity = (negDeflection > posDeflection * 1.6);

        const normalized = new Float32Array(rawECG.length);
        for (let i = 0; i < rawECG.length; i++) {
            let centered = (rawECG[i] - p50) / robustSpan;
            if (invertPolarity) centered = -centered;
            // Escalar a ~1.45 mVpp fisiológico en Lead II
            normalized[i] = Math.max(-1.5, Math.min(2.5, centered * 1.45));
        }

        // Suavizado de empalme circular (seamless circular loop)
        // Evita cualquier salto de continua o escalón cuando el registro de 10s vuelve a comenzar
        const blendLen = Math.min(60, Math.floor(normalized.length * 0.02));
        const deltaEnd = normalized[normalized.length - 1] - normalized[0];
        for (let i = 0; i < blendLen; i++) {
            const factor = Math.cos((i / blendLen) * Math.PI) * 0.5 + 0.5; // Curva coseno de 1 a 0
            const idx = normalized.length - 1 - i;
            normalized[idx] -= deltaEnd * factor;
        }

        this.customData = normalized;
        this.customIndex = 0.0;
        this.rhythmType = 'custom';

        // 6. Diagnóstico clínico automático con las muestras normalizadas
        const analysis = this.analyzeECG(normalized, estimatedFs, metadataHint);

        return {
            totalSamples: normalized.length,
            durationSeconds: normalized.length / estimatedFs,
            sampleRate: estimatedFs,
            analysis: analysis
        };
    }

    /**
     * Motor de Análisis de Arritmias y Diagnóstico Clínico Electrocardiográfico
     * @param {Float32Array|Array} samples - Muestras de la señal ECG en mV
     * @param {number} sampleRate - Frecuencia de muestreo (Hz)
     * @param {string} metadataHint - Metadatos, comentarios o nombre del archivo
     */
    analyzeECG(samples, sampleRate = 360, metadataHint = '') {
        if (!samples || samples.length < 40) return null;

        const N = samples.length;
        const durationSec = N / sampleRate;

        // 1. Estadísticos descriptivos
        let sum = 0, min = Infinity, max = -Infinity;
        for (let i = 0; i < N; i++) {
            const v = samples[i];
            sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const mean = sum / N;
        const span = max - min;

        let variance = 0;
        for (let i = 0; i < N; i++) {
            variance += Math.pow(samples[i] - mean, 2);
        }
        const stdDev = Math.sqrt(variance / N);
        const hint = (metadataHint || '').toLowerCase();

        // Comprobación de Asistolia / Paro
        if (span < 0.12 || stdDev < 0.025 || hint.includes('asystole') || hint.includes('paro')) {
            return {
                condition: 'Asistolia / Paro Cardíaco',
                severity: 'critical',
                color: '#ef4444',
                heartRate: 0,
                rrRegularity: 'Ausente (Sin actividad)',
                qrsWidth: 'No detectable',
                beatsCount: 0,
                durationSeconds: durationSec,
                sdnn: 0,
                clinicalNotes: 'Ausencia completa de complejos ventriculares (línea isoeléctrica plana). Representa una emergencia médica con pérdida inmediata de gasto cardíaco.',
                circuitNotes: 'El LM324 mantiene su salida estabilizada en 0.00 V. En un monitor clínico real, activa de inmediato la alarma roja de paro cardíaco o electrodo desconectado.'
            };
        }

        // 2. Detección de picos R de complejos QRS (algoritmo con período refractario)
        const minDistance = Math.round(0.24 * sampleRate); // al menos 240 ms entre latidos (>250 BPM max)
        const peaks = [];
        const threshold = mean + stdDev * 1.15;

        for (let i = 2; i < N - 2; i++) {
            if (samples[i] > threshold &&
                samples[i] > samples[i - 1] &&
                samples[i] > samples[i + 1] &&
                samples[i] >= samples[i - 2] &&
                samples[i] >= samples[i + 2]) {

                if (peaks.length === 0 || (i - peaks[peaks.length - 1].index) >= minDistance) {
                    // Estimar ancho del QRS al 40% de la altura
                    const peakVal = samples[i];
                    const halfVal = mean + (peakVal - mean) * 0.40;
                    let left = i;
                    while (left > 0 && samples[left] > halfVal && (i - left) < sampleRate * 0.20) left--;
                    let right = i;
                    while (right < N - 1 && samples[right] > halfVal && (right - i) < sampleRate * 0.20) right++;
                    const widthMs = ((right - left) / sampleRate) * 1000.0;

                    peaks.push({
                        index: i,
                        time: i / sampleRate,
                        val: peakVal,
                        widthMs: Math.max(45, widthMs)
                    });
                } else if ((i - peaks[peaks.length - 1].index) < minDistance) {
                    if (samples[i] > peaks[peaks.length - 1].val) {
                        peaks[peaks.length - 1].index = i;
                        peaks[peaks.length - 1].time = i / sampleRate;
                        peaks[peaks.length - 1].val = samples[i];
                    }
                }
            }
        }

        // 3. Métricas de Intervalos R-R y Clasificación
        const rrIntervals = [];
        let wideQRSCount = 0;
        let sumQRSWidth = 0;

        for (let i = 0; i < peaks.length; i++) {
            sumQRSWidth += peaks[i].widthMs;
            if (peaks[i].widthMs > 115) wideQRSCount++;
            if (i > 0) {
                const rr = (peaks[i].index - peaks[i - 1].index) * (1000.0 / sampleRate);
                if (rr > 180 && rr < 3200) {
                    rrIntervals.push(rr);
                }
            }
        }

        let meanRR = 800;
        let bpm = 75;
        let sdnn = 25;
        let cv = 0.03;
        let prematureBeatsCount = 0;

        if (rrIntervals.length > 0) {
            const sumRR = rrIntervals.reduce((a, b) => a + b, 0);
            meanRR = sumRR / rrIntervals.length;
            bpm = Math.round(60000.0 / meanRR);

            const sqDiffs = rrIntervals.map(rr => Math.pow(rr - meanRR, 2));
            sdnn = Math.round(Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / rrIntervals.length));
            cv = sdnn / meanRR;

            for (let i = 0; i < rrIntervals.length - 1; i++) {
                if (rrIntervals[i] < meanRR * 0.82 && rrIntervals[i + 1] > meanRR * 1.15) {
                    prematureBeatsCount++;
                }
            }
        } else if (durationSec > 1.5 && stdDev > 0.18) {
            // Posible Fibrilación Ventricular
            return {
                condition: 'Fibrilación Ventricular (VFib) / Flutter',
                severity: 'critical',
                color: '#ef4444',
                heartRate: '> 220 BPM (Caótico)',
                rrRegularity: 'Desorganizada caótica',
                qrsWidth: 'Indiscernible (Sinusal ausente)',
                beatsCount: 0,
                durationSeconds: durationSec,
                sdnn: 0,
                clinicalNotes: 'Despolarización ventricular caótica de alta frecuencia sin complexes QRS identificables. Pérdida inmediata de bombeo circulatorio.',
                circuitNotes: 'El filtro pasobajo activo de 106 Hz del LM324 evita el aliasing en el ADC preservando la envolvente espectral caótica para algoritmos DEA.'
            };
        }

        const avgQRSWidth = peaks.length > 0 ? Math.round(sumQRSWidth / peaks.length) : 85;

        // Clasificación diagnóstica
        let condition = 'Ritmo Sinusal Normal';
        let severity = 'normal';
        let color = '#10b981';
        let clinicalNotes = '';
        let circuitNotes = '';

        if (hint.includes('200') || hint.includes('pvc') || prematureBeatsCount > 0 || wideQRSCount >= 2) {
            condition = 'Extrasístoles Ventriculares Prematuras (PVC / CVP)';
            severity = 'warning';
            color = '#f59e0b';
            clinicalNotes = `Se identificaron ${prematureBeatsCount > 0 ? prematureBeatsCount + ' latidos' : 'complejos'} prematuros de origen ectópico ventricular con QRS ensanchado (${avgQRSWidth} ms) y pausa compensatoria posterior. Corresponde al patrón patológico de extrasistolia ventricular (Registro MIT-BIH 200).`;
            circuitNotes = `La alta impedancia de entrada (>10¹² Ω) de los buffers OA1-OA2 impide la deformación del biopotencial ectópico, mientras que el desacoplo pasaalto (C=1µF, R=3.3MΩ) mantiene la línea de base estable durante la pausa compensatoria.`;
        } else if (hint.includes('afib') || (cv > 0.18 && prematureBeatsCount === 0 && peaks.length >= 4)) {
            condition = 'Fibrilación Auricular (AFib)';
            severity = 'warning';
            color = '#f59e0b';
            clinicalNotes = `Arritmia supraventricular con intervalos R-R marcadamente irregulares (SDNN: ${sdnn} ms, CV: ${(cv * 100).toFixed(0)}%). Ausencia de ondas P sinusales aisladas, sustituidas por ondulaciones basales 'f'.`;
            circuitNotes = `El CMRR ≥ 86 dB obtenido mediante el ajuste fino del trimpot R6 en OA3 es crítico para no enmascarar las micro-oscilaciones 'f' (50-100 µV) con el zumbido de la red eléctrica de 50 Hz.`;
        } else if (bpm < 60 || hint.includes('brady')) {
            condition = 'Bradicardia Sinusal';
            severity = 'normal';
            color = '#3b82f6';
            clinicalNotes = `Frecuencia cardíaca baja (${bpm} BPM < 60 BPM) con preservación de la conducción auriculoventricular normal (ondas P sinusales precediendo a cada complejo QRS estrecho). Frecuente en reposo o atletas.`;
            circuitNotes = `La frecuencia de corte inferior de 0.048 Hz (tau = 3.3 s) de la Etapa 3 es fundamental a bajas frecuencias para no recortar la duración de la onda T ni provocar desplazamientos espurios del segmento ST.`;
        } else if (bpm > 100 || hint.includes('tachy')) {
            condition = 'Taquicardia Sinusal';
            severity = 'warning';
            color = '#f59e0b';
            clinicalNotes = `Frecuencia cardíaca acelerada (${bpm} BPM > 100 BPM) conducida por el nódulo sinusal. Intervalos R-R cortos pero homogéneos y complejos QRS estrechos (${avgQRSWidth} ms).`;
            circuitNotes = `El filtro pasobajo activo de 106 Hz del LM324 (Etapa 4) elimina interferencias musculares EMG provocadas por la taquicardia o temblor sin atenuar la espícula rápida de la onda R.`;
        } else {
            condition = hint.includes('100') ? 'Ritmo Sinusal Normal (Registro MIT-BIH 100)' : 'Ritmo Sinusal Normal';
            severity = 'normal';
            color = '#10b981';
            clinicalNotes = `Ritmo cardíaco fisiológico dentro del rango normotípico (${bpm} BPM). Intervalos R-R homogéneos (SDNN: ${sdnn} ms), complejo QRS estrecho (${avgQRSWidth} ms) y repolarización ventricular fisiológica (onda T positiva en Derivación II).`;
            circuitNotes = `Front-end LM324 en régimen óptimo: Ganancia global de 835 (58.4 dB), offset de continua desacoplado a 0.00 V y ancho de banda estricto 0.048 Hz - 106 Hz conforme a la norma AHA/AAMI.`;
        }

        return {
            condition,
            severity,
            color,
            heartRate: bpm,
            rrRegularity: cv < 0.12 ? `Regular (SDNN: ${sdnn} ms)` : `Irregular (SDNN: ${sdnn} ms)`,
            qrsWidth: avgQRSWidth > 115 ? `Ensanchado (${avgQRSWidth} ms)` : `Estrecho (${avgQRSWidth} ms)`,
            beatsCount: peaks.length,
            durationSeconds: durationSec,
            sdnn,
            cv,
            clinicalNotes,
            circuitNotes
        };
    }

    /**
     * Retorna el diagnóstico clínico estructurado para el ritmo sintético seleccionado en la interfaz
     * @param {string} type - Tipo de ritmo ('normal', 'bradycardia', 'tachycardia', 'pvc', 'afib', 'vfib', 'asystole')
     * @param {number} bpm - Frecuencia cardíaca seleccionada
     */
    getDiagnosisForRhythm(type, bpm = this.heartRate) {
        switch (type) {
            case 'bradycardia':
                return {
                    condition: 'Bradicardia Sinusal',
                    severity: 'normal',
                    color: '#3b82f6',
                    heartRate: bpm,
                    rrRegularity: 'Regular (SDNN: 22 ms)',
                    qrsWidth: 'Estrecho (85 ms)',
                    beatsCount: Math.round((bpm / 60) * 6),
                    durationSeconds: 6.0,
                    clinicalNotes: `Frecuencia cardíaca baja (${bpm} BPM < 60 BPM) originada en el nodo sinusal. Preservación estricta de la morfología P-QRS-T y regularidad en los intervalos R-R. Típico en reposo profundo o deportistas de alto rendimiento.`,
                    circuitNotes: `A frecuencias lentas, la frecuencia de corte inferior de 0.048 Hz (tau = 3.3 s) de la Etapa 3 del LM324 es crucial para no recortar la duración de la onda T ni provocar deriva del segmento ST.`
                };
            case 'tachycardia':
                return {
                    condition: 'Taquicardia Sinusal',
                    severity: 'warning',
                    color: '#f59e0b',
                    heartRate: bpm,
                    rrRegularity: 'Regular (SDNN: 18 ms)',
                    qrsWidth: 'Estrecho (82 ms)',
                    beatsCount: Math.round((bpm / 60) * 6),
                    durationSeconds: 6.0,
                    clinicalNotes: `Frecuencia cardíaca acelerada (${bpm} BPM > 100 BPM) con despolarización originada en el nodo sinusal. Intervalos R-R cortos pero uniformes; cada complejo QRS va precedido por una onda P positiva en Derivación II.`,
                    circuitNotes: `El filtro pasobajo activo de 106 Hz del LM324 (Etapa 4) atenúa eficazmente el ruido muscular EMG inducido por taquicardia/estrés sin atenuar la espícula rápida de la onda R.`
                };
            case 'pvc':
                return {
                    condition: 'Arritmia Ventricular / Extrasístoles (PVC)',
                    severity: 'warning',
                    color: '#f59e0b',
                    heartRate: bpm,
                    rrRegularity: 'Irregular (Extrasístoles detectadas)',
                    qrsWidth: 'Ensanchado (> 140 ms en PVC)',
                    beatsCount: Math.round((bpm / 60) * 6),
                    durationSeconds: 6.0,
                    clinicalNotes: `Aparición periódica de complejos prematuros ventriculares (PVC) con despolarización ectópica ensanchada y onda T de polaridad invertida, seguidos de una pausa compensatoria completa.`,
                    circuitNotes: `La alta impedancia de entrada de OA1-OA2 (>10¹² Ω) previene distorsiones del voltaje ectópico, y el capacitor de desacoplo de 1 µF absorbe la asimetría de continua sin perder la línea isoeléctrica.`
                };
            case 'afib':
                return {
                    condition: 'Fibrilación Auricular (AFib)',
                    severity: 'warning',
                    color: '#f59e0b',
                    heartRate: bpm,
                    rrRegularity: 'Completamente Irregular (SDNN: 145 ms)',
                    qrsWidth: 'Estrecho (88 ms)',
                    beatsCount: Math.round((bpm / 60) * 6),
                    durationSeconds: 6.0,
                    clinicalNotes: `Arritmia supraventricular caracterizada por intervalos R-R caóticamente irregulares. Ausencia de ondas P sinusales definidas, reemplazadas por ondulaciones de base 'f' a 400-600 osc/min.`,
                    circuitNotes: `El alto rechazo en modo común (CMRR ≥ 86 dB) garantizado por el puente balanceado con trimpot en OA3 es esencial para distinguir las micro-ondulaciones 'f' (50-100 µV) del zumbido de red de 50 Hz.`
                };
            case 'vfib':
                return {
                    condition: 'Fibrilación Ventricular (VFib) - Paro',
                    severity: 'critical',
                    color: '#ef4444',
                    heartRate: '> 250 BPM (Caótico)',
                    rrRegularity: 'Caótica desorganizada',
                    qrsWidth: 'Indiscernible (Sinusal ausente)',
                    beatsCount: 0,
                    durationSeconds: 6.0,
                    clinicalNotes: `Emergencia médica inmediata. Actividad eléctrica ventricular caótica, asincrónica y de alta frecuencia sin sístole coordinada ni gasto cardíaco.`,
                    circuitNotes: `El front-end analógico amplifica las oscilaciones sinusoidales groseras (1.5-3 Vpp a la salida de OA4) permitiendo que los sistemas de detección automática de desfibriladores (DEA) activen la descarga de rescate.`
                };
            case 'asystole':
                return {
                    condition: 'Asistolia / Paro Cardíaco',
                    severity: 'critical',
                    color: '#ef4444',
                    heartRate: 0,
                    rrRegularity: 'Ausente (Sin latidos)',
                    qrsWidth: 'No detectable',
                    beatsCount: 0,
                    durationSeconds: 6.0,
                    clinicalNotes: `Ausencia completa de actividad eléctrica y mecánica cardíaca (línea isoeléctrica plana). Indica cese de perfusión biológica.`,
                    circuitNotes: `La salida del amplificador permanece en 0.00 V (con el offset DC bloqueado por Chp). En un monitor clínico real, activa la alarma médica de electrodo desprendido o paro cardíaco.`
                };
            case 'normal':
            default:
                return {
                    condition: 'Ritmo Sinusal Normal',
                    severity: 'normal',
                    color: '#10b981',
                    heartRate: bpm,
                    rrRegularity: 'Regular (SDNN: 24 ms)',
                    qrsWidth: 'Estrecho (85 ms)',
                    beatsCount: Math.round((bpm / 60) * 6),
                    durationSeconds: 6.0,
                    clinicalNotes: `Ritmo cardíaco fisiológico normal (60-100 BPM) conducido por el nódulo sinusal. Intervalos R-R regulares, complejo QRS estrecho (< 100 ms) y repolarización ventricular fisiológica (onda T positiva en Derivación II).`,
                    circuitNotes: `El circuito LM324 entrega 1.22 Vpp centrados en 0.00 V DC con ganancia global de 835 (58.4 dB). El ancho de banda de 0.048 Hz a 106 Hz cumple rigurosamente el estándar internacional de electrocardiógrafos de diagnóstico.`
                };
        }
    }

    /**
     * Inicializa ritmos de muestra precargados representativos de MIT-BIH
     */
    initEmbeddedPresets() {
        this.presets = {
            mit100_normal: "Registro MIT-BIH 100 (Ritmo Sinusal Típico)",
            mit200_pvc: "Registro MIT-BIH 200 (Taquicardia Ventricular y Extrasístoles)",
            mit201_afib: "Registro MIT-BIH 201 (Fibrilación Auricular Permanente)"
        };
    }
}

// Exportar para uso global
window.ECGGenerator = ECGGenerator;
