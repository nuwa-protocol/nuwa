import { motion } from "framer-motion";
import { FiCheckCircle } from "react-icons/fi";
import { Fragment, useEffect, useRef, useState } from "react";

interface FormData {
    email: string;
    agentname: string;
    product?: string;
    description?: string;
}

interface Question {
    key: string;
    text: string;
    postfix?: string;
    complete: boolean;
    value: string;
    required?: boolean;
}

const TerminalContact: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <section
            style={{
                backgroundImage:
                    "url(https://images.unsplash.com/photo-1482686115713-0fbcaced6e28?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1734&q=80)",
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
            className="px-4 py-12 bg-violet-600"
        >
            <div
                ref={containerRef}
                onClick={() => {
                    inputRef.current?.focus();
                }}
                className="h-96 bg-slate-950/70 backdrop-blur rounded-lg w-full max-w-3xl mx-auto overflow-y-scroll shadow-xl cursor-text font-mono"
            >
                <TerminalHeader />
                <TerminalBody inputRef={inputRef} containerRef={containerRef} />
            </div>
        </section>
    );
};

const TerminalHeader: React.FC = () => {
    return (
        <div className="w-full p-3 bg-slate-900 flex items-center gap-1 sticky top-0">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-slate-200 font-semibold absolute left-[50%] -translate-x-[50%]">
                Nuwa Early Access
            </span>
        </div>
    );
};

interface TerminalBodyProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

const TerminalBody: React.FC<TerminalBodyProps> = ({ containerRef, inputRef }) => {
    const [focused, setFocused] = useState(false);
    const [text, setText] = useState("");

    const [questions, setQuestions] = useState<Question[]>(QUESTIONS);

    const curQuestion = questions.find((q) => !q.complete);

    const handleSubmitLine = (value: string) => {
        if (curQuestion) {
            setQuestions((pv) =>
                pv.map((q) => {
                    if (q.key === curQuestion.key) {
                        return {
                            ...q,
                            complete: true,
                            value,
                        };
                    }
                    return q;
                })
            );
        }
    };

    return (
        <div className="p-2 text-slate-100 text-lg">
            <InitialText />
            <PreviousQuestions questions={questions} />
            <CurrentQuestion curQuestion={curQuestion} />
            {curQuestion ? (
                <CurLine
                    text={text}
                    focused={focused}
                    setText={setText}
                    setFocused={setFocused}
                    inputRef={inputRef}
                    command={curQuestion?.key || ""}
                    handleSubmitLine={handleSubmitLine}
                    containerRef={containerRef}
                />
            ) : (
                <Summary questions={questions} setQuestions={setQuestions} />
            )}
        </div>
    );
};

const InitialText: React.FC = () => {
    return (
        <>
            <p>Hey there! We're excited to onboard you as an early adopter.</p>
            <p className="whitespace-nowrap overflow-hidden font-light">
                ------------------------------------------------------------------------
            </p>
        </>
    );
};

interface PreviousQuestionsProps {
    questions: Question[];
}

const PreviousQuestions: React.FC<PreviousQuestionsProps> = ({ questions }) => {
    return (
        <>
            {questions.map((q, i) => {
                if (q.complete) {
                    return (
                        <Fragment key={i}>
                            <p>
                                {q.text || ""}
                                {q.postfix && (
                                    <span className="text-violet-300">{q.postfix}</span>
                                )}
                            </p>
                            <p className="text-emerald-300">
                                <FiCheckCircle className="inline-block mr-2" />
                                <span>{q.value}</span>
                            </p>
                        </Fragment>
                    );
                }
                return <Fragment key={i}></Fragment>;
            })}
        </>
    );
};

interface CurrentQuestionProps {
    curQuestion: Question | undefined;
}

const CurrentQuestion: React.FC<CurrentQuestionProps> = ({ curQuestion }) => {
    if (!curQuestion) return <></>;

    return (
        <p>
            {curQuestion.text || ""}
            {curQuestion.postfix && (
                <span className="text-violet-300">{curQuestion.postfix}</span>
            )}
        </p>
    );
};

interface SummaryProps {
    questions: Question[];
    setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
}

