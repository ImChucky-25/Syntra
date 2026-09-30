import { Router } from 'express';
import multer from 'multer';
import { uploadFile, listFiles, getFile, deleteFile } from './files.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { MAX_FILE_BYTES } from './extract.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

router.post('/', rateLimit({ windowMs: 60_000, max: 20, name: 'file-upload' }), upload.single('file'), uploadFile);
router.get('/', listFiles);
router.get('/:id', getFile);
router.delete('/:id', deleteFile);

export default router;
