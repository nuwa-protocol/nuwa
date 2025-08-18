import { useState, useEffect } from "react";
import {
  PencilIcon,
  LockClosedIcon,
  PlusIcon,
  InboxIcon,
  ClipboardIcon,
} from "@heroicons/react/24/outline";
import { SessionKeyGuard } from "@roochnetwork/rooch-sdk-kit";
import { useAgentProfile } from "./AgentProfileContext";
import { TaskSpecification } from "../../types/task-types";
import { createEmptyTaskSpec } from "../../utils/task";
import { toast } from "react-toastify";

export function AgentTasksPanel() {
  const {
    agent,
    agentTask,
    isOwner,
    caps,
    updateAgentTaskTask,
    refetchAgentTask,
  } = useAgentProfile();

  const [taskSpecs, setTaskSpecs] = useState<TaskSpecification[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [jsonInput, setJsonInput] = useState<string>("");

  useEffect(() => {
    if (agentTask) {
      setTaskSpecs(agentTask);
      setJsonInput(JSON.stringify(agentTask, null, 2));
    }
  }, [agentTask]);

  useEffect(() => {
    if (JSON.stringify(taskSpecs) === JSON.stringify(agentTask || [])) {
      setIsAddingTask(false);
    } else {
      setIsAddingTask(true);
    }
  }, [taskSpecs]);

  const validateTaskSpecs = (parsed: any): boolean => {
    const tasks = Array.isArray(parsed) ? parsed : [parsed];

    const isValidTask = (task: any) => {
      return (
        typeof task === "object" &&
        task !== null &&
        typeof task.name === "string" &&
        typeof task.description === "string" &&
        typeof task.resolver === "string" &&
        typeof task.price === "number" &&
        typeof task.on_chain === "boolean" &&
        Array.isArray(task.arguments)
      );
    };

    if (!tasks.every(isValidTask)) {
      toast.error("Invalid task format in JSON", {
        autoClose: 2000,
      });
      return false;
    }

    setTaskSpecs(tasks);
    return true;
  };

  const handleJsonModeToggle = () => {
    if (isJsonMode) {
      try {
        const parsed = JSON.parse(jsonInput);
        if (validateTaskSpecs(parsed)) {
          setIsJsonMode(false);
        }
      } catch (error) {
        toast.error("Invalid JSON format", {
          autoClose: 2000,
        });
      }
    } else {
      setIsJsonMode(true);
    }
  };

  const handleSubmitTask = async () => {
    try {
      if (isJsonMode) {
        const parsed = JSON.parse(jsonInput);
        if (!validateTaskSpecs(parsed)) {
          return;
        }
      }

      await updateAgentTaskTask({
        cap: caps.get(agent?.id!)!.id,
        taskSpecs: taskSpecs,
      });

      toast.success("Tasks updated successfully!", {
        autoClose: 2000,
      });
      setEditingTaskIndex(null);
      setIsJsonMode(false);
    } finally {
      refetchAgentTask();
    }
  };

  const handleEditTask = (index: number) => {
    setEditingTaskIndex(index);
  };

  const handleCancelEdit = () => {
    setEditingTaskIndex(null);
    setTaskSpecs(agentTask || []);
  };

  const handleSaveTask = async () => {
    await handleSubmitTask();
  };

  const handleDeleteTask = async (index: number) => {
    try {
      const newTasks = [...taskSpecs];
      newTasks.splice(index, 1);
      await updateAgentTaskTask({
        cap: caps.get(agent?.id!)!.id,
        taskSpecs: newTasks,
      });
      setTaskSpecs(newTasks);
      setEditingTaskIndex(null);
      toast.success("Task deleted successfully!", {
        autoClose: 2000,
      });
    } finally {
      refetchAgentTask();
    }
  };

  const handleCopyJson = async (task: TaskSpecification) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(task, null, 2));
      toast.success("Task JSON copied to clipboard!", {
        autoClose: 2000,
      });
    } catch (err) {
      toast.error("Failed to copy JSON", {
        autoClose: 2000,
      });
    }
  };

  return (
    <div className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Tasks
          </h2>
          {isOwner ? (
            <SessionKeyGuard
              onClick={() => {
                if (!isAddingTask) {
                  setIsAddingTask(true);
                  const newTask = createEmptyTaskSpec();
                  setTaskSpecs([...taskSpecs, newTask]);
                  setEditingTaskIndex(taskSpecs.length);
                  setIsJsonMode(false);
                } else {
                  handleJsonModeToggle();
                }
              }}
            >
              <button className="flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                {!isAddingTask ? (
                  <>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Add Task
                  </>
                ) : isJsonMode ? (
                  "Edit Mode"
                ) : (
                  "JSON Mode"
                )}
              </button>
            </SessionKeyGuard>
          ) : (
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleCopyJson(taskSpecs[0])}
                className="flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                <ClipboardIcon className="mr-2 h-4 w-4" />
                Copy JSON
              </button>
              <div className="flex items-center text-gray-500 dark:text-gray-400">
                <LockClosedIcon className="mr-2 h-4 w-4" />
                <span className="text-sm">Only the owner can edit</span>
              </div>
            </div>
          )}
        </div>

        {taskSpecs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <InboxIcon className="h-16 w-16 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
              No tasks yet
            </h3>
            <p className="mx-auto max-w-sm text-sm text-gray-500 dark:text-gray-400">
              This agent has not set any tasks yet.
              {isOwner
                ? 'Click the "Add Task" button to create the first task.'
                : ""}
            </p>
          </div>
        ) : isOwner ? (
          <>
            {isJsonMode ? (
              <div className="space-y-4">
                <textarea
                  className="h-96 w-full rounded-lg border border-gray-300 bg-white p-4 font-mono text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:border-purple-400"
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                />
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setJsonInput(JSON.stringify(agentTask || [], null, 2));
                      setIsJsonMode(false);
                    }}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <SessionKeyGuard onClick={handleSubmitTask}>
                    <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">
                      Save
                    </button>
                  </SessionKeyGuard>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {taskSpecs.map((task, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    {editingTaskIndex === index ? (
                      <div className="space-y-4">
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                              Task #{index + 1}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCancelEdit}
                              className="rounded-lg bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeleteTask(index)}
                              className="rounded-lg bg-red-50 px-3 py-1 text-sm text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                              Delete
                            </button>
                            <SessionKeyGuard onClick={handleSaveTask}>
                              <button className="rounded-lg bg-purple-600 px-3 py-1 text-sm text-white hover:bg-purple-700">
                                Save
                              </button>
                            </SessionKeyGuard>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Name
                            </label>
                            <input
                              type="text"
                              value={task.name}
                              onChange={(e) => {
                                const newTasks = [...taskSpecs];
                                newTasks[index] = {
                                  ...newTasks[index],
                                  name: e.target.value,
                                };
                                setTaskSpecs(newTasks);
                              }}
                              className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:border-purple-400"
                              placeholder="Input task name"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Description
                            </label>
                            <textarea
                              value={task.description}
                              onChange={(e) => {
                                const newTasks = [...taskSpecs];
                                newTasks[index] = {
                                  ...newTasks[index],
                                  description: e.target.value,
                                };
                                setTaskSpecs(newTasks);
                              }}
                              className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:border-purple-400"
                              placeholder="Input task description"
                              rows={3}
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Resolver
                            </label>
                            <input
                              type="text"
                              value={task.resolver}
                              onChange={(e) => {
                                const newTasks = [...taskSpecs];
                                newTasks[index] = {
                                  ...newTasks[index],
                                  resolver: e.target.value,
                                };
                                setTaskSpecs(newTasks);
                              }}
                              className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:border-purple-400"
                              placeholder="Input resolver"
                            />
                          </div>

                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Arguments
                              </label>
                            </div>
                            <button
                              onClick={() => {
                                const newTasks = [...taskSpecs];
                                newTasks[index] = {
                                  ...newTasks[index],
                                  arguments: [
                                    ...(newTasks[index].arguments || []),
                                    {
                                      name: "",
                                      type: "String",
                                      type_desc: "",
                                      description: "",
                                      required: false,
                                    },
                                  ],
                                };
                                setTaskSpecs(newTasks);
                              }}
                              className="mb-3 flex w-full items-center justify-center rounded-lg bg-purple-50 py-2 text-sm text-purple-600 hover:text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:text-purple-300"
                            >
                              <PlusIcon className="mr-1 h-4 w-4" />
                              Add Argument
                            </button>
                            <div className="space-y-3">
                              {(task.arguments || []).map((arg, argIndex) => (
                                <div
                                  key={argIndex}
                                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                                >
                                  <div className="mb-2 flex items-start justify-between">
                                    <div className="flex-1 space-y-2">
                                      <input
                                        type="text"
                                        value={arg.name}
                                        onChange={(e) => {
                                          const newTasks = [...taskSpecs];
                                          newTasks[index].arguments[argIndex] =
                                            { ...arg, name: e.target.value };
                                          setTaskSpecs(newTasks);
                                        }}
                                        className="block w-full rounded-lg border border-gray-300 bg-transparent p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:focus:border-purple-400"
                                        placeholder="Argument Name"
                                      />
                                      <input
                                        type="text"
                                        value={arg.type_desc}
                                        onChange={(e) => {
                                          const newTasks = [...taskSpecs];
                                          newTasks[index].arguments[argIndex] =
                                            {
                                              ...arg,
                                              type_desc: e.target.value,
                                            };
                                          setTaskSpecs(newTasks);
                                        }}
                                        className="block w-full rounded-lg border border-gray-300 bg-transparent p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:focus:border-purple-400"
                                        placeholder="Type Description"
                                      />
                                      <textarea
                                        value={arg.description}
                                        onChange={(e) => {
                                          const newTasks = [...taskSpecs];
                                          newTasks[index].arguments[argIndex] =
                                            {
                                              ...arg,
                                              description: e.target.value,
                                            };
                                          setTaskSpecs(newTasks);
                                        }}
                                        className="block w-full rounded-lg border border-gray-300 bg-transparent p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:focus:border-purple-400"
                                        placeholder="Argument Description"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="ml-2 flex items-center space-x-2">
                                      <label className="flex items-center">
                                        <input
                                          type="checkbox"
                                          checked={arg.required}
                                          onChange={(e) => {
                                            const newTasks = [...taskSpecs];
                                            newTasks[index].arguments[
                                              argIndex
                                            ] = {
                                              ...arg,
                                              required: e.target.checked,
                                            };
                                            setTaskSpecs(newTasks);
                                          }}
                                          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:text-purple-400 dark:focus:ring-purple-400"
                                        />
                                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                                          Required
                                        </span>
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Price (RGas)
                              </label>
                              <input
                                type="number"
                                value={task.price}
                                onChange={(e) => {
                                  const newTasks = [...taskSpecs];
                                  newTasks[index] = {
                                    ...newTasks[index],
                                    price: e.target.value,
                                  };
                                  setTaskSpecs(newTasks);
                                }}
                                className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:border-purple-400"
                                placeholder="Input price"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Type
                              </label>
                              <select
                                value={task.on_chain ? "on-chain" : "off-chain"}
                                onChange={(e) => {
                                  const newTasks = [...taskSpecs];
                                  newTasks[index] = {
                                    ...newTasks[index],
                                    on_chain: e.target.value === "on-chain",
                                  };
                                  setTaskSpecs(newTasks);
                                }}
                                className="block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:border-purple-400"
                              >
                                <option value="on-chain">On-Chain</option>
                                <option value="off-chain">Off-Chain</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                              Task #{index + 1}
                            </span>
                            <button
                              onClick={() => handleEditTask(index)}
                              className="flex items-center text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                            >
                              <PencilIcon className="mr-1 h-4 w-4" />
                              Edit
                            </button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                                Name
                              </label>
                              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                {task.name || "No name specified"}
                              </h4>
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                                Description
                              </label>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {task.description || "No description"}
                              </p>
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                                Resolver
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="rounded-lg bg-purple-50 px-3 py-1 text-sm text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                                  {task.resolver || "No resolver specified"}
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">
                                Arguments
                              </label>
                              {task.arguments && task.arguments.length > 0 ? (
                                <div className="space-y-2">
                                  {task.arguments.map((arg, argIndex) => (
                                    <div
                                      key={argIndex}
                                      className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                          {arg.name}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          ({arg.type_desc})
                                        </span>
                                        {arg.required && (
                                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500 dark:bg-red-900/20 dark:text-red-400">
                                            Required
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                        {arg.description || "No description"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                  No arguments defined
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  Price:
                                </span>
                                <span className="rounded-lg bg-blue-50 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                                  {task.price || 0} RGas
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  Type:
                                </span>
                                <span className="rounded-lg bg-gray-50 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                                  {task.on_chain ? "On-Chain" : "Off-Chain"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {taskSpecs.map((task, index) => (
              <div
                key={index}
                className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-3 flex items-center">
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                        Task #{index + 1}
                      </span>
                    </div>

                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Name
                      </label>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">
                        {task.name || "No name specified"}
                      </h4>
                    </div>

                    <div className="mb-4">
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Description
                      </label>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {task.description || "No description"}
                      </p>
                    </div>

                    <div className="mb-4">
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Resolver
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 rounded-lg bg-purple-50 px-3 py-1 text-sm text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                          {task.resolver || "No resolver specified"}
                        </span>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Arguments
                      </label>
                      {task.arguments && task.arguments.length > 0 ? (
                        <div className="space-y-3">
                          {task.arguments.map((arg, argIndex) => (
                            <div
                              key={argIndex}
                              className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                            >
                              <div className="mb-2 flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {arg.name}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({arg.type_desc})
                                </span>
                                {arg.required && (
                                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500 dark:bg-red-900/20 dark:text-red-400">
                                    Required
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {arg.description || "No description"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                          No arguments defined
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Price:
                        </span>
                        <span className="rounded-lg bg-blue-50 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                          {task.price || 0} RGas
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Type:
                        </span>
                        <span className="rounded-lg bg-gray-50 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                          {task.on_chain ? "On-Chain" : "Off-Chain"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
