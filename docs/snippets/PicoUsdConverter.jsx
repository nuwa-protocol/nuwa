export const PicoUsdConverter = () => {
	// Canonical scale: 1 USD = 1e12 picoUSD
	const USD_SCALE = 1000000000000n; // 1e12

	// Local input state (keep as strings to preserve user-typed intent)
	const [usdInput, setUsdInput] = useState("");
	const [picoInput, setPicoInput] = useState("");

	const sanitizeUsd = (v) => v.replace(/[^0-9.]/g, "");
	const sanitizeInt = (v) => v.replace(/\D/g, "");

	// Pure converters used for both rendering and cross-updating
	const convertUsdToPico = (value) => {
		const raw = sanitizeUsd(value || "");
		if (!raw || !/^\d*(?:\.\d*)?$/.test(raw)) return "";
		const [intPart = "0", frac = ""] = raw.split(".");
		const frac12 = (frac + "000000000000").slice(0, 12);
		// Implement round-half-up using the 13th decimal digit if present
		const nextDigit = frac.length > 12 ? Number(frac[12]) : NaN;
		let scaled = BigInt(intPart || "0") * USD_SCALE + BigInt(frac12 || "0");
		if (!Number.isNaN(nextDigit) && nextDigit >= 5) scaled += 1n;
		return scaled.toString();
	};

	const convertPicoToUsd = (value) => {
		const raw = sanitizeInt(value || "");
		if (!raw) return "";
		try {
			const pico = BigInt(raw);
			const whole = pico / USD_SCALE;
			const frac = (pico % USD_SCALE).toString().padStart(12, "0");
			const fracTrimmed = frac.replace(/0+$/, ""); // readability
			return fracTrimmed ? `${whole}.${fracTrimmed}` : whole.toString();
		} catch {
			return "";
		}
	};

	return (
		<div
			style={{
				display: "flex-row",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap",
				marginTop: 8,
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "center",
					gap: 8,
				}}
			>
				{/* USD side */}
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<span style={{ fontSize: 12, color: "#374151", minWidth: 28 }}>
						USD
					</span>
					<input
						id="usd-input"
						inputMode="decimal"
						placeholder="0.001"
						aria-label="USD amount"
						value={usdInput}
						onChange={(e) => {
							const nextUsd = sanitizeUsd(e.target.value);
							setUsdInput(nextUsd);
							setPicoInput(convertUsdToPico(nextUsd));
						}}
						style={{
							width: "14ch",
							padding: "6px 8px",
							border: "1px solid #d1d5db",
							borderRadius: 6,
							fontSize: 13,
						}}
					/>
				</div>

				<span style={{ color: "#6b7280", fontSize: 12 }}>↔</span>

				{/* picoUSD side */}
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<span style={{ fontSize: 12, color: "#374151", minWidth: 52 }}>
						Pico USD
					</span>
					<input
						id="pico-input"
						inputMode="numeric"
						placeholder="1000000000"
						aria-label="picoUSD amount"
						value={picoInput}
						onChange={(e) => {
							const nextPico = sanitizeInt(e.target.value);
							setPicoInput(nextPico);
							setUsdInput(convertPicoToUsd(nextPico));
						}}
						style={{
							width: "20ch",
							padding: "6px 8px",
							border: "1px solid #d1d5db",
							borderRadius: 6,
							fontSize: 13,
						}}
					/>
				</div>
			</div>
		</div>
	);
};
