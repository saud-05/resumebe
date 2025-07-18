import express from 'express';
import {
  uploadResume,
  uploadResumeMiddleware,
  getResumes,
  getResumeById,
  updateResume,
  deleteResume,
  analyzeResume,
} from '../controller/resumeController.js';

const router = express.Router();

router.post('/upload', uploadResumeMiddleware, uploadResume);
router.post('/analyze/:id', analyzeResume);
router.get('/', getResumes);
router.get('/:id', getResumeById);
router.patch('/:id', updateResume);
router.delete('/:id', deleteResume);

export default router; 