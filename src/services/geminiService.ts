import { GoogleGenAI, Modality } from "@google/genai";

export type StudentLevel = "Primary" | "Secondary" | "Exam";

export interface ExplanationRequest {
  level: StudentLevel;
  subject?: string;
  questionText: string;
  usePidgin: boolean;
  schoolName?: string;
}

export async function generateExplanation(request: ExplanationRequest) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const brandingInstruction = request.schoolName 
    ? `You are teaching on behalf of ${request.schoolName}. Occasionally (but not every time), mention that "${request.schoolName} recommends this method" or subtly reference the school's commitment to excellence. Keep it natural and don't overdo it.`
    : "";

  const systemInstruction = `
    You are "ExamPLE", a highly experienced Nigerian teacher with expertise in Primary, Secondary, and Exam-level (WAEC, NECO, JAMB) education.
    Your goal is to help students learn and excel.
    
    ${brandingInstruction}
    
    Tone: Friendly, motivating, encouraging, and warm. Use typical Nigerian teacher expressions like "My dear student", "Listen carefully", "You can do this!".
    
    Language: Standard English by default. 
    ${request.usePidgin ? "IMPORTANT: The student has requested you speak in Nigerian Pidgin. Use warm, authentic Nigerian Pidgin for the entire explanation." : "Use clear, simple English."}
    
    Output Format (Markdown):
    # Answer
    [Provide a clear, step-by-step solution to the question]
    
    # Explanation
    [Explain the concept behind the answer in a way that is easy to understand, using relatable Nigerian examples if possible (e.g., buying things at the market, sharing chin-chin, etc.)]
    
    ${request.level === "Exam" ? "# Exam Tips\n[Provide specific tips for tackling this type of question in an exam setting like JAMB or WAEC]" : ""}
    
    # Encouragement
    [A final motivating sentence to keep the student going]
  `;

  const prompt = `
    Student Level: ${request.level}
    Subject: ${request.subject || "General"}
    Question: ${request.questionText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash-lite",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.7,
    },
  });

  return response.text;
}

export const TTS_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];

export async function generateAudio(text: string, usePidgin: boolean) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const cleanText = text
    .replace(/#+ /g, '')
    .replace(/\*/g, '')
    .replace(/\[|\]/g, '')
    .slice(0, 1000);

  const prompt = `Say this cheerfully and with the warmth of a Nigerian teacher${usePidgin ? " in Pidgin" : ""}: ${cleanText}`;

  let lastError: unknown;
  for (const model of TTS_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) return base64Audio;
      lastError = new Error("No audio data in response");
    } catch (err) {
      console.error(`generateAudio: model ${model} failed:`, err);
      lastError = err;
    }
  }

  throw lastError ?? new Error("All TTS models failed to generate audio");
}
