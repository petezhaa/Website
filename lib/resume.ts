export type Role = {
  company: string;
  title: string;
  location: string;
  dates: string;
  status?: "current" | "incoming";
  quip: string;
  points: string[];
};

export type Project = {
  name: string;
  timeframe: string;
  quip: string;
  description: string;
  tags: string[];
};

export type SkillGroup = {
  label: string;
  items: string[];
};

export const ROLES: Role[] = [
  {
    company: "Microsoft",
    title: "Software Engineer Intern, AI/ML",
    location: "Remote",
    dates: "Jul – Sep 2026",
    status: "incoming",
    quip: "Qualifying the telemetry, statistics, and search of a certain Microsoft CEO's AI bot.",
    points: ["C++ and Python engineering for Azure Search."],
  },
  {
    company: "NVIDIA",
    title: "Systems Software Engineering Intern",
    location: "Santa Clara, CA",
    dates: "May – Jul 2026",
    status: "current",
    quip: "Building simulators so GPU systems can be tested without the hardware.",
    points: [
      "C++/Python simulation and systems infrastructure for large-scale GPU compute platforms, built for distributed multi-node HPC environments.",
      "Replay-based emulation frameworks that run without hardware, turning hardware-bound workflows into scalable failure-analysis pipelines.",
      "Analysis and replay tooling for heterogeneous system datasets: faster failure classification, root-cause isolation, and regression triage across GPU platforms.",
    ],
  },
  {
    company: "Amazon",
    title: "Software Development Engineer Intern",
    location: "Seattle, WA",
    dates: "May – Aug 2025",
    quip: "Automated thumbnail localization so nobody had to review 15 languages by hand.",
    points: [
      "AI inference pipeline (Java, AWS Lambda, DynamoDB) automating thumbnail localization across 15+ languages, cutting manual review 40% across 3 global teams.",
      "REST API on AWS CDK to query, flag, and reprocess incorrect AI outputs, reducing deployment time by 75%.",
      "TypeScript audit dashboard with OpenSearch-backed search with sub-200ms retrieval and reprocessing of flagged outputs.",
    ],
  },
  {
    company: "Linectra",
    title: "Founding Systems Software Engineer",
    location: "Madison, WI",
    dates: "Sep 2024 – May 2025",
    quip: "Firmware for a 480V power-control system at an early-stage startup.",
    points: [
      "Embedded C++ firmware for distributed 480V power control across 8 STM32s: a fault-tolerant RS-485 mesh with 40 ms failover and a custom 400 kHz I2C driver.",
      "Telemetry, data logging, and safety-interlock software; communication faults down 30%.",
    ],
  },
  {
    company: "Morgridge Institute for Research",
    title: "Optimization Software Researcher",
    location: "Madison, WI",
    dates: "Sep 2024 – May 2025",
    quip: "Getting distributed sensors to agree on what time it is, for neuroscience research.",
    points: [
      "Real-time signal synchronization algorithms in Python, cutting timing jitter from 12 ms to 2 ms across distributed sensor arrays for neuroscience research.",
      "Data-driven optimization research with NumPy/Pandas to find and remove pipeline bottlenecks.",
    ],
  },
];

export const PROJECTS: Project[] = [
  {
    name: "Battleship, Embedded",
    timeframe: "Nov 2025",
    quip: "Multiplayer Battleship on hardware I designed the PCB for.",
    description:
      "Multiplayer Battleship in C with modular, layered firmware: FSM-driven game logic, inter-device communication protocols, and real-time synchronization. PCB designed in Altium.",
    tags: ["C", "FSM", "Altium"],
  },
  {
    name: "Segway Balance Control",
    timeframe: "Nov 2025",
    quip: "A self-balancing Segway controller, running on real hardware.",
    description:
      "Real-time balance control on real hardware: PID feedback, UART/SPI interfaces, and sensor-fusion logic implemented in Verilog and C.",
    tags: ["Verilog", "C", "PID"],
  },
  {
    name: "ROT.AI",
    timeframe: "Nov 2024",
    quip: "Predicts how long internet slang will survive, trained on 500K posts.",
    description:
      "Forecasting engine for how long internet slang survives, using 500K+ Reddit, Quora, 4chan, and YouTube posts through PyTorch LSTM + Transformer models. 87% accuracy, Top 5 at Cheesehacks.",
    tags: ["PyTorch", "LSTM", "Transformers"],
  },
  {
    name: "STAR Scholars Dev Lead",
    timeframe: "2023 – 2026",
    quip: "Rebuilt the scholarship program's website with a team of four.",
    description:
      "Led a 4-person team refactoring the STAR Scholarship site into modular React, with 40% faster page loads and responsive across devices. Mentoring included.",
    tags: ["React", "Leadership"],
  },
];

export const SKILL_GROUPS: SkillGroup[] = [
  {
    label: "Languages",
    items: [
      "C/C++",
      "Python",
      "TypeScript",
      "Java",
      "Rust",
      "Bash",
      "MATLAB",
      "R",
      "Julia",
    ],
  },
  {
    label: "Embedded & Systems",
    items: [
      "FPGA (Verilog/VHDL)",
      "STM32",
      "ARM Cortex",
      "I2C / SPI / RS-485",
      "Raspberry Pi",
      "Arduino",
    ],
  },
  {
    label: "ML & Data",
    items: ["PyTorch", "TensorFlow", "NumPy", "Pandas", "SQL", "OpenSearch"],
  },
  {
    label: "Tools",
    items: [
      "Git & GitHub",
      "Docker",
      "Linux",
      "AWS (Lambda, CDK, DynamoDB)",
      "CI/CD pipelines",
      "Altium Designer",
      "React",
      "VS Code",
    ],
  },
];

export const LINKS = {
  email: "peterzhaoofficial@gmail.com",
  linkedin: "https://www.linkedin.com/in/peterwilsonzhao/",
  github: "https://github.com/petezhaa",
};
