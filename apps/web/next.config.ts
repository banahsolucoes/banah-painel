import type { NextConfig } from "next";

const config: NextConfig = {
  // Os pacotes do monorepo são TypeScript puro; o Next compila junto.
  transpilePackages: [
    "@banah/shared",
    "@banah/db",
    "@banah/jobs",
    "@banah/connector-ml",
    "@banah/core",
  ],
  poweredByHeader: false,
};

export default config;
