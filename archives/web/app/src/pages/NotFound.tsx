import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-gray-900 dark:text-white">
          404
        </h1>
        <p className="mb-8 text-xl text-gray-600 dark:text-gray-300">
          Can't find the page you're looking for
        </p>
        <Link
          to="/"
          className="group relative inline-block overflow-hidden rounded-full border-2 border-purple-600 bg-white px-8 py-3 text-lg font-semibold transition-all duration-500 ease-in-out hover:border-transparent dark:bg-gray-900"
        >
          <span className="relative z-10 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent transition-colors duration-500 group-hover:text-white">
            Back to Home
          </span>
          <div className="absolute inset-0 origin-left scale-x-0 transform bg-gradient-to-r from-purple-600 to-pink-600 transition-transform duration-500 ease-in-out group-hover:scale-x-100"></div>
          <div className="absolute inset-0 origin-right scale-x-0 transform bg-gradient-to-r from-purple-600 to-pink-600 transition-transform delay-100 duration-500 ease-in-out group-hover:scale-x-100"></div>
        </Link>
      </div>
    </div>
  );
}
