import { SEO } from "@/components/layout/SEO";
import { useCreateAgent } from "@/hooks/useAgentCreate";
import useUserNameCheck from "@/hooks/useUserNameCheck";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import React, { useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

interface CreateAgentForm {
  username: string;
  name: string;
  avatar: string | null;
  description: string;
  prompt: string;
  isPaid: boolean;
}

export const CreateAgent = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateAgentForm>({
    username: "",
    name: "",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=default",
    description: "",
    prompt: "",
    isPaid: false,
  });
  const { mutate, isPending } = useCreateAgent();
  const [errors, setErrors] = useState<Partial<CreateAgentForm>>({});
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(
    "https://api.dicebear.com/7.x/bottts/svg?seed=default",
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [hasCustomAvatar, setHasCustomAvatar] = useState(false);
  const {
    available: usernameCheck,
    isPending: isCheckingUsername,
    refetch: refetchUsername,
  } = useUserNameCheck(form.username);

  const getDefaultAvatar = (username: string) => {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${
      username || "default"
    }`;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear error when user types
    if (errors[name as keyof CreateAgentForm]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
    // Update default avatar when username changes and no custom avatar is set
    if (name === "username" && !hasCustomAvatar) {
      const defaultAvatar = getDefaultAvatar(value);
      setPreviewAvatar(defaultAvatar);
      setForm((prev) => ({
        ...prev,
        avatar: defaultAvatar,
      }));
    }
  };

  const handleAvatarError = () => {
    const defaultAvatar = getDefaultAvatar(form.username);
    setPreviewAvatar(defaultAvatar);
    setAvatarError("Failed to load image. Please check the URL and try again.");
    setForm((prev) => ({
      ...prev,
      avatar: defaultAvatar,
    }));
    setHasCustomAvatar(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value.trim();
    setAvatarError(null);
    setPreviewAvatar(url);
    setForm((prev) => ({
      ...prev,
      avatar: url,
    }));
    setHasCustomAvatar(true);
  };

  const validateUsername = (username: string): string | null => {
    if (!username.trim()) {
      return "Username cannot be empty";
    }
    if (username.length < 3) {
      return "Username must be at least 3 characters";
    }
    if (username.length > 32) {
      return "Username cannot exceed 32 characters";
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return "Username can only contain letters, numbers and underscores";
    }
    if (/^\d+$/.test(username)) {
      return "Username cannot contain only numbers";
    }
    return null;
  };

  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return "Display name cannot be empty";
    }
    if (name.length < 2) {
      return "Display name must be at least 2 characters";
    }
    if (name.length > 64) {
      return "Display name cannot exceed 64 characters";
    }
    if (name.includes("\n")) {
      return "Display name cannot contain line breaks";
    }
    if (/^\s+$/.test(name)) {
      return "Display name cannot contain only whitespace";
    }
    return null;
  };

  const validateDescription = (description: string): string | null => {
    if (description.length > 256) {
      return "Description cannot exceed 256 characters";
    }
    if (description.includes("\n")) {
      return "Description cannot contain line breaks";
    }
    if (description.trim() && /^\s+$/.test(description)) {
      return "Description cannot contain only whitespace";
    }
    return null;
  };

  const validatePrompt = (prompt: string): string | null => {
    if (prompt.length > 4096) {
      return "Prompt cannot exceed 4096 characters";
    }
    if (prompt.trim() && /^\s+$/.test(prompt)) {
      return "Prompt cannot contain only whitespace";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Partial<CreateAgentForm> = {};

    const usernameError = validateUsername(form.username);
    if (usernameError) {
      newErrors.username = usernameError;
    }

    const nameError = validateName(form.name);
    if (nameError) {
      newErrors.name = nameError;
    }

    const descriptionError = validateDescription(form.description);
    if (descriptionError) {
      newErrors.description = descriptionError;
    }

    const promptError = validatePrompt(form.prompt);
    if (promptError) {
      newErrors.prompt = promptError;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const result = await refetchUsername();
    if (result.data?.error) {
      setErrors((prev) => ({
        ...prev,
        username: result.data.error,
      }));
      return;
    }

    if (!result.data?.isAvailable) {
      setErrors((prev) => ({
        ...prev,
        username: "Username is not available",
      }));
      return;
    }

    mutate(
      {
        name: form.name,
        username: form.username,
        avatar: form.avatar!,
        description: form.description,
        instructions: form.prompt,
      },
      {
        onSuccess: () => {
          navigate(-1);
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  return (
    <>
      <SEO
        title="Create Agent"
        description="Create your own AI agent on Nuwa platform. Design and deploy Web3 AI Agents that can manage crypto assets and execute on-chain operations."
        keywords="Create AI Agent, Web3 AI, Autonomous Agent, Crypto Agent, Blockchain AI, Nuwa Agent Creation"
      />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
              <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
                Create Agent
              </h1>

              {/* Username */}
              <div className="mb-6">
                <label
                  htmlFor="username"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Username *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={form.username}
                    onChange={handleInputChange}
                    className={`block w-full rounded-lg border ${
                      errors.username
                        ? "border-red-500"
                        : usernameCheck?.isAvailable
                          ? "border-green-500"
                          : "border-gray-300 dark:border-gray-600"
                    } bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-gray-100`}
                    placeholder="Enter globally unique username"
                  />
                  {isCheckingUsername && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
                    </div>
                  )}
                  {!isCheckingUsername && usernameCheck?.isAvailable && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 transform text-green-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                {errors.username && (
                  <p className="mt-1 text-sm text-red-500">{errors.username}</p>
                )}
                {!errors.username && usernameCheck?.isAvailable && (
                  <p className="mt-1 text-sm text-green-500">
                    Username is available!
                  </p>
                )}
              </div>

              {/* Display Name */}
              <div className="mb-6">
                <label
                  htmlFor="name"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Display Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  className={`block w-full rounded-lg border ${
                    errors.name
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  } bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-gray-100`}
                  placeholder="Enter display name"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Avatar URL */}
              <div className="mb-6">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Avatar
                </label>
                <div className="flex items-center space-x-4">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gray-300 dark:border-gray-600">
                    {previewAvatar ? (
                      <img
                        src={previewAvatar}
                        alt="Avatar preview"
                        className="h-full w-full object-cover"
                        onError={handleAvatarError}
                      />
                    ) : (
                      <PhotoIcon className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="url"
                      id="avatarUrl"
                      name="avatarUrl"
                      placeholder="Enter the url to your avatar"
                      className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      onChange={handleAvatarChange}
                    />
                    {avatarError && (
                      <p className="mt-1 text-sm text-red-500">{avatarError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label
                  htmlFor="description"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={handleInputChange}
                  rows={3}
                  className={`block w-full rounded-lg border ${
                    errors.description
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  } bg-white px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-gray-100`}
                  placeholder="Enter agent description"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-500">
                    {errors.description}
                  </p>
                )}
              </div>

              {/* Prompt */}
              <div className="mb-6">
                <label
                  htmlFor="prompt"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Prompt
                </label>
                <textarea
                  id="prompt"
                  name="prompt"
                  value={form.prompt}
                  onChange={handleInputChange}
                  rows={5}
                  className={`block w-full rounded-lg border ${
                    errors.prompt
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  } bg-white px-4 py-2 font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-gray-100`}
                  placeholder="Enter agent prompt"
                />
                <div className="mt-1 flex items-center justify-between">
                  {errors.prompt && (
                    <p className="text-sm text-red-500">{errors.prompt}</p>
                  )}
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {4096 - (form.prompt?.length || 0)}/4096 characters
                    remaining
                  </p>
                </div>
              </div>

              {/* Paid Option */}
              <div className="mb-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPaid"
                    name="isPaid"
                    checked={form.isPaid}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <label
                    htmlFor="isPaid"
                    className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
                  >
                    It takes 100 RGAS to create an agent. It will be charged to
                    the agent's account.
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <SessionKeyGuard onClick={() => {}}>
                  <button
                    type="submit"
                    disabled={isPending}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isPending
                        ? "cursor-not-allowed bg-purple-400"
                        : "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
                    }`}
                  >
                    {isPending ? (
                      <svg
                        className="mx-auto h-5 w-5 animate-spin text-white"
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
                      "Create"
                    )}
                  </button>
                </SessionKeyGuard>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
