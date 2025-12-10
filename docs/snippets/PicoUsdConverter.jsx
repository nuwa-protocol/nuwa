export const PicoUsdConverter = () => {
  // Canonical scale: 1 USD = 1e12 picoUSD
  const USD_SCALE = 1000000000000n; // 1e12

  // Local input state (keep as strings to preserve user-typed intent)
  const [usdInput, setUsdInput] = useState('');
  const [picoInput, setPicoInput] = useState('');

  const sanitizeUsd = v => v.replace(/[^0-9.]/g, '');
  const sanitizeInt = v => v.replace(/\D/g, '');

  // Pure converters used for both rendering and cross-updating
  const convertUsdToPico = value => {
    const raw = sanitizeUsd(value || '');
    if (!raw || !/^\d*(?:\.\d*)?$/.test(raw)) return '';
    const [intPart = '0', frac = ''] = raw.split('.');
    const frac12 = (frac + '000000000000').slice(0, 12);
    // Implement round-half-up using the 13th decimal digit if present
    const nextDigit = frac.length > 12 ? Number(frac[12]) : NaN;
    let scaled = BigInt(intPart || '0') * USD_SCALE + BigInt(frac12 || '0');
    if (!Number.isNaN(nextDigit) && nextDigit >= 5) scaled += 1n;
    return scaled.toString();
  };

  const convertPicoToUsd = value => {
    const raw = sanitizeInt(value || '');
    if (!raw) return '';
    try {
      const pico = BigInt(raw);
      const whole = pico / USD_SCALE;
      const frac = (pico % USD_SCALE).toString().padStart(12, '0');
      const fracTrimmed = frac.replace(/0+$/, ''); // readability
      return fracTrimmed ? `${whole}.${fracTrimmed}` : whole.toString();
    } catch {
      return '';
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {/* USD side */}
      <div className="flex items-center gap-1.5">
        <span className="min-w-[28px] text-[12px] text-slate-700 dark:text-slate-300">USD</span>
        <input
          id="usd-input"
          inputMode="decimal"
          placeholder="0.001"
          aria-label="USD amount"
          value={usdInput}
          onChange={e => {
            const nextUsd = sanitizeUsd(e.target.value);
            setUsdInput(nextUsd);
            setPicoInput(convertUsdToPico(nextUsd));
          }}
          className="w-[14ch] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30"
        />
      </div>

      <span className="select-none text-xs text-gray-500 dark:text-gray-400">↔</span>

      {/* picoUSD side */}
      <div className="flex items-center gap-1.5">
        <span className="min-w-[52px] text-[12px] text-slate-700 dark:text-slate-300">
          Pico USD
        </span>
        <input
          id="pico-input"
          inputMode="numeric"
          placeholder="1000000000"
          aria-label="picoUSD amount"
          value={picoInput}
          onChange={e => {
            const nextPico = sanitizeInt(e.target.value);
            setPicoInput(nextPico);
            setUsdInput(convertPicoToUsd(nextPico));
          }}
          className="w-[20ch] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30"
        />
      </div>
    </div>
  );
};
