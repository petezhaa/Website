import type { Metadata } from "next";
import {
  decodeHeresy,
  PARK_LIST,
  canonTier,
  TIER_LABELS,
  TIER_HEX,
} from "@/lib/heresy";
import { PARK_FACTS } from "@/lib/parks";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const h = decodeHeresy(code);
  const n = h?.length ?? 0;
  const title = n
    ? `${n} ${n === 1 ? "heresy" : "heresies"} against Peter's park rankings`
    : "Park tier heresy · Peter Zhao";
  const description = n
    ? `Someone moved ${n} national park${n === 1 ? "" : "s"} off my canon, and the rankings fought back.`
    : "Peter Zhao's national park tier list.";
  return {
    title,
    description,
    openGraph: { title, description, url: `/heresy/${code}`, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function TierChip({ digit }: { digit: number }) {
  return (
    <span
      className="grid h-7 w-7 place-items-center rounded-[2px] font-mono text-sm font-bold text-[#26241e]"
      style={{ backgroundColor: TIER_HEX[digit] ?? "#feff7f" }}
    >
      {TIER_LABELS[digit]}
    </span>
  );
}

export default async function HeresyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const h = decodeHeresy(code);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="mb-12 flex items-center justify-between">
        <a href="/" className="font-mono text-xs text-muted transition hover:text-accent">
          ← petezha.xyz
        </a>
        <span className="font-mono text-xs text-muted">park rankings · heresy</span>
      </header>

      {h && h.length > 0 ? (
        <>
          <h1 className="font-mono text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Heresy, on the record
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-muted">
            Someone rearranged my national park rankings. My tier list reverts
            edits on sight, but a receipt is a receipt. Here is what they moved,
            and where each park actually belongs.
          </p>

          <div className="mt-8">
            {h.map(({ index, tier }) => {
              const park = PARK_LIST[index] ?? "Unknown park";
              const canon = canonTier(index);
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 border-t border-line py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{park}</p>
                    <p className="truncate font-mono text-[11px] text-muted">
                      {PARK_FACTS[park] ?? "a national park"}
                    </p>
                  </div>
                  <TierChip digit={canon} />
                  <span className="text-muted">→</span>
                  <TierChip digit={tier} />
                </div>
              );
            })}
          </div>

          <a
            href="/#parks"
            className="btn-solid mt-10 inline-block px-5 py-2.5 text-sm"
          >
            Think you can do better? →
          </a>
        </>
      ) : (
        <>
          <h1 className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">
            That heresy link is corrupted
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-muted">
            It didn&apos;t decode — maybe the rankings changed since it was
            made. Go commit your own heresy instead:{" "}
            <a
              href="/#parks"
              className="tlink"
            >
              the tier list
            </a>
            .
          </p>
        </>
      )}
    </main>
  );
}
