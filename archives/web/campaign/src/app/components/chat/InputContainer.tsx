import { ChatInput } from './ChatInput';

interface InputContainerProps {
    input: string;
    onInputChange: (value: string) => void;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isStreaming: boolean;
}

export function InputContainer({
    input,
    onInputChange,
    onSubmit,
    isStreaming
}: InputContainerProps) {
    const handleSubmit = () => {
        onSubmit({} as React.FormEvent<HTMLFormElement>);
    };

    return (
        <div className="p-2 sm:p-4 space-y-2 sm:space-y-4">
            <ChatInput
                value={input}
                onChange={onInputChange}
                onSubmit={handleSubmit}
                isStreaming={isStreaming}
            />
        </div>
    );
} 