type Props = { action: string; query: string; label: string; detailId?: number };

export default function ExportFormulaire({ action, query, label, detailId }: Props) {
  const params = new URLSearchParams(query);
  params.delete("page"); params.delete("remise"); params.delete("format");
  if (detailId !== undefined) params.set("remise", String(detailId));
  return <form action={action} method="get" className="treasury-export" aria-label={label}>
    {[...params].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <fieldset><legend className="sr-only">Format d&apos;export</legend>
      {[["xls", "XLS"], ["csv", "CSV"], ["pdf", "PDF"]].map(([value, text]) => <label key={value}><input type="radio" name="format" value={value} defaultChecked={value === "csv"} /> {text}</label>)}
    </fieldset>
    <button type="submit" className="button-secondary">Exporter</button>
  </form>;
}
