export function LoadingButton(input: {
  isPending: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={input.onClick}
      disabled={input.isPending || input.disabled} // Disable button when loading or disabled prop is true
      className={`${
        input.className
      } px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-offset-2 ${
        input.isPending || input.disabled
          ? "bg-purple-400 cursor-not-allowed"
          : "bg-purple-600 hover:bg-purple-700"
      }`}
    >
      {input.isPending ? (
        <svg
          className="w-5 h-5 animate-spin mx-auto text-white" // Center spinner
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          ></path>
        </svg>
      ) : (
        input.children
      )}
    </button>
  );
}