const Summary: React.FC<SummaryProps> = ({ questions, setQuestions }) => {
    const [complete, setComplete] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReset = () => {
        setQuestions((pv) => pv.map((q) => ({ ...q, value: "", complete: false })));
        setComplete(false);
        setError(null);
    };

    const handleSend = async () => {
        setIsSubmitting(true);
        setError(null);

        const formData: FormData = {
            email: questions.find(q => q.key === "email")?.value || "",
            agentname: questions.find(q => q.key === "agentname")?.value || "",
            product: questions.find(q => q.key === "product")?.value,
            description: questions.find(q => q.key === "description")?.value
        };

        try {
            const response = await fetch('/api/submit-form', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (data.success) {
                setComplete(true);
            } else {
                setError(data.message || "Submit failed, please try again later");
            }
        } catch (err) {
            console.error("Submit form error:", err);
            setError("Submit form error, please try again later");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <p>Beautiful! Here's what we've got:</p>
            {questions.map((q) => {
                return (
                    <p key={q.key}>
                        <span className="text-blue-300">{q.key}:</span> {q.value}
                    </p>
                );
            })}
            <p>Look good?</p>
            {complete ? (
                <p className="text-emerald-300">
                    <FiCheckCircle className="inline-block mr-2" />
                    <span>Sent! We'll get back to you ASAP 😎</span>
                </p>
            ) : (
                <div className="flex flex-col gap-2 mt-2">
                    {error && (
                        <p className="text-red-400">{error}</p>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={handleReset}
                            className="px-3 py-1 text-base hover:opacity-90 transition-opacity rounded bg-slate-100 text-black"
                            disabled={isSubmitting}
                        >
                            Restart
                        </button>
                        <button
                            onClick={handleSend}
                            className="px-3 py-1 text-base hover:opacity-90 transition-opacity rounded bg-indigo-500 text-white"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Sending..." : "Send it!"}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

interface CurLineProps {
    text: string;
    focused: boolean;
    setText: React.Dispatch<React.SetStateAction<string>>;
    setFocused: React.Dispatch<React.SetStateAction<boolean>>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    command: string;
    handleSubmitLine: (value: string) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

const CurLine: React.FC<CurLineProps> = ({
    text,
    focused,
    setText,
    setFocused,
    inputRef,
    command,
    handleSubmitLine,
    containerRef,
}) => {
    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    };

    const validateEmail = (email: string): string | null => {
        if (!email.trim()) {
            return "Email cannot be empty";
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return "Please enter a valid email address";
        }
        return null;
    };

    const validateAgentName = (agentName: string): string | null => {
        if (!agentName.trim()) {
            return "Agent name cannot be empty";
        }
        if (agentName.length < 3) {
            return "Agent name must be at least 3 characters";
        }
        if (agentName.length > 32) {
            return "Agent name cannot exceed 32 characters";
        }
        if (!/^[a-zA-Z0-9_]+$/.test(agentName)) {
            return "Agent name can only contain letters, numbers and underscores";
        }
        if (/^\d+$/.test(agentName)) {
            return "Agent name cannot contain only numbers";
        }
        return null;
    };

    const validateUrl = (url: string): string | null => {
        if (!url.trim()) {
            return "URL cannot be empty";
        }

        let urlToTest = url.trim();
        if (!urlToTest.startsWith('http://') && !urlToTest.startsWith('https://')) {
            urlToTest = 'https://' + urlToTest;
        }

        const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
        if (!urlRegex.test(urlToTest)) {
            return "Please enter a valid URL (e.g., example.com or https://example.com)";
        }

        return null;
    };

    const showWarning = (message: string) => {
        const warningElement = document.createElement('p');
        warningElement.className = 'text-red-400 mt-1';
        warningElement.textContent = `⚠️ ${message}`;

        const terminalBody = containerRef.current?.querySelector('.p-2');
        if (terminalBody) {
            terminalBody.appendChild(warningElement);

            setTimeout(() => {
                warningElement.remove();
            }, 3000);
        }
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (command === "email") {
            const emailError = validateEmail(text);
            if (emailError) {
                showWarning(emailError);
                return;
            }
        } else if (command === "agentname") {
            const agentNameError = validateAgentName(text);
            if (agentNameError) {
                showWarning(agentNameError);
                return;
            }
        } else if (command === "product") {
            const urlError = validateUrl(text);
            if (urlError) {
                showWarning(urlError);
                return;
            }
        }

        handleSubmitLine(text);
        setText("");
        setTimeout(() => {
            scrollToBottom();
        }, 0);
    };

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
        scrollToBottom();
    };

    useEffect(() => {
        return () => setFocused(false);
    }, [setFocused]);

    return (
        <>
            <form onSubmit={onSubmit}>
                <input
                    ref={inputRef}
                    onChange={onChange}
                    value={text}
                    type="text"
                    className="sr-only"
                    autoComplete="off"
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                />
            </form>
            <p>
                <span className="text-emerald-400">➜</span>{" "}
                <span className="text-cyan-300">~</span>{" "}
                {command && <span className="opacity-50">Enter {command}: </span>}
                {text}
                {focused && (
                    <motion.span
                        animate={{ opacity: [1, 1, 0, 0] }}
                        transition={{
                            repeat: Infinity,
                            duration: 1,
                            ease: "linear",
                            times: [0, 0.5, 0.5, 1],
                        }}
                        className="inline-block w-2 h-5 bg-slate-400 translate-y-1 ml-0.5"
                    />
                )}
            </p>
        </>
    );
};

export default TerminalContact;

const QUESTIONS: Question[] = [
    {
        key: "email",
        text: "To start, could you give us ",
        postfix: "your work email?",
        complete: false,
        value: "",
        required: true,
    },
    {
        key: "agentname",
        text: "Great! And let's register an ",
        postfix: "agentname!",
        complete: false,
        value: "",
        required: true,
    },
    {
        key: "product",
        text: "Perfect, what's ",
        postfix: "the URL to your product website?",
        complete: false,
        value: "",
    },
    {
        key: "description",
        text: "Finally, ",
        postfix: "how do you want an agent to help you?",
        complete: false,
        value: "",
    },
];
