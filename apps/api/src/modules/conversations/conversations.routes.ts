import { Router } from 'express';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
} from './conversations.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();
router.use(requireAuth);
router.get('/', listConversations);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.patch('/:id', updateConversation);
router.delete('/:id', deleteConversation);

export default router;
