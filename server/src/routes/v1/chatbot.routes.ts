import { Router, Response, NextFunction } from 'express';
import { ChatbotService } from '../../services/chatbot.service';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();
const chatbotService = new ChatbotService();

/**
 * POST /api/v1/chatbot/message
 * Send a message to the AI Assistant. Protected by JWT auth.
 */
router.post(
  '/message',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { message, history } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Message must be a non-empty string.',
          },
        });
        return;
      }

      console.log(`[DEBUG] Chatbot request from user ${userId}: "${message}"`);
      const response = await chatbotService.generateResponse(userId, message, history || []);
      
      res.status(200).json({ data: response });
    } catch (err) {
      console.error('[ChatbotRoute] Error handling chatbot message:', err);
      next(err);
    }
  },
);

export default router;
