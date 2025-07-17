import { prisma } from '../utils/prisma.js';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();
import { generateGeminiSummary } from '../utils/gemini.js';
import fetch from 'node-fetch';
// import pdfParse from 'pdf-parse';
const pdfParse = (await import('pdf-parse')).default;

// Validate required AWS env variables
if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET) {
  throw new Error('Missing AWS S3 configuration in environment variables.');
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer config for S3 upload, PDF only, 5MB limit
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, `resumes/${Date.now()}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

export const uploadResumeMiddleware = upload.single('resume');

export const uploadResume = async (req, res) => {
  try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are allowed.' });
    }
    const { fullName, email } = req.body;
    const filePath = req.file.location;
    // Save resume record in DB
    const resume = await prisma.resume.create({
      data: { fullName, email, filePath },
    });
    res.status(201).json(resume);
  } catch (error) {
    // Handle Multer file size error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'PDF file size must be 5MB or less.' });
    }
    res.status(500).json({ error: error.message });
  }
};

// Get all Resumes (with pagination)
export const getResumes = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const [resumes, total] = await Promise.all([
      prisma.resume.findMany({
        skip,
        take: limit,
        orderBy: { uploadedAt: 'desc' },
      }),
      prisma.resume.count(),
    ]);

    res.status(200).json({ resumes, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Resume by ID
export const getResumeById = async (req, res) => {
  try {
    const { id } = req.params;
    const resume = await prisma.resume.findUnique({ where: { id } });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.status(200).json(resume);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Resume
export const updateResume = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, filePath, aiSummary } = req.body;
    const resume = await prisma.resume.update({
      where: { id },
      data: { fullName, email, filePath, aiSummary },
    });
    res.status(200).json(resume);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Resume
export const deleteResume = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.resume.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const analyzeResume = async (req, res) => {
  try {
    const { id } = req.params;
    // 1. Find resume in DB
    let resume;
    try {
      resume = await prisma.resume.findUnique({ where: { id } });
      if (!resume) {
        console.error('Resume not found for id:', id);
        return res.status(404).json({ error: 'Resume not found.' });
      }
    } catch (err) {
      console.error('DB error while fetching resume:', err);
      return res.status(500).json({ error: 'Database error while fetching resume.' });
    }

    // 2. Download PDF from S3
    let fileRes;
    try {
      fileRes = await fetch(resume.filePath);
      if (!fileRes.ok) throw new Error(`S3 fetch failed: ${fileRes.status} ${fileRes.statusText}`);
    } catch (err) {
      console.error('Failed to fetch resume PDF from S3:', err);
      return res.status(502).json({ error: 'Could not download resume PDF from storage. Please check your S3 permissions and file URL.' });
    }

    // 3. Parse PDF
    let buffer, pdfText;
    try {
      // buffer = await fileRes.arrayBuffer();
      // pdfText = await pdfParse(Buffer.from(buffer));
      buffer = await fileRes.arrayBuffer();
const pdfParse = (await import('pdf-parse')).default; // 👈 dynamic import
pdfText = await pdfParse(Buffer.from(buffer));

      if (!pdfText.text || !pdfText.text.trim()) throw new Error('PDF parsing returned empty text');
    } catch (err) {
      console.error('PDF parsing failed:', err);
      return res.status(422).json({ error: 'Could not extract text from PDF. Please upload a valid, readable PDF file.' });
    }

    // 4. Call Gemini
    let summary;
    try {
      summary = await generateGeminiSummary(pdfText.text);
      if (!summary) throw new Error('Gemini did not return a summary');
    } catch (err) {
      console.error('Gemini API error:', err);
      return res.status(502).json({ error: 'AI analysis failed. Please try again later or check your Gemini API key/quota.' });
    }

    // 5. Save summary in DB
    try {
      const updated = await prisma.resume.update({
        where: { id },
        data: { aiSummary: summary },
      });
      return res.json(updated);
    } catch (err) {
      console.error('DB update failed:', err);
      return res.status(500).json({ error: 'Failed to save summary to database. Please try again.' });
    }
  } catch (error) {
    console.error('Unexpected analyze error:', error);
    return res.status(500).json({ error: 'Unexpected server error. Please try again.' });
  }
}; 