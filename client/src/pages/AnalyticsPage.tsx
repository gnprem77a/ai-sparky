import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { MessageSquare, Database, Cpu, TrendingUp, ArrowLeft, DollarSign, Clock, Star, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface OverviewData {
  totalConversations: number;
  totalMessages: number;
  totalTokens: number;
  avgTokensPerMessage: number;
}

interface DailyData {
  date: string;
  messageCount: number;
  tokenCount: number;
}

interface ModelData {
  model: string;
  count: number;
  percentage: number;
}

interface PeakHourData {
  hour: number;
  count: number;
}

interface CostData {
  estimatedCostUsd: number;
  byModel: { model: string; costUsd: number }[];
}

interface TopConversation {
  id: string;
  title: string;
  totalTokens: number;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function formatHour(hour: number) {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();

  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ["/api/analytics/overview"],
  });

  const { data: daily, isLoading: loadingDaily } = useQuery<DailyData[]>({
    queryKey: ["/api/analytics/daily"],
  });

  const { data: models, isLoading: loadingModels } = useQuery<ModelData[]>({
    queryKey: ["/api/analytics/models"],
  });

  const { data: peakHours } = useQuery<PeakHourData[]>({
    queryKey: ["/api/analytics/peak-hours"],
  });

  const { data: cost } = useQuery<CostData>({
    queryKey: ["/api/analytics/cost"],
  });

  const { data: topConversations } = useQuery<TopConversation[]>({
    queryKey: ["/api/analytics/top-conversations"],
  });

  if (authLoading || loadingOverview || loadingDaily || loadingModels) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="flex gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-muted-foreground inline-block" />
        </div>
      </div>
    );
  }

  if (!user?.apiEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Analytics not available</h2>
          <p className="text-sm text-muted-foreground">Usage analytics are available to API users only. Contact an admin to request API access.</p>
          <Link href="/">
            <Button variant="outline" className="mt-2">Back to Chat</Button>
          </Link>
        </div>
      </div>
    );
  }

  const peakHourData = peakHours?.map(h => ({ ...h, label: formatHour(h.hour) })) ?? [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-8 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Conversations</CardTitle>
            <MessageSquare className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-conversations">{overview?.totalConversations ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Messages</CardTitle>
            <TrendingUp className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-messages">{overview?.totalMessages ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
            <Database className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tokens">{(overview?.totalTokens ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 gap-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estimated Cost</CardTitle>
            <DollarSign className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-estimated-cost">
              ${(cost?.estimatedCostUsd ?? 0).toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">based on token usage</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Messages per day bar chart */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-6 gap-1">
            <CardTitle className="text-lg font-semibold">Messages per day</CardTitle>
          </CardHeader>
          <div className="h-[300px] w-full" data-testid="chart-messages-daily">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  fontSize={10}
                  tickFormatter={(val) => val.slice(5)}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Bar dataKey="messageCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Peak hours chart */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-6 gap-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Peak Activity Hours</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Messages sent by hour of day</p>
          </CardHeader>
          <div className="h-[300px] w-full" data-testid="chart-peak-hours">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHourData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  fontSize={9}
                  interval={2}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                  formatter={(v: number) => [v, "Messages"]}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Tokens over time line chart */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-6 gap-1">
            <CardTitle className="text-lg font-semibold">Tokens over time</CardTitle>
          </CardHeader>
          <div className="h-[300px] w-full" data-testid="chart-tokens-daily">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  fontSize={10}
                  tickFormatter={(val) => val.slice(5)}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="tokenCount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Model usage breakdown pie chart */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-6 gap-1">
            <CardTitle className="text-lg font-semibold">Model usage breakdown</CardTitle>
          </CardHeader>
          <div className="h-[300px] w-full flex items-center justify-center" data-testid="chart-models">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={models}
                  dataKey="count"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                >
                  {models?.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {models?.map((m, i) => (
              <div key={m.model} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs font-medium">{m.model} ({m.percentage}%)</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Cost breakdown + Top Conversations side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cost by model table */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-4 gap-1">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Estimated Cost by Model</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Based on approximate token pricing</p>
          </CardHeader>
          <div data-testid="table-cost-by-model">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Model</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Est. Cost</span>
            </div>
            {cost?.byModel && cost.byModel.length > 0 ? (
              <div className="space-y-1">
                {cost.byModel.map((item) => (
                  <div key={item.model} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                    <span className="text-sm text-foreground font-medium truncate max-w-[65%]">{item.model}</span>
                    <span className="text-sm font-mono text-foreground">${item.costUsd.toFixed(4)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20 mt-3">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-sm font-mono font-bold text-foreground">${(cost.estimatedCostUsd).toFixed(4)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No cost data yet</p>
            )}
          </div>
        </Card>

        {/* Top conversations table */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0 pb-4 gap-1">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-lg font-semibold">Top Conversations</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">By total token usage</p>
          </CardHeader>
          <div data-testid="table-top-conversations">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversation</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tokens</span>
            </div>
            {topConversations && topConversations.length > 0 ? (
              <div className="space-y-1">
                {topConversations.map((conv, idx) => (
                  <div key={conv.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${idx === 0 ? "text-yellow-400" : idx === 1 ? "text-slate-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                        #{idx + 1}
                      </span>
                      <span className="text-sm text-foreground truncate max-w-[180px]" data-testid={`text-top-conv-title-${conv.id}`}>
                        {conv.title || "Untitled"}
                      </span>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground flex-shrink-0" data-testid={`text-top-conv-tokens-${conv.id}`}>
                      {conv.totalTokens.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No conversations yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
