import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { MessageSquare, Database, Cpu, TrendingUp, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

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

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function AnalyticsPage() {
  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewData>({
    queryKey: ["/api/analytics/overview"],
  });

  const { data: daily, isLoading: loadingDaily } = useQuery<DailyData[]>({
    queryKey: ["/api/analytics/daily"],
  });

  const { data: models, isLoading: loadingModels } = useQuery<ModelData[]>({
    queryKey: ["/api/analytics/models"],
  });

  if (loadingOverview || loadingDaily || loadingModels) {
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Response Length</CardTitle>
            <Cpu className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-tokens">{overview?.avgTokensPerMessage ?? 0} <span className="text-xs font-normal text-muted-foreground">tokens</span></div>
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
    </div>
  );
}
