/** @type {import('next').NextConfig} */

const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // El proxy a /api reenvía el body a memoria; por defecto limita a 10MB y trunca.
  // La carga de la elección completa (~95MB) lo supera, así que lo subimos.
  experimental: {
    proxyClientMaxBodySize: '250mb',
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
}

export default nextConfig
