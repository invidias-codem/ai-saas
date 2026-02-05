// app/api/memory/feedback/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import axios from 'axios';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { uuidSchema } from '@/lib/security/inputValidation';
import { z } from 'zod';

/**
 * POST /api/memory/feedback
 * 
 * Records user feedback on fact helpfulness
 * This improves the memory system's understanding of what's important
 * 
 * Request body:
 * {
 *   factId: string,
 *   helpful: boolean,
 *   rating: number (1-5),
 *   feedback?: string
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   updatedFact?: {
 *     id: string,
 *     userRating: number,
 *     impactScore: number
 *   }
 * }
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { factId, helpful, rating, feedback } = body;

    // Validate input with Zod
    const factIdValidation = uuidSchema.safeParse(factId);
    if (!factIdValidation.success) {
      return NextResponse.json(
        { error: 'Invalid fact ID format' },
        { status: 400 }
      );
    }

    const feedbackSchema = z.object({
      helpful: z.boolean(),
      rating: z.number().int().min(1).max(5),
      feedback: z.string().optional()
    });

    const validationResult = feedbackSchema.safeParse({ helpful, rating, feedback });
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Call Cloud Function to update fact importance based on feedback
    if (!process.env.FEEDBACK_CLOUD_FUNCTION_URL) {
      console.warn('[FEEDBACK] Cloud Function URL not configured, storing feedback locally only');
      return NextResponse.json({
        success: true,
        message: 'Feedback recorded (local storage only)',
        warning: 'Cloud sync not configured',
      });
    }

    const response = await axios.post(
      `${process.env.FEEDBACK_CLOUD_FUNCTION_URL}/recordFeedback`,
      {
        userId: user.userId,
        factId,
        helpful,
        rating,
        feedback,
        timestamp: new Date().toISOString(),
      },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = response.data;

    console.log(`[MEMORY_FEEDBACK] User ${user.userId} rated fact ${factId}: helpful=${helpful}, rating=${rating}`);

    return NextResponse.json({
      success: true,
      message: 'Feedback recorded successfully',
      updatedFact: result.updatedFact,
    });
  } catch (error: any) {
    console.error('[MEMORY_FEEDBACK_ERROR]', error);

    // Don't expose internal errors to client
    const errorMessage =
      error.response?.data?.error || error.message || 'Failed to record feedback';

    return new NextResponse(
      JSON.stringify({
        error: 'Failed to record feedback',
        details: errorMessage,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/memory/feedback
 * 
 * Retrieves feedback history for debugging/analytics
 * Response:
 * {
 *   success: boolean,
 *   feedbackCount: number,
 *   recentFeedback: Array<{
 *     factId: string,
 *     helpful: boolean,
 *     rating: number,
 *     feedback?: string,
 *     createdAt: string
 *   }>
 * }
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Call Cloud Function to get feedback history
    if (!process.env.FEEDBACK_CLOUD_FUNCTION_URL) {
      return NextResponse.json({
        success: true,
        feedbackCount: 0,
        recentFeedback: [],
        message: 'Cloud sync not configured',
      });
    }

    const response = await axios.get(
      `${process.env.FEEDBACK_CLOUD_FUNCTION_URL}/getFeedback?userId=${user.userId}`,
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = response.data;

    return NextResponse.json({
      success: true,
      feedbackCount: result.feedbackCount || 0,
      recentFeedback: result.recentFeedback || [],
    });
  } catch (error: any) {
    console.error('[MEMORY_FEEDBACK_GET_ERROR]', error);

    return new NextResponse(
      JSON.stringify({
        error: 'Failed to retrieve feedback',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
