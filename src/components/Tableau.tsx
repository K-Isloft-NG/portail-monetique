import type { ReactNode } from "react";

type Column = { key: string; label: string; numeric?: boolean };
type Row = { key: string; cells: Record<string, ReactNode> };
type Props = { caption: string; columns: Column[]; rows: Row[]; total?: Record<string, ReactNode>; emptyMessage: string };

export default function Tableau({ caption, columns, rows, total, emptyMessage }: Props) {
  function cells(values: Record<string, ReactNode>) {
    return columns.map((column) => (
      <td key={column.key} className={column.numeric ? "tabular-nums" : undefined}>
        <span className="cell-label" aria-hidden="true">{column.label}</span><span>{values[column.key]}</span>
      </td>
    ));
  }
  return (
    <table className="register">
      <caption className="sr-only">{caption}</caption>
      <thead><tr>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={row.key}>{cells(row.cells)}</tr>) : <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>}</tbody>
      {total && <tfoot><tr>{cells(total)}</tr></tfoot>}
    </table>
  );
}
