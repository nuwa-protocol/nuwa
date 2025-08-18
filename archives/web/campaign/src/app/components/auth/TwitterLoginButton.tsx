import { signIn, signOut, useSession } from "next-auth/react";
import { FaTwitter } from "react-icons/fa";

export const TwitterLoginButton = () => {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return <div>Loading...</div>;
    }

    if (session) {
        return (
            <div className="flex flex-col items-center">
                <div className="flex items-center space-x-2 mb-4">
                    {session.user?.image && (
                        <img
                            src={session.user.image}
                            alt={session.user.name || "User avatar"}
                            className="w-10 h-10 rounded-full"
                        />
                    )}
                    <div>
                        <p className="font-medium">{session.user?.name}</p>
                        <p className="text-sm text-gray-500">@{session.user?.twitterHandle}</p>
                    </div>
                </div>
                <button
                    onClick={() => signOut()}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
                >
                    Sign Out
                </button>
            </div>
        );
    }

    return (
        <button
            onClick={() => signIn("twitter", { callbackUrl: "/" })}
            className="flex items-center space-x-2 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white font-bold py-2 px-4 rounded"
        >
            <FaTwitter className="text-xl" />
            <span>Sign in with Twitter</span>
        </button>
    );
}; 