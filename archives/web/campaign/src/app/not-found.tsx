import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="p-8 bg-white rounded-lg shadow-md max-w-md w-full text-center">
                <div className="mb-6">
                    <svg className="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">404 - Not Found</h1>
                <p className="text-gray-600 mb-6">
                    Sorry, the page you are looking for does not exist.
                </p>
                <Link href="/" className="inline-block px-6 py-2 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors">
                    Return Home
                </Link>
            </div>
        </div>
    );
} 