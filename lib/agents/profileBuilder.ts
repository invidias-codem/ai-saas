import { supabase } from '@/lib/supabaseClient';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { requireEnv } from '@/lib/env';
import { routeMemoryTask } from '@/lib/ucol/memoryRouter';

export interface UserProfile {
  industry: string;
  role: string;
  skills: string[];          // e.g. ["React", "Python", "AWS"]
  tools: string[];           // e.g. ["VS Code", "Figma"]
  goals: string[];           // e.g. ["launch SaaS by March"]
  communicationStyle: string; // e.g. "technical, concise"
  interests: string[];
  updatedAt: string;
}

export interface UserConversation {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  metadata?: any;
}

const GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview";

/**
 * Queries recent conversations (last 7 days) for a user from Supabase
 */
export async function getRecentConversations(userId: string): Promise<UserConversation[]> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, summary, created_at, metadata')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[ProfileBuilder] Error fetching conversations:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[ProfileBuilder] Exception fetching conversations:', error);
    return [];
  }
}

/**
 * Analyzes conversations to extract structured user profile
 * Can use either Gemini Flash (fast) or Claude (nuanced) via UCOL routing
 */
export async function analyzeUserProfile(
  conversations: UserConversation[], 
  options: { useNuancedGeneration?: boolean } = {}
): Promise<UserProfile | null> {
  if (conversations.length === 0) {
    return null;
  }

  try {
    // Use UCOL memory router for profile generation
    const routerResult = await routeMemoryTask('profile', {
      conversations: conversations
    }, {
      requireNuance: options.useNuancedGeneration,
      prioritizeSpeed: !options.useNuancedGeneration
    });

    console.log(`[ProfileBuilder] Used ${routerResult.provider} (${routerResult.model}) for profile generation`);
    console.log(`[ProfileBuilder] Reasoning: ${routerResult.reasoning}`);

    // Parse the response
    let fullResponse = routerResult.result.trim();

    // Handle potential markdown code blocks
    const jsonMatch = fullResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      fullResponse = jsonMatch[1];
    }

    // For Claude responses, extract the structured profile if it's nested
    let profile: UserProfile;
    try {
      const parsed = JSON.parse(fullResponse);
      
      // If Claude returned both structured and narrative, extract structured
      if (parsed.structured) {
        profile = {
          ...parsed.structured,
          updatedAt: new Date().toISOString()
        };
        
        // Store the narrative separately if provided
        if (parsed.narrative) {
          console.log(`[ProfileBuilder] Generated narrative profile: ${parsed.narrative}`);
          // Could store this in metadata or a separate field
        }
      } else {
        // Standard structured response
        profile = {
          ...parsed,
          updatedAt: new Date().toISOString()
        };
      }

      return profile;

    } catch (parseError) {
      console.error('[ProfileBuilder] Failed to parse JSON response:', parseError);
      console.error('[ProfileBuilder] Raw response:', fullResponse);
      return null;
    }

  } catch (error) {
    console.error('[ProfileBuilder] Error analyzing profile:', error);
    return null;
  }
}

/**
 * Upserts user profile to Supabase user_profiles table
 */
export async function upsertUserProfile(userId: string, profile: UserProfile): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: userId,
        industry: profile.industry,
        role: profile.role,
        skills: profile.skills,
        tools: profile.tools,
        goals: profile.goals,
        communication_style: profile.communicationStyle,
        interests: profile.interests,
        updated_at: profile.updatedAt
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('[ProfileBuilder] Error upserting profile:', error);
      return false;
    }

    console.log(`[ProfileBuilder] Successfully updated profile for user ${userId}`);
    return true;

  } catch (error) {
    console.error('[ProfileBuilder] Exception upserting profile:', error);
    return false;
  }
}

/**
 * Main function to build and update user profile
 */
export async function buildUserProfile(
  userId: string, 
  options: { useNuancedGeneration?: boolean } = {}
): Promise<{ success: boolean; profile?: UserProfile }> {
  try {
    console.log(`[ProfileBuilder] Building profile for user ${userId}`);

    // 1. Get recent conversations
    const conversations = await getRecentConversations(userId);
    if (conversations.length === 0) {
      console.log(`[ProfileBuilder] No recent conversations found for user ${userId}`);
      return { success: false };
    }

    console.log(`[ProfileBuilder] Found ${conversations.length} recent conversations`);

    // 2. Analyze profile using UCOL routing
    const profile = await analyzeUserProfile(conversations, options);
    if (!profile) {
      console.log(`[ProfileBuilder] Failed to analyze profile for user ${userId}`);
      return { success: false };
    }

    console.log(`[ProfileBuilder] Generated profile:`, profile);

    // 3. Upsert to database
    const success = await upsertUserProfile(userId, profile);
    
    return { success, profile: success ? profile : undefined };

  } catch (error) {
    console.error('[ProfileBuilder] Exception in buildUserProfile:', error);
    return { success: false };
  }
}

/**
 * Get existing user profile from database
 */
export async function getUserProfileFromDB(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      industry: data.industry || '',
      role: data.role || '',
      skills: data.skills || [],
      tools: data.tools || [],
      goals: data.goals || [],
      communicationStyle: data.communication_style || '',
      interests: data.interests || [],
      updatedAt: data.updated_at || new Date().toISOString()
    };

  } catch (error) {
    console.error('[ProfileBuilder] Error fetching profile:', error);
    return null;
  }
}