/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@langchain/groq",
      "@langchain/langgraph", 
      "@langchain/core",
      "langchain",
      "twilio"
    ]
  }
}

module.exports = nextConfig