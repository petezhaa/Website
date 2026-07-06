import { Suspense } from "react";
import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { Polaroid } from "@/components/Polaroid";
import { FortuneCookie } from "@/components/FortuneCookie";
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

// An editorial section head: a serif title, an optional standfirst, a rule.
function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-16 sm:py-20">
      <Reveal>
        <div className="mb-9">
          <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
            {title}
          </h2>
          {note && <p className="mt-1.5 max-w-xl text-muted">{note}</p>}
          <div className="mt-5 h-px w-full bg-line" />
        </div>
      </Reveal>
      {children}
    </section>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <PeterBotShell />
      <VibeCorner />

      {/* ============ NAV ============ */}
      <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <a href="#top" className="font-serif text-lg tracking-tight">
            Peter Zhao
          </a>
          <NavLinks />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="/resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-term hidden whitespace-nowrap px-3.5 py-1.5 text-sm xl:inline-block"
            >
              Resume
            </a>
            <a
              href={`mailto:${LINKS.email}`}
              className="btn-solid px-3.5 py-1.5 text-sm"
            >
              Email
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto w-full max-w-5xl px-6">
        {/* ============ HERO ============ */}
        <section className="grid min-h-[84svh] items-center gap-12 py-16 lg:grid-cols-[1.55fr_1fr] lg:gap-16">
          <div>
            <Reveal>
              <HeroLine />
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
                I&apos;m Peter Zhao, a student engineer at UW&ndash;Madison.
                Right now I&apos;m at NVIDIA working on GPU simulation
                infrastructure, and later this year I&apos;ll be at Microsoft
                working on Azure Search. Last summer I was at Amazon.
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-4">
                <Magnetic>
                  <a href="#play" className="btn-solid inline-block px-6 py-3 text-sm">
                    Play the games
                  </a>
                </Magnetic>
                <Magnetic>
                  <a href="#work" className="btn-term inline-block px-6 py-3 text-sm">
                    See my work
                  </a>
                </Magnetic>
                <div className="flex gap-5 text-sm text-muted">
                  <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">GitHub</a>
                  <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">LinkedIn</a>
                </div>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-12">
                <Stats />
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <figure className="mx-auto w-fit">
              <div className="mx-auto h-64 w-64 overflow-hidden rounded-full border border-line bg-surface shadow-sm sm:h-72 sm:w-72 lg:h-80 lg:w-80">
                <Image
                  src="/childhood.jpg"
                  alt="Peter as a small child in rural Wisconsin"
                  width={480}
                  height={480}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </div>
              <figcaption className="mt-4 text-center text-sm italic text-muted">
                Rural Wisconsin. Age four.
              </figcaption>
            </figure>
          </Reveal>
        </section>

        {/* ============ WORK ============ */}
        <Section id="work" title="Work">
          <div className="flex flex-col lg:pl-5">
            {ROLES.map((role, i) => (
              <Reveal key={role.company + role.dates} delay={i * 50}>
                <WorkRole role={role} last={i === ROLES.length - 1} />
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ============ PROJECTS ============ */}
        <Section id="projects" title="Projects">
          <div className="grid gap-5 sm:grid-cols-2">
            {PROJECTS.map((project, i) => (
              <Reveal key={project.name} delay={i * 60} className="h-full">
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ============ THE ARCADE ============ */}
        <Section id="play" title="The arcade">
          <Reveal>
            <p className="mb-8 max-w-2xl leading-relaxed text-muted">
              I built a small arcade for this site, and each game runs in a
              different language in your browser. The map game&apos;s engine is{" "}
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="tlink"
              >
                Rust compiled to WebAssembly
              </a>
              , the physics and math sims are written in C++, the board game Go
              is written in Go, and Snake is real Java bytecode running on a
              small JVM that I wrote for this site.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <GameChooser />
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-12">
              <h3 className="font-serif text-xl tracking-tight">Benchmarks</h3>
              <p className="mb-3 mt-1 text-sm text-muted">
                The same workload runs in each language so you can compare
                them.
              </p>
              <BenchPanel />
            </div>
          </Reveal>
        </Section>

        {/* ============ ABOUT ============ */}
        <Section id="about" title="About">
          <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
            <Reveal>
              <div className="space-y-5 leading-relaxed text-muted">
                <p className="font-serif text-2xl leading-snug tracking-tight text-fg sm:text-3xl">
                  I grew up in rural Wisconsin, in a trailer park.
                </p>
                <p>
                  I worked at my parents&apos; restaurant. I was one of the only
                  Asian students in my school, got held back in kindergarten, and
                  still ended up valedictorian of my high school.
                </p>
                <p>
                  I study three majors because the things I want to build need
                  all three of them. GPU systems, firmware, and control systems
                  all sit between computer science and electrical engineering.
                </p>
                <p>
                  Outside of school I like history, film, photography, grand
                  strategy games, and hiking.
                </p>
                <div className="max-w-sm pt-3">
                  <Polaroid
                    src="/first-home.jpg"
                    alt="The trailer in rural Wisconsin where Peter grew up"
                    caption="where it started"
                    width={316}
                    height={234}
                  />
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="space-y-8">
                <div>
                  <Kicker>Education</Kicker>
                  <h3 className="mt-2 font-serif text-xl tracking-tight">
                    University of Wisconsin&ndash;Madison
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    B.S. Computer Science, Electrical Engineering &amp;
                    Mathematics &middot; May 2027
                  </p>
                  <p className="text-sm text-muted">STAR &amp; PEOPLE Scholar</p>
                </div>
                <div className="space-y-4">
                  <Kicker>What I work with</Kicker>
                  {SKILL_GROUPS.map((g) => (
                    <div key={g.label}>
                      <h4 className="text-sm font-semibold">{g.label}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {g.items.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ============ PARKS ============ */}
        <Section
          id="parks"
          title="National parks, ranked"
          note="All 63 U.S. national parks."
        >
          <Reveal>
            <p className="mb-8 max-w-2xl leading-relaxed text-muted">
              I ranked all 63 national parks based on the ones I have visited
              and photos of the rest. You can drag a park to where you think it
              belongs.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <ParkTierList />
          </Reveal>
        </Section>

        {/* ============ FILMS ============ */}
        <Section id="films" title="Watching" note="From Letterboxd.">
          <Suspense fallback={null}>
            <FilmShelf />
          </Suspense>
        </Section>

        {/* ============ VIDEO GAMES ============ */}
        <Section id="games" title="Playing" note="From Steam.">
          <Suspense fallback={null}>
            <GameShelf />
          </Suspense>
        </Section>

        {/* ============ STATS ============ */}
        <Section id="stats" title="By the numbers" note="Live data.">
          <Suspense fallback={null}>
            <StatsSection />
          </Suspense>
        </Section>

        {/* ============ THE RESTAURANT ============ */}
        <section id="chinawok" className="scroll-mt-24 py-16 sm:py-20">
          <Reveal>
            <div className="rounded-2xl border border-line bg-surface p-8 sm:p-12">
              <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-center">
                <div>
                  <Kicker>The restaurant</Kicker>
                  <h2 className="mt-3 max-w-2xl font-serif text-3xl leading-snug tracking-tight sm:text-4xl">
                    My parents run a Chinese restaurant.
                  </h2>
                  <p className="mt-5 max-w-xl leading-relaxed text-muted">
                    It is called China Wok, and it is back home in Wisconsin.
                    Working there taught me most of my work ethic, and it
                    helped pay for school. If you are ever near Green Bay you
                    should order the General Tso&apos;s.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                    <span className="text-gold">4.7★ on Google</span>
                    <span>near Green Bay, WI</span>
                    <span>$10&ndash;20</span>
                  </div>
                  <div className="mt-8">
                    <Magnetic>
                      <a
                        href="https://order.chinawoktasty.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-solid inline-block px-7 py-3.5 text-base"
                      >
                        Order here &rarr;
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
          </Reveal>
        </section>

        {/* ============ CONTACT ============ */}
        <section id="contact" className="scroll-mt-24 py-20 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
            <Reveal>
              <div>
                <h2 className="max-w-md font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                  Get in touch.
                </h2>
                <p className="mt-5 max-w-md leading-relaxed text-muted">
                  I&apos;m happy to talk about internships, projects, or
                  school. I answer email quickly.
                </p>
                <div className="mt-6 flex gap-6 text-sm text-muted">
                  <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">LinkedIn</a>
                  <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">GitHub</a>
                  <a href="/resume.pdf" target="_blank" rel="noopener noreferrer" className="tlink !text-muted hover:!text-accent">Resume</a>
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-8 text-sm text-muted">
          <span>© 2026 Peter Zhao, Wisconsin</span>
          <a
            href={LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="tlink !text-muted hover:!text-accent"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
