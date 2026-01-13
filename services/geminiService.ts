
import { GoogleGenAI, Type } from "@google/genai";
import { StructuredReport } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * Transcribes audio data using gemini-3-flash-preview
 */
export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio,
          },
        },
        {
          text: `Actúa como un transcriptor médico experto. Tu tarea es transcribir el audio adjunto siguiendo estas reglas estrictas:

          1. INTERPRETACIÓN DE PUNTUACIÓN:
             - NO escribas las palabras de puntuación dictadas. Interprétalas directamente en el texto.
             - "punto aparte": Termina el párrafo y comienza uno nuevo.
             - "punto seguido" o "punto": Inserta un punto '.' y continúa.
             - "punto y coma": Inserta ';'.
             - "coma": Inserta ','.
             - "dos puntos": Inserta ':'.

          2. EDICIÓN CLÍNICA Y CORRECCIONES (CRÍTICO):
             - El orador puede cometer errores, dudar o corregirse a sí mismo (ejemplo: "no muestra signos de... no a ver, presenta..."). 
             - Debes INTERPRETAR la intención del orador. Si se corrige, elimina la parte errónea o la duda y deja solo la versión final coherente.
             - Elimina muletillas como "ehh", "mmm", "o sea", "no a ver", "perdón", "digo" cuando se usen como parte de una corrección o duda.
             - Asegura que la oración final tenga sentido médico y gramatical perfecto.

          3. PRECISIÓN MÉDICA:
             - Mantén todos los términos técnicos médicos con absoluta precisión.
             - El resultado debe ser un texto limpio, profesional y listo para un informe clínico formal.
             
          Ejemplo de interpretación:
          Audio: "Riñón derecho mide... no a ver, riñón izquierdo mide 10 centímetros punto aparte"
          Resultado: "Riñón izquierdo mide 10 centímetros."`,
        },
      ],
    },
  });

  return response.text || "";
}

/**
 * Refines raw transcription into a structured medical report using gemini-3-pro-preview with Thinking Mode
 */
export async function refineMedicalReport(rawText: string): Promise<StructuredReport> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `
      Convierte la siguiente transcripción médica en un reporte estructurado.
      El texto ya ha sido limpiado y puntuado. Tu trabajo es organizarlo en secciones profesionales.
      Usa terminología médica profesional.
      Identifica y separa la información en estas categorías: 
      - Identificación del Paciente (si se menciona)
      - Antecedentes/Historia Clínica
      - Hallazgos/Exploración
      - Impresión Diagnóstica
      - Plan/Recomendaciones

      Transcripción:
      ${rawText}
    `,
    config: {
      thinkingConfig: { thinkingBudget: 32768 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          patientInfo: { type: Type.STRING, description: "Nombre del paciente, edad, etc." },
          clinicalHistory: { type: Type.STRING, description: "Síntomas y antecedentes." },
          findings: { type: Type.STRING, description: "Resultados de exámenes o hallazgos físicos." },
          diagnosis: { type: Type.STRING, description: "Evaluación o diagnóstico presuntivo." },
          plan: { type: Type.STRING, description: "Tratamiento y seguimiento." },
        },
        required: ["findings", "diagnosis", "plan"],
      }
    },
  });

  try {
    const data = JSON.parse(response.text || "{}");
    return {
      ...data,
      originalText: rawText
    };
  } catch (e) {
    console.error("Failed to parse AI response as JSON", e);
    return {
      findings: "Error procesando la estructura del reporte.",
      diagnosis: "No se pudo estructurar la información.",
      plan: "Por favor revise el texto de la transcripción.",
      originalText: rawText
    };
  }
}
