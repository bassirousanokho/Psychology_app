import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js blocks cross-origin requests to dev assets by default (localhost only).
  // Needed to test through an ngrok tunnel (e.g. for the Clerk webhook).
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app"],
};

export default nextConfig;
