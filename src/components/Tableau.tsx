import type { ReactNode } from "react";

type Column = { key: string; label: string; numeric?: boolean; href?: string; sort?: "ascending" | "descending" | "none" };
type Row = { key: string; cells: Record<string, ReactNode> };
type Props = { caption: string; columns: Column[]; rows: Row[]; total?: Record<string, ReactNode>; emptyMessage: string };

export default function Tableau({ caption, columns, rows, total, emptyMessage }: Props) {
  function cells(values: Record<string, ReactNode>, isTotal = false) {
    return columns.map((column) => (
      <td key={column.key} className={`${column.numeric ? "tabular-nums numeric" : ""}${values[column.key] === undefined ? " empty-cell" : ""}`}>
        {!isTotal && <span className="cell-label">{column.label}</span>}<span>{values[column.key]}</span>
      </td>
    ));
  }
  return (<>
    {columns.some(column => column.href) && <div className="mobile-sorts" aria-label="Tri des annonces">Trier par : {columns.filter(column => column.href).map(column => <a key={column.key} href={column.href} className="text-link">{column.label}{column.sort === "ascending" ? " ↑" : column.sort === "descending" ? " ↓" : ""}</a>)}</div>}
    <table className="register">
      <caption className="sr-only">{caption}</caption>
      <thead><tr>{columns.map((column) => <th scope="col" key={column.key} aria-sort={column.sort} className={column.numeric ? "numeric" : undefined}>{column.href ? <a className="sort-link" href={column.href}>{column.label}<span aria-hidden="true">{column.sort === "ascending" ? " ↑" : column.sort === "descending" ? " ↓" : " ↕"}</span></a> : column.label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={row.key}>{cells(row.cells)}</tr>) : <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>}</tbody>
      {total && <tfoot><tr>{cells(total, true)}</tr></tfoot>}
    </table>
  </>);
}
