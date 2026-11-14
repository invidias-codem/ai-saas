'use client';

// PromptInput — natural language app description input for the code builder.

import { useState, useRef, KeyboardEvent } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface PromptInputProps {
    onSubmit: (prompt: string) => void;
    disabled?: boolean;
    phase?: 'idle' | 'planning' | 'coding' | 'done';
}

const EXAMPLE_PROMPTS = [
    'Build me a todo app with categories and due dates',
    'Create a recipe finder with search and favorites',
    'Make a personal finance tracker with charts',
    'Build a markdown note-taking app with live preview',
];

export function PromptInput({ onSubmit, disabled, phase = 'idle' }: PromptInputProps) {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = () => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const isWorking = phase === 'planning' || phase === 'coding';

    return (
        <div className="px-4 pt-4 pb-2">
            {/* Idle state — show examples */}
            {phase === 'idle' && (
                <div className="max-w-2xl mx-auto mb-4 animate-in fade-in duration-500">
                    <div className="text-center mb-4">
                        <h2 className="text-lg font-semibold tracking-tight">Describe your app</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Gemini plans the architecture, Claude writes the code.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {EXAMPLE_PROMPTS.map((prompt, i) => (
                            <button
                                key={i}
                                onClick={() => { setValue(prompt); textareaRef.current?.focus(); }}
                                className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-accent"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input bar */}
            <div className="max-w-2xl mx-auto">
                <div className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:border-ring">
                    <Textarea
                        ref={textareaRef}
                        rows={1}
                        aria-label="Describe the app you want to build"
                        placeholder={isWorking ? 'Building...' : 'Describe the app you want to build...'}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        className="min-h-11 min-w-0 max-h-32 flex-1 resize-none border-0 bg-transparent py-2.5 text-base leading-relaxed shadow-none"
                    />
                    <Button
                        type="button"
                        variant="action"
                        aria-busy={isWorking}
                        onClick={handleSubmit}
                        disabled={disabled || !value.trim()}
                        className="h-10 shrink-0 gap-1.5 rounded-xl px-3"
                    >
                        {isWorking ? (
                            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                        ) : (
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        )}
                        Build
                    </Button>
                </div>
            </div>
        </div>
    );
}
