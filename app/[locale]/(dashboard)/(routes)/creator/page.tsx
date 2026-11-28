import { requireAuth } from "@/lib/security/apiAuth";
import { clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, DollarSign, TrendingUp, BarChart } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function CreatorDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireAuth();
  // Look up email from Clerk

  const clerk = await clerkClient();
  const fullUser = await clerk.users.getUser(user.userId);
  const userEmail = fullUser.emailAddresses[0]?.emailAddress;

  // Look up if this user is an approved creator
  let creatorCode = null;
  let stats = {
    visits: 0,
    signups: 0,
    upgrades: 0,
    earnings_usd: 0
  };

  if (supabaseAdmin) {
    const { data: codeData } = await supabaseAdmin
      .from('referral_codes')
      .select('*')
      .eq('email', userEmail)
      .eq('is_active', true)
      .single();

    if (codeData) {
      creatorCode = codeData;
      
      // Aggregate stats
      const { data: events } = await supabaseAdmin
        .from('referral_events')
        .select('event_type, amount_usd')
        .eq('code', codeData.code);

      if (events) {
        stats.visits = events.filter(e => e.event_type === 'visit').length;
        stats.signups = events.filter(e => e.event_type === 'signup').length;
        stats.upgrades = events.filter(e => e.event_type === 'upgrade').length;
        stats.earnings_usd = events.filter(e => e.event_type === 'upgrade').reduce((acc, e) => acc + (e.amount_usd || 0), 0);
      }
    }
  }

  if (!creatorCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="p-4 bg-muted rounded-full">
          <Activity className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Creator Program</h2>
        <p className="text-muted-foreground text-center max-w-sm">
          You are not currently enrolled as an active creator. Apply to the Tech Genie Creator Program to start earning.
        </p>
        <a href={`/${locale}/creators/apply`} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
          Apply Now
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Creator Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Welcome back, {creatorCode.creator_name || creatorCode.creator_handle}. Here&apos;s your performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-3 sm:px-4 py-1 text-xs sm:text-sm bg-primary/10 text-primary border-primary/20">
            Active Partner
          </Badge>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="text-xs sm:text-sm font-medium">Your Unique Link</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Share this link on your platforms to track signups.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="relative rounded bg-muted px-[0.3rem] sm:px-[0.5rem] py-[0.2rem] sm:py-[0.3rem] font-mono text-xs sm:text-sm font-semibold flex-1 overflow-x-auto border truncate">
              https://gen1e.xyz?ref={creatorCode.code}
            </code>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.visits}</div>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Unique visitors from your link
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Signups</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.signups}</div>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Users who created an account
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Conversions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upgrades}</div>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Users who upgraded via Ko-fi
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.earnings_usd.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Pending payout
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}