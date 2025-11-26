// app/api/memory/preferences/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import axios from 'axios';

export interface UserPreferences {
  communicationStyle?: 'casual' | 'professional' | 'technical' | 'balanced';
  preferredDepth?: 'brief' | 'balanced' | 'detailed';
  topics?: { [topic: string]: number };
  sentimentPreference?: number; // -1 (pessimistic) to 1 (optimistic)
  learnedTopics?: string[];
  avgResponseLength?: number;
  preferredFormats?: string[];
}

/**
 * POST /api/memory/preferences
 * 
 * Saves or updates user preferences
 * The system learns these from interactions, but users can also set manually
 * 
 * Request body:
 * {
 *   communicationStyle?: 'casual' | 'professional' | 'technical' | 'balanced',
 *   preferredDepth?: 'brief' | 'balanced' | 'detailed',
 *   topics?: { [topic: string]: number },
 *   sentimentPreference?: number (-1 to 1),
 *   preferredFormats?: ['code', 'explanation', 'examples', ...]
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   preferences: UserPreferences,
 *   message: string
 * }
 */
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const preferences: UserPreferences = body;

    // Validate preferences if provided
    if (preferences.sentimentPreference !== undefined) {
      if (preferences.sentimentPreference < -1 || preferences.sentimentPreference > 1) {
        return new NextResponse(
          JSON.stringify({
            error: 'Invalid input',
            details: 'sentimentPreference must be between -1 and 1',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Call Cloud Function to save preferences
    if (!process.env.PREFERENCES_CLOUD_FUNCTION_URL) {
      console.warn('[PREFERENCES] Cloud Function URL not configured, would save locally');
      return NextResponse.json({
        success: true,
        preferences,
        message: 'Preferences saved (local only - cloud sync not configured)',
      });
    }

    const response = await axios.post(
      `${process.env.PREFERENCES_CLOUD_FUNCTION_URL}/savePreferences`,
      {
        userId,
        preferences,
        updatedAt: new Date().toISOString(),
      },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = response.data;

    console.log(`[MEMORY_PREFERENCES] User ${userId} updated preferences:`, Object.keys(preferences).join(', '));

    return NextResponse.json({
      success: true,
      preferences: result.preferences || preferences,
      message: 'Preferences saved successfully',
    });
  } catch (error: any) {
    console.error('[MEMORY_PREFERENCES_SAVE_ERROR]', error);

    const errorMessage = error.response?.data?.error || error.message || 'Failed to save preferences';

    return new NextResponse(
      JSON.stringify({
        error: 'Failed to save preferences',
        details: errorMessage,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/memory/preferences
 * 
 * Retrieves user's current preferences
 * Used by UI and by intelligent memory system for personalization
 * 
 * Response:
 * {
 *   success: boolean,
 *   preferences: UserPreferences,
 *   source: 'learned' | 'manual' | 'default'
 * }
 */
export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call Cloud Function to get preferences
    if (!process.env.PREFERENCES_CLOUD_FUNCTION_URL) {
      console.warn('[PREFERENCES] Cloud Function URL not configured');
      return NextResponse.json({
        success: true,
        preferences: {},
        source: 'default',
        message: 'Cloud sync not configured - returning defaults',
      });
    }

    const response = await axios.get(
      `${process.env.PREFERENCES_CLOUD_FUNCTION_URL}/getPreferences?userId=${userId}`,
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = response.data;

    return NextResponse.json({
      success: true,
      preferences: result.preferences || {},
      source: result.source || 'default', // 'learned', 'manual', or 'default'
      learnedFrom: result.learnedFrom || 0, // Number of interactions used to learn
    });
  } catch (error: any) {
    console.error('[MEMORY_PREFERENCES_GET_ERROR]', error);

    // Return empty preferences on error (fallback)
    return NextResponse.json({
      success: false,
      preferences: {},
      source: 'default',
      error: error.message || 'Failed to retrieve preferences',
    });
  }
}

/**
 * DELETE /api/memory/preferences
 * 
 * Resets user preferences to defaults
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 */
export async function DELETE(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.PREFERENCES_CLOUD_FUNCTION_URL) {
      return NextResponse.json({
        success: true,
        message: 'Preferences reset to defaults (local only)',
      });
    }

    await axios.delete(
      `${process.env.PREFERENCES_CLOUD_FUNCTION_URL}/resetPreferences?userId=${userId}`,
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    console.log(`[MEMORY_PREFERENCES] User ${userId} reset preferences to defaults`);

    return NextResponse.json({
      success: true,
      message: 'Preferences reset to defaults',
    });
  } catch (error: any) {
    console.error('[MEMORY_PREFERENCES_RESET_ERROR]', error);

    return new NextResponse(
      JSON.stringify({
        error: 'Failed to reset preferences',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
