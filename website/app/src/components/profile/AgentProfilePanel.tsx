import { useState, useEffect } from "react";
import { PencilIcon, ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import { useAgentProfile } from "./AgentProfileContext";
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';

export function AgentProfilePanel() {
    const { agent, isOwner, caps, updateAgent, refetchAgent } = useAgentProfile();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [previewAvatar, setPreviewAvatar] = useState<string>("");
    const [avatarError, setAvatarError] = useState<string>("");

    const [editForm, setEditForm] = useState({
        name: agent?.name,
        description: agent?.description,
        avatar: agent?.avatar,
    });

    const [formErrors, setFormErrors] = useState<{
        name?: string;
        description?: string;
    }>({});

    useEffect(() => {
        if (isEditing) {
            setPreviewAvatar(editForm.avatar || "");
        }
    }, [isEditing]);

    const validateImageUrl = (url: string) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    };

    const handleAvatarChange = async (url: string) => {
        setEditForm((prev) => ({
            ...prev,
            avatar: url,
        }));
        setAvatarError("");

        if (!url) {
            setPreviewAvatar(agent?.avatar || "");
            return;
        }

        try {
            const isValid = await validateImageUrl(url);
            if (isValid) {
                setPreviewAvatar(url);
                setAvatarError("");
            } else {
                setPreviewAvatar(agent?.avatar || "");
                setAvatarError("Invalid image URL");
            }
        } catch (error) {
            setPreviewAvatar(agent?.avatar || "");
            setAvatarError("Invalid image URL");
        }
    };

    const validateName = (name: string): string | null => {
        if (!name.trim()) {
            return 'Name cannot be empty'
        }
        if (name.length < 2) {
            return 'Name must be at least 2 characters'
        }
        if (name.length > 64) {
            return 'Name cannot be longer than 64 characters'
        }
        if (name.includes('\n')) {
            return 'Name cannot contain newline characters'
        }
        if (/^\s+$/.test(name)) {
            return 'Name cannot only contain spaces'
        }
        return null
    }

    const validateDescription = (description: string): string | null => {
        if (description.length > 256) {
            return 'Description cannot be longer than 256 characters'
        }
        if (description.includes('\n')) {
            return 'Description cannot contain newline characters'
        }
        if (description.trim() && /^\s+$/.test(description)) {
            return 'Description cannot only contain spaces'
        }
        return null
    }

    const handleEdit = async () => {
        if (isEditing) {
            // validate the form
            const newErrors: {
                name?: string;
                description?: string;
            } = {};

            const nameError = validateName(editForm.name || '');
            if (nameError) {
                newErrors.name = nameError;
            }

            const descriptionError = validateDescription(editForm.description || '');
            if (descriptionError) {
                newErrors.description = descriptionError;
            }

            if (Object.keys(newErrors).length > 0) {
                setFormErrors(newErrors);
                return;
            }

            // Save changes
            if (
                editForm.name === agent?.name &&
                editForm.description === agent?.description &&
                editForm.avatar === agent?.avatar
            ) {
                setIsEditing(false);
                return;
            }

            setIsSaving(true);
            try {
                if (editForm.name !== agent?.name) {
                    await updateAgent({
                        cap: caps.get(agent?.id!)!.id,
                        name: editForm.name,
                    });
                }

                if (editForm.description !== agent?.description) {
                    await updateAgent({
                        cap: caps.get(agent?.id!)!.id,
                        description: editForm.description,
                    });
                }

                if (editForm.avatar !== agent?.avatar) {
                    await updateAgent({
                        cap: caps.get(agent?.id!)!.id,
                        avatar: editForm.avatar,
                    });
                }

                toast.success('Agent information updated successfully!', {
                    position: "top-right",
                    autoClose: 2000,
                    hideProgressBar: false,
                    closeOnClick: true,
                    pauseOnHover: true,
                    draggable: true,
                    progress: undefined,
                    theme: "light",
                });
            } finally {
                refetchAgent();
                setIsSaving(false);
            }
        } else {
            // Start editing
            setEditForm({
                name: agent?.name || "",
                description: agent?.description || "",
                avatar: agent?.avatar || "",
            });
            setFormErrors({});
        }
        setIsEditing(!isEditing);
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {/* Cover Image */}
            <div className="h-32 bg-gradient-to-r from-purple-600 to-pink-600"></div>

            {/* Profile Info */}
            <div className="px-6 pb-6">
                {/* Avatar */}
                <div className="relative -mt-16 mb-4">
                    <img
                        src={
                            isEditing ? previewAvatar || agent?.avatar : agent?.avatar
                        }
                        alt={agent?.username}
                        className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-800 bg-white dark:bg-gray-800"
                    />
                </div>

                {/* Name and Username */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        {isEditing ? (
                            <>
                                <div className="mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        头像URL
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.avatar}
                                        onChange={(e) => handleAvatarChange(e.target.value)}
                                        className={`block w-full text-sm bg-transparent border rounded-lg p-2 focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none ${avatarError ? "border-red-500" : ""}`}
                                        placeholder="输入头像URL"
                                    />
                                    {avatarError && (
                                        <p className="mt-1 text-sm text-red-500">
                                            {avatarError}
                                        </p>
                                    )}
                                </div>
                                <div className="mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        名称
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
                                        }
                                        className={`block w-full text-sm bg-transparent border rounded-lg p-2 focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none ${formErrors.name ? 'border-red-500' : ''}`}
                                        placeholder="输入名称"
                                    />
                                    {formErrors.name && (
                                        <p className="mt-1 text-sm text-red-500">{formErrors.name}</p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {agent?.name}
                            </h1>
                        )}
                        <div className="mt-1 text-purple-600 dark:text-purple-400">
                            @{agent?.username}
                        </div>
                    </div>
                    {isOwner && (
                        <SessionKeyGuard onClick={handleEdit}>
                            <button className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                <PencilIcon className="w-4 h-4 mr-2" />
                                {isSaving ? (
                                    <svg
                                        className="w-5 h-5 animate-spin mx-auto text-white"
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
                                ) : isEditing ? (
                                    "Save"
                                ) : (
                                    "Edit"
                                )}
                            </button>
                        </SessionKeyGuard>
                    )}
                </div>

                {/* Description */}
                <div className="max-w-2xl">
                    {isEditing ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <textarea
                                value={editForm.description}
                                onChange={(e) =>
                                    setEditForm((prev) => ({
                                        ...prev,
                                        description: e.target.value,
                                    }))
                                }
                                className={`block w-full text-sm text-gray-600 dark:text-gray-300 bg-transparent border rounded-lg p-2 focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none ${formErrors.description ? 'border-red-500' : ''}`}
                                placeholder="Input description"
                                rows={2}
                            />
                            {formErrors.description && (
                                <p className="mt-1 text-sm text-red-500">{formErrors.description}</p>
                            )}
                        </div>
                    ) : (
                        <p className="text-gray-600 dark:text-gray-300">
                            {agent?.description}
                        </p>
                    )}
                </div>
                <div className="mt-4">
                    <Link
                        to={`/agent/${agent?.username}`}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        <ChatBubbleLeftIcon className="w-4 h-4 mr-2" />
                        Start Chat
                    </Link>
                </div>
            </div>
        </div>
    );
} 