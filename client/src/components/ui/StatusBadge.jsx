const classes = {
  QUEUED: "bg-[#3a2c18] text-[#f6d086]",
  UPLOADED: "bg-[#2d261a] text-[#f5d28a]",
  VIDEO_UPLOADED: "bg-[#30221a] text-[#f6c6a1]",
  PROCESSING: "bg-[#2a2437] text-[#cdb6ff]",
  PROXY_READY: "bg-[#243329] text-[#b9f0ca]",
  PROCESSED: "bg-[#1d3122] text-[#9fd8a7]",
  FAILED: "bg-[#3a1c1c] text-[#ffb3aa]",
  AR_READY: "bg-[#1f342b] text-[#8ef2be]"
};

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${classes[status] ?? "bg-[#2d261a] text-[#f5d28a]"}`}>
      {status}
    </span>
  );
}
