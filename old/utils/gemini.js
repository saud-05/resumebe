import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function generateGeminiSummary(text) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const prompt = `
  You are a senior recruiter.
  
  Read the resume below and provide a clear, concise summary (maximum 5 sentences total). 
  Include: the candidate's overall background, experience level, clarity of the resume, and professionalism.
  End your response with a simple recommendation: "Hire" or "No Hire".
  
  Resume:
  ${text}
  `;
  
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }
  const data = await res.json();
  // Gemini returns summary in data.candidates[0].content.parts[0].text
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
} 