import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const HEADER_COLS = 11;
const BODY_ROWS = 8;

export default function Loading() {
  return (
      <div
        className="space-y-4"
        role="status"
        aria-busy="true"
        aria-label="キャンペーン詳細を読み込み中"
      >
        {/* パンくず */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <span className="text-muted-foreground/40" aria-hidden="true">
            /
          </span>
          <Skeleton className="h-4 w-44" />
        </div>

        {/* ヘッダー */}
        <div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-4 w-56" />
        </div>

        {/* サンプルデータバナー */}
        <Skeleton className="h-10 w-full rounded-lg" />

        {/* 広告グループ件数 */}
        <Skeleton className="h-4 w-28" />

        {/* テーブル */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6 pl-4" />
                  {Array.from({ length: HEADER_COLS }).map((_, i) => (
                    <TableHead
                      key={i}
                      className={i >= 3 ? 'text-right' : undefined}
                    >
                      <Skeleton
                        className={`h-4 ${i >= 3 ? 'ml-auto w-14' : 'w-20'}`}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {Array.from({ length: BODY_ROWS }).map((_, row) => (
                  <TableRow key={row}>
                    <TableCell className="pl-4">
                      <Skeleton className="h-2 w-2 rounded-full" />
                    </TableCell>
                    {Array.from({ length: HEADER_COLS }).map((_, col) => (
                      <TableCell
                        key={col}
                        className={col >= 3 ? 'text-right' : undefined}
                      >
                        <Skeleton
                          className={`h-4 ${
                            col === 0
                              ? 'w-40'
                              : col >= 3
                                ? 'ml-auto w-16'
                                : 'w-24'
                          }`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <span className="sr-only">読み込み中…</span>
      </div>
  );
}
