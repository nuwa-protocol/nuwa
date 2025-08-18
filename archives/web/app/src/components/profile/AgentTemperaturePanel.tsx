import { useState, useEffect } from "react";
import { PencilIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import { useAgentProfile } from "./AgentProfileContext";
import { toast } from "react-toastify";
import { useUpdateAgentTemperature } from "@/hooks/useAgentTemperatureUpdate";
import { useAgentTemperature } from "@/hooks/useAgentTemperature";

export function AgentTemperaturePanel() {
  const { agent, isOwner, caps, refetchAgent } = useAgentProfile();
  const { mutateAsync: updateAgentTemperature } = useUpdateAgentTemperature();
  const {
    data: fetchedTemperature,
    refetch: refetchTemperature,
    isLoading,
  } = useAgentTemperature(agent?.id);
  const [isEditingTemperature, setIsEditingTemperature] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Safely parse temperature value, ensuring it always returns a number
  const safeParseTemperature = (value: any): number => {
    if (value === undefined || value === null) return 0.7;

    try {
      // If it's an object with a value property (DecimalValue format)
      if (typeof value === "object" && value !== null && "value" in value) {
        const parsed = parseInt(value.value.toString());
        return isNaN(parsed) ? 0.7 : parsed / 10;
      }

      // If it's a direct value
      const parsed = parseInt(value.toString());
      return isNaN(parsed) ? 0.7 : parsed / 10;
    } catch (e) {
      console.error("Error parsing temperature:", e);
      return 0.7; // Default value
    }
  };

  // Extract temperature value from agent
  const agentTempValue = agent?.temperature
    ? safeParseTemperature(agent.temperature)
    : 0.7;

  // Use fetched temperature or agent value, ensuring it's a valid number
  const temperatureValue =
    !isLoading && fetchedTemperature !== undefined
      ? fetchedTemperature
      : agentTempValue;

  console.log("temperatureValue", temperatureValue);

  const [editForm, setEditForm] = useState({
    temperature: temperatureValue,
  });

  // Update editForm when agent or fetchedTemperature changes
  useEffect(() => {
    if (!isEditingTemperature) {
      setEditForm({
        temperature: temperatureValue,
      });
    }
  }, [temperatureValue, isEditingTemperature]);

  const handleTemperatureEdit = async () => {
    if (!isOwner) return;

    if (isEditingTemperature) {
      // Save changes
      if (editForm.temperature === temperatureValue) {
        setIsEditingTemperature(false);
        return;
      }

      setIsSaving(true);
      try {
        await updateAgentTemperature({
          cap: caps.get(agent?.id!)!.id,
          temperature: editForm.temperature * 10,
        });

        toast.success("Agent temperature updated successfully!", {
          autoClose: 2000,
        });
      } catch (error) {
        console.error("Failed to update temperature:", error);
        toast.error("Failed to update temperature");
      } finally {
        refetchAgent();
        refetchTemperature();
        setIsSaving(false);
      }
    } else {
      // Start editing
      setEditForm({
        temperature: temperatureValue,
      });
    }
    setIsEditingTemperature(!isEditingTemperature);
  };

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Temperature
          </h2>
          {isOwner ? (
            <SessionKeyGuard onClick={handleTemperatureEdit}>
              <button className="flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                <PencilIcon className="mr-2 h-4 w-4" />
                {isSaving ? (
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
                ) : isEditingTemperature ? (
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
          {isEditingTemperature ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={editForm.temperature}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      temperature: parseFloat(e.target.value),
                    }))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
                />
                <span className="min-w-[3rem] text-center text-lg font-medium text-gray-700 dark:text-gray-300">
                  {editForm.temperature.toFixed(1)}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Lower values make responses more focused and deterministic.
                Higher values make responses more random and creative.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center space-x-4">
                <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${(temperatureValue / 2) * 100}%`,
                      background: "linear-gradient(to right, #d8b4fe, #9333ea)",
                    }}
                  ></div>
                </div>
                <span className="min-w-[3rem] text-center text-lg font-medium text-gray-700 dark:text-gray-300">
                  {temperatureValue.toFixed(1)}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Controls randomness: Lower values are more focused and
                deterministic, higher values allow more creativity.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
