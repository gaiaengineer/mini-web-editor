import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Otherwise next dev re-creates AGENTS.md whenever an AI coding agent runs it.
  agentRules: false,
};

export default nextConfig;
