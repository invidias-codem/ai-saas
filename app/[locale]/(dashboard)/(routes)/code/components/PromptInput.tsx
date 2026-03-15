'use client';

// PromptInput — natural language app description input for the code builder.

import { useState, useRef, KeyboardEvent } from 'react';
import { SendHorizontal, Sparkles, Loader2 } from 'lucide-react';
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
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-orange-500/10 border border-white/5 mb-3">
                            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                            <span className="text-xs font-medium text-zinc-300">Powered by Gemini + Claude</span>
                        </div>
                        <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">Describe your app</h2>
                        <p className="text-sm text-zinc-500 mt-1">Gemini plans the architecture, Claude writes the code</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {EXAMPLE_PROMPTS.map((prompt, i) => (
                            <button
                                key={i}
                                onClick={() => { setValue(prompt); textareaRef.current?.focus(); }}
                                className="text-left text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800/50 hover:border-zinc-700/50 rounded-lg px-3 py-2.5 transition-all duration-200"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input bar */}
            <div className="max-w-2xl mx-auto">
                <div className="relative flex items-end gap-2 bg-zinc-900/60 hover:bg-zinc-900/80 focus-within:bg-zinc-900 focus-within:ring-2 focus-within:ring-purple-500/20 border border-zinc-800/60 rounded-2xl p-2 transition-all duration-200">
                    <Textarea
                        ref={textareaRef}
                        rows={1}
                        placeholder={isWorking ? 'Building...' : 'Describe the app you want to build...'}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        className="flex-1 min-h-[44px] max-h-32 py-3 bg-transparent border-0 focus-visible:ring-0 resize-none text-sm leading-relaxed placeholder:text-zinc-600 text-zinc-200"
                    />
                    <Button
                        onClick={handleSubmit}
                        disabled={disabled || !value.trim()}
                        size="icon"
                        className={`h-10 w-10 rounded-xl shrink-0 transition-all duration-200 ${value.trim() && !disabled
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-purple-500/20'
                                : 'bg-zinc-800 text-zinc-600'
                            }`}
                    >
                        {isWorking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <SendHorizontal className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
