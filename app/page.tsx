import { Suspense } from "react";
import { Reveal } from "@/components/Reveal";
import { Polaroid } from "@/components/Polaroid";
import { FortuneCookie } from "@/components/FortuneCookie";
import { StatLine } from "@/components/StatLine";
import { ScrollProgress } from "@/components/ScrollProgress";
import { GameChooser } from "@/components/GameChooser";
import { BenchPanel } from "@/components/BenchPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLinks } from "@/components/NavLinks";
import { Magnetic } from "@/components/Magnetic";
import { ProjectCard } from "@/components/ProjectCard";
import { WorkRole } from "@/components/WorkRole";
import { HeroLine } from "@/components/HeroLine";
import { Stats } from "@/components/Stats";
import { LINKS, PROJECTS, ROLES, SKILL_GROUPS } from "@/lib/resume";
import { ParkTierList } from "@/components/ParkTierList";
import { FilmShelf } from "@/components/FilmShelf";
import { GameShelf } from "@/components/GameShelf";
import { StatsSection } from "@/components/StatsSection";
import { PeterBotShell } from "@/components/PeterBotShell";
import { ContactForm } from "@/components/ContactForm";
import { VibeCorner } from "@/components/VibeCorner";

// A section header that reads like a shell path: 01 ~/work ─────── # note
function Section({
  n,
  slug,
  note,
}: {
  n: string;
  slug: string;
  note?: string;
}) {
  return (
    <Reveal>
      <div className="mb-9 flex items-baseline gap-3">
        <span className="font-mono text-sm text-muted">{n}</span>
        <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="text-accent">~/</span>
          {slug}
        </h2>
        <span className="rule-dash self-center" />
        {note && (
          <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">
            # {note}
          </span>
        )}
      </div>
    </Reveal>
  );
}

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <PeterBotShell />
      <VibeCorner />
      {/* ============ NAV ============ */}
      <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
          <a href="#top" className="font-mono text-sm">
            <span className="text-accent">peter</span>
            <span className="text-muted">@</span>
            <span className="text-fg">petezha.xyz</span>
          </a>
          <NavLinks />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="/resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-term hidden whitespace-nowrap px-3 py-1.5 text-xs xl:inline-block"
            >
              resume
            </a>
            <a
              href={`mailto:${LINKS.email}`}
              className="btn-solid px-3.5 py-1.5 text-xs"
            >
              email
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto w-full max-w-5xl px-6">
        {/* ============ HERO ============ */}
        <section className="flex min-h-[82svh] flex-col justify-center py-20">
          <Reveal>
            <p className="mb-5 font-mono text-xs text-muted">
              <span className="text-accent">peter@petezha</span>
              <span className="text-muted">:</span>
              <span className="text-moss">~</span>
              <span className="text-accent">$</span> whoami
            </p>
          </Reveal>
          <Reveal delay={60}>
            <p className="mb-6 flex items-center gap-2.5 font-mono text-xs text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <a href="/now" className="tlink !text-muted hover:!text-accent">
                right now: nvidia, santa clara &rarr;
              </a>
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="max-w-3xl font-mono text-4xl font-bold leading-[1.12] tracking-tight sm:text-6xl">
              <HeroLine />
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-8 max-w-2xl leading-relaxed text-muted">
              I study computer science, electrical engineering, and math. All
              three, because the work I enjoy sits somewhere between them.
              I&apos;m spending the early summer at NVIDIA working on GPU
              simulation infrastructure, then the late summer at Microsoft on
              Azure Search. Last summer I was at Amazon.
            </p>
            <Suspense fallback={null}>
              <StatLine />
            </Suspense>
          </Reveal>
          <Reveal delay={280}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Magnetic>
                <a
                  href="#play"
                  className="btn-solid inline-block px-6 py-3 text-sm"
                >
                  play the games
                </a>
              </Magnetic>
              <Magnetic>
                <a
                  href="#work"
                  className="btn-term inline-block px-6 py-3 text-sm"
                >
                  see my work
                </a>
              </Magnetic>
              <div className="flex gap-5 font-mono text-xs text-muted">
                <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">github</a>
                <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">linkedin</a>
                <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">resume</a>
              </div>
            </div>
          </Reveal>
          <Reveal delay={360}>
            <div className="mt-14">
              <Stats />
            </div>
          </Reveal>
        </section>

        {/* ============ WORK ============ */}
        <section className="py-24" id="work">
          <Section n="01" slug="work" note="where the résumé lives" />
          <div className="flex flex-col lg:pl-5">
            {ROLES.map((role, i) => (
              <Reveal key={role.company + role.dates} delay={i * 50}>
                <WorkRole role={role} last={i === ROLES.length - 1} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============ PROJECTS ============ */}
        <section className="py-24" id="projects">
          <Section n="02" slug="projects" note="things I built for myself" />
          <div className="grid gap-4 sm:grid-cols-2">
            {PROJECTS.map((project, i) => (
              <Reveal key={project.name} delay={i * 60} className="h-full">
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============ ARCADE ============ */}
        <section className="py-24" id="play">
          <Section n="03" slug="arcade" note="four languages, zero plugins" />
          <Reveal>
            <p className="mb-8 max-w-2xl leading-relaxed text-muted">
              A small arcade, each cabinet running a different language in your
              browser: the map game&apos;s engine is{" "}
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="tlink"
              >
                Rust compiled to WebAssembly
              </a>
              , the physics and math sims are freestanding C++, the board game
              Go is written in Go (obviously), and Snake is genuine Java
              bytecode run by a little JVM I wrote for this site. React just
              draws.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <GameChooser />
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-10">
              <p className="prompt mb-2 font-mono text-[11px] text-muted">
                ./bench --all <span className="text-muted/70"># yes, the C++ actually runs</span>
              </p>
              <BenchPanel />
            </div>
          </Reveal>
        </section>

        {/* ============ ABOUT ============ */}
        <section className="py-24" id="about">
          <Section n="04" slug="about" note="the actual person" />
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
            <Reveal>
              <div className="space-y-5 leading-relaxed text-muted">
                <p className="font-serif text-2xl leading-snug tracking-tight text-fg sm:text-3xl">
                  I grew up in Pulaski, Wisconsin, in a trailer park.
                </p>
                <p>
                  I worked at my parents&apos; restaurant. I was one of the
                  only Asian students in my school, got held back in
                  kindergarten, and still ended up valedictorian of my high
                  school.
                </p>
                <p>
                  I study three majors because the things I want to build need
                  all three: GPU systems, firmware, and control systems
                  don&apos;t stay inside one department. I learn fastest when
                  the project is slightly past what I already know how to do.
                </p>
                <p>
                  Outside of school: history, film and animation, photography,
                  and grand strategy games. I also hike, which is why
                  there&apos;s a national park tier list below this.
                </p>
                <div className="max-w-sm pt-2">
                  <Polaroid
                    src="/first-home.jpg"
                    alt="The trailer in Pulaski, Wisconsin, where Peter grew up"
                    caption="pulaski, wisconsin — where it started"
                    width={316}
                    height={234}
                  />
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="flex flex-col gap-4">
                <Polaroid
                  src="/childhood.jpg"
                  alt="Peter as a small child in an oversized soccer sweater"
                  caption="age four, allegedly"
                  width={480}
                  height={480}
                  round
                />
                {/* education — a terminal panel, not a soft card */}
                <div className="panel">
                  <div className="panel-titlebar">
                    <span className="win-dots">
                      <i className="bg-accent/60" />
                      <i className="bg-gold/60" />
                      <i className="bg-moss/60" />
                    </span>
                    <span className="text-accent">~/</span>education
                  </div>
                  <div className="p-5">
                    <h3 className="font-mono text-base font-bold">
                      University of Wisconsin&ndash;Madison
                    </h3>
                    <p className="mt-1.5 text-sm text-muted">
                      B.S. Computer Science, Electrical Engineering &amp;
                      Mathematics &middot; May 2027
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      STAR &amp; PEOPLE Scholar
                    </p>
                  </div>
                </div>
                {/* skills — rendered like a config file */}
                <div className="panel">
                  <div className="panel-titlebar">
                    <span className="win-dots">
                      <i className="bg-accent/60" />
                      <i className="bg-gold/60" />
                      <i className="bg-moss/60" />
                    </span>
                    <span className="text-accent">~/</span>skills.toml
                  </div>
                  <div className="space-y-2.5 p-5 font-mono text-[12px] leading-relaxed">
                    {SKILL_GROUPS.map((g) => (
                      <p key={g.label} className="break-words">
                        <span className="text-accent">
                          {g.label.toLowerCase().replace(/[^a-z]+/g, "_")}
                        </span>
                        <span className="text-muted"> = [</span>
                        {g.items.map((item, idx) => (
                          <span key={item}>
                            <span className="text-fg">{item}</span>
                            {idx < g.items.length - 1 && (
                              <span className="text-muted">, </span>
                            )}
                          </span>
                        ))}
                        <span className="text-muted">]</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ PARKS TIER LIST ============ */}
        <section className="py-24" id="parks">
          <Section n="05" slug="parks" note="all 63. yes I have opinions" />
          <Reveal>
            <p className="mb-8 max-w-2xl leading-relaxed text-muted">
              Every U.S. national park, tiered. Formed on trails, from photos,
              and with some bias toward mountains. Disagree? Drag a park where
              you think it belongs, and the list will explain why you&apos;re
              wrong.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <ParkTierList />
          </Reveal>
        </section>

        {/* ============ FILMS ============ */}
        <section className="py-24" id="films">
          <Section n="06" slug="watching" note="letterboxd, live" />
          {/* streamed: the page shell shouldn't wait on Letterboxd */}
          <Suspense fallback={null}>
            <FilmShelf />
          </Suspense>
        </section>

        {/* ============ GAMES ============ */}
        <section className="py-24" id="games">
          <Section n="07" slug="playing" note="steam, live" />
          {/* streamed: same deal for Steam */}
          <Suspense fallback={null}>
            <GameShelf />
          </Suspense>
        </section>

        {/* ============ STATS ============ */}
        <section className="py-24" id="stats">
          <Section n="08" slug="stats" note="live data, real charts" />
          <Suspense fallback={null}>
            <StatsSection />
          </Suspense>
        </section>

        {/* ============ THE RESTAURANT ============ */}
        <section className="py-24" id="chinawok">
          <Reveal>
            <div className="panel border-accent/40">
              <div className="panel-titlebar border-accent/30">
                <span className="win-dots">
                  <i className="bg-accent/70" />
                  <i className="bg-gold/70" />
                  <i className="bg-moss/70" />
                </span>
                <span className="text-accent">$</span> ./support-this-site.sh
              </div>
              <div className="p-8 sm:p-12">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                  09 · one more thing
                </p>
                <div className="mt-4 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
                  <div>
                    <h2 className="max-w-2xl font-serif text-3xl leading-snug tracking-tight sm:text-5xl">
                      My parents run a Chinese restaurant.
                    </h2>
                    <p className="mt-5 max-w-xl leading-relaxed text-muted">
                      China Wok, in Pulaski, Wisconsin. It paid for the
                      calculators, the tuition gaps, and the work ethic. If
                      you&apos;re ever near Green Bay, ordering the General
                      Tso&apos;s is the single most effective way to support
                      this website.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted">
                      <span className="text-gold">4.7★ on Google</span>
                      <span>1170 Mountain Bay Dr, Pulaski, WI</span>
                      <span>$10–20</span>
                    </div>
                    <div className="mt-8">
                      <Magnetic>
                        <a
                          href="https://order.chinawoktasty.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-solid inline-block px-8 py-4 text-base"
                        >
                          order here &rarr;
                        </a>
                      </Magnetic>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-8">
                    <Polaroid
                      src="/china-wok-family.jpg"
                      alt="The family standing in front of China Wok, next to the delivery van"
                      caption="china wok, back then"
                      width={339}
                      height={357}
                    />
                    <FortuneCookie />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ============ CONTACT ============ */}
        <section className="py-28" id="contact">
          <Section n="10" slug="contact" note="I answer email quickly" />
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <Reveal>
              <div>
                <h2 className="max-w-md font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
                  Get in touch.
                </h2>
                <p className="mt-5 max-w-md leading-relaxed text-muted">
                  I&apos;m happy to talk about internships, projects, or school,
                  and I answer email quickly. Genuinely, try me.
                </p>
                <div className="mt-6 flex gap-6 font-mono text-xs text-muted">
                  <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">linkedin</a>
                  <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">github</a>
                  <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">resume</a>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ContactForm />
            </Reveal>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 font-mono text-xs text-muted">
          <span>
            <span className="text-accent">©</span> 2026 peter zhao &middot; built
            by hand in pulaski, wi
          </span>
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="tlink !text-muted hover:!text-accent"
          >
            no templates — view source &rarr;
          </a>
        </div>
      </footer>
    </>
  );
}
