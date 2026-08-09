import { Router } from 'express';
import { storyController } from './story.controller.js';
import { createStorySchema, feedQuerySchema, storyIdParamSchema } from './story.validation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { storyMediaUpload } from './storyMediaUpload.js';

export const storyRouter: Router = Router();

storyRouter.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     StoryMedia:
 *       type: object
 *       properties:
 *         publicId: { type: string }
 *         url: { type: string }
 *         width: { type: integer }
 *         height: { type: integer }
 *         resourceType: { type: string, enum: [IMAGE, VIDEO] }
 *         durationMs: { type: integer }
 *     Story:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         authorId: { type: string }
 *         media:
 *           $ref: '#/components/schemas/StoryMedia'
 *         caption: { type: string }
 *         expiresAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 *         hasViewed: { type: boolean }
 *         hasLiked: { type: boolean }
 *         likeCount: { type: integer }
 *         viewCount: { type: integer }
 *     StoryFeedItem:
 *       type: object
 *       properties:
 *         author:
 *           type: object
 *           properties:
 *             id: { type: string }
 *             displayName: { type: string }
 *             avatarUrl: { type: string, nullable: true }
 *         stories:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Story'
 *         latestAt: { type: string, format: date-time }
 *     StoryViewer:
 *       type: object
 *       properties:
 *         userId: { type: string }
 *         displayName: { type: string }
 *         avatarUrl: { type: string, nullable: true }
 *         viewedAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /stories:
 *   post:
 *     summary: Create a story (image or video media + optional caption)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [media]
 *             properties:
 *               media: { type: string, format: binary }
 *               caption: { type: string, maxLength: 500 }
 *     responses:
 *       201:
 *         description: Created story
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   $ref: '#/components/schemas/Story'
 *       422:
 *         description: Invalid file type, missing file, or invalid caption
 *       429:
 *         description: Rate limited
 */
storyRouter.post(
  '/',
  storyMediaUpload.single('media'),
  validate({ body: createStorySchema }),
  asyncHandler(storyController.create),
);

/**
 * @swagger
 * /stories/feed:
 *   get:
 *     summary: Active stories grouped by author (community feed)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Grouped feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StoryFeedItem'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *                     total: { type: integer }
 *                     totalPages: { type: integer }
 */
storyRouter.get('/feed', validate({ query: feedQuerySchema }), asyncHandler(storyController.feed));

/**
 * @swagger
 * /stories/{storyId}:
 *   get:
 *     summary: Get a single active story (viewer-aware)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: storyId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Story
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   $ref: '#/components/schemas/Story'
 *       404:
 *         description: Story not found or expired
 */
storyRouter.get(
  '/:storyId',
  validate({ params: storyIdParamSchema }),
  asyncHandler(storyController.getById),
);

/**
 * @swagger
 * /stories/{storyId}:
 *   delete:
 *     summary: Delete your own story (hard delete + view cascade)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: storyId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Not the story author
 *       404:
 *         description: Story not found
 */
storyRouter.delete(
  '/:storyId',
  validate({ params: storyIdParamSchema }),
  asyncHandler(storyController.remove),
);

/**
 * @swagger
 * /stories/{storyId}/views:
 *   post:
 *     summary: Mark the story as viewed (idempotent)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: storyId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Marked (or already) viewed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     viewed: { type: boolean }
 *       404:
 *         description: Story not found or expired
 */
storyRouter.post(
  '/:storyId/views',
  validate({ params: storyIdParamSchema }),
  asyncHandler(storyController.markViewed),
);

/**
 * @swagger
 * /stories/{storyId}/like:
 *   put:
 *     summary: Like a story (idempotent)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: storyId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Liked (or already liked)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     liked: { type: boolean }
 *                     likeCount: { type: integer }
 *       404:
 *         description: Story not found or expired
 */
storyRouter.put(
  '/:storyId/like',
  validate({ params: storyIdParamSchema }),
  asyncHandler(storyController.like),
);

/**
 * @swagger
 * /stories/{storyId}/like:
 *   delete:
 *     summary: Unlike a story (idempotent)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: storyId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Unliked (or already unliked)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     liked: { type: boolean }
 *                     likeCount: { type: integer }
 *       404:
 *         description: Story not found or expired
 */
storyRouter.delete(
  '/:storyId/like',
  validate({ params: storyIdParamSchema }),
  asyncHandler(storyController.unlike),
);

/**
 * @swagger
 * /stories/{storyId}/views:
 *   get:
 *     summary: Who viewed the story (author only)
 *     tags: [Stories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: storyId, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Viewer list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StoryViewer'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *                     total: { type: integer }
 *                     totalPages: { type: integer }
 *       403:
 *         description: Not the story author
 *       404:
 *         description: Story not found or expired
 */
storyRouter.get(
  '/:storyId/views',
  validate({ params: storyIdParamSchema, query: feedQuerySchema }),
  asyncHandler(storyController.listViewers),
);
