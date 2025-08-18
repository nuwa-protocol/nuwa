import { useState } from "react";
import { PencilIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import { useAgentProfile } from "./AgentProfileContext";
import { toast } from "react-toastify";

export function AgentPromptPanel() {
  const { agent, isOwner, caps, updateAgent, refetchAgent } = useAgentProfile();
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isSavingPop, setIsSavingPop] = useState(false);

  const [editForm, setEditForm] = useState({
    prompt: agent?.instructions,
  });

  const [formErrors, setFormErrors] = useState<{
    prompt?: string;
  }>({});

  const validatePrompt = (prompt: string): string | null => {
    if (prompt.length > 4096) {
      return "Prompt cannot be longer than 4096 characters";
    }
    if (prompt.trim() && /^\s+$/.test(prompt)) {
      return "Prompt cannot only contain spaces";
    }
    return null;
  };

  const handlePromptEdit = async () => {
    if (!isOwner) return;

    if (isEditingPrompt) {
      // validate the prompt
      const promptError = validatePrompt(editForm.prompt || "");
      if (promptError) {
        setFormErrors((prev) => ({
          ...prev,
          prompt: promptError,
        }));
        return;
      }

      // Save changes
      if (editForm.prompt === agent?.instructions) {
        setIsEditingPrompt(false);
        return;
      }

      setIsSavingPop(true);
      try {
        if (editForm.prompt !== agent?.instructions) {
          await updateAgent({
            cap: caps.get(agent?.id!)!.id,
            instructions: editForm.prompt,
          });
        }

        toast.success("Agent prompt updated successfully!", {
          autoClose: 2000,
        });
      } finally {
        refetchAgent();
        setIsSavingPop(false);
      }
    } else {
      // Start editing
      setEditForm({
        ...editForm,
        prompt: agent?.instructions || "",
      });
      setFormErrors((prev) => ({
        ...prev,
        prompt: undefined,
      }));
    }
    setIsEditingPrompt(!isEditingPrompt);
  };

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Prompt
          </h2>
          {isOwner ? (
            <SessionKeyGuard onClick={handlePromptEdit}>
              <button className="flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                <PencilIcon className="mr-2 h-4 w-4" />
                {isSavingPop ? (
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
                ) : isEditingPrompt ? (
                  "Save"
                ) : (
                  "Edit"
                )}
              </button>
            </SessionKeyGuard>
          ) : (
            <div className="flex items-center text-gray-500 dark:text-gray-400">
              <LockClosedIcon className="mr-2 h-4 w-4" />
              <span className="text-sm">Only the owner can edit</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {isEditingPrompt ? (
            <>
              <textarea
                value={editForm.prompt}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    prompt: e.target.value,
                  }))
                }
                className={`block w-full rounded-lg border bg-transparent p-4 font-mono text-sm leading-relaxed text-gray-600 focus:border-purple-500 focus:outline-none dark:text-gray-300 dark:focus:border-purple-400 ${
                  formErrors.prompt ? "border-red-500" : ""
                }`}
                placeholder="Input the prompt of the AI role..."
                rows={12}
              />
              <div className="mt-1 flex items-center justify-between">
                {formErrors.prompt && (
                  <p className="text-sm text-red-500">{formErrors.prompt}</p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {4096 - (editForm.prompt?.length || 0)}/4096 characters
                  remaining
                </p>
              </div>
            </>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-sm leading-relaxed text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
              {agent?.instructions}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
