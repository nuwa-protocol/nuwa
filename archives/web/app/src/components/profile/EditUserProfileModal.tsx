import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { useUserUpdate } from "@/hooks/useUserUpdate";
import { useUserInit } from "@/hooks/useUserInit";
import useUserNameCheck from "@/hooks/useUserNameCheck";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: {
    name: string;
    username: string;
    avatar: string;
    id: string;
  };
  hasUsername: boolean;
  isSubmitting: boolean;
  onSuccess: () => void;
}

export const EditProfileModal = ({
  isOpen,
  onClose,
  initialData,
  hasUsername,
  isSubmitting,
  onSuccess,
}: EditProfileModalProps) => {
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    avatar: "",
  });
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const { mutate: updateUser } = useUserUpdate();
  const { mutate: initUser } = useUserInit();
  const { isPending: isCheckingUsername, refetch: refetchUsername } =
    useUserNameCheck(formData.username);

  useEffect(() => {
    setFormData(initialData);
    setPreviewUrl(initialData.avatar);
    setError("");
  }, [initialData]);

  useEffect(() => {
    setPreviewUrl(formData.avatar);
  }, [formData.avatar]);

  const handleEditProfile = async (data: {
    name: string;
    username: string;
    avatar: string;
  }) => {
    try {
      if (!hasUsername) {
        // initialize the user
        initUser({
          name: data.name,
          username: data.username.trim(),
          avatar: data.avatar,
        });
      } else {
        // update the user information
        if (data.name !== initialData.name) {
          updateUser({
            objId: initialData.id || "",
            name: data.name,
          });
        }
        if (data.avatar !== initialData.avatar) {
          updateUser({
            objId: initialData.id || "",
            avatar: data.avatar,
          });
        }
      }
      onSuccess();
      toast.success("Profile updated successfully!", {
        autoClose: 2000,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update profile:", error);
      setError("Failed to update profile");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // validate display name
    if (!formData.name.trim()) {
      setError("Display Name is required");
      return;
    }

    // validate the username
    if (!hasUsername) {
      if (!formData.username) {
        setError("Username is required");
        return;
      }

      // refetch the username
      const result = await refetchUsername();
      if (result.data?.error) {
        setError(result.data.error);
        return;
      }

      if (!result.data?.isAvailable) {
        setError("Username is not available");
        return;
      }
    }

    await handleEditProfile(formData);
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setFormData((prev) => {
      const newData = { ...prev, username: newUsername };
      // if the user has not set a username, then automatically update the avatar
      if (!hasUsername) {
        newData.avatar = `https://api.dicebear.com/9.x/dylan/svg?seed=${newUsername}`;
      }
      return newData;
    });
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full w-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all dark:bg-gray-800 sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-semibold leading-6 text-gray-900 dark:text-gray-100"
                    >
                      Edit Profile
                    </Dialog.Title>
                    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                      {!hasUsername && (
                        <div>
                          <label
                            htmlFor="username"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                          >
                            Username *
                          </label>
                          <input
                            type="text"
                            id="username"
                            value={formData.username}
                            onChange={handleUsernameChange}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
                            placeholder="Enter username"
                            disabled={isSubmitting}
                          />
                          {isCheckingUsername && (
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              Checking username availability...
                            </p>
                          )}
                        </div>
                      )}
                      <div>
                        <label
                          htmlFor="name"
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          Display Name *
                        </label>
                        <input
                          type="text"
                          id="name"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
                          placeholder="Enter display name"
                          disabled={isSubmitting}
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="avatar"
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          Avatar URL
                        </label>
                        <input
                          type="text"
                          id="avatar"
                          value={formData.avatar}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              avatar: e.target.value,
                            }))
                          }
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
                          placeholder="Enter avatar URL"
                          disabled={isSubmitting}
                        />
                        {previewUrl && (
                          <div className="mt-2 flex justify-center">
                            <img
                              src={previewUrl}
                              alt="Avatar preview"
                              className="h-20 w-20 rounded-full object-cover"
                              onError={() => setPreviewUrl("")}
                            />
                          </div>
                        )}
                      </div>
                      {error && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      )}
                      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="inline-flex w-full justify-center rounded-md bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-3 sm:w-auto"
                        >
                          {isSubmitting ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-600 dark:hover:bg-gray-600 sm:mt-0 sm:w-auto"
                          onClick={onClose}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
