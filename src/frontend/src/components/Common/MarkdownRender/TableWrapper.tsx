import React from 'react';
import { Button } from '@/components/ui/button';

export const TableWrapper = ({ children }: { children?: React.ReactNode }) => {
    //@ts-ignore
  const parseTableData = () => {
    if (!children) {
      return { headers: [], rows: [] };
    }

    const childrenArray = React.Children.toArray(children);
    if (childrenArray.length < 2) {
      return { headers: [], rows: [] };
    }

    const [thead, tbody] = childrenArray;
    //@ts-ignore
    const headers = thead?.props?.children?.props?.children
      //@ts-ignore
      ? React.Children.toArray(thead.props.children.props.children).map(
        (th: any) => th.props?.children || ''
      )
      : [];
    //@ts-ignore
    const rows = tbody?.props?.children
      //@ts-ignore
      ? React.Children.toArray(tbody.props.children).map((tr: any) =>
        React.Children.toArray(tr.props?.children || []).map(
          (td: any) => td.props?.children || ''
        )
      )
      : [];

    return { headers, rows };
  };

  const { headers, rows } = parseTableData();

  if (headers.length === 0 || rows.length === 0) {
    return (
      <div className="w-full my-4 overflow-x-auto rounded-md border">
        <table aria-label="Empty table" className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">No Data</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-2">No data available</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const [page, setPage] = React.useState(1);
  const rowsPerPage = 10;

  const pages = Math.ceil(rows.length / rowsPerPage);
  const start = (page - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const currentRows = rows.slice(start, end);

  return (
    <div className="w-full">
      <div className="my-4 overflow-x-auto rounded-md border w-full">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {headers.map((header, index) => (
                <th key={`header-${index}`} className="px-4 py-2 text-left font-medium">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-b last:border-0 odd:bg-muted/30">
                {row.map((cell, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`} className="px-4 py-2">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex justify-center items-center gap-2 my-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {pages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}; 