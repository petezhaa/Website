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
import { HandNote } from "@/components/Scribble";
import { HeroLine } from "@/components/HeroLine";
import { Stats } from "@/components/Stats";
import { LINKS, PROJECTS, ROLES, SKILL_GROUPS } from "@/lib/resume";
import { ParkTierList } from "@/components/ParkTierList";
import { FilmShelf } from "@/components/FilmShelf";
import { GameShelf } from "@/components/GameShelf";
import { StatsSection } from "@/components/StatsSection";
import { PeterBot } from "@/components/PeterBot";
import { ContactForm } from "@/components/ContactForm";
import { VibeCorner } from "@/components/VibeCorner";

function SectionLabel({
  n,
  title,
  note,
}: {
  n: string;
  title: string;
  note?: string;
}) {
  return (
    <Reveal>
      <div className="mb-10 flex items-baseline gap-4">
        <span className="font-mono text-xs text-accent">{n}</span>
        <h2 className="font-serif text-4xl tracking-tight sm:text-5xl">
          {title}
        </h2>
        {note && <HandNote className="hidden sm:inline-block">{note}</HandNote>}
        <div className="h-px flex-1 self-center bg-line" />
      </div>
    </Reveal>
  );
}

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <PeterBot />
      <VibeCorner />
      {/* ============ NAV ============ */}
      <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <a href="#top" className="font-serif text-xl">
            Peter Zhao
          </a>
          <NavLinks />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <a
              href="/resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden whitespace-nowrap rounded-full border border-line px-4 py-1.5 text-sm font-medium text-muted transition hover:border-accent hover:text-accent xl:inline-block"
            >
              Resume
            </a>
            <a
              href={`mailto:${LINKS.email}`}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90"
            >
              Email
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto w-full max-w-5xl px-6">
        {/* ============ HERO ============ */}
        <section className="flex min-h-[80svh] flex-col justify-center py-20">
          <Reveal>
            <p className="mb-6 flex items-center gap-2.5 font-mono text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <a href="/now" className="transition hover:text-accent">
                Right now: NVIDIA, Santa Clara →
              </a>
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="relative max-w-3xl font-serif text-5xl leading-[1.08] tracking-tight sm:text-7xl">
              <HeroLine />
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-xl leading-relaxed text-muted">
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
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <div className="relative">
                <Magnetic>
                  <a
                    href="#play"
                    className="inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-accent-fg transition hover:opacity-90"
                  >
                    Play the games
                  </a>
                </Magnetic>
                <HandNote className="absolute -top-7 left-1/2 hidden w-max -translate-x-1/2 sm:inline-block">
                  Rust, C++, Go, and Java in there
                </HandNote>
              </div>
              <Magnetic>
                <a
                  href="#work"
                  className="inline-block rounded-lg border border-line bg-surface px-6 py-3 text-sm font-medium transition hover:border-accent/50"
                >
                  See my work
                </a>
              </Magnetic>
              <div className="flex gap-5 font-mono text-xs text-muted">
                <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="transition hover:text-accent">GitHub</a>
                <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="transition hover:text-accent">LinkedIn</a>
                <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="transition hover:text-accent">Resume</a>
              </div>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-14">
              <Stats />
            </div>
          </Reveal>
        </section>

        {/* ============ WORK ============ */}
        <section className="py-24" id="work">
          <SectionLabel n="01" title="Work" note="the resume part" />
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
          <SectionLabel n="02" title="Projects" note="the fun part" />
          <div className="grid gap-5 sm:grid-cols-2">
            {PROJECTS.map((project, i) => (
              <Reveal key={project.name} delay={i * 60} className="h-full">
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ============ MAP GAME ============ */}
        <section className="py-24" id="play">
          <SectionLabel n="03" title="Games" note="four languages, zero plugins" />
          <Reveal>
            <p className="mb-8 max-w-2xl leading-relaxed text-muted">
              A small arcade, each cabinet running a different language in your
              browser: the map game&apos;s engine is{" "}
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline decoration-accent/30 underline-offset-4 transition hover:decoration-accent"
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
            <div className="relative mt-10">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                laboratory
              </p>
              <BenchPanel />
              <HandNote className="absolute -top-6 right-2 hidden w-max sm:inline-block">
                yes, the C++ actually runs
              </HandNote>
            </div>
          </Reveal>
        </section>

        {/* ============ ABOUT ============ */}
        <section className="py-24" id="about">
          <SectionLabel n="04" title="About" note="the actual person" />
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
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="flex flex-col gap-4">
                <Polaroid
                  src="/first-home.jpg"
                  alt="The trailer in Pulaski, Wisconsin, where Peter grew up"
                  caption="pulaski, wisconsin — where it started"
                  width={316}
                  height={234}
                />
                <div className="rounded-xl border border-line bg-surface p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                    Education
                  </p>
                  <h3 className="mt-2 font-serif text-lg">
                    University of Wisconsin–Madison
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    B.S. Computer Science, Electrical Engineering &amp;
                    Mathematics, May 2027
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    STAR &amp; PEOPLE Scholar
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                    Tools I use
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {SKILL_GROUPS.flatMap((g) => g.items).map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-muted"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ PARKS TIER LIST ============ */}
        <section className="py-24" id="parks">
          <SectionLabel
            n="05"
            title="National parks, ranked"
            note="all 63. yes I have opinions"
          />
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
          <SectionLabel
            n="06"
            title="Watching"
            note="letterboxd, live"
          />
          <FilmShelf />
        </section>

        {/* ============ GAMES ============ */}
        <section className="py-24" id="games">
          <SectionLabel n="07" title="Playing" note="steam, live" />
          <GameShelf />
        </section>

        {/* ============ STATS ============ */}
        <section className="py-24" id="stats">
          <SectionLabel n="08" title="By the numbers" note="live data, real charts" />
          <Suspense fallback={null}>
            <StatsSection />
          </Suspense>
        </section>

        {/* ============ THE RESTAURANT ============ */}
        <section className="py-24" id="chinawok">
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl border-2 border-accent/40 bg-surface p-8 sm:p-12">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
                09 · One more thing
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
                  <div className="relative mt-8 inline-block">
                    <Magnetic>
                      <a
                        href="https://order.chinawoktasty.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-lg bg-accent px-8 py-4 text-base font-medium text-accent-fg transition hover:opacity-90"
                      >
                        Order here →
                      </a>
                    </Magnetic>
                    <HandNote className="absolute -right-36 top-1 hidden w-max sm:inline-block">
                      seriously, order here
                    </HandNote>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center gap-8">
                  <Polaroid
                    src="/china-wok-family.png"
                    alt="The family standing in front of China Wok, next to the delivery van"
                    caption="china wok, back then"
                    width={339}
                    height={357}
                  />
                  <FortuneCookie />
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ============ CONTACT ============ */}
        <section className="py-28 text-center" id="contact">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
              10 · Contact
            </p>
            <h2 className="mx-auto mt-5 max-w-2xl font-serif text-4xl leading-tight tracking-tight sm:text-6xl">
              Get in touch.
            </h2>
            <p className="mx-auto mt-5 max-w-md leading-relaxed text-muted">
              I&apos;m happy to talk about internships, projects, or school,
              and I answer email quickly. Genuinely, try me.
            </p>
            <div className="mt-9">
              <ContactForm />
            </div>
            <div className="mt-9 flex justify-center gap-7 font-mono text-xs text-muted">
              <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="transition hover:text-accent">LinkedIn</a>
              <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="transition hover:text-accent">GitHub</a>
              <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="transition hover:text-accent">Resume</a>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 font-mono text-xs text-muted">
          <span>Designed and built by me, in Pulaski, WI. © 2026</span>
          <span>Built with intention</span>
        </div>
      </footer>
    </>
  );
}
