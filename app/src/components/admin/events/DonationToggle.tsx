/**
 * Włącznik „darowizny na dofinansowanie pobytu" w cenniku eventu (`pricingConfig.donationEnabled`).
 * Po włączeniu gość widzi w kroku „Opcje" wybór kwoty: proponowane kwoty albo dowolna.
 */
export default function DonationToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand)] w-4 h-4" />
        Opcjonalna darowizna na dofinansowanie pobytu innych
      </label>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        W kroku „Opcje" gość może dodać darowiznę: 50 / 100 / 200 zł (10 / 25 / 50 w EUR i USD) albo dowolną kwotę. Darowizna dolicza się do kwoty zgłoszenia i nie podlega rabatom.
      </p>
    </div>
  )
}
