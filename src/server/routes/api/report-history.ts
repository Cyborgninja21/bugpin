import { Hono } from 'hono';
import { reportHistoryService } from '../../services/report-history.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';

const reportHistory = new Hono();

reportHistory.use('*', authMiddleware);

reportHistory.get('/:id/history', validate({ params: schemas.id }), async (c) => {
  const reportId = c.req.param('id');

  const result = await reportHistoryService.listByReport(reportId);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    history: result.value,
  });
});

export { reportHistory as reportHistoryRoutes };
