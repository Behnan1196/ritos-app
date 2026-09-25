/** @type {import('next').NextConfig} */
const nextConfig = {
  // Yerleşim laboratuvarı — hız için lint deploy'u durdurmasın (tip kontrolü açık kalır).
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
