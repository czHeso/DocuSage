import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Coins, AlertTriangle } from "lucide-react";

interface UsageCostsProps {
  projectId: number;
}

interface UsageBreakdownRow {
  provider: string;
  model: string;
  kind: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  estimatedCostUsd: number | null;
}

interface UsageReport {
  days: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  calls: number;
  estimatedCostUsd: number;
  unpricedTokens: number;
  pricesCheckedOn: string;
  byKind: UsageBreakdownRow[];
}

/** What each kind of call is, in words somebody who did not write this would use. */
const KIND_LABELS: Record<string, string> = {
  chunking: "Processing uploads",
  chunk_selection: "Finding relevant parts",
  answer: "Writing answers",
  embedding: "Embeddings",
  conversation: "Answers without documents",
  other: "Other",
};

const formatTokens = (tokens: number) => new Intl.NumberFormat().format(tokens);

const formatCost = (usd: number) =>
  usd < 0.01 && usd > 0 ? "< $0.01" : `$${usd.toFixed(2)}`;

export default function UsageCosts({ projectId }: UsageCostsProps) {
  const { data, isLoading } = useQuery<UsageReport>({
    queryKey: [`/api/projects/${projectId}/usage`],
    enabled: Number.isFinite(projectId) && projectId > 0,
  });

  if (isLoading) {
    return (
      <Card className="shadow">
        <CardHeader>
          <CardTitle>Token usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const report = data;
  const hasUsage = !!report && report.calls > 0;

  return (
    <Card className="shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5" />
          Token usage
        </CardTitle>
        <CardDescription>
          What this project has spent with your AI provider over the last{" "}
          {report?.days ?? 30} days. You are billed by the provider directly, on
          your own key — these are the tokens they reported.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasUsage ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing recorded yet. Usage appears here once documents are processed
            or questions are answered.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-2xl font-semibold">{formatTokens(report!.totalTokens)}</div>
                <div className="text-xs text-muted-foreground">tokens</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{formatCost(report!.estimatedCostUsd)}</div>
                <div className="text-xs text-muted-foreground">estimated cost</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{formatTokens(report!.calls)}</div>
                <div className="text-xs text-muted-foreground">provider calls</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">
                  {formatTokens(report!.promptTokens)} / {formatTokens(report!.completionTokens)}
                </div>
                <div className="text-xs text-muted-foreground">in / out</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>What for</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...report!.byKind]
                    .sort((a, b) => b.totalTokens - a.totalTokens)
                    .map((row) => (
                      <TableRow key={`${row.kind}-${row.model}-${row.provider}`}>
                        <TableCell>{KIND_LABELS[row.kind] ?? row.kind}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.model}
                          <span className="ml-1 opacity-70">({row.provider})</span>
                        </TableCell>
                        <TableCell className="text-right">{formatTokens(row.calls)}</TableCell>
                        <TableCell className="text-right">{formatTokens(row.totalTokens)}</TableCell>
                        <TableCell className="text-right">
                          {row.estimatedCostUsd === null ? (
                            <Badge variant="outline">not priced</Badge>
                          ) : (
                            formatCost(row.estimatedCostUsd)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            {report!.unpricedTokens > 0 && (
              // Said plainly rather than folded into the total: the cost above
              // is a floor, not a figure.
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {formatTokens(report!.unpricedTokens)} tokens came from models with no
                  price on file, so the estimate above is a floor rather than a total. Add
                  them to <code>MODEL_PRICES_PER_MILLION</code> in{" "}
                  <code>server/services/usage.ts</code> to include them.
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Costs are estimates from a price table last checked in{" "}
              {report!.pricesCheckedOn}. Your provider's invoice is the authority.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
