/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@diff-checker/markdown-reporter',
    '@diff-checker/html-reporter',
    '@diff-checker/json-reporter',
    '@diff-checker/core-engine',
  ],
};

export default nextConfig;

