import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

export default function config(phase: string): NextConfig {
  return {
    cacheComponents: true,
    partialPrefetching: true,
    // Otherwise next dev re-creates AGENTS.md whenever an AI coding agent runs it.
    agentRules: false,
    // Its badge would sit on top of the status bar.
    devIndicators: false,
    // Authors never get an EPUB export, so only `next dev` builds the team's check.
    // A flag isn't enough: the bundler would still publish the unused code.
    turbopack: {
      resolveAlias:
        phase === PHASE_DEVELOPMENT_SERVER
          ? {}
          : { "@/components/editor/TeamEpubCheck": "./src/components/editor/NoTeamEpubCheck.tsx" },
    },
  };
}
