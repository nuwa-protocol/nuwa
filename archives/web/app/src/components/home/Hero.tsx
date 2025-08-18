import { Link } from "react-router-dom";

export function Hero() {
  return (
    <div className="relative md:min-h-[600px]">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/95 to-[#FF15FB] bg-[length:100%_200%] bg-[position:0%_30%] dark:from-gray-900 dark:via-gray-900 dark:to-[#FF15FB]"></div>
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `url('/hero-background.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: "grayscale(100%)",
        }}
      ></div>
      <div className="container relative mx-auto px-4 py-8 sm:py-24">
        <div className="pt-[30px] text-center">
          {/* Logo */}
          <div className="mb-8 flex justify-center sm:mb-12">
            <img
              src="/nuwa-logo-horizontal-dark.svg"
              className="hidden h-10 w-auto dark:block sm:h-20"
              alt="Nuwa"
            />
            <img
              src="/nuwa-logo-horizontal.svg"
              className="h-10 w-auto dark:hidden sm:h-20"
              alt="Nuwa"
            />
          </div>

          {/* Tagline */}
          <h1 className="mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-2xl font-bold text-transparent sm:text-4xl md:text-5xl">
            Own. Interact. Learn. Evolve on-chain
          </h1>

          {/* Description */}
          <p className="mx-auto mb-8 max-w-2xl text-base text-gray-600 dark:text-gray-300 sm:text-xl">
            Nuwa is an On-Chain AI with its own assets, on-chain operations, and
            continuous learning.
          </p>

          {/* Explore Agents Button */}
          <Link
            // cSpell:ignore allagents
            to="/allagents"
            className="group relative inline-block overflow-hidden rounded-full border-2 border-purple-600 bg-white px-8 py-3 text-lg font-semibold transition-all duration-500 ease-in-out hover:border-transparent dark:bg-gray-900"
          >
            <span className="relative z-10 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent transition-colors duration-500 group-hover:text-white">
              Explore Agents
            </span>
            <div className="absolute inset-0 origin-left scale-x-0 transform bg-gradient-to-r from-purple-600 to-pink-600 transition-transform duration-500 ease-in-out group-hover:scale-x-100"></div>
            <div className="absolute inset-0 origin-right scale-x-0 transform bg-gradient-to-r from-purple-600 to-pink-600 transition-transform delay-100 duration-500 ease-in-out group-hover:scale-x-100"></div>
          </Link>
        </div>
      </div>
    </div>
  );
}
